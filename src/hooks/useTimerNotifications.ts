import { useEffect, useRef } from 'react';
import type { PomodoroSettings } from '../types';
import { getTimerCore, type GlobalTimerState, type TimerCore } from './useGlobalTimer';
import { timerClear, timerDone, timerPublish, timerSaved, type TimerNotifyPayload } from '../platform/timerNotify';

const MODE_LABEL = {
  stopwatch: 'Stopwatch',
  countdown: 'Countdown',
} as const;
const PHASE_LABEL = { focus: 'Pomodoro focus', short: 'Short break', long: 'Long break' } as const;

function phaseTotalMs(core: TimerCore, pom: PomodoroSettings): number {
  if (core.appMode === 'stopwatch') return 0;
  if (core.appMode === 'countdown') return core.focusDuration * 60_000;
  return (core.phase === 'focus' ? core.focusDuration : core.phase === 'short' ? pom.shortBreakMin : pom.longBreakMin) * 60_000;
}

/** Everything the notification needs, derived from the engine's wall-clock timestamps. */
export function buildTimerPayload(core: TimerCore, pom: PomodoroSettings): TimerNotifyPayload {
  const stopwatch = core.appMode === 'stopwatch';
  const running = stopwatch ? core.swRunning : core.cdRunning;
  const modeLabel = stopwatch ? MODE_LABEL.stopwatch : core.appMode === 'countdown' ? MODE_LABEL.countdown : PHASE_LABEL[core.phase];
  const link = core.topicName || core.subjectName;
  const isBreak = core.appMode === 'pomodoro' && core.phase !== 'focus';
  const total = phaseTotalMs(core, pom);

  const finishedFocus = core.appMode === 'pomodoro' && core.phase === 'focus';
  const endTitle = core.appMode === 'countdown' ? '⏳ Countdown complete'
    : finishedFocus ? '🍅 Focus session complete' : '☕ Break over';
  const endBody = core.appMode === 'countdown' ? `${core.focusDuration} min of study logged${link ? ` · ${link}` : ''}.`
    : finishedFocus ? 'Nice work — time for a break.' : 'Ready for the next focus session?';

  return {
    v: 2,
    mode: core.appMode,
    running,
    countDown: !stopwatch,
    anchorMs: running ? (stopwatch ? core.swStartAt : core.cdEndAt) : 0,
    valueMs: running ? 0 : (stopwatch ? core.swElapsedMs : core.cdRemMs),
    totalMs: total,
    startedAtMs: core.sessionStartedAt,
    modeLabel,
    headlineRunning: `${modeLabel} running${link ? ` · ${link}` : ''}`,
    headlinePaused: `${modeLabel} paused${link ? ` · ${link}` : ''}`,
    activity: link || 'Free study',
    subject: core.subjectName,
    topic: core.topicName,
    sessions: core.sessions,
    stopLabel: isBreak ? 'Skip break' : 'Stop & Save',
    endTitle: core.appMode === 'stopwatch' ? '' : endTitle,
    endBody: core.appMode === 'stopwatch' ? '' : endBody,
    nextId: core.appMode === 'pomodoro' ? 'timer-toggle' : '',
    nextLabel: core.appMode === 'pomodoro' ? (finishedFocus ? 'Start break' : 'Start focus') : '',
  };
}

/**
 * Mirrors the Focus Timer into one rich notification (Pause / Resume, Stop & Save, Notes …) and
 * announces the end of a session while the app is in the background. Never per-second: the system
 * chronometer in the notification does the counting.
 */
export function useTimerNotifications(state: GlobalTimerState, pomodoro: PomodoroSettings) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const pomRef = useRef(pomodoro);
  pomRef.current = pomodoro;

  const publish = () => {
    const s = stateRef.current;
    const core = getTimerCore();
    if (!core) return;
    if (!(s.active || s.hasProgress)) { timerClear(); return; }
    void timerPublish(buildTimerPayload(core, pomRef.current));
  };

  // Mirror state changes (never per-second).
  useEffect(() => {
    publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pomodoro.shortBreakMin, pomodoro.longBreakMin]);

  // If the system or the student swiped the notification away, bring it back when the app is backgrounded.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') publish(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A session ended / was saved while the page was hidden.
  useEffect(() => {
    const onFinished = (e: Event) => {
      if (!document.hidden) return;
      const d = (e as CustomEvent<{ mode: string; phase: string; minutes: number }>).detail;
      if (!d) return;
      if (d.mode === 'countdown') {
        void timerDone('⏳ Countdown complete', `${d.minutes} min of study logged.`);
      } else if (d.phase === 'focus') {
        void timerDone('🍅 Focus session complete', 'Nice work — time for a break.', { id: 'timer-toggle', label: 'Start break' });
      } else {
        void timerDone('☕ Break over', 'Ready for the next focus session?', { id: 'timer-toggle', label: 'Start focus' });
      }
    };
    const onSaved = (e: Event) => {
      if (!document.hidden) return;
      const d = (e as CustomEvent<{ minutes: number; topicName?: string; subjectName?: string }>).detail;
      if (!d) return;
      void timerSaved('✅ Session saved', `${d.minutes} min${d.topicName || d.subjectName ? ` · ${d.topicName || d.subjectName}` : ''}`);
    };
    window.addEventListener('rj:timer-finished', onFinished);
    window.addEventListener('rj:timer-saved', onSaved);
    return () => {
      window.removeEventListener('rj:timer-finished', onFinished);
      window.removeEventListener('rj:timer-saved', onSaved);
    };
  }, []);
}
