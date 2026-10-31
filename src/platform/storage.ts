/**
 * Durable storage engine.
 *
 * The app persists nearly everything through `localStorage`, which browsers cap at
 * ~5 MB and may silently evict. This module installs a drop-in replacement for
 * `window.localStorage` that is:
 *
 *   • synchronous (served from memory, so the app code does not change),
 *   • write-through to the real localStorage when the value fits (fast + survives
 *     a crash between ticks),
 *   • mirrored to IndexedDB (large quota, far more durable, restores data if the
 *     browser ever clears localStorage),
 *   • quota-safe: if localStorage rejects a write the value is kept in IndexedDB
 *     instead of being lost silently.
 *
 * Conflict rule at boot: a key present in localStorage wins (it is always at least
 * as fresh as the mirror because writes land there synchronously); a key missing
 * from localStorage is restored from the mirror.
 */
import { STORE, idbApplyBatch, idbAvailable, idbGetAllEntries } from './idb';

const mem = new Map<string, string>();
let realLS: Storage | null = null;
let booted = false;
let idbHealthy = true;
let lastIdbError: string | null = null;

const pending = new Map<string, string | null>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> = Promise.resolve();

function probeLocalStorage(): Storage | null {
  try {
    const ls = window.localStorage;
    const k = '__rj_probe__';
    ls.setItem(k, '1');
    ls.removeItem(k);
    return ls;
  } catch {
    return null;
  }
}

function queue(key: string, value: string | null) {
  if (!idbHealthy) return;
  pending.set(key, value);
  if (flushTimer == null) flushTimer = setTimeout(() => { void flushMirror(); }, 300);
}

export function flushMirror(): Promise<void> {
  if (flushTimer != null) { clearTimeout(flushTimer); flushTimer = null; }
  if (!pending.size) return flushing;
  const batch = Array.from(pending.entries());
  pending.clear();
  flushing = flushing
    .catch(() => undefined)
    .then(() => idbApplyBatch(STORE.mirror, batch))
    .catch((err: unknown) => {
      // Re-queue so a transient failure does not drop data; give up after a hard failure.
      lastIdbError = err instanceof Error ? err.message : String(err);
      for (const [k, v] of batch) if (!pending.has(k)) pending.set(k, v);
      if (flushTimer == null) flushTimer = setTimeout(() => { void flushMirror(); }, 2000);
    });
  return flushing;
}

class DurableStorage implements Storage {
  get length(): number { return mem.size; }
  clear(): void {
    const keys = Array.from(mem.keys());
    mem.clear();
    try { realLS?.clear(); } catch { /* ignore */ }
    for (const k of keys) queue(k, null);
  }
  getItem(key: string): string | null {
    const v = mem.get(String(key));
    return v === undefined ? null : v;
  }
  key(index: number): string | null {
    return Array.from(mem.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    const k = String(key);
    mem.delete(k);
    try { realLS?.removeItem(k); } catch { /* ignore */ }
    queue(k, null);
  }
  setItem(key: string, value: string): void {
    const k = String(key);
    const v = String(value);
    mem.set(k, v);
    if (realLS) {
      try {
        realLS.setItem(k, v);
      } catch {
        // Quota exceeded: keep it only in the IndexedDB mirror so nothing is lost.
        try { realLS.removeItem(k); } catch { /* ignore */ }
      }
    }
    queue(k, v);
  }
  [name: string]: unknown;
}

/** Hydrate memory from localStorage + the IndexedDB mirror, then install the engine. */
export async function bootStorage(timeoutMs = 4000): Promise<void> {
  if (booted) return;
  booted = true;
  realLS = probeLocalStorage();

  // 1. Real localStorage wins.
  if (realLS) {
    try {
      for (let i = 0; i < realLS.length; i++) {
        const k = realLS.key(i);
        if (k != null) { const v = realLS.getItem(k); if (v != null) mem.set(k, v); }
      }
    } catch { /* ignore */ }
  }

  // 2. Restore anything missing from the IndexedDB mirror, seed the mirror with the rest.
  if (idbAvailable()) {
    try {
      const entries = await Promise.race([
        idbGetAllEntries(STORE.mirror),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('IndexedDB timed out')), timeoutMs)),
      ]);
      const inMirror = new Set<string>();
      for (const [k, v] of entries) {
        const key = String(k);
        inMirror.add(key);
        if (!mem.has(key) && typeof v === 'string') {
          mem.set(key, v);
          try { realLS?.setItem(key, v); } catch { /* too big for localStorage: memory + mirror only */ }
        }
      }
      for (const [k, v] of mem) if (!inMirror.has(k)) queue(k, v);
    } catch (err) {
      idbHealthy = false;
      lastIdbError = err instanceof Error ? err.message : String(err);
    }
  } else {
    idbHealthy = false;
    lastIdbError = 'IndexedDB unavailable';
  }

  // 3. Install the engine.
  try {
    Object.defineProperty(window, 'localStorage', { configurable: true, enumerable: true, value: new DurableStorage() });
  } catch { /* extremely locked-down browsers: fall back to the native object */ }

  // 4. Never lose a pending write when the page goes away.
  const flush = () => { void flushMirror(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  // 5. Ask the browser not to evict our data.
  void requestPersistence();
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* ignore */ }
  return false;
}

export interface StorageHealth {
  persistent: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  mirrorHealthy: boolean;
  mirrorError: string | null;
  keys: number;
}

export async function getStorageHealth(): Promise<StorageHealth> {
  let persistent = false;
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  try { persistent = !!(await navigator.storage?.persisted?.()); } catch { /* ignore */ }
  try {
    const est = await navigator.storage?.estimate?.();
    usageBytes = est?.usage ?? null;
    quotaBytes = est?.quota ?? null;
  } catch { /* ignore */ }
  return { persistent, usageBytes, quotaBytes, mirrorHealthy: idbHealthy, mirrorError: lastIdbError, keys: mem.size };
}
