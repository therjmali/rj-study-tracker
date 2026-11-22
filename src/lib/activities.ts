import { sessionActivity } from './studySlices';

/** The ways a student logs time by hand. Older tags (Video, Seminar, Practice, Revision …) still display on old sessions. */
export const ACTIVITY_CHOICES: { id: string; icon: string; hint: string }[] = [
  { id: 'MCQ', icon: '📝', hint: 'Practice questions' },
  { id: 'Self-Study', icon: '📖', hint: 'Reading & notes' },
  { id: 'Lecture', icon: '🎓', hint: 'Class or video' },
  { id: 'Other', icon: '📦', hint: 'Anything else' },
  { id: 'Custom', icon: '✏️', hint: 'Your own label' },
];
export const BASE_ACTIVITIES = ['MCQ', 'Self-Study', 'Lecture', 'Other'];

/**
 * What to show on a session's badge: "[MCQ] x" → "MCQ"; a timer session "[Stopwatch · MCQ] x" → "MCQ";
 * a plain timer session "[Stopwatch] x" → "Stopwatch".
 */
export function activityLabel(description?: string): string | null {
  const tag = sessionActivity(description);
  if (!tag) return null;
  const i = tag.indexOf('·');
  return (i >= 0 ? tag.slice(i + 1) : tag).trim() || tag;
}

/** The note part of a description / note, without its "[Activity]" tag. */
export function stripActivityTag(text?: string): string {
  return (text || '').replace(/^\s*\[[^\]]+\]\s*/, '').trim();
}
