# MeetingFocus v0.1 — Scope Spec

**Author:** Loophead Labs LLC
**Date:** April 15, 2026
**Status:** Draft
**Target ship:** 2 weeks from build start

---

## 1. One-liner

MeetingFocus auto-detects when you join a video call in Chrome, mutes every other tab, and restores your environment when the call ends.

---

## 2. How it works (user flow)

1. User installs MeetingFocus. No signup, no account, no onboarding wizard. Extension icon appears in the toolbar (idle state: gray).
2. User opens Google Meet, Zoom (web), or Microsoft Teams (web) in any tab.
3. MeetingFocus detects the meeting tab via URL pattern match.
4. **Activation trigger:** the meeting tab begins producing audio (the `audible` property flips to `true`). This distinguishes "has the tab open" from "is actually in a call." An override button in the popup lets the user force-activate if they are in a silent/muted meeting.
5. On activation:
   - Extension icon turns green (active state).
   - All other tabs are muted via `chrome.tabs.update({muted: true})`.
   - A small badge shows the count of muted tabs (e.g., "12").
   - **(Paid)** A snapshot of all open tabs (URLs, positions, pinned state) is saved to `chrome.storage.local`.
   - **(Paid)** Web notifications on non-meeting tabs are suppressed via content script injection (monkey-patches the `Notification` constructor).
6. User conducts their meeting normally.
7. **Deactivation trigger:** the meeting tab closes, navigates away from a meeting URL, OR the user clicks the "End focus" button in the popup.
8. On deactivation:
   - All previously muted tabs are unmuted.
   - Extension icon returns to gray.
   - **(Paid)** If tabs were closed during the meeting, a "Restore session" prompt appears with one-click reopen.

---

## 3. Feature split: Free vs Paid

### Free (ships in v0.1)

| Feature | Details |
|---|---|
| Meeting detection | URL pattern match for Google Meet, Zoom web, Teams web |
| Audio-gated activation | Waits for `audible: true` before muting; manual override available |
| Auto-mute all other tabs | Uses `chrome.tabs.update` per-tab |
| Auto-unmute on meeting end | Restores previous mute state (tabs that were already muted stay muted) |
| Toolbar badge | Green icon + muted-tab count during active meeting |
| Allowlist (3 domains) | User can exempt up to 3 domains from muting (e.g., Spotify, Slack) |
| Keyboard shortcut | Toggle meeting focus on/off via configurable shortcut |

### Paid: one-time $14.99 via ExtensionPay

| Feature | Details |
|---|---|
| Unlimited allowlist | No cap on exempted domains |
| Tab session snapshot | Saves all open tabs before muting; one-click restore after meeting |
| Notification suppression | Blocks web notifications from non-meeting tabs during the call |
| Meeting profiles | Save named rulesets (e.g., "standup" keeps Jira unmuted, "client call" mutes everything) |
| Meeting log | Simple history: date, duration, platform, tabs muted. Exportable as CSV. |

### Explicitly NOT in v0.1

- Desktop/OS notification suppression (requires OS-level integration, out of scope for a Chrome extension).
- Zoom desktop app or Teams desktop app detection (these run outside the browser; no reliable Chrome API to detect them).
- Calendar integration (Google Calendar, Outlook). Deferred to v0.2 if demand proves out.
- Cross-browser support (Firefox, Edge). MV3 is Chrome-first; port later if traction warrants.
- Any form of user account or cloud sync. Everything is local via `chrome.storage.local`.

---

## 4. Technical architecture

### 4.1 Extension components

```
meetingfocus/
├── manifest.json
├── background.js          # Service worker: meeting detection, tab muting logic
├── popup.html             # Toolbar popup UI
├── popup.js               # Popup logic (status, allowlist, manual toggle, profiles)
├── popup.css
├── content-script.js      # Injected into non-meeting tabs (paid: notification suppression)
├── options.html           # Settings page (allowlist, shortcut config, profiles)
├── options.js
├── options.css
├── icons/
│   ├── icon-16.png
│   ├── icon-16-active.png
│   ├── icon-48.png
│   ├── icon-48-active.png
│   ├── icon-128.png
│   └── icon-128-active.png
├── lib/
│   └── ExtPay.js          # ExtensionPay SDK
└── _locales/
    └── en/
        └── messages.json
```

### 4.2 Manifest (annotated)

```json
{
  "manifest_version": 3,
  "name": "MeetingFocus",
  "version": "0.1.0",
  "description": "Auto-mutes every other tab when you join a video call. Restores everything when you hang up.",
  "permissions": [
    "tabs",
    "storage",
    "notifications"
  ],
  "host_permissions": [
    "https://meet.google.com/*",
    "https://*.zoom.us/*",
    "https://teams.microsoft.com/*",
    "https://teams.live.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content-script.js"],
      "run_at": "document_start",
      "exclude_matches": [
        "https://meet.google.com/*",
        "https://*.zoom.us/*",
        "https://teams.microsoft.com/*",
        "https://teams.live.com/*"
      ]
    }
  ],
  "options_page": "options.html",
  "commands": {
    "toggle-meeting-focus": {
      "suggested_key": {
        "default": "Alt+Shift+M",
        "mac": "Alt+Shift+M"
      },
      "description": "Toggle MeetingFocus on/off"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

**Permission justifications (for Chrome Web Store review):**

| Permission | Why needed | User-facing explanation |
|---|---|---|
| `tabs` | Read tab URLs to detect meeting platforms; read `audible` state; call `tabs.update` to mute/unmute | "Detect when you're in a meeting and mute other tabs" |
| `storage` | Save allowlist, profiles, session snapshots, meeting log, and ExtensionPay license state | "Remember your settings between sessions" |
| `notifications` | Show a small notification when meeting focus activates/deactivates (optional, user-dismissable) | "Let you know when tabs have been muted or restored" |
| Host permissions (meeting URLs) | Content script injection on meeting sites is excluded; host perms enable URL matching without `<all_urls>` for the tabs query | "Only watches for meetings on Google Meet, Zoom, and Teams" |
| `<all_urls>` in content_scripts | Notification suppression (paid feature) requires injecting a small script into non-meeting tabs | "Block distracting notifications during your call" |

**Note on `<all_urls>`:** This is the most aggressive permission and will trigger a Chrome Web Store warning ("Read and change all your data on all websites"). This is the cost of notification suppression. If the Chrome review team flags it, a fallback approach is to make the content script opt-in: inject only into domains the user has explicitly added to a "suppress notifications" list, using `chrome.scripting.registerContentScripts` dynamically. This avoids `<all_urls>` at the cost of slightly more friction.

### 4.3 Meeting detection logic (background.js)

```
MEETING_PATTERNS = [
  /^https:\/\/meet\.google\.com\/.+/,
  /^https:\/\/.*\.zoom\.us\/[wj]\/.+/,
  /^https:\/\/teams\.microsoft\.com\/.*\/meeting/,
  /^https:\/\/teams\.live\.com\/.*\/meeting/
]

State:
  activeMeetingTabId: null
  mutedTabIds: []           // tabs we muted (so we only unmute what we touched)
  previousMuteState: {}     // tabId -> wasMutedBefore (preserve user's pre-existing mutes)
  sessionSnapshot: []       // paid: full tab state before activation

Listeners:
  1. chrome.tabs.onUpdated  -> check URL + audible state
  2. chrome.tabs.onRemoved  -> if meeting tab closed, deactivate
  3. chrome.commands.onCommand -> manual toggle
```

**Detection flow:**

```
tabs.onUpdated fires with (tabId, changeInfo, tab):

  IF activeMeetingTabId is null (no active meeting):
    IF tab.url matches a MEETING_PATTERN:
      IF changeInfo.audible === true OR user force-activated:
        -> activate(tabId)

  IF activeMeetingTabId === tabId (watching the active meeting):
    IF tab.url no longer matches any MEETING_PATTERN:
      -> deactivate()
    IF changeInfo.audible === false:
      -> start a 30-second grace timer
         (prevents deactivation during brief silences)
         IF audible does not return within 30s:
           -> deactivate()

tabs.onRemoved fires with (tabId):
  IF tabId === activeMeetingTabId:
    -> deactivate()
```

**activate(meetingTabId):**

```
1. Set activeMeetingTabId = meetingTabId
2. Query all tabs: chrome.tabs.query({})
3. For each tab where tab.id !== meetingTabId:
   a. Save tab.mutedInfo.muted to previousMuteState[tab.id]
   b. Check if tab URL is on the user's allowlist; if so, skip
   c. chrome.tabs.update(tab.id, {muted: true})
   d. Add tab.id to mutedTabIds
4. (Paid) Save full tab state to sessionSnapshot in chrome.storage.local
5. (Paid) Send message to content scripts: { action: "suppress-notifications" }
6. Update icon to active (green)
7. Set badge text to mutedTabIds.length
8. (Optional) Show a chrome.notifications notification: "MeetingFocus: 12 tabs muted"
```

**deactivate():**

```
1. For each tabId in mutedTabIds:
   a. IF previousMuteState[tabId] was false (tab was not muted before):
      chrome.tabs.update(tabId, {muted: false})
   b. (Tabs that were already muted before activation stay muted)
2. (Paid) Send message to content scripts: { action: "restore-notifications" }
3. Clear activeMeetingTabId, mutedTabIds, previousMuteState
4. Update icon to idle (gray)
5. Clear badge text
6. (Paid) Log meeting to chrome.storage.local: { date, duration, platform, tabsMuted }
7. (Paid) If any tabs from sessionSnapshot are now missing, show "Restore?" prompt
```

### 4.4 Notification suppression (content-script.js, paid only)

```javascript
// Injected at document_start into non-meeting tabs
// Listens for message from background.js

let originalNotification = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "suppress-notifications") {
    originalNotification = window.Notification;
    window.Notification = function() {
      // Silently swallow the notification
      return {};
    };
    window.Notification.permission = originalNotification.permission;
    window.Notification.requestPermission = () => Promise.resolve("denied");
  }

  if (msg.action === "restore-notifications") {
    if (originalNotification) {
      window.Notification = originalNotification;
      originalNotification = null;
    }
  }
});
```

**Limitation:** This only suppresses web-based `Notification` API calls. It does not suppress:
- Desktop notifications from Slack/Discord desktop apps
- OS-level notification center
- Notifications from other Chrome extensions

This should be clearly documented in the extension's description to avoid bad reviews from users expecting OS-level silencing.

### 4.5 Service worker lifecycle (MV3 gotcha)

MV3 service workers go idle after ~30 seconds of inactivity. This is a problem: if the user opens a meeting tab but does not start the call for 2 minutes, the service worker may have already gone to sleep and missed the `tabs.onUpdated` event.

**Mitigation:**

1. Register all event listeners synchronously at the top level of `background.js` (not inside async callbacks). Chrome persists these registrations even when the worker is idle.
2. When the worker wakes on a `tabs.onUpdated` event, immediately scan all tabs for meeting patterns as a catch-up check (in case events were missed during sleep).
3. Use `chrome.alarms` as a heartbeat (every 25 seconds) during an active meeting to prevent the worker from sleeping mid-call. Clear the alarm on deactivation.

```javascript
// Top-level listener registration (survives service worker sleep)
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.commands.onCommand.addListener(handleCommand);
chrome.alarms.onAlarm.addListener(handleAlarm);
```

---

## 5. Edge cases and decisions

| Edge case | Decision |
|---|---|
| **User opens two meetings simultaneously** | First meeting wins. Second meeting tab is treated as a regular tab (muted). If user wants to switch, they click "End focus" and the second meeting auto-activates. v0.2 could support multi-meeting. |
| **Tab that was already muted before meeting** | Track in `previousMuteState`. Do not unmute on deactivation. |
| **User manually unmutes a tab during a meeting** | Respect it. Do not re-mute. Remove that tab from `mutedTabIds`. |
| **Zoom desktop app (not browser)** | Out of scope. Extension cannot detect native apps. Document clearly. |
| **Meeting URL loaded but no call joined yet** | Audio-gated activation handles this. Tab must produce audio before focus activates. Manual override available. |
| **Brief silence during call (speaker pauses)** | 30-second grace timer before deactivation. Prevents flapping. |
| **New tab opened during active meeting** | `tabs.onCreated` listener mutes it immediately (unless on the allowlist). |
| **Incognito tabs** | Only works if user explicitly enables the extension in incognito mode. No special handling needed. |
| **User clicks "End focus" but meeting is still open** | Respect the manual override. Do not re-activate until the meeting tab navigates away and a new meeting is detected. Set a `userDismissed` flag, cleared on next navigation. |
| **Chrome restart during a meeting** | Session state is lost. On startup, scan all tabs for meeting patterns and re-activate if found. Session snapshot (paid) is persisted in storage and can be offered for restore. |

---

## 6. ExtensionPay integration

### Setup

1. Register at extensionpay.com, create a "MeetingFocus" extension.
2. Configure one plan: **"MeetingFocus Pro"**, one-time payment, $14.99 USD.
3. Include `ExtPay.js` in the extension bundle.
4. In `background.js`, initialize on install:

```javascript
const extpay = ExtPay('meetingfocus');
extpay.startBackground();
```

5. In `popup.js`, check payment status:

```javascript
const user = await extpay.getUser();
if (user.paid) {
  // Show Pro features
} else {
  // Show free tier + upgrade button
}
```

6. Upgrade button calls `extpay.openPaymentPage()`.

### Gating logic

Pro features are gated in two places:

- **background.js:** session snapshot save/restore and meeting log are wrapped in a `isPaid()` check.
- **content-script.js:** notification suppression only activates if the background sends the message, which only happens if the user is paid.
- **popup.js:** profile management UI and CSV export are hidden behind a `user.paid` conditional.

No server required. ExtensionPay handles license validation, receipt emails, and refunds.

---

## 7. Build timeline

Assuming a solo developer working ~4 to 6 hours/day:

| Day | Milestone |
|---|---|
| 1 | Scaffold MV3 project. Manifest, icons (placeholder), popup shell, background.js with meeting detection + auto-mute. |
| 2 | Deactivation logic, `previousMuteState` tracking, allowlist (3-domain free), badge/icon state. |
| 3 | Popup UI: status display, allowlist editor, manual toggle, keyboard shortcut. Polish. |
| 4 | ExtensionPay integration. Paid feature gating. Session snapshot + restore. |
| 5 | Notification suppression content script. Meeting profiles (paid). Meeting log + CSV export (paid). |
| 6 | Edge case handling: new tabs during meeting, simultaneous meetings, Chrome restart recovery, grace timer. |
| 7 | Testing across Google Meet, Zoom web, Teams web. Bug fixes. |
| 8 | Chrome Web Store assets: 5 screenshots, description, privacy policy, demo GIF. |
| 9 | Submit to Chrome Web Store. Set up ExtensionPay plan. Deploy landing page to meetingfocus.app. |
| 10 | Buffer for store review feedback, final fixes, launch prep. |

**Total: 10 working days (2 calendar weeks).**

---

## 8. Chrome Web Store listing checklist

- [ ] Extension name: "MeetingFocus"
- [ ] Short description (132 chars max): "Auto-mutes every tab when you join a video call. Restores them when you hang up. Works with Meet, Zoom, and Teams."
- [ ] Detailed description (see landing page copy, to be drafted)
- [ ] 5 screenshots (1280x800 or 640x400): popup idle, popup active, allowlist, session restore prompt, meeting log
- [ ] 128x128 icon (store tile)
- [ ] 440x280 marquee promo tile (optional but helps)
- [ ] Privacy policy URL (host on meetingfocus.app/privacy)
- [ ] Category: Productivity
- [ ] Single-purpose description for review: "This extension detects video meetings in the active tab and mutes audio on all other tabs to help the user focus during calls."

---

## 9. Privacy policy outline

MeetingFocus needs a privacy policy hosted at `meetingfocus.app/privacy`. Key points:

- **Data collected:** None transmitted off-device. All data (allowlist, profiles, meeting log, session snapshots) is stored locally in `chrome.storage.local`.
- **Data shared:** Never. No analytics, no tracking pixels, no third-party scripts beyond ExtensionPay for payment processing.
- **Permissions explained:** Plain-language explanation of each permission and why it is needed (mirror the table in section 4.2).
- **Contact:** admin@loopheadlabs.com
- **ExtensionPay:** Payment processing is handled by ExtensionPay (Stripe). Loophead Labs does not see or store credit card details.

This is a strong trust signal and differentiator. Keep it short, honest, and free of legalese.

---

## 10. Open questions (to resolve before or during build)

1. **`<all_urls>` risk:** Should we ship v0.1 with notification suppression (requires `<all_urls>`) or defer it to v0.2 to get a cleaner permission footprint and faster store approval? Recommendation: defer to v0.2. Ship free + session snapshot/restore/profiles as the paid tier. Add notification suppression as a v0.2 upsell.

2. **Pricing validation:** $14.99 one-time is the working assumption. Worth A/B testing $9.99 vs $14.99 vs $19.99 after the first 500 installs. ExtensionPay supports changing the plan price without affecting existing paid users.

3. **Zoom URL patterns:** Zoom's web client URLs vary (`zoom.us/j/`, `zoom.us/wc/`, `app.zoom.us/wc/`). Need to test all variants and confirm the regex catches them. May need to add `https://app.zoom.us/*` to host_permissions.

4. **Webex, Slack Huddles, Discord calls?** These are all valid meeting platforms. Omitting from v0.1 to keep scope tight. Add as quick wins in v0.2 based on user requests.

5. **Landing page framework:** Static HTML on Cloudflare Pages (free) is the simplest. Or Astro/11ty if you want a blog for SEO content later. Decision does not block the extension build.
