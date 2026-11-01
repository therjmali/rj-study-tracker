/**
 * Focus Timer engine — ONE timer for the whole app.
 *
 * Modes (what the student sees everywhere, with the same names and icons):
 *   • pomodoro  🍅  focus → break cycles (25 / 5 / 15 by default)
 *   • countdown ⏳  one custom block, no breaks
 *   • stopwatch ⏱️  open-ended, count up
 *
 * Design rules
 *   1. Time is NEVER counted by incrementing a number. Everything is derived from wall-clock
 *      timestamps (`endAt`, `startAt`), so throttled background tabs, a sleeping phone or a
 *      killed web view cannot make the timer drift or lose time.
 *   2. The whole state is persisted on every change and restored on launch — a running session
 *      survives closing the app, a crash or an Android memory kill.
 *   3. Every action accepts an optional `at` timestamp so a notification button tapped while the
 *      app was closed is applied with the moment it was tapped, not the moment the app reopened.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { PomodoroSettings } from '../types';

export type TimerAppMode = 'pomodoro' | 'countdown' | 'stopwatch';
export type TimerPhase = 'focus' | 'short' | 'long';

export interface TimerSessionData {
  minutes: number;
  seconds: number;
  mode: TimerAppMode;
  startedAt: number;
  endedAt: number;
  subjectId?: string;
  unitId?: string;
  topicId?: string;
  subjectName?: string;
  topicName?: string;
  note?: string;
}

/**
 * Slow-changing timer state. Changes only when the user does something
 * (start, pause, switch mode, link a topic) — NOT every second.
 * The per-second values live in `useTimerTick()` so the whole app
 * does not re-render while a timer is running.
 */
export interface GlobalTimerState {
  appMode: TimerAppMode;
  phase: TimerPhase;
  /** Pomodoro / countdown is counting down. */
  running: boolean;
  /** Stopwatch is counting up. */
  swRunning: boolean;
  /** Either of the above. */
  active: boolean;
  /** Paused, but part-way through a session (so Save / Reset make sense). */
  hasProgress: boolean;
  focusDuration: number;
  customMinutes: number;
  sessions: number;
  subjectId: string;
  unitId: string;
  topicId: string;
  topicName: string;
  subjectName: string;
  note: string;
  /** Epoch ms of the first start of the current session (0 = none). */
  sessionStartedAt: number;
}

/** Values that change every second while a timer runs. */
export interface TimerTick {
  timeLeft: number;
  swTime: number;
}

export interface GlobalTimerActions {
  setAppMode: (m: TimerAppMode) => void;
  switchPhase: (m: TimerPhase) => void;
  /** Mode-aware start / pause / resume. */
  toggle: (at?: number) => void;
  /** Mode-aware: discard the current session. */
  reset: () => void;
  /** Mode-aware: stop, log the time studied so far, and reset. Returns what was logged (or null). */
  stopAndSave: (at?: number) => TimerSessionData | null;
  /** Apply a notification button that was tapped at `at`. */
  applyRemote: (id: string, at?: number) => boolean;
  selectPreset: (mins: number) => void;
  setCustomMinutes: (v: number) => void;
  applyCustom: () => void;
  linkTopic: (sId: string, uId: string, tId: string, tName: string, sName: string) => void;
  setSubjectId: (id: string) => void;
  setUnitId: (id: string) => void;
  setTopicId: (id: string, name?: string) => void;
  setSubjectName: (n: string) => void;
  clearLink: () => void;
  setNote: (n: string) => void;

  /* ── legacy aliases (kept so older call-sites keep compiling) ── */
  toggleTimer: () => void;
  resetTimer: () => void;
  toggleSw: () => void;
  resetSw: () => void;
  stopSw: () => void;
}

/** Raw, serialisable timer data. Exposed read-only to the notification layer. */
export interface TimerCore {
  appMode: TimerAppMode;
  phase: TimerPhase;
  focusDuration: number;
  /** Remembered length of each mode, so changing Countdown never changes the Pomodoro focus length. */
  pomoMin: number;
  countdownMin: number;
  customMinutes: number;
  sessions: number;
  cdRunning: boolean;
  cdEndAt: number;
  cdRemMs: number;
  swRunning: boolean;
  swStartAt: number;
  swElapsedMs: number;
  subjectId: string;
  unitId: string;
  topicId: string;
  topicName: string;
  subjectName: string;
  note: string;
  sessionStartedAt: number;
  lastLoggedEnd: number;
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

let latestCore: TimerCore | null = null;
/** Latest raw timer data (timestamps etc.) for the notification layer. */
export function getTimerCore(): TimerCore | null { return latestCore; }

/* ── Persistence ───────────────────────────────────────────────────── */
const STORAGE_KEY = 'rj-focus-timer-v2';
const MODES: TimerAppMode[] = ['pomodoro', 'countdown', 'stopwatch'];
const PHASES: TimerPhase[] = ['focus', 'short', 'long'];

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function defaultCore(s: PomodoroSettings): TimerCore {
  return {
    appMode: 'pomodoro', phase: 'focus', focusDuration: s.focusMin, pomoMin: s.focusMin, countdownMin: 30, customMinutes: s.focusMin, sessions: 0,
    cdRunning: false, cdEndAt: 0, cdRemMs: s.focusMin * 60_000,
    swRunning: false, swStartAt: 0, swElapsedMs: 0,
    subjectId: '', unitId: '', topicId: '', topicName: '', subjectName: '', note: '',
    sessionStartedAt: 0, lastLoggedEnd: 0,
  };
}

function loadCore(s: PomodoroSettings): TimerCore {
  const def = defaultCore(s);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (!p || typeof p !== 'object') return def;
    const appMode = MODES.includes(p.appMode as TimerAppMode) ? (p.appMode as TimerAppMode) : def.appMode;
    const phase = PHASES.includes(p.phase as TimerPhase) ? (p.phase as TimerPhase) : def.phase;
    const focusDuration = Math.max(1, Math.min(480, num(p.focusDuration, def.focusDuration)));
    const stored = Math.max(1, Math.min(480, num(p.focusDuration, def.focusDuration)));
    const pomoMin = Math.max(1, Math.min(480, num(p.pomoMin, appMode === 'countdown' ? def.pomoMin : stored)));
    const countdownMin = Math.max(1, Math.min(480, num(p.countdownMin, appMode === 'countdown' ? stored : 30)));
    return {
      appMode, phase, focusDuration, pomoMin, countdownMin,
      customMinutes: Math.max(1, Math.min(480, num(p.customMinutes, focusDuration))),
      sessions: Math.max(0, Math.floor(num(p.sessions, 0))),
      cdRunning: p.cdRunning === true, cdEndAt: num(p.cdEndAt, 0),
      cdRemMs: Math.max(0, num(p.cdRemMs, focusDuration * 60_000)),
      swRunning: p.swRunning === true, swStartAt: num(p.swStartAt, 0),
      swElapsedMs: Math.max(0, num(p.swElapsedMs, 0)),
      subjectId: str(p.subjectId), unitId: str(p.unitId), topicId: str(p.topicId),
      topicName: str(p.topicName), subjectName: str(p.subjectName), note: str(p.note),
      sessionStartedAt: num(p.sessionStartedAt, 0), lastLoggedEnd: num(p.lastLoggedEnd, 0),
    };
  } catch {
    return def;
  }
}

function persist(core: TimerCore) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(core)); } catch { /* storage full / blocked */ }
}

/** Quiet daily reset of the "sessions today" counter so the streak chip does not grow forever. */
const DAY_KEY = 'rj-focus-timer-day';
function resetSessionsIfNewDay(core: TimerCore) {
  try {
    const today = new Date().toDateString();
    if (localStorage.getItem(DAY_KEY) !== today) {
      localStorage.setItem(DAY_KEY, today);
      if (!core.cdRunning && !core.swRunning) core.sessions = 0;
    }
  } catch { /* ignore */ }
}

/* ── Hook ──────────────────────────────────────────────────────────── */

export function useGlobalTimer(
  settings: PomodoroSettings,
  onComplete: (data: TimerSessionData) => void,
): [GlobalTimerState, GlobalTimerActions] {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const audioRef = useRef<AudioContext | null>(null);

  const coreRef = useRef<TimerCore | null>(null);
  if (coreRef.current === null) {
    const c = loadCore(settings);
    resetSessionsIfNewDay(c);
    coreRef.current = c;
    latestCore = c;
    const now = Date.now();
    tickStore.reset({
      timeLeft: Math.max(0, Math.ceil((c.cdRunning ? c.cdEndAt - now : c.cdRemMs) / 1000)),
      swTime: Math.max(0, Math.floor((c.swRunning ? now - c.swStartAt : c.swElapsedMs) / 1000)),
    });
  }

  const api = useMemo(() => {
    const core = () => coreRef.current as TimerCore;

    const phaseMs = (c: TimerCore, phase: TimerPhase = c.phase) => {
      const s = settingsRef.current;
      if (c.appMode === 'countdown') return c.focusDuration * 60_000;
      return (phase === 'focus' ? c.focusDuration : phase === 'short' ? s.shortBreakMin : s.longBreakMin) * 60_000;
    };

    const derive = (c: TimerCore): GlobalTimerState => ({
      appMode: c.appMode, phase: c.phase,
      running: c.cdRunning, swRunning: c.swRunning, active: c.cdRunning || c.swRunning,
      hasProgress: c.appMode === 'stopwatch'
        ? !c.swRunning && c.swElapsedMs > 0
        : !c.cdRunning && c.cdRemMs < phaseMs(c),
      focusDuration: c.focusDuration, customMinutes: c.customMinutes, sessions: c.sessions,
      subjectId: c.subjectId, unitId: c.unitId, topicId: c.topicId, topicName: c.topicName, subjectName: c.subjectName,
      note: c.note, sessionStartedAt: c.sessionStartedAt,
    });

    let setStateFn: ((s: GlobalTimerState) => void) | null = null;

    const syncTick = (c: TimerCore, now = Date.now()) => {
      tickStore.set({
        timeLeft: Math.max(0, Math.ceil((c.cdRunning ? c.cdEndAt - now : c.cdRemMs) / 1000)),
        swTime: Math.max(0, Math.floor((c.swRunning ? now - c.swStartAt : c.swElapsedMs) / 1000)),
      });
    };

    const commit = () => {
      const c = core();
      latestCore = { ...c };
      persist(c);
      syncTick(c);
      setStateFn?.(derive(c));
    };

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
      } catch { /* audio unavailable */ }
    };

    const clearSession = (c: TimerCore) => {
      c.sessionStartedAt = 0;
      c.note = '';
    };

    const log = (c: TimerCore, seconds: number, startedAt: number, endedAt: number): TimerSessionData => {
      const minutes = Math.max(1, Math.round(seconds / 60));
      const data: TimerSessionData = {
        minutes, seconds, mode: c.appMode, startedAt, endedAt,
        subjectId: c.subjectId || undefined, unitId: c.unitId || undefined, topicId: c.topicId || undefined,
        subjectName: c.subjectName || undefined, topicName: c.topicName || undefined,
        note: c.note.trim() || undefined,
      };
      onCompleteRef.current(data);
      try { window.dispatchEvent(new CustomEvent('rj:timer-saved', { detail: data })); } catch { /* ignore */ }
      return data;
    };

    /** The countdown reached zero (possibly long ago, if the app was closed). */
    const finishCountdown = () => {
      const c = core();
      if (!c.cdRunning) return;
      const endedAt = c.cdEndAt;
      const finishedMode = c.appMode;
      const finishedPhase = c.phase;
      const finishedMinutes = c.focusDuration;
      c.cdRunning = false;
      c.cdRemMs = 0;
      playBeep();
      try {
        window.dispatchEvent(new CustomEvent('rj:timer-finished', {
          detail: { mode: finishedMode, phase: finishedPhase, minutes: finishedMinutes, endedAt },
        }));
      } catch { /* ignore */ }

      if (c.appMode === 'countdown' || c.phase === 'focus') {
        if (c.lastLoggedEnd !== endedAt) {
          c.lastLoggedEnd = endedAt;
          const total = c.focusDuration * 60;
          log(c, total, c.sessionStartedAt || endedAt - total * 1000, endedAt);
          c.sessions += 1;
          toast.success(c.appMode === 'countdown'
            ? `⏳ Countdown complete — ${c.focusDuration} min logged`
            : `🍅 Focus #${c.sessions} done — ${c.focusDuration} min logged`);
        }
        clearSession(c);
        if (c.appMode === 'countdown') {
          c.cdRemMs = phaseMs(c);
        } else {
          c.phase = c.sessions % 4 === 0 ? 'long' : 'short';
          c.cdRemMs = phaseMs(c);
          if (settingsRef.current.autoStartBreaks) {
            c.cdEndAt = Date.now() + c.cdRemMs;
            c.cdRunning = true;
          }
        }
      } else {
        toast.info('Break over — time to focus.');
        c.phase = 'focus';
        c.cdRemMs = phaseMs(c);
        c.sessionStartedAt = 0;
      }
      commit();
    };

    const tick = () => {
      const c = core();
      const now = Date.now();
      if (c.cdRunning) {
        if (c.cdEndAt - now <= 0) { finishCountdown(); return; }
        tickStore.set({ timeLeft: Math.ceil((c.cdEndAt - now) / 1000) });
      }
      if (c.swRunning) tickStore.set({ swTime: Math.floor((now - c.swStartAt) / 1000) });
    };

    const setLength = (c: TimerCore, m: number) => {
      c.focusDuration = m; c.customMinutes = m;
      if (c.appMode === 'countdown') c.countdownMin = m; else c.pomoMin = m;
    };

    const guardIdle = (what: string): boolean => {
      const c = core();
      const busy = c.cdRunning || c.swRunning || (c.appMode === 'stopwatch' ? c.swElapsedMs > 0 : c.cdRemMs < phaseMs(c));
      if (busy) toast.info(`Finish, save or reset the current session before ${what}.`);
      return !busy;
    };

    const actions: GlobalTimerActions = {
      setAppMode: (m) => {
        const c = core();
        if (m === c.appMode) return;
        if (!guardIdle('switching modes')) return;
        c.appMode = m;
        c.phase = 'focus';
        if (m === 'pomodoro') c.focusDuration = c.pomoMin;
        else if (m === 'countdown') c.focusDuration = c.countdownMin;
        c.customMinutes = c.focusDuration;
        c.cdRemMs = phaseMs(c);
        c.swElapsedMs = 0;
        clearSession(c);
        commit();
      },
      switchPhase: (p) => {
        const c = core();
        if (c.appMode !== 'pomodoro' || p === c.phase) return;
        if (!guardIdle('changing the phase')) return;
        c.phase = p;
        c.cdRemMs = phaseMs(c);
        commit();
      },
      toggle: (at = Date.now()) => {
        const c = core();
        if (c.appMode === 'stopwatch') {
          if (c.swRunning) {
            c.swElapsedMs = Math.max(0, at - c.swStartAt);
            c.swRunning = false;
          } else {
            c.swStartAt = at - c.swElapsedMs;
            c.swRunning = true;
            if (!c.sessionStartedAt) c.sessionStartedAt = at - c.swElapsedMs;
          }
        } else if (c.cdRunning) {
          if (c.cdEndAt <= at) { finishCountdown(); return; }
          c.cdRemMs = Math.max(0, c.cdEndAt - at);
          c.cdRunning = false;
        } else {
          if (c.cdRemMs <= 0) c.cdRemMs = phaseMs(c);
          c.cdEndAt = at + c.cdRemMs;
          c.cdRunning = true;
          if (!c.sessionStartedAt && (c.appMode === 'countdown' || c.phase === 'focus')) {
            c.sessionStartedAt = at - (phaseMs(c) - c.cdRemMs);
          }
        }
        commit();
      },
      reset: () => {
        const c = core();
        c.cdRunning = false; c.swRunning = false;
        c.swElapsedMs = 0; c.swStartAt = 0;
        c.cdRemMs = phaseMs(c);
        clearSession(c);
        commit();
      },
      stopAndSave: (at = Date.now()) => {
        const c = core();
        let seconds = 0;
        if (c.appMode === 'stopwatch') {
          seconds = Math.round((c.swRunning ? Math.max(0, at - c.swStartAt) : c.swElapsedMs) / 1000);
        } else if (c.appMode === 'countdown' || c.phase === 'focus') {
          const remaining = c.cdRunning ? Math.max(0, c.cdEndAt - at) : c.cdRemMs;
          seconds = Math.round((phaseMs(c) - remaining) / 1000);
        }
        const startedAt = c.sessionStartedAt || at - seconds * 1000;
        let saved: TimerSessionData | null = null;

        c.cdRunning = false; c.swRunning = false;
        if (seconds >= 30) {
          saved = log(c, seconds, startedAt, at);
          c.sessions += 1;
          toast.success(`✅ ${saved.minutes} min saved${c.topicName ? ` · ${c.topicName}` : ''}`);
        } else if (seconds > 0) {
          toast.info('Under 30 seconds — nothing was logged.');
        }
        c.swElapsedMs = 0; c.swStartAt = 0;
        if (c.appMode === 'pomodoro') c.phase = 'focus';
        c.cdRemMs = phaseMs(c);
        clearSession(c);
        commit();
        return saved;
      },
      applyRemote: (id, at = Date.now()) => {
        const c = core();
        if (c.cdRunning && c.cdEndAt <= at) finishCountdown();
        if (id === 'timer-toggle') { actions.toggle(at); return true; }
        if (id === 'timer-stop') { actions.stopAndSave(at); return true; }
        return false;
      },
      selectPreset: (mins) => {
        const c = core();
        if (c.appMode === 'stopwatch') return;
        if (c.cdRunning || c.cdRemMs < phaseMs(c)) { toast.info('Reset the timer to change its length.'); return; }
        const m = Math.max(1, Math.min(480, Math.round(mins)));
        setLength(c, m);
        c.cdRemMs = phaseMs(c);
        commit();
      },
      setCustomMinutes: (v) => {
        const c = core();
        c.customMinutes = Number.isFinite(v) ? Math.max(0, Math.min(999, Math.round(v))) : c.customMinutes;
        setStateFn?.(derive(c));
      },
      applyCustom: () => {
        const c = core();
        if (c.appMode === 'stopwatch') return;
        const m = Math.max(1, Math.min(480, c.customMinutes || c.focusDuration));
        if (m === c.focusDuration && c.customMinutes === m) return;
        if (c.cdRunning || c.cdRemMs < phaseMs(c)) {
          c.customMinutes = c.focusDuration;
          commit();
          toast.info('Reset the timer to change its length.');
          return;
        }
        setLength(c, m);
        c.cdRemMs = phaseMs(c);
        commit();
      },
      linkTopic: (sId, uId, tId, tName, sName) => {
        const c = core();
        c.subjectId = sId; c.unitId = uId; c.topicId = tId; c.topicName = tName; c.subjectName = sName;
        commit();
      },
      setSubjectId: (id) => { const c = core(); c.subjectId = id; c.unitId = ''; c.topicId = ''; c.topicName = ''; commit(); },
      setUnitId: (id) => { const c = core(); c.unitId = id; c.topicId = ''; c.topicName = ''; commit(); },
      setTopicId: (id, name) => { const c = core(); c.topicId = id; if (name) c.topicName = name; commit(); },
      setSubjectName: (n) => { const c = core(); c.subjectName = n; commit(); },
      clearLink: () => { const c = core(); c.subjectId = ''; c.unitId = ''; c.topicId = ''; c.topicName = ''; c.subjectName = ''; commit(); },
      setNote: (n) => { const c = core(); c.note = n.slice(0, 500); commit(); },

      toggleTimer: () => actions.toggle(),
      resetTimer: () => actions.reset(),
      toggleSw: () => actions.toggle(),
      resetSw: () => actions.reset(),
      stopSw: () => { actions.stopAndSave(); },
    };

    return {
      actions, derive, tick, commit, finishCountdown, core,
      attach: (fn: (s: GlobalTimerState) => void) => { setStateFn = fn; },
    };
  }, []);

  const [state, setState] = useState<GlobalTimerState>(() => api.derive(api.core()));
  api.attach(setState);

  // Tick: only while something is running. Everything is recomputed from timestamps, so a late tick is harmless.
  const running = state.running;
  const swRunning = state.swRunning;
  useEffect(() => {
    if (!running && !swRunning) return;
    api.tick();
    const id = setInterval(api.tick, 250);
    const wake = () => { if (document.visibilityState === 'visible') api.tick(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [running, swRunning, api]);

  // A countdown that ended while the app was closed is completed (and logged once) on launch.
  useEffect(() => {
    const c = api.core();
    if (c.cdRunning && c.cdEndAt <= Date.now()) api.finishCountdown();
  }, [api]);

  // Keep an idle Pomodoro in step with the configured focus length.
  useEffect(() => {
    const c = api.core();
    if (c.appMode !== 'pomodoro' || c.phase !== 'focus' || c.cdRunning || c.swRunning) return;
    if (c.cdRemMs < c.focusDuration * 60_000) return;
    if (c.focusDuration === settings.focusMin) return;
    c.focusDuration = settings.focusMin; c.pomoMin = settings.focusMin; c.customMinutes = settings.focusMin; c.cdRemMs = settings.focusMin * 60_000;
    api.commit();
  }, [settings.focusMin, api]);

  // Notification buttons (Pause / Resume / Stop & Save), including ones tapped while the app was closed.
  useEffect(() => {
    const onAction = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; at?: number }>).detail;
      if (!d?.id) return;
      const now = Date.now();
      const at = typeof d.at === 'number' && d.at > 0 ? Math.min(d.at, now) : now;
      api.actions.applyRemote(d.id, at);
    };
    window.addEventListener('rj:native-action', onAction);
    return () => window.removeEventListener('rj:native-action', onAction);
  }, [api]);

  return [state, api.actions];
}
