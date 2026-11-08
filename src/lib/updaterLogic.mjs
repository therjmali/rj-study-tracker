/** Pure update logic: version comparison, release-asset picking and safety checks (unit-tested). */

/** "v18.4.0" / "18.4.0-beta.1" → { nums:[18,4,0], pre:'beta.1' } or null. */
export function parseVersion(input) {
  const m = /^\s*v?(\d+)\.(\d+)(?:\.(\d+))?(?:[-+]([0-9A-Za-z.-]+))?\s*$/.exec(String(input ?? ''));
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)], pre: m[4] && !String(input).includes('+') ? m[4] : '' };
}

/** -1 if a < b, 0 if equal, 1 if a > b. A pre-release is older than the same release. Unparseable → 0 (never nag). */
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/** "sha256:ABC…" → "abc…" (64 hex) or null. */
export function normalizeDigest(d) {
  const m = /^(?:sha256:)?([0-9a-fA-F]{64})$/.exec(String(d ?? '').trim());
  return m ? m[1].toLowerCase() : null;
}

/** Pick the installable APK from a GitHub release's assets. */
export function pickApkAsset(assets) {
  const apks = (Array.isArray(assets) ? assets : []).filter(a => /\.apk$/i.test(a?.name ?? '') && !/debug|unsigned/i.test(a.name));
  if (!apks.length) return null;
  const best = apks.find(a => /RJ[-_ ]?Tracker/i.test(a.name)) ?? apks[0];
  return {
    name: best.name,
    url: best.browser_download_url ?? '',
    size: Number(best.size) || null,
    sha256: normalizeDigest(best.digest),
  };
}

/** Only ever download updates from this project's own GitHub releases, over HTTPS. */
export function isTrustedDownloadUrl(url, owner, repo) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'github.com'
      && u.pathname.startsWith(`/${owner}/${repo}/releases/download/`);
  } catch { return false; }
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n == null || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const AUTO_CHECK_INTERVAL_MS = 6 * 3600 * 1000;
export function shouldAutoCheck(lastCheckedAt, now = Date.now(), interval = AUTO_CHECK_INTERVAL_MS) {
  return !lastCheckedAt || !Number.isFinite(lastCheckedAt) || now - lastCheckedAt >= interval || lastCheckedAt > now;
}

/** Release notes → a short, plain-text-ish summary for the update card (drops the boilerplate intro, keeps headings/bullets). */
export function summarizeNotes(body, maxLines = 14) {
  const lines = String(body ?? '').replace(/\r/g, '').split('\n').map(l => l.trimEnd());
  const start = lines.findIndex(l => /^#{2,3}\s*what'?s new/i.test(l));
  const useful = (start >= 0 ? lines.slice(start + 1) : lines).filter(l => l.trim() !== '');
  return useful.slice(0, maxLines).join('\n');
}
