import type { Subject } from '../types';

/**
 * Re-order ONE group of subjects (the root subjects, or the subjects of one folder) from a list of ids.
 * The group is rewritten inside the slots it already occupies and gets `order` 0..n-1; every subject outside the
 * group stays exactly where it was, so other groups and other screens are untouched.
 * Returns the same array when the ids are not a valid, complete group.
 */
export function reorderSubjectGroup(subjects: Subject[], ids: string[]): Subject[] {
  const group = new Set(ids);
  if (group.size !== ids.length) return subjects;
  const byId = new Map(subjects.map(s => [s.id, s]));
  const ordered = ids.map(id => byId.get(id));
  if (ordered.some(s => !s)) return subjects;
  let k = 0;
  return subjects.map(s => (group.has(s.id) ? { ...(ordered[k] as Subject), order: k++ } : s));
}

/** Re-order folders from a list of ids (ids not listed keep their relative order after the listed ones). */
export function reorderFolderIds<T extends { id: string; order: number }>(folders: T[], ids: string[]): T[] {
  const byId = new Map(folders.map(f => [f.id, f]));
  const listed = ids.map((id, i) => { const f = byId.get(id); return f ? { ...f, order: i } : null; }).filter(Boolean) as T[];
  const rest = folders.filter(f => !ids.includes(f.id)).map((f, i) => ({ ...f, order: listed.length + i }));
  return [...listed, ...rest];
}
