/**
 * Zero-dependency event bus shared by the storage hook and the sync engine.
 *
 *  • `notifyLocalChange()` — "something was written on this device", debounced by
 *    the engine into a background push.
 *  • `setSyncWriteGuard()` — pauses the debounced localStorage writers while a
 *    remote merge is being written, so a stale React state can never overwrite
 *    freshly merged data just before the app reloads it.
 */
type Listener = (key?: string) => void;

const listeners = new Set<Listener>();
let writeGuard = false;

export function notifyLocalChange(key?: string): void {
  if (writeGuard) return;
  for (const listener of listeners) {
    try { listener(key); } catch { /* never break a save because a listener failed */ }
  }
}

export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSyncWriteGuard(active: boolean): void {
  writeGuard = active;
}

export function isSyncWriteGuarded(): boolean {
  return writeGuard;
}
