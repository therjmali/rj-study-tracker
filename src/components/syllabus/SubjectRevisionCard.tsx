import { useState, useMemo, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Clock, Flame, Filter, X, Check, SlidersHorizontal, Star } from 'lucide-react';
import { REVISION_KEYS } from '../../types';
import type { Subject, SubTopic, RevisionKey, TopicNavRef } from '../../types';
import { formatStudyTime, getCleanName } from '../../lib/utils';
import { computeSubjectRevisionStats } from '../../lib/revisionStats';
import type { SubjectRevisionStats, RoundStat } from '../../lib/revisionStats';
import { useToday } from '../../hooks/useToday';

interface Props {
  subject: Subject;
  /** Round currently used to filter the topic list (completed topics missing that round) */
  activeRound: RevisionKey | null;
  onRoundChange: (round: RevisionKey | null) => void;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string, navList?: TopicNavRef[]) => void;
}

const ROUND_NAME: Record<RevisionKey, string> = { R1: 'First Revision', R2: 'Second Revision', R3: 'Third Revision', R4: 'Fourth Revision' };

/** One colour per round (full class names so Tailwind keeps them) */
const ROUND_STYLE: Record<RevisionKey, { bar: string; text: string; badge: string }> = {
  R1: { bar: 'bg-primary', text: 'text-primary', badge: 'bg-primary/12 text-primary border-primary/25' },
  R2: { bar: 'bg-chart-4', text: 'text-chart-4', badge: 'bg-chart-4/12 text-chart-4 border-chart-4/25' },
  R3: { bar: 'bg-chart-5', text: 'text-chart-5', badge: 'bg-chart-5/12 text-chart-5 border-chart-5/25' },
  R4: { bar: 'bg-secondary', text: 'text-secondary', badge: 'bg-secondary/12 text-secondary border-secondary/25' },
};

const LABEL = 'text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.15em]';

/** Collapsed-line chip colour by how complete the round is */
function chipTone(pct: number) {
  if (pct >= 100) return 'bg-secondary/15 border-secondary/30 text-secondary';
  if (pct > 0) return 'bg-chart-4/10 border-chart-4/25 text-chart-4';
  return 'bg-muted/30 border-border/30 text-muted-foreground';
}

type Diff = 'Easy' | 'Medium' | 'Hard';
type RevStatusFilter = 'all' | 'complete' | 'incomplete' | 'in_process' | 'not_started';
interface RevFilters { diffs: Diff[]; starred: boolean; status: RevStatusFilter; round: 'any' | RevisionKey; unitId: string }
const NO_FILTERS: RevFilters = { diffs: [], starred: false, status: 'all', round: 'any', unitId: 'all' };
const STATUS_OPTIONS: { id: RevStatusFilter; label: string; emoji: string }[] = [
  { id: 'all', label: 'All', emoji: '📚' },
  { id: 'complete', label: 'Completed', emoji: '✅' },
  { id: 'incomplete', label: 'Incomplete', emoji: '⏳' },
  { id: 'in_process', label: 'In progress', emoji: '🔄' },
  { id: 'not_started', label: 'Not started', emoji: '⭕' },
];
const roundStatus = (t: SubTopic, k: RevisionKey) => t.revisions?.[k]?.status ?? 'pending';
/** With a specific round the status is that round's; with "Any" it describes the topic across all four rounds. */
function matchesStatus(t: SubTopic, status: RevStatusFilter, round: 'any' | RevisionKey): boolean {
  if (status === 'all') return true;
  if (round !== 'any') {
    const st = roundStatus(t, round);
    if (status === 'complete') return st === 'complete';
    if (status === 'incomplete') return st !== 'complete';
    if (status === 'in_process') return st === 'in_process';
    return st === 'pending';
  }
  const all = REVISION_KEYS.map(k => roundStatus(t, k));
  if (status === 'complete') return all.every(x => x === 'complete');
  if (status === 'incomplete') return all.some(x => x !== 'complete');
  if (status === 'in_process') return all.some(x => x === 'in_process');
  return all.every(x => x === 'pending');
}
const DIFF_DOT: Record<Diff, string> = { Easy: 'bg-diff-easy', Medium: 'bg-diff-medium', Hard: 'bg-diff-hard' };

export default function SubjectRevisionCard({ subject, activeRound, onRoundChange, onOpenTopicDetail }: Props) {
  const [open, setOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<RevFilters>(NO_FILTERS);
  const today = useToday();

  const activeCount = filters.diffs.length + (filters.starred ? 1 : 0) + (filters.status !== 'all' ? 1 : 0) + (filters.unitId !== 'all' ? 1 : 0);

  // Narrow the subject BEFORE computing stats so every number in the card follows the filter.
  // Units stay in place (only their topics are filtered) so unit numbers never shift.
  const scoped = useMemo<Subject>(() => {
    if (activeCount === 0) return subject;
    const keep = (t: SubTopic) => {
      if (filters.diffs.length && !filters.diffs.includes(t.difficulty)) return false;
      if (filters.starred && !t.important) return false;
      if (!matchesStatus(t, filters.status, filters.round)) return false;
      return true;
    };
    return {
      ...subject,
      units: subject.units.map(u => (filters.unitId !== 'all' && u.id !== filters.unitId)
        ? { ...u, subTopics: [] }
        : { ...u, subTopics: u.subTopics.filter(keep) }),
    };
  }, [subject, filters, activeCount]);

  const stats = useMemo(() => computeSubjectRevisionStats(scoped, today), [scoped, today]);
  const toggleDiff = (d: Diff) => setFilters(f => ({ ...f, diffs: f.diffs.includes(d) ? f.diffs.filter(x => x !== d) : [...f.diffs, d] }));
  const activeStat = activeRound ? stats.rounds.find(r => r.key === activeRound) : undefined;

  return (
    <div className="space-y-2">
      <div className="rounded-2xl bg-card/80 border border-border/12 p-3"
        style={{ boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)' }}>

        {/* ═══ Collapsed line — always visible ═══ */}
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setOpen(p => !p)} aria-expanded={open} aria-label="Toggle revision statistics"
            className="flex-1 min-w-0 flex items-center gap-x-2 gap-y-1.5 flex-wrap text-left active:scale-[0.99] transition-transform">
            <span className="text-[13px] font-bold text-foreground flex items-center gap-1 shrink-0">🔁 Revision</span>
            <span className="text-[12px] font-black font-mono text-foreground shrink-0">{stats.overallPct}%</span>
            <span className="flex items-center gap-1 min-w-0">
              {stats.rounds.map(r => (
                <span key={r.key} title={`${r.key}: ${r.done}/${stats.completedTopics} · ${r.pct}%`}
                  className={`px-1.5 h-5 inline-flex items-center rounded-md border text-[9px] font-black ${chipTone(r.pct)}`}>
                  {r.key}
                </span>
              ))}
            </span>
            <span className="ml-auto flex items-center gap-2 shrink-0">
              <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-chart-5 whitespace-nowrap">
                <Clock className="w-3 h-3 shrink-0" />{formatStudyTime(stats.totalTime)}
              </span>
              {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </span>
          </button>
          <button type="button" onClick={() => setFilterOpen(p => !p)} aria-label="Filter revision statistics" aria-expanded={filterOpen}
            className={`relative shrink-0 w-8 h-8 rounded-xl border flex items-center justify-center active:scale-90 transition-all ${
              filterOpen || activeCount > 0 ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted/20 border-border/15 text-muted-foreground'
            }`}>
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-black flex items-center justify-center">{activeCount}</span>
            )}
          </button>
        </div>

        {/* ═══ Filter panel ═══ */}
        <AnimatePresence initial={false}>
          {filterOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="mt-3 pt-3 border-t border-border/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className={LABEL}>Narrow revision stats</span>
                  {activeCount > 0 && (
                    <button type="button" onClick={() => setFilters(NO_FILTERS)} className="text-[10px] font-black text-primary active:scale-95">Reset</button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground/60">Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_OPTIONS.map(o => {
                      const on = filters.status === o.id;
                      return (
                        <button key={o.id} type="button" onClick={() => setFilters(f => ({ ...f, status: o.id }))}
                          className={`h-8 px-3 rounded-full border text-[11px] font-bold flex items-center gap-1.5 active:scale-95 transition-all ${on ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-muted/15 border-border/15 text-muted-foreground'}`}>
                          <span>{o.emoji}</span>{o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground/60">
                    Round <span className="normal-case tracking-normal font-semibold text-muted-foreground/45">· {filters.round === 'any' ? 'across all rounds' : ROUND_NAME[filters.round]}</span>
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(['any', ...REVISION_KEYS] as ('any' | RevisionKey)[]).map(r => {
                      const on = filters.round === r;
                      return (
                        <button key={r} type="button" onClick={() => setFilters(f => ({ ...f, round: r }))}
                          className={`h-8 rounded-xl border text-[11px] font-black active:scale-95 transition-all ${on ? 'bg-secondary/15 border-secondary/40 text-secondary' : 'bg-muted/15 border-border/15 text-muted-foreground'}`}>
                          {r === 'any' ? 'Any' : r}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground/60">Topic</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['Easy', 'Medium', 'Hard'] as Diff[]).map(d => {
                      const on = filters.diffs.includes(d);
                      return (
                        <button key={d} type="button" onClick={() => toggleDiff(d)}
                          className={`h-8 px-3 rounded-full border text-[11px] font-bold flex items-center gap-1.5 active:scale-95 transition-all ${on ? 'bg-primary/12 border-primary/35 text-primary' : 'bg-muted/15 border-border/15 text-muted-foreground'}`}>
                          <span className={`w-2 h-2 rounded-full ${DIFF_DOT[d]}`} />{d}
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => setFilters(f => ({ ...f, starred: !f.starred }))}
                      className={`h-8 px-3 rounded-full border text-[11px] font-bold flex items-center gap-1.5 active:scale-95 transition-all ${filters.starred ? 'bg-chart-4/12 border-chart-4/35 text-chart-4' : 'bg-muted/15 border-border/15 text-muted-foreground'}`}>
                      <Star className="w-3 h-3" fill={filters.starred ? 'currentColor' : 'none'} />Important
                    </button>
                  </div>
                </div>
                <select value={filters.unitId} onChange={e => setFilters(f => ({ ...f, unitId: e.target.value }))} aria-label="Filter by unit"
                  className="w-full h-9 rounded-xl border border-border/20 bg-card px-2.5 text-[11px] font-semibold text-foreground">
                  <option value="all">All units</option>
                  {subject.units.map((u, i) => <option key={u.id} value={u.id}>{i + 1}. {u.name}</option>)}
                </select>
                {activeCount > 0 && (
                  <p className="text-[10px] font-semibold text-muted-foreground/70">
                    Counting {stats.completedTopics} completed {stats.completedTopics === 1 ? 'topic' : 'topics'} that match.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ Expanded content ═══ */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }} className="overflow-hidden">
              <div className="pt-3 mt-3 border-t border-border/10">
                {stats.completedTopics === 0 ? (
                  <EmptyState noTopics={stats.totalTopics === 0} />
                ) : (
                  <RevisionBody subject={subject} stats={stats} activeRound={activeRound}
                    onRoundChange={onRoundChange} onOpenTopicDetail={onOpenTopicDetail} />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Active round filter indicator — visible even when the card is collapsed */}
      {activeRound && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border bg-accent/10 border-accent/20 animate-in fade-in duration-150">
          <Filter className="w-3.5 h-3.5 shrink-0 text-accent-ink" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-accent-ink">
              🔁 Showing completed topics missing {activeRound}
            </span>
            <p className="text-[10px] text-muted-foreground/70 font-medium mt-0.5">
              {activeStat ? `${activeStat.left} ${activeStat.left === 1 ? 'topic' : 'topics'} · ` : ''}{ROUND_NAME[activeRound]}
            </p>
          </div>
          <button type="button" onClick={() => onRoundChange(null)} aria-label="Clear revision filter"
            className="p-1.5 rounded-lg active:scale-90 transition-all hover:bg-accent/20">
            <X className="w-3.5 h-3.5 text-accent-ink" />
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ noTopics }: { noTopics: boolean }) {
  return (
    <div className="text-center py-5 px-2 space-y-1">
      <p className="text-2xl">{noTopics ? '🗂️' : '📭'}</p>
      <p className="text-xs font-bold text-foreground">{noTopics ? 'No topics in this subject yet' : 'Nothing to revise yet'}</p>
      <p className="text-[11px] text-muted-foreground/70 font-medium">
        {noTopics
          ? 'Add topics and complete them, then R1–R4 will track here.'
          : 'Complete a topic first. Once it is done it shows up here for R1 to R4.'}
      </p>
    </div>
  );
}

/* ───────────────────────── Expanded body ───────────────────────── */

interface BodyProps {
  subject: Subject;
  stats: SubjectRevisionStats;
  activeRound: RevisionKey | null;
  onRoundChange: (round: RevisionKey | null) => void;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string, navList?: TopicNavRef[]) => void;
}

function RevisionBody({ subject, stats, activeRound, onRoundChange, onOpenTopicDetail }: BodyProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [idx, setIdx] = useState(() => (activeRound ? Math.max(0, REVISION_KEYS.indexOf(activeRound)) : 0));
  const initialIdx = useRef(idx);

  // Start on the filtered round when one is active
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && initialIdx.current > 0) el.scrollLeft = initialIdx.current * el.clientWidth;
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const handleScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scrollRef.current;
      if (!el || el.clientWidth === 0) return;
      const i = Math.min(REVISION_KEYS.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
      setIdx(i);
    });
  }, []);

  const goTo = useCallback((i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    setIdx(i);
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }, []);

  return (
    <div className="space-y-3">
      {/* Overview: stacked bar + summary chips */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL}>All rounds</span>
          <span className="text-[11px] font-mono font-semibold text-muted-foreground">
            {stats.roundsDone}/{stats.roundsTotal} · {stats.overallPct}%
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-muted/30 overflow-hidden flex" role="img" aria-label={`Overall revision ${stats.overallPct}% complete`}>
          {stats.rounds.map(r => (
            <motion.div key={r.key} className={`h-full ${ROUND_STYLE[r.key].bar}`}
              initial={{ width: 0 }} animate={{ width: `${stats.roundsTotal > 0 ? (r.done / stats.roundsTotal) * 100 : 0}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {stats.rounds.map(r => (
            <span key={r.key} className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
              <span className={`w-2 h-2 rounded-full ${ROUND_STYLE[r.key].bar}`} />
              {r.key} <span className="font-mono text-foreground/80">{r.done}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-secondary/10 border-secondary/25 text-secondary">
            ✅ {stats.roundsDone} {stats.roundsDone === 1 ? 'round' : 'rounds'} done
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono border bg-chart-5/10 border-chart-5/25 text-chart-5">
            <Clock className="w-3 h-3" /> {formatStudyTime(stats.totalTime)}
          </span>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
            stats.streak > 0 ? 'bg-chart-4/10 border-chart-4/25 text-chart-4' : 'bg-muted/30 border-border/30 text-muted-foreground'
          }`}>
            <Flame className="w-3 h-3" /> {stats.streak}d streak
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-primary/10 border-primary/25 text-primary">
            📈 {stats.overallPct}% complete
          </span>
        </div>
      </div>

      {/* Round tabs (also the page indicator for the swipe cards) */}
      <div role="tablist" aria-label="Revision rounds" className="grid grid-cols-4 gap-1.5">
        {stats.rounds.map((r, i) => {
          const active = i === idx;
          return (
            <button key={r.key} type="button" role="tab" aria-selected={active} onClick={() => goTo(i)}
              className={`relative rounded-xl px-1 py-1.5 border text-center transition-all active:scale-95 ${
                active ? `${ROUND_STYLE[r.key].badge} shadow-sm` : 'bg-muted/20 border-border/10 text-muted-foreground'
              }`}>
              <span className="block text-[11px] font-black leading-none">{r.key}</span>
              <span className="block text-[9px] font-mono font-bold mt-1 opacity-80">{r.pct}%</span>
              {activeRound === r.key && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>

      {/* Swipeable round cards */}
      <div>
        <div ref={scrollRef} onScroll={handleScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide overscroll-x-contain -mx-0.5"
          style={{ scrollbarWidth: 'none' }} aria-label="Revision rounds, swipe left or right">
          {stats.rounds.map(r => (
            <div key={r.key} role="tabpanel" aria-label={`${r.key} ${ROUND_NAME[r.key]}`}
              className="min-w-full snap-center snap-always px-0.5 flex">
              <RoundCard round={r} completedTopics={stats.completedTopics} isFiltered={activeRound === r.key}
                onToggleFilter={() => onRoundChange(activeRound === r.key ? null : r.key)}
                onOpenTopic={(topic, unitId) => onOpenTopicDetail?.(topic, subject.id, unitId, r.readyRefs.map(x => ({ subjectId: subject.id, unitId: x.unitId, topicId: x.topicId })))} />
            </div>
          ))}
        </div>
        <p className="text-center text-[9px] font-bold text-muted-foreground/45 mt-1.5 tracking-wide">‹ Swipe left or right to switch round ›</p>
      </div>
    </div>
  );
}

/* ───────────────────────── One round card ───────────────────────── */

function RoundCard({ round: r, completedTopics, isFiltered, onToggleFilter, onOpenTopic }: {
  round: RoundStat;
  completedTopics: number;
  isFiltered: boolean;
  onToggleFilter: () => void;
  onOpenTopic: (topic: SubTopic, unitId: string) => void;
}) {
  const style = ROUND_STYLE[r.key];
  const finished = r.left === 0;
  const filterDisabled = finished && !isFiltered;

  return (
    <div className={`flex-1 min-w-0 rounded-2xl border overflow-hidden bg-muted/15 flex flex-col ${isFiltered ? 'border-accent/35' : 'border-border/10'}`}>
      <div className={`h-1 ${style.bar}`} />
      <div className="p-3 flex flex-col gap-3 flex-1">

        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`shrink-0 px-2 h-6 inline-flex items-center rounded-lg border text-xs font-black ${style.badge}`}>{r.key}</span>
            <span className="text-xs font-bold text-foreground truncate">{ROUND_NAME[r.key]}</span>
          </div>
          <span className={`text-2xl font-black font-mono leading-none shrink-0 ${style.text}`}>{r.pct}%</span>
        </div>

        {/* Progress bar — same style as the subject progress bars */}
        <div className="flex items-center gap-2.5">
          <div className="flex-1 h-2.5 rounded-full bg-muted/30 overflow-hidden min-w-0">
            <div className={`h-full rounded-full ${style.bar} transition-all duration-700`} style={{ width: `${r.pct}%` }} />
          </div>
          <span className="text-[11px] font-mono font-semibold text-muted-foreground shrink-0 text-right whitespace-nowrap">
            {r.done}/{completedTopics} · {r.pct}%
          </span>
        </div>

        {/* Chips: done / left / time (+ in progress) */}
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-secondary/10 border-secondary/25 text-secondary">
            ✅ {r.done} done
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-muted/30 border-border/20 text-muted-foreground">
            📚 {r.left} left
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono border bg-chart-5/10 border-chart-5/25 text-chart-5">
            <Clock className="w-3 h-3" /> {formatStudyTime(r.time)}
          </span>
          {r.inProgress > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-chart-4/10 border-chart-4/25 text-chart-4">
              🔄 {r.inProgress} in progress
            </span>
          )}
        </div>

        {/* Next up for this round */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className={LABEL}>Next up · {r.key}</span>
            {r.readyCount > r.nextUp.length && (
              <span className="text-[9px] font-bold text-muted-foreground/50">+{r.readyCount - r.nextUp.length} more</span>
            )}
          </div>
          {r.nextUp.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/70 font-medium text-center py-2">
              {finished
                ? `🎉 ${r.key} is done for every completed topic`
                : `${r.left} ${r.left === 1 ? 'topic needs' : 'topics need'} an earlier round first`}
            </p>
          ) : (
            <div className="space-y-1">
              {r.nextUp.map(item => (
                <button key={item.topic.id} type="button" onClick={() => onOpenTopic(item.topic, item.unitId)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl bg-card/50 border border-border/10 hover:bg-card/70 active:scale-[0.98] transition-all text-left group">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground break-words group-hover:text-primary transition-colors">{getCleanName(item.topic.name)}</p>
                    <p className="text-[9px] text-muted-foreground/60 truncate">{item.unitName}{item.inProgress ? ' · in progress' : ''}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary/60 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Least revised units for this round */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className={LABEL}>Least revised units</span>
            {r.unitsPending > r.units.length && (
              <span className="text-[9px] font-bold text-muted-foreground/50">+{r.unitsPending - r.units.length} more</span>
            )}
          </div>
          {r.units.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/70 font-medium text-center py-1.5">Every unit has finished {r.key} ✓</p>
          ) : (
            <div className="space-y-1">
              {r.units.map(u => (
                <div key={u.id} className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-mono font-bold text-muted-foreground/50 w-5 shrink-0 text-center">{u.index + 1}</span>
                  <span className="flex-1 min-w-0 text-[11px] font-semibold text-foreground truncate">{u.name}</span>
                  <div className="w-12 h-2 rounded-full bg-muted/30 overflow-hidden shrink-0">
                    <div className={`h-full rounded-full ${style.bar} transition-all duration-500`} style={{ width: `${u.pct}%` }} />
                  </div>
                  <span className="text-[10px] font-mono font-bold text-muted-foreground w-11 text-right shrink-0">{u.done}/{u.total}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filter the topic list */}
        <button type="button" disabled={filterDisabled} onClick={onToggleFilter}
          className={`mt-auto w-full h-9 rounded-xl text-[11px] font-bold border flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-60 disabled:active:scale-100 ${
            isFiltered ? 'bg-accent/15 border-accent/30 text-accent-ink' : style.badge
          }`}>
          {filterDisabled
            ? <><Check className="w-3.5 h-3.5" /> {r.key} complete for all topics</>
            : isFiltered
              ? <><X className="w-3.5 h-3.5" /> Showing {r.key} gaps · tap to clear</>
              : <><Filter className="w-3.5 h-3.5" /> Show {r.left} {r.left === 1 ? 'topic' : 'topics'} missing {r.key}</>}
        </button>
      </div>
    </div>
  );
}
