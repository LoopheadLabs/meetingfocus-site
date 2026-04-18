/**
 * MeetingFocus - Content Script (Notification Suppression)
 *
 * Injected into non-meeting tabs when the user has Pro.
 * Intercepts the browser Notification API so web-based notifications
 * (Slack, Discord, Gmail, etc.) are silently swallowed during a meeting.
 *
 * Only activated when background.js sends { action: "suppress-notifications" }.
 * Restored when background.js sends { action: "restore-notifications" } or
 * when the tab navigates away.
 */

(() => {
  'use strict';

  let suppressing = false;
  let OriginalNotification = null;

  function startSuppression() {
    if (suppressing) return;
    suppressing = true;

    OriginalNotification = window.Notification;

    // Replace the Notification constructor with a silent no-op.
    // We preserve the static API surface so libraries that check
    // Notification.permission before constructing don't throw.
    const FakeNotification = function (title, options) {
      // Return an object with the same shape so callers that hold a
      // reference (e.g. to call .close()) don't crash.
      return {
        close: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        title: title || '',
        body: (options && options.body) || '',
        tag: (options && options.tag) || '',
        onclick: null,
        onclose: null,
        onerror: null,
        onshow: null
      };
    };

    // Mirror static properties from the original
    FakeNotification.permission = OriginalNotification.permission;
    FakeNotification.requestPermission = function () {
      return Promise.resolve(OriginalNotification.permission);
    };
    FakeNotification.maxActions = OriginalNotification.maxActions || 2;

    // Use defineProperty to override the read-only binding on window
    try {
      Object.defineProperty(window, 'Notification', {
        value: FakeNotification,
        writable: true,
        configurable: true
      });
    } catch (e) {
      // Fallback: direct assignment (works in most contexts)
      window.Notification = FakeNotification;
    }
  }

  function stopSuppression() {
    if (!suppressing || !OriginalNotification) return;
    suppressing = false;

    try {
      Object.defineProperty(window, 'Notification', {
        value: OriginalNotification,
        writable: true,
        configurable: true
      });
    } catch (e) {
      window.Notification = OriginalNotification;
    }

    OriginalNotification = null;
  }

  // Listen for commands from the background service worker
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'suppress-notifications') {
      startSuppression();
      sendResponse({ ok: true });
    }

    if (msg.action === 'restore-notifications') {
      stopSuppression();
      sendResponse({ ok: true });
    }

    if (msg.action === 'ping-suppression') {
      sendResponse({ suppressing });
    }
  });
})();
