import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, compareVersions, normalizeDigest, pickApkAsset, isTrustedDownloadUrl, formatBytes, shouldAutoCheck, summarizeNotes } from '../src/lib/updaterLogic.mjs';

test('version parsing and comparison', () => {
  assert.deepEqual(parseVersion('v18.4.0').nums, [18, 4, 0]);
  assert.equal(parseVersion('nonsense'), null);
  assert.equal(compareVersions('v18.5.0', '18.4.0'), 1);
  assert.equal(compareVersions('18.4.0', 'v18.4.0'), 0);
  assert.equal(compareVersions('18.4.0', '18.10.0'), -1);       // numeric, not lexical
  assert.equal(compareVersions('19.0.0', '18.99.99'), 1);
  assert.equal(compareVersions('18.5.0-beta.1', '18.5.0'), -1); // pre-release is older
  assert.equal(compareVersions('garbage', '18.5.0'), 0);        // never nag on unparseable input
  assert.equal(compareVersions('18.5', '18.5.0'), 0);
});

test('digest normalisation', () => {
  const h = 'a'.repeat(64);
  assert.equal(normalizeDigest(`sha256:${h.toUpperCase()}`), h);
  assert.equal(normalizeDigest(h), h);
  assert.equal(normalizeDigest('sha1:abc'), null);
  assert.equal(normalizeDigest(undefined), null);
});

test('pick the release APK, never a debug/unsigned one', () => {
  const a = pickApkAsset([
    { name: 'notes.txt', browser_download_url: 'x' },
    { name: 'app-debug.apk', browser_download_url: 'd' },
    { name: 'RJ-Tracker-Pro-v18.5.0-build24.apk', browser_download_url: 'https://github.com/o/r/releases/download/v18.5.0/x.apk', size: 5_000_000, digest: 'sha256:' + 'b'.repeat(64) },
  ]);
  assert.equal(a.name, 'RJ-Tracker-Pro-v18.5.0-build24.apk');
  assert.equal(a.size, 5_000_000);
  assert.equal(a.sha256, 'b'.repeat(64));
  assert.equal(pickApkAsset([{ name: 'a.zip' }]), null);
  assert.equal(pickApkAsset(undefined), null);
});

test('only this project’s GitHub release downloads are trusted', () => {
  const ok = 'https://github.com/therjmali/rj-study-tracker/releases/download/v1/x.apk';
  assert.equal(isTrustedDownloadUrl(ok, 'therjmali', 'rj-study-tracker'), true);
  assert.equal(isTrustedDownloadUrl(ok.replace('https', 'http'), 'therjmali', 'rj-study-tracker'), false);
  assert.equal(isTrustedDownloadUrl('https://evil.com/therjmali/rj-study-tracker/releases/download/v1/x.apk', 'therjmali', 'rj-study-tracker'), false);
  assert.equal(isTrustedDownloadUrl('https://github.com/other/repo/releases/download/v1/x.apk', 'therjmali', 'rj-study-tracker'), false);
  assert.equal(isTrustedDownloadUrl('https://github.com.evil.com/therjmali/rj-study-tracker/releases/download/v1/x.apk', 'therjmali', 'rj-study-tracker'), false);
  assert.equal(isTrustedDownloadUrl('not a url', 'a', 'b'), false);
});

test('formatting, auto-check cadence and notes summary', () => {
  assert.equal(formatBytes(5_043_210), '4.8 MB');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(null), '—');
  const now = 1_800_000_000_000;
  assert.equal(shouldAutoCheck(null, now), true);
  assert.equal(shouldAutoCheck(now - 60_000, now), false);
  assert.equal(shouldAutoCheck(now - 7 * 3600_000, now), true);
  assert.equal(shouldAutoCheck(now + 5000, now), true); // clock went backwards
  const s = summarizeNotes('intro\n\n## What\'s new\n\n- one\n- two\n');
  assert.equal(s, '- one\n- two');
  assert.equal(summarizeNotes('', 5), '');
});
