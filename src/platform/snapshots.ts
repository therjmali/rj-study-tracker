/**
 * Automatic safety snapshots.
 *
 * Once a day (when the app is opened and data changed) the student's data is copied
 * into IndexedDB; the last 7 are kept. They can be restored from Settings → AI & Device,
 * which protects against accidental deletes, bad imports and "reset" mistakes.
 */
import { STORE, idbDelete, idbGet, idbGetAllEntries, idbPut } from './idb';
import { allEntries } from './storage';

export interface SnapshotMeta { id: string; date: string; createdAt: string; bytes: number; subjects: number; topics: number }
interface Snapshot extends SnapshotMeta { data: Record<string, string> }

const PREFIX = 'snap:';
const KEEP = 7;
// Never snapshot secrets or transient UI flags.
const EXCLUDE = /^(rj-ai-settings|rj-local-profile|rj-sw-)/;

function isAppKey(k: string) { return /^(nursing-|nursetrack-|rj-)/.test(k) && !EXCLUDE.test(k); }

function summarise(data: Record<string, string>): { subjects: number; topics: number } {
  try {
    const st = JSON.parse(data['nursing-tracker-v6'] ?? '{}');
    const subs = Array.isArray(st.subjects) ? st.subjects : [];
    return { subjects: subs.length, topics: subs.reduce((a: number, s: any) => a + (s.units || []).reduce((b: number, u: any) => b + (u.subTopics?.length || 0), 0), 0) };
  } catch { return { subjects: 0, topics: 0 }; }
}

export function currentData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [k, v] of allEntries()) if (isAppKey(k)) data[k] = v;
  return data;
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const rows = await idbGetAllEntries(STORE.kv);
  return rows
    .filter(([k]) => typeof k === 'string' && k.startsWith(PREFIX))
    .map(([, v]) => { const { data: _d, ...meta } = v as Snapshot; return meta as SnapshotMeta; })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createSnapshot(force = false): Promise<SnapshotMeta | null> {
  const data = currentData();
  const { subjects, topics } = summarise(data);
  if (!force && subjects === 0) return null; // nothing worth protecting yet
  const date = new Date().toISOString().slice(0, 10);
  const id = force ? `${date}-${Date.now().toString(36)}` : date;
  const json = JSON.stringify(data);

  if (!force) {
    const prev = await idbGet<Snapshot>(STORE.kv, PREFIX + id);
    if (prev && prev.bytes === json.length) return null; // unchanged today
  }
  const snap: Snapshot = { id, date, createdAt: new Date().toISOString(), bytes: json.length, subjects, topics, data };
  await idbPut(STORE.kv, snap, PREFIX + id);

  const all = await listSnapshots();
  for (const old of all.slice(KEEP)) await idbDelete(STORE.kv, PREFIX + old.id);
  return snap;
}

export async function restoreSnapshot(id: string): Promise<boolean> {
  const snap = await idbGet<Snapshot>(STORE.kv, PREFIX + id);
  if (!snap) return false;
  await createSnapshot(true); // keep a copy of what is being replaced
  for (const k of Object.keys(currentData())) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(snap.data)) localStorage.setItem(k, v);
  return true;
}

export async function deleteSnapshot(id: string) { await idbDelete(STORE.kv, PREFIX + id); }

/** Fire-and-forget daily snapshot shortly after launch. */
export function scheduleDailySnapshot() {
  setTimeout(() => { void createSnapshot().catch(() => undefined); }, 8000);
}
