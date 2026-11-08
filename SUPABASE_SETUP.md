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

## Keep the free project awake
Free projects **pause after 7 days of no activity**. Daily use keeps it alive; if it ever pauses, press *Restore* in the dashboard (data is kept).

## Old self-hosted server
`render.yaml` and `AUTH_SETUP.md` were removed (that server needed a paid Render disk). The `server/` folder is only kept because the merge tests live there. Accounts on the old server are not migrated automatically: create the account in Supabase, sign in on the device that holds the data, and the first sync uploads it.
