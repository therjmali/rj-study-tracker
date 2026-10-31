import { motion } from 'framer-motion';
import { useCallback, useState } from 'react';
import { Tag } from 'lucide-react';

export type StatusFilter = 'all' | 'complete' | 'in_process' | 'incomplete' | 'important' | 'focus' | 'revision_due' | 'has_time';

interface StatusOption {
  id: StatusFilter;
  emoji: string;
  label: string; // tooltip only
}

const STATUS_OPTIONS: StatusOption[] = [
  { id: 'all', emoji: '📋', label: 'All Topics' },
  { id: 'complete', emoji: '✅', label: 'Completed' },
  { id: 'in_process', emoji: '🔄', label: 'In Progress' },
  { id: 'incomplete', emoji: '⭕', label: 'Remaining' },
  { id: 'important', emoji: '⭐', label: 'Starred' },
  { id: 'focus', emoji: '🎯', label: 'Focus (Starred + Incomplete)' },
  { id: 'revision_due', emoji: '🔁', label: 'Revision Due' },
  { id: 'has_time', emoji: '🔥', label: 'Has Study Time' },
];

export type DiffFilter = 'all' | 'Easy' | 'Medium' | 'Hard';

const DIFF_OPTIONS: { id: DiffFilter; emoji: string; label: string }[] = [
  { id: 'Easy', emoji: '🟢', label: 'Easy' },
  { id: 'Medium', emoji: '🟡', label: 'Medium' },
  { id: 'Hard', emoji: '🔴', label: 'Hard' },
];

interface Props {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  counts?: Partial<Record<StatusFilter, number>>;
  size?: 'sm' | 'md';
  // Difficulty filter (inline)
  diffValue?: DiffFilter;
  onDiffChange?: (v: DiffFilter) => void;
  diffCounts?: Record<DiffFilter, number>;
  // Category filter
  categories?: string[];
  activeCategory?: string;
  onCategoryChange?: (cat: string) => void;
}

export default function StatusFilterPills({
  value, onChange, counts, size = 'md',
  diffValue, onDiffChange, diffCounts,
  categories, activeCategory, onCategoryChange,
}: Props) {
  const [showCategories, setShowCategories] = useState(false);

  const handleClick = useCallback((id: StatusFilter) => {
    navigator.vibrate?.(15);
    onChange(id);
  }, [onChange]);

  const hasActiveFilter = value !== 'all' || (diffValue && diffValue !== 'all');
  const hasCategories = categories && categories.length > 0;

  const chipBase = size === 'sm'
    ? 'w-10 h-10 rounded-[14px]'
    : 'w-11 h-11 rounded-2xl';

  return (
    <div className="space-y-2">
      {/* ── Unified emoji chip strip ── */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Status chips */}
        {STATUS_OPTIONS.map(opt => {
          const isActive = value === opt.id;
          const count = counts?.[opt.id];
          return (
            <motion.button
              key={opt.id}
              onClick={() => handleClick(opt.id)}
              whileTap={{ scale: 0.85 }}
              className={`relative flex flex-col items-center justify-center ${chipBase} border shrink-0 transition-all duration-200 ${
                isActive
                  ? 'bg-accent/25 border-accent/50 shadow-lg ring-1 ring-accent/25 scale-105'
                  : 'bg-card/20 border-border/8 hover:bg-card/40 hover:border-border/20'
              }`}
              style={isActive ? {
                boxShadow: '0 4px 20px hsl(var(--accent) / 0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
              } : undefined}
              title={`${opt.label}${count !== undefined ? ` (${count})` : ''}`}
            >
              {/* Active glow pulse */}
              {isActive && (
                <div
                  className="absolute inset-0 rounded-[inherit] pointer-events-none animate-glow-opacity"
                  style={{ boxShadow: 'inset 0 0 16px hsl(var(--accent) / 0.2)' }}
                />
              )}
              <motion.span
                className="text-lg leading-none select-none relative z-10"
                animate={isActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                transition={isActive ? { duration: 0.35, ease: 'easeOut' } : undefined}
                style={isActive ? { filter: 'drop-shadow(0 2px 8px hsl(var(--accent) / 0.5))' } : undefined}
              >
                {opt.emoji}
              </motion.span>
              {/* Count badge */}
              {count !== undefined && count > 0 && (
                <motion.span
                  key={`${opt.id}-${count}`}
                  initial={{ scale: 1.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-black font-mono leading-none px-1 py-px rounded-md z-20 ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-muted/60 text-foreground/50'
                  }`}
                >
                  {count > 999 ? '999+' : count}
                </motion.span>
              )}
            </motion.button>
          );
        })}

        {/* Separator dot */}
        {onDiffChange && (
          <div className="flex items-center shrink-0 px-0.5">
            <div className="w-0.5 h-5 rounded-full bg-border/20" />
          </div>
        )}

        {/* Difficulty chips */}
        {onDiffChange && DIFF_OPTIONS.map(opt => {
          const isActive = diffValue === opt.id;
          const count = diffCounts?.[opt.id];
          return (
            <motion.button
              key={opt.id}
              onClick={() => { navigator.vibrate?.(15); onDiffChange(isActive ? 'all' : opt.id); }}
              whileTap={{ scale: 0.85 }}
              className={`relative flex flex-col items-center justify-center ${chipBase} border shrink-0 transition-all duration-200 ${
                isActive
                  ? 'bg-accent/25 border-accent/50 shadow-lg ring-1 ring-accent/25 scale-105'
                  : 'bg-card/20 border-border/8 hover:bg-card/40 hover:border-border/20'
              }`}
              style={isActive ? {
                boxShadow: '0 4px 20px hsl(var(--accent) / 0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
              } : undefined}
              title={`${opt.label}${count !== undefined ? ` (${count})` : ''}`}
            >
              {isActive && (
                <div
                  className="absolute inset-0 rounded-[inherit] pointer-events-none animate-glow-opacity"
                  style={{ boxShadow: 'inset 0 0 16px hsl(var(--accent) / 0.2)' }}
                />
              )}
              <motion.span
                className="text-lg leading-none select-none relative z-10"
                animate={isActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                transition={isActive ? { duration: 0.35, ease: 'easeOut' } : undefined}
              >
                {opt.emoji}
              </motion.span>
              {count !== undefined && count > 0 && (
                <motion.span
                  key={`diff-${opt.id}-${count}`}
                  initial={{ scale: 1.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-black font-mono leading-none px-1 py-px rounded-md z-20 ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-muted/60 text-foreground/50'
                  }`}
                >
                  {count}
                </motion.span>
              )}
            </motion.button>
          );
        })}

        {/* Category toggle */}
        {hasCategories && (
          <motion.button
            onClick={() => setShowCategories(p => !p)}
            whileTap={{ scale: 0.85 }}
            className={`relative flex flex-col items-center justify-center ${chipBase} border shrink-0 transition-all duration-200 ${
              activeCategory
                ? 'bg-accent/25 border-accent/50 shadow-lg ring-1 ring-accent/25'
                : showCategories
                  ? 'bg-primary/15 border-primary/30'
                  : 'bg-card/20 border-border/8 hover:bg-card/40'
            }`}
            title="Filter by category"
          >
            <Tag className={`w-4 h-4 ${activeCategory ? 'text-accent-foreground' : 'text-muted-foreground'}`} />
          </motion.button>
        )}
      </div>

      {/* Active filter indicator banner */}
      {hasActiveFilter && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-accent/8 border border-accent/15">
            <span className="text-[10px] font-bold text-accent-foreground/80 flex-1">
              🔍 Filtered view
              {value !== 'all' && ` · ${STATUS_OPTIONS.find(o => o.id === value)?.emoji} ${STATUS_OPTIONS.find(o => o.id === value)?.label}`}
              {diffValue && diffValue !== 'all' && ` · ${DIFF_OPTIONS.find(o => o.id === diffValue)?.emoji} ${diffValue}`}
            </span>
            <button
              onClick={() => { onChange('all'); onDiffChange?.('all'); }}
              className="text-[9px] font-bold text-destructive hover:underline px-1.5 py-0.5 rounded hover:bg-destructive/10 transition-colors"
            >
              Clear
            </button>
          </div>
        </motion.div>
      )}

      {/* Category dropdown row */}
      {hasCategories && showCategories && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden"
        >
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-0.5 pl-0.5" style={{ WebkitOverflowScrolling: 'touch' }}>
            <button
              onClick={() => onCategoryChange?.('')}
              className={`text-[10px] px-2 py-1 rounded-lg font-bold border whitespace-nowrap transition-all shrink-0 ${
                !activeCategory ? 'bg-primary/15 text-primary border-primary/30' : 'bg-card/20 text-foreground/60 border-border/10 hover:bg-card/40'
              }`}
            >
              All
            </button>
            {categories!.map(cat => (
              <button
                key={cat}
                onClick={() => onCategoryChange?.(activeCategory === cat ? '' : cat)}
                className={`text-[10px] px-2 py-1 rounded-lg font-bold border whitespace-nowrap transition-all shrink-0 ${
                  activeCategory === cat ? 'bg-accent/20 text-accent-foreground border-accent/30' : 'bg-card/20 text-foreground/60 border-border/10 hover:bg-card/40'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
