/**
 * Backup format v8 ("exact A–Z"): every stored value is kept as the byte-for-byte string the app
 * holds in localStorage (`raw`), next to a manifest with a SHA-256 per entry and one overall
 * checksum. Restoring writes those exact strings back, so nothing is re-encoded, re-ordered or
 * silently dropped — and a damaged or hand-edited file is detected before it touches your data.
 */
import { sha256Hex, byteLength } from '../lib/hash';
import { CATALOG_MAP, readRaw, backupEntries } from './dataCatalog';

export const BACKUP_VERSION = 'v8-exact-az';
export const BACKUP_FORMAT = 'rj-tracker-backup';

export interface ManifestEntry { key: string; label: string; scope: string; type: string; bytes: number; sha256: string }
export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: 8;
  createdAt: string;
  app: string;
  source: 'device' | 'cloud';
  includesSecrets: boolean;
  entryCount: number;
  totalBytes: number;
  checksum: string;
  entries: ManifestEntry[];
}

async function overallChecksum(entries: Array<Pick<ManifestEntry, 'key' | 'sha256'>>): Promise<string> {
  const lines = [...entries].sort((a, b) => a.key.localeCompare(b.key)).map(e => `${e.key}\n${e.sha256}`).join('\n');
  return sha256Hex(lines);
}

/** Read every catalogued key from this device, exactly as stored. */
export function collectDeviceRaw(includeSecrets: boolean): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const entry of backupEntries(includeSecrets)) {
    const value = readRaw(entry.key);
    if (value !== null) raw[entry.key] = value;
  }
  return raw;
}

export async function buildManifest(
  raw: Record<string, string>,
  opts: { app: string; source: 'device' | 'cloud'; includesSecrets: boolean },
): Promise<BackupManifest> {
  const entries: ManifestEntry[] = [];
  for (const key of Object.keys(raw).sort()) {
    const meta = CATALOG_MAP[key];
    entries.push({
      key, label: meta?.label ?? key, scope: meta?.scope ?? 'device', type: meta?.type ?? 'json',
      bytes: byteLength(raw[key]), sha256: await sha256Hex(raw[key]),
    });
  }
  return {
    format: BACKUP_FORMAT, version: 8, createdAt: new Date().toISOString(), app: opts.app, source: opts.source,
    includesSecrets: opts.includesSecrets, entryCount: entries.length,
    totalBytes: entries.reduce((a, e) => a + e.bytes, 0), checksum: await overallChecksum(entries), entries,
  };
}

export interface IntegrityReport {
  level: 'verified' | 'failed' | 'none';
  checked: number;
  problems: string[];
}

/** Re-computes every hash in a backup document and compares it with the manifest. */
export async function verifyBackupDocument(doc: any): Promise<IntegrityReport> {
  const raw = doc?.raw as Record<string, unknown> | undefined;
  const manifest = doc?._manifest as BackupManifest | undefined;
  if (!raw || typeof raw !== 'object' || !manifest || !Array.isArray(manifest.entries)) {
    return { level: 'none', checked: 0, problems: ['This is an older backup without integrity data.'] };
  }
  const problems: string[] = [];
  const byKey = new Map(manifest.entries.map(e => [e.key, e]));
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') { problems.push(`${key}: value is not text`); continue; }
    const m = byKey.get(key);
    if (!m) { problems.push(`${key}: not listed in the manifest`); continue; }
    if (byteLength(value) !== m.bytes) problems.push(`${key}: size differs from the manifest`);
    if ((await sha256Hex(value)) !== m.sha256) problems.push(`${key}: content was modified or damaged`);
  }
  for (const key of byKey.keys()) if (!(key in raw)) problems.push(`${key}: listed in the manifest but missing`);
  const rebuilt = await overallChecksum(manifest.entries);
  if (rebuilt !== manifest.checksum) problems.push('Overall checksum does not match');
  return { level: problems.length ? 'failed' : 'verified', checked: Object.keys(raw).length, problems };
}
