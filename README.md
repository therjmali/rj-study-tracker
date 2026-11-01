# RJ Tracker Pro

A private, **offline-first study tracker** for B.Sc. Nursing and NORCET preparation — syllabus tracking, spaced repetition, Pomodoro, analytics, reminders, gamification and an optional AI tutor. Runs entirely in the browser and installs to the home screen as an app.

## Highlights

- **No account, no server.** Everything is stored on your device (IndexedDB mirror of localStorage, uploaded files as blobs).
- **Works offline** after the first load (service worker app shell).
- **Installable** (PWA) on Android, iOS and desktop.
- **Optional AI tutor** — chat, MCQs, flashcards, study plans and tips — using *your own* Gemini, Claude or OpenAI key, stored only on the device and never included in backups.
- **Full backup & restore** (Settings → Backup & Restore) including attachments, portable across devices and hosting addresses.
- **Bulk subject import** — load many subjects at once from several `.json` files or a `.zip` pack, with preview, duplicate handling (keep both / skip / replace) and one-tap ZIP export.
- **Daily safety snapshots** — the last 7 days of data are kept on-device and can be restored in Settings → AI & Device.
- **Custom app icon** — upload your own JPG/PNG/WebP (max 2 MB); used in the header, browser tab, installed-app manifest and as a pinned Android home-screen shortcut.
- **Notifications** — daily study reminders at times you choose (Start focus / Snooze buttons), and a live Pomodoro / stopwatch notification with Pause · Resume · Stop and an end-of-session alert that works with the screen off (Android).
- **Automatic backups** — a full backup on the first open of each day and/or at times you choose, saved to Downloads/RJ Tracker Backups or a folder you pick, with a notification and automatic clean-up of old files.
- **Local-first Android APK** — the full app bundled in the package (see below).
- **PDF reports** through the browser print engine (choose *Save as PDF*).

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm run build        # outputs dist/
```

## Deploy (GitHub Pages)

1. Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
2. Push to `main`. `.github/workflows/deploy.yml` builds and publishes; the base path is derived from the repository name automatically.

## Android APK (local-first)

Push a tag (e.g. `git tag v12.1.0 && git push --tags`) or run **Actions → Build Android APK**. The workflow bundles the app inside a Capacitor shell, signs it with the release key stored in repository secrets and publishes the APK under **Releases**. The APK never loads the website, so it works fully offline. Exports (backups, ZIPs, reports) open the Android share sheet.

## Architecture

| Path | Purpose |
| --- | --- |
| `src/platform/storage.ts` | Durable `localStorage` engine (memory + localStorage + IndexedDB mirror, quota-safe) |
| `src/platform/localDb.ts` | On-device data service (subjects, sessions, logs, settings) |
| `src/platform/ai.ts` | Browser-side AI providers (Gemini / Claude / OpenAI), streaming chat, JSON tasks |
| `src/platform/files.ts`, `public/sw.js` | Attachment store served by the service worker; offline app shell |
| `src/platform/auth.ts` | Local profile (no passwords) |
| `src/platform/snapshots.ts` | Daily rolling safety snapshots |
| `src/platform/native.ts` | Android share-sheet bridge for downloads |
| `src/lib/bulkImport.ts` | JSON / ZIP bulk subject import and export |
| `src/platform/pdf.ts` | Print-to-PDF reports |
| `src/components/**` | UI |

## Privacy

No analytics, no trackers, no third-party fonts or CDNs. The only network calls are the AI requests you trigger, sent straight to the provider you chose.

Fonts: Fraunces, Inter, JetBrains Mono, Space Mono — SIL Open Font License (see `src/assets/fonts/`).
