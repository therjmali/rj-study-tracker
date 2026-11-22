import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronDown, Clock, Check, X, Search, BookOpen } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { toast } from 'sonner';
import type { DailyLog, Subject, StudySession, DbStudySession } from '../../types';
import { formatStudyTime } from '../../lib/utils';
import DuplicateSessionDialog from '../shared/DuplicateSessionDialog';
import DurationPicker from '../shared/DurationPicker';
import StudyTimerPanel from '../shared/StudyTimerPanel';
import SessionEditSheet from '../sessions/SessionEditSheet';
import type { SessionChanges } from '../sessions/SessionEditSheet';
import { ACTIVITY_CHOICES } from '../../lib/activities';

interface Props {
  date: string;
  subjects: Subject[];
  dailyLogs: DailyLog[];
  onUpdateLogs: (logs: DailyLog[]) => void;
  onCreateSession?: (session: { date: string; minutes: number; description: string; type: 'Topic' | 'Unit' | 'Other'; subjectId?: string; subjectName?: string; startTime?: string; endTime?: string; note?: string; unitId?: string; topicId?: string }) => void;
  onUpdateSession?: (sessionId: string, changes: Record<string, any>) => void;
  onDeleteSession?: (sessionId: string) => void;
  dbSessions?: DbStudySession[];
  skipCollapsedHeader?: boolean;
}

interface TopicSearchResult {
  topicId: string;
  topicName: string;
  unitId: string;
  unitName: string;
  subjectId: string;
  subjectName: string;
  subjectShortName: string;
  subjectColor: string;
  completed: boolean;
}

export default function AddStudyTimeForm({ date, subjects, dailyLogs, onUpdateLogs, onCreateSession, onUpdateSession, onDeleteSession, dbSessions, skipCollapsedHeader }: Props) {
  const [expanded, setExpanded] = useState(!!skipCollapsedHeader);
  const [hours, setHours] = useState(0);
  const [mins, setMins] = useState(30);
  const [activity, setActivity] = useState('Self-Study');
  const [subjectId, setSubjectId] = useState('');
  const [note, setNote] = useState('');
  const [customActivity, setCustomActivity] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [useCustomSubject, setUseCustomSubject] = useState(false);
  const [editingSession, setEditingSession] = useState<StudySession | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);

  // Topic search state
  const [topicSearchOpen, setTopicSearchOpen] = useState(false);
  const [topicSearchQuery, setTopicSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<TopicSearchResult | null>(null);

  // Duplicate detection state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateExisting, setDuplicateExisting] = useState<DbStudySession | null>(null);
  const [pendingSessionData, setPendingSessionData] = useState<any>(null);

  const existingLog = dailyLogs.find(l => l.date === date);

  // What the live timer would save: the activity / topic / subject picked below
  const timerActivity = activity === 'Custom' ? (customActivity.trim() || 'Custom') : activity;
  const timerSubjectId = selectedTopic?.subjectId ?? (useCustomSubject ? '' : subjectId);
  const timerTarget = useMemo(() => ({
    subjectId: timerSubjectId || '',
    unitId: selectedTopic?.unitId ?? '',
    topicId: selectedTopic?.topicId ?? '',
    topicName: selectedTopic?.topicName ?? '',
    subjectName: subjects.find(s => s.id === timerSubjectId)?.shortName || '',
    revisionKey: '' as const,
    activity: timerActivity,
  }), [timerSubjectId, selectedTopic, subjects, timerActivity]);

  // Build searchable topic index
  const allTopics = useMemo<TopicSearchResult[]>(() => {
    const results: TopicSearchResult[] = [];
    subjects.forEach(s => {
      s.units.forEach(u => {
        u.subTopics.forEach(t => {
          results.push({
            topicId: t.id,
            topicName: t.name,
            unitId: u.id,
            unitName: u.name,
            subjectId: s.id,
            subjectName: s.name,
            subjectShortName: s.shortName,
            subjectColor: s.color,
            completed: t.completed,
          });
        });
      });
    });
    return results;
  }, [subjects]);

  // Filtered topic search results
  const topicResults = useMemo(() => {
    if (!topicSearchQuery.trim()) return allTopics.slice(0, 20);
    const q = topicSearchQuery.toLowerCase();
    return allTopics.filter(t =>
      t.topicName.toLowerCase().includes(q) ||
      t.subjectShortName.toLowerCase().includes(q) ||
      t.unitName.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [allTopics, topicSearchQuery]);

  // Merge dbSessions (canonical) with legacy dailyLog sessions, deduplicating by ID
  const manualSessions = useMemo(() => {
    const dbForDay = (dbSessions || []).filter(s => s.date === date);
    const legacySessions = existingLog?.sessions || [];
    const dbIds = new Set(dbForDay.map(s => s.id));
    const merged: StudySession[] = [
      ...dbForDay.map(s => ({
        id: s.id,
        subjectId: (s as any).subjectId || 'general',
        subjectName: (s as any).subjectName || (s as any).description || 'Study',
        durationMinutes: s.minutes,
        startTime: (s as any).startTime,
        endTime: (s as any).endTime,
        note: (s as any).note || (s as any).description,
      })),
      ...legacySessions.filter(s => !dbIds.has(s.id)),
    ];
    return merged;
  }, [dbSessions, existingLog, date]);

  // Select a topic and auto-fill subject
  const handleSelectTopic = useCallback((topic: TopicSearchResult) => {
    setSelectedTopic(topic);
    setSubjectId(topic.subjectId);
    setUseCustomSubject(false);
    setTopicSearchOpen(false);
    setTopicSearchQuery('');
  }, []);

  // Clear topic selection
  const handleClearTopic = useCallback(() => {
    setSelectedTopic(null);
  }, []);

  // Check for duplicate session and handle
  const checkDuplicateAndSave = useCallback((sessionData: any) => {
    if (selectedTopic && dbSessions) {
      // Check if there's already a session for this topic on this date
      const existing = dbSessions.find(s =>
        s.date === date &&
        s.topicId === selectedTopic.topicId
      );
      if (existing) {
        setDuplicateExisting(existing);
        setPendingSessionData(sessionData);
        setDuplicateDialogOpen(true);
        return;
      }
    }
    // No duplicate — proceed
    doCreateSession(sessionData);
  }, [selectedTopic, dbSessions, date]);

  const doCreateSession = useCallback((sessionData: any) => {
    if (onCreateSession) {
      onCreateSession(sessionData);
    } else {
      // Legacy fallback
      const session: StudySession = {
        id: `sess-${Date.now()}`,
        subjectId: sessionData.subjectId || 'general',
        subjectName: sessionData.subjectName || sessionData.description,
        durationMinutes: sessionData.minutes,
        note: sessionData.description,
        startTime: sessionData.startTime || '',
      };
      const totalH = sessionData.minutes / 60;
      let updated: DailyLog[];
      if (existingLog) {
        updated = dailyLogs.map(l => l.date !== date ? l : {
          ...l,
          hoursStudied: Math.round((l.hoursStudied + totalH) * 100) / 100,
          sessions: [...(l.sessions || []), session],
          notes: sessionData.note ? (l.notes ? `${l.notes}\n${sessionData.note}` : sessionData.note) : l.notes,
        });
      } else {
        updated = [...dailyLogs, {
          date, hoursStudied: Math.round(totalH * 100) / 100, topicsCompleted: 0,
          notes: sessionData.note, subjectFocus: sessionData.subjectName || '', sessions: [session],
        }];
      }
      onUpdateLogs(updated);
    }
    resetForm();
  }, [onCreateSession, existingLog, dailyLogs, date, onUpdateLogs]);

  const resetForm = () => {
    setHours(0);
    setMins(30);
    setNote('');
    setActivity('Self-Study');
    setSubjectId('');
    setCustomActivity('');
    setCustomSubject('');
    setUseCustomSubject(false);
    setSelectedTopic(null);
  };

  const handleSave = () => {
    const totalMins = hours * 60 + mins;
    if (totalMins <= 0) { toast.error('Add some time first'); return; }

    const resolvedActivity = activity === 'Custom' ? (customActivity.trim() || 'Custom') : activity;
    const matchedSubject = subjects.find(s => s.id === subjectId);
    const subjectName = useCustomSubject ? (customSubject.trim() || 'Custom') : (matchedSubject?.shortName || 'Other');
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const description = `[${resolvedActivity}] ${note || (selectedTopic ? selectedTopic.topicName : subjectName)}`.trim();

    // Determine session type: Topic when linked to a specific topic, Other for all manual sessions
    const sessionType = selectedTopic ? 'Topic' as const : 'Other' as const;

    const sessionData = {
      date,
      minutes: totalMins,
      description,
      type: sessionType,
      subjectId: subjectId || '',
      subjectName,
      startTime: timeStr,
      note: note || undefined,
      topicId: selectedTopic?.topicId,
      unitId: selectedTopic?.unitId,
    };

    checkDuplicateAndSave(sessionData);
    toast.success(`⏱️ Added ${formatStudyTime(totalMins)} to ${date}`);
  };

  // Duplicate dialog handlers
  const handleDuplicateEdit = useCallback(() => {
    if (duplicateExisting) {
      // Open edit for the existing session
      setEditingSession({
        id: duplicateExisting.id,
        subjectId: duplicateExisting.subjectId || 'general',
        subjectName: duplicateExisting.subjectName || '',
        durationMinutes: duplicateExisting.minutes || 0,
        startTime: duplicateExisting.startTime || '',
        endTime: duplicateExisting.endTime || '',
        note: duplicateExisting.note || '',
      });
      setEditSheetOpen(true);
    }
    setDuplicateDialogOpen(false);
    setDuplicateExisting(null);
    setPendingSessionData(null);
  }, [duplicateExisting]);

  const handleDuplicateMerge = useCallback(() => {
    if (duplicateExisting && pendingSessionData && onUpdateSession) {
      const mergedMins = (duplicateExisting.minutes || 0) + pendingSessionData.minutes;
      onUpdateSession(duplicateExisting.id, { minutes: mergedMins });
      toast.success(`Merged: ${formatStudyTime(mergedMins)} total`);
      resetForm();
    }
    setDuplicateDialogOpen(false);
    setDuplicateExisting(null);
    setPendingSessionData(null);
  }, [duplicateExisting, pendingSessionData, onUpdateSession]);

  const handleDuplicateCreateSeparate = useCallback(() => {
    if (pendingSessionData) {
      doCreateSession(pendingSessionData);
      toast.success('Created separate session');
    }
    setDuplicateDialogOpen(false);
    setDuplicateExisting(null);
    setPendingSessionData(null);
  }, [pendingSessionData, doCreateSession]);

  const handleDuplicateCancel = useCallback(() => {
    setDuplicateDialogOpen(false);
    setDuplicateExisting(null);
    setPendingSessionData(null);
  }, []);

  /** Saved from the shared editor (date, subject, activity, duration, times, notes) — it already confirmed with the user. */
  const handleSessionEditSave = useCallback((changes: SessionChanges) => {
    if (editingSession && onUpdateSession) {
      onUpdateSession(editingSession.id, changes);
      toast.success('Session updated');
    }
    setEditSheetOpen(false);
    setEditingSession(null);
  }, [editingSession, onUpdateSession]);

  return (
    <div className="rounded-2xl bg-card/50 border border-border/15 overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center gap-2.5 p-3 hover:bg-card/60 transition-colors"
      >
        <Clock className="w-4 h-4 text-secondary" />
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex-1 text-left">
          Add Study Time
        </span>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground/50" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3">
              {/* ── Add New Session — Premium Duration Picker ── */}
              <div className="pt-2 border-t border-border/10">
                <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-3">Duration</p>
                <DurationPicker value={hours * 60 + mins} onChange={v => { setHours(Math.floor(v / 60)); setMins(v % 60); }} />
              </div>

              {/* ── Live: the SAME Stopwatch · Countdown timer as every topic window ── */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-px flex-1 bg-border/15" /><span className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">or study live with the timer</span><span className="h-px flex-1 bg-border/15" />
                </div>
                <StudyTimerPanel target={timerTarget}
                  hint={<>Saves as <strong className="text-foreground/70">{ACTIVITY_CHOICES.find(a => a.id === activity)?.icon} {timerActivity}</strong> · {selectedTopic ? selectedTopic.topicName : timerTarget.subjectName || 'Free study'} <span className="opacity-70">(change below)</span></>} />
              </div>

              {/* Activity type */}
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold mb-1.5">Activity Type</p>
                {/* A tidy 3-column grid: every option is visible at once — nothing scrolls sideways */}
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Activity type">
                  {ACTIVITY_CHOICES.map(a => {
                    const on = activity === a.id;
                    return (
                      <button key={a.id} role="radio" aria-checked={on} onClick={() => setActivity(a.id)}
                        className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl border px-1.5 py-2 min-h-[56px] transition-all active:scale-95 ${
                          on ? 'bg-secondary/15 border-secondary/40 text-secondary shadow-[0_0_10px_hsl(var(--secondary)/0.18)]'
                             : 'bg-card/30 border-border/15 text-muted-foreground hover:border-border/30'
                        }`}>
                        <span className="text-base leading-none">{a.icon}</span>
                        <span className="text-[10px] font-black leading-tight">{a.id}</span>
                        <span className="text-[7.5px] font-semibold opacity-60 leading-tight text-center">{a.hint}</span>
                      </button>
                    );
                  })}
                </div>
                <AnimatePresence>
                  {activity === 'Custom' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <Input
                        value={customActivity}
                        onChange={e => setCustomActivity(e.target.value)}
                        placeholder="Type your custom activity..."
                        className="h-8 text-xs mt-2 bg-card/60 border-secondary/20 rounded-xl"
                        autoFocus
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Topic Selector (auto-detects subject) ── */}
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold mb-1.5 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Topic <span className="text-[8px] text-muted-foreground/50">(auto-detects subject)</span>
                </p>
                {selectedTopic ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/20">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedTopic.subjectColor }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-foreground truncate">{selectedTopic.topicName}</p>
                      <p className="text-[9px] text-muted-foreground">{selectedTopic.subjectShortName} → {selectedTopic.unitName}</p>
                    </div>
                    <button onClick={handleClearTopic} className="p-1 rounded-lg hover:bg-destructive/10 transition-colors">
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <button
                      onClick={() => setTopicSearchOpen(p => !p)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all ${
                        topicSearchOpen ? 'bg-card/60 border-primary/25' : 'bg-card/30 border-border/15 hover:border-border/30'
                      }`}
                    >
                      <Search className="w-3 h-3 text-muted-foreground/50" />
                      <span className="text-[11px] text-muted-foreground/60 flex-1">Search topics to auto-detect subject…</span>
                    </button>
                    <AnimatePresence>
                      {topicSearchOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2 space-y-1.5">
                            <Input
                              value={topicSearchQuery}
                              onChange={e => setTopicSearchQuery(e.target.value)}
                              placeholder="Type topic name…"
                              className="h-8 text-xs bg-card/60 border-primary/20 rounded-xl"
                              autoFocus
                            />
                            <div className="max-h-40 overflow-y-auto space-y-0.5 rounded-xl border border-border/10 bg-card/30 p-1">
                              {topicResults.length === 0 && (
                                <p className="text-[10px] text-muted-foreground/50 text-center py-3">No topics found</p>
                              )}
                              {topicResults.map(t => (
                                <button
                                  key={t.topicId}
                                  onClick={() => handleSelectTopic(t)}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-card/60 transition-colors text-left"
                                >
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.subjectColor }} />
                                  <span className="text-[10px] font-semibold text-foreground truncate flex-1">{t.topicName}</span>
                                  <span className="text-[8px] text-muted-foreground/60 shrink-0">{t.subjectShortName}</span>
                                  {t.completed && <Check className="w-2.5 h-2.5 text-secondary shrink-0" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Subject selector (manual override or for non-topic sessions) */}
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold mb-1.5">Subject {selectedTopic && <span className="text-[8px] text-primary">(auto-detected ✓)</span>}</p>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => { setSubjectId(''); setUseCustomSubject(false); setSelectedTopic(null); }}
                    className={`text-[9px] px-2.5 py-1 rounded-lg border font-semibold transition-all flex items-center gap-1 ${
                      !subjectId && !useCustomSubject ? 'bg-muted/25 border-muted-foreground/25 text-foreground ring-1 ring-muted-foreground/20' : 'bg-card/30 border-border/15 text-muted-foreground'
                    }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                    Other
                  </button>
                  {subjects.map(s => (
                    <button key={s.id} onClick={() => { setSubjectId(subjectId === s.id ? '' : s.id); setUseCustomSubject(false); if (subjectId !== s.id) setSelectedTopic(null); }}
                      className={`text-[9px] px-2.5 py-1 rounded-lg border font-semibold transition-all flex items-center gap-1 ${
                        subjectId === s.id && !useCustomSubject ? 'bg-primary/15 border-primary/25 text-primary' : 'bg-card/30 border-border/15 text-muted-foreground'
                      }`}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.shortName}
                    </button>
                  ))}
                  <button onClick={() => { setUseCustomSubject(true); setSubjectId(''); setSelectedTopic(null); }}
                    className={`text-[9px] px-2.5 py-1 rounded-lg border font-semibold transition-all flex items-center gap-1 ${
                      useCustomSubject ? 'bg-accent/15 border-accent/25 text-accent-ink ring-1 ring-accent/20' : 'bg-card/30 border-border/15 text-muted-foreground'
                    }`}>
                    ✏️ Custom
                  </button>
                </div>
                <AnimatePresence>
                  {useCustomSubject && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <Input
                        value={customSubject}
                        onChange={e => setCustomSubject(e.target.value)}
                        placeholder="Type your custom subject name..."
                        className="h-8 text-xs mt-2 bg-card/60 border-accent/20 rounded-xl"
                        autoFocus
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Notes */}
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold mb-1.5">Notes</p>
                <Input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="What did you study? Lecture notes, key takeaways..."
                  className="h-9 text-xs"
                />
              </div>

              <Button onClick={handleSave} className="w-full h-10 text-xs font-bold gap-1.5 rounded-xl">
                <Plus className="w-3.5 h-3.5" /> Log {formatStudyTime(hours * 60 + mins)} Study Time
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Session Sheet (shared editor, confirms before saving) */}
      {editingSession && editSheetOpen && (
        <SessionEditSheet
          key={editingSession.id}
          session={{ ...editingSession, date: (dbSessions || []).find(x => x.id === editingSession.id)?.date || date, description: (dbSessions || []).find(x => x.id === editingSession.id)?.description }}
          subjects={subjects}
          onSave={handleSessionEditSave}
          onClose={() => { setEditSheetOpen(false); setEditingSession(null); }}
        />
      )}

      {/* Duplicate Session Dialog */}
      {duplicateExisting && (
        <DuplicateSessionDialog
          open={duplicateDialogOpen}
          existingSession={duplicateExisting}
          newMinutes={pendingSessionData?.minutes || 0}
          topicName={selectedTopic?.topicName || duplicateExisting.description || ''}
          onEdit={handleDuplicateEdit}
          onMerge={handleDuplicateMerge}
          onCreateSeparate={handleDuplicateCreateSeparate}
          onCancel={handleDuplicateCancel}
        />
      )}
    </div>
  );
}
