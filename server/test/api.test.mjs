/**
 * Integration tests for the sync server — run with `npm run test:server`.
 *
 * They exercise the real HTTP surface (no mocks) against a throwaway data
 * directory, so they also verify persistence, token rotation and the
 * optimistic-concurrency rules the client relies on.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createApp } from '../index.mjs';

const run = promisify(execFile);

let app;
let base;
let dataDir;

async function api(pathname, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, json, headers: res.headers };
}

const account = {
  email: `student+${Date.now()}@example.com`,
  password: 'StudyHard2026',
  name: 'Riya Sharma',
  deviceId: 'dev_laptop01',
  deviceName: 'Riya laptop',
  devicePlatform: 'web',
};

let session;

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rj-sync-test-'));
  app = await createApp({ dataDir });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${app.server.address().port}`;
});

after(async () => {
  await app.close();
});

test('health endpoint reports service and never leaks content', async () => {
  const { status, json } = await api('/healthz');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.service, 'rj-sync');
  assert.ok(!('users' in json));
});

test('registration validates email and password strength', async () => {
  const badEmail = await api('/v1/auth/register', { method: 'POST', body: { email: 'nope', password: 'GoodPass123' } });
  assert.equal(badEmail.status, 400);
  assert.equal(badEmail.json.error.code, 'invalid_email');

  const weak = await api('/v1/auth/register', { method: 'POST', body: { email: 'a@b.co', password: 'short' } });
  assert.equal(weak.status, 400);
  assert.equal(weak.json.error.code, 'weak_password');
});

test('register → login → me', async () => {
  const created = await api('/v1/auth/register', { method: 'POST', body: account });
  assert.equal(created.status, 201);
  assert.equal(created.json.user.email, account.email);
  assert.ok(created.json.token);
  assert.ok(created.json.refreshToken);
  session = created.json;

  const duplicate = await api('/v1/auth/register', { method: 'POST', body: account });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.json.error.code, 'email_taken');

  const login = await api('/v1/auth/login', { method: 'POST', body: { email: account.email, password: account.password, deviceId: 'dev_phone' } });
  assert.equal(login.status, 200);

  const wrong = await api('/v1/auth/login', { method: 'POST', body: { email: account.email, password: 'WrongPass123' } });
  assert.equal(wrong.status, 401);

  const me = await api('/v1/me', { token: session.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.name, 'Riya Sharma');
  assert.equal(me.json.devices.length, 2, 'laptop + phone');
  assert.equal(me.json.devices.find(d => d.current).id, 'dev_laptop01');
  assert.equal(me.json.sync.version, 0);
});

test('sync push + incremental pull with have=', async () => {
  const empty = await api('/v1/sync', { token: session.token });
  assert.equal(empty.status, 200);
  assert.equal(empty.json.version, 0);
  assert.deepEqual(empty.json.data, {});

  const state = JSON.stringify({ subjects: [{ id: 's1', name: 'Anatomy', units: [] }] });
  const push = await api('/v1/sync', {
    method: 'POST', token: session.token,
    body: { baseVersion: 0, sections: { 'nursing-tracker-v6': { value: state, updatedAt: new Date().toISOString() } } },
  });
  assert.equal(push.status, 200);
  assert.deepEqual(push.json.applied, ['nursing-tracker-v6']);
  assert.equal(push.json.version, 1);

  const noop = await api('/v1/sync', {
    method: 'POST', token: session.token,
    body: { baseVersion: 1, sections: { 'nursing-tracker-v6': { value: state } } },
  });
  assert.equal(noop.status, 200);
  assert.equal(noop.json.version, 1, 'identical content must not create a new version');
  assert.deepEqual(noop.json.applied, []);

  const pull = await api('/v1/sync', { token: session.token });
  assert.equal(pull.json.data['nursing-tracker-v6'], state);

  const incremental = await api(`/v1/sync?have=${encodeURIComponent(`nursing-tracker-v6:${pull.json.sections['nursing-tracker-v6'].hash}`)}`, { token: session.token });
  assert.equal(incremental.status, 200);
  assert.deepEqual(incremental.json.data, {}, 'nothing changed → no payload');
  assert.deepEqual(incremental.json.changedKeys, []);
});

test('stale baseVersion is rejected with the current document (409)', async () => {
  const phone = await api('/v1/auth/login', { method: 'POST', body: { email: account.email, password: account.password, deviceId: 'dev_phone', deviceName: 'Phone' } });
  assert.equal(phone.status, 200);

  const laptopPush = await api('/v1/sync', {
    method: 'POST', token: session.token,
    body: { baseVersion: 1, sections: { 'nursing-settings-v2': { value: '{"theme":"ink"}' } } },
  });
  assert.equal(laptopPush.status, 200);
  assert.equal(laptopPush.json.version, 2);

  const stale = await api('/v1/sync', {
    method: 'POST', token: phone.json.token,
    body: { baseVersion: 1, sections: { 'nursing-settings-v2': { value: '{"theme":"ancient"}' } } },
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, 'version_conflict');
  assert.equal(stale.json.version, 2);
  assert.equal(stale.json.data['nursing-settings-v2'], '{"theme":"ink"}');

  const merged = await api('/v1/sync', {
    method: 'POST', token: phone.json.token,
    body: { baseVersion: 2, sections: { 'nursing-settings-v2': { value: '{"theme":"ancient"}' } } },
  });
  assert.equal(merged.status, 200);
  assert.equal(merged.json.version, 3);
});

test('section deletions propagate and are restorable', async () => {
  const del = await api('/v1/sync', {
    method: 'POST', token: session.token,
    body: { baseVersion: 3, deletions: ['nursing-tracker-v6'] },
  });
  assert.equal(del.status, 200);
  assert.equal(del.json.version, 4);
  const pull = await api('/v1/sync', { token: session.token });
  assert.ok(!('nursing-tracker-v6' in pull.json.data));

  const revs = await api('/v1/sync/revisions', { token: session.token });
  assert.ok(revs.json.revisions.length >= 1);
  // The newest revision is the deletion itself; pick the one just before it.
  const target = revs.json.revisions.find(r => r.version === 3);
  assert.ok(target, 'the pre-deletion restore point must exist');

  const restore = await api('/v1/sync/restore', { method: 'POST', token: session.token, body: { version: target.version } });
  assert.equal(restore.status, 200);
  assert.equal(restore.json.restoredFrom, target.version);
  assert.ok('nursing-tracker-v6' in restore.json.data);
  assert.equal(restore.json.version, 5);
});

test('devices: list, revoke others, and revoked tokens stop working', async () => {
  const phone = await api('/v1/auth/login', { method: 'POST', body: { email: account.email, password: account.password, deviceId: 'dev_tablet', deviceName: 'Tablet' } });
  const devices = await api('/v1/devices', { token: session.token });
  assert.equal(devices.status, 200);
  assert.ok(devices.json.devices.length >= 2);
  assert.equal(devices.json.devices.find(d => d.current).id, account.deviceId);

  const revoke = await api('/v1/devices/revoke-others', { method: 'POST', token: session.token, body: { keepCurrent: true } });
  assert.equal(revoke.status, 200);
  assert.deepEqual(revoke.json.devices.map(d => d.id), [account.deviceId]);

  const stillWorks = await api('/v1/me', { token: session.token });
  assert.equal(stillWorks.status, 200);

  // Phone cannot refresh any more, and its access token is still valid only
  // until it expires — but its device entry is gone from the account.
  const refresh = await api('/v1/auth/refresh', { method: 'POST', body: { refreshToken: phone.json.refreshToken, deviceId: 'dev_tablet' } });
  assert.equal(refresh.status, 401);
});

test('refresh tokens rotate (replay is rejected)', async () => {
  const login = await api('/v1/auth/login', { method: 'POST', body: { email: account.email, password: account.password, deviceId: 'dev_rotate' } });
  assert.equal(login.status, 200);
  const rotated = await api('/v1/auth/refresh', { method: 'POST', body: { refreshToken: login.json.refreshToken, deviceId: 'dev_rotate' } });
  assert.equal(rotated.status, 200);
  assert.ok(rotated.json.token);
  const replay = await api('/v1/auth/refresh', { method: 'POST', body: { refreshToken: login.json.refreshToken, deviceId: 'dev_rotate' } });
  assert.equal(replay.status, 401);
});

test('expired / tampered access tokens are rejected', async () => {
  const tampered = await api('/v1/me', { token: `${session.token.slice(0, -2)}xx` });
  assert.equal(tampered.status, 401);
  const garbage = await api('/v1/me', { token: 'not-a-token' });
  assert.equal(garbage.status, 401);
});

test('profile update persists', async () => {
  const res = await api('/v1/me', { method: 'PATCH', token: session.token, body: { name: 'Riya S.', avatar: '🎓' } });
  assert.equal(res.status, 200);
  assert.equal(res.json.user.name, 'Riya S.');
  const me = await api('/v1/me', { token: session.token });
  assert.equal(me.json.user.avatar, '🎓');
});

test('changing the password signs out every other session', async () => {
  const oldToken = session.token;
  const changed = await api('/v1/me/password', {
    method: 'POST', token: oldToken,
    body: { currentPassword: account.password, newPassword: 'NewStudy2026' },
  });
  assert.equal(changed.status, 200);
  const revoked = await api('/v1/me', { token: oldToken });
  assert.equal(revoked.status, 401);
  const fresh = await api('/v1/me', { token: changed.json.token });
  assert.equal(fresh.status, 200);
  account.password = 'NewStudy2026';
  session = { ...session, token: changed.json.token, refreshToken: changed.json.refreshToken };
});

test('reset-password.mjs takes effect on a running server', async () => {
  const script = fileURLToPath(new URL('../reset-password.mjs', import.meta.url));
  const next = 'ResetPass2027';
  const out = await run(process.execPath, [script, account.email, next], { env: { ...process.env, DATA_DIR: dataDir } });
  assert.match(out.stdout, /Password updated/);

  // The token minted before the reset must be dead — no restart, no waiting.
  const revoked = await api('/v1/me', { token: session.token });
  assert.equal(revoked.status, 401);

  const oldLogin = await api('/v1/auth/login', { method: 'POST', body: { email: account.email, password: account.password } });
  assert.equal(oldLogin.status, 401);

  const login = await api('/v1/auth/login', {
    method: 'POST',
    body: { email: account.email, password: next, deviceId: account.deviceId, deviceName: account.deviceName },
  });
  assert.equal(login.status, 200);

  session = { token: login.json.token, refreshToken: login.json.refreshToken };
  account.password = next;

  // ...and a later sync write must not resurrect the old hash.
  const push = await api('/v1/sync', { method: 'POST', token: session.token, body: { baseVersion: 0, sections: {} } });
  assert.ok([200, 409].includes(push.status));
  const relogin = await api('/v1/auth/login', { method: 'POST', body: { email: account.email, password: account.password } });
  assert.equal(relogin.status, 200);
});

test('repeated bad logins are throttled', async () => {
  const victim = await api('/v1/auth/register', {
    method: 'POST',
    body: { email: `throttle+${Date.now()}@example.com`, password: 'GoodPass123', deviceId: 'dev_t' },
  });
  assert.equal(victim.status, 201);
  let sawTooMany = false;
  for (let i = 0; i < 12; i++) {
    const res = await api('/v1/auth/login', { method: 'POST', body: { email: `throttle+${victim.json.user.id.slice(-6)}@example.com`, password: 'WrongPass123' } });
    if (res.status === 429) { sawTooMany = true; break; }
  }
  assert.ok(sawTooMany, 'the login failure limiter must kick in');
});

test('CORS preflight is answered', async () => {
  const res = await fetch(`${base}/v1/sync`, { method: 'OPTIONS', headers: { origin: 'https://example.com', 'access-control-request-method': 'POST' } });
  assert.equal(res.status, 204);
  assert.ok(res.headers.get('access-control-allow-origin'));
});

test('deleting the account removes the cloud copy', async () => {
  const del = await api('/v1/account', { method: 'DELETE', token: session.token, body: { password: account.password } });
  assert.equal(del.status, 200);
  assert.equal(del.json.deleted, true);
  const me = await api('/v1/me', { token: session.token });
  assert.equal(me.status, 401);
  const relogin = await api('/v1/auth/login', { method: 'POST', body: { email: account.email, password: account.password } });
  assert.equal(relogin.status, 401);
});
