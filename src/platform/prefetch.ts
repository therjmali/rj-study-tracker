/**
 * Warm the lazy screens AFTER the app is up — one chunk per idle slot, never during boot.
 *
 * The old version imported every screen in one go at start-up, so the phone was still parsing 1 MB+ of JavaScript
 * while you were already trying to scroll (the "laggy right after opening" feeling). Now:
 *  • nothing starts until the page has loaded and the main thread has been quiet for a moment,
 *  • chunks load strictly one at a time, in the order you are most likely to need them,
 *  • it stops on Data-saver / Smooth-with-low-memory phones, and when the tab is hidden.
 */
type Loader = () => Promise<unknown>;

const QUEUE: Loader[] = [
  () => import('../components/SyllabusTracker'),
  () => import('../components/ChartsView'),
  () => import('../components/syllabus/TopicDetailSheet'),
  () => import('../components/RevisionPanel'),
  () => import('../components/DailyTracker'),
  () => import('../components/profile/ProfilePage'),
  () => import('../components/FocusTimer'),
  () => import('../components/AIChat'),
  () => import('../components/MCQPractice'),
  () => import('../components/FlashcardDeck'),
  () => import('../components/GamificationPanel'),
];

let started = false;

const idle = (cb: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(cb, { timeout: 5000 });
  else setTimeout(cb, 800);
};

function weakConnection(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
}

export function startPrefetch(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (weakConnection()) return;
  const next = () => {
    if (document.hidden) { setTimeout(() => idle(next), 3000); return; }
    const load = QUEUE.shift();
    if (!load) return;
    load().catch(() => { /* offline / evicted: it will load on demand */ }).finally(() => setTimeout(() => idle(next), 250));
  };
  const begin = () => setTimeout(() => idle(next), 1500);
  if (document.readyState === 'complete') begin();
  else window.addEventListener('load', begin, { once: true });
}
