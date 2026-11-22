import { useLayoutEffect, useRef, type ReactNode, type ElementType } from 'react';

/**
 * Single-line text that shrinks (never below `min`) until it fits its container, and grows back to `max`
 * when there is room — so "17h 50m", "20/42" or "100%" are never cut with "…" on small phones, split-screen
 * or large Zoom settings. Works purely on the DOM (no re-render per resize) and follows container resizes.
 */
export default function FitText({ children, max = 16, min = 9, className = '', as: Tag = 'span', title }: {
  children: ReactNode; max?: number; min?: number; className?: string; as?: ElementType; title?: string;
}) {
  const box = useRef<HTMLElement>(null);
  const txt = useRef<HTMLElement>(null);
  // what the current font-size was fitted for — skip all measuring when neither the text nor the width changed
  const last = useRef({ key: '', w: -1, max: 0, min: 0 });

  const fit = (force: boolean) => {
    const b = box.current, t = txt.current;
    if (!b || !t) return;
    const key = t.textContent || '';
    const w = b.clientWidth;
    const l = last.current;
    if (!force && l.key === key && l.w === w && l.max === max && l.min === min) return;
    last.current = { key, w, max, min };
    t.style.fontSize = `${max}px`;
    const need = t.scrollWidth;
    if (w > 0 && need > w) t.style.fontSize = `${Math.max(min, Math.floor((max * w / need) * 10) / 10)}px`;
  };

  // After every commit: a cheap check (does nothing when the text and width are unchanged)
  useLayoutEffect(() => { fit(false); });

  // Observers are created ONCE per mount (not on every render)
  useLayoutEffect(() => {
    const b = box.current;
    if (!b) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fit(false)) : null;
    ro?.observe(b);
    // Web fonts / zoom changes can alter glyph widths after first paint
    (document as any).fonts?.ready?.then(() => fit(true)).catch(() => {});
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max, min]);

  return (
    <Tag ref={box} className={`block w-full min-w-0 overflow-hidden whitespace-nowrap ${className}`} title={title}>
      <span ref={txt} className="inline-block align-baseline" style={{ fontSize: max }}>{children}</span>
    </Tag>
  );
}
