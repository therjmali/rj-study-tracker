/**
 * Exact restore for v8 backups.
 *
 * Safety order: verify integrity → take a safety snapshot of today's data → block the app's own
 * debounced writes → write the exact stored strings → read every key back and compare → persist the
 * IndexedDB mirror → (optionally) replace the cloud copy. The caller then reloads the app so every
 * screen starts from the restored data.
 *
 * Only keys listed in the data catalog can be written: a backup file can never overwrite sign-in
 * tokens, sync bookkeeping or other security-relevant keys.
 */
import { CATALOG_MAP, DATA_CATALOG, readRaw } from './dataCatalog';
import { verifyBackupDocument, type IntegrityReport } from './backupFormat';
import { createSnapshot } from './snapshots';
import { setSyncWriteGuard } from './cloud/changeBus';
import { flushMirror } from './storage';
import { importFiles, rewriteVirtualUrls } from './files';
import { getSession } from './cloud/session';
import { pushDeviceOverCloud } from './cloud/syncEngine';
import { flushAllLocalStorage } from '../hooks/useLocalStorage';

export interface RestoreOptions {
  /** overwrite: only the keys present in the file · replace: also clear catalogued keys the file does not have */
  mode: 'overwrite' | 'replace';
  includeSecrets: boolean;
  replaceCloud: boolean;
}

export interface RestoreReport {
  ok: boolean;
  restored: string[];
  removed: string[];
  skipped: string[];
  mismatches: string[];
  integrity: IntegrityReport;
  snapshotId: string | null;
  cloudUpdated: boolean | null;
}

export function isExactBackup(doc: any): boolean {
  return !!doc && typeof doc === 'object' && !!doc.raw && typeof doc.raw === 'object'
    && typeof doc._backupVersion === 'string' && doc._backupVersion.startsWith('v8');
}

export interface BackupSummary {
  createdAt: string | null;
  source: 'device' | 'cloud';
  app: string;
  entries: number;
  bytes: number;
  subjects: number;
  topics: number;
  hasSecrets: boolean;
  files: number;
}

export function summariseBackup(doc: any): BackupSummary {
  let subjects = 0; let topics = 0;
  try {
    const tracker = JSON.parse(doc.raw['nursing-tracker-v6'] ?? '{}');
    const subs: any[] = Array.isArray(tracker.subjects) ? tracker.subjects : [];
    subjects = subs.length;
    topics = subs.reduce((a, s) => a + (s.units || []).reduce((b: number, u: any) => b + (u.subTopics?.length || 0), 0), 0);
  } catch { /* leave zero */ }
  return {
    createdAt: doc._manifest?.createdAt ?? doc._exportedAt ?? null,
    source: doc._manifest?.source === 'cloud' ? 'cloud' : 'device',
    app: doc._manifest?.app ?? doc._app ?? 'RJ Tracker',
    entries: Object.keys(doc.raw).length,
    bytes: doc._manifest?.totalBytes ?? 0,
    subjects, topics,
    hasSecrets: 'rj-ai-settings-v1' in doc.raw,
    files: Array.isArray(doc.files) ? doc.files.length : 0,
  };
}

export async function restoreExact(doc: any, options: RestoreOptions): Promise<RestoreReport> {
  const integrity = await verifyBackupDocument(doc);
  const report: RestoreReport = { ok: false, restored: [], removed: [], skipped: [], mismatches: [], integrity, snapshotId: null, cloudUpdated: null };
  if (integrity.level === 'failed') {
    throw new Error(`This backup failed its integrity check (${integrity.problems[0]}). Nothing was changed.`);
  }

  // 1. Safety net first: today's data can always be brought back from Settings → AI & Device → snapshots.
  flushAllLocalStorage();
  try { report.snapshotId = (await createSnapshot(true))?.id ?? null; } catch { /* snapshot is best-effort */ }

  // 2. Stop the app's own debounced writes from racing the restore.
  setSyncWriteGuard(true);
  try {
    // Integrity was checked on the untouched file; attachment links are re-based to this install afterwards.
    const raw: Record<string, unknown> = Object.fromEntries(
      Object.entries(doc.raw as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'string' ? rewriteVirtualUrls(v) : v]),
    );
    for (const [key, value] of Object.entries(raw)) {
      const entry = CATALOG_MAP[key];
      if (!entry || typeof value !== 'string' || (entry.scope === 'secret' && !options.includeSecrets)) { report.skipped.push(key); continue; }
      try { localStorage.setItem(key, value); report.restored.push(key); } catch { report.mismatches.push(key); }
    }
    if (options.mode === 'replace') {
      for (const entry of DATA_CATALOG) {
        if (entry.scope === 'secret' && !options.includeSecrets) continue;
        if (!(entry.key in raw) && readRaw(entry.key) !== null) {
          try { localStorage.removeItem(entry.key); report.removed.push(entry.key); } catch { report.mismatches.push(entry.key); }
        }
      }
    }
    // 3. Read everything back — a restore is only "done" when the device holds exactly what the file says.
    for (const key of report.restored) if (readRaw(key) !== raw[key]) report.mismatches.push(key);
    for (const key of report.removed) if (readRaw(key) !== null) report.mismatches.push(key);

    if (Array.isArray(doc.files)) { try { await importFiles(doc.files); } catch { /* attachments are best-effort */ } }
    await flushMirror();

    if (options.replaceCloud && getSession()) {
      try { report.cloudUpdated = (await pushDeviceOverCloud()).ok; } catch { report.cloudUpdated = false; }
    }
    report.ok = report.mismatches.length === 0;
    return report;
  } catch (err) {
    setSyncWriteGuard(false);
    throw err;
  }
  // The guard stays on deliberately: the caller reloads the app right after a successful restore.
}
