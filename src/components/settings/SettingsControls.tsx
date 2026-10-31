import { useState, useEffect, useRef } from 'react';
import { Slider } from '@project/components/ui/slider';
import { Switch } from '@project/components/ui/switch';

/* ─────────────────────────────────────────────────────────────────────────
   Shared building blocks for every settings screen, so spacing, type scale
   and interaction feel identical everywhere.
   ───────────────────────────────────────────────────────────────────────── */

export function GroupLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">{children}</p>
      {right}
    </div>
  );
}

export function InfoNote({ emoji = 'ℹ️', children }: { emoji?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-primary/5 border border-primary/12 px-3 py-2.5">
      <span className="text-sm leading-none mt-0.5 shrink-0">{emoji}</span>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

export function ResetButton({ onClick, label = 'Reset to defaults' }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg border border-border/20 bg-card/30 hover:bg-card/60 active:scale-95 transition-[transform,background-color,color] duration-150">
      <span aria-hidden>↺</span> {label}
    </button>
  );
}

interface SegOption<T extends string> { id: T; label: string; hint?: string; glyph?: React.ReactNode }

/** Equal-width segmented picker (used for density, presets, student mode style choices). */
export function Segmented<T extends string>({ options, value, onChange, columns }: {
  options: SegOption<T>[]; value: T | null; onChange: (v: T) => void; columns?: number;
}) {
  return (
    <div role="radiogroup" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <button key={o.id} role="radio" aria-checked={active} onClick={() => onChange(o.id)}
            className={`relative flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-[transform,background-color,border-color,box-shadow] duration-150 active:scale-[0.97] ${
              active
                ? 'border-primary/60 bg-primary/10 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]'
                : 'border-border/25 bg-card/30 text-muted-foreground hover:border-border/50 hover:bg-card/60'
            }`}>
            {o.glyph && <span className="leading-none">{o.glyph}</span>}
            <span className={`text-[11px] font-bold leading-tight ${active ? 'text-primary' : 'text-foreground/80'}`}>{o.label}</span>
            {o.hint && <span className="text-[9px] leading-tight text-muted-foreground/70">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Slider + typeable number box.
 * The number box keeps a local draft, so you can type "45" without it snapping to
 * the minimum after the first digit; the value is validated on blur / Enter.
 */
export function SliderField({ label, hint, icon, value, min, max, step = 1, unit = '', onChange }: {
  label: string; hint?: string; icon?: React.ReactNode; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // If the value changes from outside while not editing, drop any stale draft
  useEffect(() => { if (document.activeElement !== inputRef.current) setDraft(null); }, [value]);

  const clamp = (n: number) => {
    const stepped = Math.round(n / step) * step;
    const fixed = Number(stepped.toFixed(step < 1 ? 2 : 0));
    return Math.max(min, Math.min(max, fixed));
  };
  const commit = () => {
    if (draft === null) return;
    const n = parseFloat(draft);
    if (!Number.isNaN(n)) onChange(clamp(n));
    setDraft(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">{icon}{label}</p>
          {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <input ref={inputRef} type="text" inputMode="decimal" value={draft ?? String(value)} aria-label={label}
            onChange={e => setDraft(e.target.value)} onFocus={e => e.currentTarget.select()} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') { commit(); inputRef.current?.blur(); } if (e.key === 'Escape') { setDraft(null); inputRef.current?.blur(); } }}
            className="w-14 h-7 rounded-lg border border-border/30 bg-card/40 text-right text-[12px] font-bold font-mono px-1.5 text-primary outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-[border-color,box-shadow]" />
          {unit && <span className="text-[10px] font-semibold text-muted-foreground w-5">{unit}</span>}
        </div>
      </div>
      <Slider value={[value]} onValueChange={v => { setDraft(null); onChange(v[0]); }} min={min} max={max} step={step} />
    </div>
  );
}

export function ToggleRow({ title, description, icon, checked, onChange }: {
  title: string; description?: string; icon?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/15 bg-card/25 px-3.5 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span className="shrink-0">{icon}</span>}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}
