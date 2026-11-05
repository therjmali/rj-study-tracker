import { memo, useEffect, useRef, useState } from 'react';

/**
 * Mechanical split-flap digit card (like a classic flip clock): the top half folds down to reveal the new
 * value. Pure CSS animation (transform + opacity only), so it is cheap on phones. `tone` picks the card
 * material: "dark" (charcoal card, white numerals), "light" (white card, charcoal numerals) or "auto"
 * (follows the theme).
 */
export type FlipTone = 'dark' | 'light' | 'auto';

interface Props {
  value: string;
  label?: string;
  tone?: FlipTone;
  /** card width in px (height follows: 1.28×) */
  size?: number;
  className?: string;
}

function FlipCardInner({ value, label, tone = 'auto', size = 64, className = '' }: Props) {
  const [cur, setCur] = useState(value);
  const [prev, setPrev] = useState(value);
  const [flipping, setFlipping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (value === cur) return;
    setPrev(cur); setCur(value); setFlipping(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlipping(false), 620);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const h = Math.round(size * 1.28);
  const w = value.length > 2 ? Math.round(size * 1.3) : size;
  const fs = Math.round(size * (value.length > 2 ? 0.56 : 0.7));
  const style = { ['--fw' as string]: `${w}px`, ['--fh' as string]: `${h}px`, ['--ffs' as string]: `${fs}px` } as React.CSSProperties;

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <div className="flip-card" data-tone={tone} style={style} role="img" aria-label={`${value} ${label ?? ''}`.trim()}>
        <div className="flip-half flip-top"><span>{cur}</span></div>
        <div className="flip-half flip-bottom"><span>{flipping ? prev : cur}</span></div>
        {flipping && (
          <>
            <div className="flip-half flip-top flip-flap-top" key={`t${cur}`}><span>{prev}</span></div>
            <div className="flip-half flip-bottom flip-flap-bottom" key={`b${cur}`}><span>{cur}</span></div>
          </>
        )}
        <i className="flip-hinge" />
      </div>
      {label && <span className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>}
    </div>
  );
}

const FlipCard = memo(FlipCardInner);
export default FlipCard;

/** Several digits side by side (e.g. HH, MM, SS), with optional separators. */
export function FlipGroup({ items, size, tone, gap = 8 }: { items: { value: string; label?: string }[]; size?: number; tone?: FlipTone; gap?: number }) {
  return (
    <div className="flex items-start justify-center" style={{ gap }}>
      {items.map((it, i) => <FlipCard key={i} value={it.value} label={it.label} size={size} tone={tone} />)}
    </div>
  );
}
