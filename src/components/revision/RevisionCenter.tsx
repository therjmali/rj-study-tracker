/**
 * Revision Center — the focused revision-study window.
 *
 * Revision sessions are treated as first-class citizens, functionally
 * identical to studying main topics:
 *   • The queue is built from completed topics whose next round (R1–R4)
 *     is not yet complete, ordered longest-untouched first.
 *   • Left/right swipe navigates the queue (mirroring the Main Topics
 *     window's gesture behavior) with deliberate offset + velocity
 *     thresholds so a casual flick never skips a topic.
 *   • The embeddable `<StudyTimer />` runs the same Stopwatch/Countdown UI
 *     as the Main Topics window. Because it is the single app-wide timer,
 *     it KEEPS RUNNING while the user swipes between topics — elapsed time
 *     is re-attributed to the newly selected topic on remount (`linkTopic`).
 *     We deliberately do NOT auto-pause on swipe: revision sits are usually
 *     quick, back-to-back rounds, and losing accrued time on a flick is
 *     worse than an explicit stop. A swipe carrying ≥ 30 s of elapsed time
 *     commits that effort as the departing topic's revision session before
 *     advancing (completion on swipe).
 *   • Completing a round (button or swipe) writes a `RevisionSession`,
 *     updates `topic.revisions[round]` (status, timeSpent, timeEntries),
 *     logs a `DbStudySession` (type 'Other') so revision time shows on the
 *     calendar/day views, and auto-advances to the next due topic.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, Timer, ChevronRight, ChevronLeft, Flame, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { useTimer } from '../../contexts/TimerContext';
import StudyTimer, { type StudyTimerRef } from './StudyTimer';
import { getTopicsDueForRevision, getRoundAggregates, type DueRevisionItem } from '../../lib/revisionSessions';
import { roundState, studyMinutes } from '../../lib/revisionCenter';
import type { Subject, RevisionSession, RevisionKey } from '../../types';
import { REVISION_KEYS } from '../../types';
import { createSession } from '../../platform/api';
import { getLocalDateStr, formatStudyTime } from '../../lib/utils';

// Per-round chip styling (local — revisionCenter.ts keeps pure sort/filter helpers).
const ROUND_STYLE: Record<RevisionKey, { bar: string; soft: string }> = {
  R1: { bar: 'bg-primary', soft: 'bg-primary/10' },
  R2: { bar: 'bg-secondary', soft: 'bg-secondary/10' },
  R3: { bar: 'bg-accent', soft: 'bg-accent/10' },
  R4: { bar: 'bg-destructive', soft: 'bg-destructive/10' },
};

const ROUND_LABEL: Record<RevisionKey, string> = {
  R1: 'First Revision', R2: 'Second Revision', R3: 'Third Revision', R4: 'Final Revision',
};

const SWIPE_OFFSET_THRESHOLD = 70; // px
const SWIPE_VELOCITY_THRESHOLD = 400; // px/s

interface Props {
  subjects: Subject[];
  onUpdate: (subjects: Subject[]) => void;
  /** Fired after a revision round is saved (parent persists the session). */
  onRevisionComplete?: (session: RevisionSession) => void;
  /** Pre-select a round: 'R1' | 'R2' | 'R3' | 'R4', or undefined for all due. */
  initialRound?: RevisionKey | undefined;
  className?: string;
}

export default function RevisionCenter({
  subjects,
  onUpdate,
  onRevisionComplete,
  initialRound,
  className,
}: Props) {
  const { state: timer } = useTimer();
  const [roundFilter, setRoundFilter] = useState<RevisionKey | 'all'>(initialRound ?? 'all');
  const [index, setIndex] = useState(0);
  const [currentRound, setCurrentRound] = useState<RevisionKey | undefined>(undefined);
  const timerRef = useRef<StudyTimerRef | null>(null);

  const queue = useMemo<DueRevisionItem[]>(
    () => getTopicsDueForRevision(subjects).filter((item) => roundFilter === 'all' || item.round === roundFilter),
    [subjects, roundFilter],
  );

  const item = queue[index];
  const isLast = index >= queue.length - 1;
  const isFirst = index <= 0;

  const timerHasProgress = timer.active || timer.hasProgress;

  // Re-link the running timer to the topic currently on screen so elapsed
  // time keeps accruing and is attributed correctly when the user saves.
  // The timer itself is app-wide state — swiping never pauses it.
  useEffect(() => {
    if (!item) return;
    setCurrentRound(item.round);
  }, [item]);

  const aggregates = useMemo(() => getRoundAggregates(subjects), [subjects]);

  /* ─── navigation ─── */
  const moveTo = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(queue.length - 1, next)));
  }, [queue.length]);

  /* ─── saving a revision round ─── */
  const handleSaveRevision = useCallback(
    (saved: { minutes: number; startedAt: number; endedAt: number }) => {
      if (!item) return;
      handleSaveRevisionInner(saved);
    },
    [item],
  );

  const handleSwipe = useCallback((dir: -1 | 1) => {
    if (queue.length === 0) return;
    const next = dir === 1 ? index + 1 : index - 1;
    if (next < 0 || next >= queue.length) {
      toast.info(dir === 1 ? 'That was the last topic due for revision.' : 'That was the first topic in the queue.');
      return;
    }
    // Commit in-progress time on the departing topic before advancing
    // (completion on swipe). Bare navigation keeps the timer running.
    const saved = timerRef.current?.save();
    if (saved) {
      handleSaveRevision(saved);
    } else {
      moveTo(next);
    }
  }, [index, queue.length, moveTo, handleSaveRevision]);

  function handleSaveRevisionInner(saved: { minutes: number; startedAt: number; endedAt: number }): void {
    if (!item) return;
    const round = currentRound || item.round;
    const now = new Date(saved.endedAt);
    const start = new Date(saved.startedAt);
    const dateStr = getLocalDateStr(now);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const startTimeStr = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;

    const session: RevisionSession = {
      id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      subjectId: item.subject.id,
      subjectName: item.subject.name,
      unitId: item.unitId,
      unitName: item.unitName,
      topicId: item.topic.id,
      topicName: item.topic.name,
      revisionRound: round,
      durationMinutes: saved.minutes,
      date: dateStr,
      startTime: startTimeStr,
      endTime: timeStr,
      createdAt: now.toISOString(),
    };

    // Persist the subject tree: mark this round complete on the topic.
    const nextSubjects = subjects.map((s) =>
      s.id !== item.subject.id
        ? s
        : {
            ...s,
            units: s.units.map((u) =>
              u.id !== item.unitId
                ? u
                : {
                    ...u,
                    subTopics: u.subTopics.map((t) =>
                      t.id !== item.topic.id
                        ? t
                        : {
                            ...t,
                            revisions: {
                              ...t.revisions,
                              [round]: {
                                status: 'complete' as const,
                                startedDate: t.revisions?.[round]?.startedDate ?? dateStr,
                                completedDate: dateStr,
                                completedTime: timeStr,
                                timeSpent: (t.revisions?.[round]?.timeSpent ?? 0) + saved.minutes,
                                timeEntries: [
                                  ...(t.revisions?.[round]?.timeEntries ?? []),
                                  { date: dateStr, minutes: saved.minutes, time: timeStr, status: 'complete' },
                                ],
                              },
                            },
                          },
                    ),
                  },
                ),
              },
            );

    onUpdate(nextSubjects);

    // Log a first-class DB session so revision time appears on the calendar
    // and day views exactly like a main study session (type 'Other' → no
    // overlap deduction against topic/unit time).
    void createSession({
      date: dateStr,
      minutes: saved.minutes,
      description: `[${round}] ${item.topic.name}`,
      type: 'Other',
      subjectId: item.subject.id,
      subjectName: item.subject.name,
      topicId: item.topic.id,
      unitId: item.unitId,
      startTime: startTimeStr,
      endTime: timeStr,
      note: `Revision round ${round}`,
    });

    onRevisionComplete?.(session);
    toast.success(`✅ ${item.topic.name} — ${round} complete (${formatStudyTime(saved.minutes)})`, {
      duration: 3000,
    });

    // Auto-advance to the next due topic; the timer keeps running.
    if (isLast) {
      toast('All caught up — no more topics due for revision.', { duration: 3000 });
    } else {
      moveTo(index + 1);
    }
  }

  /* ─── swipe gesture (framer-motion) ─── */
  const handleDragEnd = useCallback(
    (_event: PointerEvent, info: { point: { x: number; y: number }; velocity: { x: number; y: number } }) => {
      if (queue.length === 0) return;
      const offset = info.point.x;
      const velocity = info.velocity.x;
      const swipedLeft = offset < -SWIPE_OFFSET_THRESHOLD || velocity < -SWIPE_VELOCITY_THRESHOLD;
      const swipedRight = offset > SWIPE_OFFSET_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD;

      if (swipedLeft) {
        // Swipe left → next topic.
        handleSwipe(1);
      } else if (swipedRight) {
        // Swipe right → previous topic.
        handleSwipe(-1);
      }
    },
    [queue.length, handleSwipe],
  );

  /* ─── render ─── */
  if (subjects.length === 0) {
    return (
      <div className={`rounded-3xl border border-border/15 bg-card/50 p-6 text-center ${className ?? ''}`}>
        <Timer className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-foreground">No Syllabus Yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Add subjects and topics in the Syllabus tab, then come back to revise.
        </p>
      </div>
    );
  }

  if (queue.length === 0) {
    const pending = aggregates.some((a) => a.left > 0);
    return (
      <div className={`rounded-3xl border border-border/15 bg-card/50 p-6 text-center ${className ?? ''}`}>
        <Check className="w-10 h-10 text-chart-4 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-foreground">
          {roundFilter === 'all' ? 'All Caught Up 🎉' : `No ${roundFilter} Topics Due`}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {roundFilter === 'all'
            ? 'There are no completed topics waiting for a revision round.'
            : `Every completed topic is up to date with ${roundFilter}. Switch rounds or revise another subject.`}
        </p>
        {pending && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setRoundFilter('all'); setIndex(0); setCurrentRound(undefined); }}
            className="mt-3 h-9 rounded-xl text-[11px] font-bold gap-1.5"
          >
            <Flame className="w-3 h-3" /> Show all due topics
          </Button>
        )}
      </div>
    );
  }

  const roundFilterItems = useMemo(
    () => [
      { key: 'all' as const, label: 'All rounds' },
      ...REVISION_KEYS.map((k) => ({ key: k, label: k, hint: ROUND_LABEL[k] })),
    ],
    [],
  );

  const aggregatesByRound = useMemo(() => {
    const map: Record<RevisionKey, (typeof aggregates)[number]> = {} as any;
    aggregates.forEach((a) => { map[a.key] = a; });
    return map;
  }, [aggregates]);

  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
            <Timer className="w-5 h-5 text-primary" /> Revision Center
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {item ? `${item.subject.shortName} › ${item.unitName}` : ''} ·
            <span className="font-bold text-foreground">{index + 1}</span> of {queue.length} due
          </p>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {roundFilterItems.map((f) => {
            const active = roundFilter === f.key;
            const stat = aggregatesByRound[f.key as RevisionKey];
            return (
              <button key={f.key} onClick={() => { setRoundFilter(f.key); setIndex(0); setCurrentRound(undefined); }}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all active:scale-95 ${active
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card/50 text-foreground/70 border-border/20 hover:bg-card hover:text-foreground'}`}>
                {f.label}
                {stat && <span className="font-mono text-[9px]">{stat.done}·{stat.left}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Topic card */}
      <AnimatePresence mode="wait">
        {item && (
          <motion.div key={item.topic.id}
            drag="x"
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-border/15 bg-card/60 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.subject.color }} />
                  <span className="text-[10px] font-black uppercase tracking-wider text-foreground/60">{item.subject.shortName}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{item.round}</span>
                  {item.inProgress && <span className="text-[9px] px-1.5 py-0.5 rounded bg-chart-4/15 text-chart-4 border border-chart-4/20 font-bold">in progress</span>}
                </div>
                <p className="text-xl font-black text-foreground leading-tight mb-2">{item.topic.name}</p>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {REVISION_KEYS.map((k) => {
                      const st = roundState(item.topic, k);
                      return (
                        <span key={k} className={`text-[9px] leading-none font-black px-2 py-1.5 rounded-xl border shrink-0 ${st === 'done' ? ROUND_STYLE[k].bar + ' text-white' : st === 'active' ? `border ${ROUND_STYLE[k].soft} animate-soft-pulse` : 'bg-muted/25 text-muted-foreground/45 border-border/10'}`}>
                          {k} {st === 'done' ? '✓' : st === 'active' ? '●' : '○'}
                        </span>
                      );
                    })}
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {studyMinutes(item.topic)}m studied · {item.roundMinutes}m in {item.round}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">
                  Last touched {item.daysSinceTouched === null ? 'never' : item.daysSinceTouched === 0 ? 'today' : `${item.daysSinceTouched}d ago`}
                  {item.topic.difficulty && ` · ${item.topic.difficulty}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-3xl font-black font-mono text-primary">
                  {timer.appMode === 'stopwatch' ? (timer.swRunning ? '⏱ Running' : '⏱ Stopwatch') : '⏳ Countdown'}
                </span>
              </div>
            </div>

            {/* StudyTimer — same UI as the Main Topics window, linked to this topic */}
            <div className="mt-4">
              <StudyTimer
                ref={timerRef}
                settings={{ focusMin: 25, shortBreakMin: 5, longBreakMin: 15, autoStartBreaks: false, soundEnabled: true }}
                subjects={subjects}
                initialSubjectId={item.subject.id}
                initialUnitId={item.unitId}
                initialTopicId={item.topic.id}
                onSessionComplete={handleSaveRevisionInner}
              />
            </div>

            {/* Round completion + navigation */}
            <div className="mt-4 flex items-center gap-2">
              <Button
                onClick={() => {
                  const saved = timerRef.current?.save();
                  if (saved) handleSaveRevisionInner(saved);
                }}
                disabled={!timerHasProgress}
                className="flex-1 bg-primary text-primary-foreground font-bold rounded-xl h-11 active:scale-[0.99] transition-transform"
              >
                {timer.active ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                Complete {currentRound || item.round} & Next
              </Button>
              <Button variant="outline" size="icon" onClick={() => handleSwipe(1)} disabled={isLast}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => handleSwipe(-1)} disabled={isFirst}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Round aggregates (at a glance) */}
      <div className="grid grid-cols-4 gap-2">
        {REVISION_KEYS.map((k) => {
          const a = aggregatesByRound[k];
          if (!a) return null;
          return (
            <div key={k} className={`rounded-xl border p-2.5 bg-card/50 ${k === currentRound ? 'border-primary/40 bg-primary/5' : 'border-border/10'}`}>
              <span className="text-[10px] font-black uppercase tracking-wider text-foreground/50">{k}</span>
              <span className="text-xs font-bold font-mono text-foreground">{a.done}</span>
              <span className="text-[9px] text-muted-foreground">{a.left} left · {formatStudyTime(a.minutes)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


