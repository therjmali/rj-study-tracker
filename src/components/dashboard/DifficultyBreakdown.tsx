import { useState, useMemo } from 'react';
import { Star, CheckCircle2, Circle, X, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import BottomSheet from '../shared/BottomSheet';
import type { Subject, SubTopic } from '../../types';
import type { DifficultyFilter } from '../../lib/studySuggestion';
import { formatDate } from '../../lib/utils';

type FilterMode = 'Easy' | 'Medium' | 'Hard' | 'Important' | null;

interface Props {
  subjects: Subject[];
  onNavigate: (tab: string, filter?: Record<string, string>) => void;
  onToggleTopic?: (subjectId: string, unitId: string, topicId: string) => void;
  activeDiffFilter?: DifficultyFilter;
  onDiffFilterChange?: (f: DifficultyFilter) => void;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string) => void;
}

export default function DifficultyBreakdown({ subjects, onNavigate, onToggleTopic, activeDiffFilter, onDiffFilterChange, onOpenTopicDetail }: Props) {
  const [filterOpen, setFilterOpen] = useState<FilterMode>(null);

  const { easy, med, hard, total, done, impTotal } = useMemo(() => {
    let eT = 0, eD = 0, mT = 0, mD = 0, hT = 0, hD = 0, impT = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.difficulty === 'Easy') { eT++; if (t.completed) eD++; }
      if (t.difficulty === 'Medium') { mT++; if (t.completed) mD++; }
      if (t.difficulty === 'Hard') { hT++; if (t.completed) hD++; }
      if (t.important) impT++;
    })));
    return { easy: { total: eT, done: eD }, med: { total: mT, done: mD }, hard: { total: hT, done: hD }, total: eT + mT + hT, done: eD + mD + hD, impTotal: impT };
  }, [subjects]);

  const filteredTopics = useMemo(() => {
    if (!filterOpen) return [];
    const items: { subject: Subject; unitName: string; unitId: string; topic: SubTopic }[] = [];
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (filterOpen === 'Important' && t.important) items.push({ subject: s, unitName: u.name, unitId: u.id, topic: t });
      else if (filterOpen !== 'Important' && t.difficulty === filterOpen) items.push({ subject: s, unitName: u.name, unitId: u.id, topic: t });
    })));
    return items;
  }, [subjects, filterOpen]);

  const groupedTopics = useMemo(() => {
    const map = new Map<string, typeof filteredTopics>();
    filteredTopics.forEach(item => {
      const arr = map.get(item.subject.id) || [];
      arr.push(item);
      map.set(item.subject.id, arr);
    });
    return Array.from(map.entries());
  }, [filteredTopics]);

  const rows = [
    { label: '🟢 Easy', dotColor: 'bg-diff-easy', barColor: 'bg-diff-easy', glowColor: '0 0 12px hsl(var(--diff-easy) / 0.25)', data: easy, filter: 'Easy' as const },
    { label: '🟡 Medium', dotColor: 'bg-diff-medium', barColor: 'bg-diff-medium', glowColor: '0 0 12px hsl(var(--diff-medium) / 0.25)', data: med, filter: 'Medium' as const },
    { label: '🔴 Hard', dotColor: 'bg-diff-hard', barColor: 'bg-diff-hard', glowColor: '0 0 12px hsl(var(--diff-hard) / 0.25)', data: hard, filter: 'Hard' as const },
  ];

  const filterDoneCount = filteredTopics.filter(i => i.topic.completed).length;

  const handleRowClick = (filter: 'Easy' | 'Medium' | 'Hard') => {
    // If we have an inline filter callback, use it to filter the whole dashboard
    if (onDiffFilterChange) {
      const newFilter: DifficultyFilter = activeDiffFilter === filter ? 'all' : filter;
      onDiffFilterChange(newFilter);
    } else {
      setFilterOpen(filter);
    }
  };

  return (
    <>
      <div className="glass-card p-4 space-y-3 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-28 h-28 rounded-full bg-destructive/5 blur-3xl -mr-10 -mt-10 pointer-events-none" />

        <div className="relative z-10">
          <h3 className="text-sm font-bold text-foreground">🔥 Difficulty Breakdown</h3>
          <p className="text-[9px] text-muted-foreground">
            {onDiffFilterChange ? 'Tap a row to filter the entire dashboard' : 'Tap a row to view matching topics'}
          </p>
        </div>

        <div className="space-y-3 relative z-10">
          {rows.map(r => {
            const pct = r.data.total > 0 ? Math.round((r.data.done / r.data.total) * 100) : 0;
            const isActive = activeDiffFilter === r.filter;
            return (
              <button key={r.label} onClick={() => handleRowClick(r.filter)}
                className={`w-full flex items-center gap-3 group rounded-xl p-2 -mx-1 transition-all active:scale-[0.98] ${
                  isActive ? 'bg-card/60 border border-border/30 shadow-md' : 'hover:bg-card/50 border border-transparent'
                }`}
                style={isActive ? { boxShadow: r.glowColor } : undefined}>
                <span className={`text-xs font-bold w-24 ${isActive ? 'text-foreground' : 'text-foreground'}`}>{r.label}</span>
                <div className="flex-1 h-2.5 rounded-full bg-muted/30 overflow-hidden">
                  <div className={`h-full rounded-full ${r.barColor} transition-all duration-700 shadow-sm`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground w-24 text-right font-semibold">{r.data.done}/{r.data.total} · {pct}%</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-border/15 text-[10px] text-muted-foreground flex-wrap relative z-10">
          <span>Total: <b className="text-foreground font-mono">{total}</b></span>
          <span>Done: <b className="text-secondary font-mono">{done}</b></span>
          <button onClick={() => setFilterOpen('Important')}
            className="flex items-center gap-1 hover:text-chart-4 transition-colors active:scale-95">
            <Star className="w-3 h-3 fill-chart-4 text-chart-4" />
            <b className="text-foreground font-mono">{impTotal}</b> Important
          </button>
        </div>
      </div>

      {/* Bottom Sheet for detailed view */}
      <BottomSheet open={!!filterOpen} onClose={() => setFilterOpen(null)}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {filterOpen === 'Easy' ? '🟢' : filterOpen === 'Medium' ? '🟡' : filterOpen === 'Hard' ? '🔴' : '⭐'}{' '}
              {filterOpen} Topics
            </h3>
            <p className="text-[10px] text-muted-foreground">{filterDoneCount}/{filteredTopics.length} completed</p>
          </div>
          <button onClick={() => setFilterOpen(null)}
            className="w-9 h-9 rounded-full bg-muted/30 flex items-center justify-center hover:bg-destructive/20 transition-all active:scale-90">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-3">
          {groupedTopics.map(([subjectId, items]) => {
            const subject = items[0].subject;
            return (
              <div key={subjectId}>
                <div className="flex items-center gap-2 mb-1.5 sticky top-0 bg-card/90 backdrop-blur-sm py-1 z-10">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
                  <span className="text-[10px] font-bold" style={{ color: subject.color }}>{subject.shortName}</span>
                  <span className="text-[10px] text-muted-foreground">{subject.name}</span>
                  <span className="text-[9px] text-muted-foreground/60 ml-auto">{items.filter(i => i.topic.completed).length}/{items.length}</span>
                </div>
                <div className="space-y-1">
                  {items.map(item => (
                    <motion.button
                      key={item.topic.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => onOpenTopicDetail ? onOpenTopicDetail(item.topic, item.subject.id, item.unitId) : onToggleTopic?.(item.subject.id, item.unitId, item.topic.id)}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-lg border transition-all text-left active:scale-[0.98] group/topic ${
                        item.topic.completed ? 'bg-muted/10 border-border/10 opacity-60' : 'bg-card/40 border-border/20 hover:border-primary/20'
                      }`}
                    >
                      {item.topic.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-diff-easy shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground/30 group-hover/topic:text-primary shrink-0 transition-colors" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs ${item.topic.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {item.topic.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] text-muted-foreground truncate">{item.unitName}</span>
                          {item.topic.completedDate && (
                            <span className="text-[8px] text-muted-foreground/60 font-mono">{formatDate(item.topic.completedDate)}</span>
                          )}
                        </div>
                      </div>
                      {item.topic.important && <Star className="w-3 h-3 fill-chart-4 text-chart-4 shrink-0" />}
                      {onOpenTopicDetail && <ExternalLink className="w-3 h-3 text-muted-foreground/30 group-hover/topic:text-primary shrink-0 transition-colors" />}
                    </motion.button>
                  ))}
                </div>
              </div>
            );
          })}
          {filteredTopics.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No {filterOpen?.toLowerCase()} topics found</p>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
