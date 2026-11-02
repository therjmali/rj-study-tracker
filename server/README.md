# RJ Tracker Pro — sync server

A single-file, dependency-free Node server that gives the app **real accounts** and
**multi-device sync**. Your study data stays on hardware you control; there is no
SaaS, no telemetry and no third-party service in the path.

```bash
# 1. run it
PORT=8787 DATA_DIR=./server/data node server/index.mjs

# 2. point the app at it
#    web:      Settings → Cloud & sync → Sync server  (or set VITE_CLOUD_URL at build time)
#    Android:  same screen inside the APK — no rebuild needed

# 3. verify
curl http://localhost:8787/healthz
```

The web app served by `npm run dev` proxies `/api` → `http://127.0.0.1:8787`
automatically, so the default build just works in development.

---

## What it stores

```
DATA_DIR/
├── index.json          # email → account id (no passwords)
├── secret.key          # HMAC key for access tokens (only if CLOUD_SECRET is unset)
└── users/
    └── usr_<id>.json   # one readable JSON document per account
```

Each account document contains the hashed password (scrypt with a per-account
salt), the device list, rotating refresh-token hashes, the current document
(version + one value per synced section) and up to 20 restore points.

Backups are therefore trivial: copy the folder.

```bash
tar czf rj-sync-$(date +%F).tgz -C server data
```

## Security model

| Concern | Mitigation |
| --- | --- |
| Password storage | `scrypt` (N=32768, r=8, p=1) with a random 16-byte salt, constant-time compare |
| Session theft | Short-lived (30 min) HMAC access token + rotating 90-day refresh token, stored hashed |
| Replay of a refresh token | Single-use rotation — a reused token is rejected and the device must sign in again |
| Lost device | Revoke it in **Cloud sync → Devices**, or rotate the password to end *all* sessions |
| Brute force | Per-IP rate limits plus a per-email login-attempt limiter (10 / 15 min) |
| Oversized payloads | 12 MiB body cap, 4 MiB per section, 40 sections |
| Blind overwrite | Every push names the document version it merged against; a mismatch returns `409` with the current document |
| Accidental data loss | Every accepted change creates a restorable revision (count- and size-capped) |
| Transport | Designed for HTTPS behind any reverse proxy; run it on `127.0.0.1` + nginx/Caddy if public |

The access token is sent as `Authorization: Bearer …` (never a cookie), which is
why the API can safely answer `Access-Control-Allow-Origin: *` by default. Lock
it down with `CLOUD_ORIGINS=https://your.site,https://localhost` when you know
your origins.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address (use `127.0.0.1` behind a proxy) |
| `DATA_DIR` | `./server/data` | Where accounts are written |
| `CLOUD_SECRET` | auto-generated | HMAC key — set it to keep sessions valid across restarts or container recreations |
| `CLOUD_ORIGINS` | `*` | Comma-separated allowed origins, or `*` |
| `MAX_BODY_BYTES` | `12582912` | Request cap |
| `MAX_ACCOUNT_BYTES` | `12582912` | Cloud copy cap per account |
| `TRUST_PROXY` | unset | `1` behind nginx/Caddy/Render so rate limits use the real client IP |

## Deploy

### Docker (recommended)

```bash
docker build -f server/Dockerfile -t rj-sync .
docker run -d --name rj-sync -p 8787:8787 \
  -v rj-sync-data:/data \
  -e CLOUD_SECRET="$(openssl rand -base64 48)" \
  -e TRUST_PROXY=1 \
  rj-sync
```

Or `docker compose up -d` with the `docker-compose.yml` in the repository root.

### Render / Railway / Fly

- Build command: *(none)* — the image is Docker-based.
- Start command: `node server/index.mjs`
- Health check path: `/healthz`
- Attach a persistent volume at `/data` and set `DATA_DIR=/data`.

### Your own VPS + nginx

```nginx
server {
  listen 443 ssl http2;
  server_name sync.example.com;
  ssl_certificate     /etc/letsencrypt/live/sync.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/sync.example.com/privkey.pem;

  client_max_body_size 16m;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Then run the server with `HOST=127.0.0.1 TRUST_PROXY=1 CLOUD_SECRET=…`.

### systemd unit

```ini
[Unit]
Description=RJ Tracker sync server
After=network.target

[Service]
WorkingDirectory=/opt/rj-tracker
ExecStart=/usr/bin/node server/index.mjs
Environment=PORT=8787
Environment=HOST=127.0.0.1
Environment=DATA_DIR=/var/lib/rj-sync
Environment=TRUST_PROXY=1
Environment=CLOUD_SECRET=replace-me
Restart=always
User=rj

[Install]
WantedBy=multi-user.target
```

## Operations

```bash
# reset a forgotten password (also signs every device out)
node server/reset-password.mjs riya@example.com 'NewPassword123'

# tests (API + the three-way merge used by the client)
npm run test:server
```

The server flushes account files atomically (tmp file + `rename`) and on
`SIGINT`/`SIGTERM`, so `docker stop` is safe.

## API

All bodies are JSON. Errors use `{ "error": { "code", "message" } }`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/auth/register` | `{email, password, name, deviceId, deviceName, devicePlatform}` → session |
| `POST` | `/v1/auth/login` | `{email, password, deviceId…}` → session |
| `POST` | `/v1/auth/refresh` | Rotate a refresh token |
| `POST` | `/v1/auth/logout` | Revoke one refresh token |
| `GET` | `/v1/me` | Account, devices, current cloud version |
| `PATCH` | `/v1/me` | `{name?, avatar?, coverGradient?}` |
| `POST` | `/v1/me/password` | `{currentPassword, newPassword}` → new session, all others revoked |
| `DELETE` | `/v1/account` | `{password}` — deletes the cloud copy permanently |
| `GET` | `/v1/devices` | Devices with `lastSeenAt` and `current` |
| `DELETE` | `/v1/devices/:id` | Revoke one device |
| `POST` | `/v1/devices/revoke-others` | Keep only this device |
| `GET` | `/v1/sync?have=key:hash,…` | Document version, section hashes and only the values that changed |
| `POST` | `/v1/sync` | `{baseVersion, sections:{key:{value,updatedAt}}, deletions:[]}` → merged version, or `409` with the current document |
| `GET` | `/v1/sync/revisions` | Restore points |
| `POST` | `/v1/sync/restore` | `{version}` → new version built from that snapshot |
| `DELETE` | `/v1/sync` | `{confirm:"DELETE"}` — wipe the cloud copy, keep the account |
| `GET` | `/healthz` | Liveness + aggregate counts (never content) |

A push only succeeds against the current `baseVersion`; the client merges the
returned document three-way and retries, which is what makes concurrent edits on
two phones safe.
