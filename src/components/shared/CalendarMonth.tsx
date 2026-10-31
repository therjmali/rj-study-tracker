import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import type { DailyLog, Subject, StudyGoals, DbStudySession } from '../../types';
import type { TodoItem } from '../../hooks/useTodos';
import { getLocalDateStr, formatStudyTime, formatStudyHours, getEffectiveDayMinutes } from '../../lib/utils';
import { useStreak } from '../../hooks/useStreak';
import AnimatedStreakNumber from './AnimatedStreakNumber';
import CalendarDateDetail from './CalendarDateDetail';

interface Props {
  dailyLogs: DailyLog[];
  subjects: Subject[];
  studyGoals: StudyGoals;
  onDateClick?: (date: string) => void;
  selectedDate?: string;
  todos?: TodoItem[];
  /** When set, filter calendar activity by these subjects only */
  calendarExcluded?: Set<string>;
  dbSessions?: DbStudySession[];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarMonth({ dailyLogs, subjects, studyGoals, onDateClick, selectedDate, todos = [], calendarExcluded, dbSessions }: Props) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const today = getLocalDateStr();

  // Optionally filter subjects for calendar display
  const calSubjects = useMemo(() => {
    if (!calendarExcluded || calendarExcluded.size === 0) return subjects;
    return subjects.filter(s => !calendarExcluded.has(s.id));
  }, [subjects, calendarExcluded]);

  const logsMap = useMemo(() => {
    const map = new Map<string, DailyLog>();
    dailyLogs.forEach(l => map.set(l.date, l));
    return map;
  }, [dailyLogs]);

  const topicsPerDay = useMemo(() => {
    const map = new Map<string, number>();
    calSubjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate) {
        map.set(t.completedDate, (map.get(t.completedDate) || 0) + 1);
      }
    })));
    return map;
  }, [calSubjects]);

  const streakDays = useMemo(() => {
    const activeDates = new Set<string>();
    topicsPerDay.forEach((count, date) => { if (count > 0) activeDates.add(date); });
    dailyLogs.forEach(l => { if (l.hoursStudied > 0) activeDates.add(l.date); });
    dbSessions?.forEach(s => { if (s.minutes > 0) activeDates.add(s.date); });
    const sortedDates = Array.from(activeDates).sort();
    const streakSet = new Set<string>();
    let run: string[] = [];
    for (let i = 0; i < sortedDates.length; i++) {
      const d = sortedDates[i];
      if (run.length === 0) { run.push(d); continue; }
      const prev = new Date(run[run.length - 1] + 'T00:00:00');
      const curr = new Date(d + 'T00:00:00');
      if (Math.round((curr.getTime() - prev.getTime()) / 86400000) === 1) {
        run.push(d);
      } else {
        if (run.length >= 2) run.forEach(dt => streakSet.add(dt));
        run = [d];
      }
    }
    if (run.length >= 2) run.forEach(dt => streakSet.add(dt));
    return streakSet;
  }, [topicsPerDay, dailyLogs, dbSessions]);

  const { year, month, days } = useMemo(() => {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    // Shift so Monday=0, Sunday=6
    const mondayFirstDay = (firstDay + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const d: (number | null)[] = [];
    for (let i = 0; i < mondayFirstDay; i++) d.push(null);
    for (let i = 1; i <= daysInMonth; i++) d.push(i);
    return { year: y, month: m, days: d };
  }, [viewDate]);

  const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
  const getDateStr = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const getActivity = (dateStr: string) => {
    const log = logsMap.get(dateStr);
    const topics = topicsPerDay.get(dateStr) || 0;
    const hours = getEffectiveDayMinutes(calSubjects, dailyLogs, dateStr, dbSessions) / 60;
    const mood = log?.mood;
    return { topics, hours, hasActivity: topics > 0 || hours > 0, mood };
  };

  const meetsGoal = (topics: number, hours: number) => topics >= studyGoals.dailyTopics || hours >= studyGoals.dailyHours;

  const streakData = useStreak(calSubjects, dailyLogs, dbSessions);
  const currentStreak = streakData.current;

  const weeklySummaries = useMemo(() => {
    const summaries: { topics: number; hours: number }[] = [];
    for (let i = 0; i < days.length; i += 7) {
      let topics = 0, hours = 0;
      for (let j = i; j < Math.min(i + 7, days.length); j++) {
        const day = days[j];
        if (day === null) continue;
        const act = getActivity(getDateStr(day));
        topics += act.topics;
        hours += act.hours;
      }
      summaries.push({ topics, hours });
    }
    return summaries;
  }, [days, year, month, calSubjects, dailyLogs, dbSessions]);

  const handleDateClick = (dateStr: string) => {
    onDateClick?.(dateStr);
    setDetailDate(dateStr);
  };

  return (
    <>
      <div className="glass-card paper-texture p-4" role="region" aria-label="Study calendar">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month - 1, 1))} className="w-8 h-8" aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center">
            <button onClick={() => setViewDate(new Date())} className="font-display-digit text-[15px] text-foreground hover:text-primary transition-colors">
              {monthName}
            </button>
            {currentStreak >= 2 && (
              <div className="flex items-center justify-center gap-1.5 mt-0.5">
                <AnimatedStreakNumber value={currentStreak} size="sm" showFire={false} />
                <span className="text-[10px] font-bold text-chart-4">day streak 🔥</span>
                {streakData.milestone && (
                  <span className="text-[7px] px-1 py-0.5 rounded-full bg-chart-4/12 text-chart-4 font-bold border border-chart-4/15">
                    {streakData.milestone.badge}
                  </span>
                )}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month + 1, 1))} className="w-8 h-8" aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider">{d}</div>
          ))}
        </div>

        {/* Days Grid + Weekly Summaries */}
        {(() => {
          const rows: React.ReactNode[] = [];
          for (let rowStart = 0; rowStart < days.length; rowStart += 7) {
            const weekDays = days.slice(rowStart, rowStart + 7);
            const weekIdx = Math.floor(rowStart / 7);
            const weekSummary = weeklySummaries[weekIdx];

            rows.push(
              <div key={`week-${weekIdx}`} className="grid grid-cols-7 gap-1">
                {weekDays.map((day, i) => {
                  if (day === null) return <div key={`empty-${rowStart}-${i}`} />;
                  return <CalendarDateCell
                    key={getDateStr(day)}
                    day={day}
                    dateStr={getDateStr(day)}
                    activity={getActivity(getDateStr(day))}
                    isToday={getDateStr(day) === today}
                    isSelected={getDateStr(day) === selectedDate}
                    isStreak={streakDays.has(getDateStr(day))}
                    goalMet={meetsGoal(getActivity(getDateStr(day)).topics, getActivity(getDateStr(day)).hours)}
                    onClick={() => handleDateClick(getDateStr(day))}
                  />;
                })}
              </div>
            );

            if (weekSummary && (weekSummary.topics > 0 || weekSummary.hours > 0)) {
              rows.push(
                <div key={`summary-${weekIdx}`} className="flex items-center justify-end gap-3 px-1 py-0.5 mb-0.5">
                  {weekSummary.topics > 0 && (
                    <span className="text-[8px] font-bold text-primary/50">{weekSummary.topics} topics</span>
                  )}
                  {weekSummary.hours > 0 && (
                    <span className="text-[8px] font-bold text-secondary/50">{formatStudyHours(weekSummary.hours)} studied</span>
                  )}
                </div>
              );
            }
          }
          return <div className="space-y-1">{rows}</div>;
        })()}

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border/10 text-[9px] text-muted-foreground flex-wrap">
          <div className="flex items-center gap-1">
            <span className="cal-date-num text-[10px] text-primary">3</span>
            <span>Topics</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-bold text-secondary font-mono">2h</span>
            <span>Hours</span>
          </div>
          <div className="flex items-center gap-1"><span className="text-[9px]">😄</span><span>Mood</span></div>
          <div className="flex items-center gap-1"><span className="text-[8px]">🔥</span><span>Streak</span></div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm border border-secondary/40" />
            <span>Goal Met</span>
          </div>
        </div>
      </div>

      {/* Date Detail Bottom Sheet */}
      {detailDate && (
        <CalendarDateDetail
          open={!!detailDate}
          onClose={() => setDetailDate(null)}
          date={detailDate}
          subjects={subjects}
          dailyLogs={dailyLogs}
          todos={todos}
          dbSessions={dbSessions}
        />
      )}
    </>
  );
}

/* ── Individual Date Cell ── */
function CalendarDateCell({ day, dateStr, activity, isToday, isSelected, isStreak, goalMet, onClick }: {
  day: number;
  dateStr: string;
  activity: { topics: number; hours: number; hasActivity: boolean; mood?: string };
  isToday: boolean;
  isSelected: boolean;
  isStreak: boolean;
  goalMet: boolean;
  onClick: () => void;
}) {
  const { topics, hours, hasActivity, mood } = activity;
  const moodEmoji = mood ? MOOD_MAP[mood] : undefined;

  // Intensity background
  const score = topics + hours * 2;
  const intensityBg = score === 0 ? '' :
    score < 3 ? 'bg-primary/8' :
    score < 6 ? 'bg-primary/15' :
    score < 10 ? 'bg-primary/25' :
    'bg-primary/35';

  return (
    <button
      onClick={onClick}
      className={`
        relative rounded-xl flex flex-col items-center justify-start gap-0 transition-all duration-200
        min-h-[52px] py-1
        ${isSelected ? 'ring-2 ring-primary shadow-md bg-primary/10 scale-[1.03]' : ''}
        ${isToday && !isSelected ? 'ring-1 ring-primary/40' : ''}
        ${hasActivity ? intensityBg : 'hover:bg-muted/20'}
        ${goalMet && !isSelected ? 'border border-secondary/30' : 'border border-transparent'}
        ${isStreak ? 'bg-orange-500/6' : ''}
      `}
    >
      {/* Day Number — premium serif */}
      <span className={`cal-date-num text-[16px] leading-none ${
        isToday ? 'text-primary' : 
        hasActivity ? 'text-foreground' : 'text-foreground/40'
      }`}>
        {day}
      </span>

      {/* Stats row */}
      <div className="flex flex-col items-center gap-[1px] mt-0.5">
        {topics > 0 && (
          <span className="text-[7px] font-bold text-primary font-mono leading-none px-1 py-[1px] rounded-sm bg-primary/10">
            {topics} ✓
          </span>
        )}
        {hours > 0 && (
          <span className="text-[6px] font-bold text-secondary font-mono leading-none">
            {formatStudyTime(Math.round(hours * 60))}
          </span>
        )}
      </div>

      {/* Mood or streak — only show mood if manually set */}
      {moodEmoji ? (
        <span className="text-[8px] leading-none">{moodEmoji}</span>
      ) : isStreak && topics > 0 ? (
        <span className="text-[6px] leading-none">🔥</span>
      ) : null}

      {/* Today dot */}
      {isToday && (
        <div className="absolute bottom-[2px] w-1 h-1 rounded-full bg-primary" />
      )}
    </button>
  );
}

const MOOD_MAP: Record<string, string> = {
  Sad: '😔',
  Tired: '😴',
  Okay: '😐',
  Neutral: '😐',
  Happy: '😊',
  Motivated: '🔥',
};
