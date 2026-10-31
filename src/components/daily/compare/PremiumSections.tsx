import { useMemo, useId } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Minus, Rocket, Gauge, Trophy,
  Calendar, Clock, BookOpen, Zap, Star, Award, Target,
} from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { Section, TrendBadge, CompareMetric, BadgePill } from './SharedUI';
import CircularProgress from '../../shared/CircularProgress';
import {
  fmtDD, fmtMin, pctChange, localDate, dateRange,
  computeRecords, computeMomentum, computeSubjectComparison,
  computeStreakData, computeCumulative,
} from './utils';
import { getEffectiveDayMinutes } from '../../../lib/utils';
import type { PersonalRecords, MomentumData, SubjectCompare, StreakData, CumulativeData } from './utils';
import type { Subject, DailyLog, DbStudySession } from '../../../types';

const TT: React.CSSProperties = {
  background: 'hsl(var(--card)/0.95)',
  border: '1px solid hsl(var(--border)/0.2)', borderRadius: 12, fontSize: 11,
  color: 'hsl(var(--foreground))',
};

/* ══════════════════════════════════════════════════════════
   1. PERSONAL RECORDS
   ══════════════════════════════════════════════════════════ */
export function PersonalRecordsSection({ subjects, dailyLogs, dbSessions, open, onToggle }: {
  subjects: Subject[]; dailyLogs: DailyLog[]; dbSessions?: DbStudySession[]; open: boolean; onToggle: () => void;
}) {
  const records = useMemo(() => computeRecords(subjects, dailyLogs, dbSessions), [subjects, dailyLogs, dbSessions]);

  const fastestTopics = useMemo(() => {
    const completed: { name: string; subject: string; time: number }[] = [];
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && (t.timeSpent || 0) > 0) {
        completed.push({ name: t.name, subject: s.shortName, time: t.timeSpent });
      }
    })));
    return completed.sort((a, b) => a.time - b.time).slice(0, 3);
  }, [subjects]);

  return (
    <Section title="Personal Records" icon="🏆" open={open} onToggle={onToggle}
      gradient="bg-gradient-to-r from-chart-4/5 via-transparent to-transparent hover:from-chart-4/10"
      badge={records.bestDay ? <BadgePill text={`Best: ${records.bestDay.topics} topics`} color="chart-4" /> : undefined}>
      <div className="grid grid-cols-1 gap-2.5">
        {records.bestDay && (
          <RecordCard icon="🥇" title="Best Day Ever" value={`${records.bestDay.topics} topics`}
            sub={`${fmtDD(records.bestDay.date)} · ${fmtMin(records.bestDay.minutes)} studied`} />
        )}
        {records.bestWeek && (
          <RecordCard icon="🏅" title="Best 7-Day Window" value={`${records.bestWeek.topics} topics`}
            sub={`${fmtDD(records.bestWeek.from)} → ${fmtDD(records.bestWeek.to)} · ${fmtMin(records.bestWeek.minutes)}`} />
        )}
        {records.bestMonth && (
          <RecordCard icon="📅" title="Best Month Ever" value={`${records.bestMonth.topics} topics`}
            sub={`${records.bestMonth.label} · ${fmtMin(records.bestMonth.minutes)} studied`} />
        )}
        {records.longestStreak && (
          <RecordCard icon="🔥" title="Longest Streak" value={`${records.longestStreak.days} days`}
            sub={`${fmtDD(records.longestStreak.from)} → ${fmtDD(records.longestStreak.to)}`} />
        )}
        {records.peakHour && (
          <RecordCard icon="⏰" title="Most Productive Hour" value={`${fmtHour(records.peakHour.hour)}`}
            sub={`${records.peakHour.count} topics completed at this hour`} />
        )}
        {/* Fastest Topics */}
        {fastestTopics.length > 0 && (
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-accent/8 via-card/40 to-card/20 border border-accent/15">
            <p className="text-[10px] text-accent font-bold uppercase tracking-wider mb-2">⚡ Fastest Completions</p>
            <div className="space-y-1.5">
              {fastestTopics.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                  <span className="text-[11px] font-semibold text-foreground flex-1 truncate">{t.name}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">{t.subject}</span>
                  <span className="text-[10px] font-black font-mono text-foreground">{fmtMin(t.time)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!records.bestDay && <p className="text-xs text-muted-foreground text-center py-4">Complete topics to set your first record!</p>}
      </div>
    </Section>
  );
}

function RecordCard({ icon, title, value, sub }: { icon: string; title: string; value: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r from-chart-4/8 via-card/40 to-card/20 border border-chart-4/15">
      <span className="text-xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-chart-4 font-bold uppercase tracking-wider">{title}</p>
        <p className="text-base font-black font-mono text-foreground leading-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
      </div>
      <Star className="w-4 h-4 text-chart-4/40" />
    </div>
  );
}

function fmtHour(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:00 ${ampm}`;
}

/* ══════════════════════════════════════════════════════════
   2. MOMENTUM TRACKER
   ══════════════════════════════════════════════════════════ */
export function MomentumSection({ subjects, open, onToggle }: {
  subjects: Subject[]; open: boolean; onToggle: () => void;
}) {
  const data = useMemo(() => computeMomentum(subjects), [subjects]);
  const gId = useId().replace(/:/g, '');

  const dirIcon = data.direction === 'accelerating' ? '🚀' : data.direction === 'decelerating' ? '📉' : '➡️';
  const dirLabel = data.direction === 'accelerating' ? 'Accelerating' : data.direction === 'decelerating' ? 'Decelerating' : 'Steady';
  const dirColor = data.direction === 'accelerating' ? 'secondary' : data.direction === 'decelerating' ? 'destructive' : 'muted-foreground';

  return (
    <Section title="Momentum Tracker" icon="📈" open={open} onToggle={onToggle}
      gradient="bg-gradient-to-r from-secondary/5 via-transparent to-transparent hover:from-secondary/10"
      badge={<BadgePill text={`${dirIcon} ${dirLabel}`} color={dirColor} />}>

      {/* Direction + Score */}
      <div className="flex items-center gap-4 p-3 rounded-xl bg-card/40 border border-border/15">
        <div className="flex-1">
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Momentum Direction</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xl">{dirIcon}</span>
            <span className={`text-lg font-black text-${dirColor}`}>{dirLabel}</span>
            <TrendBadge pct={data.score} />
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-muted-foreground font-semibold">LAST 7 AVG</p>
          <p className="text-lg font-black font-mono text-foreground">{data.last7Avg}</p>
          <p className="text-[9px] text-muted-foreground">vs {data.prev7Avg}</p>
        </div>
      </div>

      {/* 30-Day Line Chart with Rolling Avg */}
      <div className="rounded-xl bg-card/30 border border-border/15 p-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Last 30 Days — Topics + 7-Day Avg</p>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={data.points.map(p => ({ ...p, date: fmtDD(p.date) }))} margin={{ left: -10, top: 4, right: 4, bottom: 0 }}>
            <defs>
              <linearGradient id={`mg_${gId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--secondary))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 8, fontWeight: 600 }} tickLine={false} axisLine={false} interval={5} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} width={22} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TT} />
            <Area type="monotone" dataKey="topics" stroke="hsl(var(--secondary)/0.5)" fill={`url(#mg_${gId})`}
              strokeWidth={1} name="Daily Topics" dot={false} />
            <Line type="monotone" dataKey="avg7" stroke="hsl(var(--primary))" strokeWidth={2.5}
              name="7-Day Avg" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════
   3. SUBJECT COMPARISON
   ══════════════════════════════════════════════════════════ */
export function SubjectComparisonSection({ subjects, open, onToggle }: {
  subjects: Subject[]; open: boolean; onToggle: () => void;
}) {
  const data = useMemo(() => computeSubjectComparison(subjects), [subjects]);
  const improved = [...data].sort((a, b) => b.weekChange - a.weekChange)[0];
  const declined = [...data].sort((a, b) => a.weekChange - b.weekChange)[0];

  return (
    <Section title="Subject Comparison" icon="📚" open={open} onToggle={onToggle}
      gradient="bg-gradient-to-r from-accent/5 via-transparent to-transparent hover:from-accent/10"
      badge={improved && improved.weekChange > 0 ? <BadgePill text={`${improved.shortName} ↑${improved.weekChange}%`} color="secondary" /> : undefined}>

      {/* Per-subject bars */}
      <div className="space-y-3">
        {data.map(s => {
          const maxW = Math.max(s.thisWeek, s.lastWeek, s.thisMonth, s.lastMonth, 1);
          return (
            <div key={s.name} className="p-3 rounded-xl bg-card/40 border border-border/15">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs font-bold text-foreground flex-1">{s.shortName}</span>
                <TrendBadge pct={s.weekChange} />
              </div>
              <div className="space-y-1.5">
                <BarRow label="This Week" value={s.thisWeek} max={maxW} color={s.color} />
                <BarRow label="Last Week" value={s.lastWeek} max={maxW} color={s.color} muted />
                <BarRow label="This Month" value={s.thisMonth} max={maxW} color={s.color} />
                <BarRow label="Last Month" value={s.lastMonth} max={maxW} color={s.color} muted />
              </div>
            </div>
          );
        })}
      </div>

      {/* Most improved / declined */}
      {data.length > 1 && (
        <div className="grid grid-cols-2 gap-2">
          {improved && improved.weekChange > 0 && (
            <div className="p-2.5 rounded-xl bg-secondary/5 border border-secondary/15 text-center">
              <p className="text-[9px] font-bold text-secondary uppercase">Most Improved</p>
              <p className="text-sm font-black text-foreground">{improved.shortName}</p>
              <p className="text-[10px] text-secondary font-bold">+{improved.weekChange}% this week</p>
            </div>
          )}
          {declined && declined.weekChange < 0 && (
            <div className="p-2.5 rounded-xl bg-destructive/5 border border-destructive/15 text-center">
              <p className="text-[9px] font-bold text-destructive uppercase">Needs Attention</p>
              <p className="text-sm font-black text-foreground">{declined.shortName}</p>
              <p className="text-[10px] text-destructive font-bold">{declined.weekChange}% this week</p>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function BarRow({ label, value, max, color, muted }: {
  label: string; value: number; max: number; color: string; muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[9px] w-16 text-right font-semibold ${muted ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted/20 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${(value / max) * 100}%`, backgroundColor: color, opacity: muted ? 0.35 : 1 }} />
      </div>
      <span className={`text-[10px] font-bold font-mono w-5 text-right ${muted ? 'text-muted-foreground/60' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   4. STREAK & CONSISTENCY
   ══════════════════════════════════════════════════════════ */
export function StreakConsistencySection({ subjects, dailyLogs, dbSessions, open, onToggle }: {
  subjects: Subject[]; dailyLogs: DailyLog[]; dbSessions?: DbStudySession[]; open: boolean; onToggle: () => void;
}) {
  const data = useMemo(() => computeStreakData(subjects, dailyLogs, dbSessions), [subjects, dailyLogs, dbSessions]);
  const dowLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const levelColors = ['hsl(var(--muted)/0.15)', 'hsl(var(--secondary)/0.3)', 'hsl(var(--secondary)/0.6)', 'hsl(var(--secondary)/0.95)'];

  return (
    <Section title="Streak & Consistency" icon="🔥" open={open} onToggle={onToggle}
      gradient="bg-gradient-to-r from-destructive/5 via-transparent to-transparent hover:from-destructive/10"
      badge={<BadgePill text={`${data.current}d streak`} color="chart-4" />}>

      {/* Streak stats */}
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Current" value={`${data.current}d`} icon="🔥" />
        <MiniStat label="Best" value={`${data.best}d`} icon="🏆" />
        <MiniStat label="Avg" value={`${data.avgLength}d`} icon="📊" />
      </div>

      {/* 4-Week Heatmap */}
      <div className="rounded-xl bg-card/30 border border-border/15 p-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Last 4 Weeks Activity</p>
        <div className="space-y-1">
          {[0, 1, 2, 3].map(week => (
            <div key={week} className="grid grid-cols-7 gap-1">
              {data.last28.slice(week * 7, week * 7 + 7).map((d, i) => (
                <div key={d.date} className="relative group">
                  <div className="w-full aspect-square rounded-md transition-transform hover:scale-110"
                    style={{ backgroundColor: levelColors[d.level] }} />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-card border border-border rounded-md px-1.5 py-0.5 text-[8px] font-mono text-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
                    {fmtDD(d.date)}: {d.topics}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div className="grid grid-cols-7 gap-1 mt-1">
            {dowLabels.map(l => <span key={l} className="text-[7px] text-muted-foreground text-center font-semibold">{l}</span>)}
          </div>
        </div>
      </div>

      {/* Regularity + Day-of-week radar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 p-3 rounded-xl bg-card/30 border border-border/15">
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Regularity Score</p>
          <div className="flex items-center gap-2 mt-1">
            <CircularProgress value={data.regularityScore} max={100} size={44} strokeWidth={4}
              color={data.regularityScore >= 60 ? 'hsl(var(--secondary))' : 'hsl(var(--destructive))'} label={`${data.regularityScore}%`} />
            <p className="text-[10px] text-muted-foreground">
              {data.regularityScore >= 70 ? 'Very consistent!' : data.regularityScore >= 40 ? 'Room to improve' : 'Try studying every day'}
            </p>
          </div>
        </div>
      </div>

      {/* DOW Radar */}
      <div className="rounded-xl bg-card/30 border border-border/15 p-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center mb-1">Day-of-Week Distribution</p>
        <ResponsiveContainer width="100%" height={140}>
          <RadarChart data={dowLabels.map((d, i) => ({ day: d, topics: data.dowDist[i] }))}>
            <PolarGrid stroke="hsl(var(--border)/0.3)" />
            <PolarAngleAxis dataKey="day" tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 700 }} />
            <PolarRadiusAxis tick={false} axisLine={false} />
            <Radar dataKey="topics" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.15)" strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="text-center p-2.5 rounded-xl bg-card/30 border border-border/10">
      <span className="text-sm">{icon}</span>
      <p className="text-sm font-black font-mono text-foreground mt-0.5">{value}</p>
      <p className="text-[8px] text-muted-foreground font-semibold uppercase">{label}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   5. CUMULATIVE PROGRESS
   ══════════════════════════════════════════════════════════ */
export function CumulativeProgressSection({ subjects, open, onToggle }: {
  subjects: Subject[]; open: boolean; onToggle: () => void;
}) {
  const data = useMemo(() => computeCumulative(subjects), [subjects]);
  const gId = useId().replace(/:/g, '');
  const pctDone = data.totalAll > 0 ? Math.round((data.totalDone / data.totalAll) * 100) : 0;

  return (
    <Section title="Cumulative Progress" icon="📊" open={open} onToggle={onToggle}
      gradient="bg-gradient-to-r from-primary/5 via-transparent to-transparent hover:from-primary/10"
      badge={<BadgePill text={`${pctDone}% done`} color="primary" />}>

      {/* Cumulative Area Chart */}
      <div className="rounded-xl bg-card/30 border border-border/15 p-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Total Topics Over 30 Days</p>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={data.points.map(p => ({ date: fmtDD(p.date), total: p.cumulative, daily: p.daily }))} margin={{ left: -5, top: 4, right: 4, bottom: 0 }}>
            <defs>
              <linearGradient id={`cum_${gId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 8, fontWeight: 600 }} tickLine={false} axisLine={false} interval={5} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} width={28} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TT} />
            <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill={`url(#cum_${gId})`} strokeWidth={2.5} name="Cumulative" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MiniStat label="Done" value={String(data.totalDone)} icon="✅" />
        <MiniStat label="Remaining" value={String(data.remaining)} icon="📋" />
        <MiniStat label="Pace/Day" value={String(data.pace)} icon="⚡" />
        <MiniStat label="Days Left" value={data.projectedDays > 9000 ? '∞' : String(data.projectedDays)} icon="📅" />
      </div>

      {/* Projection */}
      <div className="p-3 rounded-xl bg-card/40 border border-border/15">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Projected Completion</p>
            <p className="text-base font-black font-mono text-foreground mt-0.5">
              {data.pace > 0 ? fmtDD(data.projectedDate) : 'Increase your pace!'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              At {data.pace} topics/day · {data.remaining} topics remaining
            </p>
          </div>
          <CircularProgress value={pctDone} max={100} size={52} strokeWidth={4}
            color={pctDone >= 50 ? 'hsl(var(--secondary))' : 'hsl(var(--primary))'} label={`${pctDone}%`} />
        </div>
      </div>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════
   6. PERIOD LEADERBOARD
   ══════════════════════════════════════════════════════════ */
export function PeriodLeaderboardSection({ subjects, dailyLogs, dbSessions, open, onToggle }: {
  subjects: Subject[]; dailyLogs: DailyLog[]; dbSessions?: DbStudySession[]; open: boolean; onToggle: () => void;
}) {
  const { topDays, topWeeks, topMonths } = useMemo(() => {
    // Build day map
    const dayMap = new Map<string, { topics: number; minutes: number }>();
    const allDatesSet = new Set<string>();
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate) allDatesSet.add(t.completedDate);
    })));
    dailyLogs.forEach(l => { if (l.hoursStudied > 0 || l.topicsCompleted > 0) allDatesSet.add(l.date); });
    const sorted = Array.from(allDatesSet).sort();
    sorted.forEach(date => {
      let topics = 0;
      subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
        if (t.completed && t.completedDate === date) topics++;
      })));
      dayMap.set(date, { topics, minutes: getEffectiveDayMinutes(subjects, dailyLogs, date, dbSessions) });
    });

    const todayStr = localDate();
    const now = new Date();

    // Top days
    const topDays = Array.from(dayMap.entries())
      .map(([date, v]) => ({ date, ...v, isCurrent: date === todayStr }))
      .filter(d => d.topics > 0)
      .sort((a, b) => b.topics - a.topics || b.minutes - a.minutes)
      .slice(0, 10);

    // ISO weeks
    const weekMap = new Map<string, { from: string; to: string; topics: number; minutes: number; isCurrent: boolean }>();
    const curWeekDay = now.getDay();
    const curMonStart = new Date(now);
    curMonStart.setDate(now.getDate() - (curWeekDay === 0 ? 6 : curWeekDay - 1));
    const curWeekKey = localDate(curMonStart);

    if (sorted.length > 0) {
      const first = new Date(sorted[0] + 'T12:00:00');
      const dow = first.getDay();
      const monStart = new Date(first);
      monStart.setDate(first.getDate() - (dow === 0 ? 6 : dow - 1));
      const lastDate = new Date(sorted[sorted.length - 1] + 'T12:00:00');
      const walker = new Date(monStart);
      while (walker <= lastDate) {
        const from = localDate(walker);
        const wEnd = new Date(walker); wEnd.setDate(wEnd.getDate() + 6);
        const to = localDate(wEnd);
        let topics = 0, minutes = 0;
        dateRange(from, to).forEach(dt => { const v = dayMap.get(dt); if (v) { topics += v.topics; minutes += v.minutes; } });
        if (topics > 0) weekMap.set(from, { from, to, topics, minutes, isCurrent: from === curWeekKey });
        walker.setDate(walker.getDate() + 7);
      }
    }
    const topWeeks = Array.from(weekMap.values()).sort((a, b) => b.topics - a.topics || b.minutes - a.minutes).slice(0, 5);

    // Months
    const monthMap = new Map<string, { label: string; topics: number; minutes: number; isCurrent: boolean }>();
    const curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    dayMap.forEach((v, date) => {
      const key = date.slice(0, 7);
      const c = monthMap.get(key) || { label: '', topics: 0, minutes: 0, isCurrent: key === curMonthKey };
      const [yr, mo] = key.split('-');
      c.label = `${monthNames[parseInt(mo) - 1]} ${yr}`;
      c.topics += v.topics;
      c.minutes += v.minutes;
      monthMap.set(key, c);
    });
    const topMonths = Array.from(monthMap.values()).filter(m => m.topics > 0).sort((a, b) => b.topics - a.topics || b.minutes - a.minutes);

    return { topDays, topWeeks, topMonths };
  }, [subjects, dailyLogs]);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <Section title="Period Leaderboard" icon="📋" open={open} onToggle={onToggle}
      gradient="bg-gradient-to-r from-chart-5/5 via-transparent to-transparent hover:from-chart-5/10"
      badge={<BadgePill text="Rankings" color="chart-5" />}>

      {/* Top Days */}
      <div className="rounded-xl bg-card/30 border border-border/15 p-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">🗓️ Top Days (by topics)</p>
        <div className="space-y-1">
          {topDays.map((d, i) => (
            <div key={d.date} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${d.isCurrent ? 'bg-primary/10 border border-primary/20' : ''}`}>
              <span className="text-sm w-6 text-center">{i < 3 ? medals[i] : `#${i + 1}`}</span>
              <span className="text-[11px] font-semibold text-foreground flex-1">{fmtDD(d.date)}</span>
              {d.isCurrent && <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">NOW</span>}
              <span className="text-[10px] font-bold font-mono text-secondary">{d.topics} topics</span>
              <span className="text-[9px] font-mono text-muted-foreground">{fmtMin(d.minutes)}</span>
            </div>
          ))}
          {topDays.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No data yet</p>}
        </div>
      </div>

      {/* Top Weeks */}
      <div className="rounded-xl bg-card/30 border border-border/15 p-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">📅 Top Weeks (by topics)</p>
        <div className="space-y-1">
          {topWeeks.map((w, i) => (
            <div key={w.from} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${w.isCurrent ? 'bg-primary/10 border border-primary/20' : ''}`}>
              <span className="text-sm w-6 text-center">{i < 3 ? medals[i] : `#${i + 1}`}</span>
              <span className="text-[10px] font-semibold text-foreground flex-1">{fmtDD(w.from)}–{fmtDD(w.to)}</span>
              {w.isCurrent && <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">NOW</span>}
              <span className="text-[10px] font-bold font-mono text-secondary">{w.topics}</span>
              <span className="text-[9px] font-mono text-muted-foreground">{fmtMin(w.minutes)}</span>
            </div>
          ))}
          {topWeeks.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No data yet</p>}
        </div>
      </div>

      {/* All Months */}
      <div className="rounded-xl bg-card/30 border border-border/15 p-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">📆 Months Ranked (by topics)</p>
        <div className="space-y-1">
          {topMonths.map((m, i) => (
            <div key={m.label} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${m.isCurrent ? 'bg-primary/10 border border-primary/20' : ''}`}>
              <span className="text-sm w-6 text-center">{i < 3 ? medals[i] : `#${i + 1}`}</span>
              <span className="text-[11px] font-semibold text-foreground flex-1">{m.label}</span>
              {m.isCurrent && <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">NOW</span>}
              <span className="text-[10px] font-bold font-mono text-secondary">{m.topics} topics</span>
              <span className="text-[9px] font-mono text-muted-foreground">{fmtMin(m.minutes)}</span>
            </div>
          ))}
          {topMonths.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No data yet</p>}
        </div>
      </div>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════
   7. STUDY PATTERNS
   ══════════════════════════════════════════════════════════ */
export function StudyPatternsSection({ subjects, dailyLogs, dbSessions, open, onToggle }: {
  subjects: Subject[]; dailyLogs: DailyLog[]; dbSessions?: DbStudySession[]; open: boolean; onToggle: () => void;
}) {
  const patterns = useMemo(() => {
    // Collect all active days with topic counts
    const dayTopicMap = new Map<string, number>();
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate) {
        dayTopicMap.set(t.completedDate, (dayTopicMap.get(t.completedDate) || 0) + 1);
      }
    })));
    const activeDates = Array.from(dayTopicMap.keys()).sort();
    const activeDayCount = activeDates.length;
    const totalTopics = Array.from(dayTopicMap.values()).reduce((a, b) => a + b, 0);

    // Avg topics per study session (active day = session)
    const avgTopicsPerSession = activeDayCount > 0 ? Math.round((totalTopics / activeDayCount) * 10) / 10 : 0;

    // Difficulty distribution
    let easyCount = 0, medCount = 0, hardCount = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (!t.completed) return;
      if (t.difficulty === 'Easy') easyCount++;
      else if (t.difficulty === 'Medium') medCount++;
      else hardCount++;
    })));
    const diffTotal = easyCount + medCount + hardCount;
    const easyPct = diffTotal > 0 ? Math.round((easyCount / diffTotal) * 100) : 0;
    const medPct = diffTotal > 0 ? Math.round((medCount / diffTotal) * 100) : 0;
    const hardPct = diffTotal > 0 ? Math.round((hardCount / diffTotal) * 100) : 0;
    const mostCommon = easyCount >= medCount && easyCount >= hardCount ? 'Easy' : medCount >= hardCount ? 'Medium' : 'Hard';

    // Favorite day of week
    const dowCounts = new Array(7).fill(0);
    const dowLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate) {
        const dow = new Date(t.completedDate + 'T12:00:00').getDay();
        dowCounts[dow === 0 ? 6 : dow - 1]++;
      }
    })));
    const maxDow = Math.max(...dowCounts);
    const favDowIdx = dowCounts.indexOf(maxDow);
    const favDay = maxDow > 0 ? dowLabels[favDowIdx] : '—';

    // Average gap between study sessions
    let avgGap = 0;
    if (activeDates.length > 1) {
      let totalGap = 0;
      for (let i = 1; i < activeDates.length; i++) {
        const d1 = new Date(activeDates[i - 1] + 'T12:00:00');
        const d2 = new Date(activeDates[i] + 'T12:00:00');
        totalGap += Math.round((d2.getTime() - d1.getTime()) / 86400000);
      }
      avgGap = Math.round((totalGap / (activeDates.length - 1)) * 10) / 10;
    }

    // Burst vs Steady: look at last 30 days
    const now = new Date();
    let last30Active = 0, last30Topics = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = localDate(d);
      const tc = dayTopicMap.get(ds) || 0;
      if (tc > 0) { last30Active++; last30Topics += tc; }
    }
    const avgPerActiveDay = last30Active > 0 ? last30Topics / last30Active : 0;
    const activePct = last30Active / 30;
    // Burst: few days, many topics per day. Steady: many days, fewer per day
    const isBurst = activePct < 0.4 && avgPerActiveDay > 3;
    const isSteady = activePct >= 0.5 && avgPerActiveDay <= 4;
    const studyStyle = isBurst ? 'Burst' : isSteady ? 'Steady' : 'Mixed';
    const styleEmoji = isBurst ? '💥' : isSteady ? '🌊' : '🔄';
    const styleDesc = isBurst
      ? `${last30Active} days active, ~${Math.round(avgPerActiveDay)} topics/day`
      : isSteady
        ? `${last30Active} days active, ~${Math.round(avgPerActiveDay)} topics/day`
        : `${last30Active}/30 days, ~${Math.round(avgPerActiveDay)} topics/day`;

    return {
      avgTopicsPerSession, easyPct, medPct, hardPct, mostCommon,
      favDay, favDowTopics: maxDow, avgGap, studyStyle, styleEmoji, styleDesc,
      easyCount, medCount, hardCount, diffTotal,
      dowCounts, dowLabels,
    };
  }, [subjects, dailyLogs]);

  const diffColors = { Easy: 'secondary', Medium: 'chart-4', Hard: 'destructive' };

  return (
    <Section title="Study Patterns" icon="🎯" open={open} onToggle={onToggle}
      gradient="bg-gradient-to-r from-primary/5 via-accent/3 to-transparent hover:from-primary/10"
      badge={<BadgePill text={`${patterns.styleEmoji} ${patterns.studyStyle}`} color="primary" />}>

      {/* Key stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl bg-card/40 border border-border/15">
          <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Avg Topics/Session</p>
          <p className="text-xl font-black font-mono text-foreground mt-1">{patterns.avgTopicsPerSession}</p>
          <p className="text-[9px] text-muted-foreground">per active day</p>
        </div>
        <div className="p-3 rounded-xl bg-card/40 border border-border/15">
          <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Avg Gap</p>
          <p className="text-xl font-black font-mono text-foreground mt-1">{patterns.avgGap}<span className="text-sm text-muted-foreground ml-0.5">d</span></p>
          <p className="text-[9px] text-muted-foreground">between sessions</p>
        </div>
      </div>

      {/* Favorite Day */}
      <div className="p-3 rounded-xl bg-card/40 border border-border/15 flex items-center gap-3">
        <span className="text-2xl">📅</span>
        <div className="flex-1">
          <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Favorite Study Day</p>
          <p className="text-base font-black text-foreground">{patterns.favDay}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black font-mono text-primary">{patterns.favDowTopics}</p>
          <p className="text-[9px] text-muted-foreground">topics</p>
        </div>
      </div>

      {/* Difficulty Distribution */}
      <div className="rounded-xl bg-card/30 border border-border/15 p-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Difficulty Distribution</p>
        <div className="flex h-4 rounded-full overflow-hidden mb-2">
          {patterns.easyPct > 0 && <div className="bg-secondary transition-all" style={{ width: `${patterns.easyPct}%` }} />}
          {patterns.medPct > 0 && <div className="bg-chart-4 transition-all" style={{ width: `${patterns.medPct}%` }} />}
          {patterns.hardPct > 0 && <div className="bg-destructive transition-all" style={{ width: `${patterns.hardPct}%` }} />}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['Easy', 'Medium', 'Hard'] as const).map(d => {
            const count = d === 'Easy' ? patterns.easyCount : d === 'Medium' ? patterns.medCount : patterns.hardCount;
            const pct = d === 'Easy' ? patterns.easyPct : d === 'Medium' ? patterns.medPct : patterns.hardPct;
            const c = diffColors[d];
            return (
              <div key={d} className={`text-center p-2 rounded-xl bg-${c}/5 border border-${c}/15`}>
                <p className={`text-[8px] font-bold text-${c} uppercase`}>{d}</p>
                <p className="text-sm font-black font-mono text-foreground">{pct}%</p>
                <p className="text-[8px] text-muted-foreground">{count} topics</p>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          Most tackled: <span className="font-bold text-foreground">{patterns.mostCommon}</span>
        </p>
      </div>

      {/* Burst vs Steady */}
      <div className={`p-3.5 rounded-xl border ${
        patterns.studyStyle === 'Burst' ? 'bg-chart-4/5 border-chart-4/15' :
        patterns.studyStyle === 'Steady' ? 'bg-secondary/5 border-secondary/15' :
        'bg-card/40 border-border/15'
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{patterns.styleEmoji}</span>
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Study Style</p>
            <p className="text-base font-black text-foreground">{patterns.studyStyle} Learner</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{patterns.styleDesc}</p>
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground mt-2 italic">
          {patterns.studyStyle === 'Burst' ? '💡 Try spreading your study sessions more evenly for better retention.' :
           patterns.studyStyle === 'Steady' ? '✨ Great consistency! Your spaced approach helps long-term memory.' :
           '🔄 A mix of burst and steady — aim for more consistent days.'}
        </p>
      </div>
    </Section>
  );
}
