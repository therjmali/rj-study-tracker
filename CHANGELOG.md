# Changelog

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
