/**
 * MeetingFocus - Options Page Script
 */

// ============================================================
// ExtensionPay (Stripe-backed license)
// ============================================================

const extpay = ExtPay('meetingfocus');

// ============================================================
// DOM refs
// ============================================================

const licenseStatus = document.getElementById('license-status');
const licenseActions = document.getElementById('license-actions');
const prefAudioGate = document.getElementById('pref-audio-gate');
const prefNewTabMute = document.getElementById('pref-new-tab-mute');
const prefBadge = document.getElementById('pref-badge');
const profilesSection = document.getElementById('profiles-section');
const profilesActions = document.getElementById('profiles-actions');
const meetingLog = document.getElementById('meeting-log');
const exportCsvBtn = document.getElementById('export-csv-btn');
const clearLogBtn = document.getElementById('clear-log-btn');
const resetBtn = document.getElementById('reset-btn');

// ============================================================
// Init
// ============================================================

async function init() {
  await renderLicenseStatus();
  await loadPreferences();
  await renderProfiles();
  await renderMeetingLog();
}

// ============================================================
// License
// ============================================================

async function renderLicenseStatus() {
  // Fast path: cached storage value. Then reconcile with ExtPay in the
  // background so a cross-device purchase or refund updates the UI.
  const cached = await chrome.storage.local.get({ isPaid: false });
  paintLicense(cached.isPaid);

  try {
    const user = await extpay.getUser();
    const live = !!user.paid;
    if (live !== cached.isPaid) {
      await chrome.storage.local.set({ isPaid: live });
      paintLicense(live);
      await renderMeetingLog();
    }
  } catch (e) {
    // Offline or ExtPay unreachable; cached state remains.
  }
}

function paintLicense(paid) {
  if (paid) {
    licenseStatus.innerHTML = '<div class="status-text paid">MeetingFocus Pro (licensed)</div>';
    licenseActions.innerHTML = '';
  } else {
    licenseStatus.innerHTML = '<div class="status-text free">Free plan. Upgrade for notification silencing, meeting profiles, and unlimited allowlist.</div>';
    licenseActions.innerHTML = '<button class="btn btn-accent" id="upgrade-options-btn">Upgrade for $9.99</button>';
    document.getElementById('upgrade-options-btn').addEventListener('click', () => {
      extpay.openPaymentPage('pro');
    });
  }
}

// ============================================================
// Preferences
// ============================================================

async function loadPreferences() {
  const result = await chrome.storage.local.get({
    prefs: {
      audioGate: true,
      newTabMute: true,
      showBadge: true
    }
  });

  prefAudioGate.checked = result.prefs.audioGate;
  prefNewTabMute.checked = result.prefs.newTabMute;
  prefBadge.checked = result.prefs.showBadge;
}

async function savePreferences() {
  const prefs = {
    audioGate: prefAudioGate.checked,
    newTabMute: prefNewTabMute.checked,
    showBadge: prefBadge.checked
  };
  await chrome.storage.local.set({ prefs });
}

prefAudioGate.addEventListener('change', savePreferences);
prefNewTabMute.addEventListener('change', savePreferences);
prefBadge.addEventListener('change', savePreferences);

// ============================================================
// Profiles (Pro)
// ============================================================

async function renderProfiles() {
  const cached = await chrome.storage.local.get({ isPaid: false });
  if (!cached.isPaid) {
    profilesSection.innerHTML = '<div class="empty-state">Upgrade to Pro to create meeting profiles with custom muting rules and notification control.</div>';
    profilesActions.innerHTML = '';
    return;
  }

  chrome.runtime.sendMessage({ action: 'getProfiles' }, (response) => {
    if (chrome.runtime.lastError || !response) return;

    const { profiles, selectedProfileId } = response;
    profilesSection.innerHTML = '';

    for (const profile of profiles) {
      const card = document.createElement('div');
      card.className = 'profile-card' + (profile.id === selectedProfileId ? ' selected' : '');

      const tags = [];
      if (profile.suppressNotifications) tags.push('<span class="profile-tag muted">Notifications silenced</span>');
      if (profile.profileAllowlist && profile.profileAllowlist.length > 0) {
        tags.push('<span class="profile-tag active">+' + profile.profileAllowlist.length + ' extra sites unmuted</span>');
      }

      card.innerHTML = `
        <div class="profile-header">
          <span class="profile-name">${escapeHtml(profile.name)}</span>
          <span>
            ${profile.id === selectedProfileId ? '<span class="selected-badge">Active</span>' : ''}
            ${profile.builtIn ? '<span class="built-in-badge">Built-in</span>' : ''}
          </span>
        </div>
        <div class="profile-desc">${escapeHtml(profile.description || '')}</div>
        ${tags.length ? '<div class="profile-tags">' + tags.join('') + '</div>' : ''}
        <div class="profile-actions-row">
          ${profile.id !== selectedProfileId ? '<button class="btn btn-xs btn-primary select-profile-btn" data-id="' + profile.id + '">Select</button>' : ''}
          ${!profile.builtIn ? '<button class="btn btn-xs btn-danger delete-profile-btn" data-id="' + profile.id + '">Delete</button>' : ''}
        </div>
      `;
      profilesSection.appendChild(card);
    }

    // Attach select handlers
    profilesSection.querySelectorAll('.select-profile-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'setSelectedProfile', profileId: btn.dataset.id }, () => {
          renderProfiles();
        });
      });
    });

    // Attach delete handlers
    profilesSection.querySelectorAll('.delete-profile-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Delete this profile?')) {
          chrome.runtime.sendMessage({ action: 'deleteCustomProfile', profileId: btn.dataset.id }, () => {
            renderProfiles();
          });
        }
      });
    });

    // Add "Create profile" button
    profilesActions.innerHTML = '<button class="btn btn-primary" id="create-profile-btn">Create profile</button>';
    document.getElementById('create-profile-btn').addEventListener('click', showProfileForm);
  });
}

function showProfileForm() {
  // Remove existing form if present
  const existing = document.getElementById('new-profile-form');
  if (existing) { existing.remove(); return; }

  const form = document.createElement('div');
  form.id = 'new-profile-form';
  form.className = 'profile-form';
  form.innerHTML = `
    <input type="text" id="pf-name" placeholder="Profile name (e.g. Client Call)" maxlength="40">
    <input type="text" id="pf-desc" placeholder="Short description" maxlength="100">
    <input type="text" id="pf-allowlist" placeholder="Extra unmuted domains (comma-separated, e.g. slack.com, notion.so)">
    <label>
      <input type="checkbox" id="pf-suppress" checked>
      Silence web notifications during meeting
    </label>
    <div class="actions" style="margin-top: 8px;">
      <button class="btn btn-primary" id="pf-save">Save profile</button>
      <button class="btn btn-secondary" id="pf-cancel">Cancel</button>
    </div>
  `;
  profilesActions.after(form);

  document.getElementById('pf-cancel').addEventListener('click', () => form.remove());
  document.getElementById('pf-save').addEventListener('click', async () => {
    const name = document.getElementById('pf-name').value.trim();
    if (!name) { alert('Profile needs a name.'); return; }

    const desc = document.getElementById('pf-desc').value.trim();
    const allowlistRaw = document.getElementById('pf-allowlist').value.trim();
    const suppress = document.getElementById('pf-suppress').checked;

    const profileAllowlist = allowlistRaw
      ? allowlistRaw.split(',').map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')).filter(d => d.length > 2)
      : [];

    const profile = {
      id: 'custom_' + Date.now(),
      name,
      description: desc,
      builtIn: false,
      muteAll: true,
      suppressNotifications: suppress,
      profileAllowlist
    };

    chrome.runtime.sendMessage({ action: 'saveCustomProfile', profile }, () => {
      form.remove();
      renderProfiles();
    });
  });
}

// ============================================================
// Meeting log
// ============================================================

async function renderMeetingLog() {
  const result = await chrome.storage.local.get({ meetingHistory: [] });

  const history = result.meetingHistory;

  if (history.length === 0) {
    meetingLog.innerHTML = '<div class="empty-state">No meetings logged yet. History appears after your first MeetingFocus session.</div>';
    return;
  }

  // Show most recent first
  const rows = [...history].reverse().map(entry => {
    const date = new Date(entry.date);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const mins = Math.floor(entry.duration / 60);
    const secs = entry.duration % 60;
    const durStr = `${mins}m ${secs}s`;

    return `<tr>
      <td>${dateStr} ${timeStr}</td>
      <td>${escapeHtml(entry.platform)}</td>
      <td>${durStr}</td>
      <td>${entry.tabsMuted}</td>
    </tr>`;
  }).join('');

  meetingLog.innerHTML = `
    <table class="meeting-log-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Platform</th>
          <th>Duration</th>
          <th>Tabs muted</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ============================================================
// Export CSV
// ============================================================

exportCsvBtn.addEventListener('click', async () => {
  const result = await chrome.storage.local.get({ meetingHistory: [] });
  if (result.meetingHistory.length === 0) return;

  const header = 'Date,Platform,Duration (seconds),Tabs Muted\n';
  const rows = result.meetingHistory.map(e =>
    `"${e.date}","${e.platform}",${e.duration},${e.tabsMuted}`
  ).join('\n');

  const csv = header + rows;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `meetingfocus-history-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ============================================================
// Clear history
// ============================================================

clearLogBtn.addEventListener('click', async () => {
  if (confirm('Clear all meeting history? This cannot be undone.')) {
    await chrome.storage.local.set({ meetingHistory: [] });
    await renderMeetingLog();
  }
});

// ============================================================
// Reset all
// ============================================================

resetBtn.addEventListener('click', async () => {
  if (confirm('Reset all MeetingFocus settings, allowlist, and history? This cannot be undone.')) {
    await chrome.storage.local.clear();
    location.reload();
  }
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
