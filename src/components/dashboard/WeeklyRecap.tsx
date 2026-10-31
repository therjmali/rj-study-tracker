import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Calendar, Clock, Target, Flame, BookOpen } from 'lucide-react';
import GlowCard from '../shared/GlowCard';
import type { Subject, DailyLog, DbStudySession } from '../../types';
import { getLocalDateStr, getEffectiveStudyMinutes, formatStudyTime } from '../../lib/utils';

interface Props {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  dbSessions?: DbStudySession[];
}

export default function WeeklyRecap({ subjects, dailyLogs, dbSessions }: Props) {
  const recap = useMemo(() => {
    const today = new Date();
    // Week starts on Monday
    const dayOfWeek = today.getDay(); // 0=Sun,1=Mon,...,6=Sat
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - daysFromMonday);
    thisWeekStart.setHours(0, 0, 0, 0);

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

    const ws = getLocalDateStr(thisWeekStart);
    const lws = getLocalDateStr(lastWeekStart);
    const lwe = getLocalDateStr(lastWeekEnd);

    const thisWeekLogs = dailyLogs.filter(l => l.date >= ws);
    const lastWeekLogs = dailyLogs.filter(l => l.date >= lws && l.date <= lwe);

    const thisHours = getEffectiveStudyMinutes(subjects, dailyLogs, ws, undefined, dbSessions) / 60;
    const lastHours = getEffectiveStudyMinutes(subjects, dailyLogs, lws, lwe, dbSessions) / 60;

    let thisTopics = 0, lastTopics = 0, thisImportant = 0, lastImportant = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (!t.completed || !t.completedDate) return;
      if (t.completedDate >= ws) { thisTopics++; if (t.important) thisImportant++; }
      else if (t.completedDate >= lws && t.completedDate <= lwe) { lastTopics++; if (t.important) lastImportant++; }
    })));

    // Active days: include topic completions + dbSessions, not just dailyLogs
    const thisActiveDates = new Set<string>();
    thisWeekLogs.forEach(l => { if (l.hoursStudied > 0 || l.topicsCompleted > 0) thisActiveDates.add(l.date); });
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate >= ws) thisActiveDates.add(t.completedDate);
    })));
    dbSessions?.forEach(s => { if (s.date >= ws && s.minutes > 0) thisActiveDates.add(s.date); });

    const lastActiveDates = new Set<string>();
    lastWeekLogs.forEach(l => { if (l.hoursStudied > 0 || l.topicsCompleted > 0) lastActiveDates.add(l.date); });
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate >= lws && t.completedDate <= lwe) lastActiveDates.add(t.completedDate);
    })));
    dbSessions?.forEach(s => { if (s.date >= lws && s.date <= lwe && s.minutes > 0) lastActiveDates.add(s.date); });

    const thisActiveDays = thisActiveDates.size;
    const lastActiveDays = lastActiveDates.size;

    return { thisHours, lastHours, thisTopics, lastTopics, thisActiveDays, lastActiveDays, thisImportant, lastImportant };
  }, [subjects, dailyLogs, dbSessions]);

  const metrics = [
    { label: 'Time', icon: <Clock className="w-3.5 h-3.5" />, current: formatStudyTime(Math.round(recap.thisHours * 60)), previous: formatStudyTime(Math.round(recap.lastHours * 60)), suffix: '', isFormatted: true },
    { label: 'Topics', icon: <Target className="w-3.5 h-3.5" />, current: String(recap.thisTopics), previous: String(recap.lastTopics), suffix: '', rawCurrent: recap.thisTopics, rawPrevious: recap.lastTopics },
    { label: 'Active Days', icon: <Flame className="w-3.5 h-3.5" />, current: String(recap.thisActiveDays) + 'd', previous: String(recap.lastActiveDays) + 'd', suffix: '', rawCurrent: recap.thisActiveDays, rawPrevious: recap.lastActiveDays },
  ];

  return (
    <GlowCard glow="purple" paper className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-bold text-foreground">📅 Weekly Recap</h3>
        <span className="text-xs text-muted-foreground ml-auto font-medium">vs last week</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {metrics.map((m, i) => {
          const curNum = m.isFormatted ? Math.round(recap.thisHours * 60) : (m.rawCurrent ?? 0);
          const prevNum = m.isFormatted ? Math.round(recap.lastHours * 60) : (m.rawPrevious ?? 0);
          const diff = curNum - prevNum;
          const pctChange = prevNum > 0 ? Math.round((diff / prevNum) * 100) : curNum > 0 ? 100 : 0;
          const isUp = diff > 0;
          const isDown = diff < 0;
          return (
            <motion.div key={m.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.3 }}
              className="rounded-xl bg-card/40 border border-border/15 p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                {m.icon}
                <span className="text-xs font-bold">{m.label}</span>
              </div>
              <p className="text-lg font-black font-mono text-foreground leading-none">{m.current}{m.suffix}</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">was {m.previous}{m.suffix}</p>
              <div className={`flex items-center justify-center gap-0.5 mt-1 text-xs font-bold ${isUp ? 'text-secondary' : isDown ? 'text-destructive' : 'text-muted-foreground'}`}>
                {isUp ? <TrendingUp className="w-3 h-3" /> : isDown ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                {pctChange !== 0 ? `${isUp ? '+' : ''}${pctChange}%` : 'Same'}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Important topics comparison */}
      <div className="flex items-center gap-3 pt-2 border-t border-border/10 text-sm text-muted-foreground font-medium">
        <BookOpen className="w-3 h-3 text-chart-4 shrink-0" />
        <span>⭐ Important: <b className="text-foreground">{recap.thisImportant}</b> this week vs <b className="text-foreground">{recap.lastImportant}</b> last</span>
      </div>
    </GlowCard>
  );
}
