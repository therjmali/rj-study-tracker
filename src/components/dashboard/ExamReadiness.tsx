import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';
import type { Subject, StudyGoals } from '../../types';
import GlowCard from '../shared/GlowCard';

interface Props {
  subjects: Subject[];
  studyGoals: StudyGoals;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
}

interface SubjectReadiness {
  id: string;
  name: string;
  shortName: string;
  color: string;
  pct: number;
  total: number;
  done: number;
  daysToExam: number;
}

function getTier(pct: number) {
  if (pct >= 90) return { label: 'Platinum', emoji: '🏆', color: 'text-chart-4', bg: 'bg-chart-4', glow: 'shadow-chart-4/30', shimmer: true };
  if (pct >= 70) return { label: 'Gold', emoji: '🥇', color: 'text-chart-4', bg: 'bg-chart-4', glow: 'shadow-chart-4/20', shimmer: false };
  if (pct >= 50) return { label: 'Silver', emoji: '🥈', color: 'text-muted-foreground', bg: 'bg-muted-foreground', glow: '', shimmer: false };
  return { label: 'Bronze', emoji: '🥉', color: 'text-chart-4', bg: 'bg-chart-4', glow: '', shimmer: false };
}

export default function ExamReadiness({ subjects, studyGoals, onNavigate }: Props) {
  const [expanded, setExpanded] = useState(false);

  const readiness = useMemo(() => {
    return subjects.map(s => {
      let total = 0, done = 0;
      s.units.forEach(u => u.subTopics.forEach(t => { total++; if (t.completed) done++; }));
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const daysToExam = Math.max(0, Math.ceil((new Date(s.examDate).getTime() - Date.now()) / 86400000));
      return { id: s.id, name: s.name, shortName: s.shortName, color: s.color, pct, total, done, daysToExam };
    }).sort((a, b) => a.daysToExam - b.daysToExam);
  }, [subjects]);

  const overallPct = useMemo(() => {
    let total = 0, done = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => { total++; if (t.completed) done++; })));
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [subjects]);

  const tier = getTier(overallPct);

  if (readiness.length === 0) return null;

  return (
    <GlowCard className="p-4 relative overflow-hidden" paper>
      <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-primary/[0.04] blur-[60px] pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Exam Readiness</h3>
          </div>
          <button onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold hover:text-foreground transition-colors">
            Details {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Overall Score Gauge + Tier Badge */}
        <div className="flex items-center gap-5 mb-3">
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
              <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" opacity="0.3" />
              <motion.circle
                cx="40" cy="40" r="34" fill="none"
                stroke={overallPct >= 90 ? 'hsl(var(--chart-4))' : overallPct >= 70 ? 'hsl(var(--secondary))' : overallPct >= 50 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
                strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 34}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 34 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - overallPct / 100) }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                style={{ filter: overallPct >= 90 ? 'drop-shadow(0 0 8px hsl(var(--chart-4) / 0.5))' : overallPct >= 70 ? 'drop-shadow(0 0 6px hsl(var(--secondary) / 0.4))' : 'none' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-black font-mono text-foreground">{overallPct}%</span>
              <span className="text-[8px] text-muted-foreground font-bold">syllabus</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            {/* Tier Badge */}
            <motion.div
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border mb-1.5 ${
                overallPct >= 90 ? 'bg-chart-4/15 border-chart-4/30' :
                overallPct >= 70 ? 'bg-secondary/15 border-secondary/30' :
                overallPct >= 50 ? 'bg-primary/15 border-primary/30' :
                'bg-destructive/10 border-destructive/20'
              }`}
              animate={tier.shimmer ? { boxShadow: ['0 0 8px hsl(var(--chart-4) / 0.2)', '0 0 20px hsl(var(--chart-4) / 0.4)', '0 0 8px hsl(var(--chart-4) / 0.2)'] } : {}}
              transition={tier.shimmer ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
            >
              <span className="text-base">{tier.emoji}</span>
              <span className={`text-sm font-black ${
                overallPct >= 90 ? 'text-chart-4' :
                overallPct >= 70 ? 'text-secondary' :
                overallPct >= 50 ? 'text-primary' :
                'text-destructive'
              }`}>{tier.label}</span>
            </motion.div>
            <p className="text-[10px] text-muted-foreground">
              {overallPct >= 90 ? '🔥 Outstanding! Almost exam-ready' :
               overallPct >= 70 ? '💪 Great progress, keep pushing!' :
               overallPct >= 50 ? '📈 Good start, more to cover' :
               '🚀 Early stage — stay consistent!'}
            </p>
          </div>
        </div>

        {/* Subject breakdown bars — CLICKABLE */}
        <div className="space-y-1.5">
          {readiness.map(r => {
            const t = getTier(r.pct);
            return (
              <button
                key={r.id}
                onClick={() => onNavigate?.('syllabus', { subjectId: r.id })}
                className="w-full flex items-center gap-2 p-1.5 -mx-1.5 rounded-lg hover:bg-card/50 transition-all active:scale-[0.98] group"
              >
                <span className="text-[10px] font-bold w-10 truncate text-left" style={{ color: r.color }}>{r.shortName}</span>
                <div className="flex-1 h-2.5 rounded-full bg-muted/30 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: r.color, filter: r.pct >= 90 ? `drop-shadow(0 0 4px ${r.color})` : 'none' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${r.pct}%` }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                  />
                </div>
                <span className="text-[9px] font-mono font-black w-8 text-right text-foreground">{r.pct}%</span>
                <span className="text-[8px] w-12 text-right truncate font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                  {t.emoji} {t.label}
                </span>
                {r.daysToExam <= 14 && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-destructive/15 text-destructive font-bold">{r.daysToExam}d</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Expanded details */}
        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-3 pt-3 border-t border-border/20 space-y-2.5">
                {/* Tier Legend */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { emoji: '🏆', label: 'Platinum', range: '≥90%', active: overallPct >= 90 },
                    { emoji: '🥇', label: 'Gold', range: '≥70%', active: overallPct >= 70 && overallPct < 90 },
                    { emoji: '🥈', label: 'Silver', range: '≥50%', active: overallPct >= 50 && overallPct < 70 },
                    { emoji: '🥉', label: 'Bronze', range: '<50%', active: overallPct < 50 },
                  ].map(t => (
                    <div key={t.label} className={`text-center py-2 rounded-xl border ${t.active ? 'bg-primary/10 border-primary/25 ring-1 ring-primary/20' : 'bg-card/30 border-border/15'}`}>
                      <span className="text-lg">{t.emoji}</span>
                      <p className={`text-[9px] font-bold ${t.active ? 'text-foreground' : 'text-muted-foreground'}`}>{t.label}</p>
                      <p className="text-[8px] text-muted-foreground/60 font-mono">{t.range}</p>
                    </div>
                  ))}
                </div>

                {readiness.map(r => (
                  <div key={r.id} className="rounded-xl border border-border/15 bg-card/30 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="text-xs font-bold text-foreground">{r.name}</span>
                      <span className="text-[9px] font-bold ml-auto">
                        {getTier(r.pct).emoji} {r.pct}%
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[9px] text-muted-foreground font-semibold">Progress</p>
                        <p className="text-xs font-black font-mono text-foreground">{r.done}/{r.total}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground font-semibold">Remaining</p>
                        <p className="text-xs font-black font-mono text-foreground">{r.total - r.done}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground font-semibold">Exam In</p>
                        <p className={`text-xs font-black font-mono ${r.daysToExam <= 7 ? 'text-destructive' : 'text-foreground'}`}>{r.daysToExam}d</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlowCard>
  );
}
