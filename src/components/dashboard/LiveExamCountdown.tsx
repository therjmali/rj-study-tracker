import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { ExamConfig, Subject } from '../../types';

interface Props {
  exams: ExamConfig[];
  subjects: Subject[];
}

export default function LiveExamCountdown({ exams, subjects }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const closest = useMemo(() => {
    const upcoming = exams
      .map(e => {
        const examTime = e.time || '00:00';
        const target = new Date(`${e.date}T${examTime}:00`).getTime();
        const diff = target - now;
        const linked = subjects.filter(s => e.subjects.includes(s.id));
        const color = linked[0]?.color || e.color;
        return { ...e, target, diff, color };
      })
      .filter(e => e.diff > 0)
      .sort((a, b) => a.diff - b.diff);
    return upcoming[0] || null;
  }, [exams, subjects, now]);

  if (!closest) return null;

  const diff = closest.diff;
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  const urgency = days <= 7 ? 'critical' : days <= 14 ? 'warning' : 'safe';
  const pulseColor = urgency === 'critical' ? 'bg-destructive' : urgency === 'warning' ? 'bg-chart-4' : 'bg-secondary';
  const textColor = urgency === 'critical' ? 'text-destructive' : urgency === 'warning' ? 'text-chart-4' : 'text-secondary';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border/20 bg-card/40 backdrop-blur-sm"
    >
      {/* Pulsing urgency dot */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pulseColor} opacity-50`} />
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${pulseColor}`} />
      </span>

      {/* Subject color dot */}
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: closest.color }} />

      {/* Exam name */}
      <span className="text-[11px] font-bold text-foreground truncate max-w-[120px]">
        {closest.emoji} {closest.label}
      </span>

      {/* Countdown */}
      <div className="flex items-center gap-1 ml-auto shrink-0">
        {days > 0 && (
          <span className={`text-xs font-black font-mono ${textColor}`}>{days}d</span>
        )}
        <span className={`text-xs font-black font-mono tabular-nums ${textColor}`}>
          {String(hrs).padStart(2, '0')}:{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </span>
      </div>
    </motion.div>
  );
}
