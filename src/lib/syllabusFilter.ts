/**
 * Deep recursive filtering for Syllabus Tracker.
 * Filters topics → hides empty modules/submodules → hides empty units → hides empty subjects.
 */
import type { Subject, SubTopic, Unit, RevisionKey } from '../types';
import type { StatusFilter } from '../components/shared/StatusFilterPills';
import type { DiffFilter } from '../components/syllabus/SyllabusHeader';
import { getLocalDateStr } from './utils';
import { normalizeText, tokenizeQuery } from './searchUtils';

export interface SyllabusFilterState {
  status: StatusFilter;
  difficulty: DiffFilter;
  search: string;
  deepSearch?: boolean;
  /** Subject-level: only completed topics that still miss this revision round */
  revisionMissing?: RevisionKey | null;
}

/** Check if a single topic matches the active filters */
export function topicMatchesFilter(t: SubTopic, filters: SyllabusFilterState): boolean {
  // Revision round filter (completed topics still missing the round)
  const rm = filters.revisionMissing;
  if (rm && (!t.completed || t.revisions?.[rm]?.status === 'complete')) return false;

  // Status filter
  const sf = filters.status;
  if (sf === 'complete' && !t.completed) return false;
  if (sf === 'in_process' && t.status !== 'in_process') return false;
  if (sf === 'incomplete' && (t.completed || t.status === 'in_process')) return false;
  if (sf === 'important' && !t.important) return false;
  if (sf === 'focus' && (t.completed || !t.important)) return false;
  if (sf === 'revision_due') {
    const today = getLocalDateStr();
    if (!t.completed || !t.srsDueDate || t.srsDueDate > today) return false;
  }
  if (sf === 'has_time' && (!t.timeSpent || t.timeSpent <= 0)) return false;

  // Difficulty filter
  const df = filters.difficulty;
  if (df !== 'all' && t.difficulty !== df) return false;

  return true;
}

// ── Search: normalised, multi-word (AND), cached per topic object ────────────────
// A topic's searchable text is built once and cached on the (immutable) topic object,
// so typing in a search box never re-lower-cases thousands of strings per keystroke.
interface TopicSearchText { base: string; deep: string }
const topicTextCache = new WeakMap<object, TopicSearchText>();

function getTopicSearchText(t: SubTopic): TopicSearchText {
  let hit = topicTextCache.get(t);
  if (hit) return hit;
  const tags = Array.isArray(t.tags) ? t.tags.map(x => String(x || '')).join(' ') : '';
  const base = normalizeText(`${t.name || ''} ${tags} ${t.module || ''} ${t.subModule || ''}`);
  const notesArr = Array.isArray(t.notesArr) ? t.notesArr.map(n => (typeof n === 'string' ? n : '')).join(' ') : '';
  const res = Array.isArray(t.resourceLinks) ? t.resourceLinks.map(r => `${r?.title || ''} ${r?.url || ''}`).join(' ') : '';
  const att = Array.isArray(t.attachments) ? t.attachments.map(a => String(a?.name || '')).join(' ') : '';
  const deep = normalizeText(`${t.notes || ''} ${notesArr} ${res} ${att}`);
  hit = { base, deep };
  topicTextCache.set(t, hit);
  return hit;
}

/** Check if a topic matches the search query (every word must match somewhere). */
export function topicMatchesSearch(t: SubTopic, unitName: string, subjectName: string, search: string, deepSearch?: boolean): boolean {
  if (!search) return true;
  try {
    const tokens = tokenizeQuery(search);
    if (tokens.length === 0) return true;
    const { base, deep } = getTopicSearchText(t);
    const unit = normalizeText(unitName);
    const subject = normalizeText(subjectName);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (base.includes(tok) || unit.includes(tok) || subject.includes(tok)) continue;
      if (deepSearch && deep.includes(tok)) continue;
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Deep-filter subjects: returns only subjects/units that contain matching topics */
export function deepFilterSubjects(
  subjects: Subject[],
  filters: SyllabusFilterState,
): Subject[] {
  const hasActiveFilter = filters.status !== 'all' || filters.difficulty !== 'all' || !!filters.search;
  if (!hasActiveFilter) return subjects;

  return subjects
    .map(subject => {
      const filteredUnits = subject.units
        .map(unit => {
          const filteredTopics = unit.subTopics.filter(t =>
            topicMatchesFilter(t, filters) &&
            topicMatchesSearch(t, unit.name, subject.name, filters.search, filters.deepSearch)
          );
          if (filteredTopics.length === 0) return null;
          return { ...unit, subTopics: filteredTopics };
        })
        .filter(Boolean) as Unit[];

      if (filteredUnits.length === 0) return null;
      return { ...subject, units: filteredUnits };
    })
    .filter(Boolean) as Subject[];
}

/** Compute filter counts from unfiltered subjects */
export function computeFilterCounts(subjects: Subject[]) {
  const today = getLocalDateStr();
  const status: Partial<Record<StatusFilter, number>> = {
    all: 0, complete: 0, in_process: 0, incomplete: 0,
    important: 0, focus: 0, revision_due: 0, has_time: 0,
  };
  const diff: Record<DiffFilter, number> = { all: 0, Easy: 0, Medium: 0, Hard: 0 };

  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    status.all = (status.all || 0) + 1;
    diff.all++;

    if (t.completed) status.complete = (status.complete || 0) + 1;
    else if (t.status === 'in_process') status.in_process = (status.in_process || 0) + 1;
    else status.incomplete = (status.incomplete || 0) + 1;

    if (t.important) status.important = (status.important || 0) + 1;
    if (!t.completed && t.important) status.focus = (status.focus || 0) + 1;
    if (t.completed && t.srsDueDate && t.srsDueDate <= today) status.revision_due = (status.revision_due || 0) + 1;
    if (t.timeSpent && t.timeSpent > 0) status.has_time = (status.has_time || 0) + 1;

    if (t.difficulty === 'Easy') diff.Easy++;
    else if (t.difficulty === 'Medium') diff.Medium++;
    else if (t.difficulty === 'Hard') diff.Hard++;
  })));

  return { status, diff };
}

/** Get IDs of subjects and units that have matching topics */
export function getMatchingIds(
  subjects: Subject[],
  filters: SyllabusFilterState,
): { subjectIds: Set<string>; unitIds: Set<string> } {
  const subjectIds = new Set<string>();
  const unitIds = new Set<string>();

  subjects.forEach(s => {
    s.units.forEach(u => {
      const hasMatch = u.subTopics.some(t =>
        topicMatchesFilter(t, filters) &&
        topicMatchesSearch(t, u.name, s.name, filters.search, filters.deepSearch)
      );
      if (hasMatch) {
        subjectIds.add(s.id);
        unitIds.add(u.id);
      }
    });
  });

  return { subjectIds, unitIds };
}
