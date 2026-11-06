import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import type { Subject, ExamConfig } from '../../types';
import { formatDate } from '../../lib/utils';
import ExamPosterCard, { computeExamPosterData, useImageBrightness } from '../shared/ExamPosterCard';
import type { ExamPosterData } from '../shared/ExamPosterCard';

interface Props {
  exams: ExamConfig[];
  subjects: Subject[];
  onNavigate: (tab: string, filter?: Record<string, string>) => void;
  onManageExams?: () => void;
}

export default function ExamShelf({ exams, subjects, onNavigate, onManageExams }: Props) {
  const [now, setNow] = useState(Date.now());
  const [activeIdx, setActiveIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const interactionTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const examData = useMemo(() => {
    return exams.map(exam => {
      const data = computeExamPosterData(exam, subjects, now);
      return { ...data, diff: data.isPast ? -1 : 1 };
    }).sort((a, b) => {
      if (a.isPast && !b.isPast) return 1;
      if (!a.isPast && b.isPast) return -1;
      return a.days - b.days;
    });
  }, [exams, subjects, now]);

  const upcoming = useMemo(() => examData.filter(e => !e.isPast), [examData]);
  const list = upcoming.length > 0 ? upcoming : examData;

  // auto-swipe
  useEffect(() => {
    if (list.length <= 1 || userInteracted || expanded) return;
    const id = setInterval(() => setActiveIdx(i => (i + 1) % list.length), 5000);
    return () => clearInterval(id);
  }, [list.length, userInteracted, expanded]);

  useEffect(() => {
    if (activeIdx >= list.length) setActiveIdx(0);
  }, [list.length, activeIdx]);

  const pauseAutoSwipe = useCallback(() => {
    setUserInteracted(true);
    clearTimeout(interactionTimer.current);
    interactionTimer.current = setTimeout(() => setUserInteracted(false), 8000);
  }, []);

  const goTo = useCallback((i: number) => { pauseAutoSwipe(); setActiveIdx(i); }, [pauseAutoSwipe]);
  const goPrev = useCallback(() => goTo((activeIdx - 1 + list.length) % list.length), [activeIdx, list.length, goTo]);
  const goNext = useCallback(() => goTo((activeIdx + 1) % list.length), [activeIdx, list.length, goTo]);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    if (info.offset.x < -50) goNext();
    else if (info.offset.x > 50) goPrev();
  }, [goNext, goPrev]);

  if (examData.length === 0) {
    return (
      <div className="glass-card p-6 text-center space-y-2">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
          <Calendar className="w-7 h-7 text-primary" />
        </div>
        <p className="text-sm font-bold text-foreground">No upcoming exams</p>
        <p className="text-xs text-muted-foreground">Add your first exam to start tracking.</p>
      </div>
    );
  }

  const exam = list[activeIdx] || list[0];

  return (
    <div className="space-y-2">
      {/* ── Premium card ── */}
      <div className="relative rounded-3xl border border-border/20 bg-card/45 backdrop-blur-md shadow-lg overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-primary/6 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-36 h-36 rounded-full bg-secondary/5 blur-3xl" />
        </div>

        {/* ── Header Bar ── */}
        <ShelfHeader
          listLen={list.length}
          expanded={expanded}
          onExpand={() => setExpanded(p => !p)}
          onManageExams={onManageExams}
        />

        {/* ── Swipeable Exam Poster Card ── */}
        <div className="relative px-4 pb-2">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={exam.exam.id + activeIdx}
              initial={{ opacity: 0, x: 80, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -80, scale: 0.97 }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.12}
              onDragEnd={handleDragEnd}
              className="relative select-none touch-pan-y"
            >
              <ExamPosterCard
                data={exam}
                onManage={onManageExams}
                onSubjectClick={(id) => onNavigate('syllabus', { subjectId: id })}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Bottom Progress Bar + Nav Arrows ── */}
        {!exam.isPast && (
          <BottomBar
            exam={exam}
            listLen={list.length}
            onPrev={goPrev}
            onNext={goNext}
            onNavigate={onNavigate}
          />
        )}

        {/* ── Dot Indicators ── */}
        {list.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 py-2.5">
            {list.map((_, i) => (
              <button key={i} onClick={() => goTo(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === activeIdx
                    ? 'w-5 h-2 bg-primary shadow-sm shadow-primary/30'
                    : 'w-2 h-2 bg-muted-foreground/20 hover:bg-muted-foreground/35'
                }`}
              />
            ))}
            <span className="ml-2.5 text-[10px] font-mono font-bold text-muted-foreground">
              {activeIdx + 1} / {list.length}
            </span>
          </div>
        )}

        {/* ── Expanded list ── */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="overflow-hidden"
            >
              <div className="border-t border-border/10 mx-4" />
              <div className="max-h-[260px] overflow-y-auto px-3 py-2.5 space-y-1.5 scrollbar-hide">
                {list.map((e, i) => (
                  <motion.button
                    key={e.exam.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => { goTo(i); setExpanded(false); }}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                      i === activeIdx
                        ? 'bg-primary/8 border-primary/20 shadow-sm'
                        : 'bg-card/20 border-border/8 hover:bg-card/40'
                    }`}
                  >
                    {/* Show icon if available, else emoji */}
                    {e.exam.iconUrl ? (
                      <img src={e.exam.iconUrl} alt="" className="w-8 h-8 rounded-lg object-cover border border-border/20 shadow-sm" />
                    ) : (
                      <span className="text-lg">{e.exam.emoji}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{e.exam.label}</p>
                      <p className="text-[9px] text-muted-foreground font-mono">{formatDate(e.exam.date)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {e.isPast ? (
                        <span className="text-[10px] font-bold text-secondary">✅ Done</span>
                      ) : (
                        <>
                          <p className="text-sm font-black font-mono text-foreground tabular-nums">{e.days}d</p>
                          <p className="text-[9px] text-muted-foreground font-mono">{e.pct}% ready</p>
                        </>
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>


    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Header Bar
   ═══════════════════════════════════════════════════════════ */
function ShelfHeader({ listLen, expanded, onExpand, onManageExams }: {
  listLen: number; expanded: boolean;
  onExpand: () => void; onManageExams?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4 pb-2">
      {/* Icon */}
      <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
        <Calendar className="w-5 h-5 text-primary" />
      </div>

      {/* Title block */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-extrabold text-foreground tracking-tight uppercase">Exam Shelf</h3>
          <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary leading-none">Auto</span>
          {onManageExams && (
            <button onClick={onManageExams} className="text-muted-foreground hover:text-foreground transition-colors">
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Nearest exam · Auto swipes every 5s</p>
      </div>

      {/* Expand button */}
      {listLen > 1 && (
        <button
          onClick={onExpand}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border/20 bg-card/40 hover:bg-card/60 text-xs font-bold text-foreground transition-all active:scale-95"
        >
          {expanded ? 'Collapse' : 'Expand'}
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex">
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.span>
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Bottom Bar (topics progress + nav arrows)
   ═══════════════════════════════════════════════════════════ */
function BottomBar({ exam, listLen, onPrev, onNext, onNavigate }: {
  exam: ExamPosterData & { diff: number }; listLen: number;
  onPrev: () => void; onNext: () => void;
  onNavigate: Props['onNavigate'];
}) {
  return (
    <div className="flex items-center gap-2 px-4 pb-2">
      {listLen > 1 && (
        <button onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="w-8 h-8 rounded-full bg-card/50 border border-border/15 flex items-center justify-center hover:bg-card/80 transition-all active:scale-90 shrink-0">
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onNavigate('charts'); }}
        className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-muted-foreground font-medium">
            <span className="font-bold text-primary">{exam.done}</span> / {exam.total} topics completed
          </span>
          <span className="font-bold text-primary flex items-center gap-0.5">
            {exam.pct}%
            <ChevronRight className="w-3 h-3" />
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted/15 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-secondary"
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(exam.pct, 1)}%` }}
            transition={{ type: 'spring', damping: 20, stiffness: 80 }}
          />
        </div>
      </button>
      {listLen > 1 && (
        <button onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="w-8 h-8 rounded-full bg-card/50 border border-border/15 flex items-center justify-center hover:bg-card/80 transition-all active:scale-90 shrink-0">
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

/* ── Date formatter ── */
function formatExamDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()} (${days[d.getDay()]})`;
}
