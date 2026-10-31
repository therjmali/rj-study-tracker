import type { Subject, DbStudySession, TimeEntry } from '../types';
import type { DayPeriod } from './dayPeriods';

export interface RhythmRange { from: string; to: string }

export interface RhythmResult {
  /** Minutes studied inside each shift */
  minutes: Record<DayPeriod, number>;
  /** Topics completed in each shift (by completion time) */
  topics: Record<DayPeriod, number>;
  /** Minutes that have a date but no time of day, so they cannot be placed in a shift */
  unassigned: number;
  /** Minutes placed into a shift */
  assigned: number;
  peak: DayPeriod | null;
}

/** Minute-of-day boundaries — must match lib/dayPeriods.ts */
function bucketAt(min: number): { key: DayPeriod; end: number } {
  if (min < 240) return { key: 'night', end: 240 };
  if (min < 720) return { key: 'morning', end: 720 };
  if (min < 1020) return { key: 'afternoon', end: 1020 };
  if (min < 1200) return { key: 'evening', end: 1200 };
  return { key: 'night', end: 1440 };
}

export function parseHHMM(t?: string): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = parseInt(m[1], 10), mm = parseInt(m[2], 10);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/** Spread `dur` minutes starting at `startMin` across the shifts it overlaps (wraps past midnight). */
function spread(startMin: number, dur: number, acc: Record<DayPeriod, number>) {
  let cur = ((startMin % 1440) + 1440) % 1440;
  let left = Math.max(0, Math.round(dur));
  let guard = 0;
  while (left > 0 && guard++ < 50) {
    const { key, end } = bucketAt(cur);
    const take = Math.min(left, end - cur);
    acc[key] += take;
    left -= take;
    cur = (cur + take) % 1440;
  }
}

const inRange = (d: string | undefined, r: RhythmRange | null) => !r || (!!d && d >= r.from && d <= r.to);

export function computeStudyRhythm(
  subjects: Subject[],
  dbSessions: DbStudySession[] | undefined,
  range: RhythmRange | null,
): RhythmResult {
  const minutes: Record<DayPeriod, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const topics: Record<DayPeriod, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  let unassigned = 0;

  // 1) First-class sessions
  const sessionKeys = new Set<string>();
  (dbSessions || []).forEach(s => {
    if (!s.minutes || s.minutes <= 0) return;
    // keys used to avoid counting a timer entry twice (session + topic entry)
    if (s.topicId) sessionKeys.add(`t|${s.date}|${s.topicId}|${s.minutes}`);
    if (s.unitId) sessionKeys.add(`u|${s.date}|${s.unitId}|${s.minutes}`);
    if (!inRange(s.date, range)) return;
    const start = parseHHMM(s.startTime);
    if (start == null) { unassigned += s.minutes; return; }
    spread(start, s.minutes, minutes);
  });

  // 2) Topic / unit / revision time entries
  const addEntry = (e: TimeEntry, dupKey: string[], fallbackEnd?: string) => {
    if (!e.minutes || e.minutes <= 0 || !inRange(e.date, range)) return;
    if (dupKey.some(k => sessionKeys.has(k))) return;
    const start = parseHHMM(e.time);
    if (start != null) { spread(start, e.minutes, minutes); return; }
    const end = parseHHMM(fallbackEnd);
    if (end != null) { spread(end - e.minutes, e.minutes, minutes); return; }
    unassigned += e.minutes;
  };

  subjects.forEach(s => s.units.forEach(u => {
    u.subTopics.forEach(t => {
      if (!t.completed || !inRange(t.completedDate, range)) return;
      const c = parseHHMM(t.completedTime);
      if (c != null) topics[bucketAt(c).key]++;
    });
    (u.timeEntries || []).forEach(e => addEntry(e, [`u|${e.date}|${u.id}|${e.minutes}`]));
    u.subTopics.forEach(t => {
      (t.timeEntries || []).forEach(e =>
        addEntry(e, [`t|${e.date}|${t.id}|${e.minutes}`], t.completed && t.completedDate === e.date ? t.completedTime : undefined));
      Object.values(t.revisions || {}).forEach(r =>
        (r?.timeEntries || []).forEach(e =>
          addEntry(e, [`t|${e.date}|${t.id}|${e.minutes}`], r?.completedDate === e.date ? r?.completedTime : undefined)));
    });
  }));

  const assigned = minutes.morning + minutes.afternoon + minutes.evening + minutes.night;
  let peak: DayPeriod | null = null;
  (Object.keys(minutes) as DayPeriod[]).forEach(k => {
    if (minutes[k] > 0 && (peak === null || minutes[k] > minutes[peak])) peak = k;
  });
  return { minutes, topics, unassigned, assigned, peak };
}
