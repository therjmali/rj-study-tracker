import { useState, useEffect, useCallback, useRef } from 'react';
import { readableInk } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useClock } from '../../hooks/useClock';
import { getExamCountdown, formatExamTarget } from '../../lib/examUtils';
import type { Subject, ExamConfig } from '../../types';

interface Props {
  exams: ExamConfig[];
  subjects: Subject[];
  onManageExams?: () => void;
}

export default function ExamCountdownCarousel({ exams, subjects, onManageExams }: Props) {
  const now = useClock();
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const upcoming = exams.filter(e => getExamCountdown(e, now).diff > 0);
  const count = upcoming.length;

  const resetAutoSwipe = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (count > 1) {
      intervalRef.current = setInterval(() => {
        setDirection(1);
        setActiveIndex(prev => (prev + 1) % count);
      }, 4000);
    }
  }, [count]);

  useEffect(() => {
    resetAutoSwipe();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [resetAutoSwipe]);

  useEffect(() => {
    if (activeIndex >= count && count > 0) setActiveIndex(0);
  }, [count, activeIndex]);

  const goTo = (dir: -1 | 1) => {
    setDirection(dir);
    setActiveIndex(prev => (prev + dir + count) % count);
    resetAutoSwipe();
  };

  const touchStart = useRef(0);
  const onTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(diff) > 50) goTo(diff < 0 ? 1 : -1);
  };

  if (upcoming.length === 0) return null;

  const exam = upcoming[activeIndex] || upcoming[0];

  return (
    <div className="glass-card overflow-hidden relative" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {count > 1 && (
        <>
          <button onClick={() => goTo(-1)} className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-card/60 backdrop-blur border border-border/20 flex items-center justify-center hover:bg-card/80 transition-colors">
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
          <button onClick={() => goTo(1)} className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-card/60 backdrop-blur border border-border/20 flex items-center justify-center hover:bg-card/80 transition-colors">
            <ChevronRight className="w-4 h-4 text-foreground" />
          </button>
        </>
      )}

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={exam.id}
          custom={direction}
          initial={{ opacity: 0, x: direction >= 0 ? 60 : -60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction >= 0 ? -60 : 60 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          <ExamSlide exam={exam} subjects={subjects} now={now} />
        </motion.div>
      </AnimatePresence>

      {count > 1 && (
        <div className="flex justify-center gap-1.5 pb-3">
          {upcoming.map((_, i) => (
            <button key={i} onClick={() => { setDirection(i > activeIndex ? 1 : -1); setActiveIndex(i); resetAutoSwipe(); }}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${i === activeIndex ? 'bg-primary w-5' : 'bg-muted-foreground/30'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExamSlide({ exam, subjects, now }: { exam: ExamConfig; subjects: Subject[]; now: Date }) {
  const cd = getExamCountdown(exam, now);
  const targetLabel = formatExamTarget(exam);

  const linked = subjects.filter(s => exam.subjects.includes(s.id));
  const total = linked.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
  const done = linked.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const remaining = total - done;
  const topicsPerDay = cd.days > 0 ? (remaining / cd.days).toFixed(1) : '—';

  const dd = String(cd.days).padStart(2, '0');
  const hh = String(cd.hours).padStart(2, '0');
  const mm = String(cd.minutes).padStart(2, '0');

  // Per-subject completion for linked subjects
  const perSubject = linked.map(s => {
    const t = s.units.reduce((a, u) => a + u.subTopics.length, 0);
    const d = s.units.reduce((a, u) => a + u.subTopics.filter(x => x.completed).length, 0);
    return { id: s.id, name: s.shortName, color: s.color, pct: t > 0 ? Math.round((d / t) * 100) : 0 };
  });

  return (
    <div className="px-5 pt-4 pb-3">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <span className="text-2xl">{exam.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{exam.label}</p>
          <p className="text-[10px] text-muted-foreground font-medium">🎯 {targetLabel}</p>
        </div>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
          cd.isCritical ? 'bg-destructive/10 text-destructive border-destructive/20'
            : cd.isUrgent ? 'bg-chart-4/10 text-chart-4 border-chart-4/20'
            : 'bg-secondary/10 text-secondary border-secondary/20'
        }`}>
          {cd.isCritical ? '🔴 CRITICAL' : cd.isUrgent ? '🟡 URGENT' : '🟢 ON TRACK'}
        </span>
      </div>

      {/* Countdown DD:HH:MM */}
      <div className="flex items-center justify-center gap-1 my-3">
        <CountdownUnit value={dd} label="DAYS" critical={cd.isCritical} />
        <ColonSep critical={cd.isCritical} />
        <CountdownUnit value={hh} label="HRS" critical={cd.isCritical} />
        <ColonSep critical={cd.isCritical} />
        <CountdownUnit value={mm} label="MIN" critical={cd.isCritical} />
      </div>

      {/* Linked Subjects — Completion Rings */}
      {perSubject.length > 0 && (
        <div className="flex items-center justify-center gap-3 mb-2.5 flex-wrap">
          {perSubject.map(s => (
            <div key={s.id} className="flex flex-col items-center gap-0.5">
              <div className="relative w-9 h-9">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--muted) / 0.15)" strokeWidth="2.5" />
                  <circle cx="18" cy="18" r="14" fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 14}`} strokeDashoffset={`${2 * Math.PI * 14 * (1 - s.pct / 100)}`}
                    style={{ transition: 'stroke-dashoffset 0.6s ease-out', filter: s.pct >= 100 ? `drop-shadow(0 0 4px ${s.color})` : `drop-shadow(0 0 2px ${s.color}40)` }} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black font-mono" style={{ color: readableInk(s.color) }}>{s.pct}</span>
              </div>
              <span className="text-[8px] font-bold text-muted-foreground truncate max-w-[50px]">{s.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Progress + daily pace */}
      {total > 0 && (
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground font-semibold mb-1">
            <span>📊 Readiness</span>
            <span className="font-mono">{pct}% · {done}/{total}</span>
          </div>
          <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          {remaining > 0 && cd.days > 0 && (
            <p className="text-[9px] text-muted-foreground mt-1 text-right font-medium">
              Need <span className="font-mono text-foreground">{topicsPerDay}</span> topics/day to finish
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CountdownUnit({ value, label, critical }: { value: string; label: string; critical: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-4xl font-black font-mono leading-none tracking-tight ${critical ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
      <p className="text-[8px] font-bold text-muted-foreground tracking-widest mt-1">{label}</p>
    </div>
  );
}

function ColonSep({ critical }: { critical: boolean }) {
  return <span className={`text-3xl font-black font-mono -mt-2 ${critical ? 'text-destructive' : 'text-foreground'}`}>:</span>;
}
