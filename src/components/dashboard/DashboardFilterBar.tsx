import { useMemo } from 'react';
import type { DifficultyFilter } from '../../lib/studySuggestion';
import type { Subject } from '../../types';
import { Input } from '@project/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays } from 'lucide-react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { getLocalDateStr } from '../../lib/utils';
import TimeFilterPills from '../shared/TimeFilterPills';

type TimeFilter = 'all' | 'today' | 'weekly' | 'monthly' | 'custom';

interface Props {
  filter: DifficultyFilter;
  onFilterChange: (f: DifficultyFilter) => void;
  subjects: Subject[];
  timeFilter: TimeFilter;
  onTimeFilterChange: (t: TimeFilter) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  subjectFilter: string;
  onSubjectFilterChange: (v: string) => void;
  dailyLogs?: import('../../types').DailyLog[];
}

const DIFF_FILTERS: { id: DifficultyFilter; label: string; emoji: string; glow: string; gradient: string }[] = [
  { id: 'all', label: 'All', emoji: '📊', glow: 'shadow-primary/30', gradient: 'from-primary/20 to-primary/5' },
  { id: 'Easy', label: 'Easy', emoji: '🟢', glow: 'shadow-diff-easy/30', gradient: 'from-diff-easy/20 to-diff-easy/5' },
  { id: 'Medium', label: 'Medium', emoji: '🟡', glow: 'shadow-diff-medium/30', gradient: 'from-diff-medium/20 to-diff-medium/5' },
  { id: 'Hard', label: 'Hard', emoji: '🔴', glow: 'shadow-diff-hard/30', gradient: 'from-diff-hard/20 to-diff-hard/5' },
];

export default function DashboardFilterBar({
  filter, onFilterChange, subjects,
  timeFilter, onTimeFilterChange,
  customFrom, customTo, onCustomFromChange, onCustomToChange,
  subjectFilter, onSubjectFilterChange, dailyLogs,
}: Props) {
  const now = new Date();

  const counts = useMemo(() => {
    let all = 0, easy = 0, med = 0, hard = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      all++;
      if (t.difficulty === 'Easy') easy++;
      else if (t.difficulty === 'Medium') med++;
      else if (t.difficulty === 'Hard') hard++;
    })));
    return { all, Easy: easy, Medium: med, Hard: hard };
  }, [subjects]);

  const hasActiveFilter = filter !== 'all' || timeFilter !== 'all' || subjectFilter !== 'all';

  // Earliest data date
  const dataStartDate = useMemo(() => {
    let earliest = getLocalDateStr();
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate < earliest) earliest = t.completedDate;
    })));
    dailyLogs?.forEach(l => {
      if (l.date < earliest && (l.hoursStudied > 0 || l.topicsCompleted > 0)) earliest = l.date;
    });
    return earliest;
  }, [subjects, dailyLogs]);

  // Active date range label for badge
  const activeDateLabel = useMemo(() => {
    if (timeFilter === 'all') return null;
    if (timeFilter === 'today') return format(now, 'MMM d, yyyy');
    if (timeFilter === 'weekly') {
      const ws = startOfWeek(now, { weekStartsOn: 1 });
      const we = endOfWeek(now, { weekStartsOn: 1 });
      return `${format(ws, 'MMM d')} – ${format(we, 'MMM d')}`;
    }
    if (timeFilter === 'monthly') return format(now, 'MMMM yyyy');
    if (timeFilter === 'custom' && customFrom) {
      const to = customTo || customFrom;
      return `${format(new Date(customFrom + 'T12:00:00'), 'MMM d')} – ${format(new Date(to + 'T12:00:00'), 'MMM d, yyyy')}`;
    }
    return null;
  }, [timeFilter, customFrom, customTo]);

  // Multi-subject helpers
  const selectedIds = useMemo(() => {
    if (subjectFilter === 'all') return new Set(subjects.map(s => s.id));
    return new Set(subjectFilter.split(','));
  }, [subjectFilter, subjects]);
  const isAll = subjectFilter === 'all';

  const toggleSubject = (id: string) => {
    if (isAll) {
      const ids = subjects.filter(s => s.id !== id).map(s => s.id);
      onSubjectFilterChange(ids.length === 0 ? 'all' : ids.join(','));
    } else {
      const ids = new Set(selectedIds);
      if (ids.has(id)) { ids.delete(id); if (ids.size === 0) { onSubjectFilterChange('all'); return; } }
      else { ids.add(id); if (ids.size === subjects.length) { onSubjectFilterChange('all'); return; } }
      onSubjectFilterChange(Array.from(ids).join(','));
    }
  };

  return (
    <div className="glass-card p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          🎯 Filters
        </h3>
        {hasActiveFilter && (
          <button onClick={() => { onFilterChange('all'); onTimeFilterChange('all'); onSubjectFilterChange('all'); }}
            className="text-xs text-primary hover:text-primary/80 font-bold transition-colors">
            Clear All ✕
          </button>
        )}
      </div>

      {/* Row 1: Difficulty Pills */}
      <div className="flex gap-2">
        {DIFF_FILTERS.map(f => {
          const isActive = filter === f.id;
          const count = counts[f.id];
          return (
            <button
              key={f.id}
              onClick={() => onFilterChange(f.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-xl border transition-all duration-300 ${
                isActive
                  ? `bg-gradient-to-b ${f.gradient} border-border/40 shadow-lg ${f.glow} scale-[1.02]`
                  : 'bg-card/20 border-border/10 hover:bg-card/40 hover:border-border/20'
              }`}
            >
              <span className="text-sm">{f.emoji}</span>
              <span className={`text-sm font-bold ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                {f.label}
              </span>
              <span className={`text-xs font-mono font-semibold ${isActive ? 'text-foreground/80' : 'text-muted-foreground'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Row 2: Time Filter Pills with Flip Animation */}
      <TimeFilterPills
        timeFilter={timeFilter}
        onTimeFilterChange={onTimeFilterChange}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={onCustomFromChange}
        onCustomToChange={onCustomToChange}
        dataStartDate={dataStartDate}
      />

      {/* Active date range badge */}
      <AnimatePresence>
        {activeDateLabel && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="flex justify-center"
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/8 border border-primary/15 text-[9px] font-bold text-primary shadow-[0_0_8px_hsl(var(--primary)/0.1)]">
              <CalendarDays className="w-3 h-3" />
              {activeDateLabel}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom date pickers */}
      <AnimatePresence>
        {timeFilter === 'custom' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[9px] text-muted-foreground mb-1 block font-semibold">From</label>
                <Input type="date" value={customFrom} onChange={e => onCustomFromChange(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="flex-1">
                <label className="text-[9px] text-muted-foreground mb-1 block font-semibold">To</label>
                <Input type="date" value={customTo} onChange={e => onCustomToChange(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Row 3: Multi-Subject Chips */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-bold">📚 Subjects:</span>
          <button onClick={() => onSubjectFilterChange('all')}
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-all ${
              isAll ? 'bg-primary/15 text-primary border border-primary/20' : 'text-muted-foreground hover:text-primary'
            }`}>
            {isAll ? '✓ All' : 'Select All'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {subjects.map(s => {
            const active = isAll || selectedIds.has(s.id);
            return (
              <button key={s.id} onClick={() => toggleSubject(s.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all ${
                  active
                    ? 'bg-card/50 border-border/25 shadow-sm'
                    : 'bg-card/15 border-border/10 opacity-40 hover:opacity-60'
                }`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className={`text-[10px] font-bold ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{s.shortName}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
