import { useState, useEffect, useCallback } from 'react';

/* ── Shared singleton clock ──────────────────────────────────────────
   One setInterval(1 s) drives all subscribers.
   On visibility-change (tab refocus / app resume) we tick immediately
   so countdowns and dates recover from sleep / background.            */

let listeners: Set<(d: Date) => void> = new Set();
let intervalId: ReturnType<typeof setInterval> | null = null;
let currentTime = new Date();

function tick() {
  currentTime = new Date();
  listeners.forEach(fn => fn(currentTime));
}

function startClock() {
  if (!intervalId) {
    intervalId = setInterval(tick, 1_000);
  }
}

function stopClock() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// Immediately re-sync when the tab becomes visible again
function handleVisibility() {
  if (document.visibilityState === 'visible') tick();
}

export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const listener = (d: Date) => setNow(d);
    listeners.add(listener);

    if (listeners.size === 1) {
      startClock();
      document.addEventListener('visibilitychange', handleVisibility);
    }

    // Tick on mount so we never show a stale timestamp
    tick();

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        stopClock();
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, []);

  return now;
}

/** Non-reactive snapshot – use in callbacks / effects where you just
    need the current time without subscribing to updates. */
export function getNow(): Date {
  return currentTime;
}
