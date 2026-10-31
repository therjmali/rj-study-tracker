import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock } from 'lucide-react';
import type { Subject } from '../../types';
import CircularProgress from '../shared/CircularProgress';

interface Props {
  subjects: Subject[];
}

export default function SubjectCountdownStrip({ subjects }: Props) {
  const sorted = useMemo(() => {
    const withDate = subjects.filter(s => s.examDate);
    return withDate.sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());
  }, [subjects]);

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5 px-0.5">
        <CalendarClock className="w-3.5 h-3.5 text-primary" /> Subject Exam Countdown
      </h3>
      <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
        {sorted.map((s, i) => (
          <CountdownCard key={s.id} subject={s} index={i} />
        ))}
      </div>
    </div>
  );
}

function CountdownCard({ subject, index }: { subject: Subject; index: number }) {
  const now = Date.now();
  const examTime = new Date(subject.examDate).getTime();
  const daysLeft = Math.ceil((examTime - now) / 86400000);
  const isPast = daysLeft <= 0;
  const isCritical = !isPast && daysLeft <= 7;
  const isUrgent = !isPast && daysLeft <= 15;

  const all = subject.units.flatMap(u => u.subTopics);
  const done = all.filter(t => t.completed).length;
  const pct = all.length > 0 ? Math.round((done / all.length) * 100) : 0;

  const glowClass = isPast
    ? 'border-muted-foreground/30'
    : isCritical
    ? 'border-destructive/40'
    : isUrgent
    ? 'border-destructive/30'
    : 'border-border/20';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`flex-shrink-0 w-[130px] rounded-2xl border bg-card/50 backdrop-blur-sm p-3 flex flex-col items-center gap-2 ${glowClass}`}
      style={{
        boxShadow: isCritical ? `0 0 16px hsl(var(--destructive) / 0.15)` :
                    pct >= 100 ? `0 0 12px ${subject.color}30` : undefined,
      }}
    >
      {/* Color dot + name */}
      <div className="flex items-center gap-1.5 w-full">
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color, boxShadow: `0 0 6px ${subject.color}50` }} />
        <span className="text-[11px] font-bold text-foreground truncate">{subject.shortName}</span>
      </div>

      {/* Progress ring with glow */}
      <div style={{ filter: pct >= 100 ? `drop-shadow(0 0 6px ${subject.color}60)` : `drop-shadow(0 0 3px ${subject.color}30)` }}>
        <CircularProgress value={done} max={all.length} size={48} strokeWidth={3.5} color={subject.color} />
      </div>

      {/* Days or badge */}
      {isPast ? (
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          Exam Over
        </span>
      ) : (
        <div className="text-center">
          <p className={`text-lg font-black font-mono leading-none ${isCritical ? 'text-destructive' : isUrgent ? 'text-destructive/80' : 'text-foreground'}`}>
            {daysLeft}
          </p>
          <p className="text-[9px] text-muted-foreground">days left</p>
        </div>
      )}

      {/* Completion % with tier emoji */}
      <span className="text-[9px] text-muted-foreground font-mono flex items-center gap-1">
        {pct >= 90 ? '🏆' : pct >= 70 ? '🥇' : pct >= 50 ? '🥈' : '🥉'}
        <span className="font-bold">{pct}%</span> done
      </span>
    </motion.div>
  );
}
