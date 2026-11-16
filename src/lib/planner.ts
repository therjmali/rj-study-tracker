/**
 * Deadline planner + readiness — pure functions (unit-tested), no React.
 *
 *  • buildPlans      → per subject with an exam date: what is left, how many topics/day are needed, how many you
 *                      actually do, and an honest status (On track / Behind / Critical).
 *  • suggestToday    → today's concrete list: the next new topics (Important and Hard first) sized to the quota,
 *                      plus revisions that are due.
 *  • computeReadiness→ completion (difficulty- and importance-weighted) + revision coverage + freshness.
 */
import type { Subject, SubTopic } from '../types';
import { REVISION_KEYS } from '../types';

export type PlanStatus = 'done' | 'on-track' | 'behind' | 'critical' | 'no-deadline' | 'past';

export interface Readiness { score: number; completion: number; revision: number; freshness: number }

export interface SubjectPlan {
  subjectId: string; name: string; shortName: string; color: string;
  examDate: string | null; daysLeft: number | null; studyDaysLeft: number | null;
  total: number; done: number; remaining: number;
  /** Topics/day needed from today to finish by the exam (counting only study days) */
  requiredPerDay: number;
  /** Topics/day completed over the last `windowDays` */
  pace: number;
  /** Day the subject would be finished at the current pace (null if pace is 0) */
  projectedFinish: string | null;
  status: PlanStatus;
  readiness: Readiness;
}

export interface PlanTask {
  kind: 'new' | 'revise';
  subjectId: string; unitId: string; topicId: string;
  name: string; subjectShort: string; color: string;
  important: boolean; difficulty: string;
  /** Why it is on today's list */
  reason: string;
  /** For revisions: which round is next (R1..R4) */
  round?: string;
}

const DAY = 86_400_000;
const parse = (s: string) => new Date(`${s}T12:00:00`);
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);

const isDate = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}/.test(s);

/** Study days between today (inclusive) and the exam day (exclusive), skipping the weekdays you rest on. */
export function countStudyDays(today: string, examDate: string, restDays: number[] = []): number {
  const n = diffDays(today, examDate);
  if (n <= 0) return 0;
  if (!restDays.length) return n;
  let c = 0;
  for (let i = 0; i < n; i++) if (!restDays.includes(parse(addDays(today, i)).getDay())) c++;
  return c;
}

const DIFF_WEIGHT: Record<string, number> = { Easy: 1, Medium: 1.5, Hard: 2 };
const weight = (t: SubTopic) => (DIFF_WEIGHT[t.difficulty as string] ?? 1.5) * (t.important ? 1.5 : 1);

function topicsOf(s: Subject): SubTopic[] { return s.units.flatMap(u => u.subTopics); }

function lastTouched(t: SubTopic): string | null {
  let best: string | null = isDate(t.completedDate) ? t.completedDate : null;
  const bump = (d?: string) => { if (isDate(d) && (!best || d > best)) best = d; };
  bump(t.lastReviewedDate);
  t.timeEntries?.forEach(e => bump(e.date));
  REVISION_KEYS.forEach(k => bump(t.revisions?.[k]?.completedDate));
  return best;
}

export function computeReadiness(s: Subject, today: string): Readiness {
  const ts = topicsOf(s);
  if (!ts.length) return { score: 0, completion: 0, revision: 0, freshness: 0 };
  const wAll = ts.reduce((a, t) => a + weight(t), 0) || 1;
  const wDone = ts.filter(t => t.completed).reduce((a, t) => a + weight(t), 0);
  const completion = wDone / wAll;
  const rounds = ts.reduce((a, t) => a + REVISION_KEYS.filter(k => t.revisions?.[k]?.status === 'complete').length, 0);
  const revision = rounds / (REVISION_KEYS.length * ts.length);
  const done = ts.filter(t => t.completed);
  const fresh = done.length
    ? done.filter(t => { const d = lastTouched(t); return d && diffDays(d, today) <= 30; }).length / done.length
    : 0;
  const score = Math.round(100 * (0.6 * completion + 0.25 * revision + 0.15 * fresh));
  return { score, completion, revision, freshness: fresh };
}

export interface PlanOptions { windowDays?: number; restDays?: number[] }

export function buildPlans(subjects: Subject[], today: string, opts: PlanOptions = {}): SubjectPlan[] {
  const windowDays = opts.windowDays ?? 14;
  const rest = opts.restDays ?? [];
  const since = addDays(today, -(windowDays - 1));
  return subjects.map(s => {
    const ts = topicsOf(s);
    const total = ts.length;
    const done = ts.filter(t => t.completed).length;
    const remaining = total - done;
    const recent = ts.filter(t => t.completed && isDate(t.completedDate) && t.completedDate >= since && t.completedDate <= today).length;
    const pace = recent / windowDays;
    const exam = isDate(s.examDate) ? s.examDate.slice(0, 10) : null;
    const daysLeft = exam ? diffDays(today, exam) : null;
    const studyDaysLeft = exam && daysLeft! > 0 ? Math.max(1, countStudyDays(today, exam, rest)) : (exam ? 0 : null);
    const requiredPerDay = remaining === 0 ? 0 : studyDaysLeft ? remaining / studyDaysLeft : remaining;
    // pace is per calendar day; compare on the same footing (study days ≈ calendar days minus rest days)
    const paceStudy = rest.length ? pace * (7 / Math.max(1, 7 - rest.length)) : pace;
    let status: PlanStatus;
    if (remaining === 0) status = 'done';
    else if (!exam) status = 'no-deadline';
    else if (daysLeft! <= 0) status = 'past';
    else if (requiredPerDay <= paceStudy * 1.1) status = 'on-track';
    else if (requiredPerDay <= Math.max(paceStudy * 2, 1.5)) status = 'behind';
    else status = 'critical';
    const projectedFinish = paceStudy > 0 && remaining > 0 ? addDays(today, Math.ceil(remaining / paceStudy)) : null;
    return {
      subjectId: s.id, name: s.name, shortName: s.shortName, color: s.color,
      examDate: exam, daysLeft, studyDaysLeft, total, done, remaining,
      requiredPerDay, pace: paceStudy, projectedFinish, status, readiness: computeReadiness(s, today),
    };
  });
}

const URGENCY: Record<PlanStatus, number> = { critical: 0, behind: 1, 'on-track': 2, 'no-deadline': 3, past: 4, done: 5 };

/** Today's list. `maxNew` caps the number of NEW topics; `maxRevise` caps due revisions. */
export function suggestToday(subjects: Subject[], plans: SubjectPlan[], today: string, opts: { maxNew?: number; maxRevise?: number } = {}): PlanTask[] {
  const maxNew = opts.maxNew ?? 8;
  const maxRevise = opts.maxRevise ?? 4;
  const byId = new Map(subjects.map(s => [s.id, s]));
  const active = plans.filter(p => p.remaining > 0 && p.status !== 'done' && p.status !== 'past' && p.status !== 'no-deadline')
    .sort((a, b) => URGENCY[a.status] - URGENCY[b.status] || (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
  const tasks: PlanTask[] = [];

  // quota per subject: what you need today (rounded up), at least 1, shrunk proportionally if over maxNew
  const want = active.map(p => ({ p, n: Math.max(1, Math.ceil(p.requiredPerDay)) }));
  let sum = want.reduce((a, w) => a + w.n, 0);
  if (sum > maxNew) { const f = maxNew / sum; want.forEach(w => { w.n = Math.max(1, Math.floor(w.n * f)); }); sum = want.reduce((a, w) => a + w.n, 0); }
  // hand out any leftover capacity to the most urgent subjects
  for (let i = 0; sum < Math.min(maxNew, want.reduce((a, w) => a + w.p.remaining, 0)) && want.length; i++, sum++) want[i % want.length].n++;

  for (const { p, n } of want) {
    const s = byId.get(p.subjectId); if (!s) continue;
    const pool: { t: SubTopic; unitId: string; order: number }[] = [];
    let order = 0;
    s.units.forEach(u => u.subTopics.forEach(t => { if (!t.completed) pool.push({ t, unitId: u.id, order: order++ }); }));
    // look ahead 3× the quota in syllabus order, then surface Important / Hard first so the day is high-yield but still coherent
    const window = pool.slice(0, Math.max(n * 3, n));
    window.sort((a, b) => (Number(!!b.t.important) - Number(!!a.t.important)) || ((DIFF_WEIGHT[b.t.difficulty as string] ?? 1.5) - (DIFF_WEIGHT[a.t.difficulty as string] ?? 1.5)) || a.order - b.order);
    window.slice(0, n).forEach(({ t, unitId }) => tasks.push({
      kind: 'new', subjectId: s.id, unitId, topicId: t.id, name: t.name, subjectShort: s.shortName, color: s.color,
      important: !!t.important, difficulty: String(t.difficulty ?? ''),
      reason: p.status === 'critical' ? `Critical · ${p.daysLeft}d to exam` : p.status === 'behind' ? `Behind · ${p.daysLeft}d to exam` : t.important ? 'Important topic' : 'Next in syllabus',
    }));
  }

  // revisions that are due: SRS due date reached, or a finished topic whose next round has not been started for 3+ days
  const revs: (PlanTask & { overdue: number })[] = [];
  for (const s of subjects) for (const u of s.units) for (const t of u.subTopics) {
    if (!t.completed) continue;
    const next = REVISION_KEYS.find(k => t.revisions?.[k]?.status !== 'complete');
    const srsDue = isDate(t.srsDueDate) && t.srsDueDate <= today ? diffDays(t.srsDueDate, today) : -1;
    let overdue = srsDue;
    if (overdue < 0 && next) {
      const prevDone = next === 'R1' ? t.completedDate : t.revisions?.[REVISION_KEYS[REVISION_KEYS.indexOf(next) - 1]]?.completedDate;
      if (isDate(prevDone)) { const gap = diffDays(prevDone, today); const need = { R1: 1, R2: 3, R3: 7, R4: 14 }[next]; if (gap >= need) overdue = gap - need; }
    }
    if (overdue >= 0) revs.push({
      kind: 'revise', subjectId: s.id, unitId: u.id, topicId: t.id, name: t.name, subjectShort: s.shortName, color: s.color,
      important: !!t.important, difficulty: String(t.difficulty ?? ''), round: next, reason: next ? `Due for ${next}` : 'Spaced review due', overdue,
    });
  }
  revs.sort((a, b) => b.overdue - a.overdue || Number(b.important) - Number(a.important));
  revs.slice(0, maxRevise).forEach(({ overdue: _o, ...r }) => tasks.push(r));
  return tasks;
}

export const STATUS_LABEL: Record<PlanStatus, string> = {
  done: 'Done', 'on-track': 'On track', behind: 'Behind', critical: 'Critical', 'no-deadline': 'No exam date', past: 'Exam passed',
};
