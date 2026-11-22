import { motion } from 'framer-motion';
import { RotateCcw, Save, Play, Pause, ExternalLink } from 'lucide-react';
import type { RevisionKey } from '../../types';
import { useTimer } from '../../contexts/TimerContext';
import { useTimerTick } from '../../hooks/useGlobalTimer';

/**
 * THE study timer: Stopwatch (left) · Countdown (right), presets, flip clock, Start / Pause / Save.
 * One component for every place that studies with a timer — the topic window, the Revision window and
 * Add Study Time — so they look, behave and save identically.
 */
export interface TimerTarget {
  subjectId: string;
  unitId: string;
  topicId: string;
  /** Name shown in notifications / "busy elsewhere" ('' for a free session). */
  topicName: string;
  subjectName: string;
  revisionKey?: RevisionKey | '';
  /** Add Study Time activity (MCQ, Lecture …) — saved on the session. */
  activity?: string;
}

const MODES = [
  { id: 'stopwatch', label: 'Stopwatch', hint: 'counts up' },
  { id: 'countdown', label: 'Countdown', hint: 'counts down' },
] as const;
const PRESETS = [25, 30, 45, 60];

const fmtClock = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
};

function Digit({ v }: { v: string }) {
  return (
    <span className="relative inline-flex w-[34px] h-[46px] items-center justify-center rounded-xl text-[26px] font-black font-mono text-background tabular-nums"
      style={{ background: 'linear-gradient(180deg, hsl(var(--foreground)/0.95) 0%, hsl(var(--foreground)/0.86) 49.5%, hsl(var(--foreground)/0.74) 50.5%, hsl(var(--foreground)/0.8) 100%)', boxShadow: '0 4px 12px hsl(var(--foreground)/0.15), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
      {v}
      <span className="absolute left-0 right-0 top-1/2 h-px bg-background/10" />
    </span>
  );
}

/** The ticking part lives alone so nothing else re-renders every second. */
function ClockFace({ stopwatch, accent }: { stopwatch: boolean; accent: boolean }) {
  const { timeLeft, swTime } = useTimerTick();
  const txt = fmtClock(stopwatch ? swTime : timeLeft);
  const parts = txt.split(':');
  return (
    <div className={`flex items-center justify-center gap-1 py-1 transition-opacity ${accent ? 'opacity-100' : 'opacity-70'}`} role="timer" aria-live="off" aria-label={txt}>
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="flex flex-col gap-1.5 px-0.5"><i className="w-1.5 h-1.5 rounded-full bg-foreground/65" /><i className="w-1.5 h-1.5 rounded-full bg-foreground/65" /></span>}
          <Digit v={p[0] ?? '0'} /><Digit v={p[1] ?? '0'} />
        </span>
      ))}
    </div>
  );
}

function SaveButton({ stopwatch, enabled, onSave }: { stopwatch: boolean; enabled: boolean; onSave: () => void }) {
  const { timeLeft, swTime } = useTimerTick();
  const { state: timer } = useTimer();
  const elapsed = stopwatch ? swTime : Math.max(0, (!timer.cycle || timer.phase === 'focus' ? timer.focusDuration * 60 : 0) - timeLeft);
  if (!enabled || elapsed < 30) return null;
  return (
    <motion.button type="button" whileTap={{ scale: 0.93 }} onClick={onSave}
      className="h-11 px-5 rounded-full bg-secondary text-secondary-foreground text-sm font-bold flex items-center gap-2"
      style={{ boxShadow: '0 4px 16px hsl(var(--secondary) / 0.3)' }}>
      <Save className="w-4 h-4" /> Save {Math.max(1, Math.round(elapsed / 60))}m
    </motion.button>
  );
}

/** Is the global timer working on THIS target, and what should a status chip say? */
export function useTargetTimer(target: TimerTarget) {
  const { state: timer, actions: ta } = useTimer();
  const busy = timer.active || timer.hasProgress;
  const isThis = timer.subjectId === target.subjectId && timer.unitId === target.unitId && timer.topicId === target.topicId
    && (timer.revisionKey || '') === (target.revisionKey || '');
  const runningOther = busy && !isThis;
  const statusLabel = runningOther ? 'Busy elsewhere' : timer.active && isThis ? 'Running' : timer.hasProgress && isThis ? 'Paused' : 'Ready';
  const statusTone = runningOther ? 'text-amber-600 bg-amber-500/10 border-amber-500/25'
    : timer.active && isThis ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25'
    : timer.hasProgress && isThis ? 'text-amber-600 bg-amber-500/10 border-amber-500/25'
    : 'text-muted-foreground bg-muted/20 border-border/15';
  return { timer, ta, busy, isThis, runningOther, statusLabel, statusTone };
}

export default function StudyTimerPanel({ target, onBeforeSave, onOpenFull, hint }: {
  target: TimerTarget;
  /** Called right before a running session is saved (the host flushes its unsaved draft first). */
  onBeforeSave?: () => void;
  onOpenFull?: () => void;
  /** Small line under the controls (e.g. "Saving marks R1 as Done"). */
  hint?: React.ReactNode;
}) {
  const { timer, ta, busy, isThis, runningOther } = useTargetTimer(target);
  const stopwatch = timer.appMode === 'stopwatch';
  const isBreak = timer.cycle && timer.phase !== 'focus';
  const primaryLabel = timer.active ? 'Pause' : timer.hasProgress ? 'Resume' : 'Start';
  const link = () => ta.linkTopic(target.subjectId, target.unitId, target.topicId, target.topicName, target.subjectName, target.revisionKey || '', target.activity || '');
  const onPrimary = () => {
    // (re)link on every start/resume so the latest subject / topic / activity choice is what gets saved
    if (!isThis || !timer.active) link();
    ta.toggle();
    navigator.vibrate?.(10);
  };
  const saveRunning = () => { onBeforeSave?.(); ta.stopAndSave(); };

  if (runningOther) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/6 px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-amber-600">Timer is running for another {timer.topicId ? 'topic' : 'session'}</p>
          <p className="text-xs text-foreground/60 truncate font-medium">{timer.topicName || timer.subjectName || 'Free study'}{timer.topicId && timer.revisionKey ? ` · ${timer.revisionKey} revision` : ''}{timer.activity ? ` · ${timer.activity}` : ''}</p>
        </div>
        <button type="button" onClick={() => { onBeforeSave?.(); ta.stopAndSave(); link(); }}
          className="text-[10px] px-3 py-1.5 rounded-xl bg-amber-500/12 text-amber-600 font-bold border border-amber-500/25 active:scale-95 transition">Save &amp; switch</button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5" onPointerDown={e => e.stopPropagation()}>
      {/* Left = Stopwatch, right = Countdown */}
      <div role="tablist" aria-label="Timer mode" className="relative grid grid-cols-2 rounded-2xl border border-border/20 bg-muted/20 p-0.5">
        {MODES.map(m => {
          const on = timer.appMode === m.id;
          return (
            <button key={m.id} type="button" role="tab" aria-selected={on} disabled={busy && !on} onClick={() => ta.setAppMode(m.id)}
              className={`relative z-10 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${on ? 'text-primary-foreground' : busy ? 'text-muted-foreground/40' : 'text-muted-foreground'}`}>
              {on && <motion.span layoutId="study-mode-pill" className="absolute inset-0 rounded-xl bg-primary shadow-sm -z-10" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
              {m.label}<span className="block text-[8px] font-semibold opacity-70 -mt-0.5">{m.hint}</span>
            </button>
          );
        })}
      </div>

      {!stopwatch && !isBreak && !busy && (
        <div className="flex gap-1.5">
          {PRESETS.map(p => (
            <button key={p} type="button" onClick={() => ta.selectPreset(p)}
              className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition-all active:scale-95 ${timer.focusDuration === p ? 'bg-primary/12 text-primary border-primary/30' : 'bg-card/30 text-foreground/60 border-border/15'}`}>{p}m</button>
          ))}
        </div>
      )}

      <ClockFace stopwatch={stopwatch} accent={busy && isThis} />

      {timer.cycle && !stopwatch && (
        <p className="text-center text-[10px] font-bold text-muted-foreground -mt-1">
          {timer.phase === 'focus' ? '🍅 Focus' : timer.phase === 'short' ? '☕ Short break' : '🌿 Long break'}{timer.sessions > 0 ? ` · ${timer.sessions} done today` : ''}
        </p>
      )}

      <div className="flex items-center justify-center gap-2.5">
        {busy && (
          <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => ta.reset()} aria-label="Reset timer"
            className="w-10 h-10 rounded-xl bg-muted/30 border border-border/15 flex items-center justify-center"><RotateCcw className="w-4 h-4 text-muted-foreground" /></motion.button>
        )}
        <motion.button type="button" whileTap={{ scale: 0.93 }} onClick={onPrimary}
          className="h-11 px-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2"
          style={{ boxShadow: '0 4px 16px hsl(var(--primary) / 0.35)' }}>
          {timer.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" fill="currentColor" />} {primaryLabel}
        </motion.button>
        <SaveButton stopwatch={stopwatch} enabled={isThis && busy && !isBreak} onSave={saveRunning} />
      </div>

      {hint && <div className="text-center text-[10px] font-semibold text-muted-foreground/70 -mt-0.5">{hint}</div>}

      <div className="flex items-center justify-between">
        {!stopwatch && !busy ? (
          <button type="button" role="switch" aria-checked={timer.cycle} onClick={() => ta.setCycle(!timer.cycle)}
            className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
            <span>🍅</span> Auto breaks
            <span className={`relative w-7 h-4 rounded-full transition-colors ${timer.cycle ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
              <span className={`absolute top-[2px] left-[2px] w-3 h-3 rounded-full bg-white shadow transition-transform ${timer.cycle ? 'translate-x-3' : ''}`} />
            </span>
          </button>
        ) : <span />}
        {onOpenFull && (
          <button type="button" onClick={onOpenFull} className="text-[10px] font-bold text-primary flex items-center gap-1">Full screen <ExternalLink className="w-3 h-3" /></button>
        )}
      </div>
    </div>
  );
}
