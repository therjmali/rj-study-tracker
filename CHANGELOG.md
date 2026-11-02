# Changelog

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
