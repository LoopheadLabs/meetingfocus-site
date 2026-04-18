# MeetingFocus: Chrome Web Store Listing Copy

Drop-in copy for the Chrome Web Store developer dashboard submission form. Each section maps to a specific field in the form.

---

## Name (shown on store listing and toolbar)

**MeetingFocus**

Under Chrome's 45-character limit.

---

## Short description (up to 132 characters)

**Auto-mute tabs and silence notifications the moment you join a Meet, Zoom, or Teams call. Restore everything when you hang up.**

(131 characters. Leads with both muting AND notification silencing, the two core value props.)

Alternate options:

- "Auto-mute every other tab the moment you join a Meet, Zoom, or Teams call. Restore them when the call ends." (112 chars)
- "Silence every tab and block notifications during video calls. Meet, Zoom, Teams. Free to start, $9.99 Pro." (106 chars)

---

## Detailed description (up to 16,000 characters)

You're a minute into a client call when a YouTube tab on your other monitor autoplays a mattress commercial. Then a Slack notification pops up over your screen share: "anyone want tacos for lunch?"

MeetingFocus handles both problems automatically.

The moment you join a Google Meet, Zoom, or Microsoft Teams call, MeetingFocus mutes every other tab in your browser. Pro goes further: it silences web notifications from Slack, Discord, Gmail, and every other tab so nothing pops up during your screen share. Any new tab you open during the meeting is muted the instant it loads. When the meeting ends, everything snaps back to the way it was.

You don't click anything. You don't configure anything. It just works.

WORKS ON ALL THREE PLATFORMS YOU ACTUALLY USE

- Google Meet (meet.google.com)
- Zoom web client (app.zoom.us and *.zoom.us)
- Microsoft Teams (teams.microsoft.com and teams.live.com)

Join a call, see the green indicator in the popup, see the muted-tab count tick up in the toolbar badge, keep working. Whether your team lives in Meet, Zoom, or Teams, the behavior is identical.

KEEP WHAT YOU WANT PLAYING

Some audio is part of your focus, not a distraction. Add your music source to the allowlist and Spotify, Apple Music, YouTube Music, or your study playlist keeps playing through the call. Everything else hushes.

The free tier lets you allowlist up to 3 domains. Pro lifts that to unlimited.

NEW TAB OPENS MID-CALL? STILL MUTED.

A coworker drops a link in chat. You click it. Ten seconds later it's not autoplaying a product demo into your meeting audio; MeetingFocus muted it the moment it opened. The popup makes this explicit: "New tabs will open muted until focus ends."

SILENCE NOTIFICATIONS DURING YOUR SCREEN SHARE (PRO)

The Slack ping during your presentation. The Gmail preview showing a subject line your client should not have seen. The Discord alert about your raid group while you're interviewing a candidate.

MeetingFocus Pro intercepts web notifications from every non-meeting tab the moment your call starts. Nothing pops up. Nothing flashes. When the meeting ends, notifications come back on their own. No OS settings to toggle, no Do Not Disturb to remember to turn off afterward.

MEETING PROFILES: ONE SETUP, EVERY CALL TYPE (PRO)

Not all meetings are the same. Standup mode keeps Slack and project tools audible so you can reference tickets mid-call. Presentation mode mutes everything and silences all notifications for total quiet. Create your own custom profiles with per-profile allowlists and notification rules.

Pick a profile from the popup before your call. MeetingFocus does the rest.

WHEN THE CALL ENDS, SO DOES FOCUS MODE

Hang up, close the meeting tab, or navigate away. MeetingFocus detects the end of the meeting and unmutes every tab it touched, restoring each one to its original state. If a tab was muted before the call, it stays muted. If it was playing, it plays again.

You can also end focus manually at any time from the popup or with Alt+Shift+M.

FREE TIER

- Automatic meeting detection on Google Meet, Zoom, and Microsoft Teams
- Auto-mute every other tab for the duration of the call
- Auto-mute any tab opened during the call
- Automatic restore when the call ends
- Session restore: if tabs were closed during the call, reopen them with one click
- Meeting history log with date, platform, duration, and muted-tab count
- CSV export of your meeting history
- 3-domain allowlist for music or ambient audio
- Keyboard shortcut (Alt+Shift+M) for manual toggle
- Toolbar badge showing live muted-tab count

PRO UPGRADE (one-time $9.99, no subscription)

- Notification silencing: blocks web notifications from Slack, Discord, Gmail, and every other tab so nothing pops up during your screen share
- Meeting profiles: named rulesets for different call types (Standup keeps project tools audible, Presentation mutes everything and silences all notifications)
- Create your own custom profiles with per-profile allowlists and notification rules
- Unlimited allowlist entries (free tier allows 3)

One-time purchase. No subscription. No auto-renewal. Pay once, own forever.

PRIVACY FIRST

MeetingFocus does not run any servers. Everything stays on your device.

- No analytics, telemetry, or tracking
- No microphone, camera, or meeting content access at any point
- No remote storage
- No ads
- No data sold, shared, or transmitted to third parties

The only data stored anywhere is in your local Chrome profile: your allowlist, your preferences, your meeting profiles, and your meeting history log. All of it can be cleared by uninstalling the extension or clicking Reset all settings on the options page.

Full privacy policy: https://meetingfocus.app/privacy

FROM LOOPHEAD LABS

MeetingFocus is built and maintained by Loophead Labs, a small independent studio making calm, focused tools for people who live in their browser. Questions, feature requests, or bugs? Email dev@loopheadlabs.com and a real human will reply, usually the same day.

---

## Screenshot captions (if the dashboard offers caption fields, or for image overlays)

Ordered to match the 5-screenshot carousel. Each caption is tuned to the detailed description so visitor eyes and reading brain reinforce each other.

1. **Google Meet hero** (active meeting, 7 tabs muted, 3:11 timer):
   _"The moment you join, every other tab hushes."_

2. **Teams meeting** (active call, 7 tabs muted, 0:38):
   _"Works the same on Google Meet, Zoom, and Microsoft Teams."_

3. **Spotify + active Meet** (Phantom Ping album art, Google Meet popup, 8 tabs muted):
   _"Allowlist the audio you want to keep. Mute everything else."_

4. **Options page** (Pro license, preferences, profiles, meeting history table):
   _"Meeting profiles, full history log, and notification control. All local, all yours."_

5. **Google Meet "You left the meeting"** (with Restore tabs popup, "2 tabs were closed during your meeting"):
   _"Closed a tab mid-call? MeetingFocus offers to reopen it when you hang up."_

---

## Category

**Communication**

(Productivity is a section header, not a selectable category. Communication is the best fit: video meeting tools like Zoom Scheduler live here.)

---

## Language

**English** (primary; only supported language at launch)

---

## Single-purpose description

Chrome's policy (as of 2024) requires every extension to describe its single purpose in one sentence. Paste this into the "Single purpose" field:

**"MeetingFocus automatically mutes other browser tabs when the user joins a video meeting on Google Meet, Zoom, or Microsoft Teams, and unmutes them when the meeting ends."**

---

## Permissions justification

Chrome requires a written justification for each permission and host permission. Paste these into the matching fields:

**`tabs` permission**
Needed to detect which tab the user's video meeting is running in, and to mute or unmute all other tabs for the duration of that meeting. The extension reads tab URLs only to match them against the supported meeting platforms; it does not read tab contents.

**`storage` permission**
Needed to save the user's preferences locally (allowlisted domains, upgrade status, and, on the paid tier, meeting history). All data is stored in chrome.storage.local on the user's device and never transmitted.

**`alarms` permission**
Needed to keep the Manifest V3 service worker responsive during an active meeting and to run a periodic 30-second scan that catches meetings which slip past the event-driven detection path (notably Zoom, whose web client does not always report tab audibility reliably).

**Host permissions (meet.google.com, *.zoom.us, app.zoom.us, teams.microsoft.com, teams.live.com)**
Needed to recognize when a tab is on one of the three supported meeting platforms. The extension does not read page content, inject scripts, or modify these pages in any way; it only checks whether a tab's URL matches a meeting URL pattern so it can trigger auto-mute for other tabs.

**`<all_urls>` in content scripts**
Needed for the Pro-tier notification silencing feature. A small content script is injected into non-meeting tabs at document start. Its sole function is to intercept the browser's Notification API so web notifications (Slack, Discord, Gmail, etc.) are silently suppressed during an active meeting. The script does not read, modify, or transmit any page content. Meeting-platform tabs and extensionpay.com are excluded. When the meeting ends, the original Notification API is restored.

**Remote code use**
None. The extension contains no remotely-hosted code. All JavaScript ships in the extension bundle.

---

## Keywords for discoverability (not a form field; for reference)

These terms should appear naturally across the name, short description, and detailed description so the extension ranks for intent-driven searches:

mute tabs, auto mute, meeting mode, Zoom mute, Google Meet mute, Teams mute, tab silence, meeting focus, browser mute, video call mute, mute during meeting, stop audio meeting, silence tabs

Most of these are already woven into the detailed description above. If the Chrome Web Store ever adds a tags field, use these.

---

## Privacy policy URL

https://meetingfocus.app/privacy

(This field is required. The page must be live before submitting.)

---

## Support email

dev@loopheadlabs.com

---

## Homepage URL

https://meetingfocus.app

---

## Version at launch

0.2.0

---

## Release notes (for the first release)

First public release. Auto-mutes browser tabs during Google Meet, Zoom, and Microsoft Teams meetings. Restores tabs to their previous state when the meeting ends. Free tier includes a 3-domain allowlist, meeting history log with CSV export, session restore for closed tabs, and a keyboard shortcut. Pro ($9.99 one-time) adds notification silencing during calls, meeting profiles (Standup, Presentation, and custom), and unlimited allowlist domains.

---

## Submission checklist

Before hitting Submit in the developer dashboard, verify:

1. All 6 icons render correctly in the dashboard preview (16, 48, 128 idle; 16, 48, 128 active).
2. Privacy policy page is live at https://meetingfocus.app/privacy.
3. Homepage at https://meetingfocus.app is live and not a 404.
4. 5 screenshots uploaded in this order at 1280x800:
   a. Google Meet active (hero)
   b. Teams active
   c. Spotify + Meet active (allowlist)
   d. Options page (Pro + history)
   e. Google Meet "You left" with Restore tabs popup
5. 440x280 small promo tile uploaded (required).
6. 1400x560 marquee tile uploaded (recommended for Featured placement; skip at launch and upload later if you want Featured consideration).
7. Manifest version matches the version entered in the dashboard (0.2.0).
8. Permissions in the manifest exactly match those justified above; no extras.
9. The extension has been tested as a clean unpacked install in a fresh Chrome profile.
10. Support email is monitored; Chrome users can and will email with questions.
11. Zip file contains the contents of `meetingfocus/` with `manifest.json` at the zip root, NOT nested inside a `meetingfocus/` folder.
