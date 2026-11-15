import { useSyncExternalStore } from 'react';

/**
 * Global on/off switch for the ⚖️ growth comparison cards (hidden by default).
 * A tiny external store: one value shared by every card and ⚖️ button in the app, kept in localStorage so it
 * survives navigation, reloads and app restarts, and synced across tabs / the installed PWA window.
 */
const KEY = 'rj-growth-visible-v1';
const listeners = new Set<() => void>();

const read = (): boolean => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};
let current = read();

const emit = () => listeners.forEach(l => l());

export function setGrowthVisible(v: boolean) {
  current = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* private mode: still works for this session */ }
  emit();
}
export const toggleGrowthVisible = () => setGrowthVisible(!current);

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => { if (e.key === KEY) { current = read(); emit(); } });
}

export function useGrowthVisible() {
  const visible = useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => current,
    () => false,
  );
  return { visible, toggle: toggleGrowthVisible, set: setGrowthVisible };
}
