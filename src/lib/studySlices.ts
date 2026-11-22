/**
 * ONE engine for "how much did I study, and when".
 *
 * Every number about study time — a day card, the Trend chart, Daily Study Hub, Study Rhythm, totals — is
 * derived from the per-day index built here, so two screens can never disagree about the same day.
 *
 * Study time on a day is made of four kinds of slices:
 *   topic     — time logged on a syllabus topic (timeEntries)
 *   revision  — time logged on a revision round R1–R4 of a topic
 *   unit      — time logged on a unit
 *   session   — time logged as a session (Add Study Time form, floating timer without a topic, legacy logs)
 *
 * De-duplication (a timer saves BOTH a topic entry and a mirrored session of the same minutes):
 *   a session that is linked to a topic which already has time on that day is the timer's mirror and is
 *   dropped — EXCEPT sessions logged through the "Add Study Time" form (tagged "[MCQ] …", "[Lecture] …"),
 *   which are independent study time and are always counted.
 */
import { REVISION_KEYS } from '../types';
import type { RevisionKey } from '../types';

export type SliceKind = 'topic' | 'revision' | 'unit' | 'session';

export interface StudySlice {
  date: string;
  minutes: number;
  kind: SliceKind;
  /** HH:MM the slice started, when known. */
  start?: string;
  /** HH:MM it ended (completion time) — used to place entries that have no start time. */
  end?: string;
  subjectId?: string;
  unitId?: string;
  topicId?: string;
  round?: RevisionKey;
  sessionId?: string;
  /** Activity tag of a session ("MCQ", "Lecture", "Stopwatch" …). */
  activity?: string;
}

export interface DayAgg {
  date: string;
  topicMin: number;
  revisionMin: number;
  unitMin: number;
  sessionMin: number;
  /** Minutes of sessions dropped as the timer's mirror of a topic entry (never counted). */
  mirroredMin: number;
  total: number;
  topicIds: Set<string>;
  slices: StudySlice[];
}

interface EntryLike { date: string; minutes: number; time?: string }
interface RoundLike { completedDate?: string; completedTime?: string; timeEntries?: EntryLike[] }
interface TopicLike {
  id?: string; completed?: boolean; completedDate?: string; completedTime?: string; timeSpent?: number;
  timeEntries?: EntryLike[]; revisions?: Partial<Record<RevisionKey, RoundLike | undefined>>;
}
interface UnitLike { id?: string; timeEntries?: EntryLike[]; subTopics: TopicLike[] }
interface SubjectLike { id?: string; units: UnitLike[] }
interface DbSessionLike {
  id?: string; date: string; minutes: number; type?: string; topicId?: string; unitId?: string; subjectId?: string;
  startTime?: string; description?: string;
}
interface LogLike { date: string; hoursStudied?: number; sessions?: any[] }

const TIMER_TAG = /^\[(?:stopwatch|countdown|pomodoro|timer|focus)\b|^\[revision r[1-4] (?:stopwatch|countdown|pomodoro)\b/i;
const ANY_TAG = /^\s*\[([^\]]+)\]/;

/** The bracketed activity at the start of a session description: "[MCQ] note" → "MCQ". */
export function sessionActivity(description?: string): string | null {
  const m = description ? ANY_TAG.exec(description) : null;
  return m ? m[1].trim() : null;
}

/** True for sessions the floating timer saved next to a topic entry (they mirror that entry). */
export function isTimerSession(description?: string): boolean {
  return !!description && TIMER_TAG.test(description.trim());
}

/**
 * A session logged by hand through "Add Study Time" ("[MCQ] …", "[Self-Study] …", a custom activity):
 * it is its own study time, even when it is linked to a topic.
 */
export function isIndependentSession(s: { description?: string; topicId?: string }): boolean {
  const act = sessionActivity(s.description);
  return act != null && !isTimerSession(s.description);
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export interface IndexOptions {
  from?: string;
  to?: string;
  /** Keep the individual slices (needed for the rhythm and breakdown lists). */
  slices?: boolean;
}

export function indexStudyDays(
  subjects: SubjectLike[],
  dailyLogs: LogLike[] | undefined,
  dbSessions: DbSessionLike[] | undefined,
  opts: IndexOptions = {},
): Map<string, DayAgg> {
  const { from, to, slices: keep } = opts;
  const days = new Map<string, DayAgg>();
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const day = (d: string): DayAgg => {
    let a = days.get(d);
    if (!a) { a = { date: d, topicMin: 0, revisionMin: 0, unitMin: 0, sessionMin: 0, mirroredMin: 0, total: 0, topicIds: new Set(), slices: [] }; days.set(d, a); }
    return a;
  };
  const push = (a: DayAgg, s: StudySlice) => { if (keep) a.slices.push(s); };

  // 1) syllabus time: topics, revisions, units
  for (const s of subjects) for (const u of s.units) {
    if (u.timeEntries) for (const e of u.timeEntries) {
      if (!e || !e.date || !finite(e.minutes) || !inRange(e.date)) continue;
      const a = day(e.date); a.unitMin += e.minutes;
      push(a, { date: e.date, minutes: e.minutes, kind: 'unit', start: e.time, subjectId: s.id, unitId: u.id });
    }
    for (const t of u.subTopics) {
      let hasEntries = false;
      if (t.timeEntries && t.timeEntries.length > 0) {
        hasEntries = true;
        for (const e of t.timeEntries) {
          if (!e || !e.date || !finite(e.minutes) || !inRange(e.date)) continue;
          const a = day(e.date); a.topicMin += e.minutes;
          if (t.id) a.topicIds.add(t.id);
          push(a, { date: e.date, minutes: e.minutes, kind: 'topic', start: e.time, end: t.completed && t.completedDate === e.date ? t.completedTime : undefined, subjectId: s.id, unitId: u.id, topicId: t.id });
        }
      }
      // pre-entries era: a completed topic with a total but no per-day entries counts on its completion day
      if (!hasEntries && t.completed && t.completedDate && finite(t.timeSpent) && inRange(t.completedDate)) {
        const a = day(t.completedDate); a.topicMin += t.timeSpent!;
        if (t.id) a.topicIds.add(t.id);
        push(a, { date: t.completedDate, minutes: t.timeSpent!, kind: 'topic', end: t.completedTime, subjectId: s.id, unitId: u.id, topicId: t.id });
      }
      if (t.revisions) for (const k of REVISION_KEYS) {
        const r = t.revisions[k];
        if (!r?.timeEntries) continue;
        for (const e of r.timeEntries) {
          if (!e || !e.date || !finite(e.minutes) || !inRange(e.date)) continue;
          const a = day(e.date); a.revisionMin += e.minutes;
          if (t.id) a.topicIds.add(t.id);
          push(a, { date: e.date, minutes: e.minutes, kind: 'revision', round: k, start: e.time, end: r.completedDate === e.date ? r.completedTime : undefined, subjectId: s.id, unitId: u.id, topicId: t.id });
        }
      }
    }
  }

  // 2) sessions — database sessions are canonical; legacy daily-log sessions only fill days that have none
  // The timer saves a session AND a topic entry together. If the entry was later deleted/edited away, the leftover
  // timer session is an orphan of a topic that still exists — it must not come back to life as "session time".
  const liveTopicIds = new Set<string>();
  for (const s of subjects) for (const u of s.units) for (const t of u.subTopics) if (t.id) liveTopicIds.add(t.id);
  const dbDates = new Set<string>();
  for (const s of dbSessions || []) {
    if (!s || !s.date) continue;
    dbDates.add(s.date);
    if (!finite(s.minutes) || !inRange(s.date)) continue;
    const a = day(s.date);
    if (s.topicId && !isIndependentSession(s) && (a.topicIds.has(s.topicId) || (isTimerSession(s.description) && liveTopicIds.has(s.topicId)))) { a.mirroredMin += s.minutes; continue; }
    a.sessionMin += s.minutes;
    push(a, { date: s.date, minutes: s.minutes, kind: 'session', start: s.startTime || undefined, subjectId: s.subjectId, unitId: s.unitId, topicId: s.topicId, sessionId: s.id, activity: sessionActivity(s.description) ?? undefined });
  }
  for (const l of dailyLogs || []) {
    if (!l?.date || dbDates.has(l.date) || !inRange(l.date) || !l.sessions?.length) continue;
    for (const s of l.sessions) {
      const mins = s?.durationMinutes || s?.minutes || 0;
      if (!finite(mins)) continue;
      const a = day(l.date);
      if (s.topicId && a.topicIds.has(s.topicId)) { a.mirroredMin += mins; continue; }
      a.sessionMin += mins;
      push(a, { date: l.date, minutes: mins, kind: 'session', start: s.startTime || undefined, subjectId: s.subjectId, sessionId: s.id });
    }
  }

  days.forEach(a => { a.total = a.topicMin + a.revisionMin + a.unitMin + a.sessionMin; });
  return days;
}

/** Topic/unit time that has no date at all (older data) — counted in all-time and range totals, never on a day. */
export function undatedStudyMinutes(subjects: SubjectLike[]): number {
  let n = 0;
  for (const s of subjects) for (const u of s.units) {
    const ut = (u as { timeSpent?: number }).timeSpent || 0;
    if (ut > 0 && !(u.timeEntries && u.timeEntries.length > 0)) n += ut;
    for (const t of u.subTopics) {
      const ts = t.timeSpent || 0;
      if (ts <= 0) continue;
      const dated = (t.timeEntries && t.timeEntries.length > 0) || (t.completed && t.completedDate);
      if (!dated) n += ts;
    }
  }
  return n;
}


// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Cached whole-history index. Screens ask for many days one by one (a month grid, a 90-day chart, every
// card on Home): building the index once per data snapshot makes each of those lookups O(1) instead of
// re-walking every topic and session per day. Keyed by array IDENTITY — app state is immutable, so a new
// array always means new data.
const EMPTY: readonly never[] = Object.freeze([]) as readonly never[];
const indexCache = new WeakMap<object, WeakMap<object, WeakMap<object, Map<string, DayAgg>>>>();
const sliceCache = new WeakMap<object, WeakMap<object, WeakMap<object, Map<string, DayAgg>>>>();

export function getDayIndex(
  subjects: SubjectLike[],
  dailyLogs: LogLike[] | undefined,
  dbSessions: DbSessionLike[] | undefined,
  withSlices = false,
): Map<string, DayAgg> {
  const cache = withSlices ? sliceCache : indexCache;
  const sess = (dbSessions && dbSessions.length ? dbSessions : EMPTY) as object;
  const logs = (dailyLogs && dailyLogs.length ? dailyLogs : EMPTY) as object;
  let l1 = cache.get(subjects);
  if (!l1) { l1 = new WeakMap(); cache.set(subjects, l1); }
  let l2 = l1.get(sess);
  if (!l2) { l2 = new WeakMap(); l1.set(sess, l2); }
  let hit = l2.get(logs);
  if (!hit) { hit = indexStudyDays(subjects, dailyLogs, dbSessions, { slices: withSlices }); l2.set(logs, hit); }
  return hit;
}
