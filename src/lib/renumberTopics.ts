import type { Subject } from '../types';

/**
 * Renumber all topicNumber values across a subject sequentially.
 * When showTopicNumbers is ON: assigns 1, 2, 3, … across all units in order.
 * When showTopicNumbers is OFF: clears all topicNumber values.
 */
export function renumberTopicNumbers(subject: Subject): Subject {
  if (!subject.showTopicNumbers) {
    // Clear all topic numbers when feature is disabled
    const hasAny = subject.units.some(u => u.subTopics.some(t => t.topicNumber != null));
    if (!hasAny) return subject;
    return {
      ...subject,
      units: subject.units.map(u => ({
        ...u,
        subTopics: u.subTopics.map(t =>
          t.topicNumber != null ? { ...t, topicNumber: undefined } : t
        ),
      })),
    };
  }

  // Assign sequential numbers: 1, 2, 3, ...
  let counter = 0;
  return {
    ...subject,
    units: subject.units.map(u => ({
      ...u,
      subTopics: u.subTopics.map(t => {
        counter++;
        return t.topicNumber === counter ? t : { ...t, topicNumber: counter };
      }),
    })),
  };
}
