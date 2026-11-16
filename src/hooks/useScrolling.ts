import { useSyncExternalStore } from 'react';

/**
 * True while the user is scrolling (and for a short moment after). Floating widgets (AI button, timer pill)
 * use it to fade out of the way so they never cover the card you are reading.
 * One passive, capture-phase listener is shared by every consumer and costs nothing when nobody is subscribed.
 */
let scrolling = false;
let timer: number | undefined;
let attached = false;
const subs = new Set<() => void>();

const set = (v: boolean) => { if (scrolling !== v) { scrolling = v; subs.forEach(s => s()); } };
const onScroll = () => {
  set(true);
  window.clearTimeout(timer);
  timer = window.setTimeout(() => set(false), 650);
};

function subscribe(cb: () => void) {
  subs.add(cb);
  if (!attached && typeof window !== 'undefined') {
    attached = true;
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('touchmove', onScroll, { passive: true, capture: true });
  }
  return () => {
    subs.delete(cb);
    if (!subs.size && attached) {
      attached = false;
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener('touchmove', onScroll, { capture: true } as EventListenerOptions);
      window.clearTimeout(timer);
      scrolling = false;
    }
  };
}

export function useScrolling(): boolean {
  return useSyncExternalStore(subscribe, () => scrolling, () => false);
}
