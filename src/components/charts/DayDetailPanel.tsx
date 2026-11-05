import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Clock, ListChecks, Plus, Pencil,
  Sparkles, SmilePlus, Save, StickyNote,
  CalendarDays, X, Timer, Check, Edit2, Trash2,
  Copy, ArrowRightLeft, ChevronDown, ChevronUp,
  Layers, AlertCircle, Star, Filter, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import TodoList from '../calendar/TodoList';
import AddStudyTimeForm from '../calendar/AddStudyTimeForm';
import type { Subject, SubTopic, DailyLog, DbStudySession } from '../../types';
import { formatDate, formatStudyTime, getEffectiveDayMinutes, getLocalDateStr, readableInk } from '../../lib/utils';
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
}

interface DateDetail {
  dateStr: string;
  topics: CalendarTopicInfo[];
}

function formatTime12h(t: string | undefined): string {
  if (!t) return '';
  const normalized = t.replace(/\./g, ':');
  const [hRaw, mRaw] = normalized.split(':').map(Number);
  const h = isNaN(hRaw) ? 0 : hRaw;
  const m = isNaN(mRaw) ? 0 : mRaw;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
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
  const topics = data?.topics || [];
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

  const groupedTopics = useMemo(() => {
    const map: Record<string, { subjectName: string; subjectColor: string; subjectId: string; units: Record<string, { unitName: string; unitId: string; topics: CalendarTopicInfo[] }> }> = {};
    topics.forEach(t => {
      if (!map[t.subjectName]) map[t.subjectName] = { subjectName: t.subjectName, subjectColor: t.subjectColor, subjectId: t.subjectId, units: {} };
      if (!map[t.subjectName].units[t.unitName]) map[t.subjectName].units[t.unitName] = { unitName: t.unitName, unitId: t.unitId, topics: [] };
      map[t.subjectName].units[t.unitName].topics.push(t);
    });
    return Object.values(map);
  }, [topics]);

  const motivationalQuote = useMemo(() => MOTIVATIONAL[Math.floor(Math.random() * MOTIVATIONAL.length)], [selectedDate]);

  // Mood state
  const [calendarNotes, setCalendarNotes] = useState<Record<string, string>>(loadNotes);
  const [moodVal, setMoodVal] = useState<DailyLog['mood'] | undefined>(dayLog?.mood);
  const [moodNotesText, setMoodNotesText] = useState(dayLog?.notes || '');
  const [calNoteText, setCalNoteText] = useState(calendarNotes[selectedDate] || '');
  const [moodDirty, setMoodDirty] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedSessId, setExpandedSessId] = useState<string | null>(null);
  const [editingSess, setEditingSess] = useState<typeof manualSessions[0] | null>(null);
  const [deleteSessTarget, setDeleteSessTarget] = useState<typeof manualSessions[0] | null>(null);
  const [moveSess, setMoveSess] = useState<typeof manualSessions[0] | null>(null);
  const [sessFilter, setSessFilter] = useState<'all' | 'topics' | 'sessions' | 'subject'>('all');
  const [sessFilterVal, setSessFilterVal] = useState('');
  const undoSessRef = useRef<{ timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => {
    setMoodVal(logMap[selectedDate]?.mood);
    setMoodNotesText(logMap[selectedDate]?.notes || '');
    setCalNoteText(calendarNotes[selectedDate] || '');
    setMoodDirty(false);
    setShowAddForm(false);
    setExpandedSessId(null);
    setEditingSess(null);
    setSessFilter('all');
    setSessFilterVal('');
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

  const handleEditTopic = (t: CalendarTopicInfo) => {
    if (!onOpenTopicDetail) return;
    const s = subjects.find(x => x.id === t.subjectId);
    const u = s?.units.find(x => x.id === t.unitId);
    const topic = u?.subTopics.find(x => x.id === t.topicId);
    if (topic) onOpenTopicDetail(topic, t.subjectId, t.unitId);
  };

  /* ── session helpers ── */
  function extractAct(desc?: string): string | null {
    if (!desc) return null;
    const m = desc.match(/^\[([^\]]+)\]/);
    return m ? m[1] : null;
  }

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

  const handleSaveSessEdit = useCallback((updated: { subjectId: string; subjectName: string; durationMinutes: number; description: string; startTime: string; endTime?: string; note?: string; _activity: string }) => {
    if (onUpdateSession && editingSess) {
      onUpdateSession(editingSess.id, { minutes: updated.durationMinutes, subjectId: updated.subjectId, subjectName: updated.subjectName, description: updated.description, startTime: updated.startTime, endTime: updated.endTime, note: updated.note });
    }
    setEditingSess(null);
    toast.success('Session updated');
  }, [onUpdateSession, editingSess]);

  const dateLabel = (() => {
    const d = new Date(selectedDate + 'T12:00:00');
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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
          <div className="flex items-center gap-2 rounded-2xl border border-border/15 bg-gradient-to-r from-primary/8 via-card/40 to-card/20 p-2.5">
            {onChangeDate && (
              <button onClick={() => shiftDay(-1)} aria-label="Previous day"
                className="w-9 h-9 shrink-0 rounded-xl bg-muted/25 flex items-center justify-center active:scale-90 transition-transform">
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
              <h3 className="text-[15px] font-bold text-foreground tracking-tight leading-tight truncate">{dateLabel}</h3>
              <p className="text-[10px] text-muted-foreground/70 font-semibold truncate">
                {d.toLocaleDateString('en-US', { weekday: 'long' })}{isFuture ? ' · upcoming' : ''}
              </p>
            </div>
            {onChangeDate && (
              <button onClick={() => shiftDay(1)} aria-label="Next day"
                className="w-9 h-9 shrink-0 rounded-xl bg-muted/25 flex items-center justify-center active:scale-90 transition-transform">
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
        <SummaryCard icon={<BookOpen className="w-4 h-4" />} iconColor="text-primary" bgColor="bg-primary/8 border-primary/15"
          value={String(topicCount)} label="Topics" />
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
      {(() => {
        // Topic time = time from syllabus topics (CalendarTopicInfo)
        const topicIds = new Set(topics.map(t => t.topicId));
        const topicMins = topics.reduce((a, t) => a + (t.timeSpent || 0), 0);
        // Session-only = sessions whose topicId is NOT already counted in Topic Time
        const sessionOnly = manualSessions.filter(s =>
          !s.topicId || !topicIds.has(s.topicId)
        );
        const sessionMinsVal = sessionOnly.reduce((a, s) => a + s.durationMinutes, 0);
        // Use effMins (from getEffectiveDayMinutes) as the single source of truth
        // so the total here ALWAYS matches the Today summary card above
        const allMins = effMins;

        // Subject grouping — combine both topic records and session records
        const subjectMap: Record<string, { name: string; color: string; topicMins: number; sessionMins: number; topics: CalendarTopicInfo[]; sessions: typeof sessionOnly }> = {};
        topics.forEach(t => {
          const key = t.subjectId || 'general';
          if (!subjectMap[key]) subjectMap[key] = { name: t.subjectName, color: t.subjectColor, topicMins: 0, sessionMins: 0, topics: [], sessions: [] };
          subjectMap[key].topicMins += t.timeSpent || 0;
          subjectMap[key].topics.push(t);
        });
        sessionOnly.forEach(s => {
          const key = s.subjectId || 'general';
          const sub = subjects.find(x => x.id === key);
          if (!subjectMap[key]) subjectMap[key] = { name: sub?.shortName || s.subjectName || 'Other', color: sub?.color || 'hsl(var(--foreground))', topicMins: 0, sessionMins: 0, topics: [], sessions: [] };
          subjectMap[key].sessionMins += s.durationMinutes;
          subjectMap[key].sessions.push(s);
        });
        const subjectGroups = Object.entries(subjectMap).sort((a, b) => (b[1].topicMins + b[1].sessionMins) - (a[1].topicMins + a[1].sessionMins));

        // Active filter total — use unified formula to avoid double-counting
        const activeTotal = sessFilter === 'topics' ? topicMins : sessFilter === 'sessions' ? sessionMinsVal : sessFilter === 'subject' && sessFilterVal
          ? (subjectMap[sessFilterVal]?.topicMins || 0) + (subjectMap[sessFilterVal]?.sessionMins || 0)
          : allMins;
        const sessionMinsValDisplay = sessionMinsVal; // for display in session-only filter

        const hasRecords = topics.length > 0 || sessionOnly.length > 0;

        return (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-2xl overflow-hidden border border-border/20 shadow-lg">
            <div className="relative px-3.5 py-2.5 bg-gradient-to-r from-primary/12 via-secondary/8 to-accent/6 border-b border-border/10">
              <div className="relative flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
                  <BookOpen className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-[11px] font-bold text-foreground uppercase tracking-wide flex-1">Study Time</span>
                <span className="text-[10px] font-mono font-bold text-secondary bg-secondary/10 px-2 py-0.5 rounded-lg">
                  {formatStudyTime(activeTotal)}
                </span>
              </div>
            </div>

            {/* ── Filter tabs ── */}
            <div className="px-3 pt-2 pb-1.5 flex gap-1 flex-wrap border-b border-border/5">
              <SessFilterPill active={sessFilter === 'all'} onClick={() => { setSessFilter('all'); setSessFilterVal(''); }} label="All" count={topics.length + sessionOnly.length} />
              <SessFilterPill active={sessFilter === 'topics'} onClick={() => { setSessFilter('topics'); setSessFilterVal(''); }} label="📖 Topic" count={topics.length} />
              <SessFilterPill active={sessFilter === 'sessions'} onClick={() => { setSessFilter('sessions'); setSessFilterVal(''); }} label="⏱ Session" count={sessionOnly.length} />
              {subjectGroups.length > 1 && subjectGroups.map(([id, g]) => (
                <SessFilterPill key={id} active={sessFilter === 'subject' && sessFilterVal === id}
                  onClick={() => { setSessFilter('subject'); setSessFilterVal(id); }} label={g.name} color={g.color} count={g.topics.length + g.sessions.length} />
              ))}
            </div>

            <div className="bg-card/20 backdrop-blur-sm">
              {hasRecords ? (
                <div className="p-2.5 space-y-1.5 max-h-[420px] overflow-y-auto">
                  {/* ── Topic records ── */}
                  {(sessFilter === 'all' || sessFilter === 'topics') && (() => {
                    return topics.length > 0 ? (
                      <div>
                        {sessFilter === 'all' && <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-1 px-1 flex items-center gap-1"><BookOpen className="w-3 h-3" /> Topic Time</p>}
                        {groupedTopics.map((subj: any) => (
                          <div key={subj.subjectName}>
                            <div className="flex items-center gap-2 mb-1 px-1">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: subj.subjectColor }} />
                              <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: subj.subjectColor }}>{subj.subjectName}</span>
                            </div>
                            {Object.values(subj.units).map((unit: any) => (
                              <div key={unit.unitName} className="ml-3 mb-1.5">
                                <p className="text-[8px] text-muted-foreground/50 font-bold mb-0.5 uppercase tracking-wider">{unit.unitName}</p>
                                {unit.topics.map((t: CalendarTopicInfo, idx: number) => (
                                  <motion.button key={idx} onClick={() => handleEditTopic(t)}
                                    initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.02 }}
                                    className="flex items-center gap-2 w-full text-left py-1.5 px-2.5 rounded-xl hover:bg-primary/5 transition-all group active:scale-[0.99]"
                                    style={{ borderLeftWidth: 3, borderLeftColor: subj.subjectColor }}>
                                    <span className="text-[10px] flex-1 truncate font-medium text-foreground group-hover:text-primary transition-colors">{t.topicName}</span>
                                    <span className="text-[7px] px-1 py-0.5 rounded bg-primary/8 text-primary font-bold shrink-0">Topic</span>
                                    {t.timeSpent > 0 && <span className="text-[9px] font-mono font-bold text-secondary shrink-0">{formatStudyTime(t.timeSpent)}</span>}
                                    {t.time && <span className="text-[8px] font-mono text-muted-foreground/50 shrink-0">{formatTime12h(t.time)}</span>}
                                  </motion.button>
                                ))}
                              </div>
                            ))}
                          </div>
                        ))}
                        {sessFilter === 'topics' && (
                          <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-primary/5 border border-primary/10 mt-1">
                            <span className="text-[10px] font-bold text-muted-foreground">Topic Total</span>
                            <span className="text-[10px] font-black font-mono text-primary">{formatStudyTime(topicMins)}</span>
                          </div>
                        )}
                      </div>
                    ) : null;
                  })()}

                  {/* Divider between types in All view */}
                  {sessFilter === 'all' && topics.length > 0 && sessionOnly.length > 0 && (
                    <div className="h-px bg-border/15 my-1" />
                  )}

                  {/* ── Manual session records ── */}
                  {(sessFilter === 'all' || sessFilter === 'sessions') && (() => {
                    return sessionOnly.length > 0 ? (
                      <div>
                        {sessFilter === 'all' && <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-1 px-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Session Time</p>}
                        {sessionOnly.map((s, idx) => {
                          const act = extractAct(s.description) || s.type || 'Other';
                          return (
                            <div key={s.id || idx} className="flex items-center gap-2 py-1.5 px-2.5 rounded-xl hover:bg-card/40 transition-colors"
                              style={{ borderLeftWidth: 3, borderLeftColor: s._color || 'hsl(var(--foreground))' }}>
                              <span className="text-[10px] font-medium text-foreground flex-1 truncate">{s.subjectName || 'Study'}</span>
                              <span className="text-[7px] px-1 py-0.5 rounded bg-accent/10 text-accent font-bold shrink-0">{act}</span>
                              <span className="text-[9px] font-mono font-bold text-secondary shrink-0">{formatStudyTime(s.durationMinutes)}</span>
                              {s.startTime && <span className="text-[8px] font-mono text-muted-foreground/50 shrink-0">{formatTime12h(s.startTime)}</span>}
                            </div>
                          );
                        })}
                        {sessFilter === 'sessions' && (
                          <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-accent/5 border border-accent/10 mt-1">
                            <span className="text-[10px] font-bold text-muted-foreground">Session Total</span>
                            <span className="text-[10px] font-black font-mono text-accent">{formatStudyTime(sessionMinsVal)}</span>
                          </div>
                        )}
                      </div>
                    ) : null;
                  })()}

                  {/* ── Subject view ── */}
                  {sessFilter === 'subject' && sessFilterVal && (() => {
                    const g = subjectMap[sessFilterVal];
                    if (!g) return null;
                    return (
                      <div>
                        <div className="flex items-center gap-2 mb-1.5 px-1">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: readableInk(g.color) }}>{g.name}</span>
                        </div>
                        {g.topics.map((t, idx) => (
                          <motion.button key={idx} onClick={() => handleEditTopic(t)}
                            className="flex items-center gap-2 w-full text-left py-1.5 px-2.5 rounded-xl hover:bg-primary/5 transition-all group"
                            style={{ borderLeftWidth: 3, borderLeftColor: g.color }}>
                            <span className="text-[10px] flex-1 truncate font-medium text-foreground">{t.topicName}</span>
                            <span className="text-[7px] px-1 py-0.5 rounded bg-primary/8 text-primary font-bold shrink-0">Topic</span>
                            {t.timeSpent > 0 && <span className="text-[9px] font-mono font-bold text-secondary shrink-0">{formatStudyTime(t.timeSpent)}</span>}
                          </motion.button>
                        ))}
                        {g.sessions.map((s, idx) => {
                          const act = extractAct(s.description) || s.type || 'Other';
                          return (
                            <div key={s.id || idx} className="flex items-center gap-2 py-1.5 px-2.5 rounded-xl hover:bg-card/40 transition-colors"
                              style={{ borderLeftWidth: 3, borderLeftColor: g.color }}>
                              <span className="text-[10px] font-medium text-foreground flex-1 truncate">{s.subjectName}</span>
                              <span className="text-[7px] px-1 py-0.5 rounded bg-accent/10 text-accent font-bold shrink-0">{act}</span>
                              <span className="text-[9px] font-mono font-bold text-secondary shrink-0">{formatStudyTime(s.durationMinutes)}</span>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-secondary/5 border border-secondary/10 mt-1">
                          <span className="text-[10px] font-bold text-muted-foreground">{g.name} Total</span>
                          <span className="text-[10px] font-black font-mono text-secondary">{formatStudyTime(g.topicMins + g.sessionMins)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Footer total for All view */}
                  {sessFilter === 'all' && (
                    <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-secondary/5 border border-secondary/10 mt-1">
                      <span className="text-[10px] font-bold text-muted-foreground">Total</span>
                      <span className="text-[10px] font-black font-mono text-secondary">{formatStudyTime(allMins)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <BookOpen className="w-6 h-6 text-muted-foreground/15 mx-auto mb-2" />
                  <p className="text-[11px] text-muted-foreground/50">No study time recorded</p>
                </div>
              )}
            </div>
          </motion.div>
        );
      })()}

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
              <AddStudyTimeForm date={selectedDate} subjects={subjects} dailyLogs={dailyLogs}
                onUpdateLogs={onUpdateLogs} onCreateSession={onCreateSession}
                onUpdateSession={onUpdateSession} onDeleteSession={onDeleteSession}
                dbSessions={dbSessions} skipCollapsedHeader />
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
        <SessEditSheet
          session={editingSess}
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

function SessFilterPill({ active, onClick, label, count, color }: {
  active: boolean; onClick: () => void; label: string; count?: number; color?: string;
}) {
  return (
    <button onClick={onClick}
      className={`text-[8px] font-bold px-2 py-1 rounded-full border transition-all flex items-center gap-1 active:scale-95 ${
        active ? 'bg-primary/15 border-primary/25 text-primary shadow-[0_0_6px_hsl(var(--primary)/0.15)]'
               : 'bg-card/30 border-border/15 text-muted-foreground/60 hover:border-border/30'
      }`}>
      {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      <span className="truncate max-w-[60px]">{label}</span>
      {count !== undefined && <span className="opacity-60">{count}</span>}
    </button>
  );
}

const SESS_ACTIVITIES = ['Self-Study', 'Seminar', 'Revision', 'Lecture', 'Practice', 'Video', 'Other'];

function SessEditSheet({ session, subjects, onSave, onClose }: {
  session: any; subjects: Subject[];
  onSave: (u: any) => void; onClose: () => void;
}) {
  const [subId, setSubId] = useState(session.subjectId || '');
  const extractAct = (desc?: string): string => { if (!desc) return 'Self-Study'; const m = desc.match(/^\[([^\]]+)\]/); return m ? m[1] : 'Self-Study'; };
  const [activity, setActivity] = useState(extractAct(session.description));
  const [startTime, setStartTime] = useState((session.startTime || '09:00').toString().slice(0, 5));
  const [endTime, setEndTime] = useState((session.endTime || '').toString().slice(0, 5));
  const [durMins, setDurMins] = useState(session.durationMinutes || 30);
  const [note, setNote] = useState(session.note || '');

  const save = () => {
    const sub = subjects.find(s => s.id === subId);
    onSave({ subjectId: subId, subjectName: sub?.shortName || session.subjectName || 'Study', durationMinutes: durMins, description: `[${activity}] ${sub?.shortName || session.subjectName || 'Study'}`, startTime, endTime: endTime || undefined, note: note.trim() || undefined, _activity: activity });
  };

  return (
    <BottomSheet open onClose={onClose} title="✏️ Edit Session">
      <div className="space-y-4 pt-2">
        <div>
          <p className="text-xs text-muted-foreground mb-2">Subject</p>
          <select value={subId} onChange={e => setSubId(e.target.value)} className="w-full h-9 text-xs rounded-xl border border-border bg-card px-3">
            <option value="">General</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.shortName} — {s.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Activity</p>
          <div className="flex gap-1.5 flex-wrap">
            {SESS_ACTIVITIES.map(a => (
              <button key={a} onClick={() => setActivity(a)}
                className={`text-[10px] font-bold px-2.5 py-1.5 rounded-xl border transition-all ${
                  activity === a ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-card/30 border-border/15 text-muted-foreground'
                }`}>{a}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-2">Duration</p>
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => setDurMins(Math.max(5, durMins - 15))} className="w-10 h-10 rounded-xl bg-card/60 border border-border/20 flex items-center justify-center text-lg font-bold text-muted-foreground hover:bg-destructive/10 active:scale-90 transition-all">−</button>
            <span className="font-display-digit text-3xl font-black text-foreground min-w-[80px] text-center">{Math.floor(durMins / 60)}h {String(durMins % 60).padStart(2, '0')}m</span>
            <button onClick={() => setDurMins(durMins + 15)} className="w-10 h-10 rounded-xl bg-card/60 border border-border/20 flex items-center justify-center text-lg font-bold text-muted-foreground hover:bg-secondary/10 active:scale-90 transition-all">+</button>
          </div>
          <div className="flex justify-center gap-1.5 mt-2 flex-wrap">
            {[15, 30, 45, 60, 90, 120].map(m => (
              <button key={m} onClick={() => setDurMins(m)} className={`text-[9px] font-bold px-2.5 py-1 rounded-full border transition-all ${durMins === m ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-card/30 border-border/15 text-muted-foreground'}`}>{m >= 60 ? `${m / 60}h` : `${m}m`}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><p className="text-xs text-muted-foreground mb-1">Start</p><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full h-9 text-xs rounded-xl border border-border bg-card px-3" /></div>
          <div><p className="text-xs text-muted-foreground mb-1">End</p><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full h-9 text-xs rounded-xl border border-border bg-card px-3" /></div>
        </div>
        <div><p className="text-xs text-muted-foreground mb-1">Notes</p><input value={note} onChange={e => setNote(e.target.value)} placeholder="Study notes…" className="w-full h-9 text-xs rounded-xl border border-border bg-card px-3" /></div>
        <Button onClick={save} className="w-full h-10 text-sm font-semibold gap-2 rounded-xl"><Check className="w-4 h-4" /> Update Session</Button>
      </div>
    </BottomSheet>
  );
}

function DiffBadge({ diff }: { diff: string }) {
  const styles: Record<string, string> = {
    Easy: 'bg-diff-easy/15 text-diff-easy',
    Medium: 'bg-diff-medium/15 text-diff-medium',
    Hard: 'bg-diff-hard/15 text-diff-hard',
  };
  return <span className={`text-[7px] px-1.5 py-0.5 rounded-lg font-bold shrink-0 ${styles[diff] || ''}`}>{diff[0]}</span>;
}


