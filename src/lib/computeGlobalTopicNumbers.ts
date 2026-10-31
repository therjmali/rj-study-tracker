import type { Subject } from '../types';

/**
 * Dynamically compute global sequential topic numbers (1..N) across all units in a subject.
 * Pure function — no mutation, no storage. Just walks units in order and assigns display indices.
 * Always computes numbers regardless of showTopicNumbers setting — the display layer decides visibility.
 */
export function computeGlobalTopicNumbers(subject: Subject): Map<string, number> {
  const map = new Map<string, number>();
  let counter = 0;
  for (const unit of subject.units) {
    for (const topic of unit.subTopics) {
      counter++;
      map.set(topic.id, counter);
    }
  }
  return map;
}
