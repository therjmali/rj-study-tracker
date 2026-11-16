import { useSyncExternalStore } from 'react';

/**
 * Which Home sections are visible. Stored locally and shared by every screen that renders or edits them.
 * Order is fixed (it is the order that works best on a phone); you choose what to hide, or pick a preset.
 */
export const HOME_SECTIONS = [
  { id: 'ticker',    icon: '📰', label: 'Live ticker',                hint: 'Scrolling daily / weekly / monthly targets' },
  { id: 'header',    icon: '🕒', label: 'Clock, greeting & quote',    hint: 'The big clock and motivational line' },
  { id: 'shelf',     icon: '🎯', label: 'Progress & goals shelf',     hint: 'Today / week / month against your goals' },
  { id: 'stats',     icon: '📊', label: 'Progress, streak & time',    hint: 'The four summary cards' },
  { id: 'exams',     icon: '⏳', label: 'Exam shelf',                 hint: 'Countdowns to your exams' },
  { id: 'planner',   icon: '🗓️', label: 'Deadline planner',           hint: 'Needs-per-day and today’s plan' },
  { id: 'subjects',  icon: '🧠', label: 'Subject intelligence',       hint: 'Readiness per subject' },
  { id: 'analytics', icon: '📈', label: 'Analytics & trends',         hint: 'Charts, reports, Month Growth' },
  { id: 'studyplan', icon: '📚', label: 'What to study next',         hint: 'Focus suggestions and AI plan' },
] as const;
export type HomeSectionId = typeof HOME_SECTIONS[number]['id'];

export const PRESETS: { id: string; label: string; hint: string; hidden: HomeSectionId[] }[] = [
  { id: 'full',    label: 'Full',      hint: 'Everything',                         hidden: [] },
  { id: 'exam',    label: 'Exam mode', hint: 'Deadlines first, no decoration',     hidden: ['ticker', 'header', 'analytics'] },
  { id: 'daily',   label: 'Daily',     hint: 'Today’s numbers and plan',           hidden: ['subjects', 'analytics', 'exams'] },
  { id: 'minimal', label: 'Minimal',   hint: 'Shelf, planner and next topics',     hidden: ['ticker', 'header', 'stats', 'exams', 'subjects', 'analytics'] },
];

const KEY = 'rj-home-hidden-v1';
const listeners = new Set<() => void>();
const IDS = new Set<string>(HOME_SECTIONS.map(s => s.id));

const read = (): HomeSectionId[] => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((x: string) => IDS.has(x)) : []; } catch { return []; }
};
let current: HomeSectionId[] = typeof localStorage === 'undefined' ? [] : read();

export function setHiddenSections(ids: HomeSectionId[]) {
  current = Array.from(new Set(ids)).filter(x => IDS.has(x));
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private mode */ }
  listeners.forEach(l => l());
}
export const toggleSection = (id: HomeSectionId) => setHiddenSections(current.includes(id) ? current.filter(x => x !== id) : [...current, id]);

if (typeof window !== 'undefined') window.addEventListener('storage', e => { if (e.key === KEY) { current = read(); listeners.forEach(l => l()); } });

export function useHiddenSections(): HomeSectionId[] {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => []);
}
