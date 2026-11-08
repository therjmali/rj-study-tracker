# Security

RJ Tracker Pro is a personal, local-first study tracker. This page records how it is protected and what to do if something leaks.

## Reporting
Open a private security advisory on this repository (Security → Advisories → Report a vulnerability) or message the owner directly. Please do not file public issues for vulnerabilities.

## What is public by design
- The **Supabase project URL** and **anon key** are inside every web build and APK. They grant nothing by themselves: Row-Level Security in `supabase/schema.sql` restricts every table to `auth.uid()`, and sync tables are writable only through the `sync_*` RPCs.
- The **service_role key must never** be placed in this repository, in repository variables or in the app.

## In-app updates
The APK updater only downloads from `github.com/therjmali/rj-study-tracker/releases/download/…` over HTTPS (redirects only to GitHub hosts), checks the SHA-256 published with the release, then verifies package name, a higher version and the same signing key before handing the file to Android's installer, which still asks you to confirm. Requires the "install unknown apps" permission for this app, granted by you.

## What is never uploaded
AI provider keys, AI chat history, auto-backup settings and uploaded attachments stay on the device (`src/platform/cloud/sections.ts`). A backup file can only write keys listed in `src/platform/dataCatalog.ts`, and AI keys are restored only when the student opts in.

## Protections in the build
- Android: `allowBackup="false"` plus exclude-all data-extraction rules (no Drive/adb/device-transfer copy of the WebView profile), cleartext HTTP disabled, immutable PendingIntents, WebView debugging off, signed release APK (the build fails if the backup flags are not applied).
- Web/APK: Content-Security-Policy with a `connect-src` allow-list (Supabase, the five AI partners — Gemini, Groq, OpenAI, Anthropic, Cohere — and GitHub release info for updates), no remote scripts, no `eval`, `object-src 'none'`. `scripts/check-csp.mjs` fails the build if it is lost. Emergency escape hatch: build with `VITE_CSP=off`.
- Rendering: Markdown accepts only attribute-free `<mark>`; generated reports escape every value and preview in a script-less sandboxed iframe; uploaded HTML/SVG is served sandboxed by the service worker.
- Supply chain: Dependabot (weekly), `npm audit` in CI, pinned Node/Java, deploy workflow has read-only repository access.

## If a secret leaks
- **Signing keystore / password**: rotate by generating a new keystore and updating `ANDROID_KEYSTORE_B64` / `ANDROID_KEYSTORE_PASSWORD`; installed users must reinstall because the signature changes. Keep an offline copy of the keystore — losing it means the same.
- **GitHub token** (used to push): revoke it in Settings → Developer settings and create a fresh one.
- **AI provider key**: revoke it in the provider console and enter a new one in the app.
- **Supabase**: Settings → API → rotate the anon/JWT secret only if the `service_role` key was ever exposed.
