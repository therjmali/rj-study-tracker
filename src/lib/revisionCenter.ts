/**
 * Pure helpers for the Revision Center (no React).
 * Everything tolerates topics that have no `revisions`, no dates or no time logged.
 */
import { REVISION_KEYS } from '../types';
import type { RevisionKey, SubTopic } from '../types';
import { getLocalDateStr } from './utils';

export type SortKey =
  | 'default' | 'leastRevised' | 'mostRevised' | 'oldestCompleted' | 'recentlyCompleted'
  | 'mostTime' | 'leastTime' | 'stalest' | 'srsDue' | 'hardest' | 'priority' | 'az';

export type StatusKey = 'all' | 'completed' | 'incomplete' | 'in_progress' | 'not_started' | 'due' | 'weak';
export type RoundFilter = 'any' | 'never' | 'missingR1' | 'missingR2' | 'missingR3' | 'missingR4' | 'inRound' | 'partial' | 'full';
export type TimeFilter = 'any' | 'none' | 'short' | 'medium' | 'long';

export const SORT_OPTIONS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'default', label: 'Syllabus order', hint: 'As in your syllabus' },
  { key: 'leastRevised', label: 'Least revised first', hint: 'Fewest rounds done' },
  { key: 'mostRevised', label: 'Most revised first', hint: 'Most rounds done' },
  { key: 'oldestCompleted', label: 'First completed', hint: 'Oldest completion first' },
  { key: 'recentlyCompleted', label: 'Recently completed', hint: 'Newest completion first' },
  { key: 'mostTime', label: 'Most time taken', hint: 'Biggest time investment' },
  { key: 'leastTime', label: 'Least time taken', hint: 'Quick topics first' },
  { key: 'stalest', label: 'Longest untouched', hint: 'Not studied / revised for longest' },
  { key: 'srsDue', label: 'Due soonest', hint: 'Spaced-repetition schedule' },
  { key: 'hardest', label: 'Hardest first', hint: 'Hard → Easy' },
  { key: 'priority', label: 'Highest priority', hint: 'Important, stars, exam relevance' },
  { key: 'az', label: 'A → Z', hint: 'Alphabetical' },
];

export const STATUS_LABEL: Record<StatusKey, string> = {
  all: 'All', completed: 'Completed', incomplete: 'Incomplete', in_progress: 'In progress',
  not_started: 'Not started', due: 'Due', weak: 'Weak',
};

export const ROUND_FILTER_OPTIONS: { key: RoundFilter; label: string }[] = [
  { key: 'any', label: 'Any' },
  { key: 'never', label: 'Never revised' },
  { key: 'missingR1', label: 'Missing R1' },
  { key: 'missingR2', label: 'Missing R2' },
  { key: 'missingR3', label: 'Missing R3' },
  { key: 'missingR4', label: 'Missing R4' },
  { key: 'inRound', label: 'Round in progress' },
  { key: 'partial', label: 'Partly revised' },
  { key: 'full', label: 'Fully revised' },
];

export const TIME_FILTER_OPTIONS: { key: TimeFilter; label: string }[] = [
  { key: 'any', label: 'Any' },
  { key: 'none', label: 'No time' },
  { key: 'short', label: '< 30 min' },
  { key: 'medium', label: '30 m – 2 h' },
  { key: 'long', label: '> 2 h' },
];

const isDone = (t: SubTopic, k: RevisionKey) => t.revisions?.[k]?.status === 'complete';
const isRunning = (t: SubTopic, k: RevisionKey) => t.revisions?.[k]?.status === 'in_process';

export function roundsDone(t: SubTopic): number {
  let n = 0;
  for (const k of REVISION_KEYS) if (isDone(t, k)) n++;
  return n;
}
export function hasRoundInProgress(t: SubTopic): boolean {
  return REVISION_KEYS.some(k => isRunning(t, k));
}
export function roundState(t: SubTopic, k: RevisionKey): 'done' | 'active' | 'none' {
  return isDone(t, k) ? 'done' : isRunning(t, k) ? 'active' : 'none';
}
export function revisionMinutes(t: SubTopic): number {
  let n = 0;
  for (const k of REVISION_KEYS) {
    const v = t.revisions?.[k]?.timeSpent;
    if (typeof v === 'number' && isFinite(v) && v > 0) n += v;
  }
  return n;
}
export function studyMinutes(t: SubTopic): number {
  return typeof t.timeSpent === 'number' && isFinite(t.timeSpent) && t.timeSpent > 0 ? t.timeSpent : 0;
}

/** Most recent day this topic was studied or revised ('' if unknown) */
export function lastTouched(t: SubTopic): string {
  let best = t.completedDate || '';
  if (t.lastReviewedDate && t.lastReviewedDate > best) best = t.lastReviewedDate;
  for (const k of REVISION_KEYS) {
    const d = t.revisions?.[k]?.completedDate;
    if (d && d > best) best = d;
  }
  return best;
}

export function daysSince(dateStr: string | undefined, today = getLocalDateStr()): number | null {
  if (!dateStr) return null;
  const a = dateStr.split('-').map(Number);
  const b = today.split('-').map(Number);
  if (a.length !== 3 || b.length !== 3 || a.some(n => !isFinite(n)) || b.some(n => !isFinite(n))) return null;
  const ms = Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2]);
  return Math.max(0, Math.round(ms / 86400000));
}

export function agoLabel(days: number | null): string {
  if (days === null) return 'never';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

export function matchesRoundFilter(t: SubTopic, f: RoundFilter): boolean {
  if (f === 'any') return true;
  const done = roundsDone(t);
  switch (f) {
    case 'never': return done === 0 && !hasRoundInProgress(t);
    case 'missingR1': return !isDone(t, 'R1');
    case 'missingR2': return !isDone(t, 'R2');
    case 'missingR3': return !isDone(t, 'R3');
    case 'missingR4': return !isDone(t, 'R4');
    case 'inRound': return hasRoundInProgress(t);
    case 'partial': return done > 0 && done < REVISION_KEYS.length;
    case 'full': return done === REVISION_KEYS.length;
    default: return true;
  }
}

export function matchesTimeFilter(t: SubTopic, f: TimeFilter): boolean {
  if (f === 'any') return true;
  const m = studyMinutes(t);
  switch (f) {
    case 'none': return m === 0;
    case 'short': return m > 0 && m < 30;
    case 'medium': return m >= 30 && m <= 120;
    case 'long': return m > 120;
    default: return true;
  }
}

const DIFF_RANK: Record<string, number> = { Hard: 0, Medium: 1, Easy: 2 };
const REL_RANK: Record<string, number> = { High: 0, Med: 1, Low: 2 };

function completionKey(t: SubTopic): string {
  return t.completed && t.completedDate ? `${t.completedDate} ${t.completedTime || '00:00'}` : '';
}

/** Returns a comparator for the chosen sort; ties fall back to the original order (the sort is stable). */
export function getComparator(sort: SortKey): ((a: SubTopic, b: SubTopic) => number) | null {
  switch (sort) {
    case 'default': return null;
    case 'leastRevised': return (a, b) => roundsDone(a) - roundsDone(b) || Number(hasRoundInProgress(b)) - Number(hasRoundInProgress(a));
    case 'mostRevised': return (a, b) => roundsDone(b) - roundsDone(a);
    case 'oldestCompleted': return (a, b) => {
      const ka = completionKey(a), kb = completionKey(b);
      if (!ka && !kb) return 0;
      if (!ka) return 1;
      if (!kb) return -1;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    };
    case 'recentlyCompleted': return (a, b) => {
      const ka = completionKey(a), kb = completionKey(b);
      if (!ka && !kb) return 0;
      if (!ka) return 1;
      if (!kb) return -1;
      return ka < kb ? 1 : ka > kb ? -1 : 0;
    };
    case 'mostTime': return (a, b) => studyMinutes(b) - studyMinutes(a);
    case 'leastTime': return (a, b) => studyMinutes(a) - studyMinutes(b);
    case 'stalest': return (a, b) => {
      // topics that were never completed have nothing to be stale about → last
      if (!a.completed && !b.completed) return 0;
      if (!a.completed) return 1;
      if (!b.completed) return -1;
      const ta = lastTouched(a), tb = lastTouched(b);
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    };
    case 'srsDue': return (a, b) => {
      const da = a.completed && a.srsDueDate ? a.srsDueDate : '9999';
      const db = b.completed && b.srsDueDate ? b.srsDueDate : '9999';
      return da < db ? -1 : da > db ? 1 : 0;
    };
    case 'hardest': return (a, b) => (DIFF_RANK[a.difficulty] ?? 3) - (DIFF_RANK[b.difficulty] ?? 3);
    case 'priority': return (a, b) => {
      const sa = (a.important ? 100 : 0) + (a.rank || 0) * 10 + (a.norcetRelevance ? 3 - (REL_RANK[a.norcetRelevance] ?? 3) : 0);
      const sb = (b.important ? 100 : 0) + (b.rank || 0) * 10 + (b.norcetRelevance ? 3 - (REL_RANK[b.norcetRelevance] ?? 3) : 0);
      return sb - sa;
    };
    case 'az': return (a, b) => (a.name || '').localeCompare(b.name || '');
    default: return null;
  }
}

export interface PresetDef {
  id: string; label: string; emoji: string; hint: string;
  status: StatusKey; rounds: RoundFilter; time: TimeFilter; sort: SortKey; important?: boolean;
}

/** One-tap combinations of status + round + time + sort */
export const PRESETS: PresetDef[] = [
  { id: 'needsR1', label: 'Needs R1', emoji: '🎯', hint: 'Completed, never revised', status: 'completed', rounds: 'missingR1', time: 'any', sort: 'oldestCompleted' },
  { id: 'stale', label: 'Going stale', emoji: '🕰️', hint: 'Untouched for the longest', status: 'completed', rounds: 'any', time: 'any', sort: 'stalest' },
  { id: 'timeHogs', label: 'Time hogs', emoji: '⏱️', hint: 'Topics that took the most time', status: 'completed', rounds: 'any', time: 'long', sort: 'mostTime' },
  { id: 'inRound', label: 'Mid-revision', emoji: '🔄', hint: 'A round is in progress', status: 'all', rounds: 'inRound', time: 'any', sort: 'default' },
  { id: 'partial', label: 'Partly revised', emoji: '📈', hint: 'Some rounds done, some left', status: 'completed', rounds: 'partial', time: 'any', sort: 'leastRevised' },
  { id: 'full', label: 'Fully revised', emoji: '🏁', hint: 'R1–R4 all complete', status: 'completed', rounds: 'full', time: 'any', sort: 'recentlyCompleted' },
  { id: 'overdue', label: 'Overdue', emoji: '⏰', hint: 'Spaced-repetition due today', status: 'due', rounds: 'any', time: 'any', sort: 'srsDue' },
  { id: 'vital', label: 'Vital & unrevised', emoji: '⭐', hint: 'Important topics with no revision', status: 'completed', rounds: 'never', time: 'any', sort: 'priority', important: true },
];
