/**
 * The sync contract: exactly which on-device keys travel to the cloud.
 *
 * Everything else stays on this device on purpose — AI provider keys, the
 * cached AI chat, install hints, UI filter selections, generated file blobs and
 * the local display profile (which is derived from the account instead).
 */
import { STORE, idbGet, idbPut, idbDelete } from '../idb';
import { stableStringify } from './merge3';

export type SectionGroup = 'study' | 'progress' | 'content' | 'preferences';

export interface SyncSectionDef {
  key: string;
  label: string;
  group: SectionGroup;
  /** How the localStorage string maps to a JSON value. */
  type: 'json' | 'string';
}

export const SYNC_SECTIONS: SyncSectionDef[] = [
  { key: 'nursing-tracker-v6', label: 'Syllabus, daily logs & folders', group: 'study', type: 'json' },
  { key: 'nursing-dbsessions-v1', label: 'Study sessions', group: 'study', type: 'json' },
  { key: 'nursetrack-todos', label: 'To-do lists', group: 'study', type: 'json' },
  { key: 'nursetrack-calendar-notes', label: 'Calendar notes', group: 'study', type: 'json' },
  { key: 'nursing-reminders-v1', label: 'Reminders', group: 'study', type: 'json' },
  { key: 'nursing-settings-v2', label: 'App settings & targets', group: 'preferences', type: 'json' },
  { key: 'nursetrack-excluded-subjects', label: 'Excluded subjects', group: 'preferences', type: 'json' },
  { key: 'nursetrack-ticker-prefs', label: 'Dashboard ticker preferences', group: 'preferences', type: 'json' },
  { key: 'nursing-gamification-v2', label: 'Achievements & XP', group: 'progress', type: 'json' },
  { key: 'nursing-store-v1', label: 'Reward store', group: 'progress', type: 'json' },
  { key: 'nursing-coins-v1', label: 'Coins', group: 'progress', type: 'json' },
  { key: 'nursing-history-v1', label: 'Activity history', group: 'content', type: 'json' },
  { key: 'nursing-trash-v1', label: 'Trash', group: 'content', type: 'json' },
  { key: 'nursetrack-avatar', label: 'Profile photo', group: 'preferences', type: 'string' },
  { key: 'nursetrack-cover-gradient', label: 'Profile cover', group: 'preferences', type: 'string' },
];

export const SYNC_SECTION_MAP: Record<string, SyncSectionDef> = Object.fromEntries(
  SYNC_SECTIONS.map(def => [def.key, def]),
);

/** Keys that must never leave the device — used by the privacy copy and audits. */
export const DEVICE_ONLY_KEYS = [
  'AI provider keys',
  'AI chat history',
  'Your display profile on this device',
  'Uploaded attachments & generated files',
  'UI filters, tab state and onboarding flags',
  'Automatic-backup settings for this device',
];

const META_KEY = 'rj-cloud-syncmeta-v1';
const BASE_IDB_KEY = 'cloud-base-v1';

export interface SyncMeta {
  userId: string | null;
  endpoint: string;
  version: number;
  /** Server-computed hash per section, as last confirmed by the server. */
  serverHashes: Record<string, string>;
  /** Local content fingerprint per section, as last pushed/pulled. */
  localFingerprints: Record<string, string>;
  lastSyncAt: string | null;
  lastError: string | null;
  firstSyncDecision: 'merge' | 'cloud' | 'device' | null;
}

export const EMPTY_META: SyncMeta = {
  userId: null,
  endpoint: '',
  version: 0,
  serverHashes: {},
  localFingerprints: {},
  lastSyncAt: null,
  lastError: null,
  firstSyncDecision: null,
};

export function loadMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return { ...EMPTY_META };
    const parsed = JSON.parse(raw);
    return {
      ...EMPTY_META,
      ...parsed,
      serverHashes: parsed?.serverHashes && typeof parsed.serverHashes === 'object' ? parsed.serverHashes : {},
      localFingerprints: parsed?.localFingerprints && typeof parsed.localFingerprints === 'object' ? parsed.localFingerprints : {},
      version: Number(parsed?.version) || 0,
    };
  } catch {
    return { ...EMPTY_META };
  }
}

export function saveMeta(meta: SyncMeta): void {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
}

export function clearMeta(): void {
  try { localStorage.removeItem(META_KEY); } catch { /* ignore */ }
}

/* ── reading / writing sections ─────────────────────────────────────── */

export function readSectionValue(def: SyncSectionDef): unknown | undefined {
  let raw: string | null = null;
  try { raw = localStorage.getItem(def.key); } catch { return undefined; }
  if (raw === null) return undefined;
  if (def.type === 'string') return raw;
  try { return JSON.parse(raw); } catch { return undefined; }
}

export function writeSectionValue(def: SyncSectionDef, value: unknown): void {
  try {
    if (def.type === 'string') localStorage.setItem(def.key, String(value ?? ''));
    else localStorage.setItem(def.key, JSON.stringify(value));
  } catch { /* quota: the storage engine already mirrors to IndexedDB */ }
}

export function removeSectionValue(def: SyncSectionDef): void {
  try { localStorage.removeItem(def.key); } catch { /* ignore */ }
}

export function readAllLocalSections(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of SYNC_SECTIONS) {
    const value = readSectionValue(def);
    if (value !== undefined) out[def.key] = value;
  }
  return out;
}

/* ── fast local fingerprint (change detection only) ─────────────────── */

/** cyrb53 — 53-bit string hash, plenty for "did this key change?". */
export function fingerprint(value: unknown): string {
  const str = typeof value === 'string' ? `s:${value}` : `j:${stableStringify(value)}`;
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* ── last-synced base snapshot (IndexedDB, never doubles localStorage) ── */

type BaseSnapshot = Record<string, unknown>;

let baseCache: BaseSnapshot | null = null;

export async function loadBase(): Promise<BaseSnapshot> {
  if (baseCache) return baseCache;
  try {
    const stored = await idbGet<BaseSnapshot>(STORE.kv, BASE_IDB_KEY);
    baseCache = stored && typeof stored === 'object' ? stored : {};
  } catch {
    baseCache = {};
  }
  return baseCache;
}

export async function saveBase(base: BaseSnapshot): Promise<void> {
  baseCache = base;
  try { await idbPut(STORE.kv, base, BASE_IDB_KEY); } catch { /* ignore */ }
}

export async function clearBase(): Promise<void> {
  baseCache = {};
  try { await idbDelete(STORE.kv, BASE_IDB_KEY); } catch { /* ignore */ }
}

/* ── diagnostics ────────────────────────────────────────────────────── */

export function sectionStats(): Array<{ key: string; label: string; group: SectionGroup; bytes: number; present: boolean }> {
  return SYNC_SECTIONS.map(def => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(def.key); } catch { /* ignore */ }
    return {
      key: def.key,
      label: def.label,
      group: def.group,
      bytes: raw ? new Blob([raw]).size : 0,
      present: raw !== null,
    };
  });
}

export function totalLocalBytes(): number {
  return sectionStats().reduce((sum, s) => sum + s.bytes, 0);
}
