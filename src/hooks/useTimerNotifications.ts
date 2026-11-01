import { useEffect, useRef } from 'react';
import type { PomodoroSettings } from '../types';
import { getTimerTick, type GlobalTimerActions, type GlobalTimerState } from './useGlobalTimer';
import { timerAlarm, timerCancelAlarm, timerClear, timerDone, timerShow } from '../platform/timerNotify';

const PHASE_LABEL = { focus: '🍅 Focus', short: '☕ Short break', long: '🌿 Long break' } as const;

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Mirrors the Pomodoro timer / stopwatch into a notification with quick actions
 * (Pause / Resume / Stop) and announces the end of a session while the app is in the background.
 */
export function useTimerNotifications(state: GlobalTimerState, actions: GlobalTimerActions, pomodoro: PomodoroSettings) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const stateRef = useRef(state);
  stateRef.current = state;

  const prev = useRef({ running: false, phase: state.phase, appMode: state.appMode });

  // Mirror state changes (never per-second).
  useEffect(() => {
    const p = prev.current;
    const link = state.topicName ? ` · ${state.topicName}` : '';
    const tick = getTimerTick();

    if (state.appMode === 'timer') {
      const phaseTotal = (state.phase === 'focus' ? state.focusDuration : state.phase === 'short' ? pomodoro.shortBreakMin : pomodoro.longBreakMin) * 60;

      // A session that ended while the page was hidden: announce it ourselves.
      const endedHidden = p.appMode === 'timer' && p.running && p.phase !== state.phase && document.hidden;
      if (endedHidden) {
        const finishedFocus = p.phase === 'focus';
        void timerDone(
          finishedFocus ? '🍅 Focus session complete' : '☕ Break over',
          finishedFocus ? 'Nice work — time for a break.' : 'Ready for the next focus session?',
          { id: 'timer-toggle', label: finishedFocus ? 'Start break' : 'Start focus' },
        );
      }

      if (state.running) {
        const endAt = Date.now() + tick.timeLeft * 1000;
        void timerShow({
          title: `${PHASE_LABEL[state.phase]} in progress${link}`,
          text: `Ends at ${clock(endAt)}`,
          whenMs: endAt, countDown: true, running: true,
          actions: [{ id: 'timer-toggle', label: 'Pause' }, { id: 'timer-stop', label: 'Stop' }],
        });
        const finishedFocus = state.phase === 'focus';
        // Fires 1.5 s after the end so the in-app completion path wins when the page is awake.
        void timerAlarm(
          endAt + 1500,
          finishedFocus ? '🍅 Focus session complete' : '☕ Break over',
          finishedFocus ? 'Nice work — time for a break.' : 'Ready for the next focus session?',
          { id: 'timer-toggle', label: finishedFocus ? 'Start break' : 'Start focus' },
        );
      } else if (tick.timeLeft > 0 && tick.timeLeft < phaseTotal) {
        void timerShow({
          title: `${PHASE_LABEL[state.phase]} paused${link}`,
          text: `${Math.ceil(tick.timeLeft / 60)} min left`,
          whenMs: 0, countDown: true, running: false,
          actions: [{ id: 'timer-toggle', label: 'Resume' }, { id: 'timer-stop', label: 'Reset' }],
        });
        timerCancelAlarm(); // a paused timer must not announce an end
      } else if (!endedHidden) {
        timerClear();
      } else {
        timerCancelAlarm();
      }
    } else {
      // Stopwatch
      if (state.swRunning) {
        void timerShow({
          title: `⏱️ Stopwatch running${link}`,
          text: `Started at ${clock(Date.now() - tick.swTime * 1000)}`,
          whenMs: Date.now() - tick.swTime * 1000, countDown: false, running: true,
          actions: [{ id: 'timer-toggle', label: 'Pause' }, { id: 'timer-stop', label: 'Stop & save' }],
        });
      } else if (tick.swTime > 0) {
        void timerShow({
          title: `⏱️ Stopwatch paused${link}`,
          text: `${Math.floor(tick.swTime / 60)} min recorded`,
          whenMs: 0, countDown: false, running: false,
          actions: [{ id: 'timer-toggle', label: 'Resume' }, { id: 'timer-stop', label: 'Stop & save' }],
        });
      } else {
        timerClear();
      }
    }
    prev.current = { running: state.running, phase: state.phase, appMode: state.appMode };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.appMode, state.phase, state.running, state.swRunning, state.focusDuration, state.topicName]);

  // Quick actions from the notification (native receiver, service worker, or launch intent).
  useEffect(() => {
    const onAction = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      const s = stateRef.current;
      const a = actionsRef.current;
      if (id === 'timer-toggle') { if (s.appMode === 'timer') a.toggleTimer(); else a.toggleSw(); }
      else if (id === 'timer-stop') { if (s.appMode === 'timer') a.resetTimer(); else a.stopSw(); }
    };
    window.addEventListener('rj:native-action', onAction);
    return () => window.removeEventListener('rj:native-action', onAction);
  }, []);

  useEffect(() => () => timerClear(), []);
}
