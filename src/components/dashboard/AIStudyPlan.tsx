import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarClock, Sparkles, Loader2, RefreshCw, BookOpen, Brain, RotateCcw, Lightbulb } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import type { Subject, StudyGoals } from '../../types';
import GlowCard from '../shared/GlowCard';
import { generateStudyPlan, type GenerateStudyPlanOutputType } from '@/platform/api';
import { reportAiError } from '@/platform/ai';

interface Props {
  subjects: Subject[];
  studyGoals: StudyGoals;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  new_learning: { icon: '📖', color: 'text-primary' },
  revision: { icon: '🔁', color: 'text-chart-4' },
  practice: { icon: '🧪', color: 'text-diff-easy' },
  srs_review: { icon: '🧠', color: 'text-violet-500' },
  break: { icon: '☕', color: 'text-muted-foreground' },
};

export default function AIStudyPlan({ subjects, studyGoals }: Props) {
  const [plan, setPlan] = useState<GenerateStudyPlanOutputType | null>(null);
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(false);

  const progressSummary = useMemo(() => {
    const lines: string[] = [];
    subjects.forEach(s => {
      let total = 0, done = 0, hardLeft = 0, importantLeft = 0, norcetHighLeft = 0;
      const dueSrs: string[] = [];
      const now = Date.now();
      s.units.forEach(u => u.subTopics.forEach(t => {
        total++;
        if (t.completed) done++;
        else {
          if (t.difficulty === 'Hard') hardLeft++;
          if (t.important) importantLeft++;
          if (t.norcetRelevance === 'High') norcetHighLeft++;
        }
        if (t.srsDueDate && new Date(t.srsDueDate).getTime() < now) dueSrs.push(t.name);
      }));
      const daysToExam = Math.max(0, Math.ceil((new Date(s.examDate).getTime() - now) / 86400000));
      lines.push(`${s.shortName}: ${done}/${total} done (${total - done} left), ${hardLeft} hard pending, ${importantLeft} important pending, ${norcetHighLeft} NORCET-high pending, ${dueSrs.length} SRS due, exam in ${daysToExam}d`);
    });
    return lines.join('\n');
  }, [subjects]);

  const nearestExamDays = useMemo(() => {
    const now = Date.now();
    return subjects.reduce((min, s) => {
      const d = Math.max(0, Math.ceil((new Date(s.examDate).getTime() - now) / 86400000));
      return d < min ? d : min;
    }, 999);
  }, [subjects]);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const result = await generateStudyPlan({
        progressSummary,
        dailyHoursGoal: studyGoals.dailyHours,
        daysUntilExam: nearestExamDays,
      });
      setPlan(result);
      setShown(true);
    } catch (err) {
      reportAiError(err, toast, 'Failed to generate study plan');
    }
    setLoading(false);
  }, [progressSummary, studyGoals.dailyHours, nearestExamDays]);

  if (!shown) {
    return (
      <GlowCard className="p-4" paper>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-bold text-foreground">AI Study Plan</h3>
          </div>
          <Button size="sm" onClick={generate} disabled={loading} className="gap-1.5 text-xs h-8">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {loading ? 'Creating...' : "Today's Plan"}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Get a personalized daily study schedule based on your progress, exams & goals.
        </p>
      </GlowCard>
    );
  }

  if (!plan) return null;

  return (
    <GlowCard className="p-4" paper>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-bold text-foreground">Today's Study Plan</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={generate} disabled={loading} className="gap-1 text-xs h-7">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </Button>
      </div>

      <div className="space-y-2.5">
        {plan.plan.map((block, i) => {
          const tc = TYPE_CONFIG[block.type] || TYPE_CONFIG.new_learning;
          return (
            <motion.div key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex gap-3 p-3 rounded-xl border border-border/15 bg-card/30 hover:bg-card/50 transition-colors"
            >
              <div className="flex flex-col items-center gap-1 shrink-0">
                <span className="text-lg">{tc.icon}</span>
                <span className="text-[8px] text-muted-foreground font-bold">{block.duration}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-bold text-foreground">{block.timeBlock}</span>
                </div>
                <p className={`text-[10px] font-semibold ${tc.color}`}>{block.subject}</p>
                {block.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {block.topics.slice(0, 3).map((t, j) => (
                      <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">{t}</span>
                    ))}
                    {block.topics.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">+{block.topics.length - 3} more</span>
                    )}
                  </div>
                )}
                {block.tip && (
                  <p className="text-[9px] text-muted-foreground/70 mt-1 flex items-center gap-1">
                    <Lightbulb className="w-2.5 h-2.5 text-chart-4 shrink-0" /> {block.tip}
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {plan.motivationalNote && (
        <div className="mt-3 rounded-xl bg-accent/5 border border-accent/10 p-3 text-center">
          <p className="text-xs text-accent font-semibold">💪 {plan.motivationalNote}</p>
        </div>
      )}
    </GlowCard>
  );
}
