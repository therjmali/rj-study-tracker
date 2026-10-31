import { useState, useMemo, useCallback, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronDown, ChevronRight, Clock, CheckCircle2, Circle, Loader2, Eye, Filter, X, BarChart3 } from 'lucide-react';
import type { Subject, SubTopic, RevisionKey, TopicNavRef } from '../../types';
import { formatStudyTime } from '../../lib/utils';
import { getUnitProgress } from '../../lib/unitProgress';
import StatusFilterPills, { type StatusFilter } from '../shared/StatusFilterPills';
import SubjectRevisionCard from './SubjectRevisionCard';
import SubjectDifficultyCard from './SubjectDifficultyCard';

interface Props {
  subject: Subject;
  onToggleTopic?: (subjectId: string, unitId: string, topicId: string) => void;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string, navList?: TopicNavRef[]) => void;
  onOpenUnitEditor?: (subjectId: string, unitId: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  diffFilter?: DiffFilter;
  onDiffFilterChange?: (f: DiffFilter) => void;
  parentDiffFilter?: DiffFilter;
  statusFilter?: StatusFilter;
  onStatusFilterChange?: (f: StatusFilter) => void;
  /** Completed topics still missing this revision round (null = no filter) */
  revisionFilter?: RevisionKey | null;
  onRevisionFilterChange?: (r: RevisionKey | null) => void;
}

const formatTimeSpent = formatStudyTime;

type DiffFilter = 'all' | 'Easy' | 'Medium' | 'Hard';

const MAX_BLOCKS_PER_UNIT = 25;

export default function SubjectOverview({ subject, onToggleTopic, onOpenTopicDetail, onOpenUnitEditor, collapsed, onToggleCollapse, diffFilter: externalDiffFilter, onDiffFilterChange, parentDiffFilter, statusFilter: externalStatusFilter, onStatusFilterChange, revisionFilter: externalRevisionFilter, onRevisionFilterChange }: Props) {
  const [internalDiffFilter, setInternalDiffFilter] = useState<DiffFilter>('all');
  const diffFilter = externalDiffFilter ?? internalDiffFilter;
  const setDiffFilter = onDiffFilterChange ?? setInternalDiffFilter;
  const [internalStatusFilter, setInternalStatusFilter] = useState<StatusFilter>('all');
  const statusFilter = externalStatusFilter ?? internalStatusFilter;
  const setStatusFilter = onStatusFilterChange ?? setInternalStatusFilter;
  const [internalRevisionFilter, setInternalRevisionFilter] = useState<RevisionKey | null>(null);
  const revisionFilter = externalRevisionFilter !== undefined ? externalRevisionFilter : internalRevisionFilter;
  const setRevisionFilter = onRevisionFilterChange ?? setInternalRevisionFilter;
  const [showTimeBreakdown, setShowTimeBreakdown] = useState(false);
  const [activeStatFilter, setActiveStatFilter] = useState<'completed' | 'remaining' | 'important' | null>(null);
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const stats = useMemo(() => {
    const all = subject.units.flatMap(u => u.subTopics);
    const done = all.filter(t => t.completed).length;
    const total = all.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const easy = all.filter(t => t.difficulty === 'Easy');
    const med = all.filter(t => t.difficulty === 'Medium');
    const hard = all.filter(t => t.difficulty === 'Hard');
    const easyDone = easy.filter(t => t.completed).length;
    const medDone = med.filter(t => t.completed).length;
    const hardDone = hard.filter(t => t.completed).length;
    const important = all.filter(t => t.important).length;
    const importantDone = all.filter(t => t.important && t.completed).length;
    const totalTime = all.reduce((a, t) => a + (t.timeSpent || 0), 0);
    const inProcess = all.filter(t => t.status === 'in_process').length;
    return { done, total, pct, easy: easy.length, med: med.length, hard: hard.length, easyDone, medDone, hardDone, important, importantDone, totalTime, inProcess };
  }, [subject]);

  const unitTimeBreakdown = useMemo(() => {
    return subject.units.map(u => {
      const time = u.subTopics.reduce((a, t) => a + (t.timeSpent || 0), 0);
      const done = u.subTopics.filter(t => t.completed).length;
      return { id: u.id, name: u.name, time, total: u.subTopics.length, done };
    }).filter(u => u.time > 0).sort((a, b) => b.time - a.time);
  }, [subject]);

  // Star rating distribution
  const starDist = useMemo(() => {
    const all = subject.units.flatMap(u => u.subTopics);
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    all.forEach(t => { if (t.rank) dist[t.rank] = (dist[t.rank] || 0) + 1; });
    const unrated = all.filter(t => !t.rank).length;
    return { dist, unrated, total: all.length };
  }, [subject]);

  // Category distribution
  const categoryDist = useMemo(() => {
    const all = subject.units.flatMap(u => u.subTopics);
    const map = new Map<string, number>();
    let uncategorized = 0;
    all.forEach(t => {
      if (t.category) map.set(t.category, (map.get(t.category) || 0) + 1);
      else uncategorized++;
    });
    return { categories: Array.from(map.entries()).sort((a, b) => b[1] - a[1]), uncategorized };
  }, [subject]);

  const hasStarOrCategory = starDist.total - starDist.unrated > 0 || categoryDist.categories.length > 0;

  const statusCounts = useMemo(() => ({
    all: subject.units.flatMap(u => u.subTopics).length,
    complete: subject.units.flatMap(u => u.subTopics).filter(t => t.completed).length,
    in_process: subject.units.flatMap(u => u.subTopics).filter(t => t.status === 'in_process').length,
    incomplete: subject.units.flatMap(u => u.subTopics).filter(t => !t.completed && t.status !== 'in_process').length,
    important: subject.units.flatMap(u => u.subTopics).filter(t => t.important).length,
    focus: subject.units.flatMap(u => u.subTopics).filter(t => t.important && !t.completed).length,
  }), [subject]);

  return (
    <div className="space-y-3 px-3 sm:px-4 pb-3">
      {/* ═══ PROGRESS BAR — always visible ═══ */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-black shrink-0 max-w-[60px] truncate" style={{ color: subject.color }}>{subject.shortName}</span>
        <div className="flex-1 h-3.5 rounded-full bg-muted/30 overflow-hidden min-w-0">
          <div className="h-full rounded-full transition-all duration-700" style={{ backgroundColor: subject.color, width: `${stats.pct}%` }} />
        </div>
        <span className="text-[11px] font-mono font-bold text-muted-foreground shrink-0">{stats.done}/{stats.total}</span>
        <span className="text-[12px] font-black font-mono text-foreground shrink-0">{stats.pct}%</span>
      </div>

      {/* ═══ QUICK STATS ROW — always visible ═══ */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide min-w-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex items-center gap-1 shrink-0">
            <Star className="w-3.5 h-3.5 fill-chart-4 text-chart-4 shrink-0" />
            <span className="text-[12px] text-chart-4 font-bold whitespace-nowrap">{stats.importantDone}/{stats.important} imp</span>
          </div>
          {stats.totalTime > 0 && (
            <button onClick={() => setShowTimeBreakdown(p => !p)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg hover:bg-muted/30 transition-colors active:scale-95 shrink-0">
              <Clock className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-[12px] text-secondary font-bold underline underline-offset-2 decoration-secondary/30 whitespace-nowrap">{formatTimeSpent(stats.totalTime)}</span>
              <Eye className="w-3 h-3 text-secondary/50 shrink-0" />
            </button>
          )}
          {stats.inProcess > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <Loader2 className="w-3.5 h-3.5 text-chart-4 shrink-0" />
              <span className="text-[12px] text-chart-4 font-bold whitespace-nowrap">{stats.inProcess} WIP</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ DIFFICULTY BREAKDOWN — collapsed by default, tap to expand ═══ */}
      <SubjectDifficultyCard
        easy={stats.easy} easyDone={stats.easyDone}
        med={stats.med} medDone={stats.medDone}
        hard={stats.hard} hardDone={stats.hardDone}
        important={stats.important} totalTime={stats.totalTime}
        diffFilter={diffFilter} onFilterChange={setDiffFilter}
        onTimeClick={() => setShowTimeBreakdown(p => !p)}
      />

      {/* ═══ REVISION — collapsed by default, swipeable R1–R4 cards when expanded ═══ */}
      <SubjectRevisionCard
        subject={subject}
        activeRound={revisionFilter}
        onRoundChange={setRevisionFilter}
        onOpenTopicDetail={onOpenTopicDetail}
      />

      {/* ═══ STAR & CATEGORY FILTERS — collapsible ═══ */}
      {hasStarOrCategory && (
        <div className="glass-subtle rounded-xl overflow-hidden">
          <button onClick={() => setMoreFiltersOpen(p => !p)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/15 transition-colors">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] font-bold text-foreground/70">Star & Category Filters</span>
              {(starFilter !== null || categoryFilter !== null) && (
                <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">
                  {[starFilter !== null && `★${starFilter}`, categoryFilter].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {(starFilter !== null || categoryFilter !== null) && (
                <button onClick={e => { e.stopPropagation(); setStarFilter(null); setCategoryFilter(null); }}
                  className="text-[9px] text-destructive font-bold hover:underline px-1.5 py-0.5 rounded hover:bg-destructive/10 transition-colors">
                  Clear
                </button>
              )}
              {moreFiltersOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
          </button>
          <AnimatePresence>
            {moreFiltersOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-4 pb-3 space-y-3 border-t border-border/10 pt-3">
                  {/* ⭐ Star Rating Filter */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.15em]">⭐ Star Rating</span>
                    <div className="flex gap-1.5 items-center flex-wrap">
                      {([1, 2, 3, 4, 5] as const).map(star => {
                        const count = starDist.dist[star] || 0;
                        const isActive = starFilter === star;
                        return (
                          <button key={star} onClick={() => setStarFilter(isActive ? null : star)}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all active:scale-95 ${
                              isActive ? 'bg-chart-4/15 border-chart-4/30 text-chart-4 ring-1 ring-chart-4/25' : 'bg-card/30 border-border/15 text-foreground/60 hover:bg-card/50'
                            }`}>
                            <span className="text-xs">{'★'.repeat(star)}</span>
                            <span className="font-mono text-[10px]">{count}</span>
                          </button>
                        );
                      })}
                      {starDist.unrated > 0 && (
                        <span className="text-[9px] text-muted-foreground/50 font-semibold">{starDist.unrated} unrated</span>
                      )}
                    </div>
                  </div>

                  {/* 📂 Category Filter */}
                  {categoryDist.categories.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.15em]">📂 Category</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {categoryDist.categories.map(([cat, count]) => {
                          const isActive = categoryFilter === cat;
                          return (
                            <button key={cat} onClick={() => setCategoryFilter(isActive ? null : cat)}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all active:scale-95 ${
                                isActive ? 'bg-accent/15 border-accent/30 text-accent-foreground ring-1 ring-accent/25' : 'bg-card/30 border-border/15 text-foreground/60 hover:bg-card/50'
                              }`}>
                              <span>{cat}</span>
                              <span className="font-mono text-[10px] bg-muted/30 px-1 rounded">{count}</span>
                            </button>
                          );
                        })}
                        {categoryDist.uncategorized > 0 && (
                          <span className="text-[9px] text-muted-foreground/50 font-semibold self-center">{categoryDist.uncategorized} uncategorized</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ═══ ACTIVE FILTER INDICATOR — always visible ═══ */}
      {diffFilter !== 'all' && (() => {
        const isFromParent = parentDiffFilter && parentDiffFilter !== 'all' && diffFilter === parentDiffFilter;
        const diffEmoji = diffFilter === 'Easy' ? '🟢' : diffFilter === 'Medium' ? '🟡' : '🔴';
        return (
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border animate-in fade-in duration-150 ${isFromParent ? 'bg-primary/8 border-primary/20' : 'bg-accent/10 border-accent/20'}`}>
            <Filter className={`w-3.5 h-3.5 shrink-0 ${isFromParent ? 'text-primary' : 'text-accent-foreground'}`} />
            <div className="flex-1 min-w-0">
              <span className={`text-xs font-bold ${isFromParent ? 'text-primary' : 'text-accent-foreground'}`}>
                {diffEmoji} Showing {diffFilter} topics only
              </span>
              <p className="text-[10px] text-muted-foreground/70 font-medium mt-0.5">
                {isFromParent ? '🔗 Synced from syllabus filter' : '🎯 Subject-level filter'}
              </p>
            </div>
            <button onClick={() => setDiffFilter(parentDiffFilter && parentDiffFilter !== 'all' ? parentDiffFilter : 'all')}
              className={`p-1.5 rounded-lg active:scale-90 transition-all ${isFromParent ? 'hover:bg-primary/15' : 'hover:bg-accent/20'}`}>
              <X className={`w-3.5 h-3.5 ${isFromParent ? 'text-primary' : 'text-accent-foreground'}`} />
            </button>
          </div>
        );
      })()}

      {/* ═══ STATUS FILTER PILLS — always visible ═══ */}
      <StatusFilterPills value={statusFilter} onChange={setStatusFilter} size="sm" counts={statusCounts} />

      {/* ═══ TIME BREAKDOWN DRILL-DOWN — shown on demand ═══ */}
      <AnimatePresence>
        {showTimeBreakdown && stats.totalTime > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <TimeBreakdown
              units={unitTimeBreakdown}
              totalTime={stats.totalTime}
              subjectColor={subject.color}
              onUnitClick={(unitId) => onOpenUnitEditor?.(subject.id, unitId)}
              onClose={() => setShowTimeBreakdown(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SHOW/HIDE DETAILS TOGGLE — for stat cards + unit blocks ═══ */}
      {onToggleCollapse && (
        <button onClick={onToggleCollapse}
          className="flex items-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl hover:bg-muted/20 font-semibold border border-border/10 bg-card/20">
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <BarChart3 className="w-3.5 h-3.5" />
          {collapsed ? 'Show detailed stats & unit map' : 'Hide detailed stats & unit map'}
          <span className="ml-auto text-[10px] font-mono text-muted-foreground/50">{subject.units.length} units</span>
        </button>
      )}

      {/* ═══ COLLAPSIBLE HEAVY CONTENT ═══ */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-1">
              {/* ===== SUBJECT-LEVEL STATS GRID ===== */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MiniStatCard label="Completed" value={stats.done} total={stats.total}
                  emoji="✅" icon={<CheckCircle2 className="w-4 h-4 text-diff-easy" />}
                  color={`bg-diff-easy/10 border-diff-easy/20 ${activeStatFilter === 'completed' ? 'ring-2 ring-diff-easy/40 scale-[1.02]' : ''}`}
                  onClick={() => setActiveStatFilter(p => p === 'completed' ? null : 'completed')}
                  subtitle={`${stats.pct}% done`} />
                <MiniStatCard label="Remaining" value={stats.total - stats.done} total={stats.total}
                  emoji="📚" icon={<Circle className="w-4 h-4 text-muted-foreground" />}
                  color={`bg-muted/10 border-border/20 ${activeStatFilter === 'remaining' ? 'ring-2 ring-primary/40 scale-[1.02]' : ''}`}
                  onClick={() => setActiveStatFilter(p => p === 'remaining' ? null : 'remaining')}
                  subtitle={`${100 - stats.pct}% left`} />
                <MiniStatCard label="Important" value={stats.importantDone} total={stats.important}
                  emoji="⭐" icon={<Star className="w-4 h-4 fill-chart-4 text-chart-4" />}
                  color={`bg-chart-4/10 border-chart-4/20 ${activeStatFilter === 'important' ? 'ring-2 ring-chart-4/40 scale-[1.02]' : ''}`}
                  onClick={() => setActiveStatFilter(p => p === 'important' ? null : 'important')}
                  subtitle={stats.important > 0 ? `${Math.round((stats.importantDone / stats.important) * 100)}% done` : 'None marked'} />
                <MiniStatCard label="Time Spent" value={null} total={null}
                  emoji="⏱️" icon={<Clock className="w-4 h-4 text-secondary" />}
                  color={`bg-secondary/10 border-secondary/20 ${showTimeBreakdown ? 'ring-2 ring-secondary/40 scale-[1.02]' : ''}`}
                  displayValue={formatTimeSpent(stats.totalTime)} onClick={() => setShowTimeBreakdown(p => !p)}
                  subtitle={unitTimeBreakdown.length > 0 ? `${unitTimeBreakdown.length} units tracked` : 'Tap to see breakdown'} />
              </div>

              {/* ===== ACTIVE STAT FILTER RESULTS ===== */}
              <AnimatePresence>
                {activeStatFilter && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <StatFilterResults
                      filter={activeStatFilter}
                      subject={subject}
                      onClose={() => setActiveStatFilter(null)}
                      onOpenTopicDetail={onOpenTopicDetail}
                      onOpenUnitEditor={onOpenUnitEditor}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ===== UNIT TOPIC BLOCKS ===== */}
              <div className="space-y-2">
                {subject.units.map((unit, idx) => {
                  let unitTopics = diffFilter === 'all' ? unit.subTopics : unit.subTopics.filter(t => t.difficulty === diffFilter);
                  if (statusFilter !== 'all') {
                    unitTopics = unitTopics.filter(t => {
                      switch (statusFilter) {
                        case 'complete': return t.completed;
                        case 'in_process': return t.status === 'in_process';
                        case 'incomplete': return !t.completed && t.status !== 'in_process';
                        case 'important': return t.important;
                        case 'focus': return t.important && !t.completed;
                        default: return true;
                      }
                    });
                  }
                  if (starFilter !== null) unitTopics = unitTopics.filter(t => t.rank === starFilter);
                  if (categoryFilter !== null) unitTopics = unitTopics.filter(t => t.category === categoryFilter);
                  if (revisionFilter) unitTopics = unitTopics.filter(t => t.completed === true && t.revisions?.[revisionFilter]?.status !== 'complete');
                  const hasAnyFilter = diffFilter !== 'all' || statusFilter !== 'all' || starFilter !== null || categoryFilter !== null || !!revisionFilter;
                  if (hasAnyFilter && unitTopics.length === 0) return null;

                  const unitDone = unitTopics.filter(t => t.completed).length;
                  const unitTotal = unitTopics.length;
                  const unitProg = getUnitProgress(unitDone, unitTotal);
                  const allDone = unitProg.status === 'complete';
                  const unitTime = unitTopics.reduce((a, t) => a + (t.timeSpent || 0), 0);
                  const visibleTopics = unitTopics.slice(0, MAX_BLOCKS_PER_UNIT);
                  const overflow = unitTopics.length - MAX_BLOCKS_PER_UNIT;
                  return (
                    <div key={unit.id} className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-muted-foreground/50 w-5 shrink-0 text-center">{idx + 1}</span>
                      <button
                        onClick={() => onOpenUnitEditor?.(subject.id, unit.id)}
                        className="text-xs text-muted-foreground w-24 sm:w-32 break-words shrink-0 text-left hover:text-primary hover:underline underline-offset-2 transition-colors cursor-pointer font-semibold"
                        title={`${unit.name} — Tap to open unit`}
                      >{unit.name}</button>
                      <div className="flex gap-0.5 flex-wrap flex-1 min-w-0">
                        {visibleTopics.map(topic => (
                          <TopicBlock key={topic.id} topic={topic} subjectColor={subject.color}
                            onToggle={onToggleTopic ? () => onToggleTopic(subject.id, unit.id, topic.id) : undefined}
                            onDetail={onOpenTopicDetail ? () => onOpenTopicDetail(topic, subject.id, unit.id) : undefined} />
                        ))}
                        {overflow > 0 && (
                          <button
                            onClick={() => onOpenUnitEditor?.(subject.id, unit.id)}
                            className="h-4 sm:h-5 px-1.5 rounded-[3px] text-[9px] font-bold text-muted-foreground bg-muted/30 border border-border/20 shrink-0 hover:bg-muted/50 transition-colors"
                            title={`+${overflow} more topics — tap to open unit`}
                          >
                            +{overflow}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {unitTime > 0 && (
                          <button onClick={() => onOpenUnitEditor?.(subject.id, unit.id)}
                            className="text-[10px] font-mono text-secondary/70 hover:text-secondary transition-colors" title="Time spent in this unit">
                            ⏱️{formatTimeSpent(unitTime)}
                          </button>
                        )}
                        <span className="text-xs font-mono text-muted-foreground w-12 text-right font-semibold">{unitDone}/{unitTotal}</span>
                        {allDone && <CheckCircle2 className="w-3.5 h-3.5 text-diff-easy shrink-0" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MiniStatCard({ label, value, total, icon, emoji, color, displayValue, onClick, subtitle }: {
  label: string; value: number | null; total: number | null; icon: React.ReactNode; emoji?: string; color: string; displayValue?: string; onClick?: () => void; subtitle?: string;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick}
      className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all duration-200 ${color} ${onClick ? 'cursor-pointer hover:brightness-110 active:scale-[0.95]' : ''}`}>
      <div className="flex flex-col items-center gap-0.5">
        {emoji && <span className="text-base leading-none">{emoji}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground font-semibold">{label}</p>
        <p className="text-sm font-black font-mono text-foreground leading-none mt-0.5">
          {displayValue ?? (total !== null ? `${value}/${total}` : value)}
        </p>
        {subtitle && <p className="text-[9px] text-muted-foreground/60 mt-0.5 font-medium">{subtitle}</p>}
      </div>
    </Comp>
  );
}

function StatFilterResults({ filter, subject, onClose, onOpenTopicDetail, onOpenUnitEditor }: {
  filter: 'completed' | 'remaining' | 'important';
  subject: Subject;
  onClose: () => void;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string, navList?: TopicNavRef[]) => void;
  onOpenUnitEditor?: (subjectId: string, unitId: string) => void;
}) {
  const config = {
    completed: { emoji: '✅', title: 'Completed Topics', filterFn: (t: SubTopic) => t.completed, color: 'border-diff-easy/20 bg-diff-easy/5' },
    remaining: { emoji: '📚', title: 'Remaining Topics', filterFn: (t: SubTopic) => !t.completed, color: 'border-primary/20 bg-primary/5' },
    important: { emoji: '⭐', title: 'Important Topics', filterFn: (t: SubTopic) => t.important, color: 'border-chart-4/20 bg-chart-4/5' },
  }[filter];

  const results = subject.units.flatMap(u =>
    u.subTopics.filter(config.filterFn).map(t => ({ topic: t, unitId: u.id, unitName: u.name }))
  );

  return (
    <div className={`glass-subtle p-3 rounded-xl border ${config.color} space-y-2`}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          <span>{config.emoji}</span> {config.title}
          <span className="text-xs font-mono text-muted-foreground ml-1">({results.length})</span>
        </h4>
        <button onClick={onClose} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-muted/30 active:scale-90 transition-all">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
        {results.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No topics found</p>
        )}
        {results.slice(0, 30).map(({ topic, unitId, unitName }) => (
          <button key={topic.id}
            onClick={() => onOpenTopicDetail?.(topic, subject.id, unitId, results.map(r => ({ subjectId: subject.id, unitId: r.unitId, topicId: r.topic.id })))}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-card/40 transition-all active:scale-[0.98] text-left group">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${topic.completed ? 'bg-diff-easy' : topic.difficulty === 'Hard' ? 'bg-diff-hard' : topic.difficulty === 'Medium' ? 'bg-diff-medium' : 'bg-diff-easy/70'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground break-words group-hover:text-primary transition-colors">{topic.name}</p>
              <p className="text-[9px] text-muted-foreground/60">{unitName} · {topic.difficulty}{topic.important ? ' ⭐' : ''}</p>
            </div>
            {topic.timeSpent > 0 && <span className="text-[9px] text-secondary font-mono shrink-0">⏱️{formatTimeSpent(topic.timeSpent)}</span>}
            <ChevronRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary/60 shrink-0" />
          </button>
        ))}
        {results.length > 30 && (
          <p className="text-[10px] text-muted-foreground text-center py-1">+{results.length - 30} more...</p>
        )}
      </div>
    </div>
  );
}

const TopicBlock = memo(function TopicBlock({ topic, subjectColor, onToggle, onDetail }: {
  topic: SubTopic; subjectColor: string; onToggle?: () => void; onDetail?: () => void;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(() => {
    onDetail?.();
  }, [onDetail]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (onToggle) {
      navigator.vibrate?.(30);
      onToggle();
    }
  }, [onToggle]);

  const handlePointerDown = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      navigator.vibrate?.(80);
      onToggle?.();
    }, 500);
  }, [onToggle, longPressTimer]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }, [longPressTimer]);

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className="w-4 h-4 sm:w-5 sm:h-5 rounded-[3px] shrink-0 transition-colors duration-150 hover:brightness-125 active:scale-90 cursor-pointer"
      style={{
        backgroundColor: topic.completed ? subjectColor
          : topic.status === 'in_process' ? `color-mix(in srgb, ${subjectColor} 50%, hsl(var(--muted)))`
          : `color-mix(in srgb, ${subjectColor} 15%, hsl(var(--muted)))`,
        boxShadow: topic.completed ? `0 0 4px ${subjectColor}40` : 'none',
      }}
      title={`${topic.name} (${topic.difficulty})${topic.completed ? ' ✓' : ''}`}
    />
  );
});

function TimeBreakdown({ units, totalTime, subjectColor, onUnitClick, onClose }: {
  units: { id: string; name: string; time: number; total: number; done: number }[];
  totalTime: number; subjectColor: string;
  onUnitClick?: (unitId: string) => void; onClose: () => void;
}) {
  return (
    <div className="glass-subtle p-4 rounded-xl space-y-3 border border-secondary/20">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-secondary" />
          ⏱️ Where You Spent {formatTimeSpent(totalTime)}
        </h4>
        <button onClick={onClose} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-muted/30 active:scale-90 transition-all">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">Tap any unit to see its topics</p>
      <div className="space-y-2">
        {units.map((u, i) => {
          const pct = totalTime > 0 ? Math.round((u.time / totalTime) * 100) : 0;
          return (
            <button key={u.id} onClick={() => onUnitClick?.(u.id)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-card/30 border border-border/10 hover:bg-card/50 hover:border-secondary/20 transition-all active:scale-[0.98] group">
              <span className="text-xs font-mono font-bold text-secondary/60 w-5 shrink-0">#{i + 1}</span>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-semibold text-foreground break-words group-hover:text-secondary transition-colors">{u.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-2 rounded-full bg-muted/20 overflow-hidden">
                    <div className="h-full rounded-full bg-secondary/70 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-secondary/70 shrink-0">{pct}%</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black font-mono text-secondary">{formatTimeSpent(u.time)}</p>
                <p className="text-[9px] text-muted-foreground/60">{u.done}/{u.total} done</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-secondary/60 shrink-0 transition-colors" />
            </button>
          );
        })}
      </div>
      {units.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3">No time logged yet. Use the Pomodoro timer or edit topics to track time.</p>
      )}
    </div>
  );
}
