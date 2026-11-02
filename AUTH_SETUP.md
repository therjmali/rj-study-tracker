# RJ Tracker Pro — account sign-in deployment

The current web app already includes the sign-in and create-account screens, the account API client, and a Node sync server. **The account service must be deployed before real account registration or sign-in can work.** GitHub Pages only hosts the static frontend; it does not run the account API.

## 1. Deploy the account server

This repository includes a Render Blueprint at `render.yaml`.

1. Open Render and choose **New → Blueprint**.
2. Connect the GitHub repository `therjmali/rj-study-tracker`.
3. Let Render read `render.yaml` and review the service configuration and price before creating it.
4. Confirm that the service uses a persistent disk mounted at `/data`. Do not remove the disk or change `DATA_DIR` to an ephemeral folder: that is where account records are stored.
5. Wait until the `rj-tracker-sync` web service reports **Live**.

The Blueprint generates `CLOUD_SECRET` inside Render; it is never committed to this repository. The service uses HTTPS, a persistent data volume, and a CORS allow-list for the current GitHub Pages origin and the Capacitor localhost origins.

**Cost note:** the Blueprint intentionally selects a paid compute plan because this file-backed account service requires persistent storage. Render's free service filesystem is ephemeral. Review the exact compute and disk charge in Render before confirming deployment.

## 2. Connect the published website

When Render reports the service is Live, copy its HTTPS service URL, for example `https://rj-tracker-sync-xxxx.onrender.com`.

In GitHub:

1. Open **therjmali/rj-study-tracker → Settings → Secrets and variables → Actions → Variables**.
2. Create or update the repository variable `CLOUD_URL` with the Render HTTPS URL. Do not add a trailing slash.
3. Open **Actions → Deploy to GitHub Pages → Run workflow** to rebuild the frontend with the account API URL.

The deploy workflow maps `CLOUD_URL` to the frontend build variable `VITE_CLOUD_URL`. The current published site remains usable in offline guest mode while the backend is being configured.

## 3. Verify the service

Open `https://YOUR-SERVICE.onrender.com/healthz`. A healthy service returns JSON with `ok: true` and `service: "rj-sync"`.

Then open the published app:

- Sign up with an email address, name, and password.
- Sign out, then sign back in with the same credentials.
- Open the app on another device and sign in to the same account.
- Check **Cloud sync → Devices** to see and revoke signed-in devices.

On first sign-in, the app asks how to handle any existing local data and data already stored in the cloud. Review that choice carefully; do not select an overwrite option unless that is what you intend.

## Password recovery and account safety

The current server does not send password-reset emails. A server owner can reset a password from the server environment with:

```bash
node server/reset-password.mjs user@example.com 'A-new-strong-password'
```

A password reset revokes existing device sessions. Keep the Render data disk attached and back up its `/data` directory regularly. Never commit `CLOUD_SECRET`, account files, passwords, or access tokens to Git.

## Android app

The Android app can be pointed at the same HTTPS endpoint without rebuilding: open **Sign in → Sync server** (or **Settings → Cloud & sync**) and enter the Render service URL. HTTPS is required for cloud sign-in.
