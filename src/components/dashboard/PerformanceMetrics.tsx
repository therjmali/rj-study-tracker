import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Activity, Timer, TrendingUp, Target } from 'lucide-react';
import type { Subject, DailyLog } from '../../types';
import { formatStudyTime } from '../../lib/utils';
import GlowCard from '../shared/GlowCard';

interface Props {
  subjects: Subject[];
  dailyLogs: DailyLog[];
}

export default function PerformanceMetrics({ subjects, dailyLogs }: Props) {
  // Time per difficulty level
  const timeByDifficulty = useMemo(() => {
    const acc: Record<string, { total: number; count: number }> = {
      Easy: { total: 0, count: 0 },
      Medium: { total: 0, count: 0 },
      Hard: { total: 0, count: 0 },
    };
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.timeSpent > 0) {
        acc[t.difficulty].total += t.timeSpent;
        acc[t.difficulty].count++;
      }
    })));
    return Object.entries(acc).map(([k, v]) => ({
      difficulty: k,
      avgTime: v.count > 0 ? Math.round(v.total / v.count) : 0,
      totalTopics: v.count,
    }));
  }, [subjects]);

  // Subject efficiency: completion% vs time invested
  const subjectEfficiency = useMemo(() => {
    return subjects.map(s => {
      let total = 0, done = 0, totalTime = 0;
      s.units.forEach(u => u.subTopics.forEach(t => {
        total++;
        if (t.completed) done++;
        totalTime += t.timeSpent || 0;
      }));
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const hoursInvested = Math.round(totalTime / 60 * 10) / 10;
      const efficiency = hoursInvested > 0 ? Math.round(pct / hoursInvested) : 0;
      return { name: s.shortName, color: s.color, pct, hoursInvested, efficiency, done, total };
    }).sort((a, b) => b.efficiency - a.efficiency);
  }, [subjects]);

  // Predicted completion dates
  const predictions = useMemo(() => {
    const last14 = dailyLogs.slice(-14).filter(d => d.topicsCompleted > 0);
    const avgTopicsPerDay = last14.length > 0
      ? last14.reduce((a, d) => a + d.topicsCompleted, 0) / last14.length
      : 0;

    return subjects.map(s => {
      let total = 0, done = 0;
      s.units.forEach(u => u.subTopics.forEach(t => { total++; if (t.completed) done++; }));
      const remaining = total - done;
      const daysNeeded = avgTopicsPerDay > 0 ? Math.ceil(remaining / avgTopicsPerDay) : Infinity;
      const predictedDate = daysNeeded < Infinity
        ? new Date(Date.now() + daysNeeded * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : '—';
      const examDate = new Date(s.examDate);
      const daysToExam = Math.max(0, Math.ceil((examDate.getTime() - Date.now()) / 86400000));
      const onTrack = daysNeeded <= daysToExam;
      return { name: s.shortName, color: s.color, remaining, daysNeeded, predictedDate, daysToExam, onTrack, done, total };
    });
  }, [subjects, dailyLogs]);

  // Consistency score
  const consistency = useMemo(() => {
    const last30 = dailyLogs.slice(-30);
    const activeDays = last30.filter(d => d.hoursStudied > 0 || d.topicsCompleted > 0).length;
    return Math.round((activeDays / Math.max(last30.length, 1)) * 100);
  }, [dailyLogs]);

  const DIFF_COLORS: Record<string, string> = {
    Easy: 'hsl(var(--secondary))',
    Medium: 'hsl(var(--chart-4))',
    Hard: 'hsl(var(--primary))',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Performance Metrics</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Avg Time per Difficulty */}
        <GlowCard className="p-4" paper>
          <div className="flex items-center gap-1.5 mb-3">
            <Timer className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold text-foreground">Avg Time per Difficulty</span>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={timeByDifficulty} barSize={28}>
              <XAxis dataKey="difficulty" tick={{ fontSize: 10, fontWeight: 700, fill: 'hsl(var(--foreground))' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} unit="m" />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 11 }}
                formatter={(val: number) => [`${val} min`, 'Avg Time']} />
              <Bar dataKey="avgTime" radius={[6, 6, 0, 0]}>
                {timeByDifficulty.map((d, i) => (
                  <Cell key={i} fill={DIFF_COLORS[d.difficulty]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GlowCard>

        {/* Consistency Score */}
        <GlowCard className="p-4 flex flex-col items-center justify-center" paper>
          <div className="flex items-center gap-1.5 mb-2">
            <Target className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-bold text-foreground">30-Day Consistency</span>
          </div>
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
              <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--muted))" strokeWidth="5" opacity="0.2" />
              <circle cx="40" cy="40" r="34" fill="none"
                stroke={consistency >= 80 ? '#10B981' : consistency >= 50 ? '#F59E0B' : '#EF4444'}
                strokeWidth="5" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - consistency / 100)}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-black font-mono text-foreground">{consistency}%</span>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground mt-2 text-center">
            {consistency >= 80 ? '🔥 Outstanding!' : consistency >= 50 ? '👍 Good pace' : '📈 Study more regularly'}
          </p>
        </GlowCard>
      </div>

      {/* Predicted Completion */}
      <GlowCard className="p-4" paper>
        <div className="flex items-center gap-1.5 mb-3">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-bold text-foreground">Predicted Completion</span>
          <span className="text-[8px] text-muted-foreground ml-auto">Based on 14-day velocity</span>
        </div>
        <div className="space-y-2">
          {predictions.map(p => (
            <div key={p.name} className="flex items-center gap-2.5">
              <span className="text-[10px] font-bold w-10 truncate" style={{ color: p.color }}>{p.name}</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{
                  width: `${p.total > 0 ? (p.done / p.total) * 100 : 0}%`,
                  backgroundColor: p.color,
                }} />
              </div>
              <span className={`text-[9px] font-mono font-bold ${p.onTrack ? 'text-diff-easy' : 'text-destructive'}`}>
                {p.predictedDate}
              </span>
              <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${p.onTrack ? 'bg-diff-easy/10 text-diff-easy' : 'bg-destructive/10 text-destructive'}`}>
                {p.onTrack ? '✓ On Track' : '⚠ Behind'}
              </span>
            </div>
          ))}
        </div>
      </GlowCard>

      {/* Subject Efficiency */}
      {subjectEfficiency.some(s => s.hoursInvested > 0) && (
        <GlowCard className="p-4" paper>
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-3">
            <Activity className="w-3.5 h-3.5 text-secondary" /> Subject Efficiency
            <span className="text-[8px] text-muted-foreground font-normal ml-1">(completion% per hour invested)</span>
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {subjectEfficiency.filter(s => s.hoursInvested > 0).map(s => (
              <div key={s.name} className="rounded-lg border border-border/15 bg-card/30 p-2.5 text-center">
                <span className="text-[10px] font-bold" style={{ color: s.color }}>{s.name}</span>
                <p className="text-lg font-black font-mono text-foreground">{s.efficiency}</p>
                <p className="text-[8px] text-muted-foreground">{s.pct}% in {formatStudyTime(Math.round(s.hoursInvested * 60))}</p>
              </div>
            ))}
          </div>
        </GlowCard>
      )}
    </div>
  );
}
