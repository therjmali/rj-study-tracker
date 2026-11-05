/**
 * Progress report engine — one source for the in-app Progress Card and the nightly notification.
 *
 * Periods: today · yesterday · last 7 days · last 30 days · custom range · complete (since the first
 * study day). Study minutes always use the app's unified formula (getEffectiveDayMinutes) so the card
 * can never disagree with the rest of the app.
 */
import type { DailyLog, DbStudySession, StudyGoals, Subject } from '../types';
import { getEffectiveDayMinutes, getLocalDateStr } from './utils';

export type PeriodId = 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all';

export const PERIODS: { id: PeriodId; label: string; long: string }[] = [
  { id: 'today', label: 'Today', long: 'Today' },
  { id: 'yesterday', label: 'Yesterday', long: 'Yesterday' },
  { id: 'week', label: '1 week', long: 'Last 7 days' },
  { id: 'month', label: '30 days', long: 'Last 30 days' },
  { id: 'custom', label: 'Custom', long: 'Custom range' },
  { id: 'all', label: 'Complete', long: 'Complete journey' },
];

export interface ReportInput {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  dbSessions?: DbStudySession[];
  goals: StudyGoals;
}

export interface SubjectSlice { id: string; name: string; color: string; minutes: number; topics: number }
export interface SeriesPoint { label: string; minutes: number; topics: number; from: string; to: string }

export interface ProgressReport {
  period: PeriodId;
  from: string;
  to: string;
  days: number;
  title: string;
  subtitle: string;
  minutes: number;
  topics: number;
  sessions: number;
  activeDays: number;
  avgPerActiveDay: number;
  best: { date: string; minutes: number } | null;
  streak: number;
  series: SeriesPoint[];
  subjects: SubjectSlice[];
  goalMinutes: number;
  goalTopics: number;
  /** 0–100, mean of the two goals that are set */
  score: number;
  prev: { minutes: number; topics: number } | null;
  hasData: boolean;
}

const DAY = 86_400_000;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const shift = (s: string, n: number): string => { const d = parse(s); d.setDate(d.getDate() + n); return getLocalDateStr(d); };
const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from, i = 0; d <= to && i < 4000; d = shift(d, 1), i++) out.push(d);
  return out;
}

export function fmtMinutes(m: number): string {
  const v = Math.max(0, Math.round(m));
  if (v < 60) return `${v}m`;
  const h = Math.floor(v / 60), r = v % 60;
  return r ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h`;
}

const shortDate = (s: string) => parse(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const weekday = (s: string) => parse(s).toLocaleDateString('en-US', { weekday: 'short' });

function firstActiveDate(input: ReportInput, today: string): string {
  let min = today;
  const consider = (d?: string) => { if (d && /^\d{4}-\d{2}-\d{2}/.test(d) && d.slice(0, 10) < min) min = d.slice(0, 10); };
  input.subjects.forEach(s => s.units.forEach(u => {
    u.timeEntries?.forEach(e => consider(e.date));
    u.subTopics.forEach(t => { consider(t.completedDate); t.timeEntries?.forEach(e => consider(e.date)); });
  }));
  input.dbSessions?.forEach(s => consider(s.date));
  input.dailyLogs.forEach(l => { if (l.hoursStudied > 0) consider(l.date); });
  return min;
}

export function resolveRange(period: PeriodId, input: ReportInput, custom?: { from: string; to: string }, today = getLocalDateStr()): { from: string; to: string } {
  switch (period) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const y = shift(today, -1); return { from: y, to: y }; }
    case 'week': return { from: shift(today, -6), to: today };
    case 'month': return { from: shift(today, -29), to: today };
    case 'custom': {
      const a = custom?.from || shift(today, -13), b = custom?.to || today;
      return a <= b ? { from: a, to: b } : { from: b, to: a };
    }
    case 'all': return { from: firstActiveDate(input, today), to: today };
  }
}

function topicsIn(input: ReportInput, from: string, to: string): number {
  let n = 0;
  input.subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.completedDate && t.completedDate >= from && t.completedDate <= to) n++;
  })));
  return n;
}

function minutesIn(input: ReportInput, from: string, to: string): { total: number; perDay: Map<string, number> } {
  const perDay = new Map<string, number>();
  let total = 0;
  for (const d of eachDay(from, to)) {
    const m = getEffectiveDayMinutes(input.subjects, input.dailyLogs, d, input.dbSessions);
    perDay.set(d, m); total += m;
  }
  return { total, perDay };
}

function subjectSlices(input: ReportInput, from: string, to: string): SubjectSlice[] {
  const inRange = (d: string) => d >= from && d <= to;
  const out: SubjectSlice[] = [];
  input.subjects.forEach(s => {
    let minutes = 0, topics = 0;
    const entryTopicDays = new Set<string>();
    s.units.forEach(u => {
      u.timeEntries?.forEach(e => { if (inRange(e.date)) minutes += e.minutes; });
      u.subTopics.forEach(t => {
        let had = false;
        t.timeEntries?.forEach(e => { if (inRange(e.date)) { minutes += e.minutes; had = true; entryTopicDays.add(`${t.id}|${e.date}`); } });
        if (!had && (!t.timeEntries || t.timeEntries.length === 0) && t.completed && t.completedDate && inRange(t.completedDate) && (t.timeSpent || 0) > 0) {
          minutes += t.timeSpent; entryTopicDays.add(`${t.id}|${t.completedDate}`);
        }
        if (t.completed && t.completedDate && inRange(t.completedDate)) topics++;
      });
    });
    (input.dbSessions ?? []).forEach(x => {
      if (x.subjectId !== s.id || !inRange(x.date)) return;
      if (x.topicId && entryTopicDays.has(`${x.topicId}|${x.date}`)) return;
      if (x.type !== 'Other' && x.topicId) return; // already represented by the topic's own time
      minutes += x.minutes || 0;
    });
    if (minutes > 0 || topics > 0) out.push({ id: s.id, name: s.shortName || s.name, color: s.color, minutes, topics });
  });
  return out.sort((a, b) => b.minutes - a.minutes || b.topics - a.topics);
}

function buildSeries(from: string, to: string, perDay: Map<string, number>, input: ReportInput): SeriesPoint[] {
  const days = eachDay(from, to);
  const topicsByDay = new Map<string, number>();
  input.subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.completedDate && t.completedDate >= from && t.completedDate <= to) topicsByDay.set(t.completedDate, (topicsByDay.get(t.completedDate) ?? 0) + 1);
  })));
  if (days.length === 1) {
    // single day: hour-of-day is not tracked reliably, so show a flat marker bar
    return [{ label: shortDate(days[0]), minutes: perDay.get(days[0]) ?? 0, topics: topicsByDay.get(days[0]) ?? 0, from: days[0], to: days[0] }];
  }
  // bucket long ranges so the chart stays readable (≈ 24 bars max)
  const bucket = days.length <= 31 ? 1 : Math.ceil(days.length / 24);
  const pts: SeriesPoint[] = [];
  for (let i = 0; i < days.length; i += bucket) {
    const slice = days.slice(i, i + bucket);
    const minutes = slice.reduce((a, d) => a + (perDay.get(d) ?? 0), 0);
    const topics = slice.reduce((a, d) => a + (topicsByDay.get(d) ?? 0), 0);
    pts.push({
      label: bucket === 1 ? (days.length <= 8 ? weekday(slice[0]) : String(parse(slice[0]).getDate())) : shortDate(slice[0]),
      minutes, topics, from: slice[0], to: slice[slice.length - 1],
    });
  }
  return pts;
}

function currentStreak(input: ReportInput, today: string): number {
  let streak = 0;
  // a study day = any minutes OR a topic completed; today not yet studied does not break yesterday's streak
  for (let d = today, i = 0; i < 1000; d = shift(d, -1), i++) {
    const active = getEffectiveDayMinutes(input.subjects, input.dailyLogs, d, input.dbSessions) > 0 || topicsIn(input, d, d) > 0;
    if (active) streak++;
    else if (i === 0) continue;
    else break;
  }
  return streak;
}

export function buildReport(input: ReportInput, period: PeriodId, custom?: { from: string; to: string }, today = getLocalDateStr()): ProgressReport {
  const { from, to } = resolveRange(period, input, custom, today);
  const days = diffDays(from, to) + 1;
  const { total, perDay } = minutesIn(input, from, to);
  const topics = topicsIn(input, from, to);
  const dayVals = [...perDay.entries()];
  const activeDays = dayVals.filter(([, m]) => m > 0).length;
  const best = dayVals.reduce<{ date: string; minutes: number } | null>((b, [date, minutes]) => (minutes > 0 && (!b || minutes > b.minutes) ? { date, minutes } : b), null);
  const sessions = (input.dbSessions ?? []).filter(s => s.date >= from && s.date <= to).length;

  // Goals scale with the length of the period (weekly / monthly goals when they match exactly)
  const g = input.goals;
  const goalMinutes = Math.round((days === 7 && g.weeklyHours ? g.weeklyHours : days === 30 && g.monthlyHours ? g.monthlyHours : g.dailyHours * days) * 60);
  const goalTopics = days === 7 && g.weeklyTopics ? g.weeklyTopics : days === 30 && g.monthlyTopics ? g.monthlyTopics : g.dailyTopics * days;
  const parts: number[] = [];
  if (goalMinutes > 0) parts.push(Math.min(1, total / goalMinutes));
  if (goalTopics > 0) parts.push(Math.min(1, topics / goalTopics));
  const score = parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : 0;

  let prev: ProgressReport['prev'] = null;
  if (period !== 'all') {
    const pTo = shift(from, -1), pFrom = shift(pTo, -(days - 1));
    prev = { minutes: minutesIn(input, pFrom, pTo).total, topics: topicsIn(input, pFrom, pTo) };
  }

  const longName = PERIODS.find(p => p.id === period)!.long;
  const subtitle = days === 1 ? parse(from).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : `${shortDate(from)} – ${shortDate(to)} · ${days} days`;

  return {
    period, from, to, days, title: longName, subtitle,
    minutes: total, topics, sessions, activeDays,
    avgPerActiveDay: activeDays ? Math.round(total / activeDays) : 0,
    best, streak: currentStreak(input, today),
    series: buildSeries(from, to, perDay, input),
    subjects: subjectSlices(input, from, to),
    goalMinutes, goalTopics, score, prev,
    hasData: total > 0 || topics > 0,
  };
}

/** One friendly line for the card and the notification. */
export function verdict(r: ProgressReport): { emoji: string; line: string } {
  const unit = r.days === 1 ? 'day' : 'period';
  if (!r.hasData) {
    return r.period === 'today'
      ? { emoji: '🌱', line: 'Nothing logged yet today — even one topic keeps your streak alive.' }
      : { emoji: '🌱', line: `No study logged for this ${unit}.` };
  }
  if (r.score >= 100) return { emoji: '🏆', line: 'Goals smashed — outstanding consistency.' };
  if (r.score >= 75) return { emoji: '🔥', line: 'Almost there — you are right on track.' };
  if (r.score >= 40) return { emoji: '💪', line: 'Solid progress — keep the momentum going.' };
  return { emoji: '✨', line: 'A good start — small steps add up.' };
}

export function deltaLabel(now: number, before: number): { text: string; up: boolean | null } {
  if (before === 0 && now === 0) return { text: '—', up: null };
  if (before === 0) return { text: 'new', up: true };
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: '0%', up: null };
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, up: pct > 0 };
}

/** Rebuild the report input from what is stored on this device (used by the notification scheduler). */
export function loadStoredInput(): ReportInput | null {
  try {
    const st = JSON.parse(localStorage.getItem('nursing-tracker-v6') ?? 'null');
    if (!st?.subjects) return null;
    const sessions = JSON.parse(localStorage.getItem('nursing-dbsessions-v1') ?? '[]');
    const settings = JSON.parse(localStorage.getItem('nursing-settings-v2') ?? '{}');
    const goals: StudyGoals = { dailyHours: 6, dailyTopics: 10, weeklyHours: 30, weeklyTopics: 50, monthlyHours: 120, monthlyTopics: 150, ...(settings.studyGoals ?? {}) };
    return { subjects: st.subjects, dailyLogs: st.dailyLogs ?? [], dbSessions: Array.isArray(sessions) ? sessions : [], goals };
  } catch { return null; }
}
