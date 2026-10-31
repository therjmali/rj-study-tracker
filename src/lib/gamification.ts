import type { Subject, DailyLog, Level, Achievement, WeeklyRank, DbStudySession } from '../types';
import { getLocalDateStr, getUnifiedTotalMinutes } from './utils';

export const LEVELS: Level[] = [
  { level: 1,  title: 'Nursing Novice',        minXP: 0,     maxXP: 100,   minProgress: 0,   color: '#6B7280', icon: '🌱' },
  { level: 2,  title: 'Student Nurse',         minXP: 100,   maxXP: 250,   minProgress: 5,   color: '#94A3B8', icon: '📚' },
  { level: 3,  title: 'Care Starter',          minXP: 250,   maxXP: 450,   minProgress: 10,  color: '#3B82F6', icon: '💉', unlocks: ['theme-cherry'] },
  { level: 4,  title: 'Junior Caregiver',      minXP: 450,   maxXP: 700,   minProgress: 15,  color: '#60A5FA', icon: '🩹', unlocks: ['theme-midnight', 'border-neon'] },
  { level: 5,  title: 'Care Provider',         minXP: 700,   maxXP: 1000,  minProgress: 20,  color: '#10B981', icon: '💊', unlocks: ['confetti-stars'] },
  { level: 6,  title: 'Health Scholar',        minXP: 1000,  maxXP: 1400,  minProgress: 27,  color: '#34D399', icon: '📖', unlocks: ['theme-forest', 'confetti-hearts'] },
  { level: 7,  title: 'Clinical Learner',      minXP: 1400,  maxXP: 1900,  minProgress: 34,  color: '#8B5CF6', icon: '🩺', unlocks: ['theme-golden'] },
  { level: 8,  title: 'Ward Explorer',         minXP: 1900,  maxXP: 2500,  minProgress: 40,  color: '#A78BFA', icon: '🔬', unlocks: ['border-gold', 'confetti-sparkle'] },
  { level: 9,  title: 'Knowledge Seeker',      minXP: 2500,  maxXP: 3200,  minProgress: 47,  color: '#F59E0B', icon: '🧪' },
  { level: 10, title: 'Health Champion',       minXP: 3200,  maxXP: 4000,  minProgress: 53,  color: '#FBBF24', icon: '⭐', unlocks: ['theme-aurora', 'border-fire'] },
  { level: 11, title: 'Senior Practitioner',   minXP: 4000,  maxXP: 4900,  minProgress: 60,  color: '#EC4899', icon: '🏥', unlocks: ['confetti-fireworks'] },
  { level: 12, title: 'Clinical Expert',       minXP: 4900,  maxXP: 5900,  minProgress: 66,  color: '#F472B6', icon: '📋', unlocks: ['border-rainbow'] },
  { level: 13, title: 'Ward Leader',           minXP: 5900,  maxXP: 7000,  minProgress: 72,  color: '#06B6D4', icon: '🎓' },
  { level: 14, title: 'Expert Clinician',      minXP: 7000,  maxXP: 8200,  minProgress: 77,  color: '#22D3EE', icon: '💡' },
  { level: 15, title: 'Master Nurse',          minXP: 8200,  maxXP: 9500,  minProgress: 82,  color: '#F97316', icon: '👑' },
  { level: 16, title: 'Chief Scholar',         minXP: 9500,  maxXP: 11000, minProgress: 87,  color: '#FB923C', icon: '🔥' },
  { level: 17, title: 'Elite Practitioner',    minXP: 11000, maxXP: 13000, minProgress: 91,  color: '#EF4444', icon: '💎' },
  { level: 18, title: 'NORCET Champion',       minXP: 13000, maxXP: 15500, minProgress: 95,  color: '#DC2626', icon: '🌟' },
  { level: 19, title: 'Nursing Prodigy',       minXP: 15500, maxXP: 18500, minProgress: 98,  color: '#D946EF', icon: '✨' },
  { level: 20, title: 'RJ TRACKER Legend',     minXP: 18500, maxXP: 99999, minProgress: 100, color: '#A855F7', icon: '🏆' },
];

/* ═══════════════════════════════════════════════
   XP COMPUTATION — single source of truth
   ═══════════════════════════════════════════════ */

/** Fixed XP values per source */
const XP_PER_TOPIC_EASY = 5;
const XP_PER_TOPIC_MEDIUM = 10;
const XP_PER_TOPIC_HARD = 15;
const XP_IMPORTANT_BONUS = 5;
const XP_PER_STUDY_HOUR = 8;
const XP_DAY_6HRS_BONUS = 20;
const XP_DAY_8HRS_BONUS = 30;

export function computeXP(subjects: Subject[], dailyLogs: DailyLog[], dbSessions?: DbStudySession[], achievements?: Achievement[]): number {
  let xp = 0;

  // Topic completion XP
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (!t.completed) return;
    xp += t.difficulty === 'Hard' ? XP_PER_TOPIC_HARD : t.difficulty === 'Medium' ? XP_PER_TOPIC_MEDIUM : XP_PER_TOPIC_EASY;
    if (t.important) xp += XP_IMPORTANT_BONUS;
  })));

  // Study time XP
  const totalHours = getUnifiedTotalMinutes(subjects, dbSessions, dailyLogs) / 60;
  xp += Math.floor(totalHours) * XP_PER_STUDY_HOUR;

  // Daily bonus XP for high-hour days
  const dayHoursMap = new Map<string, number>();
  dailyLogs.forEach(d => {
    if (d.hoursStudied > 0) dayHoursMap.set(d.date, d.hoursStudied);
  });
  dbSessions?.forEach(s => {
    if (s.minutes > 0) dayHoursMap.set(s.date, (dayHoursMap.get(s.date) || 0) + s.minutes / 60);
  });
  dayHoursMap.forEach(hours => {
    if (hours >= 6) xp += XP_DAY_6HRS_BONUS;
    if (hours >= 8) xp += XP_DAY_8HRS_BONUS;
  });

  // Achievement reward XP — only from unlocked achievements
  if (achievements) {
    achievements.forEach(a => {
      if (a.unlocked) xp += a.xp;
    });
  }

  // XP is never negative
  return Math.max(0, xp);
}

/* ═══════════════════════════════════════════════
   LEVEL — requires BOTH XP AND syllabus progress
   ═══════════════════════════════════════════════ */

/**
 * Determines the current level.
 * A level is unlocked only when BOTH:
 *   1. XP >= level's minXP
 *   2. syllabusProgress >= level's minProgress
 * Returns the highest level where both conditions are met.
 */
export function getLevel(xp: number, syllabusProgress: number = 0): Level {
  const safeXP = Math.max(0, xp);
  const safePct = Math.min(100, Math.max(0, syllabusProgress));
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (safeXP >= LEVELS[i].minXP && safePct >= LEVELS[i].minProgress) return LEVELS[i];
  }
  return LEVELS[0];
}

/**
 * XP progress % toward the NEXT level.
 * Formula: (currentXP − currentLevel.minXP) / (nextLevel.minXP − currentLevel.minXP) × 100
 */
export function getLevelProgress(xp: number, syllabusProgress: number = 0): number {
  const safeXP = Math.max(0, xp);
  const lvl = getLevel(safeXP, syllabusProgress);
  const range = lvl.maxXP - lvl.minXP;
  if (range <= 0) return 100;
  return Math.min(100, Math.max(0, ((safeXP - lvl.minXP) / range) * 100));
}

/** XP remaining to next level */
export function getXPToNextLevel(xp: number, syllabusProgress: number = 0): number {
  const lvl = getLevel(xp, syllabusProgress);
  if (lvl.level >= 20) return 0;
  return Math.max(0, lvl.maxXP - xp);
}

/* ═══════════════════════════════════════════════
   STREAK
   ═══════════════════════════════════════════════ */

export function computeStreak(subjects: Subject[], dailyLogs?: DailyLog[], dbSessions?: DbStudySession[]): number {
  const activeDates = new Set<string>();
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.completedDate) activeDates.add(t.completedDate);
  })));
  dailyLogs?.forEach(l => {
    if (l.topicsCompleted > 0 || l.hoursStudied > 0) activeDates.add(l.date);
    // Legacy sessions embedded in dailyLogs
    (l.sessions || []).forEach((s: any) => {
      if ((s.durationMinutes || s.minutes || 0) > 0) activeDates.add(l.date);
    });
  });
  dbSessions?.forEach(s => {
    if (s.minutes > 0) activeDates.add(s.date);
  });
  let streak = 0;
  const today = new Date();
  const todayStr = getLocalDateStr(today);
  const startOffset = activeDates.has(todayStr) ? 0 : 1;
  for (let i = startOffset; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateStr(d);
    if (activeDates.has(dateStr)) streak++;
    else break;
  }
  return streak;
}

/* ═══════════════════════════════════════════════
   STATS — unified stat computation
   ═══════════════════════════════════════════════ */

export function getStats(subjects: Subject[], dailyLogs: DailyLog[], dbSessions?: DbStudySession[], achievements?: Achievement[]) {
  let total = 0, done = 0, impTotal = 0, impDone = 0;
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    total++;
    if (t.completed) done++;
    if (t.important) { impTotal++; if (t.completed) impDone++; }
  })));
  const totalHours = getUnifiedTotalMinutes(subjects, dbSessions, dailyLogs) / 60;
  const studiedDatesSet = new Set<string>();
  dailyLogs.forEach(d => {
    if (d.hoursStudied > 0 || d.topicsCompleted > 0) studiedDatesSet.add(d.date);
    // Legacy sessions
    (d.sessions || []).forEach((s: any) => {
      if ((s.durationMinutes || s.minutes || 0) > 0) studiedDatesSet.add(d.date);
    });
  });
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.completedDate) studiedDatesSet.add(t.completedDate);
  })));
  dbSessions?.forEach(s => { if (s.minutes > 0) studiedDatesSet.add(s.date); });
  const studiedDays = studiedDatesSet.size;
  const streak = computeStreak(subjects, dailyLogs, dbSessions);
  const xp = computeXP(subjects, dailyLogs, dbSessions, achievements);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const level = getLevel(xp, pct);
  const impPct = impTotal > 0 ? Math.min(100, Math.round((impDone / impTotal) * 100)) : 0;
  return { total, done, impTotal, impDone, totalHours, studiedDays, streak, xp, level, pct, impPct };
}

/* ═══════════════════════════════════════════════
   WEEKLY RANK
   ═══════════════════════════════════════════════ */

export function getWeeklyRank(weeklyXP: number): WeeklyRank {
  if (weeklyXP >= 500) return 'Platinum';
  if (weeklyXP >= 300) return 'Gold';
  if (weeklyXP >= 150) return 'Silver';
  if (weeklyXP >= 50) return 'Bronze';
  return 'Iron';
}

export const RANK_CONFIG: Record<WeeklyRank, { color: string; emoji: string }> = {
  Iron: { color: '#6B7280', emoji: '🪨' },
  Bronze: { color: '#CD7F32', emoji: '🥉' },
  Silver: { color: '#C0C0C0', emoji: '🥈' },
  Gold: { color: '#FFD700', emoji: '🥇' },
  Platinum: { color: '#E5E4E2', emoji: '💎' },
};

export function getUnlockedItems(xp: number, syllabusProgress: number = 0): string[] {
  const level = getLevel(xp, syllabusProgress);
  const items: string[] = [];
  for (const l of LEVELS) {
    if (l.level > level.level) break;
    if (l.unlocks) items.push(...l.unlocks);
  }
  return items;
}

/* ═══════════════════════════════════════════════
   ACHIEVEMENTS — independent from level/XP calc
   ═══════════════════════════════════════════════ */

export function getDefaultAchievements(): Achievement[] {
  const a = (id: string, title: string, desc: string, icon: string, xp: number, rarity: Achievement['rarity'], cat: Achievement['category']): Achievement => ({
    id, title, description: desc, icon, xp, unlocked: false, rarity, category: cat,
  });
  return [
    a('streak_1', 'First Step', '1-day study streak', '👣', 10, 'common', 'streak'),
    a('streak_3', 'On a Roll', '3-day study streak', '🔥', 30, 'common', 'streak'),
    a('streak_7', 'Week Warrior', '7-day study streak', '⚔️', 70, 'rare', 'streak'),
    a('streak_14', 'Fortnight Force', '14-day study streak', '💪', 140, 'rare', 'streak'),
    a('topics_1', 'First Topic', 'Complete your first topic', '✅', 5, 'common', 'topics'),
    a('topics_10', 'Getting Started', 'Complete 10 topics', '📝', 20, 'common', 'topics'),
    a('topics_50', 'Halfway Hero', 'Complete 50 topics', '🦸', 100, 'rare', 'topics'),
    a('topics_100', 'Centurion', 'Complete 100 topics', '💯', 200, 'rare', 'topics'),
    a('topics_200', 'Double Century', 'Complete 200 topics', '🏏', 400, 'epic', 'topics'),
    a('hours_10', 'Study Starter', 'Study for 10 hours total', '📖', 25, 'common', 'hours'),
    a('hours_50', 'Half Century', 'Study for 50 hours total', '⏰', 120, 'epic', 'hours'),
    a('hours_100', 'Century Scholar', 'Study for 100 hours total', '🎯', 250, 'legendary', 'hours'),
    a('perfect_day', 'Perfect Day', 'Study 8 hours in one day', '🌟', 80, 'epic', 'special'),
    a('all_important', 'Star Student', 'Complete all important topics', '⭐', 500, 'legendary', 'special'),
    a('norcet_hard_50', 'Hard Hitter', 'Complete all 50 Hard difficulty topics', '💪', 200, 'epic', 'topics'),
    a('norcet_speed', 'Speed Demon', 'Complete 20 topics in a single day', '⚡', 150, 'rare', 'topics'),
    a('norcet_8hrs', 'Marathon Scholar', 'Study 8+ hours in a day', '🏃', 100, 'rare', 'hours'),
    a('norcet_streak30', 'Iron Discipline', '30-day study streak', '🔥', 500, 'legendary', 'streak'),
    a('norcet_srs_50', 'Memory Master', 'Review 50 topics via Spaced Repetition', '🧠', 200, 'epic', 'special'),
    a('norcet_all_imp', 'VIP Vault', 'Complete all important-starred topics', '⭐', 300, 'legendary', 'special'),
    a('subject_master', 'Subject Master', 'Complete 100% of any subject', '🏅', 300, 'epic', 'subject'),
    a('early_bird', 'Early Bird', 'Log study before 6 AM', '🌅', 50, 'rare', 'special'),
    a('night_owl', 'Night Owl', 'Study session after 8 PM', '🦉', 50, 'rare', 'special'),
    a('speed_runner', 'Speed Runner', 'Complete 10 topics in a single day', '⚡', 100, 'rare', 'topics'),
    a('consistency_king', 'Consistency King', '21-day study streak', '👑', 400, 'epic', 'streak'),
    a('explorer', 'Explorer', 'Study all subjects in one day', '🗺️', 80, 'rare', 'special'),
    a('flashcard_fan', 'Flashcard Fan', 'Use AI flashcards 5 times', '🃏', 50, 'common', 'special'),
    a('planner', 'Study Planner', 'Generate an AI study plan', '📋', 30, 'common', 'special'),
  ];
}

export function checkAchievements(achievements: Achievement[], subjects: Subject[], dailyLogs: DailyLog[], dbSessions?: DbStudySession[]): Achievement[] {
  // Use stats WITHOUT achievement XP to avoid circular dependency during check
  const baseStats = getStats(subjects, dailyLogs, dbSessions);

  const hardDone = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.difficulty === 'Hard' && t.completed).length, 0), 0);

  const achDayHours = new Map<string, number>();
  dailyLogs.forEach(d => { if (d.hoursStudied > 0) achDayHours.set(d.date, d.hoursStudied); });
  dbSessions?.forEach(s => { if (s.minutes > 0) achDayHours.set(s.date, (achDayHours.get(s.date) || 0) + s.minutes / 60); });
  const anyDay8hrs = Array.from(achDayHours.values()).some(h => h >= 8);

  const checks: Record<string, boolean> = {
    streak_1: baseStats.streak >= 1, streak_3: baseStats.streak >= 3, streak_7: baseStats.streak >= 7, streak_14: baseStats.streak >= 14,
    topics_1: baseStats.done >= 1, topics_10: baseStats.done >= 10, topics_50: baseStats.done >= 50,
    topics_100: baseStats.done >= 100, topics_200: baseStats.done >= 200,
    hours_10: baseStats.totalHours >= 10, hours_50: baseStats.totalHours >= 50, hours_100: baseStats.totalHours >= 100,
    perfect_day: anyDay8hrs,
    all_important: baseStats.impTotal > 0 && baseStats.impDone === baseStats.impTotal,
    norcet_hard_50: hardDone >= 50,
    norcet_speed: dailyLogs.some(d => d.topicsCompleted >= 20),
    norcet_8hrs: anyDay8hrs,
    norcet_streak30: baseStats.streak >= 30,
    norcet_srs_50: false,
    norcet_all_imp: baseStats.impTotal > 0 && baseStats.impDone === baseStats.impTotal,
    subject_master: subjects.some(s => {
      let t = 0, d = 0;
      s.units.forEach(u => u.subTopics.forEach(tp => { t++; if (tp.completed) d++; }));
      return t > 0 && d === t;
    }),
    early_bird: false,
    night_owl: false,
    speed_runner: dailyLogs.some(d => d.topicsCompleted >= 10),
    consistency_king: baseStats.streak >= 21,
    explorer: false,
    flashcard_fan: false,
    planner: false,
  };

  return achievements.map(a => {
    // Never un-unlock an achievement
    if (a.unlocked) return a;
    if (checks[a.id]) return { ...a, unlocked: true, unlockedAt: new Date().toISOString() };
    return a;
  });
}
