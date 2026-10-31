import type { Subject, SemesterConfig, DailyLog } from '../types';
import { getLocalDateStr } from '../lib/utils';

export const DEFAULT_SEMESTER: SemesterConfig = {
  semesterName: 'My Study Plan',
  studyStartDate: getLocalDateStr(),
  studyEndDate: getLocalDateStr(new Date(Date.now() + 90 * 86400000)),
  exams: [],
};

export const SUBJECTS: Subject[] = [];

export function generateDailyDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const endD = new Date(end + 'T00:00:00');
  while (cur <= endD) {
    dates.push(getLocalDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function generateDefaultLogs(config: SemesterConfig): DailyLog[] {
  return generateDailyDates(config.studyStartDate, config.studyEndDate).map(date => ({
    date, hoursStudied: 0, topicsCompleted: 0, notes: '', subjectFocus: '',
  }));
}
