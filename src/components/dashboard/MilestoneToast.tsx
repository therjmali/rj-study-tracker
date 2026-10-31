import { useEffect, useRef } from 'react';
import { useNotifications } from '../../contexts/NotificationContext';
import type { Subject, DailyLog, StudyGoals } from '../../types';
import { getLocalDateStr, formatStudyHours } from '../../lib/utils';
import { useToday } from '../../hooks/useToday';

interface Props {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  studyGoals: StudyGoals;
}

export default function MilestoneToast({ subjects, dailyLogs, studyGoals }: Props) {
  const { push } = useNotifications();
  const shownRef = useRef<Set<string>>(new Set());
  const today = useToday();

  const todayTopics = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed && t.completedDate === today).length, 0), 0);
  const todayLog = dailyLogs.find(l => l.date === today);
  const todayHours = todayLog?.hoursStudied ?? 0;

  const weekStart = new Date();
  const mwd = weekStart.getDay(); weekStart.setDate(weekStart.getDate() - (mwd === 0 ? 6 : mwd - 1));
  const ws = getLocalDateStr(weekStart);
  let weeklyTopics = 0;
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.completedDate && t.completedDate >= ws) weeklyTopics++;
  })));

  useEffect(() => {
    const milestones: { id: string; emoji: string; title: string; subtitle: string }[] = [];

    if (todayTopics >= studyGoals.dailyTopics && studyGoals.dailyTopics > 0) {
      milestones.push({ id: `daily-topics-${today}`, emoji: '🎯', title: 'Daily Goal Reached!', subtitle: `${todayTopics} topics completed today` });
    }
    if (todayHours >= studyGoals.dailyHours && studyGoals.dailyHours > 0) {
      milestones.push({ id: `daily-hours-${today}`, emoji: '⏱️', title: 'Study Hours Goal!', subtitle: `${formatStudyHours(todayHours)} studied today` });
    }
    if (weeklyTopics >= studyGoals.weeklyTopics && studyGoals.weeklyTopics > 0) {
      milestones.push({ id: `weekly-${ws}`, emoji: '🏆', title: 'Weekly Goal Crushed!', subtitle: `${weeklyTopics} topics this week` });
    }

    const totalDone = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);
    [50, 100, 200, 500, 1000].forEach(n => {
      if (totalDone >= n) milestones.push({ id: `total-${n}`, emoji: '🌟', title: `${n} Topics Done!`, subtitle: 'Amazing progress!' });
    });

    const unshown = milestones.find(m => !shownRef.current.has(m.id));
    if (unshown) {
      shownRef.current.add(unshown.id);
      push({
        emoji: unshown.emoji,
        title: unshown.title,
        subtitle: unshown.subtitle,
        position: 'top',
        duration: 4000,
      });
    }
  }, [todayTopics, todayHours, weeklyTopics, studyGoals, today, ws, subjects, push]);

  return null; // rendering handled by NotificationContainer
}
