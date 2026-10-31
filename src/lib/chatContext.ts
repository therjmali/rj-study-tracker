/**
 * Deep personalization context builder for NurseBot AI.
 * Computes rich user-specific data from subjects, dailyLogs, settings, and exams
 * to inject into the AI system prompt for hyper-personalized responses.
 */
import type { Subject, DailyLog, UserSettings, ExamConfig, DbStudySession } from '../types';
import { getLocalDateStr, formatStudyTime, getUnifiedTotalMinutes } from './utils';
import { computeStreak, getLevel, computeXP } from './gamification';

export function buildChatContext(
  subjects: Subject[],
  dailyLogs: DailyLog[],
  settings?: UserSettings,
  exams?: ExamConfig[],
  userName?: string,
  dbSessions?: DbStudySession[],
): string | undefined {
  if (subjects.length === 0) return undefined;

  const parts: string[] = [];
  const todayStr = getLocalDateStr();

  // ── Core stats ──
  let totalTopics = 0, doneTopics = 0, importantTotal = 0, importantDone = 0;
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    totalTopics++;
    if (t.completed) doneTopics++;
    if (t.important) { importantTotal++; if (t.completed) importantDone++; }
  })));
  const overallPct = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0;
  const totalMins = getUnifiedTotalMinutes(subjects, dbSessions, dailyLogs);
  const streak = computeStreak(subjects, dailyLogs, dbSessions);
  const xp = computeXP(subjects, dailyLogs, dbSessions);
  const syllabusPct = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0;
  const level = getLevel(xp, syllabusPct);

  // ── Student identity ──
  parts.push(`=== 🩺 STUDENT PROFILE ===`);
  if (userName) parts.push(`Name: ${userName}`);
  parts.push(`Level: ${level.level} "${level.title}" ${level.icon} | XP: ${xp} | Streak: ${streak}d`);
  parts.push(`Overall: ${overallPct}% (${doneTopics}/${totalTopics} topics) | Time: ${formatStudyTime(totalMins)}`);
  if (importantTotal > 0) {
    const impPct = Math.round((importantDone / importantTotal) * 100);
    parts.push(`Important topics: ${impPct}% (${importantDone}/${importantTotal})`);
  }

  // ── Study Goals ──
  if (settings?.studyGoals) {
    const g = settings.studyGoals;
    parts.push(`\n--- Study Goals ---`);
    parts.push(`Daily: ${g.dailyHours}h / ${g.dailyTopics} topics | Weekly: ${g.weeklyHours}h / ${g.weeklyTopics} topics | Monthly: ${g.monthlyHours}h / ${g.monthlyTopics} topics`);
  }

  // ── Today's Activity ──
  let todayDone = 0, todayMins = 0;
  const todayTopicNames: string[] = [];
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.completedDate === todayStr) {
      todayDone++;
      todayMins += t.timeSpent || 0;
      if (todayTopicNames.length < 5) todayTopicNames.push(`${s.shortName}/${t.name}`);
    }
  })));
  const todayLog = dailyLogs.find(l => l.date === todayStr);
  parts.push(`\n--- Today's Activity ---`);
  parts.push(`Topics done today: ${todayDone}${settings?.studyGoals ? `/${settings.studyGoals.dailyTopics} target` : ''}`);
  parts.push(`Time today: ${formatStudyTime(todayMins)}${settings?.studyGoals ? `/${settings.studyGoals.dailyHours}h target` : ''}`);
  if (todayTopicNames.length > 0) parts.push(`Completed: ${todayTopicNames.join(', ')}`);
  if (todayLog?.mood) parts.push(`Today's mood: ${todayLog.mood}`);

  // ── First topic & milestones ──
  let firstTopic: { name: string; subject: string; date: string } | undefined;
  for (const s of subjects) {
    for (const u of s.units) {
      for (const t of u.subTopics) {
        if (t.completed && t.completedDate) {
          if (!firstTopic || t.completedDate < firstTopic.date) {
            firstTopic = { name: t.name, subject: s.shortName, date: t.completedDate };
          }
        }
      }
    }
  }

  // ── Best day ──
  const topicsByDate = new Map<string, number>();
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.completedDate) {
      topicsByDate.set(t.completedDate, (topicsByDate.get(t.completedDate) || 0) + 1);
    }
  })));
  let bestDay: { date: string; count: number } | undefined;
  for (const [date, count] of topicsByDate) {
    if (!bestDay || count > bestDay.count) bestDay = { date, count };
  }

  parts.push(`\n--- Milestones ---`);
  if (firstTopic) parts.push(`First topic: "${firstTopic.name}" (${firstTopic.subject}) on ${firstTopic.date}`);
  if (bestDay) parts.push(`Best day: ${bestDay.date} — ${bestDay.count} topics`);
  parts.push(`Longest streak: ${streak} days`);

  // ── Per-subject progress (all subjects, compact) ──
  const weakTopicsAll: string[] = [];
  const subjectLines: string[] = [];
  const subjectTimeMap: { name: string; mins: number; pct: number; done: number; total: number }[] = [];

  subjects.forEach(s => {
    let done = 0, total = 0, mins = 0;
    const weak: string[] = [];
    s.units.forEach(u => u.subTopics.forEach(t => {
      total++;
      mins += t.timeSpent || 0;
      if (t.completed) done++;
      else if (t.difficulty === 'Hard' || t.important) {
        weak.push(t.name);
      }
    }));
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    subjectLines.push(`${s.shortName}: ${pct}% (${done}/${total}) [${formatStudyTime(mins)}]`);
    subjectTimeMap.push({ name: s.shortName, mins, pct, done, total });
    if (weak.length > 0) {
      weakTopicsAll.push(...weak.slice(0, 3).map(w => `${s.shortName} → ${w}`));
    }
  });

  parts.push(`\n--- Subject Progress ---`);
  parts.push(subjectLines.join('\n'));

  // ── Time distribution (most/least studied) ──
  const sorted = [...subjectTimeMap].sort((a, b) => b.mins - a.mins);
  if (sorted.length >= 2) {
    parts.push(`\n--- Time Distribution ---`);
    parts.push(`Most studied: ${sorted[0].name} (${formatStudyTime(sorted[0].mins)})`);
    parts.push(`Least studied: ${sorted[sorted.length - 1].name} (${formatStudyTime(sorted[sorted.length - 1].mins)})`);
    const lowestPct = [...subjectTimeMap].sort((a, b) => a.pct - b.pct);
    if (lowestPct[0].pct < 50) {
      parts.push(`Needs attention: ${lowestPct[0].name} at ${lowestPct[0].pct}%`);
    }
  }

  // ── Recent 7-day activity with moods ──
  const today = new Date();
  const last7: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = getLocalDateStr(d);
    const count = topicsByDate.get(ds) || 0;
    const log = dailyLogs.find(l => l.date === ds);
    const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : ds;
    const mood = log?.mood ? ` (${log.mood})` : '';
    const hrs = log ? ` ${formatStudyTime(Math.round(log.hoursStudied * 60))}` : '';
    if (count > 0 || log?.hoursStudied) {
      last7.push(`${label}: ${count} topics${hrs}${mood}`);
    } else {
      last7.push(`${label}: no activity`);
    }
  }
  parts.push(`\n--- Last 7 Days ---`);
  parts.push(last7.join('\n'));

  // ── Learning velocity (topics/day over 14 days) ──
  let twoWeekDone = 0;
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    twoWeekDone += topicsByDate.get(getLocalDateStr(d)) || 0;
  }
  const velocity = Math.round((twoWeekDone / 14) * 10) / 10;
  parts.push(`\n--- Learning Velocity ---`);
  parts.push(`14-day avg: ${velocity} topics/day (${twoWeekDone} in 2 weeks)`);
  if (settings?.studyGoals) {
    const targetPerDay = settings.studyGoals.dailyTopics;
    if (velocity < targetPerDay * 0.5) parts.push(`⚠️ Well below target of ${targetPerDay}/day — needs boost`);
    else if (velocity < targetPerDay) parts.push(`📈 Below target of ${targetPerDay}/day — improving`);
    else parts.push(`✅ Meeting/exceeding target of ${targetPerDay}/day`);
  }

  // ── Difficulty distribution ──
  let easyDone = 0, easyTotal = 0, medDone = 0, medTotal = 0, hardDone = 0, hardTotal = 0;
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.difficulty === 'Easy') { easyTotal++; if (t.completed) easyDone++; }
    else if (t.difficulty === 'Medium') { medTotal++; if (t.completed) medDone++; }
    else if (t.difficulty === 'Hard') { hardTotal++; if (t.completed) hardDone++; }
  })));
  parts.push(`\n--- Difficulty Breakdown ---`);
  parts.push(`Easy: ${easyDone}/${easyTotal} | Medium: ${medDone}/${medTotal} | Hard: ${hardDone}/${hardTotal}`);
  const hardRemaining = hardTotal - hardDone;
  if (hardRemaining > 0) parts.push(`Hard topics remaining: ${hardRemaining}`);

  // ── NORCET Relevance ──
  let norcetHigh = 0, norcetHighDone = 0, norcetMed = 0, norcetMedDone = 0;
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.norcetRelevance === 'High') { norcetHigh++; if (t.completed) norcetHighDone++; }
    if (t.norcetRelevance === 'Med') { norcetMed++; if (t.completed) norcetMedDone++; }
  })));
  if (norcetHigh > 0 || norcetMed > 0) {
    parts.push(`\n--- NORCET Focus ---`);
    if (norcetHigh > 0) parts.push(`High relevance: ${norcetHighDone}/${norcetHigh} done (${norcetHigh - norcetHighDone} remaining)`);
    if (norcetMed > 0) parts.push(`Medium relevance: ${norcetMedDone}/${norcetMed} done`);
  }

  // ── SRS due topics ──
  let srsDue = 0;
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.completed && t.srsDueDate && t.srsDueDate <= todayStr) srsDue++;
  })));
  if (srsDue > 0) {
    parts.push(`\n--- Spaced Repetition ---`);
    parts.push(`Topics due for SRS review: ${srsDue}`);
  }

  // ── Weak spots ──
  if (weakTopicsAll.length > 0) {
    parts.push(`\n--- Weak Spots (Hard/Important, Not Done) ---`);
    parts.push(weakTopicsAll.slice(0, 10).join('\n'));
  }

  // ── Exam Countdown ──
  if (exams && exams.length > 0) {
    parts.push(`\n--- Exam Countdown ---`);
    const now = new Date();
    for (const exam of exams) {
      const examDate = new Date(exam.date + 'T00:00:00');
      const diffMs = examDate.getTime() - now.getTime();
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0) {
        parts.push(`${exam.emoji} ${exam.label}: ${daysLeft} days left (${exam.date})`);
        // Calculate readiness per exam subjects
        const examSubjects = subjects.filter(s =>
          exam.subjects.includes(s.id) || exam.subjects.includes(s.shortName)
        );
        if (examSubjects.length > 0) {
          let eTotal = 0, eDone = 0;
          examSubjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
            eTotal++; if (t.completed) eDone++;
          })));
          const readiness = eTotal > 0 ? Math.round((eDone / eTotal) * 100) : 0;
          parts.push(`  Readiness: ${readiness}% (${eDone}/${eTotal} topics)`);
          if (daysLeft > 0 && eTotal - eDone > 0) {
            const topicsPerDay = Math.ceil((eTotal - eDone) / daysLeft);
            parts.push(`  Need: ~${topicsPerDay} topics/day to finish`);
          }
        }
      }
    }
  }

  // ── Sample notes (first 5 non-empty) ──
  const notes: string[] = [];
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (notes.length < 5 && t.notes && t.notes.trim().length > 5) {
      notes.push(`[${s.shortName}/${t.name}]: "${t.notes.trim().slice(0, 80)}"`);
    }
  })));
  if (notes.length > 0) {
    parts.push(`\n--- Student Notes ---`);
    parts.push(notes.join('\n'));
  }

  // ── Tags summary ──
  const tagCounts = new Map<string, number>();
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    if (t.tags) t.tags.forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
  })));
  if (tagCounts.size > 0) {
    parts.push(`\n--- Topic Tags ---`);
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    parts.push(topTags.map(([tag, count]) => `${tag} (${count})`).join(', '));
  }

  // ── Mood patterns ──
  const moods = dailyLogs.filter(l => l.mood).slice(-14);
  if (moods.length >= 3) {
    const moodCounts = new Map<string, number>();
    moods.forEach(l => { if (l.mood) moodCounts.set(l.mood, (moodCounts.get(l.mood) || 0) + 1); });
    const dominantMood = [...moodCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    parts.push(`\n--- Mood Pattern ---`);
    parts.push(`Dominant mood (2 weeks): ${dominantMood[0]} (${dominantMood[1]}/${moods.length} days)`);
    const stressed = (moodCounts.get('Sad') || 0) + (moodCounts.get('Tired') || 0);
    if (stressed > moods.length * 0.4) parts.push(`⚠️ High stress/fatigue detected — suggest breaks & self-care`);
  }

  // ── Pomodoro settings ──
  if (settings?.pomodoroSettings) {
    const p = settings.pomodoroSettings;
    parts.push(`\n--- Pomodoro Config ---`);
    parts.push(`Focus: ${p.focusMin}min | Break: ${p.shortBreakMin}min | Long break: ${p.longBreakMin}min`);
  }

  return parts.join('\n');
}
