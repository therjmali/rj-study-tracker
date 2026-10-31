import { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts';
import GlowCard from '../shared/GlowCard';
import type { Subject, DailyLog, DbStudySession } from '../../types';
import { getLocalDateStr, getEffectiveDayMinutes } from '../../lib/utils';
import { useToday } from '../../hooks/useToday';

interface Props {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  dbSessions?: DbStudySession[];
}

export default function StudyVelocity({ subjects, dailyLogs, dbSessions }: Props) {
  const today = useToday();
  const velocity = useMemo(() => {
    const todayHours = getEffectiveDayMinutes(subjects, dailyLogs, today, dbSessions) / 60;

    let todayTopics = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate === today) todayTopics++;
    })));

    const perHour = todayHours > 0 ? Math.round((todayTopics / todayHours) * 10) / 10 : 0;
    const avgMinPerTopic = todayTopics > 0 ? Math.round((todayHours * 60) / todayTopics) : 0;

    // Last 7 days velocity (includes dbSessions for accurate time)
    const days: { date: string; topics: number; mins: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateStr(d);
      let count = 0;
      subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
        if (t.completed && t.completedDate === dateStr) count++;
      })));
      const mins = getEffectiveDayMinutes(subjects, dailyLogs, dateStr, dbSessions);
      const parts = dateStr.split('-');
      days.push({ date: `${parts[2]}/${parts[1]}`, topics: count, mins });
    }

    const weekTotal = days.reduce((a, d) => a + d.topics, 0);
    const weekAvg = Math.round((weekTotal / 7) * 10) / 10;

    return { todayTopics, perHour, avgMinPerTopic, days, weekAvg };
  }, [subjects, dailyLogs, today, dbSessions]);

  return (
    <GlowCard glow="cyan" paper className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">⚡ Study Velocity</h3>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <VelocityStat value={String(velocity.todayTopics)} label="Today" variant="primary" />
        <VelocityStat value={String(velocity.perHour)} label="Per Hour" variant="secondary" />
        <VelocityStat
          value={velocity.avgMinPerTopic > 0 ? `${velocity.avgMinPerTopic}m` : '—'}
          label="Avg/Topic"
          variant="accent"
        />
      </div>

      {/* Spark chart */}
      <div className="h-14">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={velocity.days} barCategoryGap="20%">
            <Bar dataKey="topics" radius={[3, 3, 0, 0]}>
              {velocity.days.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === velocity.days.length - 1 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.15)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-1 px-1 font-medium">
        {velocity.days.map(d => <span key={d.date}>{d.date}</span>)}
      </div>

      <div className="mt-2 pt-2 border-t border-border/10 flex justify-between text-sm text-muted-foreground font-medium">
        <span>7-day avg: <b className="text-foreground font-mono">{velocity.weekAvg}</b> topics/day</span>
      </div>
    </GlowCard>
  );
}

function VelocityStat({ value, label, variant }: { value: string; label: string; variant: string }) {
  return (
    <div className={`text-center p-3 rounded-xl bg-${variant}/5 border border-${variant}/10`}>
      <p className="text-xl font-black font-mono text-foreground leading-none">{value}</p>
      <p className="text-xs text-muted-foreground mt-1 font-semibold">{label}</p>
    </div>
  );
}
