/**
 * MeetingFocus - Background Service Worker
 * Detects video meetings, mutes other tabs, restores on meeting end.
 */

// ============================================================
// ExtensionPay: payment/license handling (Stripe-backed, no server)
// ============================================================

importScripts('ExtPay.js');
const extpay = ExtPay('meetingfocus');
extpay.startBackground();

// Sync paid state to storage so popup/options/isPaid() can read it
// without blocking on a network call each time.
async function syncPaidStatus() {
  try {
    const user = await extpay.getUser();
    await chrome.storage.local.set({ isPaid: !!user.paid });
  } catch (e) {
    // Network may be offline or ExtPay unreachable; keep the last known value.
  }
}

extpay.onPaid.addListener(async (user) => {
  await chrome.storage.local.set({ isPaid: !!user.paid });
});

// Refresh on startup and periodically (alarm below triggers re-check)
syncPaidStatus();

// ============================================================
// Meeting URL patterns
// ============================================================

const MEETING_PATTERNS = [
  // Google Meet: meet.google.com/xxx-xxxx-xxx (skip landing/home)
  /^https:\/\/meet\.google\.com\/[a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4}/i,
  /^https:\/\/meet\.google\.com\/lookup\/.+/i,
  // Zoom web client variants
  /^https:\/\/[\w-]+\.zoom\.us\/[wj]\/.+/i,
  /^https:\/\/[\w-]+\.zoom\.us\/wc\/.+/i,
  /^https:\/\/app\.zoom\.us\/wc\/.+/i,
  // Microsoft Teams: covers /meeting, /meet-now, /meetup-join, /_#/l/meetup-join,
  // /_#/meet-now, /v2/ variants, and generic "call" paths. Matches the token
  // anywhere in the path or fragment because Teams puts it in several places.
  /^https:\/\/teams\.microsoft\.com\/.*(meeting|meetup|meet-now|\/call|\/calling)/i,
  /^https:\/\/teams\.live\.com\/.*(meeting|meetup|meet-now|\/call|\/calling)/i
];

// ============================================================
// State
// ============================================================

let state = {
  activeMeetingTabId: null,
  mutedTabIds: [],
  previousMuteState: {},   // tabId -> boolean (was it muted before we touched it?)
  sessionSnapshot: [],     // full tab list before activation (now free tier)
  meetingStartTime: null,
  meetingPlatform: null,
  userDismissed: false,    // true if user manually ended focus for the current meeting
  dismissedTabId: null,    // the specific tab userDismissed applies to; auto-resets when that tab closes or navigates
  dismissedAt: null,       // timestamp of the dismissal; expires after DISMISSAL_TTL_MS so a fresh meeting in the same tab can auto-activate
  silentKeepalives: 0,     // consecutive keepalive ticks with no meeting signal; used for end-of-meeting detection
  activeProfileId: null,   // which meeting profile is active (null = default)
  notificationsSuppressed: false  // whether content scripts are currently suppressing notifications
};

// ============================================================
// Default profiles (built-in, not editable)
// ============================================================

const DEFAULT_PROFILES = [
  {
    id: 'default',
    name: 'Default',
    description: 'Mute all tabs except your allowlist',
    builtIn: true,
    muteAll: true,
    suppressNotifications: true,
    // Default profile uses the global allowlist
    profileAllowlist: []
  },
  {
    id: 'standup',
    name: 'Standup',
    description: 'Keep Slack and project tools audible',
    builtIn: true,
    muteAll: true,
    suppressNotifications: false,  // Notifications stay on for quick standups
    profileAllowlist: ['slack.com', 'linear.app', 'jira.atlassian.com', 'notion.so', 'asana.com']
  },
  {
    id: 'presentation',
    name: 'Presentation',
    description: 'Total silence: mute everything, block all notifications',
    builtIn: true,
    muteAll: true,
    suppressNotifications: true,
    profileAllowlist: []  // Override: nothing stays unmuted
  }
];

async function getProfiles() {
  const result = await chrome.storage.local.get({ customProfiles: [] });
  return [...DEFAULT_PROFILES, ...result.customProfiles];
}

async function getActiveProfile() {
  const result = await chrome.storage.local.get({ selectedProfileId: 'default' });
  const profiles = await getProfiles();
  return profiles.find(p => p.id === result.selectedProfileId) || profiles[0];
}

const DISMISSAL_TTL_MS = 2 * 60 * 1000; // 2 minutes

// Returns true only if the current dismissal is still "fresh" (within TTL).
// Older dismissals are treated as expired so a new meeting started later in
// the same tab can auto-activate.
function isDismissalActive() {
  if (!state.userDismissed) return false;
  if (!state.dismissedAt) return true; // legacy state from pre-TTL persistence
  return (Date.now() - state.dismissedAt) < DISMISSAL_TTL_MS;
}

// ============================================================
// Helpers
// ============================================================

function isMeetingUrl(url) {
  if (!url) return false;
  return MEETING_PATTERNS.some(pattern => pattern.test(url));
}

// Looser check used ONLY for deactivation decisions: once we've activated,
// we keep focus engaged as long as the tab is still on a meeting platform
// hostname. Teams in particular is a SPA whose URL can briefly route to
// paths that don't match the strict activation regex (sidebars, worker
// frames, v2 routes) while the meeting is still in progress. Requiring the
// stricter isMeetingUrl for deactivation caused premature shutdowns mid-call.
const MEETING_HOSTS = [
  'meet.google.com',
  'teams.microsoft.com',
  'teams.live.com'
];
function isMeetingHost(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (MEETING_HOSTS.includes(host)) return true;
    // Zoom has many subdomains under *.zoom.us and app.zoom.us
    if (host === 'zoom.us' || host.endsWith('.zoom.us')) return true;
    return false;
  } catch {
    return false;
  }
}

function detectPlatform(url) {
  if (!url) return 'unknown';
  if (url.includes('meet.google.com')) return 'Google Meet';
  if (url.includes('zoom.us')) return 'Zoom';
  if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'Microsoft Teams';
  return 'unknown';
}

async function getAllowlist() {
  const result = await chrome.storage.local.get({ allowlist: [] });
  return result.allowlist;
}

async function isPaid() {
  // ExtensionPay integration: check if user has paid
  // When ExtPay is integrated, this will call extpay.getUser()
  // For now, check storage for a paid flag (set by popup when ExtPay confirms)
  const result = await chrome.storage.local.get({ isPaid: false });
  return result.isPaid;
}

function isOnAllowlist(url, allowlist) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return allowlist.some(domain => {
      // Match exact domain or subdomain
      const clean = domain.replace(/^\./, '').toLowerCase();
      return hostname === clean || hostname.endsWith('.' + clean);
    });
  } catch {
    return false;
  }
}

// ============================================================
// Core: Activate meeting focus
// ============================================================

async function activate(meetingTabId, meetingUrl) {
  if (state.activeMeetingTabId !== null) return; // Already active

  const globalAllowlist = await getAllowlist();
  const paid = await isPaid();
  const profile = paid ? await getActiveProfile() : DEFAULT_PROFILES[0];

  state.activeMeetingTabId = meetingTabId;
  state.meetingStartTime = Date.now();
  state.meetingPlatform = detectPlatform(meetingUrl);
  state.userDismissed = false;
  state.dismissedTabId = null;
  state.dismissedAt = null;
  state.mutedTabIds = [];
  state.previousMuteState = {};
  state.silentKeepalives = 0;
  state.activeProfileId = profile.id;
  state.notificationsSuppressed = false;

  // Clear any stale pendingRestore from a prior meeting the user never
  // interacted with. Restore prompts should only ever reflect the meeting
  // that just ended, never older ones.
  await chrome.storage.local.set({ pendingRestore: [] });

  // Query all tabs
  const tabs = await chrome.tabs.query({});

  // Save session snapshot before muting (now available to all users).
  // Skip the meeting tab and any other meeting-platform tabs. Teams/Meet/Zoom
  // SPA-navigate during the call, so the URL we'd record here won't match
  // their live URL at deactivation time, and we'd incorrectly flag them as
  // "missing" and spawn a duplicate tab on restore.
  state.sessionSnapshot = tabs
    .filter(t => t.id !== meetingTabId && !isMeetingHost(t.url))
    .map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      pinned: t.pinned,
      index: t.index,
      windowId: t.windowId
    }));
  await chrome.storage.local.set({ sessionSnapshot: state.sessionSnapshot });

  // Build the effective allowlist: global allowlist + profile-specific domains.
  // Pro profiles can add extra domains (e.g. Standup keeps Slack unmuted).
  // The Presentation profile intentionally has an empty profileAllowlist and
  // its users may want even global allowlist domains muted, but we still
  // honor the global allowlist to avoid confusing behavior.
  const effectiveAllowlist = [...globalAllowlist];
  if (paid && profile.profileAllowlist) {
    for (const domain of profile.profileAllowlist) {
      if (!effectiveAllowlist.includes(domain)) effectiveAllowlist.push(domain);
    }
  }

  // Mute all non-meeting, non-allowlisted tabs
  for (const tab of tabs) {
    if (tab.id === meetingTabId) continue;
    if (isOnAllowlist(tab.url, effectiveAllowlist)) continue;

    // Save previous mute state
    state.previousMuteState[tab.id] = tab.mutedInfo ? tab.mutedInfo.muted : false;

    // Mute the tab
    try {
      await chrome.tabs.update(tab.id, { muted: true });
      state.mutedTabIds.push(tab.id);
    } catch (e) {
      // Tab may have been closed between query and update
      console.warn('MeetingFocus: could not mute tab', tab.id, e.message);
    }
  }

  // Pro: send notification suppression to all non-meeting tabs
  if (paid && profile.suppressNotifications) {
    state.notificationsSuppressed = true;
    for (const tab of tabs) {
      if (tab.id === meetingTabId) continue;
      try {
        chrome.tabs.sendMessage(tab.id, { action: 'suppress-notifications' }).catch(() => {});
      } catch (e) {
        // Content script may not be injected in this tab (chrome:// URLs, etc.)
      }
    }
  }

  // Update icon and badge
  await updateIcon(true);
  await chrome.action.setBadgeText({ text: String(state.mutedTabIds.length) });
  await chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });

  // Persist state for service worker recovery
  await persistState();

  // Start keepalive alarm (prevents service worker from sleeping during meeting)
  await chrome.alarms.create('meetingfocus-keepalive', { periodInMinutes: 0.4 });

  console.log(`MeetingFocus: activated for ${state.meetingPlatform}, muted ${state.mutedTabIds.length} tabs`);
}

// ============================================================
// Core: Deactivate meeting focus
// ============================================================

async function deactivate() {
  if (state.activeMeetingTabId === null) return; // Already inactive

  // Unmute tabs we muted (restore previous state)
  for (const tabId of state.mutedTabIds) {
    const wasMutedBefore = state.previousMuteState[tabId] || false;
    if (!wasMutedBefore) {
      try {
        await chrome.tabs.update(tabId, { muted: false });
      } catch (e) {
        // Tab may have been closed during the meeting
      }
    }
  }

  // Restore notifications if they were suppressed (Pro)
  if (state.notificationsSuppressed) {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          chrome.tabs.sendMessage(tab.id, { action: 'restore-notifications' }).catch(() => {});
        } catch (e) {}
      }
    } catch (e) {}
    state.notificationsSuppressed = false;
  }

  // Log the meeting (now free for all users)
  if (state.meetingStartTime) {
    const meetingLogEntry = {
      date: new Date(state.meetingStartTime).toISOString(),
      duration: Math.round((Date.now() - state.meetingStartTime) / 1000),
      platform: state.meetingPlatform,
      tabsMuted: state.mutedTabIds.length
    };
    const result = await chrome.storage.local.get({ meetingHistory: [] });
    result.meetingHistory.push(meetingLogEntry);
    // Keep last 100 meetings
    if (result.meetingHistory.length > 100) {
      result.meetingHistory = result.meetingHistory.slice(-100);
    }
    await chrome.storage.local.set({ meetingHistory: result.meetingHistory });
  }

  // Compute missing-tab list fresh and overwrite pendingRestore
  // unconditionally (even with []). This guarantees a stale entry from
  // a prior meeting can never linger into today's restore prompt.
  // Session restore is now free for all users.
  {
    let missingTabs = [];
    if (state.sessionSnapshot.length > 0) {
      const currentTabs = await chrome.tabs.query({});
      const currentUrls = new Set(currentTabs.map(t => t.url));
      missingTabs = state.sessionSnapshot.filter(t =>
        !currentUrls.has(t.url) && !isMeetingHost(t.url)
      );
    }
    await chrome.storage.local.set({ pendingRestore: missingTabs });
  }

  // Clear keepalive alarm
  await chrome.alarms.clear('meetingfocus-keepalive');

  // Reset state
  const tabCount = state.mutedTabIds.length;
  state.activeMeetingTabId = null;
  state.mutedTabIds = [];
  state.previousMuteState = {};
  state.sessionSnapshot = [];
  state.meetingStartTime = null;
  state.meetingPlatform = null;
  state.silentKeepalives = 0;
  state.activeProfileId = null;

  // Update icon and badge
  await updateIcon(false);
  await chrome.action.setBadgeText({ text: '' });

  // Persist cleared state
  await persistState();

  console.log(`MeetingFocus: deactivated, unmuted ${tabCount} tabs`);
}

// ============================================================
// Mute state reconciliation
// ============================================================
//
// Chrome's real tab mute state can drift from state.mutedTabIds:
//  - A premature deactivate can unmute tabs while leaving mfState behind
//    after an extension reload
//  - Tabs can be discarded/restored
//  - The user can add a domain to allowlist mid-meeting
//  - Duplicate pushes to mutedTabIds build up over restarts
//
// This function treats Chrome as the source of truth for what tabs exist and
// their real muted state, then forces everything into alignment: re-mutes
// anything that should be muted but isn't, drops allowlisted/closed tabs
// from tracking, and dedupes the tracked IDs.
async function reconcileMuteState() {
  if (state.activeMeetingTabId === null) return;

  try {
    const allowlist = await getAllowlist();
    const tabs = await chrome.tabs.query({});

    // Dedupe tracked IDs up front.
    state.mutedTabIds = [...new Set(state.mutedTabIds)];

    let remuted = 0;
    const shouldTrack = new Set();

    for (const tab of tabs) {
      if (tab.id === state.activeMeetingTabId) continue;
      if (isOnAllowlist(tab.url, allowlist)) continue;
      if (isMeetingHost(tab.url)) continue;
      if (!tab.url) continue;

      const currentlyMuted = tab.mutedInfo && tab.mutedInfo.muted;
      if (!currentlyMuted) {
        try {
          await chrome.tabs.update(tab.id, { muted: true });
          if (!(tab.id in state.previousMuteState)) {
            state.previousMuteState[tab.id] = false;
          }
          remuted++;
        } catch (e) {
          continue;
        }
      }
      shouldTrack.add(tab.id);
    }

    // Keep only tabs that still exist and still should be tracked.
    state.mutedTabIds = state.mutedTabIds.filter(id => shouldTrack.has(id));
    // Add any newly-muted tabs not previously tracked.
    for (const id of shouldTrack) {
      if (!state.mutedTabIds.includes(id)) state.mutedTabIds.push(id);
    }

    // Clean up previousMuteState for tabs no longer tracked.
    for (const idStr of Object.keys(state.previousMuteState)) {
      const id = Number(idStr);
      if (!shouldTrack.has(id)) delete state.previousMuteState[id];
    }

    await chrome.action.setBadgeText({ text: String(state.mutedTabIds.length) });
    await persistState();

    if (remuted > 0) {
      console.log(`MeetingFocus: reconciled state, re-muted ${remuted} drifted tab(s)`);
    }
  } catch (e) {
    console.warn('MeetingFocus: reconcile failed', e.message);
  }
}

// ============================================================
// Icon management
// ============================================================

async function updateIcon(active) {
  const suffix = active ? '-active' : '';
  await chrome.action.setIcon({
    path: {
      '16': `icons/icon-16${suffix}.png`,
      '48': `icons/icon-48${suffix}.png`,
      '128': `icons/icon-128${suffix}.png`
    }
  });
}

// ============================================================
// State persistence (service worker recovery)
// ============================================================

async function persistState() {
  await chrome.storage.local.set({
    mfState: {
      activeMeetingTabId: state.activeMeetingTabId,
      mutedTabIds: state.mutedTabIds,
      previousMuteState: state.previousMuteState,
      meetingStartTime: state.meetingStartTime,
      meetingPlatform: state.meetingPlatform,
      userDismissed: state.userDismissed,
      dismissedTabId: state.dismissedTabId,
      dismissedAt: state.dismissedAt,
      activeProfileId: state.activeProfileId,
      notificationsSuppressed: state.notificationsSuppressed
    }
  });
}

async function restoreState() {
  const result = await chrome.storage.local.get({ mfState: null, sessionSnapshot: [] });
  if (result.mfState && result.mfState.activeMeetingTabId !== null) {
    // Verify the meeting tab still exists
    try {
      const tab = await chrome.tabs.get(result.mfState.activeMeetingTabId);
      if (tab && isMeetingHost(tab.url)) {
        state.activeMeetingTabId = result.mfState.activeMeetingTabId;
        state.mutedTabIds = result.mfState.mutedTabIds || [];
        state.previousMuteState = result.mfState.previousMuteState || {};
        state.meetingStartTime = result.mfState.meetingStartTime;
        state.meetingPlatform = result.mfState.meetingPlatform;
        state.userDismissed = result.mfState.userDismissed || false;
        state.dismissedTabId = result.mfState.dismissedTabId || null;
        state.dismissedAt = result.mfState.dismissedAt || null;
        state.activeProfileId = result.mfState.activeProfileId || null;
        state.notificationsSuppressed = result.mfState.notificationsSuppressed || false;
        // Session snapshot lives in its own storage key (can be large; kept
        // out of mfState). Restore so the restore-closed-tabs feature
        // survives service worker sleep mid-meeting.
        state.sessionSnapshot = result.sessionSnapshot || [];

        await updateIcon(true);
        await chrome.action.setBadgeText({ text: String(state.mutedTabIds.length) });
        await chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
        await chrome.alarms.create('meetingfocus-keepalive', { periodInMinutes: 0.4 });

        console.log('MeetingFocus: restored active session after service worker restart');
        // Storage-derived state can be stale (e.g. a prior buggy deactivate
        // unmuted tabs before crashing). Force-align with reality.
        await reconcileMuteState();
        return;
      }
    } catch (e) {
      // Meeting tab no longer exists
    }

    // Meeting tab is gone; deactivate cleanly
    state.activeMeetingTabId = result.mfState.activeMeetingTabId;
    state.mutedTabIds = result.mfState.mutedTabIds || [];
    state.previousMuteState = result.mfState.previousMuteState || {};
    await deactivate();
  }
}

// ============================================================
// Event listeners (registered synchronously at top level)
// ============================================================

// --- Tab updated (URL change or audio state change) ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Case 1: No active meeting, look for a new one
  if (state.activeMeetingTabId === null) {
    // If the dismissed tab navigated away from its meeting URL, the user
    // left that meeting; clear the dismissal so auto-trigger re-arms.
    if (state.userDismissed && state.dismissedTabId === tabId && changeInfo.url && !isMeetingUrl(changeInfo.url)) {
      state.userDismissed = false;
      state.dismissedTabId = null;
      state.dismissedAt = null;
      await persistState();
    }

    if (tab.url && isMeetingUrl(tab.url)) {
      // If this is a DIFFERENT tab than the one the user dismissed, they're
      // joining a new meeting; reset the dismissal.
      if (state.userDismissed && state.dismissedTabId !== tabId) {
        state.userDismissed = false;
        state.dismissedTabId = null;
        state.dismissedAt = null;
      }
      if (isDismissalActive()) return; // Still in the dismissed tab and TTL hasn't expired

      // Dismissal expired or different tab: clear any lingering dismissal
      // state so later logic sees a clean slate.
      if (state.userDismissed) {
        state.userDismissed = false;
        state.dismissedTabId = null;
        state.dismissedAt = null;
      }

      // URL-based activation: our patterns only match when the user is
      // actively in a meeting, so we don't need to wait for the tab to
      // be audible (Zoom web client often never reports audible at all).
      await activate(tabId, tab.url);
    }
    return;
  }

  // Case 2: Active meeting tab changed
  if (tabId === state.activeMeetingTabId) {
    // Meeting tab navigated OFF the meeting platform entirely (e.g. user
    // typed google.com in the address bar). In-platform SPA route changes
    // are preserved so we don't false-deactivate mid-call.
    if (changeInfo.url && !isMeetingHost(changeInfo.url)) {
      console.log('MeetingFocus: meeting tab left platform host, deactivating');
      await deactivate();
      return;
    }

    // Audible state changes are tracked passively; the keepalive alarm
    // (below) uses the multi-signal check to decide when to deactivate.
    // setTimeout isn't safe in MV3 service workers because the worker can
    // sleep and drop the pending callback.
    if (changeInfo.audible === true) {
      state.silentKeepalives = 0;
    }
  }
});

// --- Tab removed (meeting tab closed) ---
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === state.activeMeetingTabId) {
    await deactivate();
  }

  // If the dismissed tab was closed, the user is done with that meeting;
  // clear the dismissal so a future meeting can auto-activate.
  if (state.dismissedTabId === tabId) {
    state.userDismissed = false;
    state.dismissedTabId = null;
    state.dismissedAt = null;
    await persistState();
  }

  // Also clean up if a muted tab was closed
  const idx = state.mutedTabIds.indexOf(tabId);
  if (idx !== -1) {
    state.mutedTabIds.splice(idx, 1);
    delete state.previousMuteState[tabId];
  }
});

// --- New tab created during active meeting: auto-mute ---
chrome.tabs.onCreated.addListener(async (tab) => {
  if (state.activeMeetingTabId === null) return;

  // Small delay to let the tab load its URL
  setTimeout(async () => {
    try {
      const freshTab = await chrome.tabs.get(tab.id);
      if (!freshTab || freshTab.id === state.activeMeetingTabId) return;

      const allowlist = await getAllowlist();
      if (isOnAllowlist(freshTab.url, allowlist)) return;
      if (isMeetingUrl(freshTab.url)) return;

      state.previousMuteState[freshTab.id] = false;
      await chrome.tabs.update(freshTab.id, { muted: true });
      state.mutedTabIds.push(freshTab.id);

      // Suppress notifications on the new tab if active (Pro)
      if (state.notificationsSuppressed) {
        try {
          chrome.tabs.sendMessage(freshTab.id, { action: 'suppress-notifications' }).catch(() => {});
        } catch (e) {}
      }

      // Update badge count
      await chrome.action.setBadgeText({ text: String(state.mutedTabIds.length) });
    } catch (e) {
      // Tab may have closed quickly
    }
  }, 1000);
});

// --- Keyboard shortcut ---
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-meeting-focus') {
    if (state.activeMeetingTabId !== null) {
      // Currently active: deactivate
      state.userDismissed = true;
      state.dismissedTabId = state.activeMeetingTabId;
      state.dismissedAt = Date.now();
      await deactivate();
    } else {
      // Not active: find a meeting tab and force-activate (skip audio gate)
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (isMeetingUrl(tab.url)) {
          state.userDismissed = false;
          state.dismissedTabId = null;
          state.dismissedAt = null;
          await activate(tab.id, tab.url);
          return;
        }
      }
      // No meeting tab found: do nothing (could show a notification later)
    }
  }
});

// --- Keepalive alarm (prevents service worker sleep during meeting) ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'meetingfocus-keepalive') {
    // Multi-signal end-of-meeting detection:
    //   - If the tab left the meeting platform (different hostname), deactivate immediately.
    //   - If the tab is on the platform but neither matches our strict meeting path regex
    //     nor is currently audible, we have no signal that the meeting is still going.
    //     Tolerate one silent tick; on two consecutive silent ticks (~48s), deactivate.
    //     This catches Teams/Meet post-call home pages, which stay on the platform
    //     hostname but leave the meeting path and stop playing audio.
    if (state.activeMeetingTabId !== null) {
      let tab;
      try {
        tab = await chrome.tabs.get(state.activeMeetingTabId);
      } catch (e) {
        console.log('MeetingFocus: keepalive could not find meeting tab, deactivating');
        await deactivate();
        return;
      }

      if (!tab || !isMeetingHost(tab.url)) {
        console.log('MeetingFocus: keepalive saw non-platform URL, deactivating', tab && tab.url);
        await deactivate();
        return;
      }

      const onMeetingPath = isMeetingUrl(tab.url);
      const meetingAge = Date.now() - (state.meetingStartTime || Date.now());

      if (onMeetingPath || tab.audible) {
        state.silentKeepalives = 0;
      } else if (meetingAge > 30000) {
        // Don't start counting until the meeting has had 30s to settle
        // (joining screens can be briefly off-path and silent).
        state.silentKeepalives += 1;
        console.log(`MeetingFocus: keepalive signal absent (${state.silentKeepalives}/2)`, tab.url);
        if (state.silentKeepalives >= 2) {
          console.log('MeetingFocus: meeting ended (off-path + silent for 2 ticks), deactivating');
          await deactivate();
          return;
        }
      }

      await persistState();
      await reconcileMuteState();
    }
  }

  if (alarm.name === 'meetingfocus-license-sync') {
    await syncPaidStatus();
    return;
  }

  if (alarm.name === 'meetingfocus-scan') {
    // Fallback scan: catches meeting tabs that opened without firing an
    // onUpdated URL change in a way we can observe.
    if (state.activeMeetingTabId !== null) return;
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (!tab.url || !isMeetingUrl(tab.url)) continue;
        // Auto-clear dismissal if it's a different tab than the one dismissed
        if (state.userDismissed && state.dismissedTabId !== tab.id) {
          state.userDismissed = false;
          state.dismissedTabId = null;
          state.dismissedAt = null;
        }
        if (isDismissalActive()) continue; // Same-tab dismissal still within TTL
        // Dismissal exists but expired; clear before activating.
        if (state.userDismissed) {
          state.userDismissed = false;
          state.dismissedTabId = null;
          state.dismissedAt = null;
        }
        await activate(tab.id, tab.url);
        return;
      }
    } catch (e) {
      console.warn('MeetingFocus: scan failed', e.message);
    }
  }
});

// Start the idle scan alarm (runs every ~30 seconds when no meeting is active;
// Chrome clamps the minimum period to 30s, and the first fire is delayed by
// the period unless we set delayInMinutes explicitly).
chrome.alarms.create('meetingfocus-scan', { delayInMinutes: 0.1, periodInMinutes: 0.5 });

// Periodically resync license status from ExtensionPay (once an hour).
// The onPaid listener handles the moment-of-purchase case; this catches
// refunds, cross-device purchases, and anything we missed while offline.
chrome.alarms.create('meetingfocus-license-sync', { delayInMinutes: 1, periodInMinutes: 60 });

// Also react to tab focus changes: a user switching to a tab is a strong
// signal that something is about to happen there (e.g. they just joined
// a Zoom meeting and clicked the tab).
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  if (state.activeMeetingTabId !== null) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !isMeetingUrl(tab.url)) return;
    // Reset a dismissal if the user is now focused on a different meeting tab
    if (state.userDismissed && state.dismissedTabId !== tabId) {
      state.userDismissed = false;
      state.dismissedTabId = null;
      state.dismissedAt = null;
    }
    if (isDismissalActive()) return; // Same-tab dismissal still fresh
    if (state.userDismissed) {
      state.userDismissed = false;
      state.dismissedTabId = null;
      state.dismissedAt = null;
    }
    await activate(tab.id, tab.url);
  } catch (e) {
    // Tab may have closed between event and query
  }
});

// --- Message handler (for popup and options communication) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getState') {
    sendResponse({
      active: state.activeMeetingTabId !== null,
      meetingPlatform: state.meetingPlatform,
      mutedCount: state.mutedTabIds.length,
      meetingStartTime: state.meetingStartTime,
      activeProfileId: state.activeProfileId,
      notificationsSuppressed: state.notificationsSuppressed
    });
    return true;
  }

  if (message.action === 'getProfiles') {
    (async () => {
      const profiles = await getProfiles();
      const result = await chrome.storage.local.get({ selectedProfileId: 'default' });
      sendResponse({ profiles, selectedProfileId: result.selectedProfileId });
    })();
    return true;
  }

  if (message.action === 'setSelectedProfile') {
    (async () => {
      await chrome.storage.local.set({ selectedProfileId: message.profileId });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'saveCustomProfile') {
    (async () => {
      const result = await chrome.storage.local.get({ customProfiles: [] });
      const existing = result.customProfiles.findIndex(p => p.id === message.profile.id);
      if (existing >= 0) {
        result.customProfiles[existing] = message.profile;
      } else {
        result.customProfiles.push(message.profile);
      }
      await chrome.storage.local.set({ customProfiles: result.customProfiles });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'deleteCustomProfile') {
    (async () => {
      const result = await chrome.storage.local.get({ customProfiles: [], selectedProfileId: 'default' });
      result.customProfiles = result.customProfiles.filter(p => p.id !== message.profileId);
      // If the deleted profile was selected, fall back to default
      if (result.selectedProfileId === message.profileId) {
        result.selectedProfileId = 'default';
      }
      await chrome.storage.local.set({
        customProfiles: result.customProfiles,
        selectedProfileId: result.selectedProfileId
      });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'forceActivate') {
    (async () => {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (isMeetingUrl(tab.url)) {
          state.userDismissed = false;
          state.dismissedTabId = null;
          state.dismissedAt = null;
          await activate(tab.id, tab.url);
          sendResponse({ success: true });
          return;
        }
      }
      sendResponse({ success: false, error: 'No meeting tab found' });
    })();
    return true;
  }

  if (message.action === 'forceDeactivate') {
    (async () => {
      state.userDismissed = true;
      state.dismissedTabId = state.activeMeetingTabId;
      state.dismissedAt = Date.now();
      await deactivate();
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'allowlistChanged') {
    // User edited the allowlist during a meeting. Unmute anything now on
    // the list; re-mute anything removed from the list. reconcileMuteState
    // handles re-muting; for unmuting, we need an explicit pass.
    (async () => {
      if (state.activeMeetingTabId !== null) {
        const allowlist = await getAllowlist();
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.id === state.activeMeetingTabId) continue;
          if (isOnAllowlist(tab.url, allowlist) && tab.mutedInfo && tab.mutedInfo.muted) {
            try { await chrome.tabs.update(tab.id, { muted: false }); } catch (e) {}
          }
        }
        await reconcileMuteState();
      }
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'paidStatusChanged') {
    // ExtensionPay callback: user just paid
    chrome.storage.local.set({ isPaid: message.paid });
    sendResponse({ success: true });
    return true;
  }
});

// --- Startup: restore state if service worker restarted, then scan for
// any in-progress meeting we might have missed (e.g. extension enabled
// after the meeting was already open and audible).
(async () => {
  await restoreState();
  if (state.activeMeetingTabId !== null) return;
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.url || !isMeetingUrl(tab.url)) continue;
      if (state.userDismissed && state.dismissedTabId !== tab.id) {
        state.userDismissed = false;
        state.dismissedTabId = null;
        state.dismissedAt = null;
      }
      if (isDismissalActive()) continue;
      if (state.userDismissed) {
        state.userDismissed = false;
        state.dismissedTabId = null;
        state.dismissedAt = null;
      }
      await activate(tab.id, tab.url);
      return;
    }
  } catch (e) {
    console.warn('MeetingFocus: startup scan failed', e.message);
  }
})();
