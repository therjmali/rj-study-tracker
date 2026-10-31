import type { Subject, DailyLog } from '../types';

export interface ReadinessData {
  score: number;
  topicsCompleted: number;
  totalTopics: number;
  daysRemaining: number;
  requiredTopicsPerDay: number;
  currentPace: number;
  willFinishOnTime: boolean;
  predictedCompletion: number;
  weakSubjects: string[];
}

export function computeReadiness(
  subjects: Subject[],
  dailyLogs: DailyLog[],
  examDate: string
): ReadinessData {
  let totalTopics = 0;
  let topicsCompleted = 0;
  let hardTotal = 0;
  let hardDone = 0;
  let impTotal = 0;
  let impDone = 0;

  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    totalTopics++;
    if (t.completed) topicsCompleted++;
    if (t.difficulty === 'Hard') { hardTotal++; if (t.completed) hardDone++; }
    if (t.important) { impTotal++; if (t.completed) impDone++; }
  })));

  const daysRemaining = Math.max(0, Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000));
  const remaining = totalTopics - topicsCompleted;
  const requiredTopicsPerDay = daysRemaining > 0 ? remaining / daysRemaining : remaining;

  // 7-day rolling average pace
  const last7 = dailyLogs.slice(-7);
  const topicsLast7 = last7.reduce((a, d) => a + d.topicsCompleted, 0);
  const currentPace = last7.length > 0 ? topicsLast7 / Math.max(1, last7.length) : 0;

  const projectedDone = topicsCompleted + currentPace * daysRemaining;
  const predictedCompletion = totalTopics > 0 ? Math.min(100, Math.round((projectedDone / totalTopics) * 100)) : 0;
  const willFinishOnTime = projectedDone >= totalTopics;

  // Score: (topicScore × 0.6) + (paceScore × 0.25) + (hardTopicsScore × 0.15)
  const topicScore = totalTopics > 0 ? (topicsCompleted / totalTopics) * 100 : 0;
  const paceScore = willFinishOnTime ? 100 : Math.min(100, (currentPace / Math.max(0.1, requiredTopicsPerDay)) * 100);
  const hardScore = hardTotal > 0 ? (hardDone / hardTotal) * 100 : 100;
  const score = Math.round(topicScore * 0.6 + paceScore * 0.25 + hardScore * 0.15);

  // Weak subjects: < 30% done with < 20 days to exam
  const weakSubjects: string[] = [];
  subjects.forEach(s => {
    const all = s.units.flatMap(u => u.subTopics);
    const done = all.filter(t => t.completed).length;
    const pct = all.length > 0 ? (done / all.length) * 100 : 100;
    const days = Math.max(0, Math.ceil((new Date(s.examDate).getTime() - Date.now()) / 86400000));
    if (pct < 40 && days < 30) weakSubjects.push(s.shortName);
  });

  return { score, topicsCompleted, totalTopics, daysRemaining, requiredTopicsPerDay, currentPace, willFinishOnTime, predictedCompletion, weakSubjects };
}

export function getSmartPriority(subjects: Subject[]): { subject: string; reason: string } | null {
  let worst: { subject: string; reason: string; urgency: number } | null = null as { subject: string; reason: string; urgency: number } | null;

  subjects.forEach(s => {
    const all = s.units.flatMap(u => u.subTopics);
    const hardPending = all.filter(t => !t.completed && t.difficulty === 'Hard');
    const days = Math.max(0, Math.ceil((new Date(s.examDate).getTime() - Date.now()) / 86400000));
    if (days <= 0) return;
    const urgency = hardPending.length / days;
    if (hardPending.length > 0 && (!worst || urgency > worst.urgency)) {
      worst = { subject: s.shortName, reason: `${hardPending.length} Hard topics pending, ${days} days to exam`, urgency };
    }
  });

  return worst ? { subject: worst.subject, reason: worst.reason } : null;
}

export function getStudyVelocity(dailyLogs: DailyLog[], days: number = 30): { date: string; topics: number }[] {
  return dailyLogs.slice(-days).map(d => ({ date: d.date.slice(5), topics: d.topicsCompleted }));
}
