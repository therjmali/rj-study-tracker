import { useEffect, useRef } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';
import { animate, useMotionValue, useTransform } from 'framer-motion';
import { toast } from 'sonner';

/**
 * Swipe left / right to change topic — ONE gesture for the topic window and the Revision window,
 * so both feel identical (same lock angle, distance, velocity and finger-following animation).
 *
 * Native touch handling (instead of a framer drag) so it works anywhere on the sheet and never fights
 * vertical scrolling. It is ignored on inputs, sliders, the notes editor and horizontally scrolling
 * rows, so editing / scrolling those is never mistaken for a swipe.
 */
export const SWIPE_THRESHOLD = 70;

const BLOCK_SELECTOR = 'input, textarea, select, [role="slider"], [contenteditable="true"], .ProseMirror, [data-no-swipe]';

export function isSwipeBlocked(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.matches?.(BLOCK_SELECTOR)) return true;
    const cs = getComputedStyle(el);
    // a short, horizontally scrolling strip (chip rows) owns horizontal gestures; the tall sheet scroller itself does not
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.clientHeight < 160 && el.scrollWidth > el.clientWidth + 8) return true;
    el = el.parentElement;
  }
  return false;
}

interface Options {
  hasPrev?: boolean;
  hasNext?: boolean;
  /** Called when a swipe is committed. */
  onNavigate: (direction: 'prev' | 'next') => void;
}

export function useSwipeNav({ hasPrev, hasNext, onNavigate }: Options) {
  const dragX = useMotionValue(0);
  const contentOpacity = useTransform(dragX, [-120, 0, 120], [0.4, 1, 0.4]);
  const contentScale = useTransform(dragX, [-120, 0, 120], [0.96, 1, 0.96]);
  const touchRef = useRef<{ x: number; y: number; t: number; lock: 'h' | 'v' | null } | null>(null);
  const navRef = useRef(onNavigate);
  navRef.current = onNavigate;

  const onTouchStart = (e: ReactTouchEvent) => {
    if (!(hasPrev || hasNext) || e.touches.length !== 1 || isSwipeBlocked(e.target)) { touchRef.current = null; return; }
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), lock: null };
  };

  const onTouchMove = (e: ReactTouchEvent) => {
    const st = touchRef.current;
    if (!st) return;
    const t = e.touches[0];
    const dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (!st.lock) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) st.lock = 'h';
      else if (Math.abs(dy) > 10) st.lock = 'v';
    }
    if (st.lock === 'h') {
      const atEdge = (dx > 0 && !hasPrev) || (dx < 0 && !hasNext);
      dragX.set(dx * (atEdge ? 0.1 : 0.45)); // finger-following feedback, resists at the ends
    }
  };

  const onTouchEnd = (e: ReactTouchEvent) => {
    const st = touchRef.current;
    touchRef.current = null;
    if (!st || st.lock !== 'h') {
      if (dragX.get() !== 0) animate(dragX, 0, { type: 'spring', stiffness: 420, damping: 36 });
      return;
    }
    const dx = e.changedTouches[0].clientX - st.x;
    const speed = Math.abs(dx) / Math.max(Date.now() - st.t, 1);
    animate(dragX, 0, { type: 'spring', stiffness: 420, damping: 36 });
    const committed = Math.abs(dx) > SWIPE_THRESHOLD * 0.85 || (Math.abs(dx) > 34 && speed > 0.45);
    if (!committed) return;
    if (dx > 0 && hasPrev) navRef.current('prev');
    else if (dx < 0 && hasNext) navRef.current('next');
    else {
      navigator.vibrate?.(10);
      toast(dx > 0 ? '⏮ This is the first topic in the list' : '⏭ That was the last topic in the list', { id: 'topic-list-end', duration: 1400 });
    }
  };

  return {
    dragX, contentOpacity, contentScale,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
  };
}

/** One-time hint so the gesture is discoverable (shown once per `storageKey`). */
export function useSwipeHint(active: boolean, storageKey: string, message = '👆 Swipe left / right to switch topics') {
  useEffect(() => {
    if (!active) return;
    try {
      if (localStorage.getItem(storageKey)) return;
      localStorage.setItem(storageKey, '1');
    } catch { return; }
    const id = setTimeout(() => toast(message, { duration: 2600 }), 700);
    return () => clearTimeout(id);
  }, [active, storageKey, message]);
}
