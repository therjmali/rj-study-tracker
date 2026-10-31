import type { Subject, SubTopic } from '../types';

export interface StudySuggestion {
  topic: SubTopic;
  subjectId: string;
  subjectName: string;
  subjectShortName: string;
  subjectColor: string;
  unitId: string;
  unitName: string;
  score: number;
  reasons: string[];
}

export function getStudySuggestions(subjects: Subject[], limit = 5): StudySuggestion[] {
  const now = Date.now();
  const suggestions: StudySuggestion[] = [];

  subjects.forEach(s => {
    const daysToExam = Math.max(0, Math.ceil((new Date(s.examDate).getTime() - now) / 86400000));
    const urgencyScore = daysToExam <= 3 ? 10 : daysToExam <= 7 ? 7 : daysToExam <= 14 ? 4 : daysToExam <= 30 ? 2 : 1;

    s.units.forEach(u => {
      u.subTopics.forEach(t => {
        if (t.completed) return;

        const reasons: string[] = [];
        let score = 0;

        // Exam proximity (max 30)
        score += urgencyScore * 3;
        if (urgencyScore >= 7) reasons.push(`Exam in ${daysToExam}d`);

        // Difficulty (Hard=9, Medium=6, Easy=3)
        const diffScore = t.difficulty === 'Hard' ? 3 : t.difficulty === 'Medium' ? 2 : 1;
        score += diffScore * 3;
        if (t.difficulty === 'Hard') reasons.push('Hard topic');

        // Importance (max 6)
        if (t.important) { score += 6; reasons.push('Important'); }

        // SRS overdue (max 6)
        if (t.srsDueDate && new Date(t.srsDueDate).getTime() < now) {
          score += 6;
          reasons.push('Review due');
        }

        // In-process bonus (max 4)
        if (t.status === 'in_process') { score += 4; reasons.push('In progress'); }

        // NORCET relevance
        if (t.norcetRelevance === 'High') { score += 3; reasons.push('NORCET High'); }

        suggestions.push({
          topic: t,
          subjectId: s.id,
          subjectName: s.name,
          subjectShortName: s.shortName,
          subjectColor: s.color,
          unitId: u.id,
          unitName: u.name,
          score,
          reasons,
        });
      });
    });
  });

  return suggestions.sort((a, b) => b.score - a.score).slice(0, limit);
}

export type DifficultyFilter = 'all' | 'Easy' | 'Medium' | 'Hard';

export function filterByDifficulty<T extends { difficulty?: string }>(items: T[], filter: DifficultyFilter): T[] {
  if (filter === 'all') return items;
  return items.filter(i => i.difficulty === filter);
}
