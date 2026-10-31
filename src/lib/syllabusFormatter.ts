/**
 * Syllabus Copy Formatter
 * Produces a rich, hierarchically-structured text that mirrors
 * the original syllabus format with proper numbering and levels.
 *
 * Format:
 *   ✦ UNIT 03 — UNIT NAME
 *
 *   ✦ 3.1 Module Name
 *     • Topic A
 *     • Topic B
 *
 *     ▸ Sub-Module Name
 *       • Topic C
 *       • Topic D
 */

import type { SubTopic } from '../types';
import { getCleanName } from './utils';

// ── Number emoji map ──
const NUM_EMOJI: Record<number, string> = {
  0: '0️⃣', 1: '1️⃣', 2: '2️⃣', 3: '3️⃣', 4: '4️⃣',
  5: '5️⃣', 6: '6️⃣', 7: '7️⃣', 8: '8️⃣', 9: '9️⃣',
};

/** Convert a number to emoji digits: 3 → "3️⃣", 12 → "1️⃣2️⃣" */
function toEmojiNum(n: number): string {
  return String(n).split('').map(d => NUM_EMOJI[parseInt(d)] || d).join('');
}

interface SubModuleGroup {
  name: string;
  topics: SubTopic[];
}

interface ModuleGroup {
  name: string;
  directTopics: SubTopic[];
  subModules: SubModuleGroup[];
}

/** Build the module/submodule hierarchy from a flat topic list */
function buildHierarchy(subTopics: SubTopic[]): ModuleGroup[] {
  const groups: ModuleGroup[] = [];
  const map = new Map<string, ModuleGroup>();

  subTopics.forEach(t => {
    const modKey = t.module || '__direct__';
    let group = map.get(modKey);
    if (!group) {
      group = { name: modKey, directTopics: [], subModules: [] };
      map.set(modKey, group);
      groups.push(group);
    }
    if (t.subModule) {
      let sm = group.subModules.find(s => s.name === t.subModule);
      if (!sm) {
        sm = { name: t.subModule!, topics: [] };
        group.subModules.push(sm);
      }
      sm.topics.push(t);
    } else {
      group.directTopics.push(t);
    }
  });

  return groups;
}

// ═══════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════

/**
 * Format an entire unit's syllabus for clipboard.
 * Produces the canonical hierarchical format with emoji numbers.
 */
export function formatUnitSyllabus(
  unitIndex: number,
  unitName: string,
  subTopics: SubTopic[],
): string {
  const unitNum = unitIndex + 1;
  const cleanName = unitName.replace(/^Unit\s+\d+\s*:\s*/i, '').trim();

  const lines: string[] = [];

  // ── Header ──
  lines.push(`✦ UNIT ${toEmojiNum(unitNum)} — ${cleanName.toUpperCase()}`);
  lines.push('');

  const groups = buildHierarchy(subTopics);

  let moduleIdx = 0;

  groups.forEach(group => {
    if (group.name === '__direct__') {
      // Direct topics (no module)
      group.directTopics.forEach(t => {
        lines.push(`• ${getCleanName(t.name)}`);
      });
      if (group.directTopics.length > 0) lines.push('');
    } else {
      moduleIdx++;
      // Module header with numbering
      lines.push(`✦ ${toEmojiNum(unitNum)}.${toEmojiNum(moduleIdx)} ${group.name}`);

      // Direct topics under this module
      group.directTopics.forEach(t => {
        lines.push(`  • ${getCleanName(t.name)}`);
      });

      // Sub-modules
      group.subModules.forEach(sm => {
        lines.push('');
        lines.push(`  ▸ ${sm.name}`);
        sm.topics.forEach(t => {
          lines.push(`    • ${getCleanName(t.name)}`);
        });
      });

      lines.push('');
    }
  });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Format a single module's content for clipboard.
 * Used when copying a module/folder group.
 */
export function formatModuleSyllabus(
  unitIndex: number,
  moduleIndex: number,
  moduleName: string,
  directTopics: SubTopic[],
  subModules: SubModuleGroup[],
): string {
  const unitNum = unitIndex + 1;
  const lines: string[] = [];

  lines.push(`✦ ${toEmojiNum(unitNum)}.${toEmojiNum(moduleIndex)} ${moduleName}`);

  directTopics.forEach(t => {
    lines.push(`  • ${getCleanName(t.name)}`);
  });

  subModules.forEach(sm => {
    lines.push('');
    lines.push(`  ▸ ${sm.name}`);
    sm.topics.forEach(t => {
      lines.push(`    • ${getCleanName(t.name)}`);
    });
  });

  return lines.join('\n').trim();
}

/**
 * Format a sub-module's content for clipboard.
 */
export function formatSubModuleSyllabus(
  subModuleName: string,
  topics: SubTopic[],
): string {
  const lines: string[] = [];
  lines.push(`▸ ${subModuleName}`);
  topics.forEach(t => {
    lines.push(`  • ${getCleanName(t.name)}`);
  });
  return lines.join('\n').trim();
}

/**
 * Format a topic's full details for clipboard.
 */
export function formatTopicDetail(topic: SubTopic): string {
  const lines = [getCleanName(topic.name)];

  if (topic.topicNumber) {
    lines.push(`  🔢 #${String(topic.topicNumber).padStart(3, '0')}`);
  }
  if (topic.difficulty) {
    const diffEmoji = topic.difficulty === 'Easy' ? '🟢' : topic.difficulty === 'Medium' ? '🟡' : '🔴';
    lines.push(`  ${diffEmoji} Difficulty: ${topic.difficulty}`);
  }
  if (topic.important) {
    lines.push(`  ⭐ Important`);
  }
  if (topic.completed && topic.completedDate) {
    lines.push(`  ✅ Completed: ${topic.completedDate}`);
  }
  if (topic.status === 'in_process') {
    lines.push(`  🔄 In Progress`);
  }
  if (topic.timeSpent > 0) {
    const h = Math.floor(topic.timeSpent / 60);
    const m = topic.timeSpent % 60;
    lines.push(`  ⏱️ Time: ${h > 0 ? `${h}h ` : ''}${m}m`);
  }
  if (topic.notes) {
    lines.push(`  📝 ${topic.notes.slice(0, 300)}`);
  }
  if (topic.tags && topic.tags.length > 0) {
    lines.push(`  🏷️ ${topic.tags.join(', ')}`);
  }

  return lines.length > 1 ? lines.join('\n') : topic.name;
}

/** Simple unit name header for step-1 copy */
export function formatUnitHeader(unitIndex: number, unitName: string): string {
  const cleanName = unitName.replace(/^Unit\s+\d+\s*:\s*/i, '').trim();
  return `✦ UNIT ${toEmojiNum(unitIndex + 1)} — ${cleanName.toUpperCase()}`;
}
