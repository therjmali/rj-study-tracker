import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw, Coffee, Brain, Zap, BookOpen, Flame, Clock, Save, SkipForward, NotebookPen } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { useTimer } from '../contexts/TimerContext';
import { useTimerTick } from '../hooks/useGlobalTimer';
import { useFocusLog } from '../platform/focusLog';
import type { PomodoroSettings, Subject } from '../types';
import type { TimerAppMode, TimerPhase } from '../hooks/useGlobalTimer';

const PHASES: Record<TimerPhase, { label: string; icon: React.ReactNode; color: string; stroke: string }> = {
  focus: { label: 'Focus', icon: <Brain className="w-4 h-4" />, color: 'text-primary', stroke: 'hsl(var(--primary))' },
  short: { label: 'Short Break', icon: <Coffee className="w-4 h-4" />, color: 'text-secondary', stroke: 'hsl(var(--secondary))' },
  long: { label: 'Long Break', icon: <Zap className="w-4 h-4" />, color: 'text-accent', stroke: 'hsl(var(--accent))' },
};

/** The three ways to use the one Focus Timer — same names and icons everywhere in the app. */
export const TIMER_MODES: { id: TimerAppMode; icon: string; label: string; hint: string }[] = [
  { id: 'pomodoro', icon: '🍅', label: 'Pomodoro', hint: 'Focus blocks with automatic breaks' },
  { id: 'countdown', icon: '⏳', label: 'Countdown', hint: 'One block of any length, no breaks' },
  { id: 'stopwatch', icon: '⏱️', label: 'Stopwatch', hint: 'Open-ended — counts up until you stop' },
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
  onSessionComplete?: (data: { minutes: number; subjectId?: string; unitId?: string; topicId?: string }) => void;
  settings: PomodoroSettings;
  subjects?: Subject[];
  initialSubjectId?: string;
  initialUnitId?: string;
  initialTopicId?: string;
}

export default function FocusTimer({ settings, subjects = [], initialSubjectId, initialUnitId, initialTopicId }: Props) {
  const { state: timer, actions } = useTimer();
  const { timeLeft, swTime } = useTimerTick();
  const initDone = useRef(false);
  const noteRef = useRef<HTMLInputElement>(null);
  const log = useFocusLog();

  // Pre-fill on mount when launched from a topic
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    if (initialSubjectId) {
      const s = subjects.find(x => x.id === initialSubjectId);
      const u = initialUnitId ? s?.units.find(x => x.id === initialUnitId) : undefined;
      const t = initialTopicId ? u?.subTopics.find(x => x.id === initialTopicId) : undefined;
      actions.linkTopic(initialSubjectId, initialUnitId || '', initialTopicId || '', t?.name || '', s?.name || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The "Notes" button on the notification opens this sheet and focuses the note field.
  useEffect(() => {
    const focus = () => setTimeout(() => noteRef.current?.focus(), 80);
    window.addEventListener('rj:focus-note', focus);
    return () => window.removeEventListener('rj:focus-note', focus);
  }, []);

  const selectedSubject = useMemo(() => subjects.find(s => s.id === timer.subjectId), [subjects, timer.subjectId]);
  const selectedUnit = useMemo(() => selectedSubject?.units.find(u => u.id === timer.unitId), [selectedSubject, timer.unitId]);

  const studyingLabel = useMemo(() => {
    if (timer.topicName && timer.subjectName) return `${timer.topicName} — ${timer.subjectName}`;
    if (timer.subjectName) return timer.subjectName;
    return '';
  }, [timer.topicName, timer.subjectName]);

  const isPreLinked = !!(initialSubjectId && initialTopicId);
  const isStopwatch = timer.appMode === 'stopwatch';
  const isPomodoro = timer.appMode === 'pomodoro';
  const isBreak = isPomodoro && timer.phase !== 'focus';
  const locked = timer.active || timer.hasProgress;

  const totalSec = isStopwatch ? 0
    : timer.appMode === 'countdown' ? timer.focusDuration * 60
    : (timer.phase === 'focus' ? timer.focusDuration : timer.phase === 'short' ? settings.shortBreakMin : settings.longBreakMin) * 60;

  const displaySec = isStopwatch ? swTime : timeLeft;
  const elapsedSec = isStopwatch ? swTime : Math.max(0, totalSec - timeLeft);
  const pct = isStopwatch ? ((swTime % 3600) / 3600) * 100 : totalSec > 0 ? (elapsedSec / totalSec) * 100 : 0;

  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (Math.min(100, pct) / 100) * circumference;
  const subjectColor = selectedSubject?.color;
  const strokeColor = subjectColor || (isStopwatch ? 'hsl(var(--primary))' : isPomodoro ? PHASES[timer.phase].stroke : 'hsl(var(--accent))');

  const canSave = !isBreak && elapsedSec >= 30 && locked;
  const saveMinutes = Math.max(1, Math.round(elapsedSec / 60));

  const statusLine = timer.active
    ? (isStopwatch
      ? (timer.sessionStartedAt ? `Started at ${atClock(timer.sessionStartedAt)}` : 'Running')
      : `Ends at ${atClock(Date.now() + timeLeft * 1000)}`)
    : timer.hasProgress ? 'Paused' : TIMER_MODES.find(m => m.id === timer.appMode)?.hint ?? '';

  const todayMinutes = log.reduce((a, e) => a + e.minutes, 0);

  const handleSubjectChange = (id: string) => {
    const s = subjects.find(x => x.id === id);
    actions.setSubjectId(id);
    if (s) actions.setSubjectName(s.name);
  };
  const handleUnitChange = (id: string) => { actions.setUnitId(id); };
  const handleTopicChange = (id: string) => {
    const t = selectedUnit?.subTopics.find(x => x.id === id);
    actions.setTopicId(id, t?.name);
  };

  const primaryLabel = timer.active ? 'Pause' : timer.hasProgress ? 'Resume' : 'Start';

  return (
    <div className="space-y-4">
      {/* Mode selector — the one place where Pomodoro / Countdown / Stopwatch are chosen */}
      <div role="tablist" aria-label="Timer mode" className="grid grid-cols-3 gap-1.5 rounded-2xl border border-border/20 bg-card/40 p-1">
        {TIMER_MODES.map(m => {
          const on = timer.appMode === m.id;
          return (
            <button key={m.id} role="tab" aria-selected={on} onClick={() => actions.setAppMode(m.id)}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-bold transition-all ${
                on ? 'bg-primary text-primary-foreground shadow-sm' : locked ? 'text-muted-foreground/50' : 'text-muted-foreground hover:text-foreground'}`}>
              <span className="text-base leading-none">{m.icon}</span>
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Subject/Topic Link */}
      {subjects.length > 0 && (
        isPreLinked ? (
          <div className="rounded-xl border bg-card/50 p-3" style={{ borderColor: subjectColor ? subjectColor + '30' : undefined }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border" style={{ backgroundColor: (subjectColor || 'hsl(var(--primary))') + '15', borderColor: (subjectColor || 'hsl(var(--primary))') + '25' }}>
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
          <SubjectSelector
            subjects={subjects}
            subjectId={timer.subjectId}
            unitId={timer.unitId}
            topicId={timer.topicId}
            selectedSubject={selectedSubject}
            selectedUnit={selectedUnit}
            studyingLabel={studyingLabel}
            onSubjectChange={handleSubjectChange}
            onUnitChange={handleUnitChange}
            onTopicChange={handleTopicChange}
          />
        )
      )}

      {/* ═══ UNIFIED CIRCULAR RING ═══ */}
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
            {[0, 90, 180, 270].map(deg => (
              <line key={deg} x1="60" y1="3" x2="60" y2="6" transform={`rotate(${deg} 60 60)`}
                stroke="hsl(var(--muted-foreground) / 0.2)" strokeWidth="1" />
            ))}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span className="text-[11px] font-bold text-muted-foreground mb-1">
              {TIMER_MODES.find(m => m.id === timer.appMode)?.icon} {isPomodoro ? PHASES[timer.phase].label : TIMER_MODES.find(m => m.id === timer.appMode)?.label}
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

      {/* Length presets (Pomodoro focus + Countdown) */}
      {!isStopwatch && !isBreak && (
        <div className="flex flex-wrap gap-2 items-center justify-center">
          {TIMER_PRESETS.map(p => (
            <button key={p} onClick={() => actions.selectPreset(p)}
              className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-all ${timer.focusDuration === p ? 'bg-primary/20 text-primary border-primary/40 shadow-sm' : 'bg-card/30 text-foreground/70 border-border/20 hover:bg-card/50'} ${locked && timer.focusDuration !== p ? 'opacity-50' : ''}`}>
              {p >= 60 && p % 60 === 0 ? `${p / 60}h` : `${p}m`}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <Input type="number" inputMode="numeric" min={1} max={480} value={timer.customMinutes || ''}
              onChange={e => actions.setCustomMinutes(+e.target.value)}
              onBlur={() => actions.applyCustom()} onKeyDown={e => e.key === 'Enter' && actions.applyCustom()}
              aria-label="Custom minutes"
              className="w-16 h-9 text-sm font-bold text-center bg-card/40 border-border/20" />
            <span className="text-xs font-bold text-foreground/50">min</span>
          </div>
        </div>
      )}

      {/* Pomodoro phase switcher */}
      {isPomodoro && (
        <div className="flex justify-center gap-2">
          {(['focus', 'short', 'long'] as TimerPhase[]).map(m => (
            <Button key={m} variant={timer.phase === m ? 'default' : 'outline'} size="sm" onClick={() => actions.switchPhase(m)}
              className="gap-1.5 text-xs font-bold">
              {PHASES[m].icon} {PHASES[m].label}
            </Button>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-center items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => actions.reset()} disabled={!locked}
          aria-label="Reset timer" className="w-12 h-12 rounded-xl">
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
          <Button variant="destructive" onClick={() => actions.stopAndSave()} className="h-12 rounded-xl gap-1.5 font-bold">
            <Save className="w-4 h-4" /> Save {saveMinutes}m
          </Button>
        ) : null}
      </div>

      {timer.topicId && (
        <button type="button" onClick={() => window.dispatchEvent(new Event('rj:open-running-topic'))}
          className="mx-auto flex items-center gap-1.5 text-xs font-bold text-primary">
          <BookOpen className="w-3.5 h-3.5" /> Open topic window
        </button>
      )}

      {/* Session note */}
      {!isBreak && (
        <div className="flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 px-3">
          <NotebookPen className="w-4 h-4 text-muted-foreground shrink-0" />
          <input ref={noteRef} value={timer.note} onChange={e => actions.setNote(e.target.value)}
            placeholder="Session note (optional)" maxLength={500}
            className="flex-1 h-10 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60" />
        </div>
      )}

      {/* ═══ TODAY ═══ */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox icon="✅" value={`${log.length}`} label="Sessions today" />
        <StatBox icon="⏱️" value={fmtDuration(todayMinutes)} label="Focused today" />
        <StatBox icon="🔥" value={`${timer.sessions}`} label="Streak" />
      </div>

      {log.length > 0 && (
        <div className="rounded-xl border border-border/15 bg-card/30 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold text-foreground/70">Today&apos;s Sessions</span>
            <span className="text-[9px] font-bold text-primary ml-auto">{log.length} saved</span>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto scrollbar-hide">
            {log.slice(-8).reverse().map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground font-mono w-12">{s.time}</span>
                <span className="shrink-0">{TIMER_MODES.find(m => m.id === s.mode)?.icon}</span>
                <span className="font-bold text-foreground truncate">{s.label}</span>
                <span className="font-mono text-muted-foreground ml-auto">{fmtDuration(s.minutes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border/15 bg-card/30 p-3 text-center">
      <span className="text-sm">{icon}</span>
      <p className="text-xl font-black font-mono text-foreground leading-none mt-0.5">{value}</p>
      <p className="text-[10px] font-bold text-foreground/60 mt-0.5">{label}</p>
    </div>
  );
}

function SubjectSelector({ subjects, subjectId, unitId, topicId, selectedSubject, selectedUnit, studyingLabel, onSubjectChange, onUnitChange, onTopicChange }: {
  subjects: Subject[];
  subjectId: string; unitId: string; topicId: string;
  selectedSubject?: Subject; selectedUnit?: import('../types').Unit;
  studyingLabel: string;
  onSubjectChange: (id: string) => void;
  onUnitChange: (id: string) => void;
  onTopicChange: (id: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border/20 bg-card/30 p-3">
      <p className="text-xs font-bold text-foreground/80">📚 Link to Subject & Topic</p>
      <Select value={subjectId} onValueChange={onSubjectChange}>
        <SelectTrigger className="h-9 text-sm font-semibold bg-card/50 border-border/20">
          <SelectValue placeholder="Select Subject..." />
        </SelectTrigger>
        <SelectContent>
          {subjects.map(s => (
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
        <Select value={unitId} onValueChange={onUnitChange}>
          <SelectTrigger className="h-9 text-sm font-semibold bg-card/50 border-border/20">
            <SelectValue placeholder="Select Unit..." />
          </SelectTrigger>
          <SelectContent>
            {selectedSubject.units.map((u, i) => (
              <SelectItem key={u.id} value={u.id}>Unit {i + 1}: {u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {selectedUnit && selectedUnit.subTopics.length > 0 && (
        <Select value={topicId} onValueChange={onTopicChange}>
          <SelectTrigger className="h-9 text-sm font-semibold bg-card/50 border-border/20">
            <SelectValue placeholder="Select Topic..." />
          </SelectTrigger>
          <SelectContent>
            {selectedUnit.subTopics.filter(t => !t.completed).map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {studyingLabel && <p className="text-xs font-bold text-primary truncate">📖 {studyingLabel}</p>}
    </div>
  );
}
