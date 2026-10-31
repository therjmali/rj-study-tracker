import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { formatStudyTime } from '../../lib/utils';

export type DifficultyFilter = 'all' | 'Easy' | 'Medium' | 'Hard';

interface Props {
  easy: number; easyDone: number;
  med: number; medDone: number;
  hard: number; hardDone: number;
  important: number;
  totalTime: number;
  diffFilter: DifficultyFilter;
  onFilterChange: (f: DifficultyFilter) => void;
  onTimeClick: () => void;
}

/**
 * Difficulty Breakdown — collapsed by default (one compact line), expands on tap.
 * The 🟢🟡🔴 filter dots stay available in the collapsed line.
 */
export default function SubjectDifficultyCard({
  easy, easyDone, med, medDone, hard, hardDone, important, totalTime, diffFilter, onFilterChange, onTimeClick,
}: Props) {
  const [open, setOpen] = useState(false);

  const rows = [
    { label: 'Easy', key: 'Easy' as const, done: easyDone, total: easy, color: 'hsl(var(--diff-easy))', dotColor: 'bg-diff-easy', ringColor: 'ring-diff-easy/50', emoji: '🟢' },
    { label: 'Medium', key: 'Medium' as const, done: medDone, total: med, color: 'hsl(var(--diff-medium))', dotColor: 'bg-diff-medium', ringColor: 'ring-diff-medium/50', emoji: '🟡' },
    { label: 'Hard', key: 'Hard' as const, done: hardDone, total: hard, color: 'hsl(var(--diff-hard))', dotColor: 'bg-diff-hard', ringColor: 'ring-diff-hard/50', emoji: '🔴' },
  ];

  return (
    <div className="rounded-2xl bg-card/80 border border-border/12 p-3"
      style={{ boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)' }}>

      {/* ═══ Collapsed line — always visible ═══ */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(p => !p)} aria-expanded={open} aria-label="Toggle difficulty breakdown"
          className="flex-1 min-w-0 flex items-center gap-2 text-left active:scale-[0.99] transition-transform">
          <span className="text-[13px] font-bold text-foreground flex items-center gap-1 whitespace-nowrap">🔥 Difficulty Breakdown</span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          {rows.map(r => (
            <button key={r.key} type="button" onClick={() => onFilterChange(diffFilter === r.key ? 'all' : r.key)}
              className={`text-sm px-1.5 py-0.5 rounded-lg transition-all active:scale-90 ${diffFilter === r.key ? `${r.ringColor} ring-2 bg-card/60 scale-105` : 'hover:bg-card/40 opacity-70 hover:opacity-100'}`}
              title={`Filter ${r.label} topics`} aria-label={`Filter ${r.label} topics`}>
              {r.emoji}
            </button>
          ))}
          {diffFilter !== 'all' && (
            <button type="button" onClick={() => onFilterChange('all')}
              className="text-[10px] font-bold text-accent-foreground bg-accent/20 px-1.5 py-0.5 rounded-md ml-1 active:scale-90">
              ALL
            </button>
          )}
        </div>
        <button type="button" onClick={() => setOpen(p => !p)} aria-label={open ? 'Collapse difficulty breakdown' : 'Expand difficulty breakdown'}
          className="p-1 -mr-1 shrink-0 active:scale-90 transition-transform">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </button>
      </div>

      {/* ═══ Expanded content ═══ */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }} className="overflow-hidden">
            <div className="pt-3 mt-3 border-t border-border/10 space-y-3">
              <p className="text-xs text-muted-foreground">Tap 🟢🟡🔴 to filter topics by difficulty</p>
              {rows.map(r => {
                const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
                const isActive = diffFilter === r.key;
                return (
                  <button key={r.label} type="button" onClick={() => onFilterChange(diffFilter === r.key ? 'all' : r.key)}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-1 py-1 transition-all active:scale-[0.98] ${isActive ? 'bg-accent/10 ring-1 ring-accent/20' : 'hover:bg-card/30'}`}>
                    <div className={`w-3.5 h-3.5 rounded-full shrink-0 ${r.dotColor} ${isActive ? 'ring-2 ' + r.ringColor + ' scale-110' : ''} transition-all`} />
                    <span className={`text-sm font-bold w-16 shrink-0 text-left ${isActive ? 'text-accent-foreground' : 'text-foreground'}`}>{r.label}</span>
                    <div className="flex-1 h-3.5 rounded-full bg-muted/25 overflow-hidden min-w-0">
                      <div className="h-full rounded-full transition-all duration-500" style={{ backgroundColor: r.color, width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0 text-right font-semibold whitespace-nowrap ml-1">{r.done}/{r.total} · {pct}%</span>
                  </button>
                );
              })}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 text-[11px] text-muted-foreground border-t border-border/10 font-semibold">
                <span>Total: <strong className="text-foreground">{easy + med + hard}</strong></span>
                <span>Done: <strong className="text-foreground">{easyDone + medDone + hardDone}</strong></span>
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-chart-4 text-chart-4 shrink-0" />
                  <strong className="text-foreground">{important}</strong> imp
                </span>
                {totalTime > 0 && (
                  <button type="button" onClick={onTimeClick} className="flex items-center gap-1 hover:text-secondary transition-colors active:scale-95 text-left">
                    <Clock className="w-3 h-3 text-secondary shrink-0" />
                    <strong className="text-secondary underline underline-offset-2 decoration-secondary/30 truncate">{formatStudyTime(totalTime)}</strong>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
