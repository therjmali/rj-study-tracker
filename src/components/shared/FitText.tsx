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

  useLayoutEffect(() => {
    const b = box.current, t = txt.current;
    if (!b || !t) return;
    const fit = () => {
      t.style.fontSize = `${max}px`;
      const avail = b.clientWidth, need = t.scrollWidth;
      if (avail > 0 && need > avail) t.style.fontSize = `${Math.max(min, Math.floor((max * avail / need) * 10) / 10)}px`;
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(b);
    // Web fonts / zoom changes can alter glyph widths after first paint
    (document as any).fonts?.ready?.then(fit).catch(() => {});
    return () => ro?.disconnect();
  }, [children, max, min]);

  return (
    <Tag ref={box} className={`block w-full min-w-0 overflow-hidden whitespace-nowrap ${className}`} title={title}>
      <span ref={txt} className="inline-block align-baseline" style={{ fontSize: max }}>{children}</span>
    </Tag>
  );
}
