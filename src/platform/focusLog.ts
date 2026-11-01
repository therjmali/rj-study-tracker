/**
 * Today's focus sessions — recorded from the engine's `rj:timer-saved` event, so a session saved from
 * a notification button (with the timer sheet closed) is counted exactly like one saved in the app.
 */
import { useSyncExternalStore } from 'react';
import type { TimerAppMode, TimerSessionData } from '../hooks/useGlobalTimer';

export interface FocusLogEntry { time: string; minutes: number; label: string; mode: TimerAppMode }

const KEY = 'rj-focus-log-v1';
const CHANGE = 'rj:focus-log-changed';
const empty: FocusLogEntry[] = [];

let cache: FocusLogEntry[] = empty;
let cacheRaw: string | null | undefined;

function read(): FocusLogEntry[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    const p = raw ? JSON.parse(raw) : null;
    cache = p && p.date === new Date().toDateString() && Array.isArray(p.entries) ? p.entries : empty;
  } catch { cache = empty; }
  return cache;
}

export function useFocusLog(): FocusLogEntry[] {
  return useSyncExternalStore(
    cb => { window.addEventListener(CHANGE, cb); return () => window.removeEventListener(CHANGE, cb); },
    read,
    () => empty,
  );
}

let installed = false;
export function installFocusLog(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('rj:timer-saved', (e: Event) => {
    const d = (e as CustomEvent<TimerSessionData>).detail;
    if (!d) return;
    const entry: FocusLogEntry = {
      time: new Date(d.endedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      minutes: d.minutes,
      label: d.topicName || d.subjectName || 'General',
      mode: d.mode,
    };
    const next = [...read(), entry].slice(-60);
    try { localStorage.setItem(KEY, JSON.stringify({ date: new Date().toDateString(), entries: next })); } catch { /* ignore */ }
    window.dispatchEvent(new Event(CHANGE));
  });
}
