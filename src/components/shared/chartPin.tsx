import { useCallback, useState, type ReactNode } from 'react';
import { X, Hand } from 'lucide-react';

/**
 * Tap-to-inspect for every chart.
 *
 *   const pin = useChartPin();
 *   <ChartPinPanel pin={pin} describe={row => ({ title: row.fullDate, rows: [{ label: 'Study time', value: '1h 20m' }, …] })} />
 *   <BarChart data={…} onClick={pin.onChartClick}> … <ReferenceLine x={pin.label} /> </BarChart>
 *   <Pie onClick={pin.onItemClick}> …
 *
 * Tapping/clicking anywhere in a point's column (the whole plot height, not just the thin bar) pins that point's
 * numbers in a readout above the chart, so the value never hides under a finger and stays until the next tap.
 * Hover/touch-drag tooltips from Recharts keep working on top of it.
 */
export interface PinRow { label: string; value: ReactNode; color?: string }
export interface PinDescription { title: string; rows: PinRow[] }
export interface ChartPin {
  row: any | null;
  label: string | number | null;
  onChartClick: (state: any) => void;
  onItemClick: (entry: any) => void;
  clear: () => void;
}

export function useChartPin(): ChartPin {
  const [sel, setSel] = useState<{ row: any; label: string | number | null } | null>(null);
  const onChartClick = useCallback((state: any) => {
    const row = state?.activePayload?.[0]?.payload;
    if (!row) { setSel(null); return; }
    setSel(prev => (prev && prev.row === row ? null : { row, label: state.activeLabel ?? null }));
  }, []);
  const onItemClick = useCallback((entry: any) => {
    const row = entry?.payload?.payload ?? entry?.payload ?? entry;
    if (!row) { setSel(null); return; }
    setSel(prev => (prev && (prev.row === row || (prev.row?.name != null && prev.row?.name === row?.name)) ? null : { row, label: row?.name ?? null }));
  }, []);
  const clear = useCallback(() => setSel(null), []);
  return { row: sel?.row ?? null, label: sel?.label ?? null, onChartClick, onItemClick, clear };
}

export function ChartPinPanel({ pin, describe, hint = 'Tap a point for its details', className = '' }: {
  pin: ChartPin; describe: (row: any, label: string | number | null) => PinDescription | null; hint?: string; className?: string;
}) {
  const d = pin.row ? describe(pin.row, pin.label) : null;
  if (!d) {
    return (
      <p className={`flex items-center justify-center gap-1.5 min-h-[28px] text-[10px] font-semibold text-muted-foreground/70 ${className}`}>
        <Hand className="w-3 h-3" aria-hidden /> {hint}
      </p>
    );
  }
  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/8 px-3 py-2 min-h-[44px] ${className}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-black text-foreground truncate">{d.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {d.rows.map(r => (
            <span key={r.label} className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-foreground whitespace-nowrap">
              {r.color && <i className="w-2 h-2 rounded-full" style={{ background: r.color }} />}
              <span className="font-sans font-semibold text-muted-foreground">{r.label}</span> {r.value}
            </span>
          ))}
        </div>
      </div>
      <button type="button" onClick={pin.clear} aria-label="Clear selection"
        className="w-9 h-9 -mr-1.5 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/30 active:scale-90 transition shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
