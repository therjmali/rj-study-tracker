# RJ Tracker Pro

A private, **offline-first study tracker** for B.Sc. Nursing and NORCET preparation — syllabus tracking, spaced repetition, Pomodoro, analytics, reminders, gamification and an optional AI tutor. Runs entirely in the browser and installs to the home screen as an app.

## Highlights

- **No account, no server.** Everything is stored on your device (IndexedDB mirror of localStorage, uploaded files as blobs).
- **Works offline** after the first load (service worker app shell).
- **Installable** (PWA) on Android, iOS and desktop.
- **Optional AI tutor** — chat, MCQs, flashcards, study plans and tips — using *your own* Gemini, Claude or OpenAI key, stored only on the device and never included in backups.
- **Full backup & restore** (Settings → Backup & Restore) including attachments, portable across devices and hosting addresses.
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

## Architecture

| Path | Purpose |
| --- | --- |
| `src/platform/storage.ts` | Durable `localStorage` engine (memory + localStorage + IndexedDB mirror, quota-safe) |
| `src/platform/localDb.ts` | On-device data service (subjects, sessions, logs, settings) |
| `src/platform/ai.ts` | Browser-side AI providers (Gemini / Claude / OpenAI), streaming chat, JSON tasks |
| `src/platform/files.ts`, `public/sw.js` | Attachment store served by the service worker; offline app shell |
| `src/platform/auth.ts` | Local profile (no passwords) |
| `src/platform/pdf.ts` | Print-to-PDF reports |
| `src/components/**` | UI |

## Privacy

No analytics, no trackers, no third-party fonts or CDNs. The only network calls are the AI requests you trigger, sent straight to the provider you chose.

Fonts: Fraunces, Inter, JetBrains Mono, Space Mono — SIL Open Font License (see `src/assets/fonts/`).
