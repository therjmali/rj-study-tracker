/**
 * Revision Session selectors & aggregators.
 *
 * Revision sessions are first-class study sessions (see `RevisionSession` in
 * `types/index.ts`). Each one is also written as a `DbStudySession` of type
 * `'Other'` (`[R1] Topic …`) so the app's existing single source of truth —
 * `getEffectiveDayMinutes`, `getUnifiedTotalMinutes`, `getActiveDates` —
 * already absorbs revision time without double counting: revision time lives
 * in `topic.revisions[round].timeSpent` (never in the topic's main
 * `timeSpent`/`timeEntries`), so it never overlaps topic/unit time.
 *
 * Pure functions, no React. Safe for empty data, missing `revisions` fields
 * and topics with no rounds left.
 */
import { REVISION_KEYS, type RevisionKey } from '../types';
import type { Subject, SubTopic, RevisionSession } from '../types';
import { getLocalDateStr } from './utils';

/** A topic that is ready to be revised right now. */
export interface DueRevisionItem {
  subject: Subject;
  unitId: string;
  unitName: string;
  topic: SubTopic;
  /** The round this topic is due for next (R1 | R2 | R3 | R4). */
  round: RevisionKey;
  /** Has this round already been started (but not finished)? */
  inProgress: boolean;
  /** Minutes already logged for this round. */
  roundMinutes: number;
  /** Days since this topic was last touched (study or any revision). */
  daysSinceTouched: number | null;
}

/**
 * Topics due for revision across the whole syllabus: completed topics whose
 * next round is not yet complete, ordered longest-untouched first so the
 * Revision Center queue always surfaces the most urgent topic first.
 */
export function getTopicsDueForRevision(
  subjects: Subject[],
  today = getLocalDateStr(),
): DueRevisionItem[] {
  const due: DueRevisionItem[] = [];

  subjects.forEach((s) => {
    s.units.forEach((u) => {
      u.subTopics.forEach((t) => {
        if (t.completed !== true) return;
        const round = REVISION_KEYS.find((k) => t.revisions?.[k]?.status !== 'complete');
        if (!round) return; // R1–R4 all complete — nothing due

        const started = t.revisions?.[round]?.startedDate;
        const completed = t.revisions?.[round]?.completedDate;
        const lastTouched = [t.completedDate, started, completed]
          .filter(Boolean)
          .sort()
          .pop() ?? '';

        due.push({
          subject: s,
          unitId: u.id,
          unitName: u.name,
          topic: t,
          round,
          inProgress: t.revisions?.[round]?.status === 'in_process',
          roundMinutes: t.revisions?.[round]?.timeSpent ?? 0,
          daysSinceTouched: lastTouched
            ? dateDifferenceInDays(lastTouched, today)
            : null,
        });
      });
    });
  });

  due.sort((a, b) => {
    if (a.daysSinceTouched === null && b.daysSinceTouched === null) return 0;
    if (a.daysSinceTouched === null) return 1;
    if (b.daysSinceTouched === null) return -1;
    return b.daysSinceTouched - a.daysSinceTouched;
  });

  return due;
}

function dateDifferenceInDays(from: string, to: string): number | null {
  const a = from.split('-').map(Number);
  const b = to.split('-').map(Number);
  if (a.length !== 3 || b.length !== 3 || a.some((n) => !Number.isFinite(n)) || b.some((n) => !Number.isFinite(n))) return null;
  const ms = Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2]);
  return Math.max(0, Math.round(ms / 86400000));
}

/** Minutes logged in revision sessions on a single date. */
export function getRevisionDayMinutes(revisionSessions: RevisionSession[], dateStr: string): number {
  return revisionSessions
    .filter((s) => s.date === dateStr)
    .reduce((a, s) => a + (s.durationMinutes || 0), 0);
}

/** Total revision minutes across all time. */
export function getRevisionTotalMinutes(revisionSessions: RevisionSession[]): number {
  return revisionSessions.reduce((a, s) => a + (s.durationMinutes || 0), 0);
}

/** Distinct topics that had a revision session on a single date. */
export function getRevisionTopicsInteracted(revisionSessions: RevisionSession[], dateStr: string): number {
  const ids = new Set(
    revisionSessions.filter((s) => s.date === dateStr).map((s) => s.topicId),
  );
  return ids.size;
}

/**
 * Distinct topics interacted with on a single date — study OR revision.
 * Union of:
 *   • topics completed on that date
 *   • topics with time entries on that date
 *   • topics with revision sessions on that date
 */
export function getTopicsInteractedOnDate(
  subjects: Subject[],
  revisionSessions: RevisionSession[],
  dateStr: string,
): number {
  const ids = new Set<string>();

  subjects.forEach((s) =>
    s.units.forEach((u) =>
      u.subTopics.forEach((t) => {
        if (t.completed && t.completedDate === dateStr) ids.add(t.id);
        t.timeEntries?.forEach((e) => {
          if (e.date === dateStr && e.minutes > 0) ids.add(t.id);
        });
      }),
    ),
  );

  revisionSessions
    .filter((s) => s.date === dateStr)
    .forEach((s) => ids.add(s.topicId));

  return ids.size;
}

/**
 * Revision progress for one round across all subjects:
 * completed topics with this round done / left / in progress, and total
 * minutes logged for the round.
 */
export interface RoundAggregate {
  key: RevisionKey;
  done: number;
  left: number;
  inProgress: number;
  minutes: number;
  pct: number;
}

export function getRoundAggregates(
  subjects: Subject[],
  today = getLocalDateStr(),
): RoundAggregate[] {
  const done = { R1: 0, R2: 0, R3: 0, R4: 0 };
  const inProgress = { R1: 0, R2: 0, R3: 0, R4: 0 };
  const minutes = { R1: 0, R2: 0, R3: 0, R4: 0 };
  let completedTopics = 0;

  subjects.forEach((s) =>
    s.units.forEach((u) =>
      u.subTopics.forEach((t) => {
        if (t.completed !== true) return;
        completedTopics++;
        REVISION_KEYS.forEach((k) => {
          const r = t.revisions?.[k];
          if (!r) return;
          if (r.status === 'complete') done[k]++;
          else if (r.status === 'in_process') inProgress[k]++;
          if (typeof r.timeSpent === 'number' && Number.isFinite(r.timeSpent)) {
            minutes[k] += r.timeSpent;
          }
        });
      }),
    ),
  );

  return REVISION_KEYS.map((k) => ({
    key: k,
    done: done[k],
    left: Math.max(0, completedTopics - done[k]),
    inProgress: inProgress[k],
    minutes: minutes[k],
    pct: completedTopics > 0 ? Math.round((done[k] / completedTopics) * 100) : 0,
  }));
}

/**
 * Overall revision stats across all subjects.
 */
export interface RevisionOverview {
  completedTopics: number;
  roundsDone: number;
  roundsTotal: number;
  overallPct: number;
  totalMinutes: number;
  waitingR1: number;
}

export function getRevisionOverview(subjects: Subject[]): RevisionOverview {
  let completedTopics = 0;
  let roundsDone = 0;
  let totalMinutes = 0;
  let waitingR1 = 0;

  subjects.forEach((s) =>
    s.units.forEach((u) =>
      u.subTopics.forEach((t) => {
        if (t.completed !== true) return;
        completedTopics++;
        REVISION_KEYS.forEach((k) => {
          const r = t.revisions?.[k];
          if (r?.status === 'complete') roundsDone++;
          if (typeof r?.timeSpent === 'number' && Number.isFinite(r.timeSpent)) {
            totalMinutes += r.timeSpent;
          }
        });
        if (t.revisions?.R1?.status !== 'complete') waitingR1++; // needs R1
      }),
    ),
  );

  const roundsTotal = completedTopics * REVISION_KEYS.length;
  return {
    completedTopics,
    roundsDone,
    roundsTotal,
    overallPct: roundsTotal > 0 ? Math.round((roundsDone / roundsTotal) * 100) : 0,
    totalMinutes,
    waitingR1,
  };
}
