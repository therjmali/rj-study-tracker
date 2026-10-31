import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Circle, Star, Zap, ExternalLink, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Subject, SubTopic } from '../../types';
import { getStudySuggestions, type DifficultyFilter } from '../../lib/studySuggestion';
import SubjectLink from '../shared/SubjectLink';
import { getLocalDateStr } from '../../lib/utils';

interface Props {
  subjects: Subject[];
  difficultyFilter: DifficultyFilter;
  onToggleTopic?: (subjectId: string, unitId: string, topicId: string) => void;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string) => void;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
  onAddTodo?: (todo: { text: string; priority: 'high' | 'medium' | 'low'; dueDate: string; category?: string }) => void;
}

const DIFF_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  Easy: { bg: 'bg-diff-easy/10', text: 'text-diff-easy', glow: '0 0 8px hsl(var(--diff-easy) / 0.3)' },
  Medium: { bg: 'bg-diff-medium/10', text: 'text-diff-medium', glow: '0 0 8px hsl(var(--diff-medium) / 0.3)' },
  Hard: { bg: 'bg-diff-hard/10', text: 'text-diff-hard', glow: '0 0 8px hsl(var(--diff-hard) / 0.3)' },
};

export default function WhatToStudyNext({ subjects, difficultyFilter, onToggleTopic, onOpenTopicDetail, onNavigate, onAddTodo }: Props) {
  const suggestions = useMemo(() => {
    let items = getStudySuggestions(subjects, 8);
    if (difficultyFilter !== 'all') {
      items = items.filter(s => s.topic.difficulty === difficultyFilter);
    }
    return items.slice(0, 5);
  }, [subjects, difficultyFilter]);

  if (suggestions.length === 0) {
    return (
      <div className="glass-card p-4 text-center">
        <p className="text-sm text-muted-foreground">🎉 All caught up! No pending topics.</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-32 h-32 rounded-full bg-accent/5 blur-3xl -ml-12 -mt-12 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-bold text-foreground">What to Study Next</h3>
        </div>
        <p className="text-[9px] text-muted-foreground mb-3">
          AI-ranked by exam proximity, difficulty, importance & SRS schedule
        </p>

        <div className="space-y-2">
          {suggestions.map((s, idx) => {
            const dc = DIFF_COLORS[s.topic.difficulty] || DIFF_COLORS.Medium;
            return (
              <motion.button
                key={s.topic.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => {
                  if (onOpenTopicDetail) {
                    // Find full topic object from subjects
                    const subj = subjects.find(x => x.id === s.subjectId);
                    const unit = subj?.units.find(x => x.id === s.unitId);
                    const topic = unit?.subTopics.find(x => x.id === s.topic.id);
                    if (topic) {
                      onOpenTopicDetail(topic, s.subjectId, s.unitId);
                    }
                  } else {
                    onToggleTopic?.(s.subjectId, s.unitId, s.topic.id);
                  }
                }}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border/15 bg-card/30 hover:bg-card/50 hover:border-border/30 transition-all active:scale-[0.98] text-left group"
              >
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted/20 shrink-0">
                  <span className="text-[10px] font-bold font-mono text-muted-foreground">#{idx + 1}</span>
                </div>

                {onOpenTopicDetail ? (
                  <ExternalLink className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary shrink-0 transition-colors" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary shrink-0 transition-colors" />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">{s.topic.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <SubjectLink shortName={s.subjectShortName} color={s.subjectColor} subjectId={s.subjectId} onNavigate={onNavigate} className="text-[8px]" />
                    <span className={`text-[8px] px-1.5 py-0.5 rounded ${dc.bg} ${dc.text}`}
                      style={{ boxShadow: dc.glow }}>
                      {s.topic.difficulty}
                    </span>
                    {s.reasons.slice(0, 2).map((r, i) => (
                      <span key={i} className="text-[7px] text-muted-foreground/60">{r}</span>
                    ))}
                  </div>
                </div>

                {s.topic.important && <Star className="w-3 h-3 fill-chart-4 text-chart-4 shrink-0" />}

                <div className="text-[9px] font-mono text-accent font-bold shrink-0">
                  {s.score}pt
                </div>

                {onAddTodo && (
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddTodo({
                        text: `📖 Study: ${s.topic.name} (${s.subjectShortName})`,
                        priority: 'high',
                        dueDate: getLocalDateStr(),
                        category: 'Study',
                      });
                      toast.success('✅ Added to today\'s tasks');
                    }}
                    className="w-7 h-7 rounded-lg bg-secondary/10 border border-secondary/15 flex items-center justify-center shrink-0 hover:bg-secondary/20 active:bg-secondary/25 transition-all sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                    title="Add to today's tasks"
                  >
                    <Plus className="w-3.5 h-3.5 text-secondary" />
                  </motion.button>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
