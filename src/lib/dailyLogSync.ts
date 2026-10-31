import type { DailyLog, Subject } from '../types';
import { getLocalDateStr } from './utils';

/**
 * Keeps `dailyLogs[].topicsCompleted` in step with the syllabus.
 * Used by every path that replaces the subjects (edit, undo, redo) so Home, Stats and the calendar
 * always agree with the syllabus. Only dates that were / are affected are touched.
 */
export function syncDailyLogsWithSubjects(
  logs: DailyLog[],
  prevSubjects: Subject[],
  nextSubjects: Subject[],
  extraDates: string[] = [],
): DailyLog[] {
  const dates = new Set<string>([getLocalDateStr(), ...extraDates]);
  const collect = (subjects: Subject[], into: Map<string, number> | null) => {
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate) {
        dates.add(t.completedDate);
        if (into) into.set(t.completedDate, (into.get(t.completedDate) || 0) + 1);
      }
    })));
  };
  collect(prevSubjects, null);
  const counts = new Map<string, number>();
  collect(nextSubjects, counts);

  let changed = false;
  const out = logs.map(l => {
    if (!dates.has(l.date)) return l;
    const done = counts.get(l.date) || 0;
    if (l.topicsCompleted === done) return l;
    changed = true;
    return { ...l, topicsCompleted: done };
  });
  return changed ? out : logs;
}
