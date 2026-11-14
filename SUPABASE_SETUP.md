# RJ Tracker Pro — Supabase accounts & sync (free tier)

## 1. Create the project (≈5 min)
1. supabase.com → **New project** (free plan). Pick the region nearest you (e.g. Mumbai `ap-south-1`) and save the database password.
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**. (Safe to re-run.)
3. **Authentication → Providers → Email**: keep *Email* enabled and turn **Confirm email OFF** (the free built-in mailer is rate-limited, so confirmation mails are unreliable for a private app).
4. **SQL Editor → New query** → paste all of `supabase/hardening-v18.3.1.sql` → **Run**. It makes sign-up invite-only (the anon key is public, so otherwise anyone could register and fill your free quota), caps text sizes and limits devices per account. Your existing accounts keep working.
   To invite someone: `insert into public.allowed_emails (email) values ('friend@example.com');` — they can then use *Create account* in the app.
5. (Optional, belt and braces) Create your ≤10 accounts from the app's *Create account* screen, then **Authentication → Sign In / Providers → turn "Allow new users to sign up" OFF** so nobody else can register.
5. **Project Settings → API**: copy the **Project URL** and the **anon / public key** (never the `service_role` key).

## 2. Connect the app
GitHub repo → **Settings → Secrets and variables → Actions → Variables** → add:
- `SUPABASE_URL` = Project URL
- `SUPABASE_ANON_KEY` = anon public key

Then **Actions → Deploy to GitHub Pages → Run workflow** (and re-run the Android workflow for a new APK).
Local dev: copy `.env.example` → `.env.local`, fill both values, `npm run dev`.

## 3. Verify
1. Sign up on device A → study a topic → Cloud sync shows *Synced*.
2. Sign in on device B with the same email → the topic appears (pulls every 45 s, on reconnect and on resume).
3. Airplane mode → edit → reconnect → it uploads on its own.
4. A second account never sees the first account's data (enforced by Row-Level Security).

## 4. Password reset (one-time dashboard setup)
The app has a full "Forgot password?" flow (e-mail → 6-digit code or link → new password → signed in). Supabase must be told where the e-mailed link may lead — until then it falls back to `http://localhost:3000`, which is why old reset links "did nothing".

1. **Authentication → URL Configuration**
   - **Site URL**: `https://therjmali.github.io/rj-study-tracker/`
   - **Redirect URLs** (add): `https://therjmali.github.io/rj-study-tracker/**` and, for local dev, `http://localhost:5173/**`
2. **Authentication → Email Templates → Reset Password**: paste `supabase/email-templates/recovery.html` and set the subject shown at its top. (This adds the typed code, which is the path the Android app uses.)
3. **Authentication → SMTP Settings**: Supabase's built-in mailer only delivers to your own project-team addresses and allows ~2 e-mails/hour. Add any SMTP sender (Brevo, Resend, Gmail app-password…) so every account can receive reset e-mails.
4. Optional: **Authentication → Sign In / Providers → Email**: minimum password length 8 (the app already enforces 8+ with a letter and a number).

Test: sign-in screen → *Forgot password?* → e-mail → code (or link) → new password → you are signed in, other devices are signed out.
A reset link works once and expires after an hour; the app tells you when one is dead and offers a fresh e-mail.
Manual links copied from the dashboard (`/auth/v1/verify?...&redirect_to=http://localhost:3000`) cannot work: they redirect to localhost.

## Keep the free project awake
Free projects **pause after 7 days of no activity**. Daily use keeps it alive; if it ever pauses, press *Restore* in the dashboard (data is kept).

## Old self-hosted server
`render.yaml` and `AUTH_SETUP.md` were removed (that server needed a paid Render disk). The `server/` folder is only kept because the merge tests live there. Accounts on the old server are not migrated automatically: create the account in Supabase, sign in on the device that holds the data, and the first sync uploads it.
