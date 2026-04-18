# MeetingFocus Privacy Policy

**Effective Date:** April 2026
**Publisher:** Loophead Labs LLC

This Privacy Policy applies to the MeetingFocus browser extension ("MeetingFocus", "the extension") published by Loophead Labs LLC ("we", "us", or "our"). It is consistent with the general Loophead Labs privacy policy; this page covers the extension-specific details that the Chrome Web Store requires publishers to disclose.

We are committed to protecting your privacy. This policy explains what data the extension accesses, how it is used, and your rights regarding that data.

## 1. What MeetingFocus Does

MeetingFocus is a productivity extension that detects when you join a video meeting on Google Meet, Zoom, or Microsoft Teams, and automatically mutes your other browser tabs until the meeting ends. Its paid tier adds features such as session restore and meeting history.

## 2. Data We Collect

**We do not operate any servers and we do not collect, transmit, or store any of your personal data on remote systems.**

Everything MeetingFocus needs to function is stored locally in your browser using Chrome's built-in `storage.local` API. This includes:

- Your allowlist of domains that should stay unmuted during meetings (e.g. `spotify.com`) if you have chosen to configure one.
- Your extension preferences (such as whether the "upgrade" banner has been dismissed).
- On the paid tier only: a local meeting history log containing meeting duration, platform name (Google Meet, Zoom, Teams), number of tabs muted, and timestamp. This log never leaves your device.
- On the paid tier only: a temporary snapshot of open tab URLs captured at the start of a meeting, used solely to offer session restore if tabs are closed during the call. This snapshot is erased when the meeting ends.

We do not collect or transmit:

- Your name, email address, or any account identifier tied to you personally.
- The contents of any meeting, page, or tab.
- Your browsing history outside of meeting detection.
- Audio, video, microphone, or camera data. MeetingFocus never accesses your microphone or camera.
- Analytics, telemetry, crash reports, or usage metrics.

## 3. Permissions

MeetingFocus requests the following Chrome permissions, and uses each only for the stated purpose:

- **`tabs`**: to detect which tab contains your meeting and to mute or unmute other tabs.
- **`storage`**: to save your allowlist, preferences, and (on the paid tier) your local meeting history.
- **`alarms`**: to keep the service worker responsive during an active meeting.
- **Host permissions** for `meet.google.com`, `*.zoom.us`, `app.zoom.us`, `teams.microsoft.com`, and `teams.live.com`: to recognize when a tab is on a supported meeting URL. The extension does not read page content on these domains.
- **`<all_urls>` in content scripts**: on the Pro tier, MeetingFocus injects a small content script into non-meeting tabs to suppress web-based notifications during your call. The script intercepts the browser Notification API and does nothing else. It does not read, modify, or transmit page content.

## 4. Third-Party Services

MeetingFocus uses a single third-party service, and only on the paid tier:

- **ExtensionPay** (operated by Glench, LLC), which uses **Stripe** to process one-time payments. When you click Upgrade, you are redirected to Stripe Checkout. We never see or store your payment card details. ExtensionPay and Stripe handle that data under their own privacy policies, available at [extensionpay.com](https://extensionpay.com) and [stripe.com/privacy](https://stripe.com/privacy).

We do not use analytics providers (no Google Analytics, no Firebase, no Mixpanel), advertising networks, or tracking pixels. We do not sell, rent, or share any data with third parties for any purpose.

## 5. Children's Privacy

MeetingFocus is not directed at children under 13. We do not knowingly collect data from children. If you believe a child has used the extension in a way that raises concern, please contact us.

## 6. Data Security

Because MeetingFocus stores all of its data locally on your device using Chrome's built-in storage, the security of that data is a function of your device and your Chrome profile. We encourage you to keep your browser and operating system up to date. Payment data is handled entirely by Stripe, which is PCI-DSS certified and uses industry-standard encryption.

## 7. Your Rights and Choices

You can remove all data MeetingFocus has stored by:

1. Opening the extension's Settings page and clicking **Reset all data**, or
2. Uninstalling the extension from `chrome://extensions`. Uninstalling clears all local data.

Because we do not operate any servers and hold no personal data, there is nothing further to delete on our end.

## 8. Policy Changes

We may update this Privacy Policy as the extension evolves. Changes will be posted at this URL and reflected by the Effective Date above. Material changes will also be noted in the extension's release notes on the Chrome Web Store.

## 9. Contact

For questions about this Privacy Policy or MeetingFocus, please contact: **dev@loopheadlabs.com**

---

© 2026 Loophead Labs LLC. All rights reserved.
