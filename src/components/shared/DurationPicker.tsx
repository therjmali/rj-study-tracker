import { useState } from 'react';
import { Input } from '@project/components/ui/input';

/**
 * The ONE duration control: − / big "0h 30m" (tap to type exact minutes) / +, with wrapping quick chips.
 * Used by Add Study Time, the topic & revision time card and the session editor, so manual time entry
 * looks and behaves identically everywhere. Chips wrap — nothing scrolls sideways.
 */
const PRESETS = [15, 30, 45, 60, 90, 120];
const label = (m: number) => (m >= 60 ? `${m / 60}h` : `${m}m`);

export default function DurationPicker({ value, onChange, min = 0, max = 720, step = 15, className = '' }: {
  value: number;
  onChange: (minutes: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const commit = () => {
    const v = parseInt(draft, 10);
    if (!isNaN(v) && v >= 1 && v <= max) onChange(clamp(v));
    setTyping(false);
    setDraft('');
  };
  const h = Math.floor(value / 60), m = value % 60;

  return (
    <div className={className}>
      <div className="flex items-center justify-center gap-4">
        <button type="button" aria-label={`Minus ${step} minutes`} onClick={() => { onChange(clamp(value - step)); setTyping(false); }}
          className="w-11 h-11 rounded-2xl bg-card/60 border border-border/20 flex items-center justify-center text-lg font-bold text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/25 active:scale-90 transition-all shadow-sm">−</button>

        {typing ? (
          <div className="flex items-center gap-1.5 min-w-[140px] justify-center">
            <Input type="text" inputMode="numeric" pattern="[0-9]*" value={draft} autoFocus placeholder="min"
              onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') { setTyping(false); setDraft(''); } }}
              className="h-12 w-20 text-center text-xl font-black font-mono bg-card/60 border-primary/30 rounded-xl" />
            <button type="button" onClick={commit} className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-[10px] font-bold active:scale-95 transition-all">Set</button>
          </div>
        ) : (
          <button type="button" onClick={() => { setTyping(true); setDraft(String(value || '')); }} title="Tap to type exact minutes"
            className="flex items-baseline gap-0.5 select-none min-w-[120px] justify-center px-3 py-1.5 rounded-xl hover:bg-card/50 active:scale-95 transition-all">
            <span className="font-display-digit text-4xl font-black text-foreground tracking-tight leading-none tabular-nums">{h}</span>
            <span className="text-sm font-bold text-muted-foreground/50 mr-1">h</span>
            <span className="font-display-digit text-4xl font-black text-foreground tracking-tight leading-none tabular-nums">{String(m).padStart(2, '0')}</span>
            <span className="text-sm font-bold text-muted-foreground/50">m</span>
          </button>
        )}

        <button type="button" aria-label={`Plus ${step} minutes`} onClick={() => { onChange(clamp(value + step)); setTyping(false); }}
          className="w-11 h-11 rounded-2xl bg-card/60 border border-border/20 flex items-center justify-center text-lg font-bold text-muted-foreground hover:bg-secondary/10 hover:text-secondary hover:border-secondary/25 active:scale-90 transition-all shadow-sm">+</button>
      </div>

      <div className="flex justify-center gap-1.5 mt-3 flex-wrap">
        {PRESETS.map(p => (
          <button key={p} type="button" onClick={() => { onChange(clamp(p)); setTyping(false); }}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all active:scale-95 ${value === p ? 'bg-primary/15 border-primary/30 text-primary shadow-[0_0_8px_hsl(var(--primary)/0.2)]' : 'bg-card/30 border-border/15 text-muted-foreground hover:border-primary/20'}`}>
            {label(p)}
          </button>
        ))}
        <button type="button" onClick={() => { setTyping(true); setDraft(String(value || '')); }}
          className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all active:scale-95 ${typing ? 'bg-chart-4/15 border-chart-4/30 text-chart-4' : 'bg-card/30 border-border/15 text-muted-foreground hover:border-chart-4/20'}`}>
          ✏️ Custom
        </button>
      </div>
    </div>
  );
}
