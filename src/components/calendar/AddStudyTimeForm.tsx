import { useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Save, ChevronDown, Clock, Trash2, Edit2, Check, X, Search, BookOpen } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { toast } from 'sonner';
import type { DailyLog, Subject, StudySession, DbStudySession, SubTopic } from '../../types';
import { formatStudyTime, normalizeSubjectId } from '../../lib/utils';
import BottomSheet from '../shared/BottomSheet';
import DuplicateSessionDialog from '../shared/DuplicateSessionDialog';

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

const ACTIVITIES = ['Self-Study', 'Lecture', 'Video', 'Seminar', 'Revision', 'Practice', 'Other', 'Custom'];

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
  const [customTimeOpen, setCustomTimeOpen] = useState(false);
  const [customTimeValue, setCustomTimeValue] = useState('');

  // Topic search state
  const [topicSearchOpen, setTopicSearchOpen] = useState(false);
  const [topicSearchQuery, setTopicSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<TopicSearchResult | null>(null);

  // Duplicate detection state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateExisting, setDuplicateExisting] = useState<DbStudySession | null>(null);
  const [pendingSessionData, setPendingSessionData] = useState<any>(null);

  const existingLog = dailyLogs.find(l => l.date === date);

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

  // Topic time is tracked separately on topics — NOT shown as sessions here.
  // Sessions are ONLY created via the "Add Study Time" form below.
  const topicSessions: (StudySession & { _type: 'topic'; _color?: string })[] = [];

  const allSessions = useMemo(() => {
    const manual = manualSessions.map(s => ({ ...s, _type: 'logged' as const, _color: subjects.find(sub => sub.id === s.subjectId)?.color }));
    return [...manual, ...topicSessions];
  }, [manualSessions, topicSessions, subjects]);

  const sessions = manualSessions;
  const totalSessionMins = allSessions.reduce((a, s) => a + s.durationMinutes, 0);

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

  const handleDeleteSession = useCallback((sessionId: string) => {
    if (onDeleteSession) {
      onDeleteSession(sessionId);
      return;
    }
    if (!existingLog) return;
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const remainingSessions = sessions.filter(s => s.id !== sessionId);
    const removedH = session.durationMinutes / 60;
    const updated = dailyLogs.map(l => l.date !== date ? l : {
      ...l,
      hoursStudied: Math.max(0, Math.round((l.hoursStudied - removedH) * 100) / 100),
      sessions: remainingSessions,
    });
    onUpdateLogs(updated);
    toast.success('Session deleted');
  }, [existingLog, sessions, dailyLogs, date, onUpdateLogs, onDeleteSession]);

  const handleUpdateSession = useCallback((updatedSession: StudySession) => {
    if (onUpdateSession) {
      onUpdateSession(updatedSession.id, {
        minutes: updatedSession.durationMinutes,
        subjectId: updatedSession.subjectId,
        subjectName: updatedSession.subjectName,
        startTime: updatedSession.startTime,
        endTime: updatedSession.endTime,
        note: updatedSession.note,
      });
      setEditSheetOpen(false);
      setEditingSession(null);
      toast.success('Session updated');
      return;
    }
    if (!existingLog) return;
    const oldSession = sessions.find(s => s.id === updatedSession.id);
    if (!oldSession) return;
    const diffMins = updatedSession.durationMinutes - oldSession.durationMinutes;
    const updated = dailyLogs.map(l => l.date !== date ? l : {
      ...l,
      hoursStudied: Math.max(0, Math.round((l.hoursStudied + diffMins / 60) * 100) / 100),
      sessions: (l.sessions || []).map(s => s.id === updatedSession.id ? updatedSession : s),
    });
    onUpdateLogs(updated);
    setEditSheetOpen(false);
    setEditingSession(null);
    toast.success('Session updated');
  }, [existingLog, sessions, dailyLogs, date, onUpdateLogs, onUpdateSession]);

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
        {totalSessionMins > 0 && (
          <span className="text-[10px] font-bold font-mono text-secondary bg-secondary/10 px-2 py-0.5 rounded-full">
            {formatStudyTime(totalSessionMins)}
          </span>
        )}
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
              {/* ── Existing Sessions List ── */}
              {allSessions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    📋 All Sessions ({allSessions.length})
                  </p>
                  {allSessions.map(session => {
                    const isManual = session._type === 'logged';
                    const clr = (session as any)._color || subjects.find(s => s.id === session.subjectId)?.color;
                    return (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-card/40 border border-border/10 hover:bg-card/60 transition-colors group"
                      >
                        <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-[0_0_4px_currentColor]"
                          style={{ backgroundColor: clr || 'hsl(var(--primary))', color: clr || 'hsl(var(--primary))' }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-foreground truncate">{session.subjectName}</span>
                            {session.startTime && (
                              <span className="text-[9px] font-mono text-muted-foreground/60">
                                {session.startTime.slice(0, 5)}
                              </span>
                            )}
                          </div>
                          {session.note && (
                            <p className="text-[9px] text-muted-foreground truncate mt-0.5">{session.note}</p>
                          )}
                        </div>
                        {session._type === 'topic' && (
                          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20 shrink-0">📚 Topic</span>
                        )}
                        {session._type === 'logged' && (session.subjectId === 'general' || !subjects.find(s => s.id === session.subjectId)) && (
                          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full bg-muted/25 text-muted-foreground border border-border/20 shrink-0">Other</span>
                        )}
                        {session._type === 'logged' && session.subjectId !== 'general' && subjects.find(s => s.id === session.subjectId) && (
                          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full bg-secondary/15 text-secondary border border-secondary/20 shrink-0">📝 Logged</span>
                        )}
                        <span className="text-[11px] font-bold font-mono text-secondary shrink-0">
                          {formatStudyTime(session.durationMinutes)}
                        </span>
                        {isManual && (
                          <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingSession(session); setEditSheetOpen(true); }}
                              className="p-1 rounded-lg hover:bg-primary/10 transition-colors">
                              <Edit2 className="w-3 h-3 text-muted-foreground/50 hover:text-primary" />
                            </button>
                            <button onClick={() => handleDeleteSession(session.id)}
                              className="p-1 rounded-lg hover:bg-destructive/10 transition-colors">
                              <Trash2 className="w-3 h-3 text-muted-foreground/50 hover:text-destructive" />
                            </button>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-secondary/5 border border-secondary/10">
                    <span className="text-[10px] font-bold text-muted-foreground">Total</span>
                    <span className="text-[11px] font-black font-mono text-secondary">{formatStudyTime(totalSessionMins)}</span>
                  </div>
                </div>
              )}

              {/* ── Add New Session — Premium Duration Picker ── */}
              <div className="pt-2 border-t border-border/10">
                <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-3">Duration</p>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => {
                      const total = Math.max(0, hours * 60 + mins - 15);
                      setHours(Math.floor(total / 60));
                      setMins(total % 60);
                      setCustomTimeOpen(false);
                    }}
                    className="w-11 h-11 rounded-2xl bg-card/60 border border-border/20 flex items-center justify-center text-lg font-bold text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/25 active:scale-90 transition-all shadow-sm"
                  >
                    −
                  </button>
                  <AnimatePresence mode="wait">
                    {customTimeOpen ? (
                      <motion.div
                        key="custom-input"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="flex items-center gap-1.5 min-w-[140px] justify-center"
                      >
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={customTimeValue}
                          onChange={e => setCustomTimeValue(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="min"
                          className="h-12 w-20 text-center text-xl font-black font-mono bg-card/60 border-primary/30 rounded-xl"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const v = parseInt(customTimeValue, 10);
                              if (!isNaN(v) && v >= 1 && v <= 600) {
                                setHours(Math.floor(v / 60));
                                setMins(v % 60);
                                setCustomTimeOpen(false);
                                setCustomTimeValue('');
                              }
                            } else if (e.key === 'Escape') {
                              setCustomTimeOpen(false);
                              setCustomTimeValue('');
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            const v = parseInt(customTimeValue, 10);
                            if (!isNaN(v) && v >= 1 && v <= 600) {
                              setHours(Math.floor(v / 60));
                              setMins(v % 60);
                            }
                            setCustomTimeOpen(false);
                            setCustomTimeValue('');
                          }}
                          className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-[10px] font-bold active:scale-95 transition-all"
                        >
                          Set
                        </button>
                      </motion.div>
                    ) : (
                      <motion.button
                        key="display"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        onClick={() => { setCustomTimeOpen(true); setCustomTimeValue(String(hours * 60 + mins)); }}
                        className="relative flex items-baseline gap-0.5 select-none min-w-[120px] justify-center px-3 py-1.5 rounded-xl hover:bg-card/50 active:scale-95 transition-all cursor-pointer group"
                        title="Tap to type exact minutes"
                      >
                        <span className="font-display-digit text-4xl font-black text-foreground tracking-tight leading-none tabular-nums">{hours}</span>
                        <span className="text-sm font-bold text-muted-foreground/50 mr-1">h</span>
                        <span className="font-display-digit text-4xl font-black text-foreground tracking-tight leading-none tabular-nums">{String(mins).padStart(2, '0')}</span>
                        <span className="text-sm font-bold text-muted-foreground/50">m</span>
                        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] font-bold text-primary/0 group-hover:text-primary/60 transition-colors">tap to edit</span>
                      </motion.button>
                    )}
                  </AnimatePresence>
                  <button
                    onClick={() => {
                      const total = hours * 60 + mins + 15;
                      setHours(Math.floor(total / 60));
                      setMins(total % 60);
                      setCustomTimeOpen(false);
                    }}
                    className="w-11 h-11 rounded-2xl bg-card/60 border border-border/20 flex items-center justify-center text-lg font-bold text-muted-foreground hover:bg-secondary/10 hover:text-secondary hover:border-secondary/25 active:scale-90 transition-all shadow-sm"
                  >
                    +
                  </button>
                </div>
                <div className="flex justify-center gap-1.5 mt-3 flex-wrap">
                  {[15, 30, 45, 60, 90, 120].map(m => {
                    const isActive = hours * 60 + mins === m;
                    return (
                      <button key={m} onClick={() => { setHours(Math.floor(m / 60)); setMins(m % 60); setCustomTimeOpen(false); }}
                        className={`text-[9px] font-bold px-2.5 py-1 rounded-full border transition-all ${
                          isActive
                            ? 'bg-primary/15 border-primary/30 text-primary shadow-[0_0_8px_hsl(var(--primary)/0.2)]'
                            : 'bg-card/30 border-border/15 text-muted-foreground hover:border-primary/20 hover:text-primary/70'
                        }`}>
                        {m >= 60 ? `${m / 60}h` : `${m}m`}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => { setCustomTimeOpen(true); setCustomTimeValue(String(hours * 60 + mins)); }}
                    className={`text-[9px] font-bold px-2.5 py-1 rounded-full border transition-all ${
                      customTimeOpen
                        ? 'bg-chart-4/15 border-chart-4/30 text-chart-4 shadow-[0_0_8px_hsl(var(--chart-4)/0.2)]'
                        : 'bg-card/30 border-border/15 text-muted-foreground hover:border-chart-4/20 hover:text-chart-4/70'
                    }`}>
                    ✏️ Custom
                  </button>
                </div>
              </div>

              {/* Activity type */}
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold mb-1.5">Activity Type</p>
                <div className="flex flex-wrap gap-1">
                  {ACTIVITIES.map(a => (
                    <button key={a} onClick={() => setActivity(a)}
                      className={`text-[9px] px-2.5 py-1 rounded-full border font-bold transition-all ${
                        activity === a ? 'bg-secondary/15 border-secondary/25 text-secondary' : 'bg-card/30 border-border/15 text-muted-foreground'
                      }`}>
                      {a === 'Custom' ? '✏️ Custom' : a}
                    </button>
                  ))}
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

      {/* Edit Session Sheet */}
      {editingSession && (
        <EditSessionSheet
          key={editingSession.id}
          open={editSheetOpen}
          onClose={() => { setEditSheetOpen(false); setEditingSession(null); }}
          session={editingSession}
          subjects={subjects}
          onSave={handleUpdateSession}
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

function EditSessionSheet({ open, onClose, session, subjects, onSave }: {
  open: boolean; onClose: () => void; session: StudySession; subjects: Subject[];
  onSave: (s: StudySession) => void;
}) {
  const [subjectId, setSubjectId] = useState(session.subjectId || 'general');
  const [startTime, setStartTime] = useState(session.startTime?.slice(0, 5) || '09:00');
  const [endTime, setEndTime] = useState(session.endTime?.slice(0, 5) || '');
  const [durationMins, setDurationMins] = useState(session.durationMinutes);
  const [note, setNote] = useState(session.note || '');
  const [editCustomOpen, setEditCustomOpen] = useState(false);
  const [editCustomValue, setEditCustomValue] = useState('');

  const handleSave = () => {
    const subject = subjects.find(s => s.id === subjectId);
    onSave({
      ...session,
      subjectId,
      subjectName: subject?.shortName || session.subjectName,
      durationMinutes: durationMins,
      startTime,
      endTime: endTime || undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="✏️ Edit Study Session">
      <div className="space-y-4 pt-2">
        <div>
          <p className="text-xs text-muted-foreground mb-2">Subject</p>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Choose subject..." />
            </SelectTrigger>
            <SelectContent>
              {subjects.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.shortName} — {s.name}
                  </span>
                </SelectItem>
              ))}
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-3">Duration</p>
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => { setDurationMins(Math.max(5, durationMins - 15)); setEditCustomOpen(false); }}
              className="w-11 h-11 rounded-2xl bg-card/60 border border-border/20 flex items-center justify-center text-lg font-bold text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/25 active:scale-90 transition-all shadow-sm">−</button>
            {editCustomOpen ? (
              <div className="flex items-center gap-1.5 min-w-[140px] justify-center">
                <Input type="text" inputMode="numeric" pattern="[0-9]*" value={editCustomValue} onChange={e => setEditCustomValue(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="min" className="h-12 w-20 text-center text-xl font-black font-mono bg-card/60 border-primary/30 rounded-xl" autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') { const v = parseInt(editCustomValue, 10); if (!isNaN(v) && v >= 1 && v <= 600) { setDurationMins(v); setEditCustomOpen(false); setEditCustomValue(''); } }
                    else if (e.key === 'Escape') { setEditCustomOpen(false); setEditCustomValue(''); }
                  }} />
                <button onClick={() => { const v = parseInt(editCustomValue, 10); if (!isNaN(v) && v >= 1 && v <= 600) setDurationMins(v); setEditCustomOpen(false); setEditCustomValue(''); }}
                  className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-[10px] font-bold active:scale-95">Set</button>
              </div>
            ) : (
              <button onClick={() => { setEditCustomOpen(true); setEditCustomValue(String(durationMins)); }}
                className="flex items-baseline gap-0.5 min-w-[120px] justify-center select-none px-3 py-1.5 rounded-xl hover:bg-card/50 active:scale-95 transition-all cursor-pointer"
                title="Tap to type exact minutes">
                <span className="font-display-digit text-4xl font-black text-foreground tracking-tight leading-none tabular-nums">{Math.floor(durationMins / 60)}</span>
                <span className="text-sm font-bold text-muted-foreground/50 mr-1">h</span>
                <span className="font-display-digit text-4xl font-black text-foreground tracking-tight leading-none tabular-nums">{String(durationMins % 60).padStart(2, '0')}</span>
                <span className="text-sm font-bold text-muted-foreground/50">m</span>
              </button>
            )}
            <button onClick={() => { setDurationMins(durationMins + 15); setEditCustomOpen(false); }}
              className="w-11 h-11 rounded-2xl bg-card/60 border border-border/20 flex items-center justify-center text-lg font-bold text-muted-foreground hover:bg-secondary/10 hover:text-secondary hover:border-secondary/25 active:scale-90 transition-all shadow-sm">+</button>
          </div>
          <div className="flex justify-center gap-1.5 mt-3 flex-wrap">
            {[15, 30, 45, 60, 90, 120].map(m => (
              <button key={m} onClick={() => { setDurationMins(m); setEditCustomOpen(false); }}
                className={`text-[9px] font-bold px-2.5 py-1 rounded-full border transition-all ${durationMins === m ? 'bg-primary/15 border-primary/30 text-primary shadow-[0_0_8px_hsl(var(--primary)/0.2)]' : 'bg-card/30 border-border/15 text-muted-foreground hover:border-primary/20'}`}>
                {m >= 60 ? `${m / 60}h` : `${m}m`}
              </button>
            ))}
            <button onClick={() => { setEditCustomOpen(true); setEditCustomValue(String(durationMins)); }}
              className={`text-[9px] font-bold px-2.5 py-1 rounded-full border transition-all ${editCustomOpen ? 'bg-chart-4/15 border-chart-4/30 text-chart-4' : 'bg-card/30 border-border/15 text-muted-foreground hover:border-chart-4/20'}`}>
              ✏️ Custom
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Start Time</p>
            <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9 text-xs" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">End Time</p>
            <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-9 text-xs" />
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Notes</p>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Study notes..." className="h-9 text-xs" />
        </div>
        <Button onClick={handleSave} className="w-full h-10 text-sm font-semibold gap-2 rounded-xl">
          <Check className="w-4 h-4" /> Update Session
        </Button>
      </div>
    </BottomSheet>
  );
}
