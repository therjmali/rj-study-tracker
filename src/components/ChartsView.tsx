import { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,

} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, BookOpen, Clock, Target, TrendingUp, CheckCircle2, ChevronDown, ChevronRight, FileDown, Loader2, Flame, Calendar, PieChart as PieIcon, Activity } from 'lucide-react';
import { exportPdf } from '@/platform/api';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import type { Subject, DailyLog, StudyGoals } from '../types';
import type { DifficultyFilter } from '../lib/studySuggestion';
import GlowCard from './shared/GlowCard';
import EmptyState from './shared/EmptyState';
import ProgressCalendar from './charts/ProgressCalendar';
import type { DbStudySession } from '../types';
import SubjectLink from './shared/SubjectLink';
import TrendAnalysis from './dashboard/TrendAnalysis';
import { formatDate, getLocalDateStr, formatStudyHours, getEffectiveStudyMinutes, getUnifiedTotalMinutes, getEffectiveDayMinutes, getMergedAllSessionMinutesBySubject, getMergedOverlappingSessionMinutesBySubject } from '../lib/utils';
import { lazy, Suspense } from 'react';
import SubjectReport from './charts/SubjectReport';
import DailyStudyHub from './charts/DailyStudyHub';
import TimeFilterPills from './shared/TimeFilterPills';
import { Input } from '@project/components/ui/input';

const DailyTracker = lazy(() => import('./DailyTracker'));

const TT = { contentStyle: { background: 'hsl(var(--card) / 0.95)', border: '1px solid hsl(var(--border) / 0.2)', borderRadius: 12, fontSize: 12, color: 'hsl(var(--foreground))' } };

type TimeFilter = 'all' | 'today' | 'weekly' | 'monthly' | 'custom';

function getDateRange(filter: TimeFilter, customFrom: string, customTo: string): { from: string; to: string } | null {
  if (filter === 'all') return null;
  const now = new Date();
  const today = getLocalDateStr(now);
  if (filter === 'today') return { from: today, to: today };
  if (filter === 'weekly') {
    const d = new Date(now);
    d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
    return { from: getLocalDateStr(d), to: today };
  }
  if (filter === 'monthly') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: getLocalDateStr(first), to: getLocalDateStr(last) };
  }
  if (filter === 'custom' && customFrom && customTo) {
    return { from: customFrom, to: customTo };
  }
  return null;
}

function inRange(date: string | undefined, range: { from: string; to: string } | null): boolean {
  if (!range) return true;
  if (!date) return false;
  return date >= range.from && date <= range.to;
}

function SectionDivider({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-5 pb-1">
      <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold text-foreground leading-tight">{title}</h3>
        {subtitle && <p className="text-[10px] text-muted-foreground font-medium">{subtitle}</p>}
      </div>
      <div className="flex-1 h-px bg-border/30 ml-2" />
    </div>
  );
}

interface ChartsViewProps {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  onUpdateLogs?: (logs: DailyLog[]) => void;
  onOpenTopicDetail?: (topic: import('../types').SubTopic, subjectId: string, unitId: string) => void;
  studyGoals?: StudyGoals;
  activeDate?: string;
  onDateChange?: (d: string) => void;
  trackingMode?: 'hours' | 'topics';
  onTrackingModeChange?: (m: 'hours' | 'topics') => void;
  onNavigateToCalendar?: (date: string) => void;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
  // Shared filter props from App
  diffFilter?: DifficultyFilter;
  timeFilter?: TimeFilter;
  customFrom?: string;
  customTo?: string;
  subjectFilter?: string;
  // Unified todo props from App
  todos?: import('../hooks/useTodos').TodoItem[];
  addTodo?: (todo: Omit<import('../hooks/useTodos').TodoItem, 'id' | 'createdAt' | 'completed'>) => void;
  toggleTodo?: (id: string) => void;
  deleteTodo?: (id: string) => void;
  updateTodo?: (id: string, changes: Partial<import('../hooks/useTodos').TodoItem>) => void;
  getTodosForDate?: (date: string) => import('../hooks/useTodos').TodoItem[];
  getPendingCountForDate?: (date: string) => number;
  // First-class session CRUD
  onCreateSession?: (session: { date: string; minutes: number; description: string; type: 'Topic' | 'Unit' | 'Other'; subjectId?: string; subjectName?: string; startTime?: string; endTime?: string; note?: string }) => void;
  onUpdateSession?: (sessionId: string, changes: Record<string, any>) => void;
  onDeleteSession?: (sessionId: string) => void;
  onUpdateSubjects?: (subjects: Subject[]) => void;
  settings?: import('../types').UserSettings;
  onUpdateSettings?: (s: import('../types').UserSettings) => void;
  dbSessions?: import('../types').DbStudySession[];
  exams?: import('../types').ExamConfig[];
}

export default function ChartsView({
  subjects, dailyLogs, onUpdateLogs, onOpenTopicDetail, studyGoals,
  activeDate, onDateChange, trackingMode, onTrackingModeChange,
  diffFilter = 'all', timeFilter = 'all', customFrom = '', customTo = '', subjectFilter = 'all',
  onNavigateToCalendar, onNavigate,
  todos, addTodo, toggleTodo, deleteTodo, updateTodo, getTodosForDate, getPendingCountForDate,
  onCreateSession, onUpdateSession, onDeleteSession, onUpdateSubjects,
  settings, onUpdateSettings, dbSessions, exams,
}: ChartsViewProps) {
  const [subTab, setSubTab] = useState<'charts' | 'daily'>('charts');
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 100); return () => clearTimeout(t); }, []);

  // Use the shared filter from App
  const range = useMemo(() => getDateRange(timeFilter, customFrom, customTo), [timeFilter, customFrom, customTo]);

  // Filter subjects by subjectFilter
  const filteredSubjects = useMemo(() => {
    if (subjectFilter === 'all') return subjects;
    const ids = subjectFilter.split(',');
    return subjects.filter(s => ids.includes(s.id));
  }, [subjects, subjectFilter]);

  const summary = useMemo(() => {
    const allTopics = filteredSubjects.flatMap(s => s.units.flatMap(u => u.subTopics));
    const filtered = range
      ? allTopics.filter(t => t.completed && inRange(t.completedDate, range))
      : allTopics.filter(t => t.completed);
    const doneTops = filtered.length;
    // For "All Time" (no range), use getUnifiedTotalMinutes to include logged sessions
    const totalHours = range
      ? getEffectiveStudyMinutes(filteredSubjects, dailyLogs, range.from, range.to, dbSessions) / 60
      : getUnifiedTotalMinutes(filteredSubjects, dbSessions, dailyLogs) / 60;
    const activeSubjects = filteredSubjects.filter(s =>
      s.units.some(u => u.subTopics.some(t => t.completed && inRange(t.completedDate, range)))
    ).length;
    const allTotal = allTopics.length;
    const allDone = allTopics.filter(t => t.completed).length;
    const pct = allTotal > 0 ? Math.round((allDone / allTotal) * 100) : 0;
    return { doneTops, totalTopics: range ? doneTops : allTotal, totalHours, activeSubjects, pct, allTotal };
  }, [filteredSubjects, dailyLogs, range]);

  const topicsData = useMemo(() => {
    return filteredSubjects.map(s => {
      const all = s.units.flatMap(u => u.subTopics);
      const done = range
        ? all.filter(t => t.completed && inRange(t.completedDate, range)).length
        : all.filter(t => t.completed).length;
      return { name: s.shortName, id: s.id, Done: done, Pending: all.length - done, color: s.color, total: all.length };
    });
  }, [filteredSubjects, range]);

  const unitsData = useMemo(() => {
    return filteredSubjects.map(s => {
      let full = 0, partial = 0, notStarted = 0;
      s.units.forEach(u => {
        const done = range
          ? u.subTopics.filter(t => t.completed && inRange(t.completedDate, range)).length
          : u.subTopics.filter(t => t.completed).length;
        if (done === u.subTopics.length && u.subTopics.length > 0) full++;
        else if (done > 0) partial++;
        else notStarted++;
      });
      return { name: s.shortName, Complete: full, Partial: partial, 'Not Started': notStarted, color: s.color };
    });
  }, [filteredSubjects, range]);

  // Per-subject session maps for unified time calculation
  const allSessionMins = useMemo(() =>
    dbSessions ? getMergedAllSessionMinutesBySubject(dbSessions, dailyLogs) : new Map<string, number>(),
    [dbSessions, dailyLogs]
  );
  const overlappingSessionMins = useMemo(() =>
    dbSessions ? getMergedOverlappingSessionMinutesBySubject(dbSessions, dailyLogs) : new Map<string, number>(),
    [dbSessions, dailyLogs]
  );

  const hoursData = useMemo(() => {
    // Unified per-subject time: allSessions + max(0, topicUnitTime - overlapping)
    // Same formula used by StatCardsGrid for consistency
    return filteredSubjects.map(s => {
      let topicUnitTime = 0;
      s.units.forEach(u => {
        topicUnitTime += u.timeSpent || 0;
        u.subTopics.forEach(t => {
          if (range) {
            // When range is set, only count time from completed topics in range
            if (t.completed && inRange(t.completedDate, range) && (t.timeSpent || 0) > 0) {
              topicUnitTime += t.timeSpent;
            }
          } else {
            topicUnitTime += t.timeSpent || 0;
          }
        });
      });
      // Add logged session time using unified dedup formula
      const sessAll = allSessionMins.get(s.id) || 0;
      const sessOverlap = overlappingSessionMins.get(s.id) || 0;
      const totalMins = sessAll > 0
        ? sessAll + Math.max(0, topicUnitTime - sessOverlap)
        : topicUnitTime;
      return {
        name: s.shortName,
        id: s.id,
        Hours: Math.round((totalMins / 60) * 10) / 10,
        color: s.color,
      };
    });
  }, [filteredSubjects, range, allSessionMins, overlappingSessionMins]);

  // Time distribution pie chart data
  const timeDistData = useMemo(() => {
    return hoursData
      .filter(d => d.Hours > 0)
      .map(d => ({ name: d.name, value: d.Hours, color: d.color }));
  }, [hoursData]);

  const diffDist = useMemo(() => {
    const allT = filteredSubjects.flatMap(s => s.units.flatMap(u => u.subTopics));
    const filtered = range ? allT.filter(t => t.completed && inRange(t.completedDate, range)) : allT;
    let easy = 0, med = 0, hard = 0;
    filtered.forEach(t => {
      if (t.difficulty === 'Easy') easy++;
      else if (t.difficulty === 'Medium') med++;
      else hard++;
    });
    return [
      { name: 'Easy', value: easy, color: 'hsl(var(--diff-easy))' },
      { name: 'Medium', value: med, color: 'hsl(var(--diff-medium))' },
      { name: 'Hard', value: hard, color: 'hsl(var(--diff-hard))' },
    ];
  }, [filteredSubjects, range]);

  const hasActiveFilter = timeFilter !== 'all' || subjectFilter !== 'all' || diffFilter !== 'all';

  if (subjects.length === 0) {
    return (
      <EmptyState
        emoji="📊"
        title="No Data Yet"
        description="Add subjects and start tracking your study to see detailed charts, progress breakdowns, and analytics."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" /> Statistics
        </h2>
        <PdfExportButton subjects={subjects} dailyLogs={dailyLogs} />
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-2">
        <Button variant={subTab === 'charts' ? 'default' : 'outline'} size="sm" onClick={() => setSubTab('charts')}
          className="flex-1 gap-1.5 text-xs h-9 font-bold">
          📊 Charts
        </Button>
        <Button variant={subTab === 'daily' ? 'default' : 'outline'} size="sm" onClick={() => setSubTab('daily')}
          className="flex-1 gap-1.5 text-xs h-9 font-bold">
          🔥 Daily Log
        </Button>
      </div>

      {/* Daily Log sub-tab */}
      {subTab === 'daily' && onUpdateLogs && activeDate && onDateChange && trackingMode && onTrackingModeChange && studyGoals ? (
        <Suspense fallback={<div className="h-40 flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
          <DailyTracker dailyLogs={dailyLogs} subjects={subjects} onUpdate={onUpdateLogs} onDateChange={onDateChange} activeDate={activeDate} trackingMode={trackingMode} onTrackingModeChange={onTrackingModeChange} studyGoals={studyGoals} onNavigate={onNavigate} todos={todos} onCreateSession={onCreateSession} onUpdateSession={onUpdateSession} onDeleteSession={onDeleteSession} settings={settings} onUpdateSettings={onUpdateSettings} dbSessions={dbSessions} />
        </Suspense>
      ) : subTab === 'daily' ? (
        <div className="glass-card p-8 text-center">
          <span className="text-3xl">🔥</span>
          <p className="text-sm text-muted-foreground mt-2">Daily tracker not available in this context</p>
        </div>
      ) : null}

      {/* Charts content */}
      {subTab === 'charts' && <>

      {/* ═══════════════════════════════════════════
          SECTION 1: DAILY HUB & OVERVIEW
          ═══════════════════════════════════════════ */}
      <DailyStudyHub subjects={filteredSubjects} dailyLogs={dailyLogs} studyGoals={studyGoals} dbSessions={dbSessions} />

      {/* ── Calendar right below Daily Study Hub ── */}
      <ProgressCalendar subjects={subjects} dailyLogs={dailyLogs}
        externalRange={range}
        externalSubjectFilter={subjectFilter}
        onUpdateLogs={onUpdateLogs}
        todos={todos} addTodo={addTodo} toggleTodo={toggleTodo} deleteTodo={deleteTodo} updateTodo={updateTodo} getTodosForDate={getTodosForDate} getPendingCountForDate={getPendingCountForDate}
        onUpdateMood={onUpdateLogs ? (date, mood, notes) => {
          const updated = dailyLogs.map(l => l.date !== date ? l : { ...l, ...(mood !== undefined ? { mood } : { mood: undefined }), notes: notes || l.notes });
          if (!dailyLogs.find(l => l.date === date)) {
            updated.push({ date, hoursStudied: 0, topicsCompleted: 0, mood, notes, subjectFocus: '' });
          }
          onUpdateLogs(updated);
        } : undefined}
        onOpenTopicDetail={onOpenTopicDetail}
        onNavigateToCalendar={onNavigateToCalendar}
        onCreateSession={onCreateSession} onUpdateSession={onUpdateSession} onDeleteSession={onDeleteSession} onUpdateSubjects={onUpdateSubjects}
        dbSessions={dbSessions} exams={exams} onNavigate={onNavigate} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <SummaryCard icon={<CheckCircle2 className="w-4 h-4 text-secondary" />}
          label="Topics Done" value={String(summary.doneTops)} sub={timeFilter === 'all' ? `/ ${summary.allTotal}` : 'in period'} />
        <SummaryCard icon={<Clock className="w-4 h-4 text-accent" />}
          label="Total Hours" value={formatStudyHours(summary.totalHours)} sub="studied" />
        <SummaryCard icon={<BookOpen className="w-4 h-4 text-primary" />}
          label="Active Subjects" value={String(summary.activeSubjects)} sub={`/ ${filteredSubjects.length}`} />
        <SummaryCard icon={<Target className="w-4 h-4 text-destructive" />}
          label="Completion" value={`${summary.pct}%`} sub="overall" />
      </div>

      {/* ═══════════════════════════════════════════
          DAILY TREND — collapsible with own filter
          ═══════════════════════════════════════════ */}
      <DailyTrendSection
        subjects={subjects}
        filteredSubjects={filteredSubjects}
        dailyLogs={dailyLogs}
        dbSessions={dbSessions}
        range={range}
        onOpenTopicDetail={onOpenTopicDetail}
        onNavigate={onNavigate}
      />

      {/* ═══════════════════════════════════════════
          SECTION 2: UNIFIED SUBJECT REPORT
          ═══════════════════════════════════════════ */}
      <SubjectReport
        subjects={filteredSubjects}
        topicsData={topicsData}
        unitsData={unitsData}
        hoursData={hoursData}
        onNavigate={onNavigate}
        hasActiveFilter={hasActiveFilter}
        range={range}
        dbSessions={dbSessions}
        dailyLogs={dailyLogs}
      />

      {/* ═══════════════════════════════════════════
          SECTION 3: DISTRIBUTIONS
          ═══════════════════════════════════════════ */}
      <SectionDivider icon={<Calendar className="w-4 h-4 text-primary" />} title="Distributions" subtitle="Difficulty breakdown" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Difficulty Distribution */}
        <GlowCard className="p-4" paper>
          <h3 className="text-xs font-semibold text-foreground mb-3">🎯 Difficulty Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={diffDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={30}
                isAnimationActive={mounted} animationBegin={0} animationDuration={600}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}>
                {diffDist.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip {...TT} />
            </PieChart>
          </ResponsiveContainer>
        </GlowCard>

        {/* Time Distribution */}
        {timeDistData.length > 0 && (
          <GlowCard className="p-4" paper>
            <h3 className="text-xs font-semibold text-foreground mb-3">⏱️ Time Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={timeDistData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={30}
                  isAnimationActive={mounted} animationBegin={0} animationDuration={600}
                  label={({ name, value }) => `${name} ${formatStudyHours(value)}`}
                  labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}>
                  {timeDistData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip {...TT} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {timeDistData.map(d => (
                <span key={d.name} className="flex items-center gap-1 text-[10px] font-bold">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}: {formatStudyHours(d.value)}
                </span>
              ))}
            </div>
          </GlowCard>
        )}
      </div>

      {/* ═══════════════════════════════════════════
          SECTION 4: DETAILED REPORT
          ═══════════════════════════════════════════ */}
      <SectionDivider icon={<PieIcon className="w-4 h-4 text-primary" />} title="My Report" subtitle="Comprehensive study analysis" />
      <MyReportSection subjects={filteredSubjects} dailyLogs={dailyLogs} range={range} mounted={mounted} allSubjects={subjects} onNavigate={onNavigate} dbSessions={dbSessions} />

      </>}
    </div>
  );
}

/** Enhanced breakdown when a time filter is active */
function DetailedSubjectBreakdown({ subjects, range, hoursData, onOpenTopicDetail, onNavigate }: {
  subjects: Subject[];
  range: { from: string; to: string } | null;
  hoursData: { name: string; Hours: number; color: string }[];
  onOpenTopicDetail?: (topic: import('../types').SubTopic, subjectId: string, unitId: string) => void;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
}) {
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedSubjects(p => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const breakdown = useMemo(() => {
    return subjects.map(s => {
      const units = s.units.map(u => {
        const completedTopics = u.subTopics.filter(t => t.completed && inRange(t.completedDate, range));
        return { unit: u, completedTopics };
      }).filter(u => u.completedTopics.length > 0);
      const totalDone = units.reduce((a, u) => a + u.completedTopics.length, 0);
      const totalAll = s.units.flatMap(u => u.subTopics).length;
      return { subject: s, units, totalDone, totalAll };
    }).filter(s => s.totalDone > 0);
  }, [subjects, range]);

  return (
    <GlowCard className="p-4" paper>
      <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-primary" /> Detailed Breakdown
        {range && (
          <span className="text-[9px] text-muted-foreground font-normal ml-auto">
            {formatDate(range.from)} — {formatDate(range.to)}
          </span>
        )}
      </h3>

      {breakdown.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-4">No topics completed in this period</p>
      ) : (
        <div className="space-y-2">
          {breakdown.map(({ subject: s, units, totalDone, totalAll }) => {
            const isExpanded = expandedSubjects.has(s.id);
            const pct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;
            return (
              <div key={s.id} className="rounded-xl border border-border/15 bg-card/20 overflow-hidden">
                <button
                  onClick={() => toggle(s.id)}
                  className="flex items-center gap-3 w-full p-3 hover:bg-muted/10 transition-colors"
                >
                  <div className="w-2.5 h-8 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <SubjectLink shortName={s.shortName} color={s.color} subjectId={s.id} onNavigate={onNavigate} variant="text" className="text-[11px]" />
                      <span className="text-[9px] text-muted-foreground truncate">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                      </div>
                      <span className="text-[9px] font-mono text-muted-foreground">{totalDone} done</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-bold font-mono text-foreground">{totalDone}/{totalAll}</span>
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-2">
                        {units.map(({ unit: u, completedTopics }) => (
                          <div key={u.id} className="ml-4">
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                              {u.name}
                              <span className="ml-1 font-mono">({completedTopics.length}/{u.subTopics.length})</span>
                            </p>
                            <div className="space-y-0.5 ml-2">
                              {completedTopics.map(t => (
                                <button key={t.id} className="flex items-center gap-1.5 py-0.5 w-full text-left hover:bg-card/40 rounded transition-colors group/topic"
                                  onClick={() => onOpenTopicDetail?.(t, s.id, u.id)}>
                                  <CheckCircle2 className="w-3 h-3 text-secondary shrink-0" />
                                  <span className="text-[10px] text-foreground flex-1 truncate group-hover/topic:text-primary transition-colors">{t.name}</span>
                                  <span className={`text-[7px] px-1 py-0.5 rounded font-bold shrink-0 ${
                                    t.difficulty === 'Easy' ? 'bg-diff-easy/20 text-diff-easy'
                                    : t.difficulty === 'Medium' ? 'bg-diff-medium/20 text-diff-medium'
                                    : 'bg-diff-hard/20 text-diff-hard'
                                  }`}>{t.difficulty[0]}</span>
                                  {t.completedDate && (
                                    <span className="text-[8px] text-muted-foreground font-mono shrink-0">
                                      {formatDate(t.completedDate)}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </GlowCard>
  );
}

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="glass-card p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">{icon}<span className="text-[10px] text-muted-foreground">{label}</span></div>
      <p className="text-xl font-bold font-mono text-foreground leading-none">{value}</p>
      <p className="text-[9px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function PdfExportButton({ subjects, dailyLogs }: { subjects: Subject[]; dailyLogs: DailyLog[] }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const subjectData = subjects.map(s => {
        const all = s.units.flatMap(u => u.subTopics);
        const done = all.filter(t => t.completed);
        return {
          name: s.name, shortName: s.shortName, color: s.color, examDate: s.examDate,
          totalTopics: all.length, completedTopics: done.length,
          easyCount: all.filter(t => t.difficulty === 'Easy').length,
          mediumCount: all.filter(t => t.difficulty === 'Medium').length,
          hardCount: all.filter(t => t.difficulty === 'Hard').length,
          totalHours: Math.round(all.reduce((a, t) => a + (t.timeSpent || 0), 0) / 60 * 10) / 10,
        };
      });
      const allTopics = subjects.flatMap(s => s.units.flatMap(u => u.subTopics));
      const totalHours = getUnifiedTotalMinutes(subjects, undefined, dailyLogs) / 60;
      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 365; i++) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const ds = getLocalDateStr(d);
        const log = dailyLogs.find(l => l.date === ds);
        if (log && (log.hoursStudied > 0 || log.topicsCompleted > 0)) streak++;
        else break;
      }
      const result = await exportPdf({
        studentName: 'Student', subjects: subjectData,
        totalTopics: allTopics.length, completedTopics: allTopics.filter(t => t.completed).length,
        totalHours: Math.round(totalHours * 10) / 10, streakDays: streak,
        generatedAt: new Date().toLocaleDateString('en-IN', { dateStyle: 'long' }),
      });
      window.open(result.url, '_blank');
      toast.success('📄 PDF report generated!');
    } catch { toast.error('Failed to generate PDF. Try again.'); }
    finally { setLoading(false); }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading} className="gap-1.5 text-xs h-8">
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
      {loading ? 'Exporting...' : 'PDF Report'}
    </Button>
  );
}

/** My Report Section */
function MyReportSection({ subjects, dailyLogs, range, mounted, allSubjects, onNavigate, dbSessions }: {
  subjects: Subject[]; dailyLogs: DailyLog[];
  range: { from: string; to: string } | null; mounted: boolean;
  allSubjects: Subject[];
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
  dbSessions?: import('../types').DbStudySession[];
}) {
  // Subject filter within report is now handled by the shared filter — use subjects directly
  const filteredSubjects = subjects;

  const report = useMemo(() => {
    const allTopics = filteredSubjects.flatMap(s => s.units.flatMap(u => u.subTopics));
    const completedInRange = range
      ? allTopics.filter(t => t.completed && inRange(t.completedDate, range))
      : allTopics.filter(t => t.completed);

    // Per-subject session maps for unified time
    const sessAllMap = dbSessions ? getMergedAllSessionMinutesBySubject(dbSessions, dailyLogs) : new Map<string, number>();
    const sessOverlapMap = dbSessions ? getMergedOverlappingSessionMinutesBySubject(dbSessions, dailyLogs) : new Map<string, number>();

    const perSubject = filteredSubjects.map(s => {
      const subTopics = s.units.flatMap(u => u.subTopics);
      const done = range ? subTopics.filter(t => t.completed && inRange(t.completedDate, range)).length : subTopics.filter(t => t.completed).length;
      // Unified per-subject time: allSessions + max(0, topicUnitTime - overlapping)
      let topicUnitTime = 0;
      s.units.forEach(u => {
        topicUnitTime += u.timeSpent || 0;
        u.subTopics.forEach(t => { topicUnitTime += t.timeSpent || 0; });
      });
      const sessAll = sessAllMap.get(s.id) || 0;
      const sessOverlap = sessOverlapMap.get(s.id) || 0;
      const timeMin = sessAll > 0 ? sessAll + Math.max(0, topicUnitTime - sessOverlap) : topicUnitTime;
      return { name: s.shortName, color: s.color, Topics: done, total: subTopics.length, Hours: Math.round(timeMin / 6) / 10 };
    }).sort((a, b) => b.Topics - a.Topics);

    let easy = 0, med = 0, hard = 0;
    completedInRange.forEach(t => { if (t.difficulty === 'Easy') easy++; else if (t.difficulty === 'Medium') med++; else hard++; });

    const byDay: Record<string, { topics: number; minutes: number }> = {};
    completedInRange.forEach(t => {
      if (t.completedDate) {
        if (!byDay[t.completedDate]) byDay[t.completedDate] = { topics: 0, minutes: 0 };
        byDay[t.completedDate].topics++;
        byDay[t.completedDate].minutes += t.timeSpent || 0;
      }
    });
    const bestDayEntry = Object.entries(byDay).sort((a, b) => b[1].topics - a[1].topics)[0];
    const bestDay = bestDayEntry ? { date: bestDayEntry[0], count: bestDayEntry[1].topics } : null;

    const daysInRange = range
      ? Math.max(1, Math.ceil((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000) + 1)
      : 14;
    const avgPerDay = daysInRange > 0 ? (completedInRange.length / daysInRange) : 0;
    const totalHours = range
      ? getEffectiveStudyMinutes(filteredSubjects, dailyLogs, range.from, range.to, dbSessions) / 60
      : getUnifiedTotalMinutes(filteredSubjects, dbSessions, dailyLogs) / 60;
    const mostProductive = perSubject.length > 0 ? perSubject[0] : null;

    return { totalDone: completedInRange.length, perSubject, easy, med, hard, bestDay, avgPerDay, totalHours, mostProductive };
  }, [filteredSubjects, dailyLogs, range]);

  return (
    <GlowCard className="p-4" paper>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">📋 My Report</h3>
      </div>

      {report.totalDone === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">No topics completed in this period. Start studying to see your report! 💪</p>
      ) : (
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl bg-secondary/10 border border-secondary/20 p-2.5 text-center">
              <p className="text-xl font-black font-mono text-secondary leading-none">{report.totalDone}</p>
              <p className="text-[9px] text-muted-foreground font-semibold mt-1">Topics Done</p>
            </div>
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-2.5 text-center">
              <p className="text-xl font-black font-mono text-primary leading-none">{formatStudyHours(report.totalHours)}</p>
              <p className="text-[9px] text-muted-foreground font-semibold mt-1">Hours Studied</p>
            </div>
            <div className="rounded-xl bg-accent/10 border border-accent/20 p-2.5 text-center">
              <p className="text-xl font-black font-mono text-foreground leading-none">{report.avgPerDay.toFixed(1)}</p>
              <p className="text-[9px] text-muted-foreground font-semibold mt-1">Avg Topics/Day</p>
            </div>
            {report.bestDay && (
              <div className="rounded-xl bg-chart-4/10 border border-chart-4/20 p-2.5 text-center">
                <p className="text-xl font-black font-mono text-foreground leading-none">{report.bestDay.count}</p>
                <p className="text-[9px] text-muted-foreground font-semibold mt-1">Best Day</p>
                <p className="text-[8px] text-muted-foreground/50">{formatDate(report.bestDay.date)}</p>
              </div>
            )}
          </div>

          {/* Most Productive Subject */}
          {report.mostProductive && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-card/40 border border-border/15">
              <div className="w-3 h-8 rounded-full" style={{ backgroundColor: report.mostProductive.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground font-semibold">🏆 Most Productive</p>
                <p className="text-sm font-bold text-foreground">{report.mostProductive.name} · {report.mostProductive.Topics} topics · {formatStudyHours(report.mostProductive.Hours)}</p>
              </div>
            </div>
          )}

          {/* Dual Bar Chart */}
          {report.perSubject.length > 1 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-2 flex items-center gap-1">📊 Topics & Hours by Subject</p>
              <ResponsiveContainer width="100%" height={Math.max(160, report.perSubject.length * 28)}>
                <BarChart data={report.perSubject} layout="vertical" margin={{ left: 0, right: 8 }}>
                  <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} width={42} />
                  <Tooltip {...TT} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Topics" fill="hsl(var(--secondary))" radius={[0, 4, 4, 0]} barSize={10} />
                  <Bar dataKey="Hours" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}



          {/* Difficulty Distribution */}
          <div className="rounded-xl bg-card/30 border border-border/10 p-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground mb-2">🎯 Difficulty Breakdown</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-semibold w-8 shrink-0">Diff</span>
              <div className="flex-1 h-4 rounded-full overflow-hidden flex bg-muted/15 border border-border/10">
                {report.easy > 0 && <div className="h-full bg-diff-easy transition-all" style={{ width: `${(report.easy / report.totalDone) * 100}%` }} title={`Easy: ${report.easy}`} />}
                {report.med > 0 && <div className="h-full bg-diff-medium transition-all" style={{ width: `${(report.med / report.totalDone) * 100}%` }} title={`Medium: ${report.med}`} />}
                {report.hard > 0 && <div className="h-full bg-diff-hard transition-all" style={{ width: `${(report.hard / report.totalDone) * 100}%` }} title={`Hard: ${report.hard}`} />}
              </div>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              <span className="flex items-center gap-1 text-[10px] font-bold"><span className="w-2.5 h-2.5 rounded-full bg-diff-easy" />🟢 Easy: {report.easy}</span>
              <span className="flex items-center gap-1 text-[10px] font-bold"><span className="w-2.5 h-2.5 rounded-full bg-diff-medium" />🟡 Medium: {report.med}</span>
              <span className="flex items-center gap-1 text-[10px] font-bold"><span className="w-2.5 h-2.5 rounded-full bg-diff-hard" />🔴 Hard: {report.hard}</span>
            </div>
          </div>


        </div>
      )}
    </GlowCard>
  );
}

/** Daily Trend — collapsible with its own filter */
function DailyTrendSection({ subjects, filteredSubjects, dailyLogs, dbSessions, range, onOpenTopicDetail, onNavigate }: {
  subjects: Subject[];
  filteredSubjects: Subject[];
  dailyLogs: DailyLog[];
  dbSessions?: DbStudySession[];
  range: { from: string; to: string } | null;
  onOpenTopicDetail?: (topic: import('../types').SubTopic, subjectId: string, unitId: string) => void;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(true);
  const [localTimeFilter, setLocalTimeFilter] = useState<TimeFilter>(() => {
    try { const v = localStorage.getItem('daily-trend-time-filter'); return (v as TimeFilter) || 'all'; } catch { return 'all'; }
  });
  const [localCustomFrom, setLocalCustomFrom] = useState(() => {
    try { return localStorage.getItem('daily-trend-custom-from') || ''; } catch { return ''; }
  });
  const [localCustomTo, setLocalCustomTo] = useState(() => {
    try { return localStorage.getItem('daily-trend-custom-to') || ''; } catch { return ''; }
  });

  useEffect(() => {
    try {
      localStorage.setItem('daily-trend-time-filter', localTimeFilter);
      localStorage.setItem('daily-trend-custom-from', localCustomFrom);
      localStorage.setItem('daily-trend-custom-to', localCustomTo);
    } catch {}
  }, [localTimeFilter, localCustomFrom, localCustomTo]);

  // Compute effective range: local filter overrides parent range
  const effectiveRange = useMemo(() => {
    if (localTimeFilter !== 'all') {
      const r = getDateRange(localTimeFilter, localCustomFrom, localCustomTo);
      if (r) return r;
    }
    // Fall back to parent range or all-time
    if (range) return range;
    let earliest = getLocalDateStr();
    filteredSubjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate < earliest) earliest = t.completedDate;
    })));
    dailyLogs.forEach(l => { if (l.date < earliest && (l.hoursStudied > 0 || l.topicsCompleted > 0)) earliest = l.date; });
    return { from: earliest, to: getLocalDateStr() };
  }, [localTimeFilter, localCustomFrom, localCustomTo, range, filteredSubjects, dailyLogs]);

  // Is this effectively an "all time" view?
  const isAllTime = localTimeFilter === 'all' && !range;

  // Summary for subtitle
  const quickStats = useMemo(() => {
    let topics = 0;
    filteredSubjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate >= effectiveRange.from && t.completedDate <= effectiveRange.to) topics++;
    })));
    const mins = isAllTime
      ? getUnifiedTotalMinutes(filteredSubjects, dbSessions, dailyLogs)
      : getEffectiveStudyMinutes(filteredSubjects, dailyLogs, effectiveRange.from, effectiveRange.to, dbSessions);
    return { topics, hours: mins / 60 };
  }, [filteredSubjects, dailyLogs, dbSessions, effectiveRange, isAllTime]);

  const dataStartDate = useMemo(() => {
    let earliest = getLocalDateStr();
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate < earliest) earliest = t.completedDate;
    })));
    return earliest;
  }, [subjects]);

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-card/30 transition-colors active:scale-[0.998]"
      >
        <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-foreground leading-tight">Daily Trend</h3>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
            Topics & hours over time · {quickStats.topics} topics · {formatStudyHours(quickStats.hours)}
          </p>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Compact filter */}
              <div className="rounded-xl border border-border/15 bg-card/20 p-2.5">
                <TimeFilterPills
                  timeFilter={localTimeFilter}
                  onTimeFilterChange={setLocalTimeFilter}
                  customFrom={localCustomFrom}
                  customTo={localCustomTo}
                  onCustomFromChange={setLocalCustomFrom}
                  onCustomToChange={setLocalCustomTo}
                  dataStartDate={dataStartDate}
                />
                <AnimatePresence>
                  {localTimeFilter === 'custom' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="flex gap-2 mt-2">
                        <div className="flex-1">
                          <label className="text-[9px] text-muted-foreground mb-1 block font-semibold">From</label>
                          <Input type="date" value={localCustomFrom} onChange={e => setLocalCustomFrom(e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div className="flex-1">
                          <label className="text-[9px] text-muted-foreground mb-1 block font-semibold">To</label>
                          <Input type="date" value={localCustomTo} onChange={e => setLocalCustomTo(e.target.value)} className="h-8 text-xs" />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Range indicator */}
              <p className="text-[9px] text-primary font-semibold text-center">
                📊 {effectiveRange.from === effectiveRange.to ? effectiveRange.from : `${effectiveRange.from} — ${effectiveRange.to}`}
              </p>

              <TrendAnalysis
                subjects={filteredSubjects}
                dailyLogs={dailyLogs}
                dbSessions={dbSessions}
                range={effectiveRange}
                isAllTime={isAllTime}
                onOpenTopicDetail={onOpenTopicDetail}
                onNavigate={onNavigate}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HBarRow({ label, value, max, color, suffix, subjectId, onNavigate }: { label: string; value: number; max: number; color: string; suffix: string; subjectId?: string; onNavigate?: (tab: string, filter?: Record<string, string>) => void }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      {subjectId && onNavigate ? (
        <SubjectLink shortName={label} color={color} subjectId={subjectId} onNavigate={onNavigate} variant="text" className="w-12 truncate" />
      ) : (
        <span className="text-[11px] font-semibold text-foreground w-12 truncate">{label}</span>
      )}
      <div className="flex-1 h-4 rounded-full bg-muted/25 overflow-hidden relative">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-14 text-right">{suffix}</span>
    </div>
  );
}
