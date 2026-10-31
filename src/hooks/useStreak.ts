import { useMemo } from 'react';
import { getLocalDateStr, getEffectiveDayMinutes } from '../lib/utils';

interface StreakSubject {
  units: { timeEntries?: { date: string; minutes: number }[]; subTopics: { completed: boolean; completedDate?: string; timeSpent: number; timeEntries?: { date: string; minutes: number }[] }[] }[];
}

interface StreakLog {
  date: string;
  hoursStudied: number;
  topicsCompleted: number;
}

interface StreakSession {
  date: string;
  minutes: number;
  type: string;
}

export interface StreakInfo {
  current: number;
  best: number;
  todayDone: number;
  todayHours: number;
  milestone: StreakMilestone | null;
}

export interface StreakMilestone {
  days: number;
  label: string;
  emoji: string;
  badge: string;
}

const MILESTONES: StreakMilestone[] = [
  { days: 3, label: 'Getting Started', emoji: '🔥', badge: '🔥×3' },
  { days: 7, label: 'Week Warrior', emoji: '⚡', badge: '🔥×7' },
  { days: 14, label: 'Fortnight Champion', emoji: '🏅', badge: '🔥×14' },
  { days: 30, label: 'Monthly Master', emoji: '👑', badge: '🔥×30' },
  { days: 60, label: 'Legendary', emoji: '💎', badge: '🔥×60' },
  { days: 100, label: 'Centurion', emoji: '🌟', badge: '🔥×100' },
];

export function getStreakMilestone(streak: number): StreakMilestone | null {
  let best: StreakMilestone | null = null;
  for (const m of MILESTONES) {
    if (streak >= m.days) best = m;
  }
  return best;
}

/**
 * FIX: Build active dates using getEffectiveDayMinutes as the SINGLE source of truth.
 * A day is active if and only if getEffectiveDayMinutes > 0.
 * This ensures streak, calendar, Day-by-Day, and all stats always agree.
 *
 * We scan all candidate dates from ALL data sources to build the universe of dates
 * that might have activity, then use getEffectiveDayMinutes to confirm each one.
 */
export function getActiveDates(
  subjects: StreakSubject[],
  dailyLogs: StreakLog[],
  today: string,
  dbSessions?: StreakSession[],
): Set<string> {
  // Step 1: Collect all CANDIDATE dates from every data source.
  // This is just to know which dates to check — the actual activity test is getEffectiveDayMinutes.
  const candidateDates = new Set<string>();

  // From dailyLogs
  dailyLogs.forEach(l => candidateDates.add(l.date));

  // From topic completions and timeEntries
  subjects.forEach(s => s.units.forEach(u => {
    // Unit-level timeEntries
    if (u.timeEntries) u.timeEntries.forEach(e => { if (e.minutes > 0) candidateDates.add(e.date); });
    u.subTopics.forEach(t => {
      if (t.completed && t.completedDate) candidateDates.add(t.completedDate);
      if (t.timeEntries) t.timeEntries.forEach(e => { if (e.minutes > 0) candidateDates.add(e.date); });
    });
  }));

  // From dbSessions
  if (dbSessions) {
    dbSessions.forEach(s => { if (s.minutes > 0) candidateDates.add(s.date); });
  }

  // Always include today so we check it
  candidateDates.add(today);

  // Step 2: Filter to only truly active dates using the single source of truth
  const activeDates = new Set<string>();
  candidateDates.forEach(dateStr => {
    // Don't count future dates
    if (dateStr > today) return;
    const mins = getEffectiveDayMinutes(subjects as any, dailyLogs, dateStr, dbSessions);
    if (mins > 0) activeDates.add(dateStr);
  });

  return activeDates;
}

export function computeStreak(
  subjects: StreakSubject[],
  dailyLogs: StreakLog[],
  today: string,
  dbSessions?: StreakSession[],
): StreakInfo {
  const activeDates = getActiveDates(subjects, dailyLogs, today, dbSessions);

  // Step 3: Current streak — walk backwards from today
  let current = 0;
  const d = new Date(today + 'T12:00:00');
  if (!activeDates.has(today)) {
    // Today has no activity yet — start counting from yesterday
    d.setDate(d.getDate() - 1);
  }
  while (true) {
    const dateStr = getLocalDateStr(d);
    if (activeDates.has(dateStr)) {
      current++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  // Step 4: Best streak
  const sorted = Array.from(activeDates).sort();
  let best = 0, temp = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) { temp = 1; }
    else {
      const prev = new Date(sorted[i - 1] + 'T12:00:00');
      const curr = new Date(sorted[i] + 'T12:00:00');
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      temp = diffDays === 1 ? temp + 1 : 1;
    }
    best = Math.max(best, temp);
  }

  // Step 5: Today stats
  let todayDone = 0;
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.completedDate === today) todayDone++;
  })));

  const todayHours = getEffectiveDayMinutes(subjects as any, dailyLogs, today, dbSessions) / 60;

  return {
    current,
    best: Math.max(best, current),
    todayDone,
    todayHours,
    milestone: getStreakMilestone(current),
  };
}

export function useStreak(
  subjects: StreakSubject[],
  dailyLogs: StreakLog[],
  dbSessions?: StreakSession[],
): StreakInfo {
  const today = getLocalDateStr();
  return useMemo(
    () => computeStreak(subjects, dailyLogs, today, dbSessions),
    [subjects, dailyLogs, today, dbSessions],
  );
}
