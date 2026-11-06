# Changelog

## 18.1.0 — Hierarchical Back Navigation, Landscape Bottom Nav, Live Internet Indicator, Progress JPG Sharing & Squircle Unit Dashboard

- **Hierarchical Android Back-Button Navigation & Double-Back App Exit.** Intercepted the native Android hardware and gesture back button via `OnBackPressedCallback` in `MainActivity.java`. Pressing the back button inside Profile, Unit Detail View, sheets, or any sub-tab (Syllabus, Stats, Review, AI Tutor) now shifts the user back to the Home screen (Dashboard) first instead of prematurely exiting the app. Native app termination is strictly guarded on the Home screen with a 2.5-second double-back confirmation toast ("Press back again to exit") powered by `RJNative.exitApp()`.
- **Landscape & Tablet Auto-Fit with Unified Bottom Navigation.** Eliminated awkward corner side-nav layout shifts on widescreen and tablet displays. Navigation buttons (Home, Syllabus, Stats, Review, Profile) remain docked at the bottom across all device sizes and orientations with smooth swipe gestures preserved. Main containers across Profile (`max-w-4xl`), Unit Detail View (`max-w-5xl`), and Dashboard (`max-w-7xl`) now auto-fit landscape displays seamlessly without letterboxing. Guaranteed strict 100% zoom level default across tablet viewports.
- **Instant Offline Loading & Real-Time Internet Indicator (📶).** Guaranteed immediate, offline-first application loading with zero network hang. Added a live, reactive network connectivity pill in `TopHeader` (📶 Online in emerald green / 📵 Offline in amber) beside the cloud sync indicator, maintaining automatic synchronization compatibility whenever internet connectivity resumes.
- **Progress Card Visual JPG Image Generation & Native Sharing.** Upgraded progress sharing from plain text to high-resolution (1200×700 2x) Canvas JPG snapshot cards. The generated graphic highlights total study time, completion percentage, active streak days, and daily goal status, exported via Android native `saveAndShare` (Filesystem & Share sheet) and the Web Share API.
- **Squircle Pill Cards & Boundary Expansion.** Redesigned `PROGRESS`, `STREAK`, `STUDY TIME`, `IMPORTANT`, and `ExamShelf` into squircle pill cards (`rounded-3xl` with subtle glass gradients and vibrant ambient glow). Removed harsh rigid boundaries across `Analytics & Trends`, `DifficultyBreakdown`, and `SubjectIntelligence` for an expansive, borderless dashboard. Redesigned the Unit Detail View into an ultra-premium command center with high-contrast `UNIT 01` badge, glowing completion ring, and modern status pills.
- **Interactive Floating Study Widget Hub.** Introduced `FloatingWidgetHub` — a dockable, draggable floating widget that provides a live study timer with play/pause controls, today's goal ring, and streak counter floating right over your study workflow.

## 18.0.0 — 60/120fps Silky Scrolling, Merged Progress & Goals Shelf, Collapsible Reports & Security Hardening

- **60/120fps Butter-Smooth Scrolling & Lag Fix.** Completely eliminated GPU blur bottlenecks on Android WebViews by optimizing `liquid-glass.css`, hardware layer composition (`LAYER_TYPE_HARDWARE`), and replacing heavy 28px-40px full-screen blur passes with lightweight mathematically smooth gradients and 14px accelerated acrylic glass. Restored native momentum fling scrolling, resolved touch event capture conflicts in `BottomNav` and carousel swipes, and hardened scroll lock restoration to prevent scroll freezing or compositor crashes.
- **Merged Progress & Today's Goals Command Shelf.** Unified `ProgressCard` and `TodayProgressRing` into a single, cohesive ultra-premium command shelf. Combines comprehensive multi-period historical analysis (Today, Yesterday, 1 week, 30 days, Custom, All Time) with real-time daily target tracking: dual progress rings for topics done and study hours, celebration badges when all daily targets are achieved, KPI deltas vs previous periods, and time distribution by subject.
- **Collapsible / Uncollapsible Daily Reports & Forms.** Added fluid accordion containers with spring transitions and persistence for `StudyReport`, `AllSessionsManager`, and `ComparePeriods`. Users can collapse or expand daily reports, search filters, and session managers on demand with persistent state across app launches.
- **Enterprise Security & Vulnerability Hardening.** Neutralized prototype pollution vectors across the cloud sync server, client data imports, and three-way document merge engine with JSON revivers and prototype key rejection. Enforced hardened HTTP response headers (`X-Frame-Options: DENY`, `Strict-Transport-Security`, `Permissions-Policy`, `X-Content-Type-Options: nosniff`), and sanitized MIME types to prevent script execution through virtual uploads.

## 17.1.0 — Unified Liquid Glass 2.0, Lucide navigation, floating header & dashboard sync invitation

- **Unified Liquid Glass 2.0 design system.** Integrated the shared `liquid-glass.css` material layer, matching Quiz Master Pro with ambient multi-radial backdrop refraction, luminous edge borders (`--qmp-glass-edge`), and frosted card depth.
- **Lucide vector navigation.** Upgraded bottom navigation from OS-dependent emojis to crisp Lucide vector icons (`LayoutDashboard`, `BookOpen`, `BarChart2`, `Brain`, `User`), matching active scale animations, dot indicators, and alert badge styling.
- **Floating liquid-glass header.** Upgraded top header to a floating translucent pill with rounded corners (`rounded-[28px]`), hairline top highlight, responsive sync status badge (Syncing / Saved / Error / Local), level pill, quick theme toggle, and avatar trigger.
- **Dashboard guest sign-in card.** Added non-intrusive dismissible sign-in invitation card (`SignInCard`) for guest users on the home dashboard to easily access cloud synchronization.

## 17.0.0 — Liquid Glass, Progress Card, flip clock, readable-everywhere

- **Liquid Glass theme (optional).** Settings → Appearance → Display mode → *Liquid Glass*: frosted, softly lit surfaces floating over a colourful aurora, with a **Light / Dark / Auto** tone (the moon button in the top bar flips the tone). Blur is limited to the big surfaces so scrolling stays smooth.
- **Progress Card + nightly notification.** A new card on Home shows your progress for **Today, Yesterday, 1 week, 30 days, a Custom range or the Complete journey**: goal ring, study time, topics, active days, comparison with the previous period, a bar chart, where your time went, streak, and a Share button. A **nightly notification (11:00 PM by default, change it in Settings → Notifications)** carries today’s numbers and opens the same card. Tonight’s numbers refresh whenever you use the app; the next 13 nights are scheduled too, so it still arrives if you do not open the app.
- **Profile:** Edit profile and Log out are no longer buttons on the main screen — tap the small ✏️ in the corner of the profile card (Log out lives inside, with a confirmation).
- **Units & topics redesigned.** Each unit has a live progress ring around its number, stat chips and a **one-segment-per-topic bar** (done / in progress / to do); topics are compact two-line rows with a status rail, tidy chips and the star and difficulty stacked on the right. About 25 % less wasted side space on phones.
- **Flip clock.** The Home clock now cycles *digital → flip → analog* (tap it). **Exam countdown** uses mechanical flip digits (switch to *classic* by tapping the label) and gains a **Plan & milestones** panel: topics/day and study-hours/day needed (using your own average minutes per topic), ahead/behind-pace verdict, 100/60/30/14/7/3/1-day milestones, **Add to calendar** (.ics with reminders a week, a day and two hours before) and Share.
- **Readable text everywhere.** Several themes define the text colour for accent-coloured fills as white, but ~40 places used it on pale tinted pills (e.g. the *Filtered view* bar) — it vanished. They now use a new theme-aware `accent-ink`. A pixel-level contrast audit of the Home, Syllabus (including filtered), Stats and Profile screens in all five themes also lifted: pale green/yellow/orange/subject-coloured text on light themes, faint “muted/40” labels, and AMOLED / dark-glass accent text that measured **1.2 : 1** on black (accent colours are now lifted on dark canvases).
- **Stability.** Saved settings or data that miss newer fields (older backups, partial imports) are now filled from the defaults on load — previously they crashed the app on start. The Android WebView keeps foreground renderer priority and no longer shows the overscroll stretch; taps respond without the 300 ms delay or grey flash.

## 16.0.0 — Tablet layout, Zoom, one timer, one data panel

- **Tablets fill the screen.** The Android app was locked to portrait, so on a tablet held sideways Android shrank it into a narrow strip with empty space on both sides. Tablets and foldables now rotate freely (respecting your rotation lock) and use the full-width layout with the side navigation; phones stay in portrait. **Profile & Settings** in the side menu now sits right under the tabs, always visible, and the sync banners no longer slide over the menu.
- **Zoom (Settings → Appearance & Display).** Zoom the whole app — text, buttons, dialogs, sheets and previews — from 70 % to 150 %. Move the slider (or use − / + or a preset) to see a **live preview**, then **Apply**; an **Undo** appears for a few seconds. Saved per device (phone and tablet can differ), included in backups, never uploaded.
- **Two timers, not three.** Pomodoro is now part of **Countdown**: switch on **Auto breaks** for focus → short/long break cycles. The Focus Timer, the topic window, the floating mini-timer and the notification all show just **Countdown** and **Stopwatch**. A timer that was running in Pomodoro mode upgrades automatically; older saved sessions are untouched. Break lengths live in *Countdown & Break Preferences*.
- **Backup, Data & Trash is one panel** with three tabs — **Download**, **Restore**, **Trash** (with a count badge). Searching “trash” or “restore” opens the right tab.
- **Removed Export & Documentation** (the documentation / source-manifest downloads). Backups, verification and restore are unchanged.
- **Settings search sits under the AI Tutor card**, with its suggestion chips, and stays in reach below the title bar while you scroll.
- **Premium status card.** One verdict (*All systems healthy* / *Almost there* / *Needs attention*) over four equal tiles — Cloud, Backup, Storage, App — with no sideways scrolling; each tile jumps to its setting.
- Drag-to-reorder and swipe gestures keep working at every zoom level.

## 15.1.0 — Profile editor, Data Center, exact backups, full-settings sync

- **One profile section:** a single profile card with **Edit profile** and **Log out**. The editor sheet covers name, photo (upload or emoji), cover colour, password change, log out and delete account, with validation and an unsaved-changes guard. Guests get a tailored version.
- **Search on top:** the settings search now lives in a sticky header that stays visible while you scroll; results scroll into view. "logout", "password", "download", "verify" … all find their setting.
- **Live status strip:** cloud sync, last backup, storage protection and app version — each chip jumps to the relevant setting.
- **Data Center (Settings → Backup, Data & Trash):** download everything from this device or the **cloud copy**, run a backup self-test, compare every section with the cloud (in sync / uploading / only on device …), and browse an A–Z inventory of everything stored.
- **Exact backups (format v8):** every stored value is saved byte-for-byte with a SHA-256 per item and an overall checksum. Restore verifies the file first, takes a safety snapshot, writes the exact values, reads every key back, and can also replace the cloud copy. Keys outside the data catalog can never be written by a backup file. The AI key is only included if you opt in.
- **Fixed lossy backups:** string settings such as the dashboard clock style used to be exported as `null`; notification times and several other preferences were missing. All are now included and verified.
- **Every setting syncs:** clock style, calendar options, notification & reminder times and onboarding now follow your account (AI keys stay on the device).
- **First sync of a new device prefers your account's settings** over start-up defaults instead of overwriting them.
- **Logout is bulletproof:** the saved session is always removed, even if the server can't be reached; a reload can no longer sign you back in. Profile name changes are applied instantly and kept if the profile can't be fetched.

## 15.0.1 — Fix: endless "Changes from another device were applied" refresh loop

- **Root cause:** on a fresh sign-in the app creates default values (study sessions, excluded subjects…) while the first sync round-trip is in flight. The sync had read the device data *before* that round-trip, so when it finished it treated the new values as deleted, wiped them and reloaded the app — which created them again, forever.
- The sync now reads device data after the network pull, and never overwrites or deletes anything that changed on the device during the sync; those newer values are uploaded by a follow-up sync (and keep the right merge ancestor).
- Safety net: automatic cloud-refreshes are limited to 2 per 30 s; after that you get a "Refresh" button instead of a loop.
- Copy cleanup: removed leftover references to the old self-hosted sync server.

## 15.0.0 — Supabase accounts & free cloud sync

- Email + password accounts and multi-device sync now run on **Supabase (free tier)** instead of the self-hosted Node server. Same offline-first engine and three-way merge.
- Per-user **Row-Level Security**: sync tables are read-only to clients and written only through version-checked database functions scoped to `auth.uid()`.
- First sign-in keeps an untouched local copy of on-device data and verifies the upload before finishing.
- See `SUPABASE_SETUP.md`.

## 14.1.0 — Notification that opens your topic

- **Tap the running timer → your topic.** Tapping the notification (or the floating timer) opens the window of the topic you are studying, with its live timer card. With no topic linked it opens the Focus Timer. Works from a cold start (waits for your syllabus to load).
- **Topic name first.** The notification title is the topic; below it `Mode • Subject › Unit`, and the subject name in the header. The subject colour is the accent.
- **Always on top, expanded where Android allows.** The card is owned by a foreground service, which Android sorts to the top of the shade (the position expanded by default). The compact form already shows topic, live time, Pause and Save.
- **Live progress bar** for Pomodoro and Countdown (refreshes every 20 s) and a Start time / Remaining / Status details row.
- **Sturdier.** Survives swiping the app away; if the system refuses the service the card falls back to a normal ongoing notification and the service is not retried.
- "Open topic window" button in the Focus Timer sheet.

## 14.0.0 — Cloud accounts & multi-device sync

**A real sign-in system**
- Premium sign-in / create-account screen replaces the old name-only landing page: email + password, show/hide, strength meter, confirm field, remember-me, and an honest “Forgot password?” path via the server CLI.
- Accounts live on **your own sync server** (`server/`): scrypt password hashing, 30-minute access tokens, rotating 90-day refresh tokens, per-IP and per-email rate limits, optional origin allow-list.
- Guest mode is now a first-class choice: “Continue offline on this device” keeps everything local, is remembered across reloads, and can be upgraded to an account later without losing a topic (existing device data is uploaded on the first sync).

**Multi-device sync that cannot silently delete work**
- Background engine: pushes 2.5 s after you stop editing, pulls every 45 s, on reconnect and on app resume. Nothing waits for the network.
- Sections are merged **three-way** against the last synced copy — subjects → units → topics → individual fields, plus sessions, daily logs, todos, reminders, notes, achievements, coins and settings.
- Optimistic concurrency: every push names the document version it merged against; a concurrent edit returns `409` with the current document, and the client merges and retries instead of overwriting.
- Unresolvable field differences are kept and listed in **Cloud sync → Recovery**, never dropped silently.
- First contact with an account that already has data asks once: **Merge both · Use cloud · Use device** — the choice applies to that one sync and is never replayed later.

**Cloud Sync Center**
- Live status, last sync, cloud version, pending changes and payload size.
- Device list with last activity, rename this device, remote sign-out and “sign out every other device”.
- Restore points: the last 20 accepted versions on the server, restorable in one tap.
- Conflicts log, full refresh, download/upload between device and cloud, clear cloud copy, delete account.
- Settings → Cloud & Sync entry, header cloud indicator, and a new `/cloud` overlay route.

**Server (`server/`)**
- Single-file, zero-dependency Node API with atomic JSON storage (`server/data/users/*.json`), HMAC tokens, revision history and health endpoint.
- `Dockerfile`, `docker-compose.yml`, `server/README.md` (Render/Fly/Railway/VPS + nginx + systemd), `reset-password.mjs`.
- `reset-password.mjs` works against a **running** server: accounts are re-read from disk before each request, so the new password and the “sign out every device” revocation apply immediately (and a queued write can no longer resurrect the old hash).
- `server/.env.example` documents every switch (port, data dir, secret, origins, proxy trust, payload caps).
- Tests: 15 API integration tests + 11 three-way merge tests (`npm run test:server`).

**Android APK**
- A build that ships without a configured server no longer dead-ends on sign-in: the screen says so, opens the address field immediately, and keeps “Continue offline on this device” one tap away.
- Signed-out **Cloud sync** now offers both “Create an account” and “I already have an account”, and shows which server it is pointing at.
- Release pages are generated from this changelog (`scripts/release-notes.mjs`), so the download page always explains what actually changed.

**Polish & fixes**
- The service worker never caches `/api` (a stale pull would look like data loss).
- Debounced localStorage writers pause during a cloud merge so a stale React state cannot overwrite merged data before the app reloads.
- Profile photo and cover gradient now follow the account across devices.
- `npm run dev` proxies `/api` to the local sync server; `VITE_CLOUD_URL` + an in-app server field cover web, self-hosting and the APK.

## 13.0.0 — Focus Timer release

**One timer, zero confusion**
- 🍅 Pomodoro Timer and ⏱️ Study Timer (plus the old Topic Timer sheet) are now ONE **Focus Timer** with three clearly named modes: 🍅 Pomodoro · ⏳ Countdown · ⏱️ Stopwatch. Same engine, names, icons and presets in the timer sheet, inside every topic, in the floating mini-timer and in the notification.
- Pomodoro and Countdown remember their own lengths; switching mode mid-session is blocked with a clear message instead of silently corrupting the session.
- The timer is wall-clock based and persisted: it survives closing the app, a crash or an Android memory kill, and a countdown that ends while the app is closed is logged once on the next launch.
- Fixed: sessions were always labelled "[Pomodoro]" with the *end* time as start time; sessions now record the real mode, start and end time and the session note.
- Fixed: a "leave site?" prompt appeared every time the app closed.
- Sessions under 30 s are not logged; Stop & Save logs the exact time studied so far (also for part-finished Pomodoro / Countdown blocks).

**Ultra-premium notification (Android)**
- Custom live card: big system chronometer (keeps counting with the screen off), subject chip, Running/Paused status, Pause/Resume · Stop & Save · Notes, session-details row and View Report · History · Settings shortcuts, plus a compact version that already has Pause and Save.
- New default-importance silent channel so the card is shown in the main section and expanded by default where the launcher allows it.
- Pause/Resume works with the app closed; taps are queued with their timestamp and applied exactly on next launch.
- The notification and end alarm are no longer cancelled when the app is swiped away. Quiet "Session saved" receipt.

**Profile photo, icon, splash**
- Fixed: uploaded profile photos were saved but drawn as raw text (`/__files/…`). Photos are now cropped to a compact square, stored self-contained and recognised everywhere; the remove button works on touch screens.
- Custom app icon is pushed to the Android layer: pinned home-screen icon updates in place, recent-apps icon and notification icon follow.
- New premium splash (native Android launch theme + animated web splash showing your own icon).
- Version label now shows the real release (was a hard-coded "v7.0").
