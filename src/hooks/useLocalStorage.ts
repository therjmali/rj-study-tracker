import { useState, useCallback, useRef, useEffect } from 'react';

// Keys that hold large data get a longer debounce
const HEAVY_KEYS = new Set(['nursing-tracker-v6', 'nursing-history-v1']);
// Critical keys write immediately (no debounce) to avoid data loss on close/refresh
const IMMEDIATE_KEYS = new Set(['nursing-dbsessions-v1', 'nursing-settings-v2']);

// Components that still read these keys straight from localStorage must see the latest value:
// every hook instance registers its flush function so readers can force pending writes out first.
const flushers = new Set<() => void>();
export function flushAllLocalStorage() { flushers.forEach(f => { try { f(); } catch { /* ignore */ } }); }

function scheduleWrite(fn: () => void, delayMs: number) {
  if (typeof requestIdleCallback === 'function') {
    // Use idle callback with a timeout fallback
    return requestIdleCallback(() => fn(), { timeout: delayMs + 500 }) as unknown as ReturnType<typeof setTimeout>;
  }
  return setTimeout(fn, delayMs);
}

function cancelWrite(id: ReturnType<typeof setTimeout>) {
  if (typeof cancelIdleCallback === 'function' && typeof id === 'number') {
    try { cancelIdleCallback(id as unknown as number); } catch {}
  }
  clearTimeout(id);
}

/**
 * useState that persists to localStorage.
 *
 * - The updater passed to setState is now pure (the old version scheduled the
 *   write from inside the updater, which React may run during render).
 * - Writes are scheduled from an effect, after the UI has been painted.
 * - Pending writes are flushed (not dropped) when the tab is hidden, the page
 *   is closed, or the component unmounts, so no data is lost.
 */
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const latestRef = useRef(value);
  const dirtyRef = useRef(false);
  const mountedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const debounceMs = HEAVY_KEYS.has(key) ? 1500 : 800;
  const isImmediate = IMMEDIATE_KEYS.has(key);

  const flush = useCallback(() => {
    if (timeoutRef.current != null) {
      cancelWrite(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    try { localStorage.setItem(key, JSON.stringify(latestRef.current)); } catch {}
  }, [key]);

  const set = useCallback((v: T | ((prev: T) => T)) => {
    setValue(prev => (typeof v === 'function' ? (v as (p: T) => T)(prev) : v));
  }, []);

  // Schedule a write whenever the value changes (skip the initial mount)
  useEffect(() => {
    latestRef.current = value;
    if (!mountedRef.current) { mountedRef.current = true; return; }
    dirtyRef.current = true;
    if (isImmediate) { flush(); return; }
    if (timeoutRef.current != null) cancelWrite(timeoutRef.current);
    timeoutRef.current = scheduleWrite(flush, debounceMs);
  }, [value, isImmediate, debounceMs, flush]);

  // Never lose a pending write: flush when the app is backgrounded / closed / unmounted
  useEffect(() => {
    flushers.add(flush);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flushers.delete(flush);
      flush();
    };
  }, [flush]);

  return [value, set];
}
