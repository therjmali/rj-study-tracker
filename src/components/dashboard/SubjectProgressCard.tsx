import { useState, useMemo } from 'react';
import { readableInk } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Star, BookOpen } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@project/components/ui/tooltip';
import type { Subject } from '../../types';
import type { DifficultyFilter } from '../../lib/studySuggestion';
import { getUnitProgress, unitStatusEmoji } from '../../lib/unitProgress';
import CircularProgress from '../shared/CircularProgress';
import SubjectLink from '../shared/SubjectLink';

interface Props {
  subjects: Subject[];
  difficultyFilter: DifficultyFilter;
  onNavigate: (tab: string, filter?: Record<string, string>) => void;
}

export default function SubjectProgressCard({ subjects, difficultyFilter, onNavigate }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const overall = useMemo(() => {
    let total = 0, done = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (difficultyFilter !== 'all' && t.difficulty !== difficultyFilter) return;
      total++; if (t.completed) done++;
    })));
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [subjects, difficultyFilter]);

  // Subject stats + topic distribution data
  const subjectStats = useMemo(() => subjects.map(s => {
    let total = 0, done = 0, imp = 0, impDone = 0;
    const allTopics = s.units.reduce((a, u) => a + u.subTopics.length, 0);
    const unitStats: { id: string; name: string; total: number; done: number }[] = [];
    s.units.forEach(u => {
      let uTotal = 0, uDone = 0;
      u.subTopics.forEach(t => {
        if (difficultyFilter !== 'all' && t.difficulty !== difficultyFilter) return;
        total++; uTotal++;
        if (t.completed) { done++; uDone++; }
        if (t.important) { imp++; if (t.completed) impDone++; }
      });
      unitStats.push({ id: u.id, name: u.name, total: uTotal, done: uDone });
    });
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const daysLeft = Math.max(0, Math.ceil((new Date(s.examDate).getTime() - Date.now()) / 86400000));
    return { ...s, total, done, pct, imp, impDone, daysLeft, unitStats, allTopics };
  }), [subjects, difficultyFilter]);

  const grandTotal = subjectStats.reduce((a, s) => a + s.allTopics, 0);

  if (subjects.length === 0) return null;

  return (
    <div className="glass-card p-4 relative overflow-hidden mt-1.5">
      <div className="absolute bottom-0 right-0 w-32 h-32 rounded-full bg-accent/5 blur-3xl -mr-10 -mb-10 pointer-events-none" />

      <div className="flex items-center justify-between mb-3 relative z-10">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" /> Subject Progress & Distribution
        </h3>
        <span className="text-[9px] px-2.5 py-1 rounded-full bg-primary/15 text-primary font-bold border border-primary/20">
          {overall.pct}% · {overall.done}/{overall.total}
        </span>
      </div>

      {/* Stacked topic distribution bar */}
      <TooltipProvider>
        <div className="mb-3 relative z-10">
          <p className="text-[9px] text-muted-foreground font-semibold mb-1">📊 Topic Share</p>
          <div className="h-3 rounded-full overflow-hidden flex bg-muted/20">
            {subjectStats.map(s => {
              const widthPct = grandTotal > 0 ? (s.allTopics / grandTotal) * 100 : 0;
              if (widthPct < 1) return null;
              return (
                <Tooltip key={s.id}>
                  <TooltipTrigger asChild>
                    <motion.div
                      className="h-full first:rounded-l-full last:rounded-r-full cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: s.color, width: `${widthPct}%` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPct}%` }}
                      transition={{ duration: 0.6, delay: 0.1 }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs font-bold">
                    {s.shortName}: {s.allTopics} topics ({Math.round(widthPct)}%)
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          {/* Legend row */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
            {subjectStats.map(s => (
              <div key={s.id} className="flex items-center gap-1 text-[9px]">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-muted-foreground">{s.shortName}</span>
                <span className="font-mono text-foreground font-bold">{s.allTopics}</span>
              </div>
            ))}
          </div>
        </div>
      </TooltipProvider>

      {/* Overall progress bar */}
      <div className="mb-3 relative z-10">
        <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
            initial={{ width: 0 }} animate={{ width: `${overall.pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
        </div>
      </div>

      {/* Subject rows */}
      <div className="space-y-1.5 relative z-10">
        {subjectStats.map(s => {
          const isExpanded = expandedId === s.id;
          return (
            <div key={s.id} className="rounded-xl border border-border/10 bg-card/20 overflow-hidden">
              <button onClick={() => setExpandedId(isExpanded ? null : s.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/5 transition-colors active:scale-[0.995]">
                <div className="w-2 h-full min-h-[32px] rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                
                <CircularProgress value={s.done} max={s.total} size={36} strokeWidth={3} color={s.color} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <SubjectLink shortName={s.shortName} color={s.color} subjectId={s.id} onNavigate={onNavigate} variant="text" />
                    {s.imp > 0 && (
                      <span className="flex items-center gap-0.5 text-[8px] font-bold text-chart-4">
                        <Star className="w-2.5 h-2.5 fill-chart-4 text-chart-4" />{s.impDone}/{s.imp}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-[10px] font-bold font-mono" style={{ color: readableInk(s.color) }}>{s.pct}%</p>
                    <p className="text-[8px] text-muted-foreground font-mono">{s.done}/{s.total}</p>
                  </div>
                  {s.daysLeft > 0 && s.daysLeft <= 30 && (
                    <span className={`text-[7px] px-1.5 py-0.5 rounded font-bold ${
                      s.daysLeft <= 7 ? 'bg-destructive/15 text-destructive' :
                      s.daysLeft <= 14 ? 'bg-chart-4/15 text-chart-4' :
                      'bg-secondary/15 text-secondary'
                    }`}>{s.daysLeft}d</span>
                  )}
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="px-3 pb-3 pt-1 ml-4 space-y-1.5 border-t border-border/10">
                      {s.unitStats.map(u => {
                        const uPct = u.total > 0 ? Math.round((u.done / u.total) * 100) : 0;
                        return (
                          <button key={u.id} onClick={() => onNavigate('syllabus', { subjectId: s.id, unitId: u.id })} className="w-full flex items-center gap-2 rounded-lg p-1 -m-1 hover:bg-card/40 transition-all active:scale-[0.98] group/unit cursor-pointer">
                            <span className="text-[10px] text-muted-foreground flex-1 truncate text-left group-hover/unit:text-foreground transition-colors">{u.name}</span>
                            <div className="w-20 h-1.5 rounded-full bg-muted/20 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${uPct}%`, backgroundColor: s.color, opacity: 0.7 }} />
                            </div>
                            <span className="text-[9px] font-mono text-muted-foreground w-14 text-right">{u.done}/{u.total}</span>
                            <ChevronRight className="w-3 h-3 text-muted-foreground/0 group-hover/unit:text-muted-foreground transition-all shrink-0" />
                          </button>
                        );
                      })}
                      <button onClick={() => onNavigate('syllabus', { subjectId: s.id })}
                        className="text-[9px] font-bold text-primary hover:underline mt-1 flex items-center gap-0.5 group/open">
                        Open in Syllabus <ChevronRight className="w-3 h-3 group-hover/open:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
