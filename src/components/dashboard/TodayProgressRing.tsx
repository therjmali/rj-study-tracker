import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Target } from 'lucide-react';
import type { Subject, StudyGoals, DailyLog, DbStudySession } from '../../types';
import { getLocalDateStr, formatStudyTime, getEffectiveDayMinutes } from '../../lib/utils';
import { useCountUp } from '../../hooks/useCountUp';

interface Props {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  studyGoals: StudyGoals;
  dbSessions?: DbStudySession[];
}

function MiniRing({ value, max, size = 44, color }: { value: number; max: number; size?: number; color: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct);

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted) / 0.3)" strokeWidth={4} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

export default function TodayProgressRing({ subjects, dailyLogs, studyGoals, dbSessions }: Props) {
  const today = getLocalDateStr();

  const { topicsDone, hoursToday } = useMemo(() => {
    let topicsDone = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate === today) topicsDone++;
    })));
    // Unified time: topic + unit + manually-logged sessions
    const totalMins = getEffectiveDayMinutes(subjects, dailyLogs, today, dbSessions);
    return { topicsDone, hoursToday: totalMins / 60 };
  }, [subjects, dailyLogs, today, dbSessions]);

  const topicPct = studyGoals.dailyTopics > 0 ? Math.min(Math.round((topicsDone / studyGoals.dailyTopics) * 100), 100) : 0;
  const hourPct = studyGoals.dailyHours > 0 ? Math.min(Math.round((hoursToday / studyGoals.dailyHours) * 100), 100) : 0;
  const animatedTopicPct = useCountUp(topicPct, 1000, 400);

  // Always show — even at 0 it motivates the user to start

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="glass-card p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Today's Goals</h3>
      </div>

      <div className="flex items-center gap-4">
        {/* Topics ring */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <MiniRing value={topicsDone} max={studyGoals.dailyTopics} size={48} color="hsl(var(--primary))" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-black text-primary font-mono">{animatedTopicPct}%</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-black text-foreground font-mono">{topicsDone}<span className="text-muted-foreground text-xs">/{studyGoals.dailyTopics}</span></p>
            <p className="text-[9px] text-muted-foreground font-semibold">Topics</p>
          </div>
        </div>

        <div className="w-px h-10 bg-border/30" />

        {/* Hours ring */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <MiniRing value={hoursToday} max={studyGoals.dailyHours} size={48} color="hsl(var(--secondary))" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-black text-secondary font-mono">{hourPct}%</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-black text-foreground font-mono">{formatStudyTime(Math.round(hoursToday * 60))}<span className="text-muted-foreground text-xs">/{formatStudyTime(Math.round(studyGoals.dailyHours * 60))}</span></p>
            <p className="text-[9px] text-muted-foreground font-semibold">Time</p>
          </div>
        </div>

        {/* Completion badge */}
        {topicPct >= 100 && hourPct >= 100 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="ml-auto"
          >
            <div className="w-10 h-10 rounded-xl bg-chart-4/15 border border-chart-4/25 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-chart-4" />
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
