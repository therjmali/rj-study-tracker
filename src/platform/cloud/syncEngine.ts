/**
 * The sync engine.
 *
 * One loop, every 45 seconds and on every meaningful local edit:
 *
 *   pull (only sections that changed)  →  three-way merge  →  push  →  apply
 *
 * Guarantees
 * ----------
 *  • The app never waits for the network: all writes happen locally first and
 *    are pushed from a debounce.
 *  • A failed sync is retried; nothing is dropped.
 *  • Concurrent edits on two devices are merged per subject / unit / topic, and
 *    every unresolved difference is preserved in the conflict list.
 *  • A push can never blind-overwrite another device: it must name the version
 *    it merged against (409 → merge → retry, up to four times).
 */
import { useSyncExternalStore } from 'react';
import { CloudError, request } from './http';
import { getSession } from './session';
import { getCloudAuthState } from './authStore';
import { getCloudEndpoint, isCloudConfigured } from './config';
import { getDeviceIdentity } from './device';
import { onLocalChange, setSyncWriteGuard } from './changeBus';
import { deepEqual, mergeThreeWay, MergeConflict } from './merge3';
import {
  SYNC_SECTION_MAP, SYNC_SECTIONS, SyncMeta,
  clearBase, clearMeta, fingerprint, loadBase, loadMeta, readAllLocalSections,
  removeSectionValue, saveBase, saveMeta, writeSectionValue,
} from './sections';

export type SyncPhase =
  | 'disabled'      // no account / no server
  | 'idle'          // ready, nothing happening
  | 'paused'        // auto-sync off
  | 'syncing'
  | 'synced'
  | 'pending'       // local edits waiting for the next push
  | 'offline'
  | 'error'
  | 'needs-choice'; // first sync against an account that already has data

export interface SyncConflictRecord {
  id: string;
  at: string;
  key: string;
  label: string;
  path: string;
  resolution: 'local' | 'remote';
  localPreview: string;
  remotePreview: string;
  basePreview: string;
  /** Full values, kept only when small enough to be useful in the UI. */
  local?: unknown;
  remote?: unknown;
}

export interface PendingChoice {
  localSections: number;
  remoteSections: number;
  remoteVersion: number;
  remoteUpdatedAt: string | null;
}

export interface SyncState {
  phase: SyncPhase;
  endpoint: string;
  deviceId: string;
  lastSyncAt: string | null;
  lastPushAt: string | null;
  lastReason: string | null;
  version: number;
  pendingKeys: string[];
  conflictCount: number;
  conflicts: SyncConflictRecord[];
  error: string | null;
  online: boolean;
  autoSync: boolean;
  needsChoice: PendingChoice | null;
  dataAppliedAt: string | null;
  appliedKeys: string[];
}

const CONFLICTS_KEY = 'rj-sync-conflicts-v1';
const AUTOSYNC_KEY = 'rj-cloud-autosync-v1';
const POLL_MS = 45_000;
const LOCAL_DEBOUNCE_MS = 2500;
const MAX_CONFLICTS = 40;

interface RemoteDoc {
  version: number;
  updatedAt: string;
  sections: Record<string, { hash: string; updatedAt: string; deviceId?: string | null }>;
  data: Record<string, unknown>;
  changedKeys?: string[];
  bytes?: number;
}

export interface SyncResult {
  ok: boolean;
  reason: string;
  version?: number;
  pushed?: string[];
  pulled?: string[];
  conflicts?: number;
  error?: string;
  skipped?: boolean;
}

/* ── state ──────────────────────────────────────────────────────────── */

function readConflicts(): SyncConflictRecord[] {
  try {
    const raw = localStorage.getItem(CONFLICTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_CONFLICTS) : [];
  } catch { return []; }
}

function readAutoSync(): boolean {
  try { return localStorage.getItem(AUTOSYNC_KEY) !== 'off'; } catch { return true; }
}

const initialMeta = loadMeta();
const initialConflicts = readConflicts();

let state: SyncState = {
  phase: !getSession() ? 'disabled' : readAutoSync() ? 'idle' : 'paused',
  endpoint: getCloudEndpoint(),
  deviceId: getDeviceIdentity().id,
  lastSyncAt: initialMeta.lastSyncAt,
  lastPushAt: null,
  lastReason: null,
  version: initialMeta.version,
  pendingKeys: [],
  conflicts: initialConflicts,
  conflictCount: initialConflicts.length,
  error: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  autoSync: readAutoSync(),
  needsChoice: null,
  dataAppliedAt: null,
  appliedKeys: [],
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    try { listener(); } catch { /* ignore */ }
  }
}

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  emit();
}

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
}

function persistConflicts(conflicts: SyncConflictRecord[]): void {
  const capped = conflicts.slice(0, MAX_CONFLICTS);
  try { localStorage.setItem(CONFLICTS_KEY, JSON.stringify(capped)); } catch { /* ignore */ }
  setState({ conflicts: capped, conflictCount: capped.length });
}

export function clearConflicts(): void {
  persistConflicts([]);
}

/* ── local change detection ─────────────────────────────────────────── */

export function getLocalPendingKeys(): string[] {
  const meta = loadMeta();
  const local = readAllLocalSections();
  const pending: string[] = [];
  for (const def of SYNC_SECTIONS) {
    const value = local[def.key];
    const last = meta.localFingerprints[def.key];
    if (value === undefined) {
      if (last !== undefined) pending.push(def.key);
      continue;
    }
    if (last === undefined || fingerprint(value) !== last) pending.push(def.key);
  }
  return pending;
}

function refreshPending(): void {
  const pending = getLocalPendingKeys();
  setState({ pendingKeys: pending });
  if (state.phase === 'synced' && pending.length > 0 && state.autoSync) setState({ phase: 'pending' });
}

/* ── helpers ────────────────────────────────────────────────────────── */

function preview(value: unknown): string {
  if (value === undefined) return 'removed';
  if (value === null) return 'empty';
  if (typeof value === 'string') return value.length > 60 ? `${value.slice(0, 57)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.date === 'string') return obj.date;
    if (typeof obj.title === 'string') return String(obj.title);
    return `${Object.keys(obj).length} fields`;
  }
  return String(value);
}

function recordConflicts(key: string, conflicts: MergeConflict[]): SyncConflictRecord[] {
  const def = SYNC_SECTION_MAP[key];
  const at = new Date().toISOString();
  return conflicts.map((conflict, index) => {
    const small = (value: unknown): unknown => {
      try { return JSON.stringify(value ?? null).length <= 2048 ? value : undefined; } catch { return undefined; }
    };
    return {
      id: `${key}:${conflict.path}:${index}:${Date.now()}`,
      at,
      key,
      label: def?.label ?? key,
      path: conflict.path || key,
      resolution: conflict.resolution,
      localPreview: preview(conflict.local),
      remotePreview: preview(conflict.remote),
      basePreview: preview(conflict.base),
      local: small(conflict.local),
      remote: small(conflict.remote),
    };
  });
}

function applySectionsToDevice(target: Record<string, unknown>): string[] {
  const changed: string[] = [];
  setSyncWriteGuard(true);
  try {
    for (const def of SYNC_SECTIONS) {
      const next = target[def.key];
      const currentRaw = (() => { try { return localStorage.getItem(def.key); } catch { return null; } })();
      const current = (() => {
        if (currentRaw === null) return undefined;
        if (def.type === 'string') return currentRaw;
        try { return JSON.parse(currentRaw); } catch { return undefined; }
      })();
      if (next === undefined) {
        if (currentRaw !== null) { removeSectionValue(def); changed.push(def.key); }
        continue;
      }
      if (current !== undefined && fingerprint(current) === fingerprint(next)) continue;
      writeSectionValue(def, next);
      changed.push(def.key);
    }
  } finally {
    setSyncWriteGuard(false);
  }
  return changed;
}

function remoteFromDoc(doc: RemoteDoc, base: Record<string, unknown>): Record<string, unknown> {
  const remote: Record<string, unknown> = { ...base, ...(doc.data ?? {}) };
  for (const key of doc.changedKeys ?? []) {
    if (!(key in (doc.data ?? {}))) delete remote[key];
  }
  return remote;
}

/* ── engine lifecycle ───────────────────────────────────────────────── */

let started = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let localTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribers: Array<() => void> = [];
let running: Promise<SyncResult> | null = null;
let queued = false;
let pendingChoice: { remote: Record<string, unknown>; local: Record<string, unknown>; base: Record<string, unknown>; doc: RemoteDoc } | null = null;

function setOnline(online: boolean): void {
  setState({ online, ...(online ? {} : { phase: getSession() ? 'offline' : 'disabled' }) });
}

export function startSyncEngine(): void {
  if (started) return;
  const session = getSession();
  if (!session) { setState({ phase: 'disabled' }); return; }
  started = true;
  setState({ phase: readAutoSync() ? 'idle' : 'paused', endpoint: getCloudEndpoint(), deviceId: getDeviceIdentity().id, error: null });

  const onVisibility = () => {
    if (document.visibilityState === 'visible' && readAutoSync()) void syncNow('visible');
  };
  const onOnline = () => { setOnline(true); if (readAutoSync()) void syncNow('online'); };
  const onOffline = () => setOnline(false);
  const onLocal = () => {
    refreshPending();
    if (!readAutoSync()) return;
    if (localTimer) clearTimeout(localTimer);
    localTimer = setTimeout(() => { void syncNow('local-change'); }, LOCAL_DEBOUNCE_MS);
  };
  const onEndpointChange = () => setState({ endpoint: getCloudEndpoint() });

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('rj:cloud-endpoint-changed', onEndpointChange);
  unsubscribers.push(onLocalChange(onLocal));
  unsubscribers.push(() => document.removeEventListener('visibilitychange', onVisibility));
  unsubscribers.push(() => window.removeEventListener('online', onOnline));
  unsubscribers.push(() => window.removeEventListener('offline', onOffline));
  unsubscribers.push(() => window.removeEventListener('rj:cloud-endpoint-changed', onEndpointChange));

  pollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (!readAutoSync()) return;
    void syncNow('poll');
  }, POLL_MS);

  refreshPending();
  void syncNow('boot');
}

export function stopSyncEngine(): void {
  started = false;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (localTimer) { clearTimeout(localTimer); localTimer = null; }
  for (const off of unsubscribers) { try { off(); } catch { /* ignore */ } }
  unsubscribers = [];
  queued = false;
  running = null;
  pendingChoice = null;
  setState({ phase: 'disabled', needsChoice: null, pendingKeys: [], error: null });
}

export function setAutoSync(enabled: boolean): void {
  try { localStorage.setItem(AUTOSYNC_KEY, enabled ? 'on' : 'off'); } catch { /* ignore */ }
  setState({ autoSync: enabled, phase: enabled ? (getSession() ? 'idle' : 'disabled') : 'paused' });
  if (enabled && getSession()) void syncNow('auto-sync-enabled');
}

/* ── the sync itself ────────────────────────────────────────────────── */

export function syncNow(reason = 'manual'): Promise<SyncResult> {
  if (running) {
    queued = true;
    return running;
  }
  if (!getSession()) {
    setState({ phase: 'disabled' });
    return Promise.resolve({ ok: false, reason, skipped: true, error: 'Not signed in' });
  }
  if (!isCloudConfigured()) {
    setState({ phase: 'error', error: 'No sync server is configured on this device.' });
    return Promise.resolve({ ok: false, reason, skipped: true, error: 'No sync server configured' });
  }
  running = performSync(reason)
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const phase: SyncPhase = err instanceof CloudError && err.code === 'offline' ? 'offline' : 'error';
      setState({ phase, error: message, lastReason: reason });
      const meta = loadMeta();
      saveMeta({ ...meta, lastError: message });
      return { ok: false, reason, error: message };
    })
    .finally(() => {
      running = null;
      if (queued) {
        queued = false;
        setTimeout(() => { void syncNow('queued'); }, 400);
      }
    });
  return running;
}

async function performSync(reason: string): Promise<SyncResult> {
  const session = getSession();
  if (!session) return { ok: false, reason, skipped: true, error: 'Not signed in' };

  setState({ phase: 'syncing', error: null, lastReason: reason, endpoint: getCloudEndpoint() });

  let meta = loadMeta();
  if (meta.userId && meta.userId !== session.user.id) {
    // A different account signed in on this device: never mix their base data.
    await clearBase();
    clearMeta();
    meta = loadMeta();
  }
  const endpoint = session.endpoint || getCloudEndpoint();
  if (meta.endpoint && meta.endpoint !== endpoint) {
    await clearBase();
    clearMeta();
    meta = loadMeta();
  }

  const base = await loadBase();
  const local = readAllLocalSections();

  const haveParts = SYNC_SECTIONS
    .map(def => (meta.serverHashes[def.key] ? `${def.key}:${meta.serverHashes[def.key]}` : null))
    .filter(Boolean) as string[];
  const have = haveParts.join(',');
  const doc = await request<RemoteDoc>(`/v1/sync${have ? `?have=${encodeURIComponent(have)}` : ''}`);
  const remote = remoteFromDoc(doc, base);

  const localCount = Object.keys(local).length;
  const remoteCount = Object.keys(remote).length;

  const localDiffers = SYNC_SECTIONS.some(def => !deepEqual(local[def.key] ?? null, remote[def.key] ?? null));

  // First contact with an account that already holds data: ask, never guess.
  if (!meta.userId && localCount > 0 && remoteCount > 0 && localDiffers && !meta.firstSyncDecision) {
    pendingChoice = { remote, local, base, doc };
    setState({
      phase: 'needs-choice',
      needsChoice: {
        localSections: localCount,
        remoteSections: remoteCount,
        remoteVersion: doc.version,
        remoteUpdatedAt: doc.updatedAt ?? null,
      },
      version: doc.version,
      lastReason: reason,
    });
    return { ok: false, reason, skipped: true, error: 'Choose how to combine this device with the cloud copy.' };
  }

  const decision = meta.firstSyncDecision ?? (remoteCount === 0 ? 'device' : 'merge');

  let merged: Record<string, unknown> = {};
  const newConflicts: SyncConflictRecord[] = [];

  if (decision === 'cloud') {
    merged = { ...remote };
  } else if (decision === 'device') {
    merged = { ...local };
  } else {
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const b = base[key];
      const l = local[key];
      const r = remote[key];

      if (l === undefined && r === undefined) continue;
      if (l === undefined) {
        // Missing locally: either a deliberate local deletion or a brand-new
        // remote section. If the base still had it, respect the deletion.
        if (b !== undefined) continue;
        merged[key] = r;
        continue;
      }
      if (r === undefined) {
        if (b !== undefined) continue; // remote deleted, local untouched → follow
        merged[key] = l;
        continue;
      }
      if (b !== undefined && deepEqual(b, l)) { merged[key] = r; continue; }
      if (b !== undefined && deepEqual(b, r)) { merged[key] = l; continue; }
      const result = mergeThreeWay(b, l, r, key);
      merged[key] = result.value;
      if (result.conflictCount) newConflicts.push(...recordConflicts(key, result.conflicts));
    }
  }

  // Work out what the server is missing.
  const sections: Record<string, { value: unknown; updatedAt: string }> = {};
  const now = new Date().toISOString();
  for (const def of SYNC_SECTIONS) {
    const value = merged[def.key];
    if (value === undefined) continue;
    const remoteValue = remote[def.key];
    if (decision === 'device' || remoteValue === undefined || fingerprint(value) !== fingerprint(remoteValue)) {
      sections[def.key] = { value, updatedAt: now };
    }
  }
  const deletions = Object.keys(remote).filter(key => merged[key] === undefined && SYNC_SECTION_MAP[key]);

  let version = doc.version;
  let appliedToServer: string[] = [];
  let serverSections = doc.sections ?? {};

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await request<{ version: number; updatedAt: string; sections: RemoteDoc['sections']; applied: string[]; rejected?: Array<{ key: string; reason: string }>; unchanged?: boolean }>('/v1/sync', {
        method: 'POST',
        body: { baseVersion: version, sections, deletions },
      });
      version = res.version;
      serverSections = res.sections ?? serverSections;
      appliedToServer = res.applied ?? [];
      const rejected = res.rejected ?? [];
      if (rejected.length) {
        const first = rejected[0];
        throw new CloudError(`The server rejected "${first.key}" (${first.reason}).`, 'rejected', 400);
      }
      break;
    } catch (err) {
      if (!(err instanceof CloudError) || err.status !== 409 || attempt === 3) throw err;
      // Someone else pushed first — merge their document and retry.
      const details = (err.details ?? {}) as Partial<RemoteDoc>;
      const retryDoc: RemoteDoc = {
        version: Number(details.version) || version + 1,
        updatedAt: String(details.updatedAt ?? new Date().toISOString()),
        sections: details.sections ?? {},
        data: details.data ?? {},
        changedKeys: Object.keys(details.data ?? {}),
      };
      const retryRemote = { ...(details.data ?? retryDoc.data) };
      const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(retryRemote)]);
      const reMerged: Record<string, unknown> = {};
      for (const key of keys) {
        const b = base[key];
        const l = local[key];
        const r = retryRemote[key];
        if (l === undefined && r === undefined) continue;
        if (l === undefined) {
          if (b !== undefined) continue;
          reMerged[key] = r;
          continue;
        }
        if (r === undefined) {
          if (b !== undefined) continue;
          reMerged[key] = l;
          continue;
        }
        if (b !== undefined && deepEqual(b, l)) { reMerged[key] = r; continue; }
        if (b !== undefined && deepEqual(b, r)) { reMerged[key] = l; continue; }
        const result = mergeThreeWay(b, l, r, key);
        reMerged[key] = result.value;
        if (result.conflictCount) newConflicts.push(...recordConflicts(key, result.conflicts));
      }
      merged = reMerged;
      version = retryDoc.version;
      for (const def of SYNC_SECTIONS) {
        const value = merged[def.key];
        if (value === undefined) continue;
        const remoteValue = retryRemote[def.key];
        if (remoteValue === undefined || fingerprint(value) !== fingerprint(remoteValue)) {
          sections[def.key] = { value, updatedAt: now };
        } else {
          delete sections[def.key];
        }
      }
    }
  }

  const appliedKeys = applySectionsToDevice(merged);
  // Between writing merged data and the reload that re-reads it, no debounced
  // React write may land on top of it.
  if (appliedKeys.length) setSyncWriteGuard(true);

  const nextMeta: SyncMeta = {
    ...meta,
    userId: session.user.id,
    endpoint,
    version,
    serverHashes: Object.fromEntries(Object.entries(serverSections).map(([key, section]) => [key, section.hash])),
    localFingerprints: Object.fromEntries(Object.entries(merged).map(([key, value]) => [key, fingerprint(value)])),
    lastSyncAt: new Date().toISOString(),
    lastError: null,
    // The choice is consumed by this sync; later syncs always merge normally.
    firstSyncDecision: null,
  };
  await saveBase(merged);
  saveMeta(nextMeta);

  const allConflicts = [...newConflicts, ...state.conflicts].slice(0, MAX_CONFLICTS);
  if (newConflicts.length) persistConflicts(allConflicts);

  const pushed = appliedToServer.filter(key => !key.startsWith('-'));
  setState({
    phase: 'synced',
    lastSyncAt: nextMeta.lastSyncAt,
    lastPushAt: pushed.length ? nextMeta.lastSyncAt : state.lastPushAt,
    version,
    error: null,
    needsChoice: null,
    pendingKeys: [],
    dataAppliedAt: appliedKeys.length ? nextMeta.lastSyncAt : state.dataAppliedAt,
    appliedKeys,
  });

  if (appliedKeys.length) {
    window.dispatchEvent(new CustomEvent('rj:cloud-data-applied', { detail: { keys: appliedKeys, reason } }));
  }

  return {
    ok: true,
    reason,
    version,
    pushed,
    pulled: appliedKeys,
    conflicts: newConflicts.length,
  };
}

/* ── first-sync choice ──────────────────────────────────────────────── */

export async function resolveFirstSync(choice: 'merge' | 'cloud' | 'device'): Promise<SyncResult> {
  const meta = loadMeta();
  const session = getSession();
  saveMeta({ ...meta, firstSyncDecision: choice, userId: meta.userId ?? session?.user.id ?? null });
  pendingChoice = null;
  setState({ needsChoice: null, phase: 'syncing' });
  return syncNow(`first-sync:${choice}`);
}

/* ── manual, explicit operations ────────────────────────────────────── */

/** Replace everything on this device with the cloud copy. */
export async function pullCloudOverDevice(): Promise<SyncResult> {
  const meta = loadMeta();
  saveMeta({ ...meta, firstSyncDecision: 'cloud' });
  const result = await syncNow('pull-cloud');
  saveMeta({ ...loadMeta(), firstSyncDecision: null });
  return result;
}

/** Replace the cloud copy with this device's data. */
export async function pushDeviceOverCloud(): Promise<SyncResult> {
  const meta = loadMeta();
  saveMeta({ ...meta, firstSyncDecision: 'device' });
  const result = await syncNow('push-device');
  saveMeta({ ...loadMeta(), firstSyncDecision: null });
  return result;
}

/** Forget the last-synced base and re-download every section. */
export async function requestFullPull(): Promise<SyncResult> {
  await clearBase();
  const meta = loadMeta();
  saveMeta({ ...meta, serverHashes: {}, localFingerprints: {} });
  return syncNow('full-refresh');
}

export interface Revision {
  version: number;
  at: string;
  deviceId: string | null;
  keys: string[];
  bytes: number;
}

export async function fetchRevisions(): Promise<Revision[]> {
  const data = await request<{ revisions: Revision[] }>('/v1/sync/revisions');
  return data.revisions;
}

export async function restoreRevision(version: number): Promise<SyncResult> {
  const data = await request<{ version: number; data: Record<string, unknown>; sections: RemoteDoc['sections'] }>('/v1/sync/restore', {
    method: 'POST',
    body: { version },
  });
  const applied = applySectionsToDevice(data.data);
  await saveBase(data.data);
  const meta = loadMeta();
  saveMeta({
    ...meta,
    version: data.version,
    serverHashes: Object.fromEntries(Object.entries(data.sections ?? {}).map(([key, section]) => [key, section.hash])),
    localFingerprints: Object.fromEntries(Object.entries(data.data).map(([key, value]) => [key, fingerprint(value)])),
    lastSyncAt: new Date().toISOString(),
    lastError: null,
    firstSyncDecision: null,
  });
  setState({ phase: 'synced', version: data.version, lastSyncAt: new Date().toISOString(), appliedKeys: applied, dataAppliedAt: new Date().toISOString() });
  if (applied.length) window.dispatchEvent(new CustomEvent('rj:cloud-data-applied', { detail: { keys: applied, reason: 'restore' } }));
  return { ok: true, reason: 'restore', version: data.version, pulled: applied };
}

export async function wipeCloudCopy(): Promise<void> {
  await request('/v1/sync', { method: 'DELETE', body: { confirm: 'DELETE' } });
  await clearBase();
  clearMeta();
  setState({ phase: 'idle', version: 0, lastSyncAt: null, pendingKeys: [], needsChoice: null });
}

/** Called when signing out: local data stays, cloud bookkeeping goes. */
export async function detachCloudAccount(): Promise<void> {
  stopSyncEngine();
  await clearBase();
  clearMeta();
  persistConflicts([]);
  setState({
    phase: 'disabled', needsChoice: null, pendingKeys: [], lastSyncAt: null, version: 0,
    error: null, appliedKeys: [], dataAppliedAt: null,
  });
}

/** Keep the disabled state honest when the account changes without a reload. */
export function refreshEngineForAccount(): void {
  const session = getSession();
  if (!session) {
    stopSyncEngine();
    return;
  }
  const phase = getCloudAuthState().status;
  if (phase === 'signed-in' && !started) startSyncEngine();
  else if (phase !== 'signed-in' && started) stopSyncEngine();
}

// Exported for diagnostics.
export const SYNC_INTERNALS = { POLL_MS, LOCAL_DEBOUNCE_MS };
