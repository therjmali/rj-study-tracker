import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Target } from 'lucide-react';
import type { Subject, StudyGoals } from '../../types';
import type { DifficultyFilter } from '../../lib/studySuggestion';
import { useToday } from '../../hooks/useToday';

interface Props {
  subjects: Subject[];
  studyGoals: StudyGoals;
  difficultyFilter: DifficultyFilter;
  onNavigate?: (tab: string) => void;
}

const MOTIVATIONS = [
  { min: 0, max: 25, text: "Let's get started! Every topic counts 💪", emoji: '🚀' },
  { min: 25, max: 50, text: 'Great momentum! Keep pushing 🔥', emoji: '⚡' },
  { min: 50, max: 75, text: "You're crushing it! Almost there 🌟", emoji: '🎯' },
  { min: 75, max: 100, text: 'Amazing progress! Final stretch 💎', emoji: '👑' },
  { min: 100, max: Infinity, text: 'Target exceeded! You are unstoppable! 🏆', emoji: '🏆' },
];

export default function TodaysFocus({ subjects, studyGoals, difficultyFilter, onNavigate }: Props) {
  const today = useToday();

  const { doneToday, target } = useMemo(() => {
    let done = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (!t.completed || t.completedDate !== today) return;
      if (difficultyFilter !== 'all' && t.difficulty !== difficultyFilter) return;
      done++;
    })));
    return { doneToday: done, target: studyGoals.dailyTopics };
  }, [subjects, today, difficultyFilter, studyGoals.dailyTopics]);

  const pct = target > 0 ? Math.min(100, Math.round((doneToday / target) * 100)) : 0;
  const pctRaw = target > 0 ? (doneToday / target) * 100 : 0;
  const motivation = MOTIVATIONS.find(m => pctRaw >= m.min && pctRaw < m.max) || MOTIVATIONS[0];

  return (
    <div className="glass-card p-4 relative overflow-hidden cursor-pointer hover:shadow-md transition-all active:scale-[0.995]" onClick={() => onNavigate?.('charts')}>
      <div className="absolute bottom-0 right-0 w-28 h-28 rounded-full bg-secondary/5 blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-secondary" />
            <h3 className="text-sm font-bold text-foreground">Today's Focus</h3>
          </div>
          <span className="text-lg font-black font-mono text-foreground">
            {doneToday}<span className="text-xs text-muted-foreground font-normal">/{target}</span>
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-3 rounded-full bg-muted/30 overflow-hidden mb-2">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: pctRaw >= 100
                ? 'linear-gradient(90deg, hsl(var(--secondary)), hsl(var(--accent)))'
                : 'hsl(var(--secondary))',
              boxShadow: pctRaw >= 50 ? '0 0 12px hsl(var(--secondary) / 0.4)' : 'none',
            }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(pct, 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground flex items-center gap-1 font-semibold">
            <span>{motivation.emoji}</span>
            {motivation.text}
          </p>
          <span className="text-xs font-bold font-mono" style={{
            color: pctRaw >= 100 ? 'hsl(var(--secondary))' : pctRaw >= 50 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'
          }}>
            {pct}%
          </span>
        </div>
      </div>
    </div>
  );
}
