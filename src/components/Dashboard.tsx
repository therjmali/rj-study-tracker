import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, BarChart3, ChevronDown } from 'lucide-react';
import { useExcludedSubjects } from '../hooks/useExcludedSubjects';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Input } from '@project/components/ui/input';
import type { Subject, DailyLog, StudyGoals, TrackingMode, SemesterConfig, UserSettings, SubTopic, DbStudySession } from '../types';
import type { DifficultyFilter } from '../lib/studySuggestion';
import TodaySessions from './dashboard/TodaySessions';
import { getLocalDateStr, formatStudyHours, getEffectiveStudyMinutes, getUnifiedTotalMinutes } from '../lib/utils';
import EmptyState from './shared/EmptyState';
import DashboardHeader from './dashboard/DashboardHeader';
import StatCardsGrid from './dashboard/StatCardsGrid';
import TodaysFocus from './dashboard/TodaysFocus';
import WhatToStudyNext from './dashboard/WhatToStudyNext';
import StudyReport from './dashboard/StudyReport';
import WeeklyRecap from './dashboard/WeeklyRecap';
import StudyVelocity from './dashboard/StudyVelocity';
import AIStudyPlan from './dashboard/AIStudyPlan';
import PerformanceMetrics from './dashboard/PerformanceMetrics';
import TargetsTicker from './dashboard/TargetsTicker';
import SubjectIntelligence from './dashboard/SubjectIntelligence';
import ExamShelf from './dashboard/ExamShelf';
import DayByDayTimeline from './dashboard/DayByDayTimeline';
import TodayProgressRing from './dashboard/TodayProgressRing';
import ProgressCard from './progress/ProgressCard';

type TimeFilter = 'all' | 'today' | 'weekly' | 'monthly' | 'custom';

interface DashboardProps {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  studyGoals: StudyGoals;
  trackingMode: TrackingMode;
  onNavigate: (tab: string, filter?: Record<string, string>) => void;
  onUpdateLogs: (logs: DailyLog[]) => void;
  semesterConfig: SemesterConfig;
  onUpdateSettings?: (settings: Partial<UserSettings>) => void;
  settings?: UserSettings;
  onToggleTopic?: (subjectId: string, unitId: string, topicId: string) => void;
  onOpenProfile?: () => void;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string) => void;
  onAddTodo?: (todo: { text: string; priority: 'high' | 'medium' | 'low'; dueDate: string; category?: string }) => void;
  dbSessions?: DbStudySession[];
  onUpdateSession?: (sessionId: string, changes: Partial<DbStudySession>) => void;
  onDeleteSession?: (sessionId: string) => void;
  diffFilter: DifficultyFilter;
  onDiffFilterChange: (f: DifficultyFilter) => void;
  timeFilter: TimeFilter;
  onTimeFilterChange: (t: TimeFilter) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  subjectFilter: string;
  onSubjectFilterChange: (v: string) => void;
  onMoveSubject?: (subjectId: string, direction: 'up' | 'down') => void;
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-4 pb-1">
      <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-bold text-foreground leading-tight">{title}</h2>
        {subtitle && <p className="text-[10px] text-muted-foreground font-medium">{subtitle}</p>}
      </div>
      <div className="flex-1 h-px bg-border/30 ml-2" />
    </div>
  );
}

import TimeFilterPills from './shared/TimeFilterPills';

export default function Dashboard({
  subjects, dailyLogs, studyGoals, trackingMode, onNavigate, onUpdateLogs, semesterConfig,
  onUpdateSettings, settings, onToggleTopic, onOpenProfile, onOpenTopicDetail, onAddTodo,
  dbSessions, onUpdateSession, onDeleteSession,
  diffFilter, onDiffFilterChange, timeFilter, onTimeFilterChange,
  customFrom, customTo, onCustomFromChange, onCustomToChange,
  subjectFilter, onSubjectFilterChange, onMoveSubject,
}: DashboardProps) {
  const [analyticsOpen, setAnalyticsOpen] = useState(true);
  const { excludedSubjects, toggleExclude, setAll: setExcludedSubjects } = useExcludedSubjects();
  const [calendarLinked, setCalendarLinked] = useLocalStorage('nursetrack-calendar-linked', false);

  // ── Bidirectional sync: home visibility ↔ analytics subject filter ──
  const handleAnalyticsSubjectChange = useCallback((filter: string) => {
    onSubjectFilterChange(filter);
    if (filter === 'all') {
      setExcludedSubjects(new Set());
    } else {
      const included = new Set(filter.split(','));
      setExcludedSubjects(new Set(subjects.filter(s => !included.has(s.id)).map(s => s.id)));
    }
  }, [subjects, onSubjectFilterChange, setExcludedSubjects]);

  // When home visibility toggles → update Analytics subject filter
  const prevExcludedKey = useRef('');
  useEffect(() => {
    const key = [...excludedSubjects].sort().join(',');
    if (key === prevExcludedKey.current) return;
    prevExcludedKey.current = key;
    if (excludedSubjects.size === 0) {
      onSubjectFilterChange('all');
    } else {
      const included = subjects.filter(s => !excludedSubjects.has(s.id)).map(s => s.id);
      if (included.length === 0 || included.length === subjects.length) {
        onSubjectFilterChange('all');
      } else {
        onSubjectFilterChange(included.join(','));
      }
    }
  }, [excludedSubjects, subjects, onSubjectFilterChange]);

  // Compute analytics date range — never returns null
  const analyticsRange = useMemo(() => {
    const now = new Date();
    const todayStr = getLocalDateStr(now);
    if (timeFilter === 'today') return { from: todayStr, to: todayStr };
    if (timeFilter === 'weekly') {
      const d = new Date(now); d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
      return { from: getLocalDateStr(d), to: todayStr };
    }
    if (timeFilter === 'monthly') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: getLocalDateStr(first), to: getLocalDateStr(last) };
    }
    if (timeFilter === 'custom' && customFrom) {
      const to = customTo || customFrom;
      const [f, t] = customFrom <= to ? [customFrom, to] : [to, customFrom];
      return { from: f, to: t };
    }
    // "All Time" — find earliest completedDate across subjects & dailyLogs
    let earliest = todayStr;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate < earliest) earliest = t.completedDate;
    })));
    dailyLogs.forEach(l => {
      if (l.date < earliest && (l.hoursStudied > 0 || l.topicsCompleted > 0)) earliest = l.date;
    });
    return { from: earliest, to: todayStr };
  }, [timeFilter, customFrom, customTo, subjects, dailyLogs]);

  // Earliest data date for TimeFilterPills
  const dataStartDate = useMemo(() => {
    let earliest = getLocalDateStr();
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate < earliest) earliest = t.completedDate;
    })));
    dailyLogs.forEach(l => {
      if (l.date < earliest && (l.hoursStudied > 0 || l.topicsCompleted > 0)) earliest = l.date;
    });
    return earliest;
  }, [subjects, dailyLogs]);

  // Summary stats for analytics strip
  const analyticsSummary = useMemo(() => {
    const range = analyticsRange;
    const filteredSubs = subjectFilter === 'all' ? subjects : subjects.filter(s => subjectFilter.split(',').includes(s.id));

    let topicCount = 0;
    filteredSubs.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate >= range.from && t.completedDate <= range.to) topicCount++;
    })));

    const hours = timeFilter === 'all'
      ? getUnifiedTotalMinutes(filteredSubs, dbSessions, dailyLogs) / 60
      : getEffectiveStudyMinutes(filteredSubs, dailyLogs, range.from, range.to, dbSessions) / 60;
    const totalDays = Math.max(1, Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000) + 1);

    // Count active days from BOTH dailyLogs AND topic completions
    const logActiveDates = new Set<string>();
    dailyLogs.forEach(l => {
      if (l.date >= range.from && l.date <= range.to && (l.hoursStudied > 0 || l.topicsCompleted > 0)) {
        logActiveDates.add(l.date);
      }
    });
    filteredSubs.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate >= range.from && t.completedDate <= range.to) {
        logActiveDates.add(t.completedDate);
      }
    })));
    const activeDays = logActiveDates.size;
    const consistency = Math.round((activeDays / totalDays) * 100);

    return { weekTopics: topicCount, weekHours: hours, consistency };
  }, [subjects, dailyLogs, analyticsRange, subjectFilter]);

  if (subjects.length === 0) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        <DashboardHeader />
        <EmptyState emoji="📚" title="Welcome to RJ TRACKER Pro!" description="Start by adding your first subject in the Syllabus tab." actionLabel="📖 Go to Syllabus" onAction={() => onNavigate('syllabus')} />
      </div>
    );
  }

  const hasActiveFilter = timeFilter !== 'all' || subjectFilter !== 'all';

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      {/* ═══ 1. NEWS TICKER (red bar) — TOP ═══ */}
      <TargetsTicker
        studyGoals={studyGoals}
        subjects={subjects}
        dailyLogs={dailyLogs}
        exams={semesterConfig.exams}
        onUpdateGoals={(goals) => onUpdateSettings?.({ studyGoals: goals })}
        dbSessions={dbSessions}
      />

      {/* ═══ 2. HEADER (greeting + quote merged shelf) ═══ */}
      <DashboardHeader subjects={subjects} dailyLogs={dailyLogs} dbSessions={dbSessions} />

      {/* ═══ 3. PROGRESS CARD (today · yesterday · 1 week · 30 days · custom · complete) ═══ */}
      <ProgressCard subjects={subjects} dailyLogs={dailyLogs} studyGoals={studyGoals} dbSessions={dbSessions} />

      {/* ═══ 3a. TODAY'S GOALS RING ═══ */}
      <TodayProgressRing subjects={subjects} dailyLogs={dailyLogs} studyGoals={studyGoals} dbSessions={dbSessions} />

      {/* ═══ 3b. TODAY'S LOGGED SESSIONS ═══ */}
      {dbSessions && dbSessions.length > 0 && (
        <TodaySessions
          subjects={subjects}
          dbSessions={dbSessions}
          onUpdateSession={onUpdateSession}
          onDeleteSession={onDeleteSession}
        />
      )}

      {/* ═══ 4. STAT CARDS (with integrated subject visibility) ═══ */}
      <StatCardsGrid
        subjects={subjects}
        dailyLogs={dailyLogs}
        semesterConfig={semesterConfig}
        difficultyFilter={diffFilter}
        onNavigate={onNavigate}
        onOpenTopicDetail={onOpenTopicDetail}
        excludedSubjects={excludedSubjects}
        onToggleExclude={toggleExclude}
        onSetAllExcluded={setExcludedSubjects}
        calendarLinked={calendarLinked}
        onCalendarLinkedChange={setCalendarLinked}
        dbSessions={dbSessions}
      />

      {/* ═══ 4b. EXAM SHELF — unified carousel ═══ */}
      <ExamShelf
        exams={semesterConfig.exams}
        subjects={subjects}
        onNavigate={onNavigate}
        onManageExams={onOpenProfile}
      />

      {/* ═══ 5. SUBJECT INTELLIGENCE ═══ */}
      <SubjectIntelligence
        subjects={subjects}
        studyGoals={studyGoals}
        diffFilter={diffFilter}
        onDiffFilterChange={onDiffFilterChange}
        onNavigate={onNavigate}
        onToggleTopic={onToggleTopic}
        onOpenTopicDetail={onOpenTopicDetail}
        onMoveSubject={onMoveSubject}
        dbSessions={dbSessions}
        dailyLogs={dailyLogs}
      />

      {/* ═══ 7. ANALYTICS & TRENDS — Collapsible ═══ */}
      {/* cv-auto enables content-visibility for off-screen perf */}
      <div className="glass-card overflow-hidden">
        <button
          onClick={() => setAnalyticsOpen(p => !p)}
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-card/30 transition-colors active:scale-[0.998]"
        >
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-foreground leading-tight">Analytics & Trends</h2>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
              📊 {timeFilter === 'all' ? 'All Time' : timeFilter === 'today' ? 'Today' : timeFilter === 'weekly' ? 'Weekly' : timeFilter === 'monthly' ? 'Monthly' : 'Custom'}: {analyticsSummary.weekTopics} topics · {formatStudyHours(analyticsSummary.weekHours)} | Consistency: {analyticsSummary.consistency}%
            </p>
          </div>
          <motion.div animate={{ rotate: analyticsOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        </button>

        <AnimatePresence>
          {analyticsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3">
                {/* ── INLINE FILTERS ── */}
                <InlineFilters
                  timeFilter={timeFilter} onTimeFilterChange={onTimeFilterChange}
                  customFrom={customFrom} customTo={customTo}
                  onCustomFromChange={onCustomFromChange} onCustomToChange={onCustomToChange}
                  subjectFilter={subjectFilter} onSubjectFilterChange={handleAnalyticsSubjectChange}
                  subjects={subjects}
                  dataStartDate={dataStartDate}
                />

                {/* Active range indicator */}
                <p className="text-[9px] text-primary font-semibold text-center">
                  📊 {analyticsRange.from === analyticsRange.to ? `Showing: ${analyticsRange.from}` : `${analyticsRange.from} — ${analyticsRange.to}`}
                  {hasActiveFilter && (
                    <button onClick={() => { onTimeFilterChange('all'); onSubjectFilterChange('all'); }}
                      className="ml-2 text-destructive hover:underline">Clear ✕</button>
                  )}
                </p>

                {/* Study Report */}
                <StudyReport
                  subjects={subjects}
                  dailyLogs={dailyLogs}
                  dbSessions={dbSessions}
                  timeFilter={timeFilter}
                  customFrom={customFrom}
                  customTo={customTo}
                  subjectFilter={subjectFilter}
                  externalRange={analyticsRange}
                  onOpenTopicDetail={onOpenTopicDetail}
                  onNavigate={onNavigate}
                />

                {/* Day-by-Day Timeline — above Exam Countdown */}
                <DayByDayTimeline
                  subjects={subjects}
                  dailyLogs={dailyLogs}
                  dbSessions={dbSessions}
                  onOpenTopicDetail={onOpenTopicDetail}
                  externalRange={analyticsRange}
                  externalSubjectFilter={subjectFilter}
                />

                {/* Weekly Recap */}
                <WeeklyRecap subjects={subjects} dailyLogs={dailyLogs} dbSessions={dbSessions} />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <StudyVelocity subjects={subjects} dailyLogs={dailyLogs} dbSessions={dbSessions} />
                  <PerformanceMetrics subjects={subjects} dailyLogs={dailyLogs} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ 8. TODAY'S STUDY PLAN ═══ */}
      <div className="cv-auto">
      <SectionHeader icon={<Zap className="w-4 h-4 text-primary" />} title="Today's Study Plan" subtitle="Focus areas & AI recommendations" />
      <TodaysFocus subjects={subjects} studyGoals={studyGoals} difficultyFilter={diffFilter} onNavigate={onNavigate} />
      <AIStudyPlan subjects={subjects} studyGoals={studyGoals} />
      <WhatToStudyNext subjects={subjects} difficultyFilter={diffFilter} onToggleTopic={onToggleTopic} onOpenTopicDetail={onOpenTopicDetail} onNavigate={onNavigate} onAddTodo={onAddTodo} />
      </div>
    </div>
  );
}

/* ─── Inline Filters (inside Analytics) ─── */
function InlineFilters({
  timeFilter, onTimeFilterChange,
  customFrom, customTo, onCustomFromChange, onCustomToChange,
  subjectFilter, onSubjectFilterChange, subjects,
  dataStartDate,
}: {
  timeFilter: TimeFilter; onTimeFilterChange: (t: TimeFilter) => void;
  customFrom: string; customTo: string;
  onCustomFromChange: (v: string) => void; onCustomToChange: (v: string) => void;
  subjectFilter: string; onSubjectFilterChange: (v: string) => void;
  subjects: Subject[];
  dataStartDate?: string;
}) {
  const selectedIds = useMemo(() => {
    if (subjectFilter === 'all') return new Set(subjects.map(s => s.id));
    return new Set(subjectFilter.split(','));
  }, [subjectFilter, subjects]);

  const isAll = subjectFilter === 'all';

  const toggleSubject = (id: string) => {
    if (isAll) {
      // Deselect this one → select all except this
      const ids = subjects.filter(s => s.id !== id).map(s => s.id);
      onSubjectFilterChange(ids.length === 0 ? 'all' : ids.join(','));
    } else {
      const ids = new Set(selectedIds);
      if (ids.has(id)) {
        ids.delete(id);
        if (ids.size === 0) { onSubjectFilterChange('all'); return; }
      } else {
        ids.add(id);
        if (ids.size === subjects.length) { onSubjectFilterChange('all'); return; }
      }
      onSubjectFilterChange(Array.from(ids).join(','));
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border/15 bg-card/20 p-3">
      {/* Time pills with flip animation */}
      <TimeFilterPills
        timeFilter={timeFilter}
        onTimeFilterChange={onTimeFilterChange}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={onCustomFromChange}
        onCustomToChange={onCustomToChange}
        dataStartDate={dataStartDate}
      />

      {/* Custom date pickers */}
      <AnimatePresence>
        {timeFilter === 'custom' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[9px] text-muted-foreground mb-1 block font-semibold">From</label>
                <Input type="date" value={customFrom} onChange={e => onCustomFromChange(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="flex-1">
                <label className="text-[9px] text-muted-foreground mb-1 block font-semibold">To</label>
                <Input type="date" value={customTo} onChange={e => onCustomToChange(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Multi-Subject Chips */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-bold">📚 Subjects:</span>
          <button onClick={() => onSubjectFilterChange('all')}
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-all ${
              isAll ? 'bg-primary/15 text-primary border border-primary/20' : 'text-muted-foreground hover:text-primary'
            }`}>
            {isAll ? '✓ All' : 'Select All'}
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide flex-nowrap pb-0.5">
          {subjects.map(s => {
            const active = isAll || selectedIds.has(s.id);
            const allTopics = s.units.flatMap(u => u.subTopics);
            const done = allTopics.filter(t => t.completed).length;
            const pct = allTopics.length > 0 ? Math.round((done / allTopics.length) * 100) : 0;
            const hrs = Math.round(allTopics.reduce((a, t) => a + (t.timeSpent || 0), 0) / 60 * 10) / 10;
            return (
              <button key={s.id} onClick={() => toggleSubject(s.id)}
                className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all text-left shrink-0 ${
                  active
                    ? 'bg-card/60 border-border/30 shadow-sm'
                    : 'bg-card/15 border-border/10 opacity-45 hover:opacity-70'
                }`}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <div className="min-w-0">
                  <span className={`text-[10px] font-bold block leading-tight whitespace-nowrap ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{s.shortName}</span>
                  <span className="text-[7px] font-mono text-muted-foreground leading-none whitespace-nowrap">{pct}% · {formatStudyHours(hrs)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

