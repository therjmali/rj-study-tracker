/**
 * Revision statistics for one subject (R1–R4).
 *
 * Rules:
 *  - Only topics with `completed === true` count toward "needs revision" totals.
 *  - Round progress = completed topics whose revisions[Rk].status === 'complete'.
 *  - Revision time = sum of revisions[Rk].timeSpent (kept separate from study time).
 *  - Streak = consecutive days (ending today or yesterday) with at least one
 *    revision completedDate or revision time-entry date.
 *
 * Pure functions, no React. Safe for subjects with 0 topics, topics without a
 * `revisions` field, and divisions by zero.
 */
import { REVISION_KEYS } from '../types';
import type { Subject, SubTopic, RevisionKey } from '../types';
import { getLocalDateStr } from './utils';

/** Items shown per round card */
export const NEXT_UP_PER_ROUND = 3;
export const UNITS_PER_ROUND = 4;

export interface NextUpItem {
  topic: SubTopic;
  unitId: string;
  unitName: string;
  /** Round is already started but not finished */
  inProgress: boolean;
}

export interface RoundUnitStat {
  id: string;
  name: string;
  /** Position of the unit in the subject (0-based) */
  index: number;
  done: number;
  total: number;
  pct: number;
}

export interface RoundStat {
  key: RevisionKey;
  /** Completed topics whose round is 'complete' */
  done: number;
  /** Completed topics still missing this round */
  left: number;
  pct: number;
  /** Completed topics whose round is 'in_process' */
  inProgress: number;
  /** Minutes logged for this round (all topics) */
  time: number;
  /** Topics that are ready for exactly this round (all earlier rounds done) */
  readyCount: number;
  /** Up to NEXT_UP_PER_ROUND topics ready for this round */
  nextUp: NextUpItem[];
  /** Every topic ready for this round, in the same order as `nextUp` (used for swipe navigation) */
  readyRefs: { unitId: string; topicId: string }[];
  /** Units that still miss this round, least revised first (max UNITS_PER_ROUND) */
  units: RoundUnitStat[];
  /** How many units still miss this round in total */
  unitsPending: number;
}

export interface SubjectRevisionStats {
  totalTopics: number;
  completedTopics: number;
  rounds: RoundStat[];
  /** Rounds completed across all completed topics (max = completedTopics × 4) */
  roundsDone: number;
  roundsTotal: number;
  overallPct: number;
  totalTime: number;
  streak: number;
}

const pctOf = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);
const isRoundDone = (t: SubTopic, k: RevisionKey) => t.revisions?.[k]?.status === 'complete';
const minutesOf = (t: SubTopic, k: RevisionKey) => {
  const v = t.revisions?.[k]?.timeSpent;
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : 0;
};

/** The first round that is not yet complete, or null when all four are done */
export function getNextRound(t: SubTopic): RevisionKey | null {
  return REVISION_KEYS.find(k => !isRoundDone(t, k)) ?? null;
}

function collectActivityDays(t: SubTopic, into: Set<string>) {
  const revs = t.revisions;
  if (!revs) return;
  for (const k of REVISION_KEYS) {
    const r = revs[k];
    if (!r) continue;
    if (r.completedDate) into.add(r.completedDate);
    for (const e of r.timeEntries || []) {
      if (e && e.date) into.add(e.date);
    }
  }
}

export function computeStreak(days: Set<string>, today: string): number {
  if (days.size === 0) return 0;
  const parts = today.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !isFinite(n))) return 0;
  const cursor = new Date(parts[0], parts[1] - 1, parts[2]);
  if (!days.has(getLocalDateStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1); // streak may still be alive from yesterday
    if (!days.has(getLocalDateStr(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(getLocalDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Latest known date this topic was studied or revised (YYYY-MM-DD, '' if unknown) */
function lastTouched(t: SubTopic): string {
  let best = t.completedDate || '';
  for (const k of REVISION_KEYS) {
    const d = t.revisions?.[k]?.completedDate;
    if (d && d > best) best = d;
  }
  return best;
}

type Waiting = NextUpItem & { touched: string; order: number };
type UnitRow = { id: string; name: string; index: number; completed: number; done: Record<RevisionKey, number> };

const zero = (): Record<RevisionKey, number> => ({ R1: 0, R2: 0, R3: 0, R4: 0 });

export function computeSubjectRevisionStats(subject: Subject | undefined, today: string): SubjectRevisionStats {
  const units = subject?.units ?? [];
  const doneCount = zero();
  const progCount = zero();
  const timeCount = zero();
  const days = new Set<string>();
  const waiting: Record<RevisionKey, Waiting[]> = { R1: [], R2: [], R3: [], R4: [] };
  const unitRows: UnitRow[] = [];

  let totalTopics = 0;
  let completedTopics = 0;
  let order = 0;

  units.forEach((unit, unitIndex) => {
    const row: UnitRow = { id: unit.id, name: unit.name, index: unitIndex, completed: 0, done: zero() };
    for (const t of unit.subTopics ?? []) {
      totalTopics++;
      collectActivityDays(t, days);
      for (const k of REVISION_KEYS) timeCount[k] += minutesOf(t, k);

      if (t.completed !== true) continue;
      completedTopics++;
      row.completed++;

      for (const k of REVISION_KEYS) {
        const status = t.revisions?.[k]?.status;
        if (status === 'complete') { doneCount[k]++; row.done[k]++; }
        else if (status === 'in_process') progCount[k]++;
      }

      const next = getNextRound(t);
      if (next) {
        waiting[next].push({
          topic: t, unitId: unit.id, unitName: unit.name,
          inProgress: t.revisions?.[next]?.status === 'in_process',
          touched: lastTouched(t), order: order++,
        });
      }
    }
    if (row.completed > 0) unitRows.push(row);
  });

  const rounds: RoundStat[] = REVISION_KEYS.map(k => {
    // Rounds already in progress first, then the topics waiting longest
    const ready = waiting[k].slice().sort((a, b) => {
      if (a.inProgress !== b.inProgress) return a.inProgress ? -1 : 1;
      if (a.touched !== b.touched) return a.touched < b.touched ? -1 : 1;
      return a.order - b.order;
    });

    const pendingUnits: RoundUnitStat[] = unitRows
      .filter(u => u.done[k] < u.completed)
      .map(u => ({ id: u.id, name: u.name, index: u.index, done: u.done[k], total: u.completed, pct: pctOf(u.done[k], u.completed) }))
      .sort((a, b) => a.pct - b.pct || a.index - b.index);

    return {
      key: k,
      done: doneCount[k],
      left: Math.max(0, completedTopics - doneCount[k]),
      pct: pctOf(doneCount[k], completedTopics),
      inProgress: progCount[k],
      time: timeCount[k],
      readyCount: ready.length,
      readyRefs: ready.map(r => ({ unitId: r.unitId, topicId: r.topic.id })),
      nextUp: ready.slice(0, NEXT_UP_PER_ROUND).map(({ topic, unitId, unitName, inProgress }) => ({ topic, unitId, unitName, inProgress })),
      units: pendingUnits.slice(0, UNITS_PER_ROUND),
      unitsPending: pendingUnits.length,
    };
  });

  const roundsDone = rounds.reduce((a, r) => a + r.done, 0);
  const roundsTotal = completedTopics * REVISION_KEYS.length;

  return {
    totalTopics,
    completedTopics,
    rounds,
    roundsDone,
    roundsTotal,
    overallPct: pctOf(roundsDone, roundsTotal),
    totalTime: rounds.reduce((a, r) => a + r.time, 0),
    streak: computeStreak(days, today),
  };
}
