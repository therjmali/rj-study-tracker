// ═══════════════════════════════════════════════════════════════
// Smart Alerts Engine — Proactive, intelligent study nudges
// ═══════════════════════════════════════════════════════════════

import type { Subject } from '../types';
import type { TodoItem } from '../hooks/useTodos';
import { getLocalDateStr } from './utils';
import { countDueTopics } from './srs';

export interface SmartAlert {
  id: string;
  type: 'srs_due' | 'exam_urgent' | 'streak_risk' | 'neglected_subject' | 'overdue_tasks' | 'milestone' | 'daily_target';
  emoji: string;
  title: string;
  subtitle: string;
  priority: 'high' | 'medium' | 'low';
  color: 'destructive' | 'chart-4' | 'primary' | 'secondary' | 'accent';
  actionLabel: string;
  actionTab: string;
  dismissKey: string;
}

interface SmartAlertInput {
  subjects: Subject[];
  todos: TodoItem[];
  streakDays: number;
  todayTopicsDone: number;
}

export function generateSmartAlerts(input: SmartAlertInput): SmartAlert[] {
  const { subjects, todos, streakDays, todayTopicsDone } = input;
  const alerts: SmartAlert[] = [];
  const today = getLocalDateStr();
  const now = Date.now();

  // 1. SRS Reviews Due
  const srsDue = countDueTopics(subjects);
  if (srsDue > 0) {
    alerts.push({
      id: 'smart-srs-due',
      type: 'srs_due',
      emoji: '📕',
      title: `${srsDue} SRS review${srsDue > 1 ? 's' : ''} due today`,
      subtitle: 'Spaced repetition keeps knowledge fresh — review now!',
      priority: srsDue >= 5 ? 'high' : 'medium',
      color: srsDue >= 5 ? 'destructive' : 'chart-4',
      actionLabel: 'Review →',
      actionTab: 'revision',
      dismissKey: `srs-due-${today}`,
    });
  }

  // 2. Exam Urgency (<14 days away with remaining topics)
  subjects.forEach(s => {
    if (!s.examDate) return;
    const daysLeft = Math.ceil((new Date(s.examDate).getTime() - now) / 86400000);
    if (daysLeft <= 0 || daysLeft > 14) return;
    const totalTopics = s.units.reduce((a, u) => a + u.subTopics.length, 0);
    const remaining = s.units.reduce((a, u) => a + u.subTopics.filter(t => !t.completed).length, 0);
    if (remaining === 0) return;
    alerts.push({
      id: `smart-exam-${s.id}`,
      type: 'exam_urgent',
      emoji: '⚠️',
      title: `${s.shortName} exam in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
      subtitle: `${remaining} of ${totalTopics} topics remaining — focus now!`,
      priority: daysLeft <= 3 ? 'high' : daysLeft <= 7 ? 'high' : 'medium',
      color: daysLeft <= 3 ? 'destructive' : 'chart-4',
      actionLabel: 'Study →',
      actionTab: 'syllabus',
      dismissKey: `exam-${s.id}-${today}`,
    });
  });

  // 3. Streak Risk (no study today + active streak > 2)
  if (todayTopicsDone === 0 && streakDays > 2) {
    alerts.push({
      id: 'smart-streak-risk',
      type: 'streak_risk',
      emoji: '🔥',
      title: `Keep your ${streakDays}-day streak alive!`,
      subtitle: 'Complete at least 1 topic today to maintain it.',
      priority: 'high',
      color: 'chart-4',
      actionLabel: 'Study →',
      actionTab: 'syllabus',
      dismissKey: `streak-risk-${today}`,
    });
  }

  // 4. Neglected Subjects (>5 days no activity)
  subjects.forEach(s => {
    let lastActivity = 0;
    s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completedDate) {
        const d = new Date(t.completedDate + 'T00:00:00').getTime();
        if (d > lastActivity) lastActivity = d;
      }
      if (t.lastReviewedDate) {
        const d = new Date(t.lastReviewedDate + 'T00:00:00').getTime();
        if (d > lastActivity) lastActivity = d;
      }
    }));
    if (lastActivity === 0) return; // never studied — not neglected
    const daysSince = Math.floor((now - lastActivity) / 86400000);
    const hasRemaining = s.units.some(u => u.subTopics.some(t => !t.completed));
    if (daysSince > 5 && hasRemaining) {
      alerts.push({
        id: `smart-neglect-${s.id}`,
        type: 'neglected_subject',
        emoji: '📚',
        title: `Haven't studied ${s.shortName} in ${daysSince} days`,
        subtitle: 'Consistent review prevents forgetting.',
        priority: daysSince > 10 ? 'high' : 'medium',
        color: 'primary',
        actionLabel: 'Resume →',
        actionTab: 'syllabus',
        dismissKey: `neglect-${s.id}-${today}`,
      });
    }
  });

  // 5. Overdue Tasks
  const overdueTodos = todos.filter(t => !t.completed && t.dueDate < today);
  if (overdueTodos.length > 0) {
    alerts.push({
      id: 'smart-overdue-tasks',
      type: 'overdue_tasks',
      emoji: '🎯',
      title: `${overdueTodos.length} overdue task${overdueTodos.length > 1 ? 's' : ''} need attention`,
      subtitle: 'Clear your backlog to stay on track.',
      priority: overdueTodos.length >= 3 ? 'high' : 'medium',
      color: 'destructive',
      actionLabel: 'View →',
      actionTab: 'todos',
      dismissKey: `overdue-${today}`,
    });
  }

  // 6. Milestone approaching (round numbers: 25, 50, 100, 200, 500)
  const totalCompleted = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);
  const milestones = [25, 50, 100, 150, 200, 300, 500, 1000];
  for (const m of milestones) {
    const remaining = m - totalCompleted;
    if (remaining > 0 && remaining <= 5) {
      alerts.push({
        id: `smart-milestone-${m}`,
        type: 'milestone',
        emoji: '⭐',
        title: `${remaining} more topic${remaining > 1 ? 's' : ''} to hit ${m} total!`,
        subtitle: `You've completed ${totalCompleted} topics — almost there!`,
        priority: 'low',
        color: 'secondary',
        actionLabel: 'Go! →',
        actionTab: 'syllabus',
        dismissKey: `milestone-${m}-${today}`,
      });
      break; // Only show nearest milestone
    }
  }

  // 7. Daily target reminder (if >50% of day gone and <50% of daily target)
  const hour = new Date().getHours();
  if (hour >= 14 && todayTopicsDone === 0) {
    alerts.push({
      id: 'smart-daily-target',
      type: 'daily_target',
      emoji: '⏰',
      title: "You haven't completed any topics today",
      subtitle: 'Even 1 topic keeps momentum going.',
      priority: 'medium',
      color: 'chart-4',
      actionLabel: 'Start →',
      actionTab: 'syllabus',
      dismissKey: `daily-target-${today}`,
    });
  }

  // Sort by priority, limit to 5
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Deduplicate by removing daily_target if streak_risk already present
  const types = new Set(alerts.map(a => a.type));
  const filtered = alerts.filter(a => {
    if (a.type === 'daily_target' && types.has('streak_risk')) return false;
    return true;
  });

  return filtered.slice(0, 5);
}
