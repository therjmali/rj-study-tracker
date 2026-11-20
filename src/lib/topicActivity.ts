/**
 * Topic activity = the main topic PLUS its revision rounds (R1–R4).
 *
 * A revision is treated exactly like studying a topic:
 *   - the minutes logged on a round (revisions[Rk].timeEntries) are study time on that date;
 *   - a round that is 'complete' counts as one topic completed on its completedDate.
 *
 * Every statistic (day minutes, progress calendar, streak, goals, reports …) goes through these
 * helpers so a revision can never be counted in one screen and forgotten in another.
 * Pure functions, no React. Tolerant of topics with no `revisions`, no dates or no time.
 */
import { REVISION_KEYS } from '../types';
import type { RevisionKey } from '../types';

interface EntryLike { date: string; minutes: number; time?: string; note?: string }
interface RoundLike { status?: string; completedDate?: string; completedTime?: string; timeSpent?: number; timeEntries?: EntryLike[] }
export interface TopicActivityLike {
  id?: string;
  completed?: boolean;
  completedDate?: string;
  timeSpent?: number;
  timeEntries?: EntryLike[];
  revisions?: Partial<Record<RevisionKey, RoundLike | undefined>>;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Minutes logged on all revision rounds of the topic (all time). */
export function revisionMinutes(t: TopicActivityLike): number {
  const revs = t.revisions;
  if (!revs) return 0;
  let n = 0;
  for (const k of REVISION_KEYS) {
    const r = revs[k];
    if (!r) continue;
    if (finite(r.timeSpent) && r.timeSpent > 0) n += r.timeSpent;
    else if (r.timeEntries) for (const e of r.timeEntries) if (e && finite(e.minutes) && e.minutes > 0) n += e.minutes;
  }
  return n;
}

/** Minutes logged on revision rounds on ONE date. */
export function revisionMinutesOn(t: TopicActivityLike, date: string): number {
  const revs = t.revisions;
  if (!revs) return 0;
  let n = 0;
  for (const k of REVISION_KEYS) {
    const r = revs[k];
    if (!r?.timeEntries) continue;
    for (const e of r.timeEntries) if (e && e.date === date && finite(e.minutes) && e.minutes > 0) n += e.minutes;
  }
  return n;
}

/** Calls `fn` for every revision time entry of the topic (round key included). */
export function forEachRevisionEntry(t: TopicActivityLike, fn: (e: EntryLike, round: RevisionKey, r: RoundLike) => void): void {
  const revs = t.revisions;
  if (!revs) return;
  for (const k of REVISION_KEYS) {
    const r = revs[k];
    if (!r?.timeEntries) continue;
    for (const e of r.timeEntries) if (e && e.date && finite(e.minutes) && e.minutes > 0) fn(e, k, r);
  }
}

/** Every dated time entry of the topic: main entries first, then revision entries. */
export function allTopicEntries(t: TopicActivityLike): EntryLike[] {
  const out: EntryLike[] = t.timeEntries ? t.timeEntries.slice() : [];
  forEachRevisionEntry(t, e => { out.push(e); });
  return out;
}

/** A completed revision round with a usable date. */
export interface RevisionCompletion { round: RevisionKey; date: string; time?: string }

export function revisionCompletions(t: TopicActivityLike): RevisionCompletion[] {
  const revs = t.revisions;
  if (!revs) return [];
  const out: RevisionCompletion[] = [];
  for (const k of REVISION_KEYS) {
    const r = revs[k];
    if (r?.status === 'complete' && r.completedDate) out.push({ round: k, date: r.completedDate, time: r.completedTime });
  }
  return out;
}

/** Number of topic completions (main + revision rounds) on ONE date. */
export function completionsOn(t: TopicActivityLike, date: string): number {
  let n = t.completed && t.completedDate === date ? 1 : 0;
  const revs = t.revisions;
  if (revs) for (const k of REVISION_KEYS) { const r = revs[k]; if (r?.status === 'complete' && r.completedDate === date) n++; }
  return n;
}

/** Revision-only completions on ONE date (for "x new · y revision" breakdowns). */
export function revisionCompletionsOn(t: TopicActivityLike, date: string): number {
  let n = 0;
  const revs = t.revisions;
  if (revs) for (const k of REVISION_KEYS) { const r = revs[k]; if (r?.status === 'complete' && r.completedDate === date) n++; }
  return n;
}

/** Number of topic completions (main + revision rounds) in an inclusive date range. */
export function completionsInRange(t: TopicActivityLike, from: string, to: string): number {
  let n = t.completed && t.completedDate && t.completedDate >= from && t.completedDate <= to ? 1 : 0;
  const revs = t.revisions;
  if (revs) for (const k of REVISION_KEYS) { const r = revs[k]; if (r?.status === 'complete' && r.completedDate && r.completedDate >= from && r.completedDate <= to) n++; }
  return n;
}

/** Revision-only completions in an inclusive date range. */
export function revisionCompletionsInRange(t: TopicActivityLike, from: string, to: string): number {
  let n = 0;
  const revs = t.revisions;
  if (revs) for (const k of REVISION_KEYS) { const r = revs[k]; if (r?.status === 'complete' && r.completedDate && r.completedDate >= from && r.completedDate <= to) n++; }
  return n;
}

/** Every date the topic was completed or revised (completion dates + time-entry dates). Used for streaks & active days. */
export function addActivityDates(t: TopicActivityLike, into: Set<string>): void {
  if (t.completed && t.completedDate) into.add(t.completedDate);
  if (t.timeEntries) for (const e of t.timeEntries) if (e && e.date && finite(e.minutes) && e.minutes > 0) into.add(e.date);
  const revs = t.revisions;
  if (!revs) return;
  for (const k of REVISION_KEYS) {
    const r = revs[k];
    if (!r) continue;
    if (r.status === 'complete' && r.completedDate) into.add(r.completedDate);
    if (r.timeEntries) for (const e of r.timeEntries) if (e && e.date && finite(e.minutes) && e.minutes > 0) into.add(e.date);
  }
}

/** Calls `fn(date)` once per completed revision round that has a date. */
export function forEachRevisionCompletion(t: TopicActivityLike, fn: (date: string, round: RevisionKey) => void): void {
  for (const c of revisionCompletions(t)) fn(c.date, c.round);
}

/** True when the topic (or one of its revision rounds) was completed OR had study time on `date`. */
export function topicTouchedOn(t: TopicActivityLike, date: string): boolean {
  if (completionsOn(t, date) > 0) return true;
  if (t.timeEntries) for (const e of t.timeEntries) if (e && e.date === date && finite(e.minutes) && e.minutes > 0) return true;
  return revisionMinutesOn(t, date) > 0;
}

/** Minutes logged on ONE revision round on ONE date. */
export function revisionRoundMinutesOn(t: TopicActivityLike, round: RevisionKey, date: string): number {
  const r = t.revisions?.[round];
  if (!r?.timeEntries) return 0;
  let n = 0;
  for (const e of r.timeEntries) if (e && e.date === date && finite(e.minutes) && e.minutes > 0) n += e.minutes;
  return n;
}
