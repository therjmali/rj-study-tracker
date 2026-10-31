import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, TrendingUp, Settings } from 'lucide-react';
import type { Subject, ExamConfig } from '../../types';
import { formatDate } from '../../lib/utils';

interface Props {
  exams: ExamConfig[];
  subjects: Subject[];
  onNavigate: (tab: string) => void;
  onManageExams?: () => void;
}

function getUrgencyStyle(days: number) {
  if (days <= 0) return { border: 'border-muted/20', bg: 'bg-muted/5', badge: 'bg-muted/20 text-muted-foreground', label: 'Done' };
  if (days <= 7) return { border: 'border-destructive/30', bg: 'bg-destructive/5', badge: 'bg-destructive/15 text-destructive', label: 'Critical' };
  if (days <= 14) return { border: 'border-chart-4/30', bg: 'bg-chart-4/5', badge: 'bg-chart-4/15 text-chart-4', label: 'Urgent' };
  if (days <= 30) return { border: 'border-accent/30', bg: 'bg-accent/5', badge: 'bg-accent/15 text-accent', label: 'Soon' };
  return { border: 'border-secondary/20', bg: 'bg-secondary/5', badge: 'bg-secondary/15 text-secondary', label: 'On Track' };
}

export default function ExamGrid({ exams, subjects, onNavigate, onManageExams }: Props) {
  const examData = useMemo(() => {
    return exams.map(exam => {
      const days = Math.max(0, Math.ceil((new Date(exam.date).getTime() - Date.now()) / 86400000));
      const linked = subjects.filter(s => exam.subjects.includes(s.id));
      const total = linked.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
      const done = linked.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const isPast = new Date(exam.date).getTime() < Date.now();
      return { ...exam, days, total, done, pct, isPast, urgency: getUrgencyStyle(isPast ? 0 : days) };
    }).sort((a, b) => {
      if (a.isPast && !b.isPast) return 1;
      if (!a.isPast && b.isPast) return -1;
      return a.days - b.days;
    });
  }, [exams, subjects]);

  if (exams.length === 0) return null;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" /> Next Exams
        </h3>
        <div className="flex items-center gap-2">
          {onManageExams && (
            <button onClick={onManageExams} className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              <Settings className="w-3 h-3" /> Manage
            </button>
          )}
          <button onClick={() => onNavigate('charts')} className="text-[10px] font-bold text-primary hover:underline">
            View Details →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {examData.slice(0, 6).map((exam, idx) => (
          <motion.button key={exam.id}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            onClick={() => onNavigate('charts')}
            className={`flex flex-col items-start p-3 rounded-xl border-2 ${exam.urgency.border} ${exam.urgency.bg} hover:scale-[1.02] active:scale-[0.98] transition-all text-left`}>
            
            <div className="flex items-center gap-2 w-full mb-2">
              <span className="text-xl">{exam.emoji}</span>
              <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${exam.urgency.badge}`}>
                {exam.urgency.label}
              </span>
            </div>

            <p className="text-[11px] font-bold text-foreground truncate w-full mb-0.5">{exam.label}</p>
            <p className="text-[9px] text-muted-foreground font-mono mb-2">{formatDate(exam.date)}</p>

            {!exam.isPast ? (
              <>
                <div className="flex items-center gap-1 mb-1.5">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-sm font-black font-mono text-foreground">{exam.days}</span>
                  <span className="text-[9px] text-muted-foreground">days left</span>
                </div>

                {exam.total > 0 && (
                  <div className="w-full">
                    <div className="flex items-center justify-between text-[8px] text-muted-foreground mb-0.5">
                      <span className="flex items-center gap-0.5"><TrendingUp className="w-2.5 h-2.5" /> Readiness</span>
                      <span className="font-mono font-bold">{exam.pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${exam.pct}%` }} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <span className="text-[10px] text-secondary font-bold">✅ Completed</span>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
