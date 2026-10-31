import type { Subject } from '../types';

/**
 * Sort subjects by their `order` field (ascending).
 * Subjects without an explicit order come last, sorted by name.
 */
export function sortSubjectsByOrder(subjects: Subject[]): Subject[] {
  return [...subjects].sort((a, b) => {
    const oa = a.order ?? Infinity;
    const ob = b.order ?? Infinity;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Ensure all subjects have sequential order values (0, 1, 2, ...).
 * Call this after any reorder operation.
 */
export function normalizeSubjectOrder(subjects: Subject[]): Subject[] {
  const sorted = sortSubjectsByOrder(subjects);
  return sorted.map((s, i) => ({ ...s, order: i }));
}

/**
 * Move a subject up or down by one position.
 * Returns a new array with updated order values.
 */
export function moveSubject(subjects: Subject[], subjectId: string, direction: 'up' | 'down'): Subject[] {
  const sorted = sortSubjectsByOrder(subjects);
  const idx = sorted.findIndex(s => s.id === subjectId);
  if (idx < 0) return subjects;
  if (direction === 'up' && idx === 0) return subjects;
  if (direction === 'down' && idx === sorted.length - 1) return subjects;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  const result = [...sorted];
  [result[idx], result[swapIdx]] = [result[swapIdx], result[idx]];
  return result.map((s, i) => ({ ...s, order: i }));
}
