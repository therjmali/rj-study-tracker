import { useState, useMemo, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, BookOpen, Zap, Flame, Target, BarChart3, TrendingUp, TrendingDown,
  ChevronRight, Calendar, Award, CalendarDays,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  OverlayLineChart, DifficultyRadar, HourlyHeatmap,
  BadgePill, TrendBadge,
} from './compare/SharedUI';
import {
  localDate, fmtDD, fmtMin, pctChange, computePeriod,
} from './compare/utils';
import {
  PersonalRecordsSection, MomentumSection,
  SubjectComparisonSection, StreakConsistencySection,
  CumulativeProgressSection, PeriodLeaderboardSection,
  StudyPatternsSection,
} from './compare/PremiumSections';
import { Section } from './compare/SharedUI';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { Calendar as CalendarUI } from '@project/components/ui/calendar';
import { Button } from '@project/components/ui/button';
import CircularProgress from '../shared/CircularProgress';
import GlowCard from '../shared/GlowCard';
import type { Subject, DailyLog } from '../../types';
import type { PeriodStats } from './compare/utils';

const TT: React.CSSProperties = {
  background: 'hsl(var(--card)/0.95)',
  border: '1px solid hsl(var(--border)/0.2)', borderRadius: 12, fontSize: 11,
  color: 'hsl(var(--foreground))',
};

type Tab = 'compare' | 'analysis' | 'records' | 'habits';

interface Props { subjects: Subject[]; dailyLogs: DailyLog[] }

export default function ComparePeriods({ subjects, dailyLogs }: Props) {
  const [tab, setTab] = useState<Tab>('compare');
  const [compareView, setCompareView] = useState<'today' | 'week' | 'month' | 'custom'>('week');

  // Custom date range
  const [customCurFrom, setCustomCurFrom] = useState<Date | undefined>(undefined);
  const [customCurTo, setCustomCurTo] = useState<Date | undefined>(undefined);
  const [customPrevFrom, setCustomPrevFrom] = useState<Date | undefined>(undefined);
  const [customPrevTo, setCustomPrevTo] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarStep, setCalendarStep] = useState<'cur_from' | 'cur_to' | 'prev_from' | 'prev_to'>('cur_from');

  // Expandable sections for analysis/records/habits
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setExpanded(p => ({ ...p, [k]: !p[k] }));

  // ── Date boundaries ──
  const now = new Date();
  const todayStr = localDate(now);
  const ydD = new Date(now); ydD.setDate(ydD.getDate() - 1);
  const yesterdayStr = localDate(ydD);

  const wd = now.getDay();
  const twS = new Date(now); twS.setDate(now.getDate() - (wd === 0 ? 6 : wd - 1));
  const lwS = new Date(twS); lwS.setDate(lwS.getDate() - 7);
  const lwE = new Date(twS); lwE.setDate(lwE.getDate() - 1);

  const tmS = new Date(now.getFullYear(), now.getMonth(), 1);
  const lmS = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lmE = new Date(now.getFullYear(), now.getMonth(), 0);
  const tmEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // ── Period Stats ──
  const todayS = useMemo(() => computePeriod(subjects, dailyLogs, todayStr, todayStr), [subjects, dailyLogs, todayStr]);
  const yesterdayS = useMemo(() => computePeriod(subjects, dailyLogs, yesterdayStr, yesterdayStr), [subjects, dailyLogs, yesterdayStr]);
  const twStats = useMemo(() => computePeriod(subjects, dailyLogs, localDate(twS), todayStr), [subjects, dailyLogs, todayStr]);
  const lwStats = useMemo(() => computePeriod(subjects, dailyLogs, localDate(lwS), localDate(lwE)), [subjects, dailyLogs]);
  const tmStats = useMemo(() => computePeriod(subjects, dailyLogs, localDate(tmS), localDate(tmEnd)), [subjects, dailyLogs, todayStr]);
  const lmStats = useMemo(() => computePeriod(subjects, dailyLogs, localDate(lmS), localDate(lmE)), [subjects, dailyLogs]);

  // Custom period stats
  const customCurStats = useMemo(() => {
    if (!customCurFrom || !customCurTo) return computePeriod(subjects, dailyLogs, todayStr, todayStr);
    return computePeriod(subjects, dailyLogs, localDate(customCurFrom), localDate(customCurTo));
  }, [subjects, dailyLogs, customCurFrom, customCurTo, todayStr]);
  const customPrevStats = useMemo(() => {
    if (!customPrevFrom || !customPrevTo) return computePeriod(subjects, dailyLogs, yesterdayStr, yesterdayStr);
    return computePeriod(subjects, dailyLogs, localDate(customPrevFrom), localDate(customPrevTo));
  }, [subjects, dailyLogs, customPrevFrom, customPrevTo, yesterdayStr]);

  // All-time hourly
  const allHourly = useMemo(() => {
    const b = new Array(24).fill(0);
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedTime) { const h = parseInt(t.completedTime.split(':')[0]); if (!isNaN(h) && h >= 0 && h < 24) b[h]++; }
    })));
    return b;
  }, [subjects]);

  // Power Index
  const powerIndex = useMemo(() => {
    let totalMin = 0, totalT = 0, eD = 0, mD = 0, hD = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (!t.completed) return;
      totalT++; totalMin += t.timeSpent || 0;
      if (t.difficulty === 'Easy') eD++; else if (t.difficulty === 'Medium') mD++; else hD++;
    })));
    const tph = totalMin > 0 ? totalT / (totalMin / 60) : 0;
    const ds = totalT > 0 ? (eD + mD * 2 + hD * 3) / totalT : 0;
    const last30Active = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i);
      let tc = 0;
      subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
        if (t.completed && t.completedDate === localDate(d)) tc++;
      })));
      return tc > 0 ? 1 : 0;
    }).reduce((a, b) => a + b, 0);
    const normTph = Math.min(tph / 5, 1);
    const normDs = Math.min(ds / 3, 1);
    return Math.round(normTph * 35 + normDs * 30 + (last30Active / 30) * 35);
  }, [subjects]);

  const maxHourly = Math.max(...allHourly);
  const peakH = maxHourly > 0 ? allHourly.indexOf(maxHourly) : -1;

  // Pick active comparison pair
  const customCurLabel = customCurFrom && customCurTo
    ? `${customCurFrom.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${customCurTo.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
    : 'Period A';
  const customPrevLabel = customPrevFrom && customPrevTo
    ? `${customPrevFrom.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${customPrevTo.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
    : 'Period B';

  const pairs: Record<string, { cur: PeriodStats; prev: PeriodStats; lCur: string; lPrev: string }> = {
    today: { cur: todayS, prev: yesterdayS, lCur: 'Today', lPrev: 'Yesterday' },
    week: { cur: twStats, prev: lwStats, lCur: 'This Week', lPrev: 'Last Week' },
    month: { cur: tmStats, prev: lmStats, lCur: 'This Month', lPrev: 'Last Month' },
    custom: { cur: customCurStats, prev: customPrevStats, lCur: customCurLabel, lPrev: customPrevLabel },
  };
  const active = pairs[compareView];

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'compare', label: 'Compare', icon: '📊' },
    { key: 'analysis', label: 'Analysis', icon: '🔬' },
    { key: 'records', label: 'Records', icon: '🏆' },
    { key: 'habits', label: 'Habits', icon: '🔥' },
  ];

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Compare Periods</h3>
        <span className="text-[8px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold border border-primary/20 ml-auto">PRO</span>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex rounded-xl bg-muted/20 border border-border/15 p-1 gap-0.5">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold transition-all ${
              tab === t.key
                ? 'bg-card text-foreground shadow-sm border border-border/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}>
            <span className="text-xs">{t.icon}</span>
            <span className="hidden xs:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}>

          {tab === 'compare' && (
            <CompareTab
              compareView={compareView}
              setCompareView={setCompareView}
              active={active}
              todayS={todayS} yesterdayS={yesterdayS}
              twStats={twStats} lwStats={lwStats}
              tmStats={tmStats} lmStats={lmStats}
              customCurStats={customCurStats} customPrevStats={customPrevStats}
              customCurFrom={customCurFrom} customCurTo={customCurTo}
              customPrevFrom={customPrevFrom} customPrevTo={customPrevTo}
              setCustomCurFrom={setCustomCurFrom} setCustomCurTo={setCustomCurTo}
              setCustomPrevFrom={setCustomPrevFrom} setCustomPrevTo={setCustomPrevTo}
              calendarOpen={calendarOpen} setCalendarOpen={setCalendarOpen}
              calendarStep={calendarStep} setCalendarStep={setCalendarStep}
            />
          )}

          {tab === 'analysis' && (
            <AnalysisTab
              allHourly={allHourly} peakH={peakH}
              powerIndex={powerIndex}
              twStats={twStats} lwStats={lwStats}
              tmStats={tmStats} lmStats={lmStats}
              subjects={subjects} dailyLogs={dailyLogs}
              expanded={expanded} toggle={toggle}
            />
          )}

          {tab === 'records' && (
            <RecordsTab subjects={subjects} dailyLogs={dailyLogs} expanded={expanded} toggle={toggle} />
          )}

          {tab === 'habits' && (
            <HabitsTab subjects={subjects} dailyLogs={dailyLogs} expanded={expanded} toggle={toggle} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   COMPARE TAB — Period switcher + inline comparison
   ════════════════════════════════════════════════════════════ */
function CompareTab({ compareView, setCompareView, active, todayS, yesterdayS, twStats, lwStats, tmStats, lmStats,
  customCurStats, customPrevStats, customCurFrom, customCurTo, customPrevFrom, customPrevTo,
  setCustomCurFrom, setCustomCurTo, setCustomPrevFrom, setCustomPrevTo,
  calendarOpen, setCalendarOpen, calendarStep, setCalendarStep,
}: {
  compareView: 'today' | 'week' | 'month' | 'custom';
  setCompareView: (v: 'today' | 'week' | 'month' | 'custom') => void;
  active: { cur: PeriodStats; prev: PeriodStats; lCur: string; lPrev: string };
  todayS: PeriodStats; yesterdayS: PeriodStats;
  twStats: PeriodStats; lwStats: PeriodStats;
  tmStats: PeriodStats; lmStats: PeriodStats;
  customCurStats: PeriodStats; customPrevStats: PeriodStats;
  customCurFrom?: Date; customCurTo?: Date; customPrevFrom?: Date; customPrevTo?: Date;
  setCustomCurFrom: (d: Date | undefined) => void; setCustomCurTo: (d: Date | undefined) => void;
  setCustomPrevFrom: (d: Date | undefined) => void; setCustomPrevTo: (d: Date | undefined) => void;
  calendarOpen: boolean; setCalendarOpen: (v: boolean) => void;
  calendarStep: 'cur_from' | 'cur_to' | 'prev_from' | 'prev_to';
  setCalendarStep: (v: 'cur_from' | 'cur_to' | 'prev_from' | 'prev_to') => void;
}) {
  const summaries = [
    { key: 'today' as const, label: 'Today', emoji: '📅', cur: todayS, prev: yesterdayS },
    { key: 'week' as const, label: 'Week', emoji: '📊', cur: twStats, prev: lwStats },
    { key: 'month' as const, label: 'Month', emoji: '🗓️', cur: tmStats, prev: lmStats },
  ];

  const fmtShort = (d?: Date) => d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';

  const stepLabels: Record<string, string> = {
    cur_from: 'Period A: Start Date',
    cur_to: 'Period A: End Date',
    prev_from: 'Period B: Start Date',
    prev_to: 'Period B: End Date',
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    if (calendarStep === 'cur_from') { setCustomCurFrom(date); setCalendarStep('cur_to'); }
    else if (calendarStep === 'cur_to') { setCustomCurTo(date); setCalendarStep('prev_from'); }
    else if (calendarStep === 'prev_from') { setCustomPrevFrom(date); setCalendarStep('prev_to'); }
    else { setCustomPrevTo(date); setCalendarOpen(false); setCompareView('custom'); }
  };

  const selectedDateForStep = calendarStep === 'cur_from' ? customCurFrom
    : calendarStep === 'cur_to' ? customCurTo
    : calendarStep === 'prev_from' ? customPrevFrom : customPrevTo;

  return (
    <div className="space-y-3">
      {/* Period Switcher Cards */}
      <div className="grid grid-cols-4 gap-1.5">
        {summaries.map(s => {
          const pct = pctChange(s.cur.topicsDone, s.prev.topicsDone);
          const isActive = compareView === s.key;
          return (
            <button key={s.key} onClick={() => setCompareView(s.key)}
              className={`p-2 rounded-xl border text-center transition-all ${
                isActive
                  ? 'bg-primary/10 border-primary/30 shadow-sm'
                  : 'bg-card/30 border-border/10 hover:bg-card/50'
              }`}>
              <span className="text-xs">{s.emoji}</span>
              <p className={`text-[9px] font-bold mt-0.5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>{s.label}</p>
              <p className="text-sm font-black font-mono text-foreground leading-tight">{s.cur.topicsDone}</p>
              <div className="flex items-center justify-center gap-0.5 mt-0.5">
                {pct > 0 ? <TrendingUp className="w-2.5 h-2.5 text-secondary" /> : pct < 0 ? <TrendingDown className="w-2.5 h-2.5 text-destructive" /> : null}
                <span className={`text-[8px] font-bold ${pct > 0 ? 'text-secondary' : pct < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {pct > 0 ? '+' : ''}{pct}%
                </span>
              </div>
            </button>
          );
        })}
        {/* Custom Date Range Button */}
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <button
              onClick={() => { setCalendarStep('cur_from'); setCalendarOpen(true); }}
              className={`p-2 rounded-xl border text-center transition-all ${
                compareView === 'custom'
                  ? 'bg-primary/10 border-primary/30 shadow-sm'
                  : 'bg-card/30 border-border/10 hover:bg-card/50'
              }`}>
              <CalendarDays className={`w-4 h-4 mx-auto ${compareView === 'custom' ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className={`text-[9px] font-bold mt-0.5 ${compareView === 'custom' ? 'text-primary' : 'text-muted-foreground'}`}>Custom</p>
              {compareView === 'custom' && customCurFrom ? (
                <p className="text-[8px] font-bold font-mono text-foreground leading-tight mt-0.5">{customCurStats.topicsDone}</p>
              ) : (
                <p className="text-xs font-bold text-muted-foreground/50 mt-0.5">🗓️</p>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end" side="bottom">
            <div className="p-3 border-b border-border/15 space-y-2">
              <p className="text-xs font-bold text-foreground">{stepLabels[calendarStep]}</p>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {['cur_from', 'cur_to', 'prev_from', 'prev_to'].map((step, i) => (
                  <span key={step} className="flex items-center gap-1">
                    {i > 0 && <span className="text-border">→</span>}
                    <span className={`px-1.5 py-0.5 rounded font-bold ${calendarStep === step ? 'bg-primary/15 text-primary' : ''}`}>
                      {i < 2 ? `A${i + 1}` : `B${i - 1}`}
                    </span>
                  </span>
                ))}
              </div>
              {/* Show selected dates so far */}
              <div className="grid grid-cols-2 gap-2 text-[9px]">
                <div className="p-1.5 rounded-lg bg-primary/5 border border-primary/10">
                  <p className="font-bold text-primary">Period A</p>
                  <p className="text-muted-foreground">{fmtShort(customCurFrom)} → {fmtShort(customCurTo)}</p>
                </div>
                <div className="p-1.5 rounded-lg bg-accent/5 border border-accent/10">
                  <p className="font-bold text-accent-foreground">Period B</p>
                  <p className="text-muted-foreground">{fmtShort(customPrevFrom)} → {fmtShort(customPrevTo)}</p>
                </div>
              </div>
            </div>
            <CalendarUI mode="single" selected={selectedDateForStep} onSelect={handleCalendarSelect}
              disabled={(date) => date > new Date()} className="rounded-b-xl" />
          </PopoverContent>
        </Popover>
      </div>

      {/* Custom Range Summary */}
      {compareView === 'custom' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/15 text-[10px]">
          <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-bold text-primary">{fmtShort(customCurFrom)} – {fmtShort(customCurTo)}</span>
            <span className="text-muted-foreground mx-1.5">vs</span>
            <span className="font-bold text-accent-foreground">{fmtShort(customPrevFrom)} – {fmtShort(customPrevTo)}</span>
          </div>
          <button onClick={() => { setCalendarStep('cur_from'); setCalendarOpen(true); }}
            className="text-[9px] font-bold text-primary hover:underline shrink-0">Edit</button>
        </div>
      )}

      {/* Main Comparison Content */}
      <AnimatePresence mode="wait">
        <motion.div key={compareView} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
          <GlowCard paper className="p-3.5 space-y-3">
            {/* Title */}
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-foreground">{active.lCur} vs {active.lPrev}</h4>
              <BadgePill text={`${fmtMin(active.cur.totalMinutes)} vs ${fmtMin(active.prev.totalMinutes)}`} />
            </div>

            {/* Key Metrics — 2×2 grid */}
            <div className="grid grid-cols-2 gap-2">
              <MetricRow icon={<Clock className="w-3.5 h-3.5 text-primary" />} label="Study Time"
                cur={fmtMin(active.cur.totalMinutes)} prev={fmtMin(active.prev.totalMinutes)}
                pct={pctChange(active.cur.totalMinutes, active.prev.totalMinutes)} />
              <MetricRow icon={<BookOpen className="w-3.5 h-3.5 text-secondary" />} label="Topics"
                cur={String(active.cur.topicsDone)} prev={String(active.prev.topicsDone)}
                pct={pctChange(active.cur.topicsDone, active.prev.topicsDone)} />
              <MetricRow icon={<Flame className="w-3.5 h-3.5 text-chart-4" />} label="Active Days"
                cur={String(active.cur.activeDays)} prev={String(active.prev.activeDays)}
                pct={pctChange(active.cur.activeDays, active.prev.activeDays)} />
              <MetricRow icon={<Target className="w-3.5 h-3.5 text-destructive" />} label="Difficulty"
                cur={active.cur.difficultyScore.toFixed(1)} prev={active.prev.difficultyScore.toFixed(1)}
                pct={pctChange(active.cur.difficultyScore, active.prev.difficultyScore)} />
            </div>

            {/* Chart */}
            <OverlayLineChart current={active.cur} previous={active.prev}
              labelCurrent={active.lCur} labelPrevious={active.lPrev} />

            {/* Difficulty Breakdown */}
            <div className="grid grid-cols-3 gap-2">
              <DiffCard label="Easy" cur={active.cur.easyDone} prev={active.prev.easyDone} color="secondary" />
              <DiffCard label="Medium" cur={active.cur.mediumDone} prev={active.prev.mediumDone} color="chart-4" />
              <DiffCard label="Hard" cur={active.cur.hardDone} prev={active.prev.hardDone} color="destructive" />
            </div>

            {/* Radar */}
            <DifficultyRadar current={active.cur} previous={active.prev} />

            {/* Insight */}
            <InsightBox cur={active.cur} prev={active.prev} lCur={active.lCur} lPrev={active.lPrev} />
          </GlowCard>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ANALYSIS TAB
   ════════════════════════════════════════════════════════════ */
function AnalysisTab({ allHourly, peakH, powerIndex, twStats, lwStats, tmStats, lmStats, subjects, dailyLogs, expanded, toggle }: {
  allHourly: number[]; peakH: number; powerIndex: number;
  twStats: PeriodStats; lwStats: PeriodStats; tmStats: PeriodStats; lmStats: PeriodStats;
  subjects: Subject[]; dailyLogs: DailyLog[];
  expanded: Record<string, boolean>; toggle: (k: string) => void;
}) {
  const gId = useId().replace(/:/g, '');
  const fmtHour = (h: number) => `${h % 12 || 12}${h >= 12 ? 'PM' : 'AM'}`;
  const piColor = powerIndex >= 70 ? 'secondary' : powerIndex >= 40 ? 'primary' : 'destructive';
  const piLabel = powerIndex >= 70 ? 'Elite' : powerIndex >= 50 ? 'Strong' : powerIndex >= 30 ? 'Building' : 'Getting Started';

  // 4-week efficiency sparkline
  const effSparkline = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 4 }, (_, wi) => {
      const end = new Date(now); end.setDate(end.getDate() - wi * 7);
      const start = new Date(end); start.setDate(start.getDate() - 6);
      const p = computePeriod(subjects, dailyLogs, localDate(start), localDate(end));
      return { week: `W${4 - wi}`, tph: Math.round(p.topicsPerHour * 10) / 10 };
    }).reverse();
  }, [subjects, dailyLogs]);

  return (
    <div className="space-y-2.5">
      {/* Power Index Summary Card */}
      <GlowCard paper className="p-4">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0 w-14 h-14">
            <CircularProgress value={powerIndex} max={100} size={56} strokeWidth={4}
              color={`hsl(var(--${piColor}))`} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-black font-mono text-foreground">{powerIndex}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Power Index</p>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-base font-black text-${piColor}`}>{piLabel}</span>
            </div>
            <p className="text-[8px] text-muted-foreground mt-0.5">Speed · Difficulty · Consistency</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] text-muted-foreground font-semibold">TPH</p>
            <p className="text-sm font-black font-mono text-foreground">{twStats.topicsPerHour.toFixed(1)}</p>
            <TrendBadge pct={pctChange(twStats.topicsPerHour, lwStats.topicsPerHour)} />
          </div>
        </div>
      </GlowCard>

      {/* 4-Week Sparkline */}
      <GlowCard paper className="p-3">
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Efficiency Trend (4 Weeks)</p>
        <ResponsiveContainer width="100%" height={70}>
          <AreaChart data={effSparkline} margin={{ left: -10, top: 4, right: 4, bottom: 0 }}>
            <defs>
              <linearGradient id={`ef_${gId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="week" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={false} />
            <YAxis tick={false} width={0} axisLine={false} />
            <Tooltip contentStyle={TT} />
            <Area type="monotone" dataKey="tph" stroke="hsl(var(--accent))" fill={`url(#ef_${gId})`} strokeWidth={2.5} name="Topics/Hr" dot={{ r: 3, fill: 'hsl(var(--accent))' }} />
          </AreaChart>
        </ResponsiveContainer>
      </GlowCard>

      {/* Peak Hours */}
      <Section title="Peak Hour Analysis" icon="⏰" open={!!expanded.peak} onToggle={() => toggle('peak')}
        gradient="bg-gradient-to-r from-chart-4/5 via-transparent to-transparent hover:from-chart-4/8"
        badge={peakH >= 0 ? <BadgePill text={`🔥 ${fmtHour(peakH)}`} color="chart-4" /> : undefined}>
        <HourlyHeatmap buckets={allHourly} />
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: 'Morning', range: [6, 12] as const, icon: '🌅' },
            { label: 'Afternoon', range: [12, 17] as const, icon: '☀️' },
            { label: 'Evening', range: [17, 21] as const, icon: '🌆' },
            { label: 'Night', range: [21, 6] as const, icon: '🌙' },
          ].map(slot => {
            const cnt = slot.range[0] < slot.range[1]
              ? allHourly.slice(slot.range[0], slot.range[1]).reduce((a: number, b: number) => a + b, 0)
              : allHourly.slice(slot.range[0]).concat(allHourly.slice(0, slot.range[1])).reduce((a: number, b: number) => a + b, 0);
            const allSlots = [
              allHourly.slice(6, 12).reduce((a: number, b: number) => a + b, 0),
              allHourly.slice(12, 17).reduce((a: number, b: number) => a + b, 0),
              allHourly.slice(17, 21).reduce((a: number, b: number) => a + b, 0),
              allHourly.slice(21).concat(allHourly.slice(0, 6)).reduce((a: number, b: number) => a + b, 0),
            ];
            const isMax = cnt > 0 && cnt === Math.max(...allSlots);
            return (
              <div key={slot.label} className={`text-center p-2 rounded-xl border ${isMax ? 'bg-chart-4/10 border-chart-4/25' : 'bg-card/30 border-border/10'}`}>
                <span className="text-sm">{slot.icon}</span>
                <p className={`text-sm font-black font-mono mt-0.5 ${isMax ? 'text-chart-4' : 'text-foreground'}`}>{cnt}</p>
                <p className="text-[7px] text-muted-foreground font-semibold">{slot.label}</p>
                {isMax && cnt > 0 && <span className="text-[7px] font-bold text-chart-4">PEAK</span>}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Study Patterns */}
      <StudyPatternsSection subjects={subjects} dailyLogs={dailyLogs} open={!!expanded.patterns} onToggle={() => toggle('patterns')} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   RECORDS TAB
   ════════════════════════════════════════════════════════════ */
function RecordsTab({ subjects, dailyLogs, expanded, toggle }: {
  subjects: Subject[]; dailyLogs: DailyLog[];
  expanded: Record<string, boolean>; toggle: (k: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      <PersonalRecordsSection subjects={subjects} dailyLogs={dailyLogs} open={!!expanded.records} onToggle={() => toggle('records')} />
      <CumulativeProgressSection subjects={subjects} open={!!expanded.cumulative} onToggle={() => toggle('cumulative')} />
      <PeriodLeaderboardSection subjects={subjects} dailyLogs={dailyLogs} open={!!expanded.leaderboard} onToggle={() => toggle('leaderboard')} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   HABITS TAB
   ════════════════════════════════════════════════════════════ */
function HabitsTab({ subjects, dailyLogs, expanded, toggle }: {
  subjects: Subject[]; dailyLogs: DailyLog[];
  expanded: Record<string, boolean>; toggle: (k: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      <StreakConsistencySection subjects={subjects} dailyLogs={dailyLogs} open={!!expanded.streak} onToggle={() => toggle('streak')} />
      <MomentumSection subjects={subjects} open={!!expanded.momentum} onToggle={() => toggle('momentum')} />
      <SubjectComparisonSection subjects={subjects} open={!!expanded.subjects} onToggle={() => toggle('subjects')} />
    </div>
  );
}

/* ═══ Helper: Compact Metric Row ═══ */
function MetricRow({ icon, label, cur, prev, pct }: {
  icon: React.ReactNode; label: string; cur: string; prev: string; pct: number;
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-card/30 border border-border/10">
      <div className="w-6 h-6 rounded-md bg-primary/8 flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[8px] text-muted-foreground font-semibold uppercase tracking-wider leading-none">{label}</p>
        <div className="flex items-baseline gap-1 mt-0.5">
          <span className="text-xs font-black font-mono text-foreground leading-none">{cur}</span>
          <span className="text-[8px] text-muted-foreground">vs {prev}</span>
        </div>
      </div>
      <div className="shrink-0">
        {pct === 0 ? (
          <span className="text-[9px] text-muted-foreground font-bold">—</span>
        ) : (
          <span className={`text-[9px] font-bold ${pct > 0 ? 'text-secondary' : 'text-destructive'}`}>
            {pct > 0 ? '↑' : '↓'}{Math.abs(pct)}%
          </span>
        )}
      </div>
    </div>
  );
}

/* ═══ Diff Card (replaces DiffPill) ═══ */
function DiffCard({ label, cur, prev, color }: { label: string; cur: number; prev: number; color: string }) {
  const diff = cur - prev;
  return (
    <div className={`text-center p-2.5 rounded-xl bg-${color}/5 border border-${color}/15`}>
      <p className={`text-[9px] font-bold text-${color} uppercase tracking-wider`}>{label}</p>
      <p className="text-base font-black font-mono text-foreground leading-tight mt-0.5">{cur}</p>
      {diff !== 0 && (
        <span className={`text-[9px] font-bold ${diff > 0 ? 'text-secondary' : 'text-destructive'}`}>
          {diff > 0 ? '+' : ''}{diff}
        </span>
      )}
    </div>
  );
}

/* ═══ Insight Box — plain language summary ═══ */
function InsightBox({ cur, prev, lCur, lPrev }: {
  cur: PeriodStats; prev: PeriodStats; lCur: string; lPrev: string;
}) {
  const topicPct = pctChange(cur.topicsDone, prev.topicsDone);
  const timePct = pctChange(cur.totalMinutes, prev.totalMinutes);

  let msg = '';
  let emoji = '📊';
  if (cur.topicsDone === 0 && prev.topicsDone === 0) {
    msg = 'No activity in either period yet. Start studying to see your comparison!';
    emoji = '🚀';
  } else if (topicPct > 20) {
    msg = `Great progress! You completed ${topicPct}% more topics ${lCur.toLowerCase()} compared to ${lPrev.toLowerCase()}.`;
    emoji = '🎉';
  } else if (topicPct > 0) {
    msg = `Slight improvement — ${topicPct}% more topics. Keep pushing!`;
    emoji = '👍';
  } else if (topicPct === 0) {
    msg = `Same output as ${lPrev.toLowerCase()}. Try to step it up!`;
    emoji = '➡️';
  } else if (topicPct > -20) {
    msg = `Slightly fewer topics (${topicPct}%). You can bounce back!`;
    emoji = '💪';
  } else {
    msg = `${Math.abs(topicPct)}% fewer topics than ${lPrev.toLowerCase()}. Let's refocus!`;
    emoji = '📉';
  }

  return (
    <div className="flex gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/10">
      <span className="text-lg shrink-0">{emoji}</span>
      <p className="text-[11px] text-foreground/80 leading-relaxed">{msg}</p>
    </div>
  );
}
