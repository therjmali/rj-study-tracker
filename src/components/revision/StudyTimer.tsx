/**
 * StudyTimer — embeddable Stopwatch / Countdown timer.
 *
 * The same component can be dropped into the Main Topics window and the
 * Revision Center. It is a thin UI over the app's single, app-wide timer
 * engine (`useGlobalTimer`): time is derived from wall-clock timestamps,
 * persisted to localStorage, and survives navigation, tabs and app kills.
 *
 * Background behavior: the timer is app-wide state, so swiping between topics
 * in the Revision Center does NOT stop or pause it — elapsed time keeps
 * accruing and is re-attributed to the newly selected topic via `linkTopic`
 * (StudyTimer re-links on mount via its `initial*` props). Pausing is
 * explicit (the pause button), because a revision sitting usually spans
 * several quick back-to-back rounds and auto-pausing would lose accrued
 * time on a casual flick.
 *
 * The parent owns persistence: `onSessionComplete` fires with the saved
 * session data (from `stopAndSave`) so the caller can log a RevisionSession,
 * a DbStudySession, update `topic.revisions[round]`, etc. A `save()` method
 * is exposed via ref so a parent can commit in-progress time on swipe.
 */
import React, { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Play, Pause, RotateCcw, Brain, Coffee, Zap, BookOpen, Flame, NotebookPen, Save as SaveIcon, SkipForward,
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { useTimer } from '../../contexts/TimerContext';
import { useTimerTick } from '../../hooks/useGlobalTimer';
import type { PomodoroSettings, Subject } from '../../types';
import type { TimerAppMode, TimerPhase, TimerSessionData } from '../../hooks/useGlobalTimer';
import { formatStudyTime } from '../../lib/utils';

interface StudyTimerRef {
  /** Stop and save the current session if it has ≥ 30s elapsed. Returns the saved data or null. */
  save: () => TimerSessionData | null;
}

const PHASES: Record<TimerPhase, { label: string; icon: React.ReactNode; stroke: string }> = {
  focus: { label: 'Focus', icon: <Brain className="w-4 h-4" />, stroke: 'hsl(var(--primary))' },
  short: { label: 'Short Break', icon: <Coffee className="w-4 h-4" />, stroke: 'hsl(var(--secondary))' },
  long: { label: 'Long Break', icon: <Zap className="w-4 h-4" />, stroke: 'hsl(var(--accent))' },
};

export const TIMER_MODES: { id: TimerAppMode; icon: string; label: string }[] = [
  { id: 'countdown', icon: '⏳', label: 'Countdown' },
  { id: 'stopwatch', icon: '⏱️', label: 'Stopwatch' },
];

export const TIMER_PRESETS = [15, 25, 30, 45, 60, 90];

export const fmtClock = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const fmtDuration = (mins: number) => {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const atClock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

interface Props {
  settings: PomodoroSettings;
  subjects?: Subject[];
  initialSubjectId?: string;
  initialUnitId?: string;
  initialTopicId?: string;
  /** Fired when the user saves a session (`stopAndSave` ≥ 30s). Parent persists it. */
  onSessionComplete?: (data: TimerSessionData) => void;
  className?: string;
}

const StudyTimer = React.forwardRef<StudyTimerRef, Props>(function StudyTimer({
  settings,
  subjects = [],
  initialSubjectId,
  initialUnitId,
  initialTopicId,
  onSessionComplete,
  className,
}: Props, ref) {
  const { state: timer, actions } = useTimer();
  const { timeLeft, swTime } = useTimerTick();
  const initDone = useRef(false);
  const noteRef = useRef<HTMLInputElement>(null);
  const onCompleteRef = useRef(onSessionComplete);
  onCompleteRef.current = onSessionComplete;

  useImperativeHandle(ref, () => ({
    save: () => actions.stopAndSave(),
  }));

  // Pre-fill on mount when launched from a topic / revision item
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    if (initialSubjectId) {
      const s = subjects.find((x) => x.id === initialSubjectId);
      const u = initialUnitId ? s?.units.find((x) => x.id === initialUnitId) : undefined;
      const t = initialTopicId ? u?.subTopics.find((x) => x.id === initialTopicId) : undefined;
      actions.linkTopic(initialSubjectId, initialUnitId || '', initialTopicId || '', t?.name || '', s?.name || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSubject = useMemo(() => subjects.find((s) => s.id === timer.subjectId), [subjects, timer.subjectId]);
  const selectedUnit = useMemo(() => selectedSubject?.units.find((u) => u.id === timer.unitId), [selectedSubject, timer.unitId]);

  const studyingLabel = useMemo(() => {
    if (timer.topicName && timer.subjectName) return `${timer.topicName} — ${timer.subjectName}`;
    if (timer.subjectName) return timer.subjectName;
    return '';
  }, [timer.topicName, timer.subjectName]);

  const isStopwatch = timer.appMode === 'stopwatch';
  const isCycle = timer.cycle;
  const isBreak = isCycle && timer.phase !== 'focus';
  const locked = timer.active || timer.hasProgress;

  const totalSec = isStopwatch ? 0
    : (!isCycle || timer.phase === 'focus' ? timer.focusDuration : timer.phase === 'short' ? settings.shortBreakMin : settings.longBreakMin) * 60;
  const displaySec = isStopwatch ? swTime : timeLeft;
  const elapsedSec = isStopwatch ? swTime : Math.max(0, totalSec - timeLeft);
  const pct = isStopwatch ? ((swTime % 3600) / 3600) * 100 : totalSec > 0 ? (elapsedSec / totalSec) * 100 : 0;

  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (Math.min(100, pct) / 100) * circumference;
  const subjectColor = selectedSubject?.color;
  const strokeColor = subjectColor || (isStopwatch ? 'hsl(var(--primary))' : isCycle ? PHASES[timer.phase].stroke : 'hsl(var(--accent))');

  const canSave = !isBreak && elapsedSec >= 30 && locked;
  const saveMinutes = Math.max(1, Math.round(elapsedSec / 60));

  const statusLine = timer.active
    ? (isStopwatch
      ? (timer.sessionStartedAt ? `Started at ${atClock(timer.sessionStartedAt)}` : 'Running')
      : `Ends at ${atClock(Date.now() + timeLeft * 1000)}`)
    : timer.hasProgress ? 'Paused'
    : isCycle ? 'Focus blocks with automatic breaks'
    : TIMER_MODES.find((m) => m.id === timer.appMode)?.label ?? '';

  const handleSubjectChange = (id: string) => {
    const s = subjects.find((x) => x.id === id);
    actions.setSubjectId(id);
    if (s) actions.setSubjectName(s.name);
  };
  const handleUnitChange = (id: string) => { actions.setUnitId(id); };
  const handleTopicChange = (id: string) => {
    const t = selectedUnit?.subTopics.find((x) => x.id === id);
    actions.setTopicId(id, t?.name);
  };

  const primaryLabel = timer.active ? 'Pause' : timer.hasProgress ? 'Resume' : 'Start';

  return (
    <div className={`space-y-4 ${className ?? ''}`}>
      {/* Mode selector */}
      <div role="tablist" aria-label="Timer mode" className="grid grid-cols-2 gap-1.5 rounded-2xl border border-border/20 bg-card/40 p-1">
        {TIMER_MODES.map((m) => {
          const on = timer.appMode === m.id;
          return (
            <button key={m.id} role="tab" aria-selected={on} onClick={() => actions.setAppMode(m.id)}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-bold transition-all ${on
                ? 'bg-primary text-primary-foreground shadow-sm'
                : locked ? 'text-muted-foreground/50' : 'text-muted-foreground hover:text-foreground'}`}>
              <span className="text-base leading-none">{m.icon}</span>
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Subject / topic link (a revision topic comes in pre-linked from RevisionCenter) */}
      {subjects.length > 0 && timer.subjectId ? (
        <div className="rounded-xl border bg-card/50 p-3" style={{ borderColor: subjectColor ? `${subjectColor}30` : undefined }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
              style={{ backgroundColor: (subjectColor || 'hsl(var(--primary))') + '15', borderColor: (subjectColor || 'hsl(var(--primary))') + '25' }}>
              <BookOpen className="w-4 h-4" style={{ color: subjectColor || 'hsl(var(--primary))' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Studying</p>
              <p className="text-sm font-black text-foreground truncate">{studyingLabel}</p>
              {selectedUnit && <p className="text-[10px] text-muted-foreground truncate">📂 {selectedUnit.name}</p>}
            </div>
          </div>
        </div>
      ) : (
        subjects.length > 0 && (
          <div className="space-y-2 rounded-xl border border-border/20 bg-card/30 p-3">
            <p className="text-xs font-bold text-foreground/80">📚 Link to Subject & Topic</p>
            <Select value={timer.subjectId} onValueChange={handleSubjectChange}>
              <SelectTrigger className="h-9 text-sm font-semibold bg-card/50 border-border/20"><SelectValue placeholder="Select Subject..." /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="font-semibold">{s.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSubject && selectedSubject.units.length > 0 && (
              <Select value={timer.unitId} onValueChange={handleUnitChange}>
                <SelectTrigger className="h-9 text-sm font-semibold bg-card/50 border-border/20"><SelectValue placeholder="Select Unit..." /></SelectTrigger>
                <SelectContent>
                  {selectedSubject.units.map((u, i) => (
                    <SelectItem key={u.id} value={u.id}>Unit {i + 1}: {u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedUnit && selectedUnit.subTopics.length > 0 && (
              <Select value={timer.topicId} onValueChange={handleTopicChange}>
                <SelectTrigger className="h-9 text-sm font-semibold bg-card/50 border-border/20"><SelectValue placeholder="Select Topic..." /></SelectTrigger>
                <SelectContent>
                  {selectedUnit.subTopics.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {studyingLabel && <p className="text-xs font-bold text-primary truncate">📖 {studyingLabel}</p>}
          </div>
        )
      )}

      {/* Unified circular ring */}
      <div className="flex justify-center">
        <div className="relative w-56 h-56">
          {timer.active && (
            <motion.div
              className="absolute inset-[-8px] rounded-full"
              animate={{ opacity: [0.15, 0.35, 0.15], scale: [0.97, 1.02, 0.97] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ background: `radial-gradient(circle, ${strokeColor}30 0%, transparent 70%)` }}
            />
          )}
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle cx="60" cy="60" r="54" fill="none" stroke="hsl(var(--muted) / 0.15)" strokeWidth="5" />
            <circle cx="60" cy="60" r="54" fill="none" stroke={strokeColor} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              className="transition-all duration-300"
              style={{ filter: timer.active ? `drop-shadow(0 0 8px ${strokeColor})` : 'none' }} />
            {[0, 90, 180, 270].map((deg) => (
              <line key={deg} x1="60" y1="3" x2="60" y2="6" transform={`rotate(${deg} 60 60)`}
                stroke="hsl(var(--muted-foreground) / 0.2)" strokeWidth="1" />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span className="text-[11px] font-bold text-muted-foreground mb-1">
              {isBreak ? (timer.phase === 'short' ? '☕' : '🌿') : TIMER_MODES.find((m) => m.id === timer.appMode)?.icon}
              {isCycle ? PHASES[timer.phase].label : TIMER_MODES.find((m) => m.id === timer.appMode)?.label}
            </span>
            <span className="text-4xl font-black font-mono text-foreground leading-none tracking-tight tabular-nums">
              {fmtClock(displaySec)}
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground mt-1.5 leading-tight">{statusLine}</span>
            {timer.sessions > 0 && (
              <div className="flex items-center gap-1 mt-1.5">
                <Flame className="w-3 h-3 text-chart-4" />
                <span className="text-[10px] font-black text-chart-4">{timer.sessions}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Length presets (Countdown) */}
      {!isStopwatch && !isBreak && (
        <div className="flex flex-wrap gap-2 items-center justify-center">
          {TIMER_PRESETS.map((p) => (
            <button key={p} onClick={() => actions.selectPreset(p)}
              className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-all ${timer.focusDuration === p ? 'bg-primary/20 text-primary border-primary/40 shadow-sm' : 'bg-card/30 text-foreground/70 border-border/20 hover:bg-card/50'} ${locked && timer.focusDuration !== p ? 'opacity-50' : ''}`}>
              {p >= 60 && p % 60 === 0 ? `${p / 60}h` : `${p}m`}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <Input type="number" inputMode="numeric" min={1} max={480} value={timer.customMinutes || ''}
              onChange={(e) => actions.setCustomMinutes(+e.target.value)}
              onBlur={() => actions.applyCustom()} onKeyDown={(e) => e.key === 'Enter' && actions.applyCustom()}
              aria-label="Custom minutes"
              className="w-16 h-9 text-sm font-bold text-center bg-card/40 border-border/20" />
            <span className="text-xs font-bold text-foreground/50">min</span>
          </div>
        </div>
      )}

      {/* Auto breaks (countdown only) */}
      {!isStopwatch && (
        <button type="button" role="switch" aria-checked={isCycle} onClick={() => actions.setCycle(!isCycle)}
          className={`w-full flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${isCycle ? 'border-primary/40 bg-primary/8' : 'border-border/20 bg-card/30'} ${locked ? 'opacity-60' : ''}`}>
          <span className="text-lg shrink-0">🍅</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] font-bold text-foreground">Auto breaks</span>
            <span className="block text-[10px] text-muted-foreground leading-snug">
              {isCycle ? `Short break after each block, long break every 4th (${settings.shortBreakMin} / ${settings.longBreakMin} min)` : 'Turn on for focus → break cycles'}
            </span>
          </span>
          <span className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${isCycle ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isCycle ? 'translate-x-4' : ''}`} />
          </span>
        </button>
      )}

      {/* Controls */}
      <div className="flex justify-center items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => actions.reset()} disabled={!locked} aria-label="Reset timer" className="w-12 h-12 rounded-xl">
          <RotateCcw className="w-5 h-5" />
        </Button>
        <Button size="lg" onClick={() => actions.toggle()}
          className="gap-2 px-10 h-12 text-base font-bold rounded-xl min-w-[9rem]"
          style={subjectColor ? { backgroundColor: subjectColor, color: '#fff' } : undefined}>
          {timer.active ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />} {primaryLabel}
        </Button>
        {isBreak && locked ? (
          <Button variant="outline" onClick={() => actions.stopAndSave()} className="h-12 rounded-xl gap-1.5 font-bold">
            <SkipForward className="w-4 h-4" /> Skip
          </Button>
        ) : canSave ? (
          <Button variant="destructive" onClick={handleSave} className="h-12 rounded-xl gap-1.5 font-bold">
            <SaveIcon className="w-4 h-4" /> Save {saveMinutes}m
          </Button>
        ) : null}
      </div>

      {/* Session note */}
      {!isBreak && (
        <div className="flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 px-3">
          <NotebookPen className="w-4 h-4 text-muted-foreground shrink-0" />
          <input ref={noteRef} value={timer.note} onChange={(e) => actions.setNote(e.target.value)}
            placeholder="Session note (optional)" maxLength={500}
            className="flex-1 h-10 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60" />
        </div>
      )}
    </div>
  );

  function handleSave() {
    const saved = actions.stopAndSave();
    if (saved && onCompleteRef.current) onCompleteRef.current(saved);
  }
});

export type { StudyTimerRef };
export default StudyTimer;
