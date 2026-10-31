import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Save, Plus } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import type { DailyLog, Subject, StudyGoals, TrackingMode, StudySession, DbStudySession } from '../types';
import type { TodoItem } from '../hooks/useTodos';
import { getLocalDateStr, formatStudyTime } from '../lib/utils';
import { useToday } from '../hooks/useToday';
import { useStreak } from '../hooks/useStreak';
import GlowCard from './shared/GlowCard';
import CircularProgress from './shared/CircularProgress';
import AnimatedStreakNumber from './shared/AnimatedStreakNumber';
import BottomSheet from './shared/BottomSheet';
import CalendarMonth from './shared/CalendarMonth';
import AllSessionsManager from './daily/AllSessionsManager';
import ComparePeriods from './daily/ComparePeriods';
import SubjectLink from './shared/SubjectLink';
import QuotesManager from './daily/QuotesManager';
import type { UserSettings } from '../types';

const TT = { contentStyle: { background: 'hsl(var(--card)/0.95)', border: '1px solid hsl(var(--border)/0.2)', borderRadius: 12, fontSize: 12, color: 'hsl(var(--foreground))' } };
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };

interface Props {
  dailyLogs: DailyLog[];
  subjects: Subject[];
  onUpdate: (logs: DailyLog[]) => void;
  onDateChange: (date: string) => void;
  activeDate: string;
  trackingMode: TrackingMode;
  onTrackingModeChange: (mode: TrackingMode) => void;
  studyGoals: StudyGoals;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
  todos?: TodoItem[];
  calendarExcluded?: Set<string>;
  onCreateSession?: (session: { date: string; minutes: number; description: string; type: 'Topic' | 'Unit' | 'Other'; subjectId?: string; subjectName?: string; startTime?: string; endTime?: string; note?: string }) => void;
  onUpdateSession?: (sessionId: string, changes: Record<string, any>) => void;
  onDeleteSession?: (sessionId: string) => void;
  settings?: UserSettings;
  onUpdateSettings?: (s: UserSettings) => void;
  dbSessions?: DbStudySession[];
}

export default function DailyTracker({ dailyLogs, subjects, onUpdate, onDateChange, activeDate, trackingMode, onTrackingModeChange, studyGoals, onNavigate, todos, calendarExcluded, onCreateSession, onUpdateSession, onDeleteSession, settings, onUpdateSettings, dbSessions }: Props) {
  const [logOpen, setLogOpen] = useState(false);
  const today = useToday();
  const todayLog = useMemo(() => dailyLogs.find(l => l.date === activeDate), [dailyLogs, activeDate]);

  // ── Unified Streak (single source of truth — includes sessions) ──
  const streakInfo = useStreak(subjects, dailyLogs, dbSessions);

  // ── Goal Progress ──
  const goalProgress = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    const dwk = weekStart.getDay(); weekStart.setDate(weekStart.getDate() - (dwk === 0 ? 6 : dwk - 1));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const ws = getLocalDateStr(weekStart);
    const ms = getLocalDateStr(monthStart);

    let weeklyDone = 0, monthlyDone = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (!t.completed || !t.completedDate) return;
      if (t.completedDate >= ws) weeklyDone++;
      if (t.completedDate >= ms) monthlyDone++;
    })));

    return {
      daily: { done: streakInfo.todayDone, goal: studyGoals.dailyTopics },
      weekly: { done: weeklyDone, goal: studyGoals.weeklyTopics },
      monthly: { done: monthlyDone, goal: studyGoals.monthlyTopics },
    };
  }, [subjects, streakInfo.todayDone, studyGoals]);

  // ── Consistency Score ──
  const consistency = useMemo(() => {
    const last30 = dailyLogs.slice(-30);
    const activeDays = last30.filter(l => l.topicsCompleted > 0 || l.hoursStudied > 0).length;
    return Math.round((activeDays / 30) * 100);
  }, [dailyLogs]);

  // ── Last 7 Days Chart ──
  const last7 = useMemo(() => {
    const logs = dailyLogs.slice(-7);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return logs.map(l => {
      const d = new Date(l.date + 'T00:00:00');
      const topicsDone = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed && t.completedDate === l.date).length, 0), 0);
      return { day: dayNames[d.getDay()], topics: topicsDone };
    });
  }, [dailyLogs, subjects]);

  // ── Stats Pills ──
  const statsPills = useMemo(() => {
    const allDone = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);
    return { total: allDone, month: goalProgress.monthly.done, week: goalProgress.weekly.done };
  }, [subjects, goalProgress]);

  // ── Study Rhythm ──
  const rhythm = useMemo(() => {
    const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (!t.completed || !t.completedTime) return;
      const h = parseInt(t.completedTime.split(':')[0]);
      if (h >= 4 && h < 12) buckets.morning++;
      else if (h >= 12 && h < 17) buckets.afternoon++;
      else if (h >= 17 && h < 20) buckets.evening++;
      else buckets.night++;
    })));
    const max = Math.max(...Object.values(buckets), 1);
    return { ...buckets, max };
  }, [subjects]);

  // ── Subject Breakdown ──
  const subjectBreakdown = useMemo(() => {
    return subjects.map(s => {
      const all = s.units.flatMap(u => u.subTopics);
      const done = all.filter(t => t.completed).length;
      return { id: s.id, name: s.shortName, color: s.color, done, total: all.length, pct: all.length > 0 ? Math.round((done / all.length) * 100) : 0 };
    });
  }, [subjects]);

  const streakMsg = streakInfo.current >= 7 ? 'Incredible consistency! Keep going! 🌟' : streakInfo.current >= 3 ? 'Good momentum! Stay focused! 💪' : streakInfo.current >= 1 ? "Great start! Don't break the chain! 🔗" : 'Start studying today to begin your streak! 🚀';

  return (
    <motion.div className="space-y-4" variants={stagger} initial="hidden" animate="show">
      {/* ── Streak Hero ── */}
      <motion.div variants={fadeUp}>
        <div className={`rounded-2xl overflow-hidden border border-primary/15 backdrop-blur-xl ${streakInfo.current >= 7 ? 'animate-fire-border' : ''}`}>
          {/* Main streak display */}
          <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-primary/12 via-accent/6 to-secondary/8">
            <p className="text-[8px] uppercase font-bold text-muted-foreground tracking-[0.2em] mb-2">CURRENT STREAK</p>
            <div className="flex items-center gap-3">
              <AnimatedStreakNumber value={streakInfo.current} size="lg" showFire milestone={streakInfo.milestone} showMilestoneBadge />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-muted-foreground leading-none">{streakInfo.current === 1 ? 'day' : 'days'}</span>
                {streakInfo.milestone && (
                  <motion.span
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.3 }}
                    className="text-[8px] px-1.5 py-0.5 rounded-full bg-chart-4/15 text-chart-4 border border-chart-4/20 font-bold w-fit"
                  >
                    {streakInfo.milestone.emoji} {streakInfo.milestone.label}
                  </motion.span>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 leading-snug">{streakMsg}</p>
          </div>
          {/* Bottom stats strip */}
          <div className="flex items-center border-t border-border/10 bg-card/30">
            <div className="flex-1 py-2.5 text-center border-r border-border/10">
              <span className="text-[9px] font-semibold text-accent">🏆 Best: {streakInfo.best}d</span>
            </div>
            <div className="flex-1 py-2.5 text-center">
              <span className="text-[9px] font-semibold text-secondary">🟢 Today: {streakInfo.todayDone}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Motivational Quotes ── */}
      {settings && onUpdateSettings && (
        <QuotesManager settings={settings} onUpdateSettings={onUpdateSettings} />
      )}

      {/* ── Targets ── */}
      <motion.div variants={fadeUp}>
        <p className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1">🎯 TARGETS</p>
        <div className="space-y-2">
          <TargetCard icon="📅" title="DAILY GOAL" done={goalProgress.daily.done} goal={goalProgress.daily.goal} />
          <TargetCard icon="📊" title="WEEKLY GOAL" done={goalProgress.weekly.done} goal={goalProgress.weekly.goal} />
          <TargetCard icon="🏆" title="MONTHLY GOAL" done={goalProgress.monthly.done} goal={goalProgress.monthly.goal} />
        </div>
      </motion.div>

      {/* ── Consistency Score ── */}
      <motion.div variants={fadeUp}>
        <GlowCard className="p-4" paper>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-foreground">CONSISTENCY SCORE</p>
              <p className="text-[10px] text-muted-foreground">Active days in last 30 days</p>
              <div className="mt-2 h-2 w-40 rounded-full bg-muted/30 overflow-hidden">
                <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${consistency}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                {consistency < 40 ? '💡 Room for improvement. Aim for daily practice!' : consistency < 70 ? '👍 Good consistency! Push a little more!' : '🔥 Excellent consistency!'}
              </p>
            </div>
            <CircularProgress value={consistency} max={100} size={56} strokeWidth={4} color={consistency >= 60 ? 'hsl(var(--secondary))' : 'hsl(var(--destructive))'} label={`${consistency}%`} />
          </div>
        </GlowCard>
      </motion.div>

      {/* ── Calendar Month View (v7) ── */}
      <motion.div variants={fadeUp}>
        <CalendarMonth
          dailyLogs={dailyLogs}
          subjects={subjects}
          studyGoals={studyGoals}
          selectedDate={activeDate}
          onDateClick={(date) => onDateChange(date)}
          todos={todos}
          calendarExcluded={calendarExcluded}
          dbSessions={dbSessions}
        />
      </motion.div>

      {/* ── Study Sessions Manager (All Dates) ── */}
      <motion.div variants={fadeUp}>
        <AllSessionsManager
          subjects={subjects}
          dailyLogs={dailyLogs}
          dbSessions={dbSessions}
          activeDate={activeDate}
          onCreateSession={onCreateSession}
          onUpdateSession={onUpdateSession}
          onDeleteSession={onDeleteSession}
          onUpdateLogs={onUpdate}
        />
      </motion.div>

      {/* ── Compare Periods ── */}
      <motion.div variants={fadeUp}>
        <ComparePeriods subjects={subjects} dailyLogs={dailyLogs} />
      </motion.div>

      {/* ── Stats Pills ── */}
      <motion.div variants={fadeUp} className="grid grid-cols-3 gap-2">
        <StatPill value={statsPills.total} label="TOTAL TOPICS" color="primary" />
        <StatPill value={statsPills.month} label="THIS MONTH" color="accent" />
        <StatPill value={statsPills.week} label="THIS WEEK" color="secondary" />
      </motion.div>

      {/* ── Last 7 Days Chart ── */}
      <motion.div variants={fadeUp}>
        <GlowCard className="p-4" paper>
          <p className="text-xs font-bold text-foreground mb-3">📊 LAST 7 DAYS</p>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={last7}>
              <XAxis dataKey="day" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} width={20} />
              <Tooltip {...TT} />
              <Bar dataKey="topics" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlowCard>
      </motion.div>

      {/* ── Study Rhythm ── */}
      <motion.div variants={fadeUp}>
        <GlowCard className="p-4" paper>
          <p className="text-xs font-bold text-foreground mb-3">🕐 STUDY RHYTHM</p>
          {[
            { label: 'Morning', time: '4 AM – 12 PM', icon: '🌅', count: rhythm.morning },
            { label: 'Afternoon', time: '12 PM – 5 PM', icon: '☀️', count: rhythm.afternoon },
            { label: 'Evening', time: '5 PM – 8 PM', icon: '🌆', count: rhythm.evening },
            { label: 'Night', time: '8 PM – 4 AM', icon: '🌙', count: rhythm.night },
          ].map(r => (
            <div key={r.label} className="flex items-center gap-3 mb-2.5">
              <span className="text-sm">{r.icon}</span>
              <div className="flex-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-[11px] font-semibold text-foreground">{r.label}</span>
                  <span className="text-[8px] text-muted-foreground whitespace-nowrap">{r.time}</span>
                </div>
                <div className="h-2 rounded-full bg-muted/30 overflow-hidden mt-1">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(r.count / rhythm.max) * 100}%` }} />
                </div>
              </div>
              <span className="text-xs font-bold font-mono text-foreground w-8 text-right">{r.count}</span>
              {r.count === rhythm.max && r.count > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-bold border border-primary/20">PEAK</span>
              )}
            </div>
          ))}
        </GlowCard>
      </motion.div>

      {/* ── Subject Breakdown ── */}
      <motion.div variants={fadeUp}>
        <GlowCard className="p-4" paper>
          <p className="text-xs font-bold text-foreground mb-3">📚 LEARNING BREAKDOWN BY SUBJECT</p>
          {subjectBreakdown.map(s => (
            <div key={s.name} className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <SubjectLink shortName={s.name} color={s.color} subjectId={s.id} onNavigate={onNavigate} variant="text" />
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold" style={{ color: s.color }}>{s.pct}%</span>
                  <span className="text-[9px] text-muted-foreground">{s.done}/{s.total}</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
              </div>
            </div>
          ))}
        </GlowCard>
      </motion.div>

      {/* ── Streak Milestones ── */}
      <motion.div variants={fadeUp}>
        <GlowCard className="p-4" paper>
          <p className="text-xs font-bold text-foreground mb-3">🏅 NEXT STREAK MILESTONES</p>
          <div className="flex justify-around">
            {[14, 30, 60].map(target => {
              const pct = Math.min(100, Math.round((streakInfo.current / target) * 100));
              const remaining = Math.max(0, target - streakInfo.current);
              return (
                <div key={target} className="text-center">
                  <CircularProgress value={pct} max={100} size={56} strokeWidth={4}
                    color={pct >= 100 ? 'hsl(var(--secondary))' : 'hsl(var(--primary))'} />
                  <p className="text-xs font-bold font-mono text-foreground mt-1">{target}d</p>
                  <p className="text-[9px] text-muted-foreground">{remaining > 0 ? `${remaining} more days` : '✅ Achieved!'}</p>
                </div>
              );
            })}
          </div>
        </GlowCard>
      </motion.div>

      {/* ── Quick Log FAB ── */}
      <QuickLogSheet open={logOpen} onClose={() => setLogOpen(false)} dailyLogs={dailyLogs} subjects={subjects} onUpdate={onUpdate} activeDate={activeDate} trackingMode={trackingMode} onCreateSession={onCreateSession} />
      <Button onClick={() => setLogOpen(true)} size="icon" aria-label="Quick Log"
        className="fixed bottom-24 left-4 lg:bottom-6 lg:left-[280px] z-[56] w-12 h-12 rounded-full shadow-lg shadow-accent/20 bg-accent hover:bg-accent/90 text-accent-foreground hover:scale-105 active:scale-95">
        <Plus className="w-5 h-5" />
      </Button>
    </motion.div>
  );
}

function TargetCard({ icon, title, done, goal }: { icon: string; title: string; done: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  const remaining = Math.max(0, goal - done);
  return (
    <GlowCard className="p-4" paper>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{title}</span>
        </div>
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className="text-2xl font-black font-mono text-foreground">{done}</span>
        <span className="text-sm text-muted-foreground font-mono">/ {goal}</span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-muted-foreground">{remaining > 0 ? `${remaining} more to go` : '✅ Goal reached!'}</span>
        <span className={`text-xs font-bold font-mono ${pct >= 100 ? 'text-secondary' : pct >= 50 ? 'text-primary' : 'text-destructive'}`}>{pct}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted/30 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-secondary' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
      </div>
    </GlowCard>
  );
}

function StatPill({ value, label, color }: { value: number; label: string; color: string }) {
  const bg: Record<string, string> = { primary: 'bg-primary/10 border-primary/20', accent: 'bg-accent/10 border-accent/20', secondary: 'bg-secondary/10 border-secondary/20' };
  const txt: Record<string, string> = { primary: 'text-primary', accent: 'text-accent', secondary: 'text-secondary' };
  return (
    <div className={`rounded-xl border p-3 text-center ${bg[color]}`}>
      <p className={`text-xl font-black font-mono ${txt[color]}`}>{value}</p>
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

function QuickLogSheet({ open, onClose, dailyLogs, subjects, onUpdate, activeDate, trackingMode, onCreateSession }: {
  open: boolean; onClose: () => void; dailyLogs: DailyLog[]; subjects: Subject[]; onUpdate: (l: DailyLog[]) => void; activeDate: string; trackingMode: TrackingMode;
  onCreateSession?: (session: { date: string; minutes: number; description: string; type: 'Topic' | 'Unit' | 'Other'; subjectId?: string; subjectName?: string; startTime?: string; endTime?: string; note?: string }) => void;
}) {
  const log = dailyLogs.find(l => l.date === activeDate);
  const [hours, setHours] = useState(1);
  const [mins, setMins] = useState(0);
  const [mood, setMood] = useState<DailyLog['mood'] | undefined>(log?.mood);
  const [subjectFocus, setSubjectFocus] = useState('');
  const [notes, setNotes] = useState('');

  const save = useCallback(() => {
    const targetDate = activeDate;
    const totalMins = hours * 60 + mins;
    if (totalMins <= 0) { toast.error('Add some time first'); return; }

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Update mood/notes/subjectFocus on the daily log (day-level metadata)
    let updated = dailyLogs.map(l => l.date !== targetDate ? l : {
      ...l,
      ...(mood ? { mood } : {}),
      subjectFocus: subjectFocus || l.subjectFocus,
      notes: notes || l.notes,
    });
    if (!dailyLogs.find(l => l.date === targetDate)) {
      updated = [...updated, { date: targetDate, hoursStudied: 0, topicsCompleted: 0, ...(mood ? { mood } : {}), subjectFocus, notes, sessions: [] } as any];
    }
    onUpdate(updated);

    // Create a first-class study session
    if (onCreateSession) {
      onCreateSession({
        date: targetDate,
        minutes: totalMins,
        description: `[Quick Log] ${subjectFocus || 'Study Session'}`,
        type: 'Other',
        subjectId: subjects.find(s => s.shortName === subjectFocus)?.id || '',
        subjectName: subjectFocus || '',
        startTime: timeStr,
        note: notes || undefined,
      });
    }

    toast.success(`Logged ${formatStudyTime(hours * 60 + mins)} for ${targetDate === getLocalDateStr() ? 'today' : targetDate}!`);
    onClose();
  }, [dailyLogs, hours, mins, mood, subjectFocus, notes, onUpdate, onClose, activeDate, onCreateSession, subjects]);

  return (
    <BottomSheet open={open} onClose={onClose} title="📝 Quick Log">
      <div className="space-y-4 pt-2">
        <div>
          <p className="text-xs text-muted-foreground mb-2">Study Time</p>
          <div className="flex items-center gap-3 justify-center">
            <Button variant="outline" size="icon" className="w-10 h-10 text-lg font-bold" onClick={() => setHours(Math.max(0, hours - 1))}>−</Button>
            <span className="text-2xl font-bold font-mono text-foreground">{hours}h {String(mins).padStart(2, '0')}m</span>
            <Button variant="outline" size="icon" className="w-10 h-10 text-lg font-bold" onClick={() => setHours(hours + 1)}>+</Button>
          </div>
          <div className="flex justify-center gap-2 mt-2">
            {[0, 15, 30, 45].map(m => (
              <Button key={m} variant={mins === m ? 'default' : 'outline'} size="sm"
                onClick={() => setMins(m)} className="font-mono text-xs">
                :{String(m).padStart(2, '0')}
              </Button>
            ))}
          </div>
        </div>
        {subjects.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Subject</p>
            <div className="flex flex-wrap gap-1.5">
              {subjects.map(s => (
                <button key={s.id} onClick={() => setSubjectFocus(s.shortName)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs border ${subjectFocus === s.shortName ? 'bg-primary/15 text-primary border-primary/25' : 'bg-card/30 text-muted-foreground border-border/15'}`}>
                  {s.shortName}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground">Mood</p>
            {mood && (
              <button onClick={() => setMood(undefined)} className="text-[10px] text-destructive/70 font-bold hover:text-destructive transition-colors">
                ✕ Clear
              </button>
            )}
          </div>
          <div className="flex justify-center gap-2">
            {([
              { value: 'Sad' as const, emoji: '😔', label: 'Sad' },
              { value: 'Tired' as const, emoji: '😴', label: 'Tired' },
              { value: 'Okay' as const, emoji: '😐', label: 'Okay' },
              { value: 'Happy' as const, emoji: '😊', label: 'Happy' },
              { value: 'Motivated' as const, emoji: '🔥', label: 'Motivated' },
            ]).map(m => (
              <button key={m.value} onClick={() => setMood(m.value)}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border-2 transition-all ${
                  mood === m.value
                    ? 'bg-primary/15 border-primary/40 scale-110'
                    : 'bg-card/30 border-border/15 hover:bg-muted/30'
                }`}>
                <span className="text-xl">{m.emoji}</span>
                <span className="text-[9px] font-bold text-muted-foreground">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
        <Button onClick={save} className="w-full h-12 text-sm font-semibold gap-2">
          <Save className="w-4 h-4" /> Save Log
        </Button>
      </div>
    </BottomSheet>
  );
}
