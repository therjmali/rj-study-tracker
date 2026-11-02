/**
 * RJ Tracker Pro — cloud sync server.
 *
 * What it is
 * ----------
 * A tiny, dependency-free JSON API that gives the app real accounts and
 * multi-device sync while keeping every byte on infrastructure *you* control.
 *
 * Design rules
 * ------------
 *  • Zero npm dependencies — `node server/index.mjs` is the whole install.
 *  • Offline-first: the client never waits for this server to render or save.
 *  • Never lose a write: every accepted change bumps a monotonic document
 *    version and is archived as a restorable revision.
 *  • Optimistic concurrency: a push must name the version it merged against;
 *    a mismatch returns 409 with the current document so the client can
 *    three-way merge instead of overwriting someone else's work.
 *
 * Run
 * ---
 *   PORT=8787 DATA_DIR=./server/data node server/index.mjs
 *
 * Environment
 * -----------
 *   PORT                 listen port (default 8787)
 *   HOST                 bind address (default 0.0.0.0)
 *   DATA_DIR             where accounts live (default ./server/data)
 *   CLOUD_SECRET         HMAC secret for access tokens (auto-generated if unset)
 *   CLOUD_ORIGINS        comma-separated allow-list, or * (default *)
 *   MAX_BODY_BYTES       request body cap (default 12 MiB)
 *   TRUST_PROXY          "1" to trust X-Forwarded-For (set behind a reverse proxy)
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clampString, deepEqual, hashValue, nowIso, signToken, toInt, uid, verifyToken,
} from './lib/util.mjs';
import { hashPassword, hashRefreshToken, newRefreshToken, passwordProblem, verifyPassword } from './lib/passwords.mjs';
import { StoreError, UserStore } from './lib/store.mjs';
import { RateLimiter } from './lib/ratelimit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_REVISIONS = 20;
const MAX_REVISION_BYTES = 8 * 1024 * 1024;
const MAX_SECTIONS = 40;
const MAX_SECTION_BYTES = 4 * 1024 * 1024;
const MAX_ACCOUNT_BYTES = toInt(process.env.MAX_ACCOUNT_BYTES, 12 * 1024 * 1024);
const ACCESS_TTL_MS = 30 * 60 * 1000;
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_DEVICES = 12;
const SECTION_KEY_RE = /^[a-zA-Z0-9._:-]{1,80}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

class ApiError extends Error {
  constructor(status, code, message, extra = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar ?? '',
    coverGradient: user.coverGradient ?? '0',
    createdAt: user.createdAt,
  };
}

function sectionMeta(doc) {
  const out = {};
  for (const [key, section] of Object.entries(doc.sections ?? {})) {
    out[key] = { hash: section.hash, updatedAt: section.updatedAt, deviceId: section.deviceId ?? null };
  }
  return out;
}

function docPayload(user, { includeData = true, onlyKeys = null } = {}) {
  const doc = user.doc;
  const sections = sectionMeta(doc);
  const payload = {
    version: doc.version,
    updatedAt: doc.updatedAt,
    sections,
    bytes: Object.values(doc.sections ?? {}).reduce((sum, s) => {
      try { return sum + Buffer.byteLength(JSON.stringify(s.value ?? null)); } catch { return sum; }
    }, 0),
  };
  if (includeData) {
    const data = {};
    for (const [key, section] of Object.entries(doc.sections ?? {})) {
      if (onlyKeys && !onlyKeys.has(key)) continue;
      data[key] = section.value;
    }
    payload.data = data;
  }
  return payload;
}

function parseHave(query) {
  const raw = query.get('have');
  if (!raw) return null;
  const map = new Map();
  for (const pair of raw.split(',')) {
    const idx = pair.lastIndexOf(':');
    if (idx <= 0) continue;
    map.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  return map;
}

function addRevision(user, deviceId, keys) {
  const doc = user.doc;
  doc.revisions = Array.isArray(doc.revisions) ? doc.revisions : [];
  const snapshot = {};
  for (const [key, section] of Object.entries(doc.sections ?? {})) snapshot[key] = section.value;
  doc.revisions.push({
    version: doc.version,
    at: doc.updatedAt,
    deviceId: deviceId ?? null,
    keys: keys ?? [],
    snapshot,
  });
  // Keep the history rich but bounded (count and bytes).
  const serialised = [];
  let bytes = 0;
  for (let i = doc.revisions.length - 1; i >= 0; i--) {
    let size = 0;
    try { size = Buffer.byteLength(JSON.stringify(doc.revisions[i].snapshot ?? {})); } catch { size = 0; }
    if (serialised.length >= MAX_REVISIONS || bytes + size > MAX_REVISION_BYTES) break;
    bytes += size;
    serialised.unshift(doc.revisions[i]);
  }
  doc.revisions = serialised;
}

function touchDevice(user, deviceId, info = {}) {
  if (!deviceId) return;
  user.devices = Array.isArray(user.devices) ? user.devices : [];
  let device = user.devices.find(d => d.id === deviceId);
  if (!device) {
    device = {
      id: deviceId,
      name: clampString(info.name, 60) || 'This device',
      platform: clampString(info.platform, 30) || 'web',
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
    };
    user.devices.push(device);
    // Oldest devices fall off the list (their refresh tokens are revoked with them).
    if (user.devices.length > MAX_DEVICES) {
      const sorted = [...user.devices].sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
      const keep = new Set(sorted.slice(0, MAX_DEVICES).map(d => d.id));
      user.devices = user.devices.filter(d => keep.has(d.id));
      for (const [hash, rec] of Object.entries(user.refreshTokens ?? {})) {
        if (!keep.has(rec.deviceId)) delete user.refreshTokens[hash];
      }
    }
  } else {
    if (info.name) device.name = clampString(info.name, 60);
    if (info.platform) device.platform = clampString(info.platform, 30);
    // Avoid a disk write on literally every request.
    const last = Date.parse(device.lastSeenAt || 0);
    if (!Number.isFinite(last) || Date.now() - last > 60_000) device.lastSeenAt = nowIso();
  }
}

function issueAccess(user, deviceId, secret) {
  return signToken({
    sub: user.id,
    ver: user.tokenVersion ?? 0,
    dev: deviceId ?? null,
    exp: Date.now() + ACCESS_TTL_MS,
  }, secret);
}

function pruneRefreshTokens(user) {
  const now = Date.now();
  user.refreshTokens = user.refreshTokens ?? {};
  for (const [hash, rec] of Object.entries(user.refreshTokens)) {
    if (!rec || rec.expiresAt < now) delete user.refreshTokens[hash];
  }
}

function issueRefresh(user, deviceId) {
  const { token, hash } = newRefreshToken();
  pruneRefreshTokens(user);
  user.refreshTokens[hash] = { deviceId: deviceId ?? null, createdAt: nowIso(), expiresAt: Date.now() + REFRESH_TTL_MS };
  // A device keeps at most 3 live refresh tokens (rotated on every refresh).
  const mine = Object.entries(user.refreshTokens)
    .filter(([, rec]) => (rec.deviceId ?? null) === (deviceId ?? null))
    .sort((a, b) => String(b[1].createdAt).localeCompare(String(a[1].createdAt)));
  for (const [h] of mine.slice(3)) delete user.refreshTokens[h];
  return token;
}

function issueSession(user, deviceId, secret, deviceInfo) {
  touchDevice(user, deviceId, deviceInfo);
  return {
    user: publicUser(user),
    token: issueAccess(user, deviceId, secret),
    refreshToken: issueRefresh(user, deviceId),
    expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
    deviceId,
  };
}

/* ─────────────────────────────── server ─────────────────────────────── */

export async function createApp(options = {}) {
  const dataDir = options.dataDir ?? process.env.DATA_DIR ?? path.join(__dirname, 'data');
  const store = new UserStore(dataDir);
  await store.init();
  const secret = await store.getSecret();
  const limiter = new RateLimiter();
  const maxBody = toInt(options.maxBody ?? process.env.MAX_BODY_BYTES, 12 * 1024 * 1024);
  const allowedOrigins = (process.env.CLOUD_ORIGINS ?? '*').split(',').map(s => s.trim()).filter(Boolean);
  const trustProxy = options.trustProxy ?? process.env.TRUST_PROXY === '1';
  const startedAt = Date.now();

  function clientIp(req) {
    if (trustProxy) {
      const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (fwd) return fwd;
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  function setCors(req, res) {
    const origin = req.headers.origin;
    if (allowedOrigins.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Device-Id,X-Device-Name,X-Client');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  function send(res, status, body, extraHeaders = {}) {
    const text = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...extraHeaders,
    });
    res.end(text);
  }

  async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBody) throw new ApiError(413, 'body_too_large', 'That request is too large.');
      chunks.push(chunk);
    }
    if (!size) return {};
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new ApiError(400, 'invalid_json', 'Request body must be a JSON object.');
      }
      return parsed;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(400, 'invalid_json', 'Request body is not valid JSON.');
    }
  }

  function enforce(req, bucket, limit, windowMs) {
    const result = limiter.hit(`${bucket}:${clientIp(req)}`, limit, windowMs);
    if (!result.ok) {
      throw new ApiError(429, 'rate_limited', `Too many requests. Try again in ${result.retryAfter}s.`, { retryAfter: result.retryAfter });
    }
  }

  async function authenticate(req) {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Bearer ')) throw new ApiError(401, 'unauthorized', 'Sign in to continue.');
    const payload = verifyToken(header.slice(7).trim(), secret);
    if (!payload) throw new ApiError(401, 'token_expired', 'Your session expired. Please sign in again.');
    const user = store.getUser(payload.sub);
    if (!user) throw new ApiError(401, 'account_not_found', 'This account no longer exists.');
    if ((payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new ApiError(401, 'session_revoked', 'This session was signed out on another device.');
    }
    const deviceId = payload.dev ?? String(req.headers['x-device-id'] || '') ?? null;
    touchDevice(user, deviceId, { name: req.headers['x-device-name'] });
    return { user, deviceId };
  }

  function requireDeviceId(body, req) {
    const raw = body.deviceId ?? req.headers['x-device-id'];
    const id = clampString(raw, 80).replace(/[^a-zA-Z0-9._:-]/g, '');
    return id || uid('dev_');
  }

  function deviceInfoOf(body, req) {
    return {
      name: clampString(body.deviceName ?? req.headers['x-device-name'], 60) || 'This device',
      platform: clampString(body.devicePlatform ?? '', 30) || 'web',
    };
  }

  async function handle(req, res) {
    setCors(req, res);
    // Accounts may be edited from another process (reset-password.mjs while the
    // server is up). Re-read changed files before answering, so the reset takes
    // effect immediately instead of waiting for a restart.
    await store.refreshFromDisk();
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const route = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method ?? 'GET';

    /* Health & discovery */
    if (route === '/healthz' || route === '/v1/health' || route === '/api/healthz') {
      if (method !== 'GET') throw new ApiError(405, 'method_not_allowed', 'Use GET.');
      return send(res, 200, {
        ok: true,
        service: 'rj-sync',
        version: 1,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        ...store.stats(),
      });
    }
    if (route === '/' && method === 'GET') {
      return send(res, 200, {
        service: 'RJ Tracker Pro sync server',
        docs: 'https://github.com/therjmali/rj-study-tracker#cloud-sync',
        endpoints: [
          'POST /v1/auth/register', 'POST /v1/auth/login', 'POST /v1/auth/refresh',
          'GET /v1/sync', 'POST /v1/sync', 'GET /v1/sync/revisions',
          'GET /v1/devices', 'GET /healthz',
        ],
      });
    }

    /* ── Auth ────────────────────────────────────────────────────────── */

    if (route === '/v1/auth/register' && method === 'POST') {
      enforce(req, 'register', 10, 60 * 60 * 1000);
      const body = await readJson(req);
      const email = clampString(body.email, 200).trim();
      const name = clampString(body.name, 80).trim();
      const password = String(body.password ?? '');
      if (!EMAIL_RE.test(email)) throw new ApiError(400, 'invalid_email', 'Enter a valid email address.');
      const pwProblem = passwordProblem(password);
      if (pwProblem) throw new ApiError(400, 'weak_password', pwProblem);
      if (store.getUserByEmail(email)) throw new ApiError(409, 'email_taken', 'An account with this email already exists.');
      const deviceId = requireDeviceId(body, req);
      const user = {
        id: uid('usr_'),
        email,
        name: name || email.split('@')[0],
        avatar: '',
        coverGradient: '0',
        passwordHash: hashPassword(password),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastLoginAt: nowIso(),
        tokenVersion: 0,
        refreshTokens: {},
        devices: [],
        doc: { version: 0, updatedAt: nowIso(), sections: {} },
        revisions: [],
      };
      try {
        await store.createUser(user);
      } catch (err) {
        if (err instanceof StoreError) throw new ApiError(err.status, err.code, err.message);
        throw err;
      }
      const session = issueSession(user, deviceId, secret, deviceInfoOf(body, req));
      await store.saveUser(user, { immediate: true });
      return send(res, 201, session);
    }

    if (route === '/v1/auth/login' && method === 'POST') {
      enforce(req, 'login', 30, 15 * 60 * 1000);
      const body = await readJson(req);
      const email = clampString(body.email, 200).trim();
      const password = String(body.password ?? '');
      const failKey = `login-fail:${email.toLowerCase()}`;
      const failState = limiter.hit(failKey, 10, 15 * 60 * 1000);
      if (!failState.ok) {
        throw new ApiError(429, 'too_many_attempts', 'Too many failed attempts. Please wait a few minutes and try again.', { retryAfter: failState.retryAfter });
      }
      const user = store.getUserByEmail(email);
      const ok = user ? verifyPassword(password, user.passwordHash) : false;
      if (!ok || !user) throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect.');
      limiter.reset(failKey);
      const deviceId = requireDeviceId(body, req);
      user.lastLoginAt = nowIso();
      const session = issueSession(user, deviceId, secret, deviceInfoOf(body, req));
      await store.saveUser(user);
      return send(res, 200, session);
    }

    if (route === '/v1/auth/refresh' && method === 'POST') {
      enforce(req, 'refresh', 120, 15 * 60 * 1000);
      const body = await readJson(req);
      const token = String(body.refreshToken ?? '');
      if (!token) throw new ApiError(401, 'invalid_refresh', 'Missing refresh token.');
      const hash = hashRefreshToken(token);
      const deviceId = requireDeviceId(body, req);
      let matchedUser = null;
      let record = null;
      for (const user of store.listUsers()) {
        pruneRefreshTokens(user);
        if (user.refreshTokens?.[hash]) { matchedUser = user; record = user.refreshTokens[hash]; break; }
      }
      if (!matchedUser || !record) throw new ApiError(401, 'invalid_refresh', 'Please sign in again.');
      // Rotate: the used token can never be replayed.
      delete matchedUser.refreshTokens[hash];
      if (record.deviceId && record.deviceId !== deviceId) {
        await store.saveUser(matchedUser, { immediate: true });
        throw new ApiError(401, 'invalid_refresh', 'Please sign in again on this device.');
      }
      const session = issueSession(matchedUser, deviceId, secret, deviceInfoOf(body, req));
      await store.saveUser(matchedUser);
      return send(res, 200, session);
    }

    if (route === '/v1/auth/logout' && method === 'POST') {
      const body = await readJson(req);
      const token = String(body.refreshToken ?? '');
      if (token) {
        const hash = hashRefreshToken(token);
        for (const user of store.listUsers()) {
          if (user.refreshTokens?.[hash]) {
            delete user.refreshTokens[hash];
            await store.saveUser(user, { immediate: true });
            break;
          }
        }
      }
      return send(res, 200, { ok: true });
    }

    /* ── Everything below needs a valid access token ──────────────────── */

    const { user, deviceId } = await authenticate(req);

    if (route === '/v1/me' && method === 'GET') {
      return send(res, 200, {
        user: publicUser(user),
        devices: (user.devices ?? []).map(d => ({ ...d, current: d.id === deviceId })),
        sync: { version: user.doc?.version ?? 0, updatedAt: user.doc?.updatedAt ?? null },
      });
    }

    if (route === '/v1/me' && method === 'PATCH') {
      const body = await readJson(req);
      if (body.name !== undefined) {
        const name = clampString(body.name, 80).trim();
        if (!name) throw new ApiError(400, 'invalid_name', 'Your name cannot be empty.');
        user.name = name;
      }
      if (body.avatar !== undefined) user.avatar = clampString(body.avatar, 400_000);
      if (body.coverGradient !== undefined) user.coverGradient = clampString(body.coverGradient, 4);
      user.updatedAt = nowIso();
      await store.saveUser(user);
      return send(res, 200, { user: publicUser(user) });
    }

    if (route === '/v1/me/password' && method === 'POST') {
      enforce(req, 'password', 10, 15 * 60 * 1000);
      const body = await readJson(req);
      if (!verifyPassword(String(body.currentPassword ?? ''), user.passwordHash)) {
        throw new ApiError(403, 'invalid_credentials', 'Your current password is incorrect.');
      }
      const pwProblem = passwordProblem(body.newPassword);
      if (pwProblem) throw new ApiError(400, 'weak_password', pwProblem);
      user.passwordHash = hashPassword(String(body.newPassword));
      user.tokenVersion = (user.tokenVersion ?? 0) + 1; // invalidate every access token
      user.refreshTokens = {}; // and every refresh token
      user.updatedAt = nowIso();
      const session = issueSession(user, deviceId, secret, {});
      await store.saveUser(user, { immediate: true });
      return send(res, 200, session);
    }

    if (route === '/v1/account' && method === 'DELETE') {
      const body = await readJson(req);
      if (!verifyPassword(String(body.password ?? ''), user.passwordHash)) {
        throw new ApiError(403, 'invalid_credentials', 'Enter your password to delete the cloud copy.');
      }
      await store.deleteUser(user);
      return send(res, 200, { ok: true, deleted: true });
    }

    /* ── Devices ─────────────────────────────────────────────────────── */

    if (route === '/v1/devices' && method === 'GET') {
      touchDevice(user, deviceId, { name: req.headers['x-device-name'] });
      await store.saveUser(user);
      return send(res, 200, {
        devices: (user.devices ?? [])
          .map(d => ({ ...d, current: d.id === deviceId }))
          .sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt))),
      });
    }

    if (route === '/v1/devices/revoke-others' && method === 'POST') {
      const body = await readJson(req);
      const keepCurrent = body.keepCurrent !== false;
      const keepIds = keepCurrent ? new Set([deviceId]) : new Set();
      user.devices = (user.devices ?? []).filter(d => keepIds.has(d.id));
      for (const [hash, rec] of Object.entries(user.refreshTokens ?? {})) {
        if (!keepIds.has(rec.deviceId)) delete user.refreshTokens[hash];
      }
      user.updatedAt = nowIso();
      await store.saveUser(user, { immediate: true });
      return send(res, 200, { ok: true, devices: user.devices });
    }

    const deviceMatch = route.match(/^\/v1\/devices\/([^/]+)$/);
    if (deviceMatch && method === 'DELETE') {
      const target = decodeURIComponent(deviceMatch[1]);
      user.devices = (user.devices ?? []).filter(d => d.id !== target);
      for (const [hash, rec] of Object.entries(user.refreshTokens ?? {})) {
        if (rec.deviceId === target) delete user.refreshTokens[hash];
      }
      user.updatedAt = nowIso();
      await store.saveUser(user, { immediate: true });
      return send(res, 200, { ok: true, devices: user.devices, signedOutDevice: target });
    }

    /* ── Sync ────────────────────────────────────────────────────────── */

    if (route === '/v1/sync' && method === 'GET') {
      enforce(req, 'sync', 1200, 15 * 60 * 1000);
      const have = parseHave(url.searchParams);
      const doc = user.doc;
      const changed = new Set();
      if (have) {
        for (const [key, section] of Object.entries(doc.sections ?? {})) {
          if (have.get(key) !== section.hash) changed.add(key);
        }
        for (const key of have.keys()) if (!(key in (doc.sections ?? {}))) changed.add(key);
      }
      const payload = docPayload(user, { includeData: true, onlyKeys: have ? changed : null });
      payload.changedKeys = [...changed];
      return send(res, 200, payload);
    }

    if (route === '/v1/sync' && method === 'POST') {
      enforce(req, 'sync', 1200, 15 * 60 * 1000);
      const body = await readJson(req);
      const doc = user.doc;
      const baseVersion = Number.isFinite(body.baseVersion) ? Math.trunc(body.baseVersion) : -1;

      if (baseVersion !== doc.version) {
        // Optimistic-concurrency guard: hand back the truth so the client can merge.
        return send(res, 409, {
          error: {
            code: 'version_conflict',
            message: 'Another device saved changes first. Merging…',
            version: doc.version,
          },
          ...docPayload(user),
        });
      }

      const push = body.sections && typeof body.sections === 'object' ? body.sections : {};
      const deletions = Array.isArray(body.deletions) ? body.deletions : [];
      const applied = [];
      const rejected = [];
      let bytes = 0;
      for (const section of Object.values(doc.sections ?? {})) {
        try { bytes += Buffer.byteLength(JSON.stringify(section.value ?? null)); } catch { /* ignore */ }
      }

      for (const [key, incoming] of Object.entries(push)) {
        if (!SECTION_KEY_RE.test(key)) { rejected.push({ key, reason: 'invalid_key' }); continue; }
        if (!incoming || typeof incoming !== 'object' || !('value' in incoming)) { rejected.push({ key, reason: 'missing_value' }); continue; }
        let size = 0;
        try { size = Buffer.byteLength(JSON.stringify(incoming.value)); } catch { rejected.push({ key, reason: 'unserialisable' }); continue; }
        if (size > MAX_SECTION_BYTES) { rejected.push({ key, reason: 'section_too_large', size }); continue; }
        const existing = doc.sections[key];
        const hash = hashValue(incoming.value);
        if (existing && (existing.hash === hash || deepEqual(existing.value, incoming.value))) continue;
        if (!existing && !(key in doc.sections) && Object.keys(doc.sections).length >= MAX_SECTIONS) {
          rejected.push({ key, reason: 'too_many_sections' });
          continue;
        }
        if (!existing && bytes + size > MAX_ACCOUNT_BYTES) {
          rejected.push({ key, reason: 'account_quota_exceeded' });
          continue;
        }
        const updatedAt = clampString(incoming.updatedAt, 40) || nowIso();
        doc.sections[key] = { value: incoming.value, hash, updatedAt, deviceId };
        bytes += size;
        applied.push(key);
      }

      for (const key of deletions) {
        if (typeof key !== 'string' || !SECTION_KEY_RE.test(key)) continue;
        if (doc.sections[key]) { delete doc.sections[key]; applied.push(`-${key}`); }
      }

      if (!applied.length) {
        await store.saveUser(user);
        return send(res, 200, {
          version: doc.version, updatedAt: doc.updatedAt, sections: sectionMeta(doc),
          applied: [], rejected, unchanged: true,
        });
      }

      doc.version = (doc.version ?? 0) + 1;
      doc.updatedAt = nowIso();
      user.updatedAt = doc.updatedAt;
      addRevision(user, deviceId, applied.map(k => k.replace(/^-/, '')));
      await store.saveUser(user);
      return send(res, 200, {
        version: doc.version, updatedAt: doc.updatedAt, sections: sectionMeta(doc),
        applied, rejected, unchanged: false,
      });
    }

    if (route === '/v1/sync/revisions' && method === 'GET') {
      const revisions = (user.doc?.revisions ?? []).map(r => {
        let bytes = 0;
        try { bytes = Buffer.byteLength(JSON.stringify(r.snapshot ?? {})); } catch { /* ignore */ }
        return { version: r.version, at: r.at, deviceId: r.deviceId, keys: r.keys, bytes };
      }).reverse();
      return send(res, 200, { revisions, currentVersion: user.doc?.version ?? 0 });
    }

    if (route === '/v1/sync/restore' && method === 'POST') {
      const body = await readJson(req);
      const version = Math.trunc(Number(body.version));
      const revision = (user.doc?.revisions ?? []).find(r => r.version === version);
      if (!revision) throw new ApiError(404, 'revision_not_found', 'That restore point is no longer available.');
      const doc = user.doc;
      const now = nowIso();
      const nextSections = {};
      for (const [key, value] of Object.entries(revision.snapshot ?? {})) {
        nextSections[key] = { value, hash: hashValue(value), updatedAt: now, deviceId };
      }
      doc.sections = nextSections;
      doc.version = (doc.version ?? 0) + 1;
      doc.updatedAt = now;
      addRevision(user, deviceId, Object.keys(nextSections));
      await store.saveUser(user, { immediate: true });
      return send(res, 200, { ok: true, restoredFrom: version, ...docPayload(user) });
    }

    if (route === '/v1/sync' && method === 'DELETE') {
      const body = await readJson(req);
      if (String(body.confirm ?? '') !== 'DELETE') {
        throw new ApiError(400, 'confirmation_required', 'Send { "confirm": "DELETE" } to wipe the cloud copy.');
      }
      const doc = user.doc;
      doc.sections = {};
      doc.version = (doc.version ?? 0) + 1;
      doc.updatedAt = nowIso();
      addRevision(user, deviceId, []);
      await store.saveUser(user, { immediate: true });
      return send(res, 200, { ok: true, ...docPayload(user) });
    }

    throw new ApiError(404, 'not_found', 'Unknown endpoint.');
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err instanceof ApiError ? err.status : err instanceof StoreError ? err.status : 500;
      const code = err instanceof ApiError ? err.code : err instanceof StoreError ? err.code : 'server_error';
      if (status >= 500) console.error('[api]', err);
      const body = {
        error: {
          code,
          message: status >= 500 ? 'Something went wrong on the server. Please try again.' : err.message,
          ...(err?.extra ?? {}),
        },
      };
      try { send(res, status, body); } catch { /* socket already closed */ }
    });
  });

  server.on('clientError', (_err, socket) => {
    try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch { /* ignore */ }
  });

  return {
    server,
    store,
    async close() {
      await store.flush();
      limiter.stop();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

// Guard so importing this module in tests does not start a listener.
const isEntry = (() => {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
  } catch { return false; }
})();

if (isEntry) {
  const port = toInt(process.env.PORT, 8787);
  const host = process.env.HOST || '0.0.0.0';
  const app = await createApp();
  app.server.listen(port, host, () => {
    console.log(`☁️  RJ Tracker sync server listening on http://${host}:${port}`);
    console.log(`    data: ${path.resolve(process.env.DATA_DIR ?? path.join(__dirname, 'data'))}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} — flushing accounts…`);
    try { await app.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

export { ApiError };
