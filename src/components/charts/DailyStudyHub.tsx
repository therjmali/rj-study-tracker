import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Flame, CalendarRange, Check } from 'lucide-react';
import GlowCard from '../shared/GlowCard';
import type { Subject, DailyLog, StudyGoals, DbStudySession } from '../../types';
import { computeStreak, getActiveDates } from '../../hooks/useStreak';
import { computeStudyRhythm } from '../../lib/studyRhythm';
import { DAY_PERIOD_LABELS, type DayPeriod } from '../../lib/dayPeriods';
import { getLocalDateStr, formatStudyTime, getEffectiveStudyMinutes, getUnifiedTotalMinutes } from '../../lib/utils';

type HubFilter = 'month' | '7d' | '15d' | '30d' | 'all' | 'custom';

const FILTERS: { id: HubFilter; label: string; short: string }[] = [
  { id: 'month', label: 'This month', short: 'This month' },
  { id: '7d', label: 'Last week', short: 'Last 7 days' },
  { id: '15d', label: 'Last 15 days', short: 'Last 15 days' },
  { id: '30d', label: 'Last 30 days', short: 'Last 30 days' },
  { id: 'all', label: 'All time', short: 'All time' },
  { id: 'custom', label: 'Custom', short: 'Custom range' },
];

const LS_KEY = 'daily-hub-filter-v3';

const shift = (dateStr: string, n: number) => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return getLocalDateStr(d);
};
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
const fmtShort = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

const SHIFT_STYLE: Record<DayPeriod, { bar: string; text: string }> = {
  morning: { bar: 'hsl(var(--chart-4))', text: 'text-chart-4' },
  afternoon: { bar: 'hsl(var(--primary))', text: 'text-primary' },
  evening: { bar: 'hsl(var(--accent))', text: 'text-accent-foreground' },
  night: { bar: 'hsl(var(--secondary))', text: 'text-secondary' },
};

interface Props {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  studyGoals?: StudyGoals;
  dbSessions?: DbStudySession[];
}

export default function DailyStudyHub({ subjects, dailyLogs, studyGoals, dbSessions }: Props) {
  const [open, setOpen] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<HubFilter>(() => {
    try { const v = localStorage.getItem(LS_KEY + '-f'); if (v && FILTERS.some(f => f.id === v)) return v as HubFilter; } catch { /* ignore */ }
    return 'month';
  });
  const [customFrom, setCustomFrom] = useState(() => { try { return localStorage.getItem(LS_KEY + '-from') || ''; } catch { return ''; } });
  const [customTo, setCustomTo] = useState(() => { try { return localStorage.getItem(LS_KEY + '-to') || ''; } catch { return ''; } });

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY + '-f', filter);
      localStorage.setItem(LS_KEY + '-from', customFrom);
      localStorage.setItem(LS_KEY + '-to', customTo);
    } catch { /* ignore */ }
  }, [filter, customFrom, customTo]);

  const today = getLocalDateStr();

  const activeDates = useMemo(() => getActiveDates(subjects as any, dailyLogs, today, dbSessions), [subjects, dailyLogs, today, dbSessions]);
  const allTimeStreak = useMemo(() => computeStreak(subjects as any, dailyLogs, today, dbSessions), [subjects, dailyLogs, today, dbSessions]);

  // First day with any activity (for the All-time window)
  const firstActive = useMemo(() => {
    let first = today;
    activeDates.forEach(d => { if (d < first) first = d; });
    return first;
  }, [activeDates, today]);

  // Effective window
  const win = useMemo(() => {
    if (filter === 'all') return { from: firstActive, to: today, range: null as null | { from: string; to: string } };
    if (filter === 'month') {
      const f = today.slice(0, 8) + '01';
      return { from: f, to: today, range: { from: f, to: today } };
    }
    if (filter === 'custom') {
      let f = customFrom || shift(today, -29);
      let t = customTo || today;
      if (t > today) t = today;
      if (f > t) f = t;
      return { from: f, to: t, range: { from: f, to: t } };
    }
    const n = filter === '7d' ? 7 : filter === '15d' ? 15 : 30;
    const f = shift(today, -(n - 1));
    return { from: f, to: today, range: { from: f, to: today } };
  }, [filter, customFrom, customTo, firstActive, today]);

  const totalDays = Math.max(1, daysBetween(win.from, win.to) + 1);

  const stats = useMemo(() => {
    // Consistency
    let active = 0;
    for (let i = 0; i < totalDays; i++) if (activeDates.has(shift(win.from, i))) active++;
    const consistency = Math.round((active / totalDays) * 100);

    // Streak is ALWAYS the overall streak — the period filter never changes it
    const current = allTimeStreak.current, best = allTimeStreak.best;

    // Topics + minutes
    let topics = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate >= win.from && t.completedDate <= win.to) topics++;
    })));
    const minutes = filter === 'all'
      ? getUnifiedTotalMinutes(subjects, dbSessions, dailyLogs)
      : getEffectiveStudyMinutes(subjects, dailyLogs, win.from, win.to, dbSessions);

    return { active, consistency, current, best, topics, minutes };
  }, [activeDates, win, totalDays, filter, allTimeStreak, subjects, dbSessions, dailyLogs, today]);

  // Live targets (All time view) — today / this week / this month
  const liveGoals = useMemo(() => {
    if (!studyGoals) return null;
    const now = new Date();
    const wd = now.getDay();
    const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - (wd === 0 ? 6 : wd - 1));
    const ws = getLocalDateStr(weekStart);
    const ms = getLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
    let w = 0, m = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (!t.completed || !t.completedDate) return;
      if (t.completedDate >= ws) w++;
      if (t.completedDate >= ms) m++;
    })));
    return [
      { label: 'Daily', icon: '📅', done: allTimeStreak.todayDone, goal: studyGoals.dailyTopics, unit: '' },
      { label: 'Weekly', icon: '📆', done: w, goal: studyGoals.weeklyTopics, unit: '' },
      { label: 'Monthly', icon: '🗓️', done: m, goal: studyGoals.monthlyTopics, unit: '' },
    ];
  }, [subjects, studyGoals, allTimeStreak.todayDone]);

  // Period targets (filtered view) — scaled by the number of days in the window
  const periodGoals = useMemo(() => {
    if (!studyGoals) return null;
    return [
      { label: 'Topics', icon: '📚', done: stats.topics, goal: studyGoals.dailyTopics * totalDays, unit: '' },
      { label: 'Hours', icon: '⏱️', done: Math.round((stats.minutes / 60) * 10) / 10, goal: studyGoals.dailyHours * totalDays, unit: 'h' },
      { label: 'Active days', icon: '🔥', done: stats.active, goal: totalDays, unit: '' },
    ];
  }, [studyGoals, stats, totalDays]);

  const goals = filter === 'all' ? liveGoals : periodGoals;

  // Study rhythm — hours per shift
  const rhythm = useMemo(() => computeStudyRhythm(subjects, dbSessions, win.range), [subjects, dbSessions, win.range]);
  const maxShift = Math.max(1, ...Object.values(rhythm.minutes));

  const milestone = allTimeStreak.milestone;
  const filterLabel = FILTERS.find(f => f.id === filter)!;
  const rangeText = `${fmtShort(win.from)} – ${fmtShort(win.to)} · ${totalDays} ${totalDays === 1 ? 'day' : 'days'}`;
  
  const rhythmTopics = rhythm.topics.morning + rhythm.topics.afternoon + rhythm.topics.evening + rhythm.topics.night;

  const Kpi = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub: string; tone?: string }) => (
    <div className="rounded-xl border border-border/10 bg-card/35 px-2 py-2 min-w-0">
      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-muted-foreground/70 truncate">{label}</p>
      <p className={`text-[17px] leading-tight font-black font-mono truncate ${tone || 'text-foreground'}`}>{value}</p>
      <p className="text-[9px] font-semibold text-muted-foreground truncate">{sub}</p>
    </div>
  );

  return (
    <GlowCard paper className="overflow-hidden">
      {/* ── Header: toggle + filter chip ── */}
      <div className="flex items-center gap-2 p-3">
        <button onClick={() => setOpen(p => !p)} aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-2.5 text-left active:scale-[0.99] transition-transform">
          <div className="w-8 h-8 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0">
            <Flame className="w-4 h-4 text-destructive" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-bold text-foreground leading-tight">Daily Study Hub</h3>
            <p className="text-[10px] text-muted-foreground font-medium truncate">
              {stats.current}d streak · {stats.topics} topics · {stats.consistency}%
            </p>
          </div>
        </button>
        <button onClick={() => { setFilterOpen(p => !p); if (!open) setOpen(true); }} aria-expanded={filterOpen} aria-label="Change period"
          className={`shrink-0 h-8 pl-2 pr-1.5 rounded-full border text-[10px] font-black flex items-center gap-1 active:scale-95 transition-all ${
            filter !== 'all' || filterOpen ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted/20 border-border/15 text-muted-foreground'
          }`}>
          <CalendarRange className="w-3.5 h-3.5" />
          <span className="max-w-[5.5rem] truncate">{filterLabel.short}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
        </button>
        <button onClick={() => setOpen(p => !p)} aria-label={open ? 'Collapse' : 'Expand'} className="shrink-0 w-7 h-8 flex items-center justify-center">
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', damping: 32, stiffness: 380 }}
            className="overflow-hidden">
            <div className="px-3 pb-3 space-y-2.5">

              {/* ── Period filter (collapsible) ── */}
              <AnimatePresence initial={false}>
                {filterOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                    <div className="rounded-xl border border-border/15 bg-card/30 p-2.5 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {FILTERS.map(f => (
                          <button key={f.id} onClick={() => { setFilter(f.id); if (f.id !== 'custom') setFilterOpen(false); navigator.vibrate?.(8); }}
                            className={`h-7 px-2.5 rounded-full border text-[10px] font-bold flex items-center gap-1 active:scale-95 transition-all ${
                              filter === f.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/15 border-border/15 text-muted-foreground'
                            }`}>
                            {filter === f.id && <Check className="w-3 h-3" />}{f.label}
                          </button>
                        ))}
                      </div>
                      {filter === 'custom' && (
                        <div className="grid grid-cols-2 gap-2">
                          <input type="date" aria-label="From" value={customFrom} max={customTo || today} onChange={e => setCustomFrom(e.target.value)}
                            className="h-8 text-[11px] font-mono rounded-lg border border-border/20 bg-card px-2" />
                          <input type="date" aria-label="To" value={customTo} min={customFrom || undefined} max={today} onChange={e => setCustomTo(e.target.value)}
                            className="h-8 text-[11px] font-mono rounded-lg border border-border/20 bg-card px-2" />
                        </div>
                      )}
                      <p className="text-[9px] text-muted-foreground/70 font-semibold">{rangeText} · applies to consistency, targets, topics, study time & rhythm · streak is always overall</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── KPI strip ── */}
              <div className="grid grid-cols-4 gap-1.5">
                <Kpi label={`Streak ${milestone ? milestone.emoji : '🔥'}`} value={`${stats.current}d`} sub={`Overall · best ${stats.best}d`} tone="text-primary" />
                <Kpi label="Consistency" value={`${stats.consistency}%`} sub={`${stats.active}/${totalDays} days`}
                  tone={stats.consistency >= 60 ? 'text-secondary' : 'text-destructive'} />
                <Kpi label="Topics" value={stats.topics} sub={filter === 'all' ? 'completed' : 'in period'} />
                <Kpi label="Study" value={formatStudyTime(stats.minutes)} sub={filter === 'all' ? 'all time' : 'in period'} />
              </div>
              {milestone && (
                <p className="text-[10px] font-bold text-chart-4 -mt-1">{milestone.emoji} {milestone.label}</p>
              )}

              {/* ── Targets ── */}
              {goals && (
                <div>
                  <p className="text-[9px] font-black text-muted-foreground/70 uppercase tracking-[0.14em] mb-1.5">
                    🎯 Targets <span className="normal-case tracking-normal font-semibold text-muted-foreground/50">{filter === 'all' ? '· live' : `· ${totalDays}-day goal`}</span>
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {goals.map(t => {
                      const pct = t.goal > 0 ? Math.min(100, Math.round((t.done / t.goal) * 100)) : 0;
                      const goalTxt = t.unit === 'h' ? `${t.done}/${Math.round(t.goal)}h` : `${t.done}/${t.goal}`;
                      return (
                        <div key={t.label} className="rounded-xl border border-border/10 bg-card/35 px-2 py-1.5">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-bold text-foreground truncate">{t.icon} {t.label}</span>
                            <span className={`text-[10px] font-black font-mono ${pct >= 100 ? 'text-secondary' : pct >= 50 ? 'text-primary' : 'text-destructive'}`}>{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden my-1">
                            <div className={`h-full rounded-full transition-all duration-700 ${pct >= 100 ? 'bg-secondary' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[9px] font-mono font-bold text-muted-foreground">{goalTxt}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Study rhythm: hours + topics per shift ── */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5 gap-2">
                  <p className="text-[9px] font-black text-muted-foreground/70 uppercase tracking-[0.14em]">🕐 Study Rhythm</p>
                  <p className="text-[10px] font-mono font-bold text-foreground truncate">
                    {formatStudyTime(rhythm.assigned)} <span className="font-sans text-muted-foreground/60 font-semibold">· {rhythmTopics} topics</span>
                  </p>
                </div>

                {rhythm.assigned > 0 && (
                  <div className="h-2 rounded-full overflow-hidden flex bg-muted/20 mb-2" aria-hidden>
                    {DAY_PERIOD_LABELS.map(p => rhythm.minutes[p.key] > 0 && (
                      <div key={p.key} className="h-full transition-all duration-700"
                        style={{ width: `${(rhythm.minutes[p.key] / rhythm.assigned) * 100}%`, background: SHIFT_STYLE[p.key].bar }} />
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-1.5">
                  {DAY_PERIOD_LABELS.map(p => {
                    const m = rhythm.minutes[p.key];
                    const n = rhythm.topics[p.key];
                    const share = rhythm.assigned > 0 ? Math.round((m / rhythm.assigned) * 100) : 0;
                    const isPeak = rhythm.peak === p.key;
                    return (
                      <div key={p.key} title={p.timeRange}
                        className={`relative text-center px-1 py-1.5 rounded-xl border ${isPeak ? 'bg-primary/8 border-primary/30' : 'bg-card/35 border-border/10'}`}>
                        <p className="text-[10px] font-bold text-foreground leading-none">{p.emoji} {p.label}</p>
                        <p className="text-[12px] font-black font-mono text-foreground leading-tight mt-1">{m > 0 ? formatStudyTime(m) : '—'}</p>
                        <p className="text-[9px] font-bold text-muted-foreground leading-tight">{n} {n === 1 ? 'topic' : 'topics'}</p>
                        <div className="h-1 rounded-full bg-muted/25 mt-1 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(m / maxShift) * 100}%`, background: SHIFT_STYLE[p.key].bar }} />
                        </div>
                        <p className="text-[8px] font-bold font-mono text-muted-foreground/80 mt-0.5">{share}%{isPeak ? ' · PEAK' : ''}</p>
                      </div>
                    );
                  })}
                </div>

                {rhythm.unassigned > 0 && (
                  <p className="text-[9px] text-muted-foreground/60 font-medium mt-1.5">
                    {formatStudyTime(rhythm.unassigned)} has no time of day yet — log with a time to place it.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlowCard>
  );
}
