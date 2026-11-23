import FitText from '../shared/FitText';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen, ListChecks, Plus,
  Sparkles, SmilePlus, Save, StickyNote,
  CalendarDays, X, Timer, Check, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import TodoList from '../calendar/TodoList';
import AddStudyTimeForm from '../calendar/AddStudyTimeForm';
import StudyTimeSection from './StudyTimeSection';
import ErrorBoundary from '../shared/ErrorBoundary';
import type { DaySession } from './StudyTimeSection';
import SessionEditSheet from '../sessions/SessionEditSheet';
import type { SessionChanges } from '../sessions/SessionEditSheet';
import type { Subject, SubTopic, DailyLog, DbStudySession, RevisionKey } from '../../types';
import { formatStudyTime, getEffectiveDayMinutes, getLocalDateStr } from '../../lib/utils';
import type { TodoItem } from '../../hooks/useTodos';
import BottomSheet from '../shared/BottomSheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from '@project/components/ui/alert-dialog';

const MOODS = [
  { value: 'Sad', emoji: '😔', color: 'bg-blue-400/20 border-blue-400/40 text-blue-500', bg: 'from-blue-500/10 to-blue-400/5' },
  { value: 'Tired', emoji: '😴', color: 'bg-accent/20 border-accent/40 text-accent', bg: 'from-accent/10 to-accent/5' },
  { value: 'Okay', emoji: '😐', color: 'bg-diff-medium/20 border-diff-medium/40 text-diff-medium', bg: 'from-yellow-500/10 to-yellow-400/5' },
  { value: 'Happy', emoji: '😊', color: 'bg-diff-easy/20 border-diff-easy/40 text-diff-easy', bg: 'from-green-500/10 to-green-400/5' },
  { value: 'Motivated', emoji: '🔥', color: 'bg-destructive/20 border-destructive/40 text-destructive', bg: 'from-red-500/10 to-red-400/5' },
] as const;

const MOTIVATIONAL = [
  "Every expert was once a beginner 💪",
  "Small steps still move you forward 🌱",
  "Your future self will thank you 🌟",
  "Consistency beats intensity 🔥",
  "Start with just one topic today 📖",
  "You're closer than you think! 🎯",
];

export interface CalendarTopicInfo {
  subjectName: string;
  subjectColor: string;
  unitName: string;
  topicName: string;
  difficulty: string;
  time?: string;
  timeSpent: number;
  topicId: string;
  subjectId: string;
  unitId: string;
  /** The topic was completed (or this revision round was finished) on this date. */
  done?: boolean;
  /** Set for a revision-round row (R1–R4). */
  revision?: RevisionKey;
}

const NOTES_KEY = 'nursetrack-calendar-notes';
function loadNotes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); } catch { return {}; }
}
function saveNotes(notes: Record<string, string>) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

interface Props {
  selectedDate: string;
  subjects: Subject[];
  dailyLogs: DailyLog[];
  dateMap: Record<string, { done: number; subjects: Set<string>; topics: CalendarTopicInfo[] }>;
  logMap: Record<string, DailyLog>;
  onClose: () => void;
  onChangeDate?: (date: string) => void;
  onUpdateMood?: (date: string, mood: DailyLog['mood'] | undefined, notes: string) => void;
  onUpdateLogs?: (logs: DailyLog[]) => void;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string) => void;
  onNavigateToCalendar?: (date: string) => void;
  getTodosForDate: (date: string) => TodoItem[];
  addTodo?: (todo: Omit<TodoItem, 'id' | 'createdAt' | 'completed'>) => void;
  toggleTodo?: (id: string) => void;
  deleteTodo?: (id: string) => void;
  updateTodo?: (id: string, changes: Partial<TodoItem>) => void;
  onCreateSession?: (session: { date: string; minutes: number; description: string; type: 'Topic' | 'Unit' | 'Other'; subjectId?: string; subjectName?: string; startTime?: string; endTime?: string; note?: string }) => void;
  onUpdateSession?: (sessionId: string, changes: Record<string, any>) => void;
  onDeleteSession?: (sessionId: string) => void;
  onUpdateSubjects?: (subjects: Subject[]) => void;
  dbSessions?: DbStudySession[];
}

const EMPTY_TOPICS: CalendarTopicInfo[] = [];

export default function DayDetailPanel({
  selectedDate, subjects, dailyLogs, dateMap, logMap, onClose, onChangeDate,
  onUpdateMood, onUpdateLogs, onOpenTopicDetail, onNavigateToCalendar,
  getTodosForDate, addTodo, toggleTodo, deleteTodo, updateTodo,
  onCreateSession, onUpdateSession, onDeleteSession, onUpdateSubjects,
  dbSessions,
}: Props) {
  const today = getLocalDateStr();
  const dayLog = logMap[selectedDate];
  const data = dateMap[selectedDate];
  const topics = data?.topics || EMPTY_TOPICS;
  const topicCount = topics.length;
  const effMins = getEffectiveDayMinutes(subjects, dailyLogs, selectedDate, dbSessions);
  const dateTodos = getTodosForDate(selectedDate);
  const todoDone = dateTodos.filter(t => t.completed).length;
  const dayMoodVal = dayLog?.mood;
  const dayMoodObj = dayMoodVal ? MOODS.find(m => m.value === dayMoodVal) : undefined;
  const hasMood = !!dayMoodObj;

  // Merge dbSessions (primary) with legacy dayLog.sessions
  // When dbSessions exist for this day, they ARE the canonical source — skip all legacy sessions
  // to prevent phantom "Other" duplicates from backward-compat session copies.
  const manualSessions = useMemo(() => {
    const dbForDay = (dbSessions || []).filter(s => s.date === selectedDate);
    const legacySessions = (dayLog?.sessions || []) as any[];
    // dbSessions are canonical; only fall back to legacy when there are NO dbSessions at all
    const merged = [
      ...dbForDay.map(s => ({
        id: s.id,
        subjectId: s.subjectId || 'general',
        subjectName: s.subjectName || s.description || 'Study',
        durationMinutes: s.minutes || 0,
        note: s.note || s.description || '',
        startTime: s.startTime || '',
        endTime: s.endTime || '',
        type: s.type || 'Other',
        description: s.description || '',
        topicId: s.topicId || undefined,
        unitId: (s as any).unitId || undefined,
        _type: 'db' as const,
        _color: subjects.find(sub => sub.id === s.subjectId)?.color || undefined,
      })),
      // Only include legacy sessions if there are zero dbSessions for this day (pure legacy data)
      ...(dbForDay.length === 0 ? legacySessions.map(s => ({
          ...s,
          type: 'Other' as const,
          description: s.note || s.subjectName || '',
          _type: 'legacy' as const,
          _color: subjects.find(sub => sub.id === s.subjectId)?.color || undefined,
        })) : []),
    ];
    return merged;
  }, [dbSessions, dayLog, selectedDate, subjects]);

  const motivationalQuote = useMemo(() => MOTIVATIONAL[Math.floor(Math.random() * MOTIVATIONAL.length)], [selectedDate]);

  // Mood state
  const [calendarNotes, setCalendarNotes] = useState<Record<string, string>>(loadNotes);
  const [moodVal, setMoodVal] = useState<DailyLog['mood'] | undefined>(dayLog?.mood);
  const [moodNotesText, setMoodNotesText] = useState(dayLog?.notes || '');
  const [calNoteText, setCalNoteText] = useState(calendarNotes[selectedDate] || '');
  const [moodDirty, setMoodDirty] = useState(false);
  const [showAddForm, setShowAddForm] = useState(true);
  const [editingSess, setEditingSess] = useState<typeof manualSessions[0] | null>(null);
  const [deleteSessTarget, setDeleteSessTarget] = useState<typeof manualSessions[0] | null>(null);
  const [moveSess, setMoveSess] = useState<typeof manualSessions[0] | null>(null);
  const undoSessRef = useRef<{ timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => {
    setMoodVal(logMap[selectedDate]?.mood);
    setMoodNotesText(logMap[selectedDate]?.notes || '');
    setCalNoteText(calendarNotes[selectedDate] || '');
    setMoodDirty(false);
    setShowAddForm(false);
    setEditingSess(null);
  }, [selectedDate]);

  const handleMoodSelect = (m: DailyLog['mood']) => { setMoodVal(m); setMoodDirty(true); };
  const handleSaveMoodNotes = () => {
    if (onUpdateMood) onUpdateMood(selectedDate, moodVal, moodNotesText);
    const updated = { ...calendarNotes };
    if (calNoteText.trim()) updated[selectedDate] = calNoteText.trim();
    else delete updated[selectedDate];
    setCalendarNotes(updated);
    saveNotes(updated);
    setMoodDirty(false);
    toast.success('Saved');
  };

  const handleEditTopic = useCallback((t: CalendarTopicInfo) => {
    if (!onOpenTopicDetail) return;
    const s = subjects.find(x => x.id === t.subjectId);
    const u = s?.units.find(x => x.id === t.unitId);
    const topic = u?.subTopics.find(x => x.id === t.topicId);
    if (topic) onOpenTopicDetail(topic, t.subjectId, t.unitId);
  }, [subjects, onOpenTopicDetail]);

  /* ── session helpers ── */
  const handleDeleteSess = useCallback((session: typeof manualSessions[0]) => {
    if (undoSessRef.current) clearTimeout(undoSessRef.current.timer);
    const timer = setTimeout(() => { undoSessRef.current = null; }, 6000);
    undoSessRef.current = { timer };
    if (onDeleteSession) onDeleteSession(session.id);
    toast('Session deleted', {
      action: { label: 'Undo', onClick: () => {
        if (undoSessRef.current) { clearTimeout(undoSessRef.current.timer); undoSessRef.current = null; }
        if (onCreateSession) onCreateSession({ date: selectedDate, minutes: session.durationMinutes, description: session.description || session.note || session.subjectName, type: (session.type as any) || 'Other', subjectId: session.subjectId, subjectName: session.subjectName, startTime: session.startTime as string | undefined, endTime: session.endTime as string | undefined, note: session.note });
        toast.success('Session restored');
      }}, duration: 5000,
    });
    setDeleteSessTarget(null);
  }, [onDeleteSession, onCreateSession, selectedDate]);

  const handleDuplicateSess = useCallback((session: typeof manualSessions[0]) => {
    if (!onCreateSession) return;
    onCreateSession({ date: selectedDate, minutes: session.durationMinutes, description: session.description || `[Copy] ${session.subjectName}`, type: (session.type as any) || 'Other', subjectId: session.subjectId, subjectName: session.subjectName, startTime: session.startTime as string | undefined, endTime: session.endTime as string | undefined, note: session.note ? `(copy) ${session.note}` : undefined });
    toast.success('Session duplicated');
  }, [onCreateSession, selectedDate]);

  const handleMoveSess = useCallback((session: typeof manualSessions[0], newSubjectId: string) => {
    const sub = subjects.find(s => s.id === newSubjectId);
    if (!sub || !onUpdateSession) return;
    onUpdateSession(session.id, { subjectId: newSubjectId, subjectName: sub.shortName });
    setMoveSess(null);
    toast.success(`Moved to ${sub.shortName}`);
  }, [onUpdateSession, subjects]);

  /** Saved from the shared editor — it already asked the user to confirm. A changed date moves the session to that day. */
  const handleSaveSessEdit = useCallback((changes: SessionChanges) => {
    if (onUpdateSession && editingSess) {
      onUpdateSession(editingSess.id, changes);
      toast.success(changes.date !== selectedDate ? 'Session moved & updated' : 'Session updated');
    }
    setEditingSess(null);
  }, [onUpdateSession, editingSess, selectedDate]);

  const dateLabel = (() => {
    const d = new Date(selectedDate + 'T12:00:00');
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const isToday = selectedDate === today;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = selectedDate === getLocalDateStr(yesterday);
    return isToday ? 'Today' : isYesterday ? 'Yesterday' : `${dayName}, ${dateStr}`;
  })();

  const hasAnyData = topicCount > 0 || manualSessions.length > 0 || effMins > 0 || dateTodos.length > 0;
  const highPriorityPending = dateTodos.filter(t => !t.completed && t.priority === 'high').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="mt-4 space-y-3"
    >
      {/* ── DATE HEADER ── */}
      {(() => {
        const shiftDay = (n: number) => {
          const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() + n);
          onChangeDate?.(getLocalDateStr(d)); navigator.vibrate?.(6);
        };
        const d = new Date(selectedDate + 'T12:00:00');
        const isToday = selectedDate === today;
        const isFuture = selectedDate > today;
        return (
          <div className="flex items-center gap-1.5 rounded-2xl border border-border/15 bg-gradient-to-r from-primary/8 via-card/40 to-card/20 p-2">
            {onChangeDate && (
              <button onClick={() => shiftDay(-1)} aria-label="Previous day"
                className="w-10 h-10 shrink-0 rounded-xl bg-muted/25 flex items-center justify-center active:scale-90 transition-transform">
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <div className="shrink-0 w-11 rounded-xl overflow-hidden border border-border/15 bg-card text-center">
              <p className={`text-[8px] font-black uppercase tracking-wider py-0.5 ${isToday ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground'}`}>
                {d.toLocaleDateString('en-US', { month: 'short' })}
              </p>
              <p className="text-[17px] font-black font-mono leading-tight py-0.5 text-foreground">{d.getDate()}</p>
            </div>
            <div className="flex-1 min-w-0">
              {/* Shrinks to fit instead of "Thursday, Nove…" — the full date is always readable */}
              <FitText as="h3" max={15} min={11} className="font-bold text-foreground tracking-tight leading-tight" title={dateLabel}>{dateLabel}</FitText>
              <FitText max={10} min={8} className="text-muted-foreground/70 font-semibold">
                {d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{isFuture ? ' · upcoming' : ''}
              </FitText>
            </div>
            {onChangeDate && (
              <button onClick={() => shiftDay(1)} aria-label="Next day"
                className="w-10 h-10 shrink-0 rounded-xl bg-muted/25 flex items-center justify-center active:scale-90 transition-transform">
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            {onNavigateToCalendar && (
              <button onClick={() => onNavigateToCalendar(selectedDate)} aria-label="Open daily log"
                className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center text-primary active:scale-90 transition-transform">
                <CalendarDays className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} aria-label="Close day" className="w-9 h-9 shrink-0 rounded-xl hover:bg-muted/25 flex items-center justify-center active:scale-90 transition-transform">
              <X className="w-4 h-4 text-muted-foreground/60" />
            </button>
          </div>
        );
      })()}

      {/* ════════════════════════════════════════════════════
          1) DAILY OVERVIEW SUMMARY CARDS
         ════════════════════════════════════════════════════ */}
      <div className={`grid gap-2 ${hasMood ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {(() => {
          // "Topics" = topics DONE that day (a finished revision round counts too) — the same number the Trend chart,
          // goals and Hub use. Topics merely studied (time logged, completed another day) are shown beneath it.
          const realRows = topics.filter(t => !String(t.topicId).startsWith('unit-'));
          const doneN = data?.done ?? 0;
          const revDone = topics.filter(t => t.revision && t.done).length;
          const studiedN = new Set(realRows.map(t => `${t.topicId}|${t.revision || ''}`)).size;
          const subParts: string[] = [];
          if (revDone > 0) subParts.push(`🔁 ${revDone} revision`);
          if (studiedN > doneN) subParts.push(`${studiedN} studied`);
          return <SummaryCard icon={<BookOpen className="w-4 h-4" />} iconColor="text-primary" bgColor="bg-primary/8 border-primary/15"
            value={String(doneN)} label="Topics" sub={subParts.join(' · ') || undefined} />;
        })()}
        <SummaryCard icon={<Timer className="w-4 h-4" />} iconColor="text-secondary" bgColor="bg-secondary/8 border-secondary/15"
          value={formatStudyTime(effMins)} label="Study Time" />
        {hasMood && (
          <motion.div whileTap={{ scale: 0.95 }}
            className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border ${dayMoodObj!.color} backdrop-blur-sm`}>
            <span className="text-2xl leading-none">{dayMoodObj!.emoji}</span>
            <span className="text-[9px] font-bold mt-1.5 opacity-80">{dayMoodVal}</span>
          </motion.div>
        )}
        <SummaryCard
          icon={<ListChecks className="w-4 h-4" />}
          iconColor={dateTodos.length > todoDone ? 'text-destructive' : 'text-chart-5'}
          bgColor={dateTodos.length > todoDone ? 'bg-destructive/8 border-destructive/15' : 'bg-chart-5/8 border-chart-5/15'}
          value={String(dateTodos.length - todoDone)}
          label="To-Do"
          sub={dateTodos.length > 0 ? `${todoDone}/${dateTodos.length}` : undefined}
        />
      </div>

      {/* ════════════════════════════════════════════════════
          2) TO-DO LIST
         ════════════════════════════════════════════════════ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <TodoList
          date={selectedDate}
          todos={dateTodos}
          onAdd={addTodo!}
          onToggle={toggleTodo!}
          onDelete={deleteTodo!}
          onUpdate={updateTodo}
          notificationCount={highPriorityPending}
        />
      </motion.div>

      {/* ════════════════════════════════════════════════════
          3) STUDY TIME — Topic Time vs Session Time
         ════════════════════════════════════════════════════ */}
      {/* Study Time: topics, revisions and sessions — one engine, tap a session to edit / duplicate / delete */}
      <ErrorBoundary compact fallbackTitle="Study Time could not load" key={selectedDate}>
      <StudyTimeSection
        selectedDate={selectedDate}
        subjects={subjects}
        dailyLogs={dailyLogs}
        dbSessions={dbSessions}
        topics={topics}
        manualSessions={manualSessions as DaySession[]}
        onOpenTopic={handleEditTopic}
        onEditSession={setEditingSess as any}
        onDuplicateSession={handleDuplicateSess as any}
        onDeleteSession={setDeleteSessTarget as any}
      />
      </ErrorBoundary>

      {/* ════════════════════════════════════════════════════
          5) ADD TIME — opens form directly, no intermediate state
         ════════════════════════════════════════════════════ */}
      {onUpdateLogs && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          {!showAddForm ? (
            <button onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/8 to-secondary/8 border-2 border-dashed border-primary/20 text-sm font-bold text-primary hover:border-primary/30 hover:from-primary/15 hover:to-secondary/12 transition-all active:scale-[0.98]">
              <Plus className="w-4.5 h-4.5" /> Add Study Time
            </button>
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
              <ErrorBoundary compact fallbackTitle="Add Study Time could not load">
                <AddStudyTimeForm date={selectedDate} subjects={subjects} dailyLogs={dailyLogs}
                  onUpdateLogs={onUpdateLogs} onCreateSession={onCreateSession}
                  onUpdateSession={onUpdateSession} onDeleteSession={onDeleteSession}
                  dbSessions={dbSessions} skipCollapsedHeader />
              </ErrorBoundary>
              <button onClick={() => setShowAddForm(false)}
                className="w-full py-2 mt-1 text-[10px] font-bold text-muted-foreground/40 hover:text-muted-foreground transition-colors text-center">
                ▲ Collapse
              </button>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* ════════════════════════════════════════════════════
          MOOD & REFLECTIONS
         ════════════════════════════════════════════════════ */}
      {onUpdateMood && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="rounded-2xl overflow-hidden border border-border/20 shadow-lg">
          <div className="relative px-3.5 py-2.5 bg-gradient-to-r from-accent/12 via-primary/6 to-secondary/4 border-b border-border/10">
            <div className="relative flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center">
                <SmilePlus className="w-3.5 h-3.5 text-accent" />
              </div>
              <span className="text-[11px] font-bold text-foreground uppercase tracking-wide flex-1">Mood & Notes</span>
              {moodVal && <span className="text-lg">{MOODS.find(m => m.value === moodVal)?.emoji}</span>}
            </div>
          </div>
          <div className="bg-card/20 backdrop-blur-sm p-3 space-y-3">
            <div className="flex gap-2 justify-center">
              {MOODS.map(m => (
                <button key={m.value} onClick={() => handleMoodSelect(m.value)}
                  className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center border-2 transition-all ${
                    moodVal === m.value ? `${m.color} scale-110 ring-2 ring-offset-1 ring-offset-background shadow-lg` : 'bg-card/30 border-border/10 hover:scale-105'
                  }`}>{m.emoji}</button>
              ))}
            </div>
            {moodVal && (
              <div className="flex items-center justify-center gap-3">
                <p className="text-[10px] font-bold text-foreground/70">Feeling: {moodVal}</p>
                <button onClick={() => { setMoodVal(undefined); setMoodDirty(true); }}
                  className="text-[9px] text-destructive/60 font-bold hover:text-destructive">✕ Clear</button>
              </div>
            )}
            <textarea value={moodNotesText} onChange={e => { setMoodNotesText(e.target.value); setMoodDirty(true); }}
              placeholder="How did your study session go?"
              className="w-full text-xs bg-card/30 text-foreground placeholder:text-muted-foreground/30 resize-none focus:outline-none min-h-[48px] border border-border/10 rounded-xl p-2.5 focus:border-accent/30 transition-all" />
            <div>
              <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest mb-1 flex items-center gap-1">
                <StickyNote className="w-3 h-3" /> Quick Note
              </p>
              <textarea value={calNoteText} onChange={e => { setCalNoteText(e.target.value); setMoodDirty(true); }}
                placeholder="Personal note..."
                className="w-full text-xs bg-card/30 text-foreground placeholder:text-muted-foreground/30 resize-none focus:outline-none min-h-[36px] border border-border/10 rounded-xl p-2.5 focus:border-accent/30 transition-all" />
            </div>
            {moodDirty && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                <Button size="sm" onClick={handleSaveMoodNotes} className="w-full h-8 text-[10px] font-bold gap-1.5 rounded-xl">
                  <Save className="w-3 h-3" /> Save
                </Button>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Session Delete Confirm ── */}
      <AlertDialog open={!!deleteSessTarget} onOpenChange={open => { if (!open) setDeleteSessTarget(null); }}>
        <AlertDialogContent className="max-w-xs rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete session?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Remove <strong>{deleteSessTarget?.subjectName}</strong> ({formatStudyTime(deleteSessTarget?.durationMinutes || 0)}) from your log. You can undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8 rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="text-xs h-8 rounded-xl bg-destructive text-destructive-foreground"
              onClick={() => deleteSessTarget && handleDeleteSess(deleteSessTarget)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Session Edit Sheet ── */}
      {editingSess && (
        <SessionEditSheet
          key={editingSess.id}
          session={{ ...editingSess, date: selectedDate }}
          subjects={subjects}
          onSave={handleSaveSessEdit}
          onClose={() => setEditingSess(null)}
        />
      )}

      {/* ── Session Move Sheet ── */}
      {moveSess && (
        <BottomSheet open onClose={() => setMoveSess(null)} title="Move to Subject">
          <div className="space-y-2 pt-2">
            <p className="text-[10px] text-muted-foreground mb-3">
              Move <strong>{moveSess.subjectName}</strong> ({formatStudyTime(moveSess.durationMinutes)}) to:
            </p>
            {subjects.map(s => (
              <button key={s.id} onClick={() => handleMoveSess(moveSess, s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all active:scale-[0.98] ${
                  s.id === moveSess.subjectId ? 'bg-primary/10 border-primary/25 ring-1 ring-primary/20' : 'bg-card/40 border-border/10 hover:bg-card/60'
                }`}>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-xs font-semibold text-foreground flex-1 text-left">{s.shortName}</span>
                {s.id === moveSess.subjectId && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {/* Empty state */}
      {!hasAnyData && !hasMood && (
        <div className="rounded-2xl border border-border/15 bg-card/20 p-8 text-center">
          <Sparkles className="w-8 h-8 text-muted-foreground/15 mx-auto mb-3" />
          <p className="text-sm font-semibold text-muted-foreground/40">No activity yet</p>
          <p className="text-[11px] text-primary/50 font-medium mt-1">{motivationalQuote}</p>
        </div>
      )}
    </motion.div>
  );
}

function SummaryCard({ icon, iconColor, bgColor, value, label, sub }: {
  icon: React.ReactNode; iconColor: string; bgColor: string; value: string; label: string; sub?: string;
}) {
  return (
    <motion.div whileTap={{ scale: 0.95 }}
      className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border backdrop-blur-sm ${bgColor}`}>
      <div className={`${iconColor} mb-1`}>{icon}</div>
      <span className="font-display-digit text-xl font-black text-foreground leading-none">{value}</span>
      <span className="text-[9px] text-muted-foreground font-semibold mt-1">{label}</span>
      {sub && <span className="text-[8px] text-muted-foreground/60 font-mono">{sub}</span>}
    </motion.div>
  );
}


