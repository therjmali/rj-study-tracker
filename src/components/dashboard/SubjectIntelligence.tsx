import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown, ArrowUpDown } from 'lucide-react';
import type { Subject, StudyGoals, DbStudySession, DailyLog } from '../../types';
import type { DifficultyFilter } from '../../lib/studySuggestion';
import UnifiedReadiness from './UnifiedReadiness';
import DifficultyBreakdown from './DifficultyBreakdown';

interface Props {
  subjects: Subject[];
  studyGoals: StudyGoals;
  diffFilter: DifficultyFilter;
  onDiffFilterChange: (f: DifficultyFilter) => void;
  onNavigate: (tab: string, filter?: Record<string, string>) => void;
  onToggleTopic?: (subjectId: string, unitId: string, topicId: string) => void;
  onOpenTopicDetail?: (topic: import('../../types').SubTopic, subjectId: string, unitId: string) => void;
  onMoveSubject?: (subjectId: string, direction: 'up' | 'down') => void;
  dbSessions?: DbStudySession[];
  dailyLogs?: DailyLog[];
}

export default function SubjectIntelligence({
  subjects, studyGoals, diffFilter, onDiffFilterChange, onNavigate, onToggleTopic, onOpenTopicDetail, onMoveSubject, dbSessions, dailyLogs,
}: Props) {
  const [open, setOpen] = useState(true);
  const [reorderEnabled, setReorderEnabled] = useState(false);

  const totalTopics = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
  const doneTopics = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);
  const overallPct = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0;

  return (
    <div className="relative rounded-3xl border border-border/20 bg-card/45 backdrop-blur-md shadow-lg overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-card/30 transition-colors active:scale-[0.998]"
      >
        <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
          <Brain className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-foreground leading-tight">Subject Intelligence</h2>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
            {doneTopics}/{totalTopics} topics · {overallPct}% complete · {subjects.length} subject{subjects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      {/* Reorder toggle - top right */}
      {open && onMoveSubject && subjects.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); setReorderEnabled(p => !p); }}
          className={`absolute top-3 right-12 z-10 flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold transition-all active:scale-95 ${
            reorderEnabled
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'bg-muted/20 text-muted-foreground border border-border/20 hover:bg-muted/30'
          }`}
          title={reorderEnabled ? 'Disable reordering' : 'Enable reordering'}
        >
          <ArrowUpDown className="w-3 h-3" />
          {reorderEnabled ? 'On' : 'Off'}
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Unified: Exam Readiness + Progress & Distribution */}
              <UnifiedReadiness
                subjects={subjects}
                studyGoals={studyGoals}
                difficultyFilter={diffFilter}
                onNavigate={onNavigate}
                onMoveSubject={reorderEnabled ? onMoveSubject : undefined}
                dbSessions={dbSessions}
                dailyLogs={dailyLogs}
              />

              {/* Difficulty Breakdown */}
              <div className="flex items-center gap-2 pt-1 pb-0.5">
                <span className="w-5 h-5 rounded-md bg-primary/10 border border-primary/15 flex items-center justify-center text-[9px] font-black text-primary">B</span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Difficulty Breakdown</span>
              </div>
              <DifficultyBreakdown
                subjects={subjects}
                onNavigate={onNavigate}
                onToggleTopic={onToggleTopic}
                activeDiffFilter={diffFilter}
                onDiffFilterChange={onDiffFilterChange}
                onOpenTopicDetail={onOpenTopicDetail}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
