import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Flame, Clock, Star, GraduationCap, TrendingUp, Zap, ChevronDown, ChevronRight, ExternalLink, Filter, Settings2, Eye, EyeOff, Link } from 'lucide-react';
import { Switch } from '@project/components/ui/switch';
import type { Subject, SubTopic, SemesterConfig, DbStudySession } from '../../types';
import type { DailyLog } from '../../types';
import type { DifficultyFilter } from '../../lib/studySuggestion';
import CircularProgress from '../shared/CircularProgress';
import AnimatedStreakNumber from '../shared/AnimatedStreakNumber';
import { getLocalDateStr, formatStudyTime, formatStudyHours, getEffectiveDayMinutes, getUnifiedTotalMinutes, getMergedAllSessionMinutesBySubject, getMergedOverlappingSessionMinutesBySubject, normalizeSubjectId, readableInk } from '../../lib/utils';
import { useToday } from '../../hooks/useToday';
import { useStreak } from '../../hooks/useStreak';
import { getExamCountdown } from '../../lib/examUtils';
import { useCountUp } from '../../hooks/useCountUp';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const fadeUp = { hidden: { opacity: 0, y: 10, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } } };

interface Props {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  semesterConfig: SemesterConfig;
  difficultyFilter?: DifficultyFilter;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string) => void;
  excludedSubjects?: Set<string>;
  onToggleExclude?: (id: string) => void;
  onSetAllExcluded?: (ids: Set<string>) => void;
  calendarLinked?: boolean;
  onCalendarLinkedChange?: (v: boolean) => void;
  dbSessions?: DbStudySession[];
}

interface SubjectStat {
  id: string;
  name: string;
  shortName: string;
  color: string;
  total: number;
  done: number;
  pct: number;
  impTotal: number;
  impDone: number;
  timeSpent: number;
  topicTimeMins: number;
  sessionTimeMins: number;
  recentDates: string[];
}

function AnimatedNumber({ value, suffix = '', className = '' }: { value: number; suffix?: string; className?: string }) {
  const animated = useCountUp(value, 900, 200);
  return <span className={className}>{animated}{suffix}</span>;
}

const fmtMins = formatStudyTime;

function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function StatCardsGrid({ subjects, dailyLogs, semesterConfig, difficultyFilter = 'all', onNavigate, onOpenTopicDetail, excludedSubjects, onToggleExclude, onSetAllExcluded, calendarLinked, onCalendarLinkedChange, dbSessions }: Props) {
  const today = useToday();
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const streakData = useStreak(subjects, dailyLogs, dbSessions);

  const hasExclusions = excludedSubjects ? excludedSubjects.size > 0 : false;
  const includedCount = excludedSubjects ? subjects.filter(s => !excludedSubjects.has(s.id)).length : subjects.length;

  // Subjects filtered by visibility (for Progress, Time, Important — NOT Streak)
  const visibleSubjects = useMemo(() =>
    excludedSubjects && excludedSubjects.size > 0
      ? subjects.filter(s => !excludedSubjects.has(s.id))
      : subjects,
    [subjects, excludedSubjects]
  );

  const toggleCard = (card: string) => setExpandedCard(prev => prev === card ? null : card);

  const stats = useMemo(() => {
    let total = 0, done = 0, impTotal = 0, impDone = 0, inProcess = 0, topicTimeSpent = 0, unitTimeSpent = 0;
    let todayDone = 0;
    visibleSubjects.forEach(s => s.units.forEach(u => {
      // Include unit-level time
      unitTimeSpent += u.timeSpent || 0;
      u.subTopics.forEach(t => {
        if (difficultyFilter !== 'all' && t.difficulty !== difficultyFilter) return;
        total++;
        topicTimeSpent += t.timeSpent || 0;
        if (t.completed) {
          done++;
          if (t.completedDate === today) todayDone++;
        }
        if (t.important) { impTotal++; if (t.completed) impDone++; }
        if (t.status === 'in_process') inProcess++;
      });
    }));
    // Count unique studied days from dailyLogs + topic completions + dbSessions
    const studiedDatesSet = new Set<string>();
    dailyLogs.forEach(d => { if (d.hoursStudied > 0 || d.topicsCompleted > 0) studiedDatesSet.add(d.date); });
    visibleSubjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate) studiedDatesSet.add(t.completedDate);
    })));
    dbSessions?.forEach(s => { if (s.minutes > 0) studiedDatesSet.add(s.date); });
    const studiedDays = studiedDatesSet.size;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const impPct = impTotal > 0 ? Math.round((impDone / impTotal) * 100) : 0;
    // Unified total = topic+unit time + manually-logged 'Other' sessions
    const unifiedTime = getUnifiedTotalMinutes(visibleSubjects, dbSessions, dailyLogs);
    return { total, done, pct, streak: streakData.current, studiedDays, impTotal, impDone, impPct, inProcess, topicTimeSpent: topicTimeSpent + unitTimeSpent, unifiedTime, todayDone };
  }, [visibleSubjects, dailyLogs, difficultyFilter, today, streakData.current, dbSessions]);

  const allSessionMins = useMemo(() =>
    dbSessions ? getMergedAllSessionMinutesBySubject(dbSessions, dailyLogs) : new Map<string, number>(),
    [dbSessions, dailyLogs]
  );
  const overlappingSessionMins = useMemo(() =>
    dbSessions ? getMergedOverlappingSessionMinutesBySubject(dbSessions, dailyLogs) : new Map<string, number>(),
    [dbSessions, dailyLogs]
  );

  const subjectStats: SubjectStat[] = useMemo(() => {
    const result: SubjectStat[] = visibleSubjects.map(s => {
      let total = 0, done = 0, impTotal = 0, impDone = 0, topicUnitTime = 0;
      const dates: string[] = [];
      s.units.forEach(u => {
        topicUnitTime += u.timeSpent || 0;
        u.subTopics.forEach(t => {
          if (difficultyFilter !== 'all' && t.difficulty !== difficultyFilter) return;
          total++;
          topicUnitTime += t.timeSpent || 0;
          if (t.completed) {
            done++;
            if (t.completedDate) dates.push(t.completedDate);
          }
          if (t.important) { impTotal++; if (t.completed) impDone++; }
        });
      });
      // Unified per-subject time: allSessions + max(0, topicUnitTime - overlapping)
      const sessAll = allSessionMins.get(s.id) || 0;
      const sessOverlap = overlappingSessionMins.get(s.id) || 0;
      const topicTimeMins = sessAll > 0 ? Math.max(0, topicUnitTime - sessOverlap) : topicUnitTime;
      const sessionTimeMins = sessAll;
      const timeSpent = topicTimeMins + sessionTimeMins;
      const uniqueDates = [...new Set(dates)].sort().reverse().slice(0, 7);
      return {
        id: s.id, name: s.name, shortName: s.shortName, color: s.color,
        total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0,
        impTotal, impDone, timeSpent, topicTimeMins, sessionTimeMins, recentDates: uniqueDates,
      };
    }).filter(s => s.total > 0 || s.timeSpent > 0);

    // Add "Other" row for sessions without a valid subjectId — always use normalizeSubjectId
    if (dbSessions) {
      const subjectIds = new Set(visibleSubjects.map(s => s.id));
      const otherMins = dbSessions
        .filter(s => {
          const nid = normalizeSubjectId(s.subjectId);
          return !nid || !subjectIds.has(nid);
        })
        .reduce((a, s) => a + (s.minutes || 0), 0);
      if (otherMins > 0) {
        result.push({
          id: '__other__', name: 'Miscellaneous', shortName: 'Miscellaneous',
          color: '#6B7280', total: 0, done: 0, pct: 0,
          impTotal: 0, impDone: 0, timeSpent: otherMins,
          topicTimeMins: 0, sessionTimeMins: otherMins, recentDates: [],
        });
      }
    }

    return result;
  }, [visibleSubjects, difficultyFilter, allSessionMins, overlappingSessionMins, dbSessions]);

  const nextExam = useMemo(() => {
    const now = new Date();
    const upcoming = semesterConfig.exams
      .map(e => {
        const cd = getExamCountdown(e, now);
        return { ...e, days: cd.days, diff: cd.diff };
      })
      .filter(e => e.diff > 0)
      .sort((a, b) => a.diff - b.diff);
    return upcoming[0] || null;
  }, [semesterConfig.exams, today]);

  // Unified time = topic+unit time + manually-logged 'Other' sessions
  const primaryTimeMins = stats.unifiedTime;
  const topicOnlyMins = stats.topicTimeSpent;
  // Non-overlapping session minutes (sessions that DON'T also count as topic time)
  const nonOverlappingSessionMins = useMemo(() => {
    if (!dbSessions) return 0;
    const overlapping = dbSessions.filter(s => s.type === 'Topic' || s.type === 'Unit').reduce((a, s) => a + (s.minutes || 0), 0);
    const allSession = dbSessions.reduce((a, s) => a + (s.minutes || 0), 0);
    return allSession - overlapping;
  }, [dbSessions]);
  const totalTimeDisplay = formatStudyTime(primaryTimeMins);

  const cardRing = (card: string) => expandedCard === card ? 'ring-1 ring-primary/30 shadow-md' : '';

  return (
    <div className="relative">
      {/* Compact subject filter gear — top-right of stat grid */}
      {onToggleExclude && (
        <button
          onClick={() => setShowSettings(p => !p)}
          className={`absolute -top-0.5 right-0 z-10 p-1.5 rounded-lg transition-all ${
            showSettings ? 'bg-primary/15 text-primary shadow-sm' : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/15'
          }`}
          title="Filter subjects for stat cards"
        >
          <Settings2 className="w-3.5 h-3.5" />
          {hasExclusions && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-primary text-primary-foreground text-[7px] font-black flex items-center justify-center border border-background">
              {includedCount}
            </span>
          )}
        </button>
      )}

    <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:gap-4">
      {/* Progress */}
      <motion.div variants={fadeUp}
        onClick={() => toggleCard('progress')}
        className={`relative rounded-3xl p-4 sm:p-5 min-h-[120px] flex flex-col justify-between group hover:shadow-xl transition-all duration-300 cursor-pointer border border-primary/20 bg-gradient-to-br from-primary/12 via-card/75 to-card/45 shadow-sm backdrop-blur-md overflow-hidden ${cardRing('progress')}`}>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black text-primary/80 uppercase tracking-widest flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-primary" /> Progress
          </p>
          <ChevronDown className={`w-3 h-3 text-muted-foreground/40 transition-transform ${expandedCard === 'progress' ? 'rotate-180' : ''}`} />
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <CircularProgress value={stats.done} max={stats.total} size={52} strokeWidth={4} color="hsl(var(--primary))" />
          <div>
            <p className="text-3xl font-black text-foreground font-mono leading-none"><AnimatedNumber value={stats.pct} suffix="%" /></p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-semibold">{stats.done}/{stats.total}</p>
          </div>
        </div>
        {stats.todayDone > 0 && (
          <div className="flex items-center gap-1 mt-2">
            <Zap className="w-3 h-3 text-accent" />
            <span className="text-[9px] font-bold text-accent">+{stats.todayDone} today</span>
          </div>
        )}
      </motion.div>

      {/* Streak */}
      <motion.div variants={fadeUp}
        onClick={() => toggleCard('streak')}
        className={`relative rounded-3xl p-4 sm:p-5 min-h-[120px] flex flex-col justify-between group hover:shadow-xl transition-all duration-300 cursor-pointer border border-chart-4/20 bg-gradient-to-br from-chart-4/12 via-card/75 to-card/45 shadow-sm backdrop-blur-md overflow-hidden ${cardRing('streak')}`}>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black text-chart-4/90 uppercase tracking-widest flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-chart-4" /> Streak
          </p>
          <ChevronDown className={`w-3 h-3 text-muted-foreground/40 transition-transform ${expandedCard === 'streak' ? 'rotate-180' : ''}`} />
        </div>
        <div className="mt-1.5">
          <div className="flex items-center gap-1.5">
            <AnimatedStreakNumber value={stats.streak} size="lg" showFire milestone={streakData.milestone} />
            <span className="text-sm font-bold text-muted-foreground ml-1">days</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 font-semibold">{stats.studiedDays}d studied total</p>
          {streakData.milestone && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.4 }}
              className="inline-block mt-1 text-[8px] px-1.5 py-0.5 rounded-full bg-chart-4/15 text-chart-4 border border-chart-4/20 font-bold"
            >
              {streakData.milestone.badge}
            </motion.span>
          )}
        </div>
        {stats.streak >= 7 && (
          <div className="mt-1.5">
            <div className="flex gap-1">
              {[7, 14, 30, 60, 100].map(m => (
                <div key={m} className={`w-5 h-1.5 rounded-full transition-all ${stats.streak >= m ? 'bg-chart-4' : 'bg-muted/30'}`} />
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Time */}
      <motion.div variants={fadeUp}
        onClick={() => toggleCard('time')}
        className={`relative rounded-3xl p-4 sm:p-5 min-h-[120px] flex flex-col justify-between group hover:shadow-xl transition-all duration-300 cursor-pointer border border-secondary/20 bg-gradient-to-br from-secondary/12 via-card/75 to-card/45 shadow-sm backdrop-blur-md overflow-hidden ${cardRing('time')}`}>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black text-secondary/90 uppercase tracking-widest flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-secondary" /> Study Time
          </p>
          <ChevronDown className={`w-3 h-3 text-muted-foreground/40 transition-transform ${expandedCard === 'time' ? 'rotate-180' : ''}`} />
        </div>
        <div className="mt-1.5">
          <p className="text-3xl font-black text-foreground font-mono leading-none">{totalTimeDisplay}</p>
          <p className="text-[11px] text-muted-foreground mt-1 font-semibold">
            {topicOnlyMins > 0
              ? `⏱️ ${formatStudyTime(topicOnlyMins)} from topics`
              : nonOverlappingSessionMins > 0
                ? `⏱️ ${formatStudyTime(nonOverlappingSessionMins)} from sessions`
                : 'No time recorded'}
          </p>
        </div>
        {nonOverlappingSessionMins > 0 && topicOnlyMins > 0 && (
          <p className="text-[9px] text-primary/70 font-bold mt-1 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {formatStudyTime(nonOverlappingSessionMins)} from sessions
          </p>
        )}
        {stats.studiedDays > 0 && (
          <p className="text-[9px] text-secondary font-bold mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            ~{formatStudyTime(Math.round(primaryTimeMins / Math.max(1, stats.studiedDays)))}/day avg
          </p>
        )}
      </motion.div>

      {/* Important */}
      <motion.div variants={fadeUp}
        onClick={() => toggleCard('important')}
        className={`relative rounded-3xl p-4 sm:p-5 min-h-[120px] flex flex-col justify-between group hover:shadow-xl transition-all duration-300 cursor-pointer border border-accent/20 bg-gradient-to-br from-accent/12 via-card/75 to-card/45 shadow-sm backdrop-blur-md overflow-hidden ${cardRing('important')}`}>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-accent" /> Important
          </p>
          <ChevronDown className={`w-3 h-3 text-muted-foreground/40 transition-transform ${expandedCard === 'important' ? 'rotate-180' : ''}`} />
        </div>
        <div className="mt-1.5">
          <p className="text-3xl font-black text-foreground font-mono leading-none">
            ⭐ <AnimatedNumber value={stats.impDone} /><span className="text-lg text-muted-foreground">/{stats.impTotal}</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 font-semibold">
            <AnimatedNumber value={stats.impPct} suffix="%" /> done{stats.inProcess > 0 ? ` · ${stats.inProcess} WIP` : ''}
          </p>
        </div>
        {stats.impTotal > 0 && (
          <div className="w-full h-1.5 rounded-full bg-muted/30 mt-2 overflow-hidden">
            <motion.div className="h-full rounded-full bg-accent"
              initial={{ width: 0 }} animate={{ width: `${stats.impPct}%` }}
              transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        )}
      </motion.div>

      {/* Subject Visibility Panel — compact inline filter */}
      <AnimatePresence>
        {showSettings && onToggleExclude && (
          <motion.div
            key="subject-visibility"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="col-span-2 overflow-hidden"
          >
            <div className="glass-card p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Settings2 className="w-3 h-3 text-primary/60" />
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Subject Filter</span>
                  <span className="text-[7px] text-muted-foreground/40 font-semibold">Progress · Time · Important</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onSetAllExcluded?.(new Set())}
                    className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-secondary/10 text-secondary border border-secondary/20 hover:bg-secondary/20 transition-colors flex items-center gap-0.5">
                    <Eye className="w-2.5 h-2.5" /> All
                  </button>
                  <button onClick={() => onSetAllExcluded?.(new Set(subjects.map(s => s.id)))}
                    className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-muted/20 text-muted-foreground border border-border/20 hover:bg-muted/30 transition-colors flex items-center gap-0.5">
                    <EyeOff className="w-2.5 h-2.5" /> None
                  </button>
                </div>
              </div>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide flex-nowrap pb-0.5">
                {subjects.map(s => {
                  const isExcluded = excludedSubjects?.has(s.id) ?? false;
                  const allTopics = s.units.flatMap(u => u.subTopics);
                  const done = allTopics.filter(t => t.completed).length;
                  const pct = allTopics.length > 0 ? Math.round((done / allTopics.length) * 100) : 0;
                  return (
                    <button key={s.id} onClick={() => onToggleExclude(s.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all shrink-0 active:scale-95 ${
                        isExcluded
                          ? 'bg-muted/10 border-border/10 opacity-40'
                          : 'bg-card/50 border-border/25 shadow-sm'
                      }`}>
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 transition-all ${isExcluded ? 'opacity-30 scale-75' : ''}`}
                        style={{ backgroundColor: s.color, boxShadow: isExcluded ? 'none' : `0 0 6px ${s.color}40` }} />
                      <span className={`text-[10px] font-bold whitespace-nowrap transition-colors ${
                        isExcluded ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}>{s.shortName}</span>
                      <span className="text-[7px] font-mono text-muted-foreground whitespace-nowrap">{pct}%</span>
                    </button>
                  );
                })}
              </div>
              {/* Calendar Link Toggle */}
              {onCalendarLinkedChange && (
                <div className="flex items-center justify-between px-1 py-1.5 rounded-lg bg-card/30 border border-border/10">
                  <div className="flex items-center gap-1.5">
                    <Link className="w-3 h-3 text-primary/50" />
                    <span className="text-[9px] font-bold text-muted-foreground">🔗 Link to Calendar</span>
                  </div>
                  <Switch checked={calendarLinked ?? false} onCheckedChange={onCalendarLinkedChange} className="scale-75 origin-right" />
                </div>
              )}
              {hasExclusions && (
                <p className="text-[8px] text-primary/60 font-semibold text-center">
                  ⚡ Showing {includedCount}/{subjects.length} subjects · Streak not affected
                  {calendarLinked && ' · Calendar linked'}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subject Breakdown Panel */}
      <AnimatePresence>
        {expandedCard && (
          <motion.div
            key="breakdown"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="col-span-2 overflow-hidden"
          >
            {expandedCard === 'important' ? (
              <ImportantTopicsPanel subjects={subjects} difficultyFilter={difficultyFilter} onNavigate={onNavigate} onOpenTopicDetail={onOpenTopicDetail} />
            ) : (
              <SubjectBreakdown type={expandedCard} subjectStats={subjectStats} onNavigate={onNavigate} />
            )}
          </motion.div>
        )}
      </AnimatePresence>


    </motion.div>
    </div>
  );
}

/* ─── Subject Breakdown ─── */
function SubjectBreakdown({ type, subjectStats, onNavigate }: { type: string; subjectStats: SubjectStat[]; onNavigate?: (tab: string, filter?: Record<string, string>) => void }) {
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  const title = type === 'progress' ? '📊 Subject Progress' : type === 'time' ? '⏱️ Subject Time' : type === 'important' ? '⭐ Important by Subject' : '🔥 Study Activity';
  const maxVal = type === 'time'
    ? Math.max(1, ...subjectStats.map(s => s.timeSpent))
    : type === 'important'
      ? Math.max(1, ...subjectStats.map(s => s.impTotal))
      : 100;

  return (
    <div className="glass-card p-3 space-y-1">
      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
      {subjectStats.map(s => {
        const isOpen = expandedSubject === s.id;
        const barPct = type === 'progress' ? s.pct
          : type === 'time' ? Math.round((s.timeSpent / maxVal) * 100)
          : type === 'important' ? (s.impTotal > 0 ? Math.round((s.impDone / s.impTotal) * 100) : 0)
          : Math.min(100, s.recentDates.length * 15);

        return (
          <div key={s.id}>
            <button
              onClick={() => setExpandedSubject(isOpen ? null : s.id)}
              className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-card/40 transition-colors"
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className={`text-[11px] font-semibold text-foreground flex-1 text-left truncate ${s.id !== '__other__' ? 'hover:text-primary hover:underline cursor-pointer' : ''} transition-all duration-200 group/link flex items-center gap-1`} onClick={(e) => { e.stopPropagation(); if (s.id !== '__other__') onNavigate?.('syllabus', { subjectId: s.id }); }} title={s.id !== '__other__' ? 'Open in Syllabus' : undefined}>
                {s.id === '__other__' ? '📝 ' : ''}{s.id === '__other__' ? 'Miscellaneous' : s.shortName}
                {s.id !== '__other__' && <ExternalLink className="w-3 h-3 opacity-0 group-hover/link:opacity-70 transition-opacity text-primary shrink-0" />}
              </span>

              {/* Mini progress bar */}
              <div className="w-14 h-1.5 rounded-full bg-muted/30 overflow-hidden shrink-0">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barPct}%`, backgroundColor: s.color }} />
              </div>

              {/* Value */}
              {type === 'progress' && (
                <span className="text-[10px] font-mono text-muted-foreground w-16 text-right shrink-0">
                  {s.done}/{s.total} <span className="font-bold text-primary">{s.pct}%</span>
                </span>
              )}
              {type === 'time' && (
                <span className="text-[10px] font-mono font-bold w-14 text-right shrink-0" style={{ color: readableInk(s.color) }}>
                  {fmtMins(s.timeSpent)}
                </span>
              )}
              {type === 'important' && (
                <span className="text-[10px] font-mono text-muted-foreground w-12 text-right shrink-0">
                  ⭐ {s.impDone}/{s.impTotal}
                </span>
              )}
              {type === 'streak' && (
                <span className="text-[10px] font-mono w-14 text-right shrink-0" style={{ color: readableInk(s.color) }}>
                  {s.recentDates.length}d active
                </span>
              )}

              <ChevronRight className={`w-3 h-3 text-muted-foreground/40 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>

            <AnimatePresence>
              {isOpen && type === 'time' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="ml-5 pl-2.5 border-l-2 py-2 space-y-1.5" style={{ borderColor: s.color + '40' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">📚 Topic Time</span>
                      <span className="text-[10px] font-mono font-bold text-foreground">{fmtMins(s.topicTimeMins)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">⏱️ Session Time</span>
                      <span className="text-[10px] font-mono font-bold text-foreground">{fmtMins(s.sessionTimeMins)}</span>
                    </div>
                    <div className="border-t border-border/20 pt-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-foreground">Total</span>
                      <span className="text-[10px] font-mono font-black" style={{ color: readableInk(s.color) }}>{fmtMins(s.timeSpent)}</span>
                    </div>
                  </div>
                </motion.div>
              )}
              {isOpen && type !== 'time' && s.recentDates.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="ml-5 pl-2.5 border-l-2 py-1.5 space-y-0.5" style={{ borderColor: s.color + '40' }}>
                    <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Recent completions</p>
                    {s.recentDates.map(d => (
                      <p key={d} className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        {fmtDateShort(d)}
                      </p>
                    ))}
                    {s.recentDates.length === 7 && (
                      <p className="text-[8px] text-muted-foreground/50 italic mt-0.5">showing last 7 days</p>
                    )}
                  </div>
                </motion.div>
              )}
              {isOpen && type !== 'time' && s.recentDates.length === 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <p className="ml-5 pl-2.5 py-2 text-[9px] text-muted-foreground/50 italic">No completions yet</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Rich Important Topics Panel ─── */
interface ImportantTopic {
  topic: SubTopic;
  subjectId: string;
  unitId: string;
  subjectName: string;
  subjectShortName: string;
  subjectColor: string;
}

function ImportantTopicsPanel({ subjects, difficultyFilter, onNavigate, onOpenTopicDetail }: {
  subjects: Subject[];
  difficultyFilter: DifficultyFilter;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const result: { subjectId: string; name: string; shortName: string; color: string; topics: ImportantTopic[]; doneCount: number }[] = [];
    subjects.forEach(s => {
      const topics: ImportantTopic[] = [];
      s.units.forEach(u => u.subTopics.forEach(t => {
        if (!t.important) return;
        if (difficultyFilter !== 'all' && t.difficulty !== difficultyFilter) return;
        topics.push({ topic: t, subjectId: s.id, unitId: u.id, subjectName: s.name, subjectShortName: s.shortName, subjectColor: s.color });
      }));
      if (topics.length > 0) {
        const doneCount = topics.filter(t => t.topic.completed).length;
        result.push({ subjectId: s.id, name: s.name, shortName: s.shortName, color: s.color, topics, doneCount });
      }
    });
    return result;
  }, [subjects, difficultyFilter]);

  const totalImp = grouped.reduce((a, g) => a + g.topics.length, 0);
  const totalDone = grouped.reduce((a, g) => a + g.doneCount, 0);
  const filters: { id: 'all' | 'pending' | 'done'; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: totalImp },
    { id: 'pending', label: 'Pending', count: totalImp - totalDone },
    { id: 'done', label: 'Done', count: totalDone },
  ];

  // Auto-expand first subject
  const effectiveExpanded = expandedSubject ?? (grouped.length > 0 ? grouped[0].subjectId : null);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-accent/20" style={{ background: 'linear-gradient(135deg, hsl(var(--card) / 0.95) 0%, hsl(var(--accent) / 0.06) 50%, hsl(var(--card) / 0.9) 100%)' }}>
      {/* Glow effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-accent/10 to-transparent rounded-bl-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-primary/5 to-transparent rounded-tr-full pointer-events-none" />

      <div className="relative p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center">
              <Star className="w-3.5 h-3.5 text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-black text-foreground tracking-tight">Important Topics</h3>
              <p className="text-[9px] text-muted-foreground font-semibold">{totalDone}/{totalImp} completed · {Math.round((totalDone / Math.max(1, totalImp)) * 100)}%</p>
            </div>
          </div>
        </div>

        {/* Global progress bar */}
        <div className="w-full h-2 rounded-full bg-muted/20 overflow-hidden">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-accent to-primary"
            initial={{ width: 0 }} animate={{ width: `${Math.round((totalDone / Math.max(1, totalImp)) * 100)}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5">
          {filters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${
                filter === f.id
                  ? 'bg-accent/20 border-accent/40 text-accent shadow-sm'
                  : 'bg-card/50 border-border/20 text-muted-foreground hover:text-foreground'
              }`}>
              {f.label} <span className="font-mono text-[9px] opacity-70">{f.count}</span>
            </button>
          ))}
        </div>

        {/* Subject groups */}
        <div className="space-y-1.5">
          {grouped.map(g => {
            const isOpen = effectiveExpanded === g.subjectId;
            const filteredTopics = g.topics.filter(t => {
              if (filter === 'pending') return !t.topic.completed;
              if (filter === 'done') return t.topic.completed;
              return true;
            });
            const subPct = Math.round((g.doneCount / g.topics.length) * 100);

            return (
              <div key={g.subjectId} className="rounded-xl border border-border/15 bg-card/40 overflow-hidden backdrop-blur-sm">
                {/* Subject header */}
                <button onClick={() => setExpandedSubject(isOpen ? null : g.subjectId)}
                  className="w-full flex items-center gap-2.5 p-3 hover:bg-card/60 transition-colors">
                  <div className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: g.color, boxShadow: `0 0 8px ${g.color}40` }} />
                  <span className="text-[11px] font-bold text-foreground flex-1 text-left truncate">{g.shortName}</span>
                  {/* Mini progress */}
                  <div className="w-16 h-1.5 rounded-full bg-muted/25 overflow-hidden shrink-0">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${subPct}%`, backgroundColor: g.color }} />
                  </div>
                  <span className="text-[9px] font-mono font-bold text-muted-foreground shrink-0">
                    {g.doneCount}/{g.topics.length}
                  </span>
                  <ChevronDown className={`w-3 h-3 text-muted-foreground/50 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Topics list */}
                <AnimatePresence>
                  {isOpen && filteredTopics.length > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="px-2 pb-2 space-y-1">
                        {filteredTopics.map(({ topic, subjectId, unitId }) => {
                          const status = topic.status || (topic.completed ? 'complete' : 'incomplete');
                          const statusEmoji = status === 'complete' ? '✅' : status === 'in_process' ? '🔄' : '📋';
                          const statusColor = status === 'complete' ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/25' : status === 'in_process' ? 'bg-amber-500/15 text-amber-600 border-amber-500/25' : 'bg-muted/30 text-muted-foreground border-border/20';
                          const diffEmoji = topic.difficulty === 'Easy' ? '🟢' : topic.difficulty === 'Medium' ? '🟡' : '🔴';

                          return (
                            <motion.button
                              key={topic.id}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              onClick={() => onOpenTopicDetail?.(topic, subjectId, unitId)}
                              className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-card/30 border border-border/10 hover:bg-card/60 hover:border-primary/20 transition-all group active:scale-[0.98] text-left"
                            >
                              {/* Status badge */}
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-bold shrink-0 ${statusColor}`}>{statusEmoji}</span>

                              {/* Topic info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">{topic.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[9px]">{diffEmoji}</span>
                                  {topic.timeSpent > 0 && (
                                    <span className="text-[8px] font-mono text-muted-foreground">⏱ {fmtMins(topic.timeSpent)}</span>
                                  )}
                                  {topic.completedDate && status === 'complete' && (
                                    <span className="text-[8px] font-mono text-emerald-500">✓ {fmtDateShort(topic.completedDate)}</span>
                                  )}
                                </div>
                              </div>

                              {/* Tags */}
                              {topic.tags && topic.tags.length > 0 && (
                                <div className="flex gap-0.5 shrink-0">
                                  {topic.tags.slice(0, 2).map((tag, i) => (
                                    <span key={i} className="text-[7px] px-1.5 py-0.5 rounded-full bg-primary/8 text-primary/70 border border-primary/15 font-bold">{tag}</span>
                                  ))}
                                  {topic.tags.length > 2 && <span className="text-[7px] text-muted-foreground/50">+{topic.tags.length - 2}</span>}
                                </div>
                              )}

                              <ChevronRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary/50 shrink-0 transition-colors" />
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                  {isOpen && filteredTopics.length === 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <p className="px-4 pb-3 text-[10px] text-muted-foreground/50 italic">No {filter === 'pending' ? 'pending' : filter === 'done' ? 'completed' : ''} important topics</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {grouped.length === 0 && (
            <p className="text-center text-[11px] text-muted-foreground/50 py-4 italic">No important topics marked yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
