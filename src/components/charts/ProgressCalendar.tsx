import { useMemo, useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Flame, Trophy, Timer, CheckCheck, CalendarCheck, X, CalendarRange, CalendarDays, Clock, Settings2, Eye, EyeOff, Link2, Unlink2 } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import GlowCard from '../shared/GlowCard';
import AnimatedStreakNumber from '../shared/AnimatedStreakNumber';
import ExamPosterCard, { computeExamPosterData } from '../shared/ExamPosterCard';
import CalendarAnalysis from './CalendarAnalysis';
import DayByDayTimeline from '../dashboard/DayByDayTimeline';
import DayDetailPanel from './DayDetailPanel';
import type { CalendarTopicInfo } from './DayDetailPanel';
import type { Subject, SubTopic, DailyLog, DbStudySession, ExamConfig } from '../../types';
import { formatDate, formatStudyTime, getEffectiveDayMinutes, getLocalDateStr, readableInk } from '../../lib/utils';
import { useStreak } from '../../hooks/useStreak';
import { useExcludedSubjects } from '../../hooks/useExcludedSubjects';
import type { TodoItem } from '../../hooks/useTodos';

interface Props {
  subjects: Subject[];
  dailyLogs?: DailyLog[];
  onUpdateMood?: (date: string, mood: DailyLog['mood'] | undefined, notes: string) => void;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string) => void;
  externalRange?: { from: string; to: string } | null;
  onUpdateLogs?: (logs: DailyLog[]) => void;
  onNavigateToCalendar?: (date: string) => void;
  externalSubjectFilter?: string;
  todos?: TodoItem[];
  addTodo?: (todo: Omit<TodoItem, 'id' | 'createdAt' | 'completed'>) => void;
  toggleTodo?: (id: string) => void;
  deleteTodo?: (id: string) => void;
  updateTodo?: (id: string, changes: Partial<TodoItem>) => void;
  getTodosForDate?: (date: string) => TodoItem[];
  getPendingCountForDate?: (date: string) => number;
  onCreateSession?: (session: { date: string; minutes: number; description: string; type: 'Topic' | 'Unit' | 'Other'; subjectId?: string; subjectName?: string; startTime?: string; endTime?: string; note?: string }) => void;
  onUpdateSession?: (sessionId: string, changes: Record<string, any>) => void;
  onDeleteSession?: (sessionId: string) => void;
  onUpdateSubjects?: (subjects: Subject[]) => void;
  dbSessions?: DbStudySession[];
  exams?: ExamConfig[];
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
}

export default function ProgressCalendar({ subjects, dailyLogs, onUpdateMood, onOpenTopicDetail, externalRange, onUpdateLogs, onNavigateToCalendar, externalSubjectFilter, todos, addTodo, toggleTodo, deleteTodo, updateTodo, getTodosForDate: getTodosForDateProp, getPendingCountForDate: getPendingCountForDateProp, onCreateSession, onUpdateSession, onDeleteSession, onUpdateSubjects, dbSessions, exams, onNavigate }: Props) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [calendarSync, setCalendarSync] = useState(() => {
    try { return localStorage.getItem('nursetrack-calendar-sync') === 'true'; } catch { return false; }
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { excludedSubjects, toggleExclude, setAll: setExcludedSubjects } = useExcludedSubjects();
  const [showSubjectSettings, setShowSubjectSettings] = useState(false);

  const externalFilteredIds = useMemo(() => {
    if (!calendarSync || !externalSubjectFilter || externalSubjectFilter === 'all') return null;
    return new Set(externalSubjectFilter.split(','));
  }, [calendarSync, externalSubjectFilter]);

  const filteredSubjects = useMemo(() => {
    let result = subjects.filter(s => !excludedSubjects.has(s.id));
    if (externalFilteredIds) result = result.filter(s => externalFilteredIds.has(s.id));
    return result;
  }, [subjects, excludedSubjects, externalFilteredIds]);

  const includedCount = filteredSubjects.length;
  const totalSubjectCount = subjects.length;
  const hasExclusions = excludedSubjects.size > 0 || (externalFilteredIds !== null && externalFilteredIds.size < subjects.length);

  const getTodosForDate = getTodosForDateProp || (() => [] as TodoItem[]);
  const getPendingCountForDate = getPendingCountForDateProp || (() => 0);

  // Range selection
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const hasRange = !!(rangeFrom && rangeTo && rangeFrom <= rangeTo);
  const [rangeApplied, setRangeApplied] = useState(false);
  const [userOverride, setUserOverride] = useState(false);

  useEffect(() => {
    if (!calendarSync) return;
    if (userOverride) return;
    if (externalRange) {
      setRangeFrom(externalRange.from); setRangeTo(externalRange.to); setRangeApplied(true);
      const targetDate = new Date(externalRange.from + 'T12:00:00');
      const nowD = new Date();
      setMonthOffset((targetDate.getFullYear() - nowD.getFullYear()) * 12 + (targetDate.getMonth() - nowD.getMonth()));
    } else if (rangeApplied && !userOverride) {
      setRangeFrom(''); setRangeTo(''); setRangeApplied(false);
    }
  }, [calendarSync, externalRange]);

  const rangeDays = useMemo(() => {
    if (!hasRange) return 0;
    return Math.round((new Date(rangeTo).getTime() - new Date(rangeFrom).getTime()) / 86400000) + 1;
  }, [rangeFrom, rangeTo, hasRange]);

  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const logMap = useMemo(() => {
    const m: Record<string, DailyLog> = {};
    dailyLogs?.forEach(l => { m[l.date] = l; });
    return m;
  }, [dailyLogs]);

  const dateMap = useMemo(() => {
    const map: Record<string, { done: number; subjects: Set<string>; topics: CalendarTopicInfo[] }> = {};
    const addEntry = (dateStr: string, s: Subject, u: Subject['units'][0], t: SubTopic, isCompletion: boolean) => {
      if (!map[dateStr]) map[dateStr] = { done: 0, subjects: new Set(), topics: [] };
      if (isCompletion) map[dateStr].done++;
      map[dateStr].subjects.add(s.shortName);
      const entryMins = t.timeEntries?.filter(e => e.date === dateStr).reduce((a, e) => a + e.minutes, 0) || 0;
      const displayTime = entryMins > 0 ? entryMins : (isCompletion ? (t.timeSpent || 0) : 0);
      map[dateStr].topics.push({
        subjectName: s.shortName, subjectColor: s.color, unitName: u.name, topicName: t.name,
        difficulty: t.difficulty, time: isCompletion ? t.completedTime : undefined, timeSpent: displayTime,
        topicId: t.id, subjectId: s.id, unitId: u.id,
      });
    };
    filteredSubjects.forEach(s => {
      s.units.forEach(u => {
        u.subTopics.forEach(t => {
          const addedDates = new Set<string>();
          if (t.completed && t.completedDate) { addEntry(t.completedDate, s, u, t, true); addedDates.add(t.completedDate); }
          if (t.timeEntries) {
            t.timeEntries.forEach(entry => {
              if (entry.minutes > 0 && !addedDates.has(entry.date)) { addEntry(entry.date, s, u, t, false); addedDates.add(entry.date); }
            });
          }
        });
        if (u.timeEntries) {
          u.timeEntries.forEach(entry => {
            if (entry.minutes > 0) {
              const dateStr = entry.date;
              if (!map[dateStr]) map[dateStr] = { done: 0, subjects: new Set(), topics: [] };
              map[dateStr].subjects.add(s.shortName);
              map[dateStr].topics.push({
                subjectName: s.shortName, subjectColor: s.color, unitName: u.name, topicName: `📁 ${u.name} (Unit)`,
                difficulty: 'Medium', timeSpent: entry.minutes, subjectId: s.id, unitId: u.id, topicId: `unit-${u.id}`,
              });
            }
          });
        }
      });
    });
    return map;
  }, [filteredSubjects]);

  const [completeWeek, setCompleteWeek] = useState(() => {
    try { return localStorage.getItem('nursetrack-complete-week') !== 'false'; } catch { return true; }
  });

  interface CalendarDay {
    day: number;
    month: number; // 0-indexed
    year: number;
    dateStr: string;
    isCurrentMonth: boolean;
  }

  const calendarDays = useMemo((): CalendarDay[] => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay = new Date(year, month, 1).getDay();
    const mondayStartDay = (startDay + 6) % 7; // Mon=0, Sun=6

    const result: CalendarDay[] = [];

    if (completeWeek) {
      // Fill previous month days
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
      for (let i = mondayStartDay - 1; i >= 0; i--) {
        const d = daysInPrevMonth - i;
        result.push({ day: d, month: prevMonth, year: prevYear, dateStr: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, isCurrentMonth: false });
      }
    } else {
      for (let i = 0; i < mondayStartDay; i++) {
        result.push({ day: 0, month, year, dateStr: '', isCurrentMonth: false });
      }
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      result.push({ day: i, month, year, dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`, isCurrentMonth: true });
    }

    // Fill next month days to complete last week
    if (completeWeek) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      let nextDay = 1;
      while (result.length % 7 !== 0) {
        result.push({ day: nextDay, month: nextMonth, year: nextYear, dateStr: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`, isCurrentMonth: false });
        nextDay++;
      }
    } else {
      while (result.length % 7 !== 0) {
        result.push({ day: 0, month, year, dateStr: '', isCurrentMonth: false });
      }
    }

    return result;
  }, [year, month, completeWeek]);

  const weeks = useMemo(() => {
    const w: CalendarDay[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) w.push(calendarDays.slice(i, i + 7));
    return w;
  }, [calendarDays]);

  // One pass: effective minutes for every visible day (cells, week rows and insights all reuse it)
  const dayMins = useMemo(() => {
    const m: Record<string, number> = {};
    calendarDays.forEach(cd => {
      if (cd.dateStr) m[cd.dateStr] = getEffectiveDayMinutes(filteredSubjects, dailyLogs || [], cd.dateStr, dbSessions);
    });
    return m;
  }, [calendarDays, filteredSubjects, dailyLogs, dbSessions]);

  const weekStats = useMemo(() => {
    return weeks.map(week => {
      let topics = 0, mins = 0;
      week.forEach(cd => {
        if (!cd.dateStr) return;
        // When completeWeek is off, only count current month
        if (!completeWeek && !cd.isCurrentMonth) return;
        topics += dateMap[cd.dateStr]?.done || 0;
        mins += dayMins[cd.dateStr] || 0;
      });
      return { topics, mins };
    });
  }, [weeks, dateMap, dayMins, completeWeek]);

  const today = getLocalDateStr();
  const streakData = useStreak(subjects, dailyLogs || [], dbSessions);

  // Live clock for exam poster countdown
  const [nowMs, setNowMs] = useState(Date.now());

  // Build exam date map for highlighting
  const examDateMap = useMemo(() => {
    const map: Record<string, ExamConfig[]> = {};
    (exams || []).forEach(exam => {
      if (!exam.date) return;
      if (!map[exam.date]) map[exam.date] = [];
      map[exam.date].push(exam);
    });
    return map;
  }, [exams]);

  // Only tick (and re-render the calendar) while an exam poster is actually on screen
  const posterVisible = !!(selectedDate && examDateMap[selectedDate]);
  useEffect(() => {
    if (!posterVisible) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [posterVisible]);

  const monthStats = useMemo(() => {
    let totalDone = 0, totalMins = 0;
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const activeDatesSet = new Set<string>();
    Object.entries(dateMap).forEach(([date, data]) => {
      if (date.startsWith(monthPrefix)) {
        if (rangeApplied && hasRange && (date < rangeFrom || date > rangeTo)) return;
        totalDone += data.done;
        activeDatesSet.add(date);
      }
    });
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (rangeApplied && hasRange && (ds < rangeFrom || ds > rangeTo)) continue;
      const dayMins = getEffectiveDayMinutes(filteredSubjects, dailyLogs || [], ds, dbSessions);
      if (dayMins > 0) { totalMins += dayMins; activeDatesSet.add(ds); }
    }
    const last7Dates: string[] = [];
    for (let i = 0; i < 7; i++) { const d = new Date(Date.now() - i * 86400000); last7Dates.push(getLocalDateStr(d)); }
    const weeklyActive = last7Dates.filter(d => dateMap[d] || getEffectiveDayMinutes(filteredSubjects, dailyLogs || [], d, dbSessions) > 0).length;
    return { totalDone, activeDays: activeDatesSet.size, weeklyConsistency: Math.round((weeklyActive / 7) * 100), totalMins };
  }, [dateMap, year, month, rangeFrom, rangeTo, hasRange, rangeApplied, dailyLogs, filteredSubjects, dbSessions]);

  const rangeSummary = useMemo(() => {
    if (!rangeApplied || !hasRange) return null;
    let topicsDone = 0, totalMins = 0;
    const activeDatesSet = new Set<string>();
    Object.entries(dateMap).forEach(([date, data]) => {
      if (date >= rangeFrom && date <= rangeTo) { topicsDone += data.done; activeDatesSet.add(date); }
    });
    const fromD = new Date(rangeFrom + 'T12:00:00');
    const toD = new Date(rangeTo + 'T12:00:00');
    for (let d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
      const ds = getLocalDateStr(d);
      const dayMins = getEffectiveDayMinutes(filteredSubjects, dailyLogs || [], ds, dbSessions);
      if (dayMins > 0) { totalMins += dayMins; activeDatesSet.add(ds); }
    }
    return { topicsDone, totalMins, activeDays: activeDatesSet.size };
  }, [dateMap, dailyLogs, rangeFrom, rangeTo, hasRange, rangeApplied, filteredSubjects, dbSessions]);

  const getIntensity = (mins: number) => {
    if (mins <= 0) return 0;
    if (mins < 30) return 1;
    if (mins < 60) return 2;
    if (mins < 120) return 3;
    return 4;
  };

  const intensityColors = ['bg-muted/10', 'bg-primary/15', 'bg-primary/30', 'bg-primary/50', 'bg-primary/70'];
  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const handleDateClick = (cd: CalendarDay) => {
    if (!cd.dateStr) return;
    const dateStr = cd.dateStr;
    if (rangeMode) {
      if (!rangeFrom || (rangeFrom && rangeTo)) { setRangeFrom(dateStr); setRangeTo(''); }
      else { if (dateStr < rangeFrom) { setRangeTo(rangeFrom); setRangeFrom(dateStr); } else setRangeTo(dateStr); }
      setUserOverride(true);
      return;
    }
    // Navigate to adjacent month if tapped
    if (!cd.isCurrentMonth && completeWeek) {
      const targetDate = new Date(cd.year, cd.month, 1);
      const nowD = new Date();
      setMonthOffset((targetDate.getFullYear() - nowD.getFullYear()) * 12 + (targetDate.getMonth() - nowD.getMonth()));
      setSelectedDate(dateStr);
      return;
    }
    if (selectedDate === dateStr) setSelectedDate(null);
    else setSelectedDate(dateStr);
  };

  const dirRef = useRef(0);
  const goMonth = (delta: number) => { dirRef.current = delta; setMonthOffset(p => p + delta); navigator.vibrate?.(6); };
  const jumpToToday = () => { dirRef.current = monthOffset > 0 ? -1 : 1; setMonthOffset(0); };
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const st = touchRef.current; touchRef.current = null;
    if (!st) return;
    const dx = e.changedTouches[0].clientX - st.x, dy = e.changedTouches[0].clientY - st.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.8) goMonth(dx < 0 ? 1 : -1);
  };

  // Month insights
  const insights = useMemo(() => {
    let bestDate = '', bestMins = 0, activeDays = 0, elapsed = 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    calendarDays.forEach(cd => {
      if (!cd.dateStr || !cd.isCurrentMonth) return;
      const mins = dayMins[cd.dateStr] || 0;
      if (cd.dateStr <= today) elapsed++;
      if (mins > 0 || dateMap[cd.dateStr]) activeDays++;
      if (mins > bestMins) { bestMins = mins; bestDate = cd.dateStr; }
    });
    return { bestDate, bestMins, activeDays, daysInMonth, elapsed: Math.max(1, Math.min(elapsed, daysInMonth)) };
  }, [calendarDays, dayMins, dateMap, year, month, today]);

  const MOODS_MAP: Record<string, string> = { Sad: '😔', Tired: '😴', Okay: '😐', Happy: '😊', Motivated: '🔥', Neutral: '😐' };

  return (
    <div className="space-y-0">
      {/* ════════════════════════════════════════
          CALENDAR CARD
         ════════════════════════════════════════ */}
      <GlowCard className="p-0 overflow-hidden" paper>
        {/* ── HEADER ── */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">📅</span>
              <div>
                <h3 className="text-sm font-bold text-foreground leading-tight">Progress Calendar</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  {calendarSync && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/8 border border-primary/15 text-[7px] font-bold text-primary">
                      <Link2 className="w-2 h-2" /> Synced
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground/50 font-medium">{includedCount}/{totalSubjectCount} subjects</span>
                </div>
              </div>
            </div>
            <button onClick={() => setShowSubjectSettings(p => !p)}
              className={`relative p-2 rounded-xl transition-all ${showSubjectSettings ? 'bg-primary/10 text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/15'}`}>
              <Settings2 className="w-4 h-4" />
              {hasExclusions && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-accent text-accent-foreground text-[7px] font-black flex items-center justify-center border-2 border-background">
                  {includedCount}
                </span>
              )}
            </button>
          </div>

          {/* Month Nav */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goMonth(-1)} aria-label="Previous month">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <span className="font-display-digit text-[15px] font-bold text-foreground">{monthName}</span>
              {monthOffset !== 0 && (
                <Button variant="ghost" size="sm" onClick={jumpToToday} className="h-6 px-2 text-[9px] font-bold text-primary rounded-lg">
                  Today
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant={rangeMode ? 'default' : 'ghost'}
                size="icon"
                className={`h-8 w-8 ${rangeApplied ? 'ring-1 ring-accent/40' : ''}`}
                onClick={() => { if (rangeMode) setRangeMode(false); else { setRangeMode(true); setSelectedDate(null); } }}>
                <CalendarRange className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goMonth(1)} aria-label="Next month">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* ── STREAK ROW ── */}
        <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl whitespace-nowrap shrink-0 ${streakData.current >= 7 ? 'bg-chart-4/10 border border-chart-4/15' : 'bg-primary/8 border border-primary/12'}`}>
            <AnimatedStreakNumber value={streakData.current} size="sm" showFire={false} />
            <span className="text-[10px] font-bold text-primary">🔥</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-accent/8 border border-accent/12 whitespace-nowrap shrink-0">
            <span className="text-[10px] font-bold text-accent">🏆 {streakData.best}d best</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-secondary/8 border border-secondary/12 whitespace-nowrap shrink-0 ml-auto">
            <span className="text-[10px] font-bold text-secondary">{monthStats.weeklyConsistency}% weekly</span>
          </div>
        </div>

        {/* ── SUBJECT SETTINGS ── */}
        <AnimatePresence>
          {showSubjectSettings && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <SubjectSettings
                subjects={subjects} excludedSubjects={excludedSubjects} toggleExclude={toggleExclude}
                setExcludedSubjects={setExcludedSubjects} calendarSync={calendarSync}
                setCalendarSync={(v) => { localStorage.setItem('nursetrack-calendar-sync', String(v)); setCalendarSync(v); }}
                externalRange={externalRange || null} externalSubjectFilter={externalSubjectFilter}
                setRangeFrom={setRangeFrom} setRangeTo={setRangeTo} setRangeApplied={setRangeApplied}
                setUserOverride={setUserOverride} setMonthOffset={setMonthOffset}
                includedCount={includedCount} totalSubjectCount={totalSubjectCount}
                completeWeek={completeWeek} setCompleteWeek={setCompleteWeek}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── RANGE MODE ── */}
        <AnimatePresence>
          {rangeMode && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <RangeModePanel
                rangeFrom={rangeFrom} rangeTo={rangeTo} hasRange={hasRange} rangeDays={rangeDays}
                setRangeFrom={setRangeFrom} setRangeTo={setRangeTo} setRangeApplied={setRangeApplied}
                setRangeMode={setRangeMode} setSelectedDate={setSelectedDate}
                setUserOverride={setUserOverride} setMonthOffset={setMonthOffset}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── RANGE SUMMARY PILL ── */}
        <AnimatePresence>
          {rangeApplied && hasRange && rangeSummary && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mx-4 mb-3 flex items-center justify-center gap-3 px-3 py-2 rounded-xl bg-accent/6 border border-accent/15">
              <span className="text-[10px] font-bold text-accent">✅ {rangeSummary.topicsDone}</span>
              <span className="w-px h-3 bg-accent/15" />
              <span className="text-[10px] font-bold text-primary font-mono">⏱ {formatStudyTime(rangeSummary.totalMins)}</span>
              <span className="w-px h-3 bg-accent/15" />
              <span className="text-[10px] font-bold text-secondary">🔥 {rangeSummary.activeDays}d</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── EMPTY STATE ── */}
        {filteredSubjects.length === 0 && (
          <div className="mx-4 mb-4 rounded-2xl border border-border/15 bg-card/20 p-6 text-center space-y-2">
            <EyeOff className="w-6 h-6 text-muted-foreground/30 mx-auto" />
            <p className="text-sm font-bold text-foreground/60">No Subjects Visible</p>
            <button onClick={() => setExcludedSubjects(new Set())}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary/10 border border-primary/15 text-[11px] font-bold text-primary active:scale-95">
              <Eye className="w-3.5 h-3.5" /> Show All
            </button>
          </div>
        )}

        {/* ── WEEKDAY HEADERS ── */}
        <div className="grid grid-cols-7 gap-0.5 px-3 mb-1">
          {weekDays.map((d, i) => (
            <div key={i} className={`text-[9px] text-center font-black uppercase tracking-wider ${i >= 5 ? 'text-primary/75' : 'text-muted-foreground/70'}`}>{d}</div>
          ))}
        </div>

        {/* ── CALENDAR GRID ── */}
        <div className="px-3 pb-3 overflow-hidden touch-pan-y" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
         <motion.div key={monthOffset} className="space-y-0.5"
           initial={{ opacity: 0, x: dirRef.current * 36 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 380 }}>
          {weeks.map((week, wi) => (
            <Fragment key={wi}>
              <div className="grid grid-cols-7 gap-0.5">
                {week.map((cd, di) => {
                  if (!cd.dateStr) return <div key={`e-${wi}-${di}`} className="min-h-[52px]" />;
                  const dateStr = cd.dateStr;
                  const isAdjacentMonth = !cd.isCurrentMonth;
                  const data = dateMap[dateStr];
                  const effectiveMins = dayMins[dateStr] || 0;
                  const intensity = isAdjacentMonth ? 0 : getIntensity(effectiveMins);
                  const adjIntensity = isAdjacentMonth ? getIntensity(effectiveMins) : 0;
                  const isToday = dateStr === today;
                  const isSelected = dateStr === selectedDate;
                  const dayMood = logMap[dateStr]?.mood;
                  const moodEmoji = dayMood ? MOODS_MAP[dayMood] : undefined;
                  const inDateRange = rangeApplied && hasRange && dateStr >= rangeFrom && dateStr <= rangeTo;
                  const inPendingRange = rangeMode && rangeFrom && rangeTo && dateStr >= rangeFrom && dateStr <= rangeTo;
                  const isRangeEdge = rangeMode && (dateStr === rangeFrom || dateStr === rangeTo);
                  const pendingTodos = getPendingCountForDate(dateStr);
                  const isExamDate = !!examDateMap[dateStr] && !isAdjacentMonth;
                  const examBg = isExamDate ? examDateMap[dateStr][0] : null;

                  return (
                    <button
                      key={dateStr}
                      onClick={() => handleDateClick(cd)}
                      className={`relative min-h-[52px] rounded-xl flex flex-col items-center justify-start py-1.5 transition-all duration-200 cursor-pointer active:scale-95 overflow-hidden
                        ${isAdjacentMonth ? (adjIntensity > 0 ? 'bg-primary/5' : 'bg-muted/3') : (isExamDate ? '' : intensityColors[intensity])}
                        ${isToday && !isSelected ? 'ring-2 ring-primary/45' : ''}
                        ${isSelected ? 'ring-2 ring-primary shadow-lg shadow-primary/10 scale-[1.02]' : ''}
                        ${inDateRange && !isSelected ? 'ring-1 ring-accent/20 bg-accent/5' : ''}
                        ${inPendingRange && !isRangeEdge ? 'bg-accent/12 ring-1 ring-accent/20' : ''}
                        ${isRangeEdge ? 'ring-2 ring-accent bg-accent/20 shadow-md' : ''}
                        ${isExamDate && !isSelected ? 'ring-2 ring-destructive/30 shadow-sm' : ''}
                      `}
                    >
                      {/* Exam background image on date cell */}
                      {examBg?.backgroundImage && (
                        <>
                          <img src={examBg.backgroundImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none" />
                          <div className="absolute inset-0 bg-background/40 pointer-events-none" />
                        </>
                      )}
                      {examBg?.iconUrl && !examBg.backgroundImage && (
                        <>
                          <img src={examBg.iconUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none" />
                          <div className="absolute inset-0 bg-background/50 pointer-events-none" />
                        </>
                      )}
                      <span className={`relative z-10 text-[15px] leading-none font-bold ${
                        isAdjacentMonth
                          ? (isSelected ? 'text-primary/60' : 'text-foreground/20')
                          : isSelected ? 'text-primary' :
                            isExamDate ? 'text-foreground font-extrabold drop-shadow-sm' :
                            isToday ? 'text-primary' :
                            intensity >= 3 ? 'text-primary-foreground' :
                            effectiveMins > 0 ? 'text-foreground' : 'text-foreground/30'
                      }`}>{cd.day}</span>

                      {effectiveMins > 0 && (
                        <span className={`relative z-10 text-[7px] font-bold font-mono leading-none mt-0.5 px-1 py-[1px] rounded ${
                          isAdjacentMonth ? 'text-secondary/40' :
                          intensity >= 3 ? 'text-primary-foreground/80' : 'text-secondary'
                        }`}>
                          {effectiveMins >= 60 ? `${Math.floor(effectiveMins / 60)}h` : `${effectiveMins}m`}
                        </span>
                      )}

                      {moodEmoji && effectiveMins > 0 && !isAdjacentMonth && (
                        <span className="relative z-10 text-[8px] leading-none mt-px">{moodEmoji}</span>
                      )}

                      {data && data.topics.length > 0 && (
                        <div className={`relative z-10 flex items-center gap-[2px] mt-px flex-wrap justify-center max-w-[44px] ${isAdjacentMonth ? 'opacity-40' : ''}`}>
                          {data.topics.slice(0, 5).map((t, i) => (
                            <div key={i} className="w-[4px] h-[4px] rounded-full" style={{ backgroundColor: t.subjectColor }} />
                          ))}
                        </div>
                      )}

                      {isToday && <div className="absolute bottom-[2px] w-1 h-1 rounded-full bg-primary" />}

                      {/* Exam date highlight */}
                      {examDateMap[dateStr] && !isAdjacentMonth && (
                        <div className="absolute top-0 right-0 flex -space-x-1">
                          {examDateMap[dateStr].slice(0, 2).map(ex => (
                            <div key={ex.id} className="w-4 h-4 rounded-full border border-background shadow-sm overflow-hidden bg-primary/20 flex items-center justify-center">
                              {ex.iconUrl ? (
                                <img src={ex.iconUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[7px] leading-none">{ex.emoji}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {pendingTodos > 0 && !isAdjacentMonth && (
                        <span className="absolute top-0 left-0 min-w-[12px] h-3 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[6px] font-bold flex items-center justify-center border border-background">
                          {pendingTodos}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Weekly summary */}
              {(weekStats[wi].topics > 0 || weekStats[wi].mins > 0) && (
                <div className="flex items-center gap-2 py-[3px] px-2 rounded-lg my-[1px]">
                  <span className={`text-[8px] font-mono font-black w-5 shrink-0 ${week.some(c => c.dateStr === today) ? 'text-primary' : 'text-muted-foreground/45'}`}>W{wi + 1}</span>
                  <div className="flex-1 h-1 rounded-full bg-muted/20 overflow-hidden">
                    <div className={`h-full rounded-full ${week.some(c => c.dateStr === today) ? 'bg-primary' : 'bg-primary/45'}`}
                      style={{ width: `${Math.min(100, (weekStats[wi].mins / Math.max(1, ...weekStats.map(w => w.mins))) * 100)}%` }} />
                  </div>
                  {weekStats[wi].topics > 0 && <span className="text-[9px] font-mono font-bold text-primary/70">{weekStats[wi].topics}t</span>}
                  {weekStats[wi].mins > 0 && <span className="text-[9px] font-mono font-bold text-secondary/80">{formatStudyTime(weekStats[wi].mins)}</span>}
                </div>
              )}
            </Fragment>
          ))}
         </motion.div>
        </div>

        {/* ── MONTH INSIGHTS ── */}
        <div className="px-3 pb-3">
          <div className="grid grid-cols-4 gap-1.5">
            <div className="rounded-xl border border-border/10 bg-card/35 px-2 py-2 min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-muted-foreground/60 flex items-center gap-1"><Timer className="w-2.5 h-2.5" />Study</p>
              <p className="text-[14px] font-black font-mono text-foreground leading-tight truncate">{formatStudyTime(monthStats.totalMins)}</p>
              <p className="text-[9px] font-semibold text-muted-foreground truncate">{insights.activeDays > 0 ? `~${formatStudyTime(Math.round(monthStats.totalMins / insights.activeDays))}/day` : 'this month'}</p>
            </div>
            <div className="rounded-xl border border-border/10 bg-card/35 px-2 py-2 min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-muted-foreground/60 flex items-center gap-1"><CheckCheck className="w-2.5 h-2.5" />Topics</p>
              <p className="text-[14px] font-black font-mono text-foreground leading-tight">{monthStats.totalDone}</p>
              <p className="text-[9px] font-semibold text-muted-foreground truncate">completed</p>
            </div>
            <div className="rounded-xl border border-border/10 bg-card/35 px-2 py-2 min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-muted-foreground/60 flex items-center gap-1"><CalendarCheck className="w-2.5 h-2.5" />Active</p>
              <p className="text-[14px] font-black font-mono text-foreground leading-tight">{insights.activeDays}<span className="text-[9px] text-muted-foreground font-semibold">/{monthOffset === 0 ? insights.elapsed : insights.daysInMonth}</span></p>
              <div className="h-1 rounded-full bg-muted/25 mt-1 overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${Math.min(100, (insights.activeDays / (monthOffset === 0 ? insights.elapsed : insights.daysInMonth)) * 100)}%` }} />
              </div>
            </div>
            <button type="button" disabled={!insights.bestDate} onClick={() => insights.bestDate && setSelectedDate(insights.bestDate)}
              className="rounded-xl border border-chart-4/20 bg-chart-4/8 px-2 py-2 min-w-0 text-left active:scale-95 transition-transform disabled:opacity-60">
              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-chart-4 flex items-center gap-1"><Trophy className="w-2.5 h-2.5" />Best day</p>
              <p className="text-[14px] font-black font-mono text-foreground leading-tight truncate">{insights.bestMins > 0 ? formatStudyTime(insights.bestMins) : '—'}</p>
              <p className="text-[9px] font-semibold text-muted-foreground truncate">{insights.bestDate ? formatDate(insights.bestDate).replace(/,? \d{4}$/, '') : 'no data'}</p>
            </button>
          </div>
        </div>

        {/* ── LEGEND ── */}
        <div className="px-4 pb-3 pt-1 border-t border-border/8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] text-muted-foreground/40">Less</span>
              {intensityColors.map((c, i) => <div key={i} className={`w-3 h-3 rounded ${c} border border-border/5`} />)}
              <span className="text-[8px] text-muted-foreground/40">More</span>
            </div>
            <div className="flex items-center gap-2 text-[8px] font-semibold text-muted-foreground/50">
              <span>&lt;30m</span><span>·</span><span>1h</span><span>·</span><span>2h+</span>
            </div>
          </div>
        </div>

        {/* ── RANGE INDICATOR ── */}
        {rangeApplied && hasRange && (
          <div className="px-4 pb-3 flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/6 border border-accent/12 text-[9px] font-semibold text-accent">
              <CalendarRange className="w-3 h-3" />
              {formatDate(rangeFrom)} — {formatDate(rangeTo)}
            </span>
            <button onClick={() => { setRangeFrom(''); setRangeTo(''); setRangeApplied(false); setUserOverride(false); }}
              className="flex items-center gap-0.5 px-2 py-1 rounded-full text-[9px] font-bold text-destructive/60 hover:text-destructive transition-colors">
              <X className="w-3 h-3" /> Clear
            </button>
          </div>
        )}
      </GlowCard>

      {/* ── RANGE ANALYSIS ── */}
      {rangeApplied && hasRange && (
        <CalendarAnalysis subjects={filteredSubjects} dailyLogs={dailyLogs} dbSessions={dbSessions} dateMap={dateMap as any}
          rangeFrom={rangeFrom} rangeTo={rangeTo} year={year} month={month} />
      )}

      {/* ── EXAM POSTER for selected date ── */}
      {selectedDate && examDateMap[selectedDate] && (
        <div className="mt-3 space-y-2">
          {examDateMap[selectedDate].map(exam => {
            const posterData = computeExamPosterData(exam, subjects, nowMs);
            return (
              <GlowCard key={exam.id} className="p-0 overflow-hidden" glow={posterData.isPast ? 'none' : posterData.days <= 7 ? 'red' : 'cyan'}>
                <ExamPosterCard
                  data={posterData}
                  compact
                  onManage={() => onNavigate?.('profile', { openExams: 'true' })}
                  onSubjectClick={(id) => onNavigate?.('syllabus', { subjectId: id })}
                />
              </GlowCard>
            );
          })}
        </div>
      )}

      {/* ── DAY-BY-DAY TIMELINE ── */}
      <div className="mt-3">
        <DayByDayTimeline
          subjects={filteredSubjects} dailyLogs={dailyLogs || []} dbSessions={dbSessions}
          onOpenTopicDetail={onOpenTopicDetail}
          externalRange={rangeApplied && hasRange ? { from: rangeFrom, to: rangeTo } : { from: `${year}-${String(month + 1).padStart(2, '0')}-01`, to: `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}` }}
          getTodosForDate={getTodosForDate}
          getPendingCountForDate={getPendingCountForDate}
        />
      </div>

      {/* ════════════════════════════════════════
          DAY DETAIL PANEL (opens when date clicked)
         ════════════════════════════════════════ */}
      <AnimatePresence>
        {selectedDate && (
          <DayDetailPanel
            selectedDate={selectedDate}
            subjects={filteredSubjects}
            dailyLogs={dailyLogs || []}
            dateMap={dateMap}
            logMap={logMap}
            onClose={() => setSelectedDate(null)}
            onChangeDate={(d) => {
              const t = new Date(d + 'T12:00:00'), n = new Date();
              dirRef.current = 0;
              setMonthOffset((t.getFullYear() - n.getFullYear()) * 12 + (t.getMonth() - n.getMonth()));
              setSelectedDate(d);
            }}
            onUpdateMood={onUpdateMood}
            onUpdateLogs={onUpdateLogs}
            onOpenTopicDetail={onOpenTopicDetail}
            onNavigateToCalendar={onNavigateToCalendar}
            getTodosForDate={getTodosForDate}
            addTodo={addTodo}
            toggleTodo={toggleTodo}
            deleteTodo={deleteTodo}
            updateTodo={updateTodo}
            onCreateSession={onCreateSession}
            onUpdateSession={onUpdateSession}
            onDeleteSession={onDeleteSession}
            onUpdateSubjects={onUpdateSubjects}
            dbSessions={dbSessions}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Subject Settings Panel ── */
function SubjectSettings({ subjects, excludedSubjects, toggleExclude, setExcludedSubjects, calendarSync, setCalendarSync, externalRange, externalSubjectFilter, setRangeFrom, setRangeTo, setRangeApplied, setUserOverride, setMonthOffset, includedCount, totalSubjectCount, completeWeek, setCompleteWeek }: any) {
  return (
    <div className="mx-4 mb-3 rounded-2xl overflow-hidden border border-border/15 shadow-md">
      <div className="px-3.5 py-2.5 bg-gradient-to-r from-accent/10 to-primary/5 border-b border-border/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="w-3.5 h-3.5 text-accent" />
            <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Visibility · {includedCount}/{totalSubjectCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setExcludedSubjects(new Set())} className="text-[9px] font-bold px-2 py-1 rounded-full bg-secondary/10 text-secondary hover:bg-secondary/15 transition-colors">
              <Eye className="w-3 h-3 inline mr-0.5" /> All
            </button>
            <button onClick={() => setExcludedSubjects(new Set(subjects.map((s: any) => s.id)))} className="text-[9px] font-bold px-2 py-1 rounded-full bg-muted/15 text-muted-foreground hover:bg-muted/25 transition-colors">
              <EyeOff className="w-3 h-3 inline mr-0.5" /> None
            </button>
          </div>
        </div>
      </div>

      {/* Sync Toggle */}
      <div className="px-3.5 py-2.5 border-b border-border/8 bg-card/15">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {calendarSync ? <Link2 className="w-3.5 h-3.5 text-primary" /> : <Unlink2 className="w-3.5 h-3.5 text-muted-foreground/40" />}
            <div>
              <span className="text-[10px] font-bold text-foreground">Analytics Sync</span>
              <span className="text-[8px] text-muted-foreground/50 block">{calendarSync ? 'Linked' : 'Independent'}</span>
            </div>
          </div>
          <motion.button whileTap={{ scale: 0.92 }}
            onClick={() => {
              const newVal = !calendarSync;
              setCalendarSync(newVal);
              if (!newVal) setExcludedSubjects(new Set());
              else if (externalRange) {
                setRangeFrom(externalRange.from); setRangeTo(externalRange.to); setRangeApplied(true); setUserOverride(false);
                const t = new Date(externalRange.from + 'T12:00:00'); const n = new Date();
                setMonthOffset((t.getFullYear() - n.getFullYear()) * 12 + (t.getMonth() - n.getMonth()));
              }
            }}
            className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-all ${calendarSync ? 'bg-primary/25 border border-primary/35' : 'bg-muted/25 border border-border/15'}`}>
            <motion.div animate={{ x: calendarSync ? 18 : 0 }} transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className={`w-4 h-4 rounded-full shadow-sm ${calendarSync ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
          </motion.button>
        </div>
      </div>

      {/* Complete Week Toggle */}
      <div className="px-3.5 py-2.5 border-b border-border/8 bg-card/15">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-3.5 h-3.5 text-secondary" />
            <div>
              <span className="text-[10px] font-bold text-foreground">Complete Week</span>
              <span className="text-[8px] text-muted-foreground/50 block">{completeWeek ? 'Full 7-day grid' : 'Current month only'}</span>
            </div>
          </div>
          <motion.button whileTap={{ scale: 0.92 }}
            onClick={() => {
              const newVal = !completeWeek;
              localStorage.setItem('nursetrack-complete-week', String(newVal));
              setCompleteWeek(newVal);
            }}
            className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-all ${completeWeek ? 'bg-secondary/25 border border-secondary/35' : 'bg-muted/25 border border-border/15'}`}>
            <motion.div animate={{ x: completeWeek ? 18 : 0 }} transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className={`w-4 h-4 rounded-full shadow-sm ${completeWeek ? 'bg-secondary' : 'bg-muted-foreground/30'}`} />
          </motion.button>
        </div>
      </div>

      <div className="bg-card/15 p-2 space-y-0.5 max-h-48 overflow-y-auto">
        {subjects.map((s: any) => {
          const isExcluded = excludedSubjects.has(s.id);
          const allT = s.units.flatMap((u: any) => u.subTopics);
          const done = allT.filter((t: any) => t.completed).length;
          return (
            <button key={s.id} onClick={() => toggleExclude(s.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all ${isExcluded ? 'opacity-35' : 'hover:bg-card/40'}`}>
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isExcluded ? 'opacity-30' : 'shadow-[0_0_4px_currentColor]'}`}
                style={{ backgroundColor: s.color, color: readableInk(s.color) }} />
              <span className={`text-[11px] font-semibold flex-1 text-left truncate ${isExcluded ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{s.shortName}</span>
              <span className="text-[8px] font-mono text-muted-foreground/50">{done}/{allT.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Range Mode Panel ── */
function RangeModePanel({ rangeFrom, rangeTo, hasRange, rangeDays, setRangeFrom, setRangeTo, setRangeApplied, setRangeMode, setSelectedDate, setUserOverride, setMonthOffset }: any) {
  return (
    <div className="mx-4 mb-3 rounded-2xl overflow-hidden border border-accent/20 bg-accent/5 shadow-md">
      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <CalendarRange className="w-3.5 h-3.5 text-accent" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {!rangeFrom ? 'Tap start date' : !rangeTo ? 'Tap end date' : 'Range selected'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ label: 'Last 7d', days: 7 }, { label: 'Last 15d', days: 15 }, { label: 'Last 30d', days: 30 }, { label: 'This Month', days: 0 }].map(p => (
            <Button key={p.label} variant="outline" size="sm" onClick={() => {
              const now = new Date();
              let from: Date, to: Date;
              if (p.days === 0) { from = new Date(now.getFullYear(), now.getMonth(), 1); to = now; }
              else { to = now; from = new Date(now); from.setDate(from.getDate() - p.days + 1); }
              setRangeFrom(getLocalDateStr(from)); setRangeTo(getLocalDateStr(to));
              setRangeApplied(true); setRangeMode(false); setSelectedDate(null); setUserOverride(true);
              const n = new Date();
              setMonthOffset((from.getFullYear() - n.getFullYear()) * 12 + (from.getMonth() - n.getMonth()));
            }} className="text-[10px] h-7 rounded-full font-semibold px-2.5">{p.label}</Button>
          ))}
        </div>
        {rangeFrom && <p className="text-[10px] font-semibold text-accent text-center">{hasRange ? `${formatDate(rangeFrom)} — ${formatDate(rangeTo)}` : `Start: ${formatDate(rangeFrom)}`}</p>}
        {hasRange && (
          <div className="flex justify-center">
            <span className="text-[10px] font-bold text-primary bg-primary/8 px-2.5 py-1 rounded-full border border-primary/15">{rangeDays} day{rangeDays !== 1 ? 's' : ''}</span>
          </div>
        )}
        <div className="flex items-center gap-2 justify-center">
          <Button size="sm" disabled={!hasRange} onClick={() => {
            setRangeApplied(true); setRangeMode(false); setUserOverride(true);
            if (rangeFrom) {
              const t = new Date(rangeFrom + 'T12:00:00'); const n = new Date();
              setMonthOffset((t.getFullYear() - n.getFullYear()) * 12 + (t.getMonth() - n.getMonth()));
            }
          }} className="h-7 px-4 text-[10px] font-bold rounded-full">✓ Apply</Button>
          <Button size="sm" variant="ghost" onClick={() => { setRangeFrom(''); setRangeTo(''); setRangeApplied(false); setRangeMode(false); setUserOverride(false); }}
            className="h-7 px-3 text-[10px] font-bold rounded-full text-destructive hover:text-destructive">
            <X className="w-3 h-3 mr-0.5" /> Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
