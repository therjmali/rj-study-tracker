import { useSyncExternalStore } from 'react';

/**
 * Streak rules chosen by the user — one global store read by the single streak engine, so Home, Stats, Profile,
 * the banner, widgets and the planner all apply them identically.
 *  • minMinutes — how long a day must be to count (default 1 = any study counts)
 *  • restDays   — weekdays (0 = Sunday … 6 = Saturday) that never break the streak
 */
export interface StreakRules { minMinutes: number; restDays: number[] }

const KEY = 'rj-streak-rules-v1';
export const DEFAULT_RULES: StreakRules = { minMinutes: 1, restDays: [] };
const listeners = new Set<() => void>();

const sanitize = (r: Partial<StreakRules> | null | undefined): StreakRules => ({
  minMinutes: Math.min(180, Math.max(1, Math.round(Number(r?.minMinutes ?? 1)) || 1)),
  restDays: Array.from(new Set((r?.restDays ?? []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))).sort(),
});

function read(): StreakRules {
  try { const raw = localStorage.getItem(KEY); return raw ? sanitize(JSON.parse(raw)) : DEFAULT_RULES; } catch { return DEFAULT_RULES; }
}
let current: StreakRules = typeof localStorage === 'undefined' ? DEFAULT_RULES : read();

export const getStreakRules = (): StreakRules => current;

export function setStreakRules(next: Partial<StreakRules>) {
  current = sanitize({ ...current, ...next });
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private mode */ }
  listeners.forEach(l => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => { if (e.key === KEY) { current = read(); listeners.forEach(l => l()); } });
}

export function useStreakRules(): StreakRules {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => DEFAULT_RULES);
}
