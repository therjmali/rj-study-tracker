import { useState, useRef, useEffect, useMemo, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { PomodoroSettings } from '../types';

export type TimerAppMode = 'timer' | 'stopwatch';
export type TimerPhase = 'focus' | 'short' | 'long';

/**
 * Slow-changing timer state. Changes only when the user does something
 * (start, pause, switch mode, link a topic) — NOT every second.
 * The per-second values live in `useTimerTick()` so the whole app
 * no longer re-renders while a timer is running.
 */
export interface GlobalTimerState {
  appMode: TimerAppMode;
  phase: TimerPhase;
  running: boolean;
  focusDuration: number;
  customMinutes: number;
  swRunning: boolean;
  sessions: number;
  subjectId: string;
  unitId: string;
  topicId: string;
  topicName: string;
  subjectName: string;
}

/** Values that change every second while a timer runs. */
export interface TimerTick {
  timeLeft: number;
  swTime: number;
}

export interface GlobalTimerActions {
  setAppMode: (m: TimerAppMode) => void;
  switchPhase: (m: TimerPhase) => void;
  toggleTimer: () => void;
  resetTimer: () => void;
  selectPreset: (mins: number) => void;
  setCustomMinutes: (v: number) => void;
  applyCustom: () => void;
  toggleSw: () => void;
  resetSw: () => void;
  stopSw: () => void;
  linkTopic: (sId: string, uId: string, tId: string, tName: string, sName: string) => void;
  setSubjectId: (id: string) => void;
  setUnitId: (id: string) => void;
  setTopicId: (id: string, name?: string) => void;
  setSubjectName: (n: string) => void;
  clearLink: () => void;
}

/* ── Tiny external store for the ticking values ───────────────────── */
let tickValue: TimerTick = { timeLeft: 25 * 60, swTime: 0 };
const tickListeners = new Set<() => void>();

const tickStore = {
  get: () => tickValue,
  set(partial: Partial<TimerTick>) {
    const next = { ...tickValue, ...partial };
    if (next.timeLeft === tickValue.timeLeft && next.swTime === tickValue.swTime) return;
    tickValue = next;
    tickListeners.forEach(l => l());
  },
  /** Silent assignment (no notifications) — used once when the hook first mounts. */
  reset(v: TimerTick) { tickValue = v; },
  subscribe(l: () => void) {
    tickListeners.add(l);
    return () => { tickListeners.delete(l); };
  },
};

/** Read the current per-second values without subscribing (for effects). */
export function getTimerTick(): TimerTick { return tickStore.get(); }

/** Subscribe to the per-second timer values. Only components that show the time should call this. */
export function useTimerTick(): TimerTick {
  return useSyncExternalStore(tickStore.subscribe, tickStore.get, tickStore.get);
}

export function useGlobalTimer(
  settings: PomodoroSettings,
  onComplete: (data: { minutes: number; subjectId?: string; unitId?: string; topicId?: string }) => void,
): [GlobalTimerState, GlobalTimerActions] {
  const initRef = useRef(false);
  if (!initRef.current) {
    initRef.current = true;
    tickStore.reset({ timeLeft: settings.focusMin * 60, swTime: 0 });
  }

  const [appMode, setAppMode] = useState<TimerAppMode>('timer');
  const [phase, setPhase] = useState<TimerPhase>('focus');
  const [running, setRunning] = useState(false);
  const [focusDuration, setFocusDuration] = useState(settings.focusMin);
  const [customMinutes, setCustomMinutes] = useState(settings.focusMin);
  const [sessions, setSessions] = useState(0);
  const [swRunning, setSwRunning] = useState(false);

  const [subjectId, setSubjectId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [topicName, setTopicName] = useState('');
  const [subjectName, setSubjectName] = useState('');

  const setTimeLeft = (v: number) => tickStore.set({ timeLeft: v });
  const setSwTime = (v: number) => tickStore.set({ swTime: v });

  const startRef = useRef(0);
  const totalRef = useRef(0);
  const swStartRef = useRef(0);
  const swAccumRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Keep the latest settings reachable without re-creating the interval on every render
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const playBeep = () => {
    if (!settingsRef.current.soundEnabled) return;
    try {
      const ctx = audioRef.current || new AudioContext();
      audioRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 800; gain.gain.value = 0.3;
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch {}
  };

  // Timer tick
  useEffect(() => {
    if (!running || appMode !== 'timer') return;
    if (startRef.current === 0) {
      startRef.current = Date.now();
      totalRef.current = tickStore.get().timeLeft;
    }
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      const remaining = Math.max(0, totalRef.current - elapsed);
      setTimeLeft(remaining);
      if (remaining <= 0) {
        const s = settingsRef.current;
        setRunning(false);
        startRef.current = 0;
        playBeep();
        if (phase === 'focus') {
          setSessions(prev => {
            const n = prev + 1;
            onCompleteRef.current({
              minutes: focusDuration,
              subjectId: subjectId || undefined,
              unitId: unitId || undefined,
              topicId: topicId || undefined,
            });
            toast.success(`🍅 Focus #${n} done! +${focusDuration}min logged`);
            return n;
          });
          const shortDur = s.shortBreakMin * 60;
          const longDur = s.longBreakMin * 60;
          setSessions(prev => {
            const nextMode: TimerPhase = prev % 4 === 0 ? 'long' : 'short';
            const nextDur = nextMode === 'long' ? longDur : shortDur;
            setPhase(nextMode);
            setTimeLeft(nextDur);
            if (s.autoStartBreaks) {
              startRef.current = Date.now();
              totalRef.current = nextDur;
              setRunning(true);
            }
            return prev;
          });
        } else {
          toast.info("Break over! Time to focus.");
          setPhase('focus');
          setTimeLeft(focusDuration * 60);
        }
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, appMode, phase, focusDuration, subjectId, unitId, topicId]);

  // Stopwatch tick
  useEffect(() => {
    if (!swRunning || appMode !== 'stopwatch') return;
    if (swStartRef.current === 0) swStartRef.current = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - swStartRef.current) / 1000);
      setSwTime(swAccumRef.current + elapsed);
    }, 250);
    return () => clearInterval(id);
  }, [swRunning, appMode]);

  const actions: GlobalTimerActions = {
    setAppMode,
    switchPhase: (m) => {
      const s = settingsRef.current;
      setRunning(false);
      startRef.current = 0;
      setPhase(m);
      const dur = m === 'focus' ? focusDuration * 60 : m === 'short' ? s.shortBreakMin * 60 : s.longBreakMin * 60;
      setTimeLeft(dur);
    },
    toggleTimer: () => {
      if (running) {
        const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
        setTimeLeft(Math.max(0, totalRef.current - elapsed));
        startRef.current = 0;
        setRunning(false);
      } else {
        startRef.current = Date.now();
        totalRef.current = tickStore.get().timeLeft;
        setRunning(true);
      }
    },
    resetTimer: () => {
      const s = settingsRef.current;
      setRunning(false);
      startRef.current = 0;
      const dur = phase === 'focus' ? focusDuration * 60 : phase === 'short' ? s.shortBreakMin * 60 : s.longBreakMin * 60;
      setTimeLeft(dur);
    },
    selectPreset: (mins) => {
      setFocusDuration(mins);
      setCustomMinutes(mins);
      if (phase === 'focus' && !running) setTimeLeft(mins * 60);
    },
    setCustomMinutes,
    applyCustom: () => {
      const m = Math.max(1, Math.min(180, customMinutes));
      setFocusDuration(m);
      if (phase === 'focus' && !running) setTimeLeft(m * 60);
    },
    toggleSw: () => {
      if (swRunning) {
        swAccumRef.current = tickStore.get().swTime;
        swStartRef.current = 0;
        setSwRunning(false);
      } else {
        swStartRef.current = Date.now();
        setSwRunning(true);
      }
    },
    resetSw: () => {
      setSwRunning(false);
      setSwTime(0);
      swAccumRef.current = 0;
      swStartRef.current = 0;
    },
    stopSw: () => {
      setSwRunning(false);
      const swTime = tickStore.get().swTime;
      const totalMinutes = Math.max(1, Math.round(swTime / 60));
      if (swTime >= 60) {
        onCompleteRef.current({
          minutes: totalMinutes,
          subjectId: subjectId || undefined,
          unitId: unitId || undefined,
          topicId: topicId || undefined,
        });
        setSessions(s => s + 1);
        toast.success(`⏱️ Stopwatch: ${totalMinutes}min logged!`);
      }
      setSwTime(0);
      swAccumRef.current = 0;
      swStartRef.current = 0;
    },
    linkTopic: (sId, uId, tId, tName, sName) => {
      setSubjectId(sId);
      setUnitId(uId);
      setTopicId(tId);
      setTopicName(tName);
      setSubjectName(sName);
    },
    setSubjectId: (id) => { setSubjectId(id); setUnitId(''); setTopicId(''); setTopicName(''); },
    setUnitId: (id) => { setUnitId(id); setTopicId(''); setTopicName(''); },
    setTopicId: (id, name) => { setTopicId(id); if (name) setTopicName(name); },
    setSubjectName,
    clearLink: () => { setSubjectId(''); setUnitId(''); setTopicId(''); setTopicName(''); setSubjectName(''); },
  };

  // Always call the newest closure, but hand out a permanently stable object
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const stableActions = useMemo(() => {
    const out = {} as Record<string, (...args: unknown[]) => unknown>;
    (Object.keys(actions) as (keyof GlobalTimerActions)[]).forEach(k => {
      out[k] = (...args: unknown[]) => (actionsRef.current[k] as (...a: unknown[]) => unknown)(...args);
    });
    return out as unknown as GlobalTimerActions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state = useMemo<GlobalTimerState>(() => ({
    appMode, phase, running, focusDuration, customMinutes,
    swRunning, sessions,
    subjectId, unitId, topicId, topicName, subjectName,
  }), [appMode, phase, running, focusDuration, customMinutes, swRunning, sessions, subjectId, unitId, topicId, topicName, subjectName]);

  return [state, stableActions];
}
