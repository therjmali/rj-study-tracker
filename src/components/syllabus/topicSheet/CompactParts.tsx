import { motion } from 'framer-motion';
import { CalendarIcon, Check, ChevronDown, FastForward } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import type { SubTopic, TopicStatus } from '../../../types';
import { getLocalDateStr } from '../../../lib/utils';

/* ─────────────────────────────────────────────────────────────────────────
   Small, reusable pieces of the compact topic sheet
   ───────────────────────────────────────────────────────────────────────── */

export function SheetCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-card/80 border border-border/12 p-3.5 ${className}`}
      style={{ boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)' }}>
      {children}
    </div>
  );
}

/** Three minimal dots — 🟢 Easy · 🟡 Medium · 🔴 Hard (real emoji, so they always show) */
export function DifficultyDots({ value, onChange }: { value: SubTopic['difficulty']; onChange: (d: SubTopic['difficulty']) => void }) {
  const opts: { v: SubTopic['difficulty']; emoji: string; bg: string }[] = [
    { v: 'Easy', emoji: '🟢', bg: 'bg-emerald-500/12 border-emerald-500/30' },
    { v: 'Medium', emoji: '🟡', bg: 'bg-amber-500/12 border-amber-500/30' },
    { v: 'Hard', emoji: '🔴', bg: 'bg-red-500/12 border-red-500/30' },
  ];
  return (
    <div role="radiogroup" aria-label="Difficulty" className="flex items-center gap-1.5">
      {opts.map(o => {
        const active = value === o.v;
        return (
          <button key={o.v} type="button" role="radio" aria-checked={active} aria-label={o.v} title={o.v}
            onClick={() => onChange(o.v)}
            className={`w-9 h-9 rounded-full border flex items-center justify-center active:scale-90 transition-[transform,background-color,border-color,opacity] duration-150 ${
              active ? `${o.bg} shadow-sm` : 'border-transparent opacity-45 hover:opacity-80'
            }`}>
            <span className={`leading-none select-none transition-transform duration-150 ${active ? 'text-[19px] scale-110' : 'text-[15px]'}`} aria-hidden>{o.emoji}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One row of the "More" list — header with badge, body only mounted while open. */
export function SectionRow({ id, icon, title, hint, badge, open, onToggle, children }: {
  id: string; icon: string; title: string; hint?: string; badge?: string; open: boolean; onToggle: (id: string) => void; children: React.ReactNode;
}) {
  return (
    <div>
      <button type="button" onClick={() => onToggle(id)} aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-muted/10 active:bg-muted/15 transition-colors">
        <span className="w-6 text-center text-base shrink-0">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[12px] font-bold text-foreground">{title}</span>
          {hint && <span className="block text-[10px] text-muted-foreground/70 truncate">{hint}</span>}
        </span>
        {badge && <span className="text-[10px] font-bold text-primary/80 bg-primary/8 px-2 py-0.5 rounded-md shrink-0">{badge}</span>}
        <ChevronDown className={`w-4 h-4 text-muted-foreground/50 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        // stop pointer events so typing / selecting text never starts the swipe-to-next-topic drag
        <div className="px-3.5 pb-3.5 pt-0.5 animate-fade-in" onPointerDown={e => e.stopPropagation()}>{children}</div>
      )}
    </div>
  );
}

const STATUS_OPTS: { value: TopicStatus; label: string; emoji: string; on: string }[] = [
  { value: 'incomplete', label: 'To do', emoji: '📋', on: 'bg-muted/50 border-foreground/20 text-foreground' },
  { value: 'in_process', label: 'Studying', emoji: '🔄', on: 'bg-chart-4/15 border-chart-4/40 text-chart-4' },
  { value: 'complete', label: 'Done', emoji: '✅', on: 'bg-secondary/15 border-secondary/40 text-secondary' },
];

/** Status + dates + unit progress + "complete & next", in one compact card. `footer` holds the time / revision bar. */
export function CompactStatus({
  currentStatus, setStatus, showDatePicker, draft, handleCompletedDateChange, setField,
  unitDone = 0, unitTotal = 0, canCompleteAndNext, onCompleteAndNext, footer,
}: {
  currentStatus: TopicStatus;
  setStatus: (s: TopicStatus) => void;
  showDatePicker: boolean;
  draft: SubTopic;
  handleCompletedDateChange: (d: string | undefined) => void;
  setField: <K extends keyof SubTopic>(k: K, v: SubTopic[K]) => void;
  unitDone?: number;
  unitTotal?: number;
  canCompleteAndNext?: boolean;
  onCompleteAndNext?: () => void;
  footer?: React.ReactNode;
}) {
  const pct = unitTotal > 0 ? Math.round((unitDone / unitTotal) * 100) : 0;
  return (
    <SheetCard className="space-y-2.5">
      {unitTotal > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/70">Unit progress</span>
          <span className="flex-1 h-1 rounded-full bg-muted/30 overflow-hidden">
            <span className="block h-full rounded-full bg-secondary transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-[10px] font-mono font-bold text-muted-foreground">{unitDone}/{unitTotal} · {pct}%</span>
        </div>
      )}

      <div role="radiogroup" aria-label="Status" className="grid grid-cols-3 gap-1.5">
        {STATUS_OPTS.map(o => {
          const active = currentStatus === o.value;
          return (
            <motion.button key={o.value} type="button" role="radio" aria-checked={active} whileTap={{ scale: 0.95 }}
              onClick={() => { setStatus(o.value); navigator.vibrate?.(10); }}
              className={`h-11 rounded-xl border flex items-center justify-center gap-1.5 text-[12px] font-bold transition-[background-color,border-color,color] duration-150 ${
                active ? `${o.on} shadow-sm` : 'bg-card/30 border-border/12 text-muted-foreground/70 hover:bg-card/60'
              }`}>
              <span className="text-base leading-none">{o.emoji}</span>{o.label}
            </motion.button>
          );
        })}
      </div>

      {(currentStatus === 'in_process' || showDatePicker) && currentStatus !== 'complete' && (
        <div className="flex items-center gap-2 animate-fade-in">
          <CalendarIcon className="w-3.5 h-3.5 text-chart-4 shrink-0" />
          <span className="text-[10px] text-chart-4 font-bold shrink-0">Started</span>
          <Input type="date" value={draft.completedDate || ''} onChange={e => handleCompletedDateChange(e.target.value || undefined)}
            className="h-8 text-[11px] flex-1 bg-card border-chart-4/20 font-mono rounded-xl" />
        </div>
      )}

      {currentStatus === 'complete' && (
        <div className="flex items-center gap-1.5 flex-wrap animate-fade-in">
          <CalendarIcon className="w-3.5 h-3.5 text-secondary shrink-0" />
          <Input type="date" value={draft.completedDate || ''} onChange={e => handleCompletedDateChange(e.target.value || undefined)}
            aria-label="Completed date" className="h-8 text-[11px] flex-1 min-w-[120px] bg-card border-secondary/20 font-mono rounded-xl" />
          <Input type="time" value={draft.completedTime || ''} onChange={e => setField('completedTime', e.target.value || undefined)}
            aria-label="Completed time" className="h-8 text-[11px] w-[104px] bg-card border-border/20 font-mono rounded-xl" />
          {!draft.completedDate && (
            <Button size="sm" variant="outline" className="text-[10px] h-8 px-2 rounded-xl" onClick={() => {
              const now = new Date();
              setField('completedDate' as any, getLocalDateStr(now));
              setField('completedTime' as any, `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
            }}>Now</Button>
          )}
        </div>
      )}

      {canCompleteAndNext && onCompleteAndNext && (
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => { navigator.vibrate?.(15); onCompleteAndNext(); }}
          className="w-full h-10 rounded-xl bg-secondary text-secondary-foreground text-[12px] font-bold flex items-center justify-center gap-1.5"
          style={{ boxShadow: '0 4px 14px hsl(var(--secondary) / 0.28)' }}>
          <Check className="w-4 h-4" strokeWidth={3} /> Complete &amp; next topic <FastForward className="w-3.5 h-3.5 opacity-80" />
        </motion.button>
      )}

      {footer}
    </SheetCard>
  );
}

