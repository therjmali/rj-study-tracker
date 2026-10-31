import { getEffectiveDayMinutes } from '../../../lib/utils';
import type { Subject, DailyLog, DbStudySession } from '../../../types';

export function localDate(d?: Date): string {
  return (d ?? new Date()).toLocaleDateString('en-CA');
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (d <= end) { out.push(localDate(d)); d.setDate(d.getDate() + 1); }
  return out;
}

export const fmtDD = (s: string) => { const p = s.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : s; };

export function fmtMin(m: number): string {
  if (!m || m <= 0) return '0 min';
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return `${h}:${String(r).padStart(2, '0')} h`;
}

export function pctChange(cur: number, prev: number) {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

export interface DailyPoint { date: string; minutes: number; topics: number }

export interface PeriodStats {
  totalMinutes: number; topicsDone: number;
  easyDone: number; mediumDone: number; hardDone: number;
  avgMinPerTopic: number; topicsPerHour: number; difficultyScore: number;
  activeDays: number; totalDays: number;
  daily: DailyPoint[]; hourly: number[];
}

function countDayTopics(subjects: Subject[], date: string) {
  let n = 0;
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.completedDate === date) n++;
  })));
  return n;
}

export function computePeriod(subjects: Subject[], dailyLogs: DailyLog[], from: string, to: string, dbSessions?: DbStudySession[]): PeriodStats {
  const dates = dateRange(from, to);
  let topicsDone = 0, easyDone = 0, mediumDone = 0, hardDone = 0;
  const hourly = new Array(24).fill(0);

  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (!t.completed || !t.completedDate) return;
    if (t.completedDate < from || t.completedDate > to) return;
    topicsDone++;
    if (t.difficulty === 'Easy') easyDone++;
    else if (t.difficulty === 'Medium') mediumDone++;
    else hardDone++;
    if (t.completedTime) {
      const h = parseInt(t.completedTime.split(':')[0]);
      if (!isNaN(h) && h >= 0 && h < 24) hourly[h]++;
    }
  })));

  const daily = dates.map(date => ({
    date,
    minutes: getEffectiveDayMinutes(subjects, dailyLogs, date, dbSessions),
    topics: countDayTopics(subjects, date),
  }));

  const totalMinutes = daily.reduce((a, d) => a + d.minutes, 0);
  const activeDays = daily.filter(d => d.minutes > 0 || d.topics > 0).length;
  const avgMinPerTopic = topicsDone > 0 ? totalMinutes / topicsDone : 0;
  const topicsPerHour = totalMinutes > 0 ? topicsDone / (totalMinutes / 60) : 0;
  const difficultyScore = topicsDone > 0
    ? Math.round(((easyDone + mediumDone * 2 + hardDone * 3) / topicsDone) * 100) / 100 : 0;

  return {
    totalMinutes, topicsDone, easyDone, mediumDone, hardDone,
    avgMinPerTopic, topicsPerHour, difficultyScore,
    activeDays, totalDays: dates.length, daily, hourly,
  };
}

/* ═══ Personal Records ═══ */
export interface PersonalRecords {
  bestDay: { date: string; topics: number; minutes: number } | null;
  bestWeek: { from: string; to: string; topics: number; minutes: number } | null;
  bestMonth: { label: string; topics: number; minutes: number } | null;
  longestStreak: { days: number; from: string; to: string } | null;
  peakHour: { hour: number; count: number } | null;
}

export function computeRecords(subjects: Subject[], dailyLogs: DailyLog[], dbSessions?: DbStudySession[]): PersonalRecords {
  const dayMap = new Map<string, { topics: number; minutes: number }>();
  const allDatesSet = new Set<string>();
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.completedDate) allDatesSet.add(t.completedDate);
  })));
  dailyLogs.forEach(l => { if (l.hoursStudied > 0 || l.topicsCompleted > 0) allDatesSet.add(l.date); });

  const sorted = Array.from(allDatesSet).sort();
  sorted.forEach(date => {
    dayMap.set(date, { topics: countDayTopics(subjects, date), minutes: getEffectiveDayMinutes(subjects, dailyLogs, date, dbSessions) });
  });

  // Best day
  let bestDay: PersonalRecords['bestDay'] = null;
  dayMap.forEach((v, date) => {
    if (!bestDay || v.topics > bestDay.topics || (v.topics === bestDay.topics && v.minutes > bestDay.minutes))
      bestDay = { date, ...v };
  });

  // Best 7-day window
  let bestWeek: PersonalRecords['bestWeek'] = null;
  if (sorted.length > 0) {
    const first = new Date(sorted[0] + 'T12:00:00');
    const last = new Date(sorted[sorted.length - 1] + 'T12:00:00');
    const d = new Date(first);
    while (d <= last) {
      const from = localDate(d);
      const e = new Date(d); e.setDate(e.getDate() + 6);
      const to = localDate(e);
      let topics = 0, minutes = 0;
      dateRange(from, to).forEach(dt => { const v = dayMap.get(dt); if (v) { topics += v.topics; minutes += v.minutes; } });
      if (!bestWeek || topics > bestWeek.topics) bestWeek = { from, to, topics, minutes };
      d.setDate(d.getDate() + 1);
    }
  }

  // Best month
  let bestMonth: PersonalRecords['bestMonth'] = null;
  const mMap = new Map<string, { topics: number; minutes: number }>();
  dayMap.forEach((v, date) => {
    const m = date.slice(0, 7);
    const c = mMap.get(m) || { topics: 0, minutes: 0 };
    mMap.set(m, { topics: c.topics + v.topics, minutes: c.minutes + v.minutes });
  });
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  mMap.forEach((v, m) => {
    const label = `${months[parseInt(m.split('-')[1]) - 1]} ${m.split('-')[0]}`;
    if (!bestMonth || v.topics > bestMonth.topics) bestMonth = { label, ...v };
  });

  // Longest streak
  let longestStreak: PersonalRecords['longestStreak'] = null;
  const activeSet = new Set<string>();
  dayMap.forEach((v, date) => { if (v.topics > 0 || v.minutes > 0) activeSet.add(date); });
  if (sorted.length > 0) {
    let maxLen = 0, maxFrom = '', maxTo = '', curLen = 0, curFrom = '';
    const walker = new Date(sorted[0] + 'T12:00:00');
    const lastD = new Date(sorted[sorted.length - 1] + 'T12:00:00');
    while (walker <= lastD) {
      const ds = localDate(walker);
      if (activeSet.has(ds)) {
        if (curLen === 0) curFrom = ds;
        curLen++;
        if (curLen > maxLen) { maxLen = curLen; maxFrom = curFrom; maxTo = ds; }
      } else { curLen = 0; }
      walker.setDate(walker.getDate() + 1);
    }
    if (maxLen > 0) longestStreak = { days: maxLen, from: maxFrom, to: maxTo };
  }

  // Peak hour
  const hBuckets = new Array(24).fill(0);
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.completedTime) {
      const h = parseInt(t.completedTime.split(':')[0]);
      if (!isNaN(h) && h >= 0 && h < 24) hBuckets[h]++;
    }
  })));
  const maxH = Math.max(...hBuckets);
  const peakHour = maxH > 0 ? { hour: hBuckets.indexOf(maxH), count: maxH } : null;

  return { bestDay, bestWeek, bestMonth, longestStreak, peakHour };
}

/* ═══ Momentum ═══ */
export interface MomentumData {
  points: { date: string; topics: number; avg7: number }[];
  direction: 'accelerating' | 'steady' | 'decelerating';
  score: number; last7Avg: number; prev7Avg: number;
}

export function computeMomentum(subjects: Subject[]): MomentumData {
  const now = new Date();
  const pts: MomentumData['points'] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    pts.push({ date: localDate(d), topics: countDayTopics(subjects, localDate(d)), avg7: 0 });
  }
  for (let i = 0; i < pts.length; i++) {
    const w = pts.slice(Math.max(0, i - 6), i + 1);
    pts[i].avg7 = Math.round((w.reduce((a, p) => a + p.topics, 0) / w.length) * 10) / 10;
  }
  const l7 = pts.slice(-7), p7 = pts.slice(-14, -7);
  const last7Avg = Math.round((l7.reduce((a, p) => a + p.topics, 0) / 7) * 10) / 10;
  const prev7Avg = p7.length > 0 ? Math.round((p7.reduce((a, p) => a + p.topics, 0) / p7.length) * 10) / 10 : 0;
  const score = pctChange(last7Avg, prev7Avg);
  return { points: pts, direction: score > 10 ? 'accelerating' : score < -10 ? 'decelerating' : 'steady', score, last7Avg, prev7Avg };
}

/* ═══ Subject Comparison ═══ */
export interface SubjectCompare {
  name: string; shortName: string; color: string;
  thisWeek: number; lastWeek: number; thisMonth: number; lastMonth: number;
  weekChange: number; monthChange: number;
}

export function computeSubjectComparison(subjects: Subject[]): SubjectCompare[] {
  const now = new Date();
  const wd = now.getDay();
  const twS = new Date(now); twS.setDate(now.getDate() - (wd === 0 ? 6 : wd - 1));
  const lwS = new Date(twS); lwS.setDate(lwS.getDate() - 7);
  const lwE = new Date(twS); lwE.setDate(lwE.getDate() - 1);
  const tmS = new Date(now.getFullYear(), now.getMonth(), 1);
  const tmE = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const lmS = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lmE = new Date(now.getFullYear(), now.getMonth(), 0);
  const [twStr, lwStr, lwEStr, tmStr, tmEStr, lmStr, lmEStr, todStr] = [twS, lwS, lwE, tmS, tmE, lmS, lmE, now].map(d => localDate(d));

  return subjects.map(s => {
    let thisWeek = 0, lastWeek = 0, thisMonth = 0, lastMonth = 0;
    s.units.forEach(u => u.subTopics.forEach(t => {
      if (!t.completed || !t.completedDate) return;
      const d = t.completedDate;
      if (d >= twStr && d <= todStr) thisWeek++;
      if (d >= lwStr && d <= lwEStr) lastWeek++;
      if (d >= tmStr && d <= tmEStr) thisMonth++;
      if (d >= lmStr && d <= lmEStr) lastMonth++;
    }));
    return { name: s.name, shortName: s.shortName, color: s.color, thisWeek, lastWeek, thisMonth, lastMonth, weekChange: pctChange(thisWeek, lastWeek), monthChange: pctChange(thisMonth, lastMonth) };
  });
}

/* ═══ Streak & Consistency ═══ */
export interface StreakData {
  current: number; best: number; avgLength: number;
  last28: { date: string; level: number; topics: number }[];
  dowDist: number[]; regularityScore: number;
}

export function computeStreakData(subjects: Subject[], dailyLogs: DailyLog[], dbSessions?: DbStudySession[]): StreakData {
  const activeSet = new Set<string>();
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.completedDate) activeSet.add(t.completedDate);
  })));
  dailyLogs.forEach(l => { if (l.hoursStudied > 0 || l.topicsCompleted > 0) activeSet.add(l.date); });

  let current = 0;
  const d = new Date();
  if (!activeSet.has(localDate(d))) d.setDate(d.getDate() - 1);
  while (activeSet.has(localDate(d))) { current++; d.setDate(d.getDate() - 1); }

  const allSorted = Array.from(activeSet).sort();
  const streaks: number[] = [];
  if (allSorted.length > 0) {
    let tmp = 0;
    const w = new Date(allSorted[0] + 'T12:00:00');
    const lastD = new Date(allSorted[allSorted.length - 1] + 'T12:00:00');
    while (w <= lastD) {
      if (activeSet.has(localDate(w))) tmp++;
      else { if (tmp > 0) streaks.push(tmp); tmp = 0; }
      w.setDate(w.getDate() + 1);
    }
    if (tmp > 0) streaks.push(tmp);
  }
  const best = Math.max(current, ...streaks, 0);
  const avgLength = streaks.length > 0 ? Math.round((streaks.reduce((a, b) => a + b, 0) / streaks.length) * 10) / 10 : 0;

  const now2 = new Date();
  const last28: StreakData['last28'] = [];
  for (let i = 27; i >= 0; i--) {
    const dd = new Date(now2); dd.setDate(dd.getDate() - i);
    const ds = localDate(dd);
    const topics = countDayTopics(subjects, ds);
    last28.push({ date: ds, level: topics === 0 ? 0 : topics <= 2 ? 1 : topics <= 5 ? 2 : 3, topics });
  }

  const dowDist = new Array(7).fill(0);
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (!t.completed || !t.completedDate) return;
    const dow = new Date(t.completedDate + 'T12:00:00').getDay();
    dowDist[dow === 0 ? 6 : dow - 1]++;
  })));

  const total = dowDist.reduce((a: number, b: number) => a + b, 0);
  const avg = total / 7;
  const stdDev = Math.sqrt(dowDist.reduce((a: number, v: number) => a + (v - avg) ** 2, 0) / 7);
  const regularityScore = Math.max(0, Math.min(100, Math.round((1 - stdDev / (avg * 2 || 1)) * 100)));

  return { current, best, avgLength, last28, dowDist, regularityScore };
}

/* ═══ Cumulative Progress ═══ */
export interface CumulativeData {
  points: { date: string; cumulative: number; daily: number }[];
  totalDone: number; totalAll: number; remaining: number;
  pace: number; projectedDays: number; projectedDate: string;
}

export function computeCumulative(subjects: Subject[]): CumulativeData {
  const now = new Date();
  const pts: CumulativeData['points'] = [];
  let cum = 0;
  const wsD = new Date(now); wsD.setDate(wsD.getDate() - 29);
  const wsStr = localDate(wsD);
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.completedDate && t.completedDate < wsStr) cum++;
  })));

  for (let i = 29; i >= 0; i--) {
    const dd = new Date(now); dd.setDate(dd.getDate() - i);
    const ds = localDate(dd);
    const daily = countDayTopics(subjects, ds);
    cum += daily;
    pts.push({ date: ds, cumulative: cum, daily });
  }

  let totalAll = 0, totalDone = 0;
  subjects.forEach(s => s.units.forEach(u => { totalAll += u.subTopics.length; u.subTopics.forEach(t => { if (t.completed) totalDone++; }); }));
  const remaining = totalAll - totalDone;
  const pace = Math.round((pts.slice(-14).reduce((a, p) => a + p.daily, 0) / 14) * 10) / 10;
  const projectedDays = pace > 0 ? Math.ceil(remaining / pace) : 9999;
  const pd = new Date(now); pd.setDate(pd.getDate() + projectedDays);

  return { points: pts, totalDone, totalAll, remaining, pace, projectedDays, projectedDate: localDate(pd) };
}
