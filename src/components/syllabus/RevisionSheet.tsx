import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CalendarIcon, Hash, Clock, Flame, ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import BottomSheet from '../shared/BottomSheet';
import StudyTimeCard from './topicSheet/StudyTimeCard';
import { useSwipeNav, useSwipeHint } from '../../hooks/useSwipeNav';
import { REVISION_KEYS } from '../../types';
import type { SubTopic, RevisionKey, RevisionData, RevisionStatus, TimeEntry } from '../../types';
import { formatStudyTime, formatDateRelative, getLocalDateStr, getCleanName } from '../../lib/utils';

export type RevisionMap = Partial<Record<RevisionKey, RevisionData>>;

interface Props {
  open: boolean;
  onClose: () => void;
  topic: SubTopic;
  onUpdate: (fn: (prev: RevisionMap) => RevisionMap) => void;
  subjectName?: string;
  subjectColor?: string;
  subjectId?: string;
  unitId?: string;
  unitName?: string;
  /** All topics of the current unit (the open topic may be un-saved — it is substituted with `topic`) */
  unitTopics: SubTopic[];
  /** All topics of the current subject */
  subjectTopics: SubTopic[];
  zIndex: number;
  /** Swipe / arrow navigation between topics — the same list and gesture as the topic window. */
  onNavigate?: (direction: 'prev' | 'next') => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  topicIndex?: number;
  totalTopics?: number;
  /** Saves the host's unsaved draft right before a timer session is written. */
  onFlush?: () => void;
}

const ORDINAL: Record<RevisionKey, string> = { R1: '1st', R2: '2nd', R3: '3rd', R4: '4th' };
const ROUND_TITLE: Record<RevisionKey, string> = { R1: 'First Revision', R2: 'Second Revision', R3: 'Third Revision', R4: 'Fourth Revision' };

const STATUS_OPTIONS: { value: RevisionStatus; label: string; emoji: string }[] = [
  { value: 'pending', label: 'Not Started', emoji: '📋' },
  { value: 'in_process', label: 'In Progress', emoji: '🔄' },
  { value: 'complete', label: 'Done', emoji: '✅' },
];

export const emptyRevision = (): RevisionData => ({ status: 'pending', timeSpent: 0, timeEntries: [] });

const nowTime = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-card/80 border border-border/12 p-4 ${className}`}
      style={{ boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)' }}>
      {children}
    </div>
  );
}

/** Progress row — same visual language as the subject dashboard bars */
function ProgressRow({ label, done, total, barClass }: { label: string; done: number; total: number; barClass: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-foreground w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-muted/30 overflow-hidden">
        <div className={`h-full rounded-full ${barClass} transition-all duration-700 shadow-sm`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-24 text-right font-semibold">{done}/{total} · {pct}%</span>
    </div>
  );
}

export default function RevisionSheet({ open, onClose, topic, onUpdate, subjectName, subjectColor, subjectId, unitId, unitName, unitTopics, subjectTopics, zIndex, onNavigate, hasPrev, hasNext, topicIndex, totalTopics, onFlush }: Props) {
  const revisions: RevisionMap = topic.revisions || {};
  const getRev = (k: RevisionKey): RevisionData => revisions[k] || emptyRevision();

  const firstOpenRound = (): RevisionKey => REVISION_KEYS.find(k => getRev(k).status !== 'complete') || 'R4';
  const [selected, setSelected] = useState<RevisionKey>(firstOpenRound);

  // Re-pick the working round whenever the window opens for a topic
  useEffect(() => {
    if (open) setSelected(firstOpenRound());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, topic.id]);

  const rev = getRev(selected);
  const color = subjectColor || 'hsl(var(--primary))';

  const update = (k: RevisionKey, fn: (r: RevisionData) => RevisionData) =>
    onUpdate(prev => ({ ...prev, [k]: fn(prev[k] || emptyRevision()) }));

  /* ───────── Status ───────── */
  const setStatus = (k: RevisionKey, status: RevisionStatus) => {
    const today = getLocalDateStr(new Date());
    update(k, r => {
      if (status === 'complete') return { ...r, status, startedDate: r.startedDate || today, completedDate: today, completedTime: nowTime() };
      if (status === 'in_process') return { ...r, status, startedDate: r.startedDate || today, completedDate: undefined, completedTime: undefined };
      return { ...r, status, startedDate: undefined, completedDate: undefined, completedTime: undefined };
    });
    navigator.vibrate?.(10);
  };

  /* ───────── Time log — the SAME stopwatch / countdown card as the topic window, for the selected round ───────── */
  const addTime = (mins: number, date?: string, note?: string, time?: string) => {
    const day = date || getLocalDateStr(new Date());
    update(selected, r => ({
      ...r,
      timeSpent: r.timeSpent + mins,
      timeEntries: [...r.timeEntries, { date: day, minutes: mins, note: note || undefined, time: time || undefined, status: 'complete' } as TimeEntry],
    }));
  };
  const deleteEntry = (idx: number) => {
    update(selected, r => {
      const entries = [...r.timeEntries];
      const removed = entries.splice(idx, 1)[0];
      return { ...r, timeSpent: Math.max(0, r.timeSpent - (removed?.minutes || 0)), timeEntries: entries };
    });
  };
  const editEntry = (idx: number, mins: number, note?: string, date?: string, time?: string) => {
    update(selected, r => {
      const entries = [...r.timeEntries];
      const old = entries[idx];
      if (!old) return r;
      entries[idx] = { ...old, minutes: mins, note: note || undefined, date: date || old.date, time: time || undefined };
      return { ...r, timeSpent: Math.max(0, r.timeSpent + (mins - old.minutes)), timeEntries: entries };
    });
  };
  /** Adapter so the shared card's "Override total" / "Reset all" act on the selected round. */
  const setRoundField = <K extends keyof SubTopic>(k: K, v: SubTopic[K]) => {
    if (k === 'timeSpent') update(selected, r => ({ ...r, timeSpent: Math.max(0, Number(v) || 0) }));
    else if (k === 'timeEntries') update(selected, r => ({ ...r, timeEntries: (Array.isArray(v) ? (v as TimeEntry[]) : []) }));
  };
  const roundDraft = useMemo<SubTopic>(() => ({ ...topic, timeSpent: rev.timeSpent, timeEntries: rev.timeEntries }), [topic, rev]);

  /* ───────── Progress numbers (current topic substituted by the live draft) ───────── */
  const progress = useMemo(() => {
    const sub = (list: SubTopic[]) => list.map(t => (t.id === topic.id ? topic : t));
    const unit = sub(unitTopics);
    const subj = sub(subjectTopics);
    const countDone = (list: SubTopic[]) => list.filter(t => t.revisions?.[selected]?.status === 'complete').length;
    const timeOf = (list: SubTopic[]) => list.reduce((a, t) => a + (t.revisions?.[selected]?.timeSpent || 0), 0);
    return {
      unitDone: countDone(unit), unitTotal: unit.length,
      subjDone: countDone(subj), subjTotal: subj.length,
      subjTime: timeOf(subj),
    };
  }, [topic, unitTopics, subjectTopics, selected]);

  const roundsDone = REVISION_KEYS.filter(k => getRev(k).status === 'complete').length;
  const allRoundsTime = REVISION_KEYS.reduce((a, k) => a + getRev(k).timeSpent, 0);
  const roundsPct = Math.round((roundsDone / REVISION_KEYS.length) * 100);
  const ringR = 11;
  const ringC = 2 * Math.PI * ringR;

  /* ───────── Swipe left / right → previous / next topic (same gesture as the topic window) ───────── */
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const topAnchor = useRef<HTMLDivElement>(null);
  const navigate = (direction: 'prev' | 'next') => {
    if (!onNavigate) return;
    navigator.vibrate?.(20);
    setSwipeDirection(direction === 'prev' ? 'right' : 'left');
    requestAnimationFrame(() => {
      onNavigate(direction);
      setSwipeDirection(null);
      topAnchor.current?.scrollIntoView({ block: 'start' });
    });
  };
  const { dragX, contentOpacity, contentScale, handlers: swipeHandlers } = useSwipeNav({ hasPrev: !!onNavigate && hasPrev, hasNext: !!onNavigate && hasNext, onNavigate: navigate });
  useSwipeHint(open && !!onNavigate && !!(hasPrev || hasNext), 'revision-swipe-hint-v1', '👆 Swipe left / right to switch revision topics');

  return (
    <BottomSheet open={open} onClose={onClose} zIndex={zIndex}>
      {/* ═══ Sticky top bar ═══ */}
      <div className="sticky top-0 z-20 -mx-5 px-5 pt-1 pb-2 mb-3 flex items-center gap-2.5"
        style={{ background: 'hsl(var(--glass-bg) / 0.97)' }}>
        <motion.button whileTap={{ scale: 0.88 }} onClick={onClose} aria-label="Close revision"
          className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted/70 transition-all shrink-0 shadow-sm">
          <X className="w-4 h-4 text-muted-foreground" />
        </motion.button>
        {onNavigate && (
          <motion.button whileTap={{ scale: 0.88 }} onClick={() => hasPrev && navigate('prev')} disabled={!hasPrev}
            className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center disabled:opacity-25 transition-opacity shrink-0 text-foreground/70" aria-label="Previous topic" title="Previous topic">
            <ChevronLeft className="w-4 h-4" />
          </motion.button>
        )}
        <div className="flex-1 min-w-0 text-center">
          <h3 className="text-sm font-black text-foreground tracking-tight flex items-center justify-center gap-1.5"><Repeat className="w-3.5 h-3.5 text-primary" /> Revision</h3>
          <p className="text-[9px] text-muted-foreground/60 font-semibold whitespace-nowrap">
            {roundsDone} of 4 rounds done{topicIndex != null && totalTopics != null ? <> · <span className="font-bold text-foreground/60">{topicIndex + 1}/{totalTopics}</span></> : null}
          </p>
        </div>
        {onNavigate && (
          <motion.button whileTap={{ scale: 0.88 }} onClick={() => hasNext && navigate('next')} disabled={!hasNext}
            className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center disabled:opacity-25 transition-opacity shrink-0 text-foreground/70" aria-label="Next topic" title="Next topic">
            <ChevronRight className="w-4 h-4" />
          </motion.button>
        )}
        <svg width="30" height="30" viewBox="0 0 30 30" className="shrink-0">
          <circle cx="15" cy="15" r={ringR} fill="none" stroke="hsl(var(--muted) / 0.3)" strokeWidth="3" />
          <circle cx="15" cy="15" r={ringR} fill="none" stroke="hsl(var(--secondary))" strokeWidth="3"
            strokeDasharray={ringC} strokeDashoffset={ringC - (roundsPct / 100) * ringC} strokeLinecap="round"
            transform="rotate(-90 15 15)" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
          <text x="15" y="15.5" textAnchor="middle" dominantBaseline="middle" className="fill-foreground/70" style={{ fontSize: '8px', fontWeight: 800 }}>{roundsDone}/4</text>
        </svg>
      </div>

      <div ref={topAnchor} aria-hidden style={{ scrollMarginTop: 56 }} />
      <AnimatePresence mode="wait" custom={swipeDirection}>
      <motion.div
        key={topic.id}
        {...swipeHandlers}
        style={{ x: dragX, opacity: contentOpacity, scale: contentScale }}
        initial={swipeDirection === 'left' ? { x: 250, opacity: 0 } : swipeDirection === 'right' ? { x: -250, opacity: 0 } : { opacity: 1 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        exit={swipeDirection === 'left' ? { x: -250, opacity: 0 } : swipeDirection === 'right' ? { x: 250, opacity: 0 } : { opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 350 }}
        className="space-y-3.5 touch-pan-y"
      >
        {/* ═══ 1. Topic name & details ═══ */}
        <div className="rounded-2xl bg-card/80 border border-border/12 overflow-hidden relative"
          style={{ borderLeft: `3px solid ${color}`, boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)' }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(135deg, ${color}08, transparent 55%)` }} />
          <div className="relative p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[10px] font-bold text-muted-foreground/70 truncate">
                {[subjectName, unitName].filter(Boolean).join(' › ')}
              </span>
            </div>
            <h2 className="text-[15px] font-extrabold text-foreground leading-snug tracking-tight" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {getCleanName(topic.name)}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {topic.topicNumber != null && (
                <span className="text-[9px] font-mono font-bold px-2 py-1 rounded-lg bg-muted/30 text-muted-foreground flex items-center gap-1">
                  <Hash className="w-2.5 h-2.5" />{String(topic.topicNumber).padStart(3, '0')}
                </span>
              )}
              <span className="text-[9px] font-bold px-2 py-1 rounded-lg bg-muted/30 text-muted-foreground">
                {topic.difficulty === 'Easy' ? '🟢' : topic.difficulty === 'Hard' ? '🔴' : '🟡'} {topic.difficulty}
              </span>
              {topic.important && (
                <span className="text-[9px] font-bold px-2 py-1 rounded-lg bg-amber-500/12 text-amber-600 flex items-center gap-1">
                  <Flame className="w-2.5 h-2.5" /> Important
                </span>
              )}
              {topic.completedDate && (
                <span className="text-[9px] font-bold px-2 py-1 rounded-lg bg-secondary/12 text-secondary flex items-center gap-1">
                  <CalendarIcon className="w-2.5 h-2.5" /> Studied {formatDateRelative(topic.completedDate)}
                </span>
              )}
              <span className="text-[9px] font-mono font-bold px-2 py-1 rounded-lg bg-chart-5/10 text-chart-5 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> {formatStudyTime(topic.timeSpent)}
              </span>
              {allRoundsTime > 0 && (
                <span className="text-[9px] font-mono font-bold px-2 py-1 rounded-lg bg-primary/10 text-primary flex items-center gap-1">
                  <Repeat className="w-2.5 h-2.5" /> {formatStudyTime(allRoundsTime)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ═══ 2. STATUS — R1 · R2 · R3 · R4 ═══ */}
        <Card className="space-y-3.5">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.25em] flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              Status
            </Label>
            <span className="text-[9px] font-bold text-muted-foreground/50">Tap a round to open it</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {REVISION_KEYS.map(k => {
              const r = getRev(k);
              const isSel = selected === k;
              const done = r.status === 'complete';
              const prog = r.status === 'in_process';
              return (
                <motion.button key={k} whileTap={{ scale: 0.92 }}
                  onClick={() => { setSelected(k); navigator.vibrate?.(8); }}
                  className={`relative rounded-2xl py-3 px-1 flex flex-col items-center gap-1 border transition-all ${
                    isSel ? 'bg-card shadow-lg border-primary/40 ring-1 ring-primary/25' : 'bg-card/30 border-border/10 hover:bg-card/50'
                  }`}>
                  <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${done ? 'bg-secondary' : prog ? 'bg-chart-4' : 'bg-muted-foreground/25'}`} />
                  <span className="text-2xl select-none">{done ? '✅' : prog ? '🔄' : '⭕'}</span>
                  <span className={`text-sm font-black tracking-wide ${isSel ? 'text-foreground' : 'text-muted-foreground/60'}`}>{k}</span>
                  <span className={`text-[8px] font-bold uppercase tracking-[0.12em] ${done ? 'text-secondary' : prog ? 'text-chart-4' : 'text-muted-foreground/35'}`}>
                    {done ? 'Done' : prog ? 'Studying' : ORDINAL[k]}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Selected round status picker */}
          <div className="pt-3 border-t border-border/10 space-y-2.5">
            <p className="text-[11px] font-black text-foreground">
              {selected} · <span className="text-muted-foreground font-bold">{ROUND_TITLE[selected]}</span>
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {STATUS_OPTIONS.map(opt => {
                const active = rev.status === opt.value;
                const tone = opt.value === 'complete' ? 'bg-secondary/12 border-secondary/35 text-secondary'
                  : opt.value === 'in_process' ? 'bg-chart-4/12 border-chart-4/35 text-chart-4'
                  : 'bg-muted/30 border-border/25 text-foreground/70';
                return (
                  <motion.button key={opt.value} whileTap={{ scale: 0.94 }} onClick={() => setStatus(selected, opt.value)}
                    className={`h-10 rounded-xl border text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${
                      active ? tone : 'border-border/15 bg-card text-muted-foreground hover:bg-muted/30'
                    }`}>
                    <span>{opt.emoji}</span>{opt.label}
                  </motion.button>
                );
              })}
            </div>

            <AnimatePresence initial={false}>
              {rev.status !== 'pending' && (
                <motion.div key={rev.status} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  {rev.status === 'in_process' ? (
                    <div className="flex items-center gap-2 pt-1">
                      <CalendarIcon className="w-3.5 h-3.5 text-chart-4 shrink-0" />
                      <Label className="text-[9px] text-chart-4 font-bold shrink-0">Started</Label>
                      <Input type="date" value={rev.startedDate || ''}
                        onChange={e => update(selected, r => ({ ...r, startedDate: e.target.value || undefined }))}
                        className="h-8 text-[10px] flex-1 bg-card border-chart-4/20 font-mono rounded-xl" />
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-3.5 h-3.5 text-secondary shrink-0" />
                        <Label className="text-[9px] text-secondary font-bold shrink-0">Completed</Label>
                        <Input type="date" value={rev.completedDate || ''}
                          onChange={e => update(selected, r => ({ ...r, completedDate: e.target.value || undefined }))}
                          className="h-8 text-[10px] flex-1 bg-card border-secondary/20 font-mono rounded-xl" />
                      </div>
                      <div className="flex items-center gap-2 ml-5">
                        <Label className="text-[9px] text-muted-foreground font-bold shrink-0">Time</Label>
                        <Input type="time" value={rev.completedTime || ''}
                          onChange={e => update(selected, r => ({ ...r, completedTime: e.target.value || undefined }))}
                          className="h-8 text-[10px] w-28 bg-card border-border/20 font-mono rounded-xl" />
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>

        {/* ═══ 3. Round progress — same bars as the subject dashboard ═══ */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">📊 {selected} Progress</Label>
            <span className="text-[9px] font-bold text-muted-foreground/50">{ROUND_TITLE[selected]}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-secondary/12 text-secondary border border-secondary/20">✅ {progress.subjDone} done</span>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-muted/30 text-muted-foreground border border-border/15">📚 {Math.max(0, progress.subjTotal - progress.subjDone)} left</span>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-chart-5/10 text-chart-5 border border-chart-5/20 font-mono">⏱ {formatStudyTime(progress.subjTime)}</span>
          </div>
          <div className="space-y-2.5">
            <ProgressRow label="Topic" done={roundsDone} total={REVISION_KEYS.length} barClass="bg-primary" />
            <ProgressRow label="Unit" done={progress.unitDone} total={progress.unitTotal} barClass="bg-chart-4" />
            <ProgressRow label="Subject" done={progress.subjDone} total={progress.subjTotal} barClass="bg-secondary" />
          </div>
          <p className="text-[9px] text-muted-foreground/45 font-semibold text-center">
            {selected} done for {progress.unitDone} of {progress.unitTotal} topics in this unit
          </p>
        </Card>

        {/* ═══ 4. STUDY TIMER — the same Stopwatch / Countdown card as the topic window, logging the selected round ═══ */}
        <StudyTimeCard
          key={selected}
          draft={roundDraft}
          revisionKey={selected}
          subjectId={subjectId}
          unitId={unitId}
          subjectName={subjectName}
          addTime={addTime}
          deleteTimeEntry={deleteEntry}
          editTimeEntry={editEntry}
          setField={setRoundField}
          onBeforeSave={onFlush}
        />
        <div className="flex items-center justify-between px-1">
          <span className="text-[9px] text-muted-foreground/50 font-bold">All revision rounds</span>
          <span className="text-[10px] font-mono font-bold text-muted-foreground">{formatStudyTime(allRoundsTime)}</span>
        </div>

        <div className="h-4" />
      </motion.div>
      </AnimatePresence>
    </BottomSheet>
  );
}
