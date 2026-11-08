/**
 * MCQ practice log (device-local): how many MCQs were answered and how many were right.
 * Feeds the AI Tutor's telemetry (CUMULATIVE_MCQS_PRACTICED / ACCURACY_RATE) so it is measured, never guessed.
 */
const KEY = 'rj-mcq-stats-v1';
const MAX_DAYS = 120;

export interface McqStats { total: number; correct: number; days: Record<string, { t: number; c: number }> }

const dateStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function getMcqStats(): McqStats {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (p && typeof p.total === 'number' && typeof p.correct === 'number') {
      return { total: Math.max(0, p.total), correct: Math.min(Math.max(0, p.correct), p.total), days: p.days && typeof p.days === 'object' ? p.days : {} };
    }
  } catch { /* ignore */ }
  return { total: 0, correct: 0, days: {} };
}

export function recordMcqAnswer(correct: boolean): void {
  try {
    const s = getMcqStats();
    s.total += 1;
    if (correct) s.correct += 1;
    const today = dateStr();
    const d = s.days[today] ?? { t: 0, c: 0 };
    d.t += 1; if (correct) d.c += 1;
    s.days[today] = d;
    const keys = Object.keys(s.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_DAYS))) delete s.days[k];
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* storage full / unavailable: never break the quiz */ }
}
