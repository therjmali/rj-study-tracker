import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Settings, TrendingUp } from 'lucide-react';
import type { Subject, ExamConfig } from '../../types';
import { formatDate } from '../../lib/utils';

interface Props {
  exams: ExamConfig[];
  subjects: Subject[];
  onNavigate: (tab: string) => void;
  onManageExams?: () => void;
}

export default function ExamCountdownLive({ exams, subjects, onNavigate, onManageExams }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const examData = useMemo(() => {
    return exams.map(exam => {
      const examTime = exam.time || '00:00';
      const target = new Date(`${exam.date}T${examTime}:00`).getTime();
      const diff = target - now;
      const isPast = diff <= 0;
      const linked = subjects.filter(s => exam.subjects.includes(s.id));
      const total = linked.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
      const done = linked.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;

      const absDiff = Math.max(0, diff);
      const days = Math.floor(absDiff / 86400000);
      const hrs = Math.floor((absDiff % 86400000) / 3600000);
      const mins = Math.floor((absDiff % 3600000) / 60000);
      const secs = Math.floor((absDiff % 60000) / 1000);

      return { ...exam, diff, isPast, total, done, pct, days, hrs, mins, secs };
    }).sort((a, b) => {
      if (a.isPast && !b.isPast) return 1;
      if (!a.isPast && b.isPast) return -1;
      return a.diff - b.diff;
    });
  }, [exams, subjects, now]);

  const upcoming = examData.filter(e => !e.isPast);
  if (upcoming.length === 0 && examData.length === 0) return null;

  const getUrgencyClasses = (days: number, isPast: boolean) => {
    if (isPast) return { border: 'border-muted/30', glow: '' };
    if (days <= 7) return { border: 'border-destructive/40', glow: 'shadow-lg shadow-destructive/15' };
    if (days <= 14) return { border: 'border-chart-4/40', glow: 'shadow-lg shadow-chart-4/15' };
    return { border: 'border-secondary/30', glow: 'shadow-md shadow-secondary/10' };
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" /> Exam Countdowns
        </h3>
        <div className="flex items-center gap-2">
          {onManageExams && (
            <button onClick={onManageExams} className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              <Settings className="w-3 h-3" /> Manage
            </button>
          )}
          <button onClick={() => onNavigate('charts')} className="text-[10px] font-bold text-primary hover:underline">
            Details →
          </button>
        </div>
      </div>

      {/* Horizontally scrollable exam cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {(upcoming.length > 0 ? upcoming : examData).slice(0, 8).map((exam, idx) => {
          const urg = getUrgencyClasses(exam.days, exam.isPast);
          return (
            <motion.button
              key={exam.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.06 }}
              onClick={() => onNavigate('charts')}
              className={`shrink-0 w-[200px] rounded-2xl border-2 ${urg.border} ${urg.glow} bg-card/50 backdrop-blur-sm p-4 text-left hover:scale-[1.02] active:scale-[0.98] transition-all`}
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{exam.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground truncate">{exam.label}</p>
                  <p className="text-[9px] text-muted-foreground font-mono">{formatDate(exam.date)}</p>
                </div>
              </div>

              {exam.isPast ? (
                <p className="text-sm font-bold text-secondary text-center py-2">✅ Completed</p>
              ) : (
                <>
                  {/* Live Countdown */}
                  <div className="text-center mb-3">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-3xl font-black font-mono text-foreground tabular-nums leading-none">
                        {exam.days}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-bold">DAYS</span>
                    </div>
                    <div className="font-mono text-base font-black tabular-nums mt-1 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent tracking-wider">
                      {String(exam.hrs).padStart(2, '0')}
                      <span className="animate-pulse">:</span>
                      {String(exam.mins).padStart(2, '0')}
                      <span className="animate-pulse">:</span>
                      {String(exam.secs).padStart(2, '0')}
                    </div>
                    <p className="text-[8px] text-muted-foreground font-mono mt-0.5">HRS : MIN : SEC</p>
                  </div>

                  {/* Linked subject rings */}
                  {(() => {
                    const linked = subjects.filter(s => exam.subjects.includes(s.id));
                    if (linked.length === 0) return null;
                    const perSub = linked.map(s => {
                      const t = s.units.reduce((a, u) => a + u.subTopics.length, 0);
                      const d = s.units.reduce((a, u) => a + u.subTopics.filter(x => x.completed).length, 0);
                      return { id: s.id, name: s.shortName, color: s.color, pct: t > 0 ? Math.round((d / t) * 100) : 0 };
                    });
                    return (
                      <div className="flex items-center justify-center gap-2 mb-2 flex-wrap">
                        {perSub.slice(0, 4).map(s => (
                          <div key={s.id} className="flex flex-col items-center gap-0.5">
                            <div className="relative w-7 h-7">
                              <svg viewBox="0 0 28 28" className="w-full h-full -rotate-90">
                                <circle cx="14" cy="14" r="10.5" fill="none" stroke="hsl(var(--muted) / 0.15)" strokeWidth="2" />
                                <circle cx="14" cy="14" r="10.5" fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round"
                                  strokeDasharray={`${2 * Math.PI * 10.5}`} strokeDashoffset={`${2 * Math.PI * 10.5 * (1 - s.pct / 100)}`}
                                  style={{ filter: `drop-shadow(0 0 2px ${s.color}40)` }} />
                              </svg>
                              <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black font-mono" style={{ color: s.color }}>{s.pct}</span>
                            </div>
                            <span className="text-[7px] font-bold text-muted-foreground truncate max-w-[40px]">{s.name}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Readiness bar */}
                  {exam.total > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-1">
                        <span className="flex items-center gap-0.5"><TrendingUp className="w-2.5 h-2.5" /> Readiness</span>
                        <span className="font-mono font-bold text-foreground">{exam.pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all" style={{ width: `${exam.pct}%` }} />
                      </div>
                      <p className="text-[8px] text-muted-foreground text-center mt-1 font-mono">{exam.done}/{exam.total} topics</p>
                    </div>
                  )}
                </>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
