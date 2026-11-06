import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, X, ChevronUp, ChevronDown, Clock, Target, Flame, Sparkles, Maximize2, Smartphone } from 'lucide-react';
import { useTimerTick } from '../../hooks/useGlobalTimer';
import type { GlobalTimerState } from '../../hooks/useGlobalTimer';
import type { Subject, DailyLog, StudyGoals } from '../../types';
import { getLocalDateStr, formatStudyTime } from '../../lib/utils';

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

interface Props {
  timer: GlobalTimerState;
  subjects: Subject[];
  dailyLogs: DailyLog[];
  studyGoals: StudyGoals;
  onOpenFocusTimer: () => void;
  onOpenWidgetManager?: () => void;
  onToggleTimer?: () => void;
  onQuickLog15?: () => void;
  streakDays?: number;
}

export default function FloatingWidgetHub({
  timer,
  subjects,
  dailyLogs,
  studyGoals,
  onOpenFocusTimer,
  onOpenWidgetManager,
  onToggleTimer,
  streakDays = 0,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const { timeLeft, swTime } = useTimerTick();

  const today = getLocalDateStr();

  // Compute today's topics and minutes
  const { todayTopicsDone, todayMinutes } = useMemo(() => {
    let topics = 0;
    let mins = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate === today) topics++;
      if (t.timeEntries) {
        t.timeEntries.forEach(e => {
          if (e.date === today) mins += e.minutes;
        });
      }
    })));
    return { todayTopicsDone: topics, todayMinutes: mins };
  }, [subjects, today]);

  const targetTopics = studyGoals?.dailyTopics || 5;
  const targetMinutes = Math.round((studyGoals?.dailyHours || 3) * 60);
  const topicPct = Math.min(100, Math.round((todayTopicsDone / targetTopics) * 100));
  const timePct = Math.min(100, Math.round((todayMinutes / targetMinutes) * 100));

  const isStopwatch = timer.appMode === 'stopwatch';
  const displayTimer = isStopwatch ? fmt(swTime) : fmt(timeLeft);

  if (minimized) {
    return (
      <motion.button
        drag
        dragMomentum={false}
        onClick={() => setMinimized(false)}
        className="fixed bottom-24 right-4 z-40 p-2 rounded-full bg-primary text-primary-foreground shadow-2xl border border-white/20 active:scale-95"
        title="Restore Floating Study Hub"
      >
        <Sparkles className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
      </motion.button>
    );
  }

  return (
    <div className="fixed bottom-20 sm:bottom-24 right-3 sm:right-6 z-40 select-none">
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            className="w-72 sm:w-80 rounded-3xl border border-white/15 bg-card/90 backdrop-blur-2xl shadow-2xl overflow-hidden p-4 space-y-3"
            style={{
              background: 'radial-gradient(120% 120% at 100% 0%, hsl(var(--card) / 0.95), hsl(var(--card) / 0.88))',
              boxShadow: '0 20px 50px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border/15">
              <div className="flex items-center gap-1.5">
                <span className="text-base">⚡</span>
                <span className="text-xs font-black text-foreground uppercase tracking-wider">Live Study Widget</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  aria-label="Minimize to pill"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Timer Strip */}
            <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-wider text-primary truncate">
                  {timer.active ? '● Running Session' : timer.hasProgress ? '❚❚ Paused' : 'Focus Timer'}
                </p>
                <p className="text-2xl font-black font-mono text-foreground tracking-tight">{displayTimer}</p>
                {timer.topicName && (
                  <p className="text-[10px] text-muted-foreground truncate">{timer.topicName}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {timer.active ? (
                  <button
                    onClick={() => onToggleTimer?.()}
                    className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center active:scale-90 transition-transform shadow-md"
                    title="Pause"
                  >
                    <Pause className="w-4 h-4" />
                  </button>
                ) : timer.hasProgress ? (
                  <button
                    onClick={() => onToggleTimer?.()}
                    className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center active:scale-90 transition-transform shadow-md"
                    title="Resume"
                  >
                    <Play className="w-4 h-4 ml-0.5" />
                  </button>
                ) : (
                  <button
                    onClick={onOpenFocusTimer}
                    className="w-9 h-9 rounded-xl bg-primary/20 text-primary border border-primary/30 flex items-center justify-center active:scale-90 transition-transform"
                    title="Open Timer"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Today's Goal Strip */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-border/15 bg-card/60 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                    <Target className="w-3 h-3 text-emerald-500" /> Topics
                  </span>
                  <span className="text-[9px] font-mono font-black text-emerald-500">{topicPct}%</span>
                </div>
                <p className="text-base font-black font-mono text-foreground mt-0.5">{todayTopicsDone}<span className="text-xs text-muted-foreground font-semibold">/{targetTopics}</span></p>
                <div className="w-full h-1.5 rounded-full bg-muted/30 mt-1.5 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${topicPct}%` }} />
                </div>
              </div>

              <div className="rounded-2xl border border-border/15 bg-card/60 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                    <Flame className="w-3 h-3 text-chart-4" /> Streak
                  </span>
                  <span className="text-[9px] font-mono font-black text-chart-4">{streakDays}d</span>
                </div>
                <p className="text-base font-black font-mono text-foreground mt-0.5">{formatStudyTime(todayMinutes)}</p>
                <div className="w-full h-1.5 rounded-full bg-muted/30 mt-1.5 overflow-hidden">
                  <div className="h-full rounded-full bg-chart-4 transition-all duration-500" style={{ width: `${timePct}%` }} />
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={onOpenFocusTimer}
                className="flex-1 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-primary/20 active:scale-95 transition-all"
              >
                <Maximize2 className="w-3.5 h-3.5" /> Full Focus Timer
              </button>
              {onOpenWidgetManager && (
                <button
                  onClick={onOpenWidgetManager}
                  className="h-9 px-3 rounded-xl bg-muted/40 border border-border/20 text-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-muted/60 active:scale-95 transition-all"
                  title="Add Android Home Screen Widgets"
                >
                  <Smartphone className="w-3.5 h-3.5 text-primary" /> Widgets
                </button>
              )}
            </div>
          </motion.div>
        ) : (
          /* Collapsed Floating Pill */
          <motion.button
            drag
            dragMomentum={false}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-full border border-white/15 bg-card/85 backdrop-blur-xl shadow-xl active:cursor-grabbing cursor-grab"
            style={{
              boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)',
            }}
          >
            {/* Live Timer status */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${timer.active ? 'bg-emerald-500 animate-pulse' : 'bg-primary'}`} />
              <span className="text-xs font-black font-mono text-foreground">{displayTimer}</span>
            </div>

            {/* Divider */}
            <div className="w-px h-3.5 bg-border/25" />

            {/* Goals mini counter */}
            <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
              <Target className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-mono text-foreground">{todayTopicsDone}/{targetTopics}</span>
            </div>

            {/* Flame */}
            {streakDays > 0 && (
              <>
                <div className="w-px h-3.5 bg-border/25" />
                <div className="flex items-center gap-0.5 text-[11px] font-bold text-chart-4">
                  <Flame className="w-3.5 h-3.5" />
                  <span className="font-mono">{streakDays}</span>
                </div>
              </>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
