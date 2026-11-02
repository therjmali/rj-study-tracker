/**
 * First-login migration safety net.
 *
 * The migration itself is the sync engine's first run for an account: sections that
 * exist only on the device are uploaded; if the cloud already has data the user is
 * asked once (Merge both · Use cloud · Use device). This file adds two guarantees:
 *
 *   1. BEFORE anything is merged or uploaded, an untouched copy of the on-device
 *      data is written to IndexedDB (once per account, never overwritten).
 *   2. AFTER the upload, the engine verifies every on-device section reached the
 *      cloud and records that here.
 *
 * If anything ever looks wrong, `readPreMigrationBackup()` returns the original data.
 */
import { STORE, idbGet, idbPut } from '../idb';

const key = (userId: string) => `pre-cloud-backup-v1:${userId}`;

export interface PreMigrationBackup {
  userId: string;
  createdAt: string;
  verifiedAt: string | null;
  sections: Record<string, unknown>;
}

export async function readPreMigrationBackup(userId: string): Promise<PreMigrationBackup | null> {
  try { return (await idbGet<PreMigrationBackup>(STORE.kv, key(userId))) ?? null; } catch { return null; }
}

export async function createPreMigrationBackup(userId: string, sections: Record<string, unknown>): Promise<void> {
  try {
    if (await readPreMigrationBackup(userId)) return;            // never overwrite the original copy
    await idbPut(STORE.kv, { userId, createdAt: new Date().toISOString(), verifiedAt: null, sections } satisfies PreMigrationBackup, key(userId));
  } catch { /* IndexedDB unavailable: the sync itself still never deletes local data first */ }
}

export async function markMigrationVerified(userId: string): Promise<void> {
  try {
    const existing = await readPreMigrationBackup(userId);
    if (existing && !existing.verifiedAt) await idbPut(STORE.kv, { ...existing, verifiedAt: new Date().toISOString() }, key(userId));
  } catch { /* ignore */ }
}
