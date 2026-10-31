import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, ChevronDown } from 'lucide-react';
import type { Subject, DbStudySession } from '../../types';
import { getTier, SubjectProgressRows, FocusSuggestion, ReadinessHero, TopicDistributionBar } from '../shared/SubjectProgressRows';
import type { SubjectRowData, MiscSessionRow } from '../shared/SubjectProgressRows';
import { getMergedAllSessionMinutesBySubject, getMergedOverlappingSessionMinutesBySubject } from '../../lib/utils';
import type { DailyLog } from '../../types';

interface Props {
  subjects: Subject[];
  topicsData: { name: string; id: string; Done: number; Pending: number; color: string; total: number }[];
  unitsData: { name: string; Complete: number; Partial: number; 'Not Started': number; color: string }[];
  hoursData: { name: string; id: string; Hours: number; color: string }[];
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
  hasActiveFilter: boolean;
  range: { from: string; to: string } | null;
  dbSessions?: DbStudySession[];
  dailyLogs?: DailyLog[];
}

export default function SubjectReport({ subjects, onNavigate, dbSessions, dailyLogs }: Props) {
  const [open, setOpen] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const overall = useMemo(() => {
    let total = 0, done = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => { total++; if (t.completed) done++; })));
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [subjects]);

  const tier = getTier(overall.pct);

  const allSessMins = useMemo(() => dbSessions ? getMergedAllSessionMinutesBySubject(dbSessions, dailyLogs) : new Map<string, number>(), [dbSessions, dailyLogs]);
  const overlapSessMins = useMemo(() => dbSessions ? getMergedOverlappingSessionMinutesBySubject(dbSessions, dailyLogs) : new Map<string, number>(), [dbSessions, dailyLogs]);

  const subjectRows: SubjectRowData[] = useMemo(() => {
    return subjects.map(s => {
      const unitStats = s.units.map((u, i) => ({
        id: u.id, name: u.name, serial: i + 1,
        total: u.subTopics.length,
        done: u.subTopics.filter(t => t.completed).length,
      }));
      const all = s.units.flatMap(u => u.subTopics);
      const done = all.filter(t => t.completed).length;
      const pct = all.length > 0 ? Math.round((done / all.length) * 100) : 0;
      const imp = all.filter(t => t.important).length;
      const impDone = all.filter(t => t.important && t.completed).length;
      // Unified time
      let topicUnitMins = 0;
      s.units.forEach(u => { topicUnitMins += u.timeSpent || 0; u.subTopics.forEach(t => { topicUnitMins += t.timeSpent || 0; }); });
      const sessAll = allSessMins.get(s.id) || 0;
      const sessOverlap = overlapSessMins.get(s.id) || 0;
      const studyTimeMins = sessAll + Math.max(0, topicUnitMins - sessOverlap);
      return { id: s.id, shortName: s.shortName, color: s.color, total: all.length, done, pct, imp, impDone, tier: getTier(pct), unitStats, studyTimeMins };
    });
  }, [subjects, allSessMins, overlapSessMins]);

  const miscRows: MiscSessionRow[] = useMemo(() => {
    if (!dbSessions) return [];
    const subjectIds = new Set(subjects.map(s => s.id));
    const miscMins = dbSessions
      .filter(s => {
        const sid = s.subjectId?.replace(/^general$|^_general$/, '') || '';
        return !sid || !subjectIds.has(sid);
      })
      .reduce((a, s) => a + (s.minutes || 0), 0);
    if (miscMins <= 0) return [];
    return [{ label: 'Miscellaneous', mins: miscMins, color: 'hsl(var(--muted-foreground))' }];
  }, [dbSessions, subjects]);

  const distData = useMemo(() => subjects.map(s => ({
    id: s.id, shortName: s.shortName, color: s.color,
    allTopics: s.units.reduce((a, u) => a + u.subTopics.length, 0),
  })), [subjects]);
  const grandTotal = distData.reduce((a, s) => a + s.allTopics, 0);

  const weakest = useMemo(() =>
    [...subjectRows].sort((a, b) => a.pct - b.pct).slice(0, 3).filter(s => s.pct < 80),
  [subjectRows]);

  return (
    <div className="glass-card overflow-hidden">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-card/30 transition-colors active:scale-[0.998]">
        <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
          <BarChart3 className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-foreground leading-tight">Subject Analysis</h2>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
            {overall.done}/{overall.total} topics · {overall.pct}% complete · {subjects.length} subject{subjects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 350 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-4">
              <ReadinessHero pct={overall.pct} tier={tier} />
              <TopicDistributionBar subjects={distData} grandTotal={grandTotal} />
              <SubjectProgressRows
                subjectStats={subjectRows}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                onNavigate={onNavigate!}
                totalSubjects={subjects.length}
                miscRows={miscRows}
              />
              {weakest.length > 0 && <FocusSuggestion weakest={weakest} onNavigate={onNavigate!} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
