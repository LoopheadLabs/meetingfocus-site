/**
 * MeetingFocus - Popup Script
 */

// ============================================================
// ExtensionPay (Stripe-backed license)
// ============================================================

const extpay = ExtPay('meetingfocus');

// ============================================================
// DOM refs
// ============================================================

const idleView = document.getElementById('idle-view');
const activeView = document.getElementById('active-view');
const restoreView = document.getElementById('restore-view');
const upgradeBanner = document.getElementById('upgrade-banner');

// Idle view
const forceActivateBtn = document.getElementById('force-activate-btn');
const allowlistItems = document.getElementById('allowlist-items');
const allowlistInput = document.getElementById('allowlist-input');
const allowlistAddBtn = document.getElementById('allowlist-add-btn');
const allowlistCount = document.getElementById('allowlist-count');
const allowlistLimitMsg = document.getElementById('allowlist-limit-msg');

// Active view
const meetingPlatform = document.getElementById('meeting-platform');
const mutedCount = document.getElementById('muted-count');
const meetingDuration = document.getElementById('meeting-duration');
const endFocusBtn = document.getElementById('end-focus-btn');

// Restore view
const restoreCount = document.getElementById('restore-count');
const restoreBtn = document.getElementById('restore-btn');
const dismissRestoreBtn = document.getElementById('dismiss-restore-btn');

// Profile selector (idle view)
const profileSelector = document.getElementById('profile-selector');
const profilePicker = document.getElementById('profile-picker');

// Active view extras
const activeProfileInfo = document.getElementById('active-profile-info');
const activeProfileName = document.getElementById('active-profile-name');
const notifIndicator = document.getElementById('notif-indicator');

// Upgrade
const upgradeBtn = document.getElementById('upgrade-btn');

// Footer
const optionsLink = document.getElementById('options-link');

// ============================================================
// State
// ============================================================

const FREE_ALLOWLIST_LIMIT = 3;
let durationInterval = null;
let userIsPaid = false;

// ============================================================
// Init
// ============================================================

async function init() {
  // Check paid status. Storage is the fast path; ExtPay is the source of
  // truth and we reconcile in the background to avoid a network round-trip
  // blocking the popup render.
  const payResult = await chrome.storage.local.get({ isPaid: false });
  userIsPaid = payResult.isPaid;

  extpay.getUser().then(async (user) => {
    if (!!user.paid !== userIsPaid) {
      userIsPaid = !!user.paid;
      await chrome.storage.local.set({ isPaid: userIsPaid });
      await renderAllowlist();
      if (userIsPaid) upgradeBanner.classList.add('hidden');
    }
  }).catch(() => { /* offline; use cached value */ });

  // Check for pending restore (now available to all users)
  const restoreResult = await chrome.storage.local.get({ pendingRestore: [] });
  if (restoreResult.pendingRestore.length > 0) {
    showView('restore');
    restoreCount.textContent = restoreResult.pendingRestore.length;
    return;
  }

  // Get background state
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      showView('idle');
      return;
    }

    if (response.active) {
      showView('active');
      meetingPlatform.textContent = response.meetingPlatform || 'In a meeting';
      mutedCount.textContent = response.mutedCount;
      startDurationTimer(response.meetingStartTime);

      // Show notification indicator if suppression is active
      if (response.notificationsSuppressed) {
        notifIndicator.classList.remove('hidden');
      }

      // Show active profile name if not default
      if (response.activeProfileId && response.activeProfileId !== 'default') {
        activeProfileName.textContent = `Profile: ${response.activeProfileId}`;
        activeProfileInfo.classList.remove('hidden');
      }
    } else {
      showView('idle');
    }
  });

  // Load allowlist
  await renderAllowlist();

  // Pro: show profile selector in idle view
  if (userIsPaid) {
    await renderProfileSelector();
    profileSelector.classList.remove('hidden');
  }

  // Show upgrade banner if not paid
  if (!userIsPaid) {
    upgradeBanner.classList.remove('hidden');
  }
}

// ============================================================
// View management
// ============================================================

function showView(name) {
  idleView.classList.add('hidden');
  activeView.classList.add('hidden');
  restoreView.classList.add('hidden');

  if (name === 'idle') idleView.classList.remove('hidden');
  if (name === 'active') activeView.classList.remove('hidden');
  if (name === 'restore') restoreView.classList.remove('hidden');
}

// ============================================================
// Duration timer
// ============================================================

function startDurationTimer(startTime) {
  if (durationInterval) clearInterval(durationInterval);
  if (!startTime) return;

  function update() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    meetingDuration.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  update();
  durationInterval = setInterval(update, 1000);
}

// ============================================================
// Allowlist
// ============================================================

async function renderAllowlist() {
  const result = await chrome.storage.local.get({ allowlist: [] });
  const list = result.allowlist;

  allowlistCount.textContent = list.length;
  allowlistItems.innerHTML = '';

  list.forEach((domain, index) => {
    const item = document.createElement('div');
    item.className = 'allowlist-item';
    item.innerHTML = `
      <span class="allowlist-domain">${escapeHtml(domain)}</span>
      <button class="allowlist-remove" data-index="${index}" title="Remove">&times;</button>
    `;
    allowlistItems.appendChild(item);
  });

  // Attach remove handlers
  allowlistItems.querySelectorAll('.allowlist-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.index, 10);
      list.splice(idx, 1);
      await chrome.storage.local.set({ allowlist: list });
      chrome.runtime.sendMessage({ action: 'allowlistChanged' });
      await renderAllowlist();
    });
  });

  // Show limit message for free users
  if (!userIsPaid && list.length >= FREE_ALLOWLIST_LIMIT) {
    allowlistLimitMsg.textContent = `Free plan: ${FREE_ALLOWLIST_LIMIT} domains max. Upgrade for unlimited.`;
    allowlistInput.disabled = true;
    allowlistAddBtn.disabled = true;
  } else {
    allowlistLimitMsg.textContent = '';
    allowlistInput.disabled = false;
    allowlistAddBtn.disabled = false;
  }
}

function flashAllowlistMessage(msg, isError) {
  allowlistLimitMsg.textContent = msg;
  allowlistLimitMsg.style.color = isError ? '#b91c1c' : '';
  // Revert after a few seconds so the permanent limit text can reappear
  setTimeout(() => {
    allowlistLimitMsg.style.color = '';
    renderAllowlist();
  }, 3000);
}

async function addToAllowlist() {
  const raw = allowlistInput.value.trim().toLowerCase();
  if (!raw) return;

  // Clean up input: strip protocol, paths, whitespace
  let domain = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (!domain || domain.length < 3 || !domain.includes('.')) {
    flashAllowlistMessage('Enter a full domain like spotify.com', true);
    return;
  }

  const result = await chrome.storage.local.get({ allowlist: [] });
  const list = result.allowlist;

  // Check limits for free users
  if (!userIsPaid && list.length >= FREE_ALLOWLIST_LIMIT) return;

  // Prevent duplicates
  if (list.includes(domain)) {
    allowlistInput.value = '';
    flashAllowlistMessage(`${domain} is already on your allowlist`, true);
    return;
  }

  list.push(domain);
  await chrome.storage.local.set({ allowlist: list });
  chrome.runtime.sendMessage({ action: 'allowlistChanged' });
  allowlistInput.value = '';
  await renderAllowlist();
}

// ============================================================
// Profile selector (Pro)
// ============================================================

async function renderProfileSelector() {
  chrome.runtime.sendMessage({ action: 'getProfiles' }, (response) => {
    if (chrome.runtime.lastError || !response) return;

    const { profiles, selectedProfileId } = response;

    const select = document.createElement('select');
    select.id = 'profile-select';

    for (const profile of profiles) {
      const opt = document.createElement('option');
      opt.value = profile.id;
      opt.textContent = profile.name;
      if (profile.id === selectedProfileId) opt.selected = true;
      select.appendChild(opt);
    }

    const desc = document.createElement('div');
    desc.className = 'profile-desc';
    const selected = profiles.find(p => p.id === selectedProfileId) || profiles[0];
    desc.textContent = selected.description || '';

    profilePicker.innerHTML = '';
    profilePicker.appendChild(select);
    profilePicker.appendChild(desc);

    select.addEventListener('change', () => {
      const newId = select.value;
      chrome.runtime.sendMessage({ action: 'setSelectedProfile', profileId: newId });
      const newProfile = profiles.find(p => p.id === newId);
      desc.textContent = newProfile ? newProfile.description : '';
    });
  });
}

// ============================================================
// Event handlers
// ============================================================

// Force activate
forceActivateBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'forceActivate' }, (response) => {
    if (response && response.success) {
      // Re-init popup to show active state
      init();
    } else {
      forceActivateBtn.textContent = 'No meeting tab found';
      forceActivateBtn.disabled = true;
      setTimeout(() => {
        forceActivateBtn.textContent = 'Activate now';
        forceActivateBtn.disabled = false;
      }, 2000);
    }
  });
});

// End focus
endFocusBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'forceDeactivate' }, () => {
    if (durationInterval) clearInterval(durationInterval);
    init();
  });
});

// Allowlist add
allowlistAddBtn.addEventListener('click', addToAllowlist);
allowlistInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addToAllowlist();
});

// Restore tabs (paid)
restoreBtn.addEventListener('click', async () => {
  const result = await chrome.storage.local.get({ pendingRestore: [] });
  for (const tab of result.pendingRestore) {
    try {
      await chrome.tabs.create({ url: tab.url, active: false });
    } catch (e) {
      // Skip tabs that can't be restored
    }
  }
  await chrome.storage.local.set({ pendingRestore: [] });
  showView('idle');
});

// Dismiss restore
dismissRestoreBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ pendingRestore: [] });
  showView('idle');
});

// Upgrade button
upgradeBtn.addEventListener('click', () => {
  extpay.openPaymentPage('pro');
});

// Options link
optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ============================================================
// Utility
// ============================================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// Start
// ============================================================

init();
