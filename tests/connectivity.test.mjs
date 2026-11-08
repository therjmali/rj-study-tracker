import test from 'node:test';
import assert from 'node:assert/strict';
import {
  retryDelay, resolveStatus, formatAgo, derivePill, BACKOFF_MS, RECONNECTED_FLASH_MS,
} from '../src/platform/connectivityLogic.mjs';

const NOW = 1_800_000_000_000;

test('retryDelay backs off and caps', () => {
  assert.equal(retryDelay(0), 3000);
  assert.equal(retryDelay(1), 6000);
  assert.equal(retryDelay(99), BACKOFF_MS.at(-1));
  assert.equal(retryDelay(-5), 3000);
  assert.equal(retryDelay(NaN), 3000);
});

test('resolveStatus: device offline always wins, one failed probe is a blip, two is degraded', () => {
  assert.equal(resolveStatus({ navigatorOnline: false, probeOk: true, failures: 0 }), 'offline');
  assert.equal(resolveStatus({ navigatorOnline: true, probeOk: null, failures: 0 }), 'online');
  assert.equal(resolveStatus({ navigatorOnline: true, probeOk: true, failures: 0 }), 'online');
  assert.equal(resolveStatus({ navigatorOnline: true, probeOk: false, failures: 1 }), 'online');
  assert.equal(resolveStatus({ navigatorOnline: true, probeOk: false, failures: 2 }), 'degraded');
});

test('formatAgo', () => {
  assert.equal(formatAgo(NOW - 10_000, NOW), 'just now');
  assert.equal(formatAgo(NOW - 5 * 60_000, NOW), '5 min ago');
  assert.equal(formatAgo(NOW - 3 * 3_600_000, NOW), '3 h ago');
  assert.equal(formatAgo(NOW - 2 * 86_400_000, NOW), '2 d ago');
  assert.equal(formatAgo(null, NOW), '');
  assert.equal(formatAgo(NOW + 60_000, NOW), 'just now'); // clock skew never shows a negative time
});

test('pill: guest sees Local online and Offline offline', () => {
  assert.equal(derivePill({ signedIn: false, status: 'online', nowMs: NOW }).kind, 'local');
  const off = derivePill({ signedIn: false, status: 'offline', nowMs: NOW });
  assert.equal(off.kind, 'offline');
  assert.equal(off.detail, 'Everything is saved on this device');
});

test('pill: offline with unsynced edits says how many wait', () => {
  const p = derivePill({ signedIn: true, status: 'offline', pendingCount: 3, nowMs: NOW });
  assert.equal(p.kind, 'offline');
  assert.match(p.detail, /3 changes will sync/);
  assert.match(derivePill({ signedIn: true, status: 'offline', pendingCount: 1, nowMs: NOW }).detail, /1 change will sync/);
});

test('pill: back-online flash lasts only RECONNECTED_FLASH_MS', () => {
  const during = derivePill({ signedIn: true, status: 'online', phase: 'synced', reconnectedAtMs: NOW - 500, nowMs: NOW });
  assert.equal(during.kind, 'reconnected');
  const after = derivePill({ signedIn: true, status: 'online', phase: 'synced', lastSyncAtMs: NOW - 1000, reconnectedAtMs: NOW - RECONNECTED_FLASH_MS - 1, nowMs: NOW });
  assert.equal(after.kind, 'synced');
});

test('pill: cloud unreachable beats a sync error (the error is just a symptom)', () => {
  const p = derivePill({ signedIn: true, status: 'degraded', phase: 'error', pendingCount: 2, nowMs: NOW });
  assert.equal(p.kind, 'degraded');
  assert.equal(p.busy, true);
});

test('pill: signed-in priority order', () => {
  const base = { signedIn: true, status: 'online', nowMs: NOW, lastSyncAtMs: NOW - 120_000 };
  assert.equal(derivePill({ ...base, phase: 'error' }).kind, 'error');
  assert.equal(derivePill({ ...base, phase: 'syncing' }).kind, 'syncing');
  assert.equal(derivePill({ ...base, phase: 'paused' }).kind, 'paused');
  assert.equal(derivePill({ ...base, phase: 'pending', pendingCount: 4 }).label, '4 to sync');
  assert.equal(derivePill({ ...base, phase: 'idle', pendingCount: 2 }).kind, 'pending');
  const synced = derivePill({ ...base, phase: 'synced' });
  assert.equal(synced.kind, 'synced');
  assert.equal(synced.detail, '2 min ago');
  assert.equal(derivePill({ signedIn: true, status: 'online', phase: 'idle', nowMs: NOW }).kind, 'ready');
});

test('pill: always returns a complete model', () => {
  for (const status of ['online', 'offline', 'degraded']) {
    for (const phase of ['disabled', 'idle', 'paused', 'syncing', 'synced', 'pending', 'offline', 'error']) {
      for (const signedIn of [true, false]) {
        const p = derivePill({ signedIn, status, phase, nowMs: NOW });
        assert.ok(p.kind && p.tone && p.label && typeof p.detail === 'string' && typeof p.busy === 'boolean', `${status}/${phase}/${signedIn}`);
      }
    }
  }
  assert.equal(derivePill(undefined).kind, 'local');
});
