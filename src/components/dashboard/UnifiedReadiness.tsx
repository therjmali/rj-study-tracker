import { useState, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Subject, StudyGoals, DbStudySession, DailyLog } from '../../types';
import type { DifficultyFilter } from '../../lib/studySuggestion';
import { getTier, SubjectProgressRows, FocusSuggestion, ReadinessHero, TopicDistributionBar } from '../shared/SubjectProgressRows';
import type { SubjectRowData, MiscSessionRow } from '../shared/SubjectProgressRows';
import { getMergedAllSessionMinutesBySubject, getMergedOverlappingSessionMinutesBySubject } from '../../lib/utils';

interface Props {
  subjects: Subject[];
  studyGoals: StudyGoals;
  difficultyFilter: DifficultyFilter;
  onNavigate: (tab: string, filter?: Record<string, string>) => void;
  onMoveSubject?: (subjectId: string, direction: 'up' | 'down') => void;
  dbSessions?: DbStudySession[];
  dailyLogs?: DailyLog[];
}

function UnifiedReadinessInner({ subjects, studyGoals, difficultyFilter, onNavigate, onMoveSubject, dbSessions, dailyLogs }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const overall = useMemo(() => {
    let total = 0, done = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => { total++; if (t.completed) done++; })));
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [subjects]);

  const tier = getTier(overall.pct);

  const allSessMins = useMemo(() => dbSessions ? getMergedAllSessionMinutesBySubject(dbSessions, dailyLogs) : new Map<string, number>(), [dbSessions, dailyLogs]);
  const overlapSessMins = useMemo(() => dbSessions ? getMergedOverlappingSessionMinutesBySubject(dbSessions, dailyLogs) : new Map<string, number>(), [dbSessions, dailyLogs]);

  const subjectStats: SubjectRowData[] = useMemo(() => subjects.map(s => {
    let total = 0, done = 0, imp = 0, impDone = 0;
    const unitStats: { id: string; name: string; total: number; done: number; serial: number }[] = [];
    let topicUnitMins = 0;
    s.units.forEach((u, i) => {
      let uTotal = 0, uDone = 0;
      u.subTopics.forEach(t => {
        if (difficultyFilter !== 'all' && t.difficulty !== difficultyFilter) return;
        total++; uTotal++;
        if (t.completed) { done++; uDone++; }
        if (t.important) { imp++; if (t.completed) impDone++; }
        topicUnitMins += t.timeSpent || 0;
      });
      topicUnitMins += u.timeSpent || 0;
      unitStats.push({ id: u.id, name: u.name, total: uTotal, done: uDone, serial: i + 1 });
    });
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    // Unified time: sessions + max(0, topicUnit - overlap)
    const sessAll = allSessMins.get(s.id) || 0;
    const sessOverlap = overlapSessMins.get(s.id) || 0;
    const studyTimeMins = sessAll + Math.max(0, topicUnitMins - sessOverlap);
    return { id: s.id, shortName: s.shortName, color: s.color, total, done, pct, imp, impDone, tier: getTier(pct), unitStats, studyTimeMins };
  }), [subjects, difficultyFilter, allSessMins, overlapSessMins]);

  // Miscellaneous: sessions not mapped to any known subject
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
    [...subjectStats].sort((a, b) => a.pct - b.pct).slice(0, 3).filter(s => s.pct < 80),
  [subjectStats]);

  if (subjects.length === 0) return null;

  return (
    <div className="glass-card p-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-primary/[0.04] blur-[60px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-accent/[0.04] blur-[50px] pointer-events-none" />

      <div className="relative z-10 space-y-4">
        <ReadinessHero pct={overall.pct} tier={tier} />
        <TopicDistributionBar subjects={distData} grandTotal={grandTotal} />
        <SubjectProgressRows
          subjectStats={subjectStats}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onNavigate={onNavigate}
          onMoveSubject={onMoveSubject}
          totalSubjects={subjects.length}
          miscRows={miscRows}
        />
        {weakest.length > 0 && <FocusSuggestion weakest={weakest} onNavigate={onNavigate} />}
      </div>
    </div>
  );
}

const UnifiedReadiness = memo(UnifiedReadinessInner);
export default UnifiedReadiness;
