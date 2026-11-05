import { useMemo } from 'react';
import { readableInk } from '../../lib/utils';
import { motion } from 'framer-motion';
import type { Subject } from '../../types';
import type { DifficultyFilter } from '../../lib/studySuggestion';
import CircularProgress from '../shared/CircularProgress';

interface Props {
  subjects: Subject[];
  difficultyFilter: DifficultyFilter;
  onNavigate: (tab: string) => void;
}

export default function SubjectProgressStrip({ subjects, difficultyFilter, onNavigate }: Props) {
  const subjectStats = useMemo(() => {
    return subjects.map(s => {
      let total = 0, done = 0;
      s.units.forEach(u => u.subTopics.forEach(t => {
        if (difficultyFilter !== 'all' && t.difficulty !== difficultyFilter) return;
        total++;
        if (t.completed) done++;
      }));
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const daysLeft = Math.max(0, Math.ceil((new Date(s.examDate).getTime() - Date.now()) / 86400000));
      return { ...s, total, done, pct, daysLeft };
    });
  }, [subjects, difficultyFilter]);

  if (subjects.length === 0) return null;

  return (
    <div className="glass-card p-4">
      <h3 className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
        📚 Subject Progress
      </h3>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        {subjectStats.map((s, idx) => (
          <motion.button
            key={s.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
            onClick={() => onNavigate('syllabus')}
            className="flex flex-col items-center gap-1.5 min-w-[72px] shrink-0 p-2 rounded-xl hover:bg-card/40 transition-all active:scale-95"
          >
            <CircularProgress
              value={s.done}
              max={s.total}
              size={48}
              strokeWidth={4}
              color={s.color}
            />
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border truncate max-w-[68px]"
              style={{ color: readableInk(s.color), backgroundColor: s.color + '12', borderColor: s.color + '25' }}>
              {s.shortName}
            </span>
            <span className="text-[8px] text-muted-foreground font-mono">{s.pct}%</span>
            {s.daysLeft > 0 && s.daysLeft <= 14 && (
              <span className="text-[7px] text-destructive font-bold">{s.daysLeft}d left</span>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
