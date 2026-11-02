# RJ Tracker Pro

A private, **offline-first study tracker with optional encrypted-in-transit cloud sync** for
B.Sc. Nursing, NORCET and agriculture exam preparation — syllabus tracking, spaced
repetition, Focus Timer, analytics, reminders, gamification and an optional AI tutor.
Runs in the browser, installs as a PWA, and ships as a fully bundled Android APK.

## Highlights

- **One account, every device.** Sign in on your phone, tablet and laptop and keep the same
  subjects, sessions, streaks and revision plan. A three-way merge means two devices that were
  both offline still keep *both* sets of edits — and every disagreement is listed for review.
- **Offline is still first.** All data is written to the device before anything is uploaded.
  Sync runs in the background (debounced push, 45-second pull, on reconnect, on app resume).
  Without an account the app works exactly as before — completely local.
- **Your own cloud.** The sync server is included in this repository (`server/`): one file,
  zero npm dependencies, accounts hashed with scrypt, rotating refresh tokens, HTTPS-ready,
  Docker/systemd/nginx instructions. Data is a folder of readable JSON you can back up.
- **Never lose a write.** Every accepted sync is a restore point (last 20 kept). Pushes name the
  version they merged against; a stale push gets a `409` and is merged instead of overwritten.
- **Multi-device control.** See every signed-in device with its last activity, rename this one,
  sign a lost phone out remotely, or end every session by changing the password.
- **Full local backup & restore** including attachments, portable across devices and hosting
  addresses — independent of cloud sync.
- **Bulk subject import** from several `.json` files or a `.zip` pack, with preview, duplicate
  handling and one-tap ZIP export.
- **Daily safety snapshots** — the last 7 days of data kept on-device.
- **Custom app icon, premium splash, notifications**, live Focus Timer notification with
  Pause · Resume · Stop on Android, automatic backups, PDF reports.
- **Optional AI tutor** — chat, MCQs, flashcards and plans using *your own* provider key, stored
  only on the device and never synced or included in backups.

## Cloud sync in 60 seconds

```bash
# terminal 1 — the sync server (no npm install needed)
npm run dev:server          # http://127.0.0.1:8787

# terminal 2 — the app (proxies /api to the server automatically)
npm run dev                 # http://localhost:5173
```

Open the app, create an account, and repeat on a second device (or a second browser profile) —
the same email and password gives the same data. Everything else is automatic.

Production deployment (Docker, Render/Fly/Railway, VPS + nginx, systemd) and the full API are
documented in **[`server/README.md`](server/README.md)**.

### Pointing the app at your server

| Where the app runs | How the endpoint is chosen |
| --- | --- |
| `npm run dev` / `npm run preview` | `/api` → proxied to `http://127.0.0.1:8787` (override with `CLOUD_DEV_URL`) |
| Static web build | `VITE_CLOUD_URL` at build time, or the **Sync server** field on the sign-in screen |
| Android APK | The **Sync server** field (saved on the device — no rebuild). HTTPS is required. |

When `VITE_CLOUD_URL` is unset the web build uses its own origin's `/api`, which is exactly
what a reverse proxy in front of the sync server should expose.

## Develop

```bash
npm install
npm run dev          # app + /api proxy
npm run dev:server   # sync API only
npm run typecheck
npm run test:server  # API integration tests + three-way merge tests
npm run build        # outputs dist/
```

## Deploy (GitHub Pages)

1. Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
2. Optional: add a repository **variable** `CLOUD_URL` (Settings → Secrets and variables →
   Actions → Variables) pointing at your deployed sync server; the workflow passes it to the
   build as `VITE_CLOUD_URL`. Without it the build points at `/api` and students can set the
   server on the sign-in screen.
3. Push to `main`. `.github/workflows/deploy.yml` builds and publishes; the base path is derived
   from the repository name automatically.

## Android APK

Push a tag (e.g. `git tag v14.1.0 && git push origin v14.1.0`) or run **Actions → Build Android APK**.
The workflow bundles the app inside a Capacitor shell, signs it with the release key stored in
repository secrets and publishes the APK under **Releases**, with a release body generated from
`CHANGELOG.md` (`scripts/release-notes.mjs`). The APK never loads the website, so it works fully
offline; exports (backups, ZIPs, reports) open the Android share sheet.

**Sign-in inside the APK** needs a reachable sync server, because a bundled app has no origin to
fall back to:

```bash
# once: bake the address of your deployed server into the next build
gh variable set CLOUD_URL --body https://sync.example.com
# then rebuild (existing tags are re-published with the single newest APK)
gh workflow run "Build Android APK"
```

Without `CLOUD_URL` the build still installs and runs offline; the sign-in screen then asks for the
address once and remembers it on the device (Sign in → Sync server). Re-running the workflow for a
tag replaces the APK on that release instead of piling up builds.

## Architecture

| Path | Purpose |
| --- | --- |
| `server/index.mjs` | Sync API: accounts, devices, versioned documents, restore points |
| `server/lib/*` | Password hashing, atomic file store, rate limiting, token signing |
| `src/platform/cloud/authStore.ts` | Account state (sign in / sign up / profile / devices) |
| `src/platform/cloud/syncEngine.ts` | Background push/pull loop, first-sync decision, conflicts |
| `src/platform/cloud/merge3.ts` | Three-way JSON merge (subjects → units → topics → fields) |
| `src/platform/cloud/sections.ts` | Exactly which local keys are synced (and an explicit deny list) |
| `src/components/auth/AuthScreen.tsx` | Premium sign-in / sign-up / offline entry |
| `src/components/cloud/SyncCenter.tsx` | Status, devices, restore points, conflicts, danger zone |
| `src/platform/storage.ts` | Durable `localStorage` engine (memory + localStorage + IndexedDB mirror) |
| `src/platform/localDb.ts` | On-device data service (subjects, sessions, logs, settings) |
| `src/platform/ai.ts` | Browser-side AI providers (Gemini / Claude / OpenAI) |
| `src/platform/auth.ts` | `useAuth()` facade — cloud account, with guest mode |
| `src/platform/files.ts`, `public/sw.js` | Attachment store and offline app shell |
| `src/lib/bulkImport.ts` | JSON / ZIP bulk subject import and export |
| `src/components/**` | UI |

### How a sync round works

1. **Pull** `GET /v1/sync?have=…` — only sections whose server hash changed come back.
2. **Merge** each changed section against the last synced copy (the base):
   unchanged side wins, both changed → merge per entity and per field.
3. **Push** `POST /v1/sync { baseVersion, sections }`.
   A concurrent push from another device returns `409` with the current document; the client
   merges and retries (up to four times) instead of overwriting.
4. **Apply** to localStorage, then reload once so every screen and hook sees the merged data.
   Any unresolved field difference is preserved in **Cloud sync → Recovery → Conflicts**.

## Privacy

No analytics, no trackers, no third-party fonts or CDNs. The network calls are:

- **your sync server** (only when you are signed in), and
- **the AI provider you configured** (only when you trigger an AI feature).

Sync never includes AI provider keys, AI chat history, attachments, install/onboarding flags or
device-only preferences — the complete list is in `src/platform/cloud/sections.ts`.

Fonts: Fraunces, Inter, JetBrains Mono, Space Mono — SIL Open Font License (see `src/assets/fonts/`).
