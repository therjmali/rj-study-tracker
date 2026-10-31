// Spaced Repetition System — Enhanced SM-2 Algorithm (v7)
// Default intervals: Easy 2,5,10,20,40 | Medium 1,3,7,14,30 | Hard 1,2,4,7,15

import type { SRSConfig } from '../types';
import { DEFAULT_SRS_CONFIG } from '../types';
import { getLocalDateStr } from './utils';

const DEFAULT_INTERVALS = [1, 3, 7, 14, 30];

/**
 * Get SRS intervals for a given difficulty, using custom config if available.
 */
export function getIntervalsForDifficulty(
  difficulty: 'Easy' | 'Medium' | 'Hard',
  config?: SRSConfig
): number[] {
  const c = config || DEFAULT_SRS_CONFIG;
  switch (difficulty) {
    case 'Easy': return c.easy;
    case 'Hard': return c.hard;
    default: return c.medium;
  }
}

/**
 * Calculate next due date and level after a review.
 */
export function getNextDueDate(
  currentLevel: number,
  gotIt: boolean,
  difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium',
  config?: SRSConfig
): { newLevel: number; dueDate: string } {
  const intervals = getIntervalsForDifficulty(difficulty, config);
  const newLevel = gotIt ? Math.min(currentLevel + 1, intervals.length - 1) : 0;
  const days = intervals[newLevel] ?? 1;
  const due = new Date();
  due.setDate(due.getDate() + days);
  return { newLevel, dueDate: getLocalDateStr(due) };
}

/**
 * Initialize SRS for a newly completed topic.
 */
export function initSRS(
  difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium',
  config?: SRSConfig
): { srsLevel: number; srsDueDate: string } {
  const intervals = getIntervalsForDifficulty(difficulty, config);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + (intervals[0] ?? 1));
  return { srsLevel: 0, srsDueDate: getLocalDateStr(tomorrow) };
}

/**
 * Check if a topic is due for review today or overdue.
 */
export function isDueToday(srsDueDate?: string): boolean {
  if (!srsDueDate) return false;
  const today = getLocalDateStr();
  return srsDueDate <= today;
}

/**
 * Get human-readable label for an SRS level.
 */
export function getSRSIntervalLabel(
  level: number,
  difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium',
  config?: SRSConfig
): string {
  const intervals = getIntervalsForDifficulty(difficulty, config);
  if (level < 0 || level >= intervals.length) return '?';
  const d = intervals[level];
  return d === 1 ? '1 day' : `${d} days`;
}

/**
 * Get countdown string for next review (e.g., "due in 2 days", "due today", "overdue by 3 days").
 */
export function getDueCountdown(srsDueDate?: string): string {
  if (!srsDueDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(srsDueDate + 'T00:00:00');
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays > 1) return `Due in ${diffDays} days`;
  if (diffDays === -1) return 'Overdue by 1 day';
  return `Overdue by ${Math.abs(diffDays)} days`;
}

/**
 * Count all topics due for SRS review today.
 */
export function countDueTopics(subjects: { units: { subTopics: { completed: boolean; srsDueDate?: string }[] }[] }[]): number {
  const today = getLocalDateStr();
  let count = 0;
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.srsDueDate && t.srsDueDate <= today) count++;
  })));
  return count;
}
