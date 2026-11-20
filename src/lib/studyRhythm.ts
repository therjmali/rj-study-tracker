import type { Subject, DbStudySession } from '../types';
import type { DayPeriod } from './dayPeriods';
import { revisionCompletions } from './topicActivity';
import { indexStudyDays } from './studySlices';

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
  dailyLogs?: { date: string; hoursStudied?: number; sessions?: any[] }[],
): RhythmResult {
  const minutes: Record<DayPeriod, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const topics: Record<DayPeriod, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  let unassigned = 0;

  // Minutes come from the SAME engine as every other study-time number (topic + revision + unit entries and
  // non-mirrored sessions), so the rhythm total always equals the period's study time. This only places
  // each slice into its shift of the day.
  const days = indexStudyDays(subjects as any, dailyLogs, dbSessions as any, { from: range?.from, to: range?.to, slices: true });
  days.forEach(day => day.slices.forEach(sl => {
    const start = parseHHMM(sl.start);
    if (start != null) { spread(start, sl.minutes, minutes); return; }
    const end = parseHHMM(sl.end);
    if (end != null) { spread(end - sl.minutes, sl.minutes, minutes); return; }
    unassigned += sl.minutes;
  }));

  // Topics completed per shift (by completion time) — revision rounds count as topics too
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && inRange(t.completedDate, range)) {
      const c = parseHHMM(t.completedTime);
      if (c != null) topics[bucketAt(c).key]++;
    }
    revisionCompletions(t as any).forEach(rc => {
      if (!inRange(rc.date, range)) return;
      const c = parseHHMM(rc.time);
      if (c != null) topics[bucketAt(c).key]++;
    });
  })));

  const assigned = minutes.morning + minutes.afternoon + minutes.evening + minutes.night;
  let peak: DayPeriod | null = null;
  (Object.keys(minutes) as DayPeriod[]).forEach(k => {
    if (minutes[k] > 0 && (peak === null || minutes[k] > minutes[peak])) peak = k;
  });
  return { minutes, topics, unassigned, assigned, peak };
}
