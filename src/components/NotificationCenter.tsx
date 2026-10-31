import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Bell, Plus, Trash2, Clock, ListChecks, CheckCircle2,
  Flame, Pin, AlarmClockOff, Search, Edit3, Power, BellOff,
  Check, RotateCcw, Layers, ChevronDown, ChevronRight,
  Sparkles, AlertTriangle, CalendarDays, Star, PartyPopper,
  TrendingUp, Target
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { TodoItem } from '../hooks/useTodos';
import type { Reminder, Subject } from '../types';
import { getScheduleSummary } from '../lib/reminderUtils';
import { generateSmartAlerts, type SmartAlert } from '../lib/smartAlerts';
import AnimatedStreakNumber from './shared/AnimatedStreakNumber';
import { getStreakMilestone } from '../hooks/useStreak';
import BottomSheet from './shared/BottomSheet';
import ReminderForm from './reminders/ReminderForm';

/* ═══════════════════════════════════════════════════════════════
   TYPES & PROPS
   ═══════════════════════════════════════════════════════════════ */
interface Props {
  open: boolean;
  onClose: () => void;
  todos: TodoItem[];
  onAddTodo: (todo: Omit<TodoItem, 'id' | 'createdAt' | 'completed'>) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onUpdateTodo: (id: string, changes: Partial<TodoItem>) => void;
  reminders: Reminder[];
  dueReminders: Reminder[];
  onUpdateReminders: (reminders: Reminder[]) => void;
  onNavigateToDate?: (date: string) => void;
  subjects?: Subject[];
  streakDays?: number;
  todayTopicsDone?: number;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
}

type MainTab = 'all' | 'todos' | 'alerts';
type ReminderViewTab = 'active' | 'snoozed' | 'completed';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';
type UnifiedItem =
  | { kind: 'todo'; data: TodoItem; sortKey: string }
  | { kind: 'reminder'; data: Reminder; sortKey: string };

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const PRIORITIES = [
  { value: 'high' as const, label: 'High', emoji: '🔴', color: 'destructive' },
  { value: 'medium' as const, label: 'Medium', emoji: '🟡', color: 'chart-4' },
  { value: 'low' as const, label: 'Low', emoji: '🟢', color: 'secondary' },
];
const CATEGORIES = ['Study', 'Practice', 'Review', 'Assignment', 'Personal'];

const PRIORITY_STYLES: Record<string, { bg: string; border: string; dot: string }> = {
  high: { bg: 'bg-destructive/6', border: 'border-l-destructive', dot: 'bg-destructive' },
  medium: { bg: 'bg-chart-4/6', border: 'border-l-chart-4', dot: 'bg-chart-4' },
  low: { bg: 'bg-secondary/6', border: 'border-l-secondary', dot: 'bg-secondary' },
};

const COLOR_MAP: Record<string, string> = {
  primary: 'bg-primary/6 border-primary/12', secondary: 'bg-secondary/6 border-secondary/12',
  accent: 'bg-accent/6 border-accent/12', destructive: 'bg-destructive/6 border-destructive/12',
  'chart-4': 'bg-chart-4/6 border-chart-4/12', 'chart-5': 'bg-chart-5/6 border-chart-5/12',
};
const BORDER_L: Record<string, string> = {
  primary: 'border-l-primary', secondary: 'border-l-secondary', accent: 'border-l-accent',
  destructive: 'border-l-destructive', 'chart-4': 'border-l-chart-4', 'chart-5': 'border-l-chart-5',
};

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
function getLocalDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return getLocalDateStr(d);
}

function relativeTime(dateStr: string, timeStr?: string): string {
  const now = new Date();
  const target = timeStr ? new Date(`${dateStr}T${timeStr}`) : new Date(`${dateStr}T23:59:59`);
  const diffMs = target.getTime() - now.getTime();
  const absMins = Math.abs(Math.round(diffMs / 60000));
  if (absMins < 1) return 'now';
  const h = Math.floor(absMins / 60);
  const m = absMins % 60;
  const label = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  return diffMs < 0 ? `${label} overdue` : `in ${label}`;
}

function formatDateLabel(dateStr: string): string {
  const today = getLocalDateStr();
  const tomorrow = getTomorrow();
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  const d = new Date(dateStr + 'T00:00:00');
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === getLocalDateStr(yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function getMotivation(pct: number): string {
  if (pct === 0) return "Let's crush it today! 💪";
  if (pct < 25) return 'Great start! Keep it up 🚀';
  if (pct < 50) return "You're building momentum 🔥";
  if (pct < 75) return 'Over halfway! Keep pushing ⚡';
  if (pct < 100) return 'Almost there! Final sprint 🏆';
  return 'All done! You crushed it! 🎉';
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function NotificationCenter({
  open, onClose, todos, onAddTodo, onToggleTodo, onDeleteTodo, onUpdateTodo,
  reminders, dueReminders, onUpdateReminders, onNavigateToDate,
  subjects = [], streakDays = 0, todayTopicsDone = 0, onNavigate,
}: Props) {
  const [mainTab, setMainTab] = useState<MainTab>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['completed']));

  // Dialogs
  const [deleteTarget, setDeleteTarget] = useState<TodoItem | null>(null);
  const [deleteReminderId, setDeleteReminderId] = useState<string | null>(null);
  const [confirmComplete, setConfirmComplete] = useState<{ type: 'todo' | 'reminder'; id: string; title: string } | null>(null);
  const [showCompleteAnim, setShowCompleteAnim] = useState(false);

  // Sheets
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [reminderFormOpen, setReminderFormOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  // Reminder view
  const [reminderViewTab, setReminderViewTab] = useState<ReminderViewTab>('active');

  // Batch
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());

  const today = getLocalDateStr();
  const tomorrow = getTomorrow();
  const streakMilestone = useMemo(() => getStreakMilestone(streakDays), [streakDays]);

  // Smart alerts
  const [dismissedSmartAlerts, setDismissedSmartAlerts] = useState<Set<string>>(() => new Set());
  const smartAlerts = useMemo(() => {
    const all = generateSmartAlerts({ subjects, todos, streakDays, todayTopicsDone });
    return all.filter(a => !dismissedSmartAlerts.has(a.dismissKey));
  }, [subjects, todos, streakDays, todayTopicsDone, dismissedSmartAlerts]);
  const dismissSmartAlert = useCallback((key: string) => {
    setDismissedSmartAlerts(prev => new Set(prev).add(key));
  }, []);

  const subjectNames = useMemo(() => subjects.map(s => ({ id: s.id, name: s.shortName || s.name, color: s.color })), [subjects]);

  /* ── Filters ── */
  const matchesSubject = useCallback((item: TodoItem | Reminder, kind: 'todo' | 'reminder') => {
    if (subjectFilter === 'all') return true;
    const subj = subjects.find(s => s.id === subjectFilter);
    if (!subj) return true;
    const kw = [subj.name.toLowerCase(), subj.shortName.toLowerCase()];
    if (kind === 'todo') { const t = item as TodoItem; return kw.some(k => t.text.toLowerCase().includes(k) || (t.category || '').toLowerCase().includes(k)); }
    const r = item as Reminder; return kw.some(k => r.title.toLowerCase().includes(k) || r.content.toLowerCase().includes(k));
  }, [subjectFilter, subjects]);

  const matchesSearch = useCallback((item: TodoItem | Reminder, kind: 'todo' | 'reminder') => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (kind === 'todo') return (item as TodoItem).text.toLowerCase().includes(q);
    const r = item as Reminder; return r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q);
  }, [searchQuery]);

  /* ── Filtered & grouped todos ── */
  const filteredTodos = useMemo(() => {
    let f = [...todos];
    if (priorityFilter !== 'all') f = f.filter(t => t.priority === priorityFilter);
    f = f.filter(t => matchesSubject(t, 'todo') && matchesSearch(t, 'todo'));
    return f.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      const po = { high: 0, medium: 1, low: 2 };
      return po[a.priority] - po[b.priority];
    });
  }, [todos, priorityFilter, matchesSubject, matchesSearch]);

  const grouped = useMemo(() => {
    const g = { overdue: [] as TodoItem[], today: [] as TodoItem[], tomorrow: [] as TodoItem[], upcoming: [] as TodoItem[], completed: [] as TodoItem[] };
    filteredTodos.forEach(t => {
      if (t.completed) { g.completed.push(t); return; }
      if (t.dueDate < today) g.overdue.push(t);
      else if (t.dueDate === today) g.today.push(t);
      else if (t.dueDate === tomorrow) g.tomorrow.push(t);
      else g.upcoming.push(t);
    });
    return g;
  }, [filteredTodos, today, tomorrow]);

  /* ── Reminder groups ── */
  const reminderGroups = useMemo(() => {
    const now = new Date();
    const active: Reminder[] = [], snoozed: Reminder[] = [], completed: Reminder[] = [];
    reminders.forEach(r => {
      if (!matchesSubject(r, 'reminder') || !matchesSearch(r, 'reminder')) return;
      if (r.completedAt) { completed.push(r); return; }
      if (r.snoozedUntil && new Date(r.snoozedUntil) > now) { snoozed.push(r); return; }
      active.push(r);
    });
    const sortFn = (a: Reminder, b: Reminder) => { if (a.pinned !== b.pinned) return a.pinned ? -1 : 1; return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); };
    return { active: active.sort(sortFn), snoozed: snoozed.sort((a, b) => new Date(a.snoozedUntil!).getTime() - new Date(b.snoozedUntil!).getTime()), completed: completed.sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()) };
  }, [reminders, matchesSubject, matchesSearch]);

  /* ── Unified feed ── */
  const unifiedFeed = useMemo((): UnifiedItem[] => {
    const items: UnifiedItem[] = [];
    filteredTodos.forEach(t => items.push({ kind: 'todo', data: t, sortKey: t.dueDate }));
    reminderGroups.active.forEach(r => items.push({ kind: 'reminder', data: r, sortKey: r.createdAt.slice(0, 10) }));
    return items.sort((a, b) => {
      const ac = a.kind === 'todo' ? (a.data as TodoItem).completed : false;
      const bc = b.kind === 'todo' ? (b.data as TodoItem).completed : false;
      if (ac !== bc) return ac ? 1 : -1;
      return a.sortKey.localeCompare(b.sortKey);
    });
  }, [filteredTodos, reminderGroups.active]);

  /* ── Stats ── */
  const todoStats = useMemo(() => {
    const all = todos.length;
    const done = todos.filter(t => t.completed).length;
    const overdue = todos.filter(t => !t.completed && t.dueDate < today).length;
    const todayTotal = todos.filter(t => t.dueDate === today).length;
    const todayDone = todos.filter(t => t.dueDate === today && t.completed).length;
    return { all, done, pending: all - done, overdue, pct: all > 0 ? Math.round((done / all) * 100) : 0, todayTotal, todayDone, todayPct: todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 100 };
  }, [todos, today]);

  const alertStats = useMemo(() => ({ active: reminderGroups.active.length, snoozed: reminderGroups.snoozed.length, completed: reminderGroups.completed.length, due: dueReminders.length }), [reminderGroups, dueReminders]);
  const totalPending = todoStats.pending + alertStats.active;

  /* ── Toggle section collapse ── */
  const toggleSection = useCallback((id: string) => {
    setCollapsed(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  /* ── Handlers ── */
  const handleAddTodo = useCallback((todo: Omit<TodoItem, 'id' | 'createdAt' | 'completed'>) => {
    onAddTodo(todo);
    setAddSheetOpen(false);
    toast.success('✅ Task added!');
  }, [onAddTodo]);

  const handleEditSave = useCallback((id: string, changes: Partial<TodoItem>) => {
    onUpdateTodo(id, changes);
    setEditingTodo(null);
    toast.success('✏️ Task updated!');
  }, [onUpdateTodo]);

  const confirmDeleteTodo = useCallback(() => {
    if (!deleteTarget) return;
    onDeleteTodo(deleteTarget.id);
    setDeleteTarget(null);
    toast.success('🗑️ Task deleted');
  }, [deleteTarget, onDeleteTodo]);

  const requestComplete = useCallback((type: 'todo' | 'reminder', id: string, title: string) => {
    setConfirmComplete({ type, id, title });
  }, []);

  const executeComplete = useCallback(() => {
    if (!confirmComplete) return;
    setShowCompleteAnim(true);
    setTimeout(() => {
      if (confirmComplete.type === 'todo') onToggleTodo(confirmComplete.id);
      else onUpdateReminders(reminders.map(r => r.id === confirmComplete.id ? { ...r, completedAt: new Date().toISOString(), enabled: false } : r));
      toast.success('✅ Marked complete!');
      setConfirmComplete(null);
      setTimeout(() => setShowCompleteAnim(false), 600);
    }, 400);
  }, [confirmComplete, onToggleTodo, onUpdateReminders, reminders]);

  const executeBatchComplete = useCallback(() => {
    if (batchSelected.size === 0) return;
    setShowCompleteAnim(true);
    setTimeout(() => {
      batchSelected.forEach(id => { if (todos.some(t => t.id === id)) onToggleTodo(id); });
      const rIds = [...batchSelected].filter(id => !todos.some(t => t.id === id));
      if (rIds.length > 0) onUpdateReminders(reminders.map(r => rIds.includes(r.id) ? { ...r, completedAt: new Date().toISOString(), enabled: false } : r));
      toast.success(`✅ ${batchSelected.size} items completed!`);
      setBatchSelected(new Set()); setBatchMode(false);
      setTimeout(() => setShowCompleteAnim(false), 600);
    }, 400);
  }, [batchSelected, todos, reminders, onToggleTodo, onUpdateReminders]);

  // Reminder handlers
  const handleToggleReminder = useCallback((id: string) => onUpdateReminders(reminders.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)), [reminders, onUpdateReminders]);
  const handleTogglePin = useCallback((id: string) => onUpdateReminders(reminders.map(r => r.id === id ? { ...r, pinned: !r.pinned } : r)), [reminders, onUpdateReminders]);
  const handleSaveReminder = useCallback((r: Reminder) => {
    if (editingReminder) { onUpdateReminders(reminders.map(x => x.id === r.id ? r : x)); toast.success('Reminder updated'); }
    else { onUpdateReminders([r, ...reminders]); toast.success('Reminder created'); }
    setReminderFormOpen(false); setEditingReminder(null);
  }, [editingReminder, reminders, onUpdateReminders]);
  const handleDeleteReminder = useCallback(() => { if (!deleteReminderId) return; onUpdateReminders(reminders.filter(r => r.id !== deleteReminderId)); setDeleteReminderId(null); toast.success('Reminder deleted'); }, [deleteReminderId, reminders, onUpdateReminders]);
  const handleRestoreReminder = useCallback((id: string) => { onUpdateReminders(reminders.map(r => r.id === id ? { ...r, completedAt: undefined, enabled: true, snoozedUntil: undefined } : r)); toast.success('Reminder restored'); }, [reminders, onUpdateReminders]);
  const handleCancelSnooze = useCallback((id: string) => { onUpdateReminders(reminders.map(r => r.id === id ? { ...r, snoozedUntil: undefined } : r)); toast.success('Snooze cancelled'); }, [reminders, onUpdateReminders]);
  const toggleBatchItem = useCallback((id: string) => { setBatchSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }, []);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ═══ BACKDROP ═══ */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-[80] bg-background/60 backdrop-blur-md" />

          {/* ═══ COMPLETION OVERLAY ═══ */}
          <AnimatePresence>{showCompleteAnim && <CompletionOverlay />}</AnimatePresence>

          {/* ═══ PANEL ═══ */}
          <motion.div
            initial={{ opacity: 0, x: 320 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 320 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-[81] w-full max-w-[420px] flex flex-col overflow-hidden border-l border-border/10"
            style={{ background: 'hsl(var(--card) / 0.94)', }}
          >
            {/* ═══ HEADER ═══ */}
            <div className="shrink-0 px-5 pt-5 pb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <motion.div whileHover={{ rotate: [0, -10, 10, 0] }} transition={{ duration: 0.4 }}
                    className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 flex items-center justify-center">
                    <Bell className="w-4.5 h-4.5 text-primary" />
                  </motion.div>
                  <div>
                    <h2 className="text-sm font-extrabold text-foreground leading-tight tracking-tight">Command Center</h2>
                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                      {totalPending > 0 ? `${totalPending} pending` : '✨ All clear'} {alertStats.due > 0 && `· ${alertStats.due} due`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {streakDays > 0 && (
                    <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-chart-4/8 border border-chart-4/12">
                      <Flame className="w-3.5 h-3.5 text-chart-4" />
                      <AnimatedStreakNumber value={streakDays} size="sm" showFire={false} milestone={streakMilestone} />
                      <span className="text-[8px] font-black text-chart-4 uppercase">day</span>
                      {streakMilestone && <span className="text-[8px] ml-0.5">{streakMilestone.emoji}</span>}
                    </motion.div>
                  )}
                  <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted/10 border border-border/10 flex items-center justify-center hover:bg-muted/25 transition-all active:scale-90">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* ═══ TABS ═══ */}
              <div className="flex gap-1 p-1 rounded-2xl bg-muted/8 border border-border/8">
                {([
                  { id: 'all' as MainTab, label: 'All', icon: Layers, count: todoStats.pending + alertStats.active },
                  { id: 'todos' as MainTab, label: 'To-Do', icon: ListChecks, count: todoStats.pending },
                  { id: 'alerts' as MainTab, label: 'Pop Alerts', icon: Bell, count: alertStats.active },
                ]).map(tab => (
                  <button key={tab.id}
                    onClick={() => { setMainTab(tab.id); setBatchMode(false); setBatchSelected(new Set()); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold transition-all relative ${
                      mainTab === tab.id
                        ? 'bg-card shadow-sm text-foreground border border-border/12'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {tab.count > 0 && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                        className={`min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black flex items-center justify-center ${
                          mainTab === tab.id ? 'bg-primary/12 text-primary' : 'bg-muted/15 text-muted-foreground'
                        }`}>
                        {tab.count}
                      </motion.span>
                    )}
                  </button>
                ))}
              </div>

              {/* ═══ SUBJECT CHIPS ═══ */}
              {subjectNames.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mt-2.5 pb-0.5">
                  <button onClick={() => setSubjectFilter('all')}
                    className={`text-[9px] px-2.5 py-1 rounded-full border font-bold whitespace-nowrap shrink-0 transition-all ${
                      subjectFilter === 'all' ? 'bg-primary/10 border-primary/15 text-primary' : 'bg-card/30 border-border/10 text-muted-foreground hover:bg-muted/10'
                    }`}>📚 All</button>
                  {subjectNames.map(s => (
                    <button key={s.id} onClick={() => setSubjectFilter(p => p === s.id ? 'all' : s.id)}
                      className={`text-[9px] px-2.5 py-1 rounded-full border font-bold whitespace-nowrap shrink-0 flex items-center gap-1 transition-all ${
                        subjectFilter === s.id ? 'bg-primary/10 border-primary/15 text-primary' : 'bg-card/30 border-border/10 text-muted-foreground hover:bg-muted/10'
                      }`}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />{s.name}
                    </button>
                  ))}
                </div>
              )}

              {/* ═══ SEARCH ═══ */}
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/30" />
                <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search tasks & reminders..." className="h-8 text-[11px] pl-7 bg-muted/5 border-border/8 rounded-xl" />
              </div>

              {/* ═══ BATCH BAR ═══ */}
              {batchMode && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-primary">{batchSelected.size} selected</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => { setBatchMode(false); setBatchSelected(new Set()); }} className="text-[10px] px-2.5 py-1 rounded-lg bg-muted/12 text-muted-foreground font-bold">Cancel</button>
                    <button onClick={executeBatchComplete} disabled={batchSelected.size === 0} className="text-[10px] px-2.5 py-1 rounded-lg bg-secondary/12 text-secondary font-bold disabled:opacity-30">✅ Complete All</button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* ═══ CONTENT ═══ */}
            <div className="flex-1 overflow-y-auto px-5 py-2 space-y-2 scrollbar-hide">
              <AnimatePresence mode="wait">
                {mainTab === 'all' && (
                  <motion.div key="all" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                    {/* ═══ SMART ALERTS ═══ */}
                    {smartAlerts.length > 0 && (
                      <SmartAlertsSection alerts={smartAlerts} onDismiss={dismissSmartAlert} onAction={(tab) => {
                        if (tab === 'todos') { setMainTab('todos'); return; }
                        onClose();
                        onNavigate?.(tab);
                      }} />
                    )}
                    <AllTabContent items={unifiedFeed} today={today} batchMode={batchMode} batchSelected={batchSelected}
                      onToggleBatch={toggleBatchItem} onRequestComplete={requestComplete}
                      onDeleteTodo={setDeleteTarget} onEditTodo={setEditingTodo}
                      onEditReminder={r => { setEditingReminder(r); setReminderFormOpen(true); }}
                      onDeleteReminder={setDeleteReminderId} onTogglePin={handleTogglePin}
                      onToggleTodo={onToggleTodo} />
                  </motion.div>
                )}
                {mainTab === 'todos' && (
                  <motion.div key="todos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                    <TodosTabContent grouped={grouped} today={today} stats={todoStats}
                      priorityFilter={priorityFilter} onPriorityFilter={setPriorityFilter}
                      collapsed={collapsed} onToggleSection={toggleSection}
                      batchMode={batchMode} batchSelected={batchSelected} onToggleBatch={toggleBatchItem}
                      onRequestComplete={requestComplete} onDeleteTodo={setDeleteTarget}
                      onEditTodo={setEditingTodo} onToggleTodo={onToggleTodo} />
                  </motion.div>
                )}
                {mainTab === 'alerts' && (
                  <motion.div key="alerts" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                    <AlertsTabContent displayed={reminderGroups[reminderViewTab]} viewTab={reminderViewTab}
                      onViewTabChange={setReminderViewTab} groups={reminderGroups}
                      batchMode={batchMode} batchSelected={batchSelected} onToggleBatch={toggleBatchItem}
                      onRequestComplete={requestComplete}
                      onEdit={r => { setEditingReminder(r); setReminderFormOpen(true); }}
                      onDelete={setDeleteReminderId} onToggle={handleToggleReminder}
                      onTogglePin={handleTogglePin} onRestore={handleRestoreReminder} onCancelSnooze={handleCancelSnooze} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ═══ BOTTOM BAR ═══ */}
            <div className="shrink-0 px-5 py-3.5 border-t border-border/8"
              style={{ background: 'hsl(var(--card) / 0.92)', }}>
              <div className="flex gap-2.5">
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setBatchMode(p => !p); setBatchSelected(new Set()); }}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all shrink-0 ${
                    batchMode ? 'bg-primary/12 border-primary/20 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.15)]' : 'bg-muted/8 border-border/10 text-muted-foreground'
                  }`}>
                  <CheckCircle2 className="w-4.5 h-4.5" />
                </motion.button>
                {(mainTab === 'all' || mainTab === 'todos') ? (
                  <motion.div whileTap={{ scale: 0.97 }} className="flex-1">
                    <Button onClick={() => setAddSheetOpen(true)}
                      className="w-full h-11 text-xs font-black gap-2 rounded-xl shadow-md hover:shadow-lg transition-all">
                      <Plus className="w-4 h-4" /> Add Task
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div whileTap={{ scale: 0.97 }} className="flex-1">
                    <Button onClick={() => { setEditingReminder(null); setReminderFormOpen(true); }}
                      className="w-full h-11 text-xs font-black gap-2 rounded-xl bg-chart-4/12 text-chart-4 border border-chart-4/18 hover:bg-chart-4/20 shadow-md" variant="ghost">
                      <Plus className="w-4 h-4" /> New Reminder
                    </Button>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>

          {/* ═══ CONFIRM COMPLETE ═══ */}
          <AlertDialog open={!!confirmComplete} onOpenChange={o => { if (!o) setConfirmComplete(null); }}>
            <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-secondary/15 z-[90] max-w-[340px] rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-secondary text-base"><CheckCircle2 className="w-5 h-5" /> Mark Complete?</AlertDialogTitle>
                <AlertDialogDescription className="text-xs">Complete <strong className="text-foreground">"{confirmComplete?.title}"</strong>?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="h-9 text-xs rounded-xl">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={executeComplete} className="h-9 text-xs rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-1">
                  <Check className="w-3.5 h-3.5" /> Complete ✅
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ═══ DELETE TASK ═══ */}
          <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
            <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-destructive/15 z-[90] max-w-[340px] rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive text-sm"><Trash2 className="w-4 h-4" /> Delete Task?</AlertDialogTitle>
                <AlertDialogDescription className="text-xs">Delete <strong className="text-foreground">"{deleteTarget?.text}"</strong>?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="h-9 text-xs rounded-xl">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteTodo} className="h-9 text-xs rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ═══ DELETE REMINDER ═══ */}
          <AlertDialog open={!!deleteReminderId} onOpenChange={() => setDeleteReminderId(null)}>
            <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-destructive/15 z-[90] max-w-[340px] rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive text-sm"><Trash2 className="w-4 h-4" /> Delete Reminder?</AlertDialogTitle>
                <AlertDialogDescription className="text-xs">This reminder will be permanently removed.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="h-9 text-xs rounded-xl">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteReminder} className="h-9 text-xs rounded-xl bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ═══ ADD TASK SHEET ═══ */}
          <BottomSheet open={addSheetOpen} onClose={() => setAddSheetOpen(false)} title="✨ New Task" zIndex={90}>
            <TodoForm onSave={handleAddTodo} onCancel={() => setAddSheetOpen(false)} />
          </BottomSheet>

          {/* ═══ EDIT TASK SHEET ═══ */}
          <BottomSheet open={!!editingTodo} onClose={() => setEditingTodo(null)} title="✏️ Edit Task" zIndex={90}>
            {editingTodo && (
              <TodoForm initial={editingTodo} onSave={(data) => handleEditSave(editingTodo.id, data)}
                onCancel={() => setEditingTodo(null)} />
            )}
          </BottomSheet>

          {/* ═══ REMINDER FORM SHEET ═══ */}
          <BottomSheet open={reminderFormOpen} onClose={() => { setReminderFormOpen(false); setEditingReminder(null); }}
            title={editingReminder ? '✏️ Edit Reminder' : '✨ New Reminder'} zIndex={90}>
            <ReminderForm initial={editingReminder} onSave={handleSaveReminder} onCancel={() => { setReminderFormOpen(false); setEditingReminder(null); }} />
          </BottomSheet>
        </>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROGRESS RING (SVG)
   ═══════════════════════════════════════════════════════════════ */
function ProgressRing({ pct, size = 52, strokeWidth = 4 }: { pct: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const isDone = pct >= 100;
  const color = isDone ? 'stroke-secondary' : pct >= 50 ? 'stroke-primary' : 'stroke-chart-4';
  const emoji = isDone ? '🏆' : pct >= 75 ? '🔥' : '';
  return (
    <motion.div className="relative shrink-0" style={{ width: size, height: size }}
      animate={isDone ? { rotate: [0, 5, -5, 0] } : {}} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}>
      {isDone && <motion.div animate={{ scale: [1, 1.3, 1], opacity: [0.15, 0.3, 0.15] }}
        transition={{ duration: 2, repeat: Infinity }} className="absolute inset-[-4px] rounded-full bg-secondary/20 blur-md" />}
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth} className="stroke-muted/12" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth + 1}
          strokeLinecap="round" className={color}
          initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }} strokeDasharray={circ} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-black text-foreground leading-none">{pct}%</span>
        {emoji && <span className="text-[8px] leading-none mt-0.5">{emoji}</span>}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STATS BAR
   ═══════════════════════════════════════════════════════════════ */
function StatsBar({ stats }: { stats: { all: number; done: number; pending: number; overdue: number; pct: number; todayPct: number } }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      className="p-4 rounded-2xl border border-border/10 mb-3 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, hsl(var(--primary)/0.06) 0%, hsl(var(--card)) 50%, hsl(var(--secondary)/0.06) 100%)' }}>
      {/* Decorative glow */}
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full bg-secondary/5 blur-3xl pointer-events-none" />

      <div className="relative flex items-center gap-4">
        <ProgressRing pct={stats.todayPct} size={64} strokeWidth={5} />
        <div className="flex-1 min-w-0">
          <motion.p initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="text-[11px] font-bold text-primary mb-2">{getMotivation(stats.todayPct)}</motion.p>
          <div className="flex gap-4">
            <StatPill icon={<Target className="w-3 h-3" />} label="Pending" value={stats.pending} color="text-foreground" delay={0.1} />
            {stats.overdue > 0 && <StatPill icon={<AlertTriangle className="w-3 h-3" />} label="Overdue" value={stats.overdue} color="text-destructive" delay={0.2} />}
            <StatPill icon={<CheckCircle2 className="w-3 h-3" />} label="Done" value={stats.done} color="text-secondary" delay={0.3} />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1 rounded-full bg-muted/15 overflow-hidden">
        <motion.div className="h-full rounded-full" initial={{ width: '0%' }} animate={{ width: `${stats.todayPct}%` }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.4 }}
          style={{ background: stats.todayPct >= 100 ? 'hsl(var(--secondary))' : 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--secondary)))' }} />
      </div>
    </motion.div>
  );
}

function StatPill({ icon, label, value, color, delay = 0 }: { icon: React.ReactNode; label: string; value: number; color: string; delay?: number }) {
  const [displayVal, setDisplayVal] = useState(0);
  useEffect(() => {
    const dur = 800;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      setDisplayVal(Math.round(p * value));
      if (p < 1) requestAnimationFrame(tick);
    };
    const t = setTimeout(() => requestAnimationFrame(tick), delay * 1000);
    return () => clearTimeout(t);
  }, [value, delay]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + delay }}
      className="flex items-center gap-1.5">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color === 'text-destructive' ? 'bg-destructive/10' : color === 'text-secondary' ? 'bg-secondary/10' : 'bg-primary/8'}`}>
        <span className={`${color} opacity-70`}>{icon}</span>
      </div>
      <div>
        <span className={`text-sm font-black ${color} leading-none block tabular-nums`}>{displayVal}</span>
        <span className="text-[7px] text-muted-foreground font-bold uppercase tracking-widest">{label}</span>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PRIORITY FILTER PILLS
   ═══════════════════════════════════════════════════════════════ */
function PriorityPills({ active, onChange }: { active: PriorityFilter; onChange: (f: PriorityFilter) => void }) {
  return (
    <div className="flex gap-1 mb-2.5">
      <button onClick={() => onChange('all')}
        className={`text-[9px] px-2.5 py-1 rounded-full border font-bold transition-all ${
          active === 'all' ? 'bg-foreground/8 border-foreground/15 text-foreground' : 'bg-card/30 border-border/8 text-muted-foreground'
        }`}>All</button>
      {PRIORITIES.map(p => (
        <button key={p.value} onClick={() => onChange(active === p.value ? 'all' : p.value)}
          className={`text-[9px] px-2.5 py-1 rounded-full border font-bold transition-all flex items-center gap-1 ${
            active === p.value ? `bg-${p.color}/10 border-${p.color}/15 text-${p.color}` : 'bg-card/30 border-border/8 text-muted-foreground'
          }`}>
          {p.emoji} {p.label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION HEADER (COLLAPSIBLE)
   ═══════════════════════════════════════════════════════════════ */
function SectionHeader({ id, icon, label, count, color, isCollapsed, onToggle }: {
  id: string; icon: React.ReactNode; label: string; count: number; color: string;
  isCollapsed: boolean; onToggle: (id: string) => void;
}) {
  return (
    <button onClick={() => onToggle(id)}
      className="w-full flex items-center gap-2 py-2 px-2 group rounded-xl hover:bg-muted/5 transition-all active:scale-[0.99]">
      <motion.div animate={{ rotate: isCollapsed ? 0 : 90 }} transition={{ type: 'spring', damping: 20, stiffness: 300 }}>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
      </motion.div>
      <span className={`${color} opacity-80`}>{icon}</span>
      <span className={`text-[11px] font-extrabold ${color} tracking-tight`}>{label}</span>
      <motion.span layout
        className={`text-[9px] font-black min-w-[20px] h-5 px-1.5 rounded-lg flex items-center justify-center ${
          id === 'overdue' ? 'bg-destructive/12 text-destructive' :
          id === 'today' ? 'bg-chart-4/12 text-chart-4' :
          id === 'completed' ? 'bg-secondary/12 text-secondary' :
          'bg-muted/12 text-muted-foreground'
        }`}>
        {count}
      </motion.span>
      <div className="flex-1" />
      <span className="text-[8px] text-muted-foreground/30 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
        {isCollapsed ? 'Show' : 'Hide'}
      </span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PREMIUM TODO CARD
   ═══════════════════════════════════════════════════════════════ */
function PremiumTodoCard({ todo, today, batchMode, selected, onToggleBatch, onRequestComplete, onDelete, onEdit, onToggleTodo, showBadge }: {
  todo: TodoItem; today: string; batchMode: boolean; selected: boolean;
  onToggleBatch: () => void; onRequestComplete: () => void; onDelete: () => void;
  onEdit: () => void; onToggleTodo?: (id: string) => void; showBadge?: boolean;
}) {
  const ps = PRIORITY_STYLES[todo.priority] || PRIORITY_STYLES.medium;
  const isOverdue = !todo.completed && todo.dueDate < today;
  const rel = relativeTime(todo.dueDate, todo.dueTime);
  const [dragX, setDragX] = useState(0);
  const [showSwipeDelete, setShowSwipeDelete] = useState(false);
  const [checkAnim, setCheckAnim] = useState(false);

  const handleCheckbox = () => {
    if (todo.completed) { onToggleTodo?.(todo.id); return; }
    setCheckAnim(true);
    setTimeout(() => { setCheckAnim(false); onRequestComplete(); }, 350);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Swipe delete reveal layer */}
      <AnimatePresence>
        {showSwipeDelete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-destructive/90 rounded-2xl flex items-center justify-end pr-5 z-0">
            <motion.div initial={{ scale: 0.7 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-0.5">
              <Trash2 className="w-5 h-5 text-destructive-foreground" />
              <span className="text-[8px] font-black text-destructive-foreground uppercase">Delete</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, x: -120, transition: { duration: 0.25 } }}
        drag="x" dragDirectionLock dragConstraints={{ left: -100, right: 0 }} dragElastic={0.15}
        onDrag={(_e, info) => { setDragX(info.offset.x); setShowSwipeDelete(info.offset.x < -40); }}
        onDragEnd={(_e, info) => {
          if (info.offset.x < -80) { onDelete(); } else { setShowSwipeDelete(false); }
          setDragX(0);
        }}
        className={`relative z-10 flex items-center gap-3 px-3.5 py-3 rounded-2xl border border-l-[3px] transition-all cursor-grab active:cursor-grabbing ${
          todo.completed ? 'bg-secondary/4 border-border/8 border-l-secondary/20 opacity-50' :
          isOverdue ? 'bg-destructive/5 border-border/8 border-l-destructive' :
          `${ps.bg} border-border/8 ${ps.border}`
        } ${selected ? 'ring-2 ring-primary/30 bg-primary/5' : ''}`}
        style={{ minHeight: 56, touchAction: 'pan-y' }}
      >
        {/* Checkbox / Batch — 44px touch target */}
        {batchMode ? (
          <button onClick={onToggleBatch}
            className="w-[44px] h-[44px] -m-2 flex items-center justify-center shrink-0"
          >
            <div className={`w-5.5 h-5.5 rounded-lg border-2 flex items-center justify-center transition-all ${
              selected ? 'bg-primary border-primary' : 'border-muted-foreground/20'
            }`}>
              {selected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
            </div>
          </button>
        ) : (
          <button onClick={handleCheckbox}
            className="w-[44px] h-[44px] -m-2 flex items-center justify-center shrink-0"
          >
            <motion.div
              animate={checkAnim ? { scale: [1, 1.3, 0.9, 1.1, 1], borderColor: 'hsl(var(--secondary))' } : {}}
              transition={{ duration: 0.35 }}
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                todo.completed ? 'bg-secondary border-secondary shadow-[0_0_8px_hsl(var(--secondary)/0.3)]'
                : isOverdue ? 'border-destructive/50 hover:bg-destructive/10'
                : 'border-muted-foreground/25 hover:border-secondary hover:bg-secondary/10'
              }`}
            >
              {todo.completed && (
                <motion.div initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 15 }}>
                  <Check className="w-3.5 h-3.5 text-secondary-foreground" />
                </motion.div>
              )}
              {checkAnim && !todo.completed && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.5, 0] }} transition={{ duration: 0.35 }}
                  className="absolute w-6 h-6 rounded-full bg-secondary/20" />
              )}
            </motion.div>
          </button>
        )}

        {/* Content — large tap target */}
        <div className="flex-1 min-w-0 py-0.5" onClick={onEdit} role="button" tabIndex={0}>
          <div className="flex items-center gap-1.5">
            {showBadge && <span className="text-[7px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-bold shrink-0">📋</span>}
            {todo.priority === 'high' && !todo.completed && (
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                <Flame className="w-3.5 h-3.5 text-destructive shrink-0" />
              </motion.div>
            )}
            <p className={`text-xs font-semibold leading-snug truncate ${
              todo.completed ? 'line-through text-muted-foreground' : 'text-foreground'
            }`}>{todo.text}</p>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[9px] font-semibold flex items-center gap-1 ${isOverdue && !todo.completed ? 'text-destructive' : 'text-muted-foreground/50'}`}>
              <Clock className="w-2.5 h-2.5" /> {formatDateLabel(todo.dueDate)} · {rel}
            </span>
            {todo.category && (
              <span className="text-[8px] px-2 py-0.5 rounded-full bg-muted/12 text-muted-foreground font-semibold">{todo.category}</span>
            )}
          </div>
        </div>

        {/* Priority indicator */}
        <motion.span animate={todo.priority === 'high' && !todo.completed ? { scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] } : {}}
          transition={{ duration: 2, repeat: Infinity }}
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${ps.dot}`} />

        {/* Actions — ALWAYS VISIBLE, 44px touch */}
        <div className="flex items-center shrink-0 -mr-1">
          <button onClick={onEdit} className="w-[38px] h-[38px] rounded-xl flex items-center justify-center hover:bg-primary/10 active:bg-primary/15 active:scale-90 transition-all" title="Edit">
            <Edit3 className="w-3.5 h-3.5 text-muted-foreground/50" />
          </button>
          <button onClick={onDelete} className="w-[38px] h-[38px] rounded-xl flex items-center justify-center hover:bg-destructive/10 active:bg-destructive/15 active:scale-90 transition-all" title="Delete">
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground/50" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PREMIUM REMINDER CARD
   ═══════════════════════════════════════════════════════════════ */
function PremiumReminderCard({ reminder: r, viewTab = 'active', batchMode, selected, onToggleBatch, onRequestComplete, onEdit, onDelete, onToggle, onTogglePin, onRestore, onCancelSnooze, showBadge }: {
  reminder: Reminder; viewTab?: ReminderViewTab; batchMode: boolean; selected: boolean;
  onToggleBatch: () => void; onRequestComplete: () => void;
  onEdit?: () => void; onDelete?: () => void; onToggle?: () => void;
  onTogglePin?: () => void; onRestore?: () => void; onCancelSnooze?: () => void; showBadge?: boolean;
}) {
  const colorCls = COLOR_MAP[r.color] || COLOR_MAP.primary;
  const borderL = BORDER_L[r.color] || BORDER_L.primary;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -80, transition: { duration: 0.25 } }} layout
      className={`flex items-start gap-3 px-3.5 py-3 rounded-2xl border border-l-[3px] ${borderL} ${colorCls} transition-all ${
        !r.enabled && viewTab === 'active' ? 'opacity-40' : ''
      } ${selected ? 'ring-2 ring-primary/30 bg-primary/5' : ''}`}
      style={{ minHeight: 56 }}>

      {batchMode ? (
        <button onClick={onToggleBatch} className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
          style={{ borderColor: selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.2)', backgroundColor: selected ? 'hsl(var(--primary))' : 'transparent' }}>
          {selected && <Check className="w-3 h-3 text-primary-foreground" />}
        </button>
      ) : viewTab === 'active' ? (
        <button onClick={onRequestComplete} className="w-5 h-5 rounded-full border-2 border-secondary/25 flex items-center justify-center shrink-0 mt-0.5 hover:bg-secondary/10 hover:border-secondary transition-all active:scale-90" />
      ) : viewTab === 'completed' ? (
        <div className="w-5 h-5 rounded-full bg-secondary border-2 border-secondary flex items-center justify-center shrink-0 mt-0.5">
          <Check className="w-3 h-3 text-secondary-foreground" />
        </div>
      ) : null}

      <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
        <div className="flex items-center gap-1.5">
          {showBadge && <span className="text-[7px] px-1 py-0.5 rounded bg-chart-4/8 text-chart-4 font-bold shrink-0">🔔</span>}
          {r.pinned && <Pin className="w-3 h-3 text-chart-4 fill-chart-4 shrink-0" />}
          <h4 className="text-[11px] font-bold text-foreground truncate hover:text-primary transition-colors">{r.title || 'Untitled'}</h4>
        </div>
        {r.content && <p className="text-[9px] text-muted-foreground line-clamp-1 mt-0.5">{r.content}</p>}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-[7px] font-semibold text-muted-foreground/50 flex items-center gap-0.5">
            <Clock className="w-2 h-2" /> {getScheduleSummary(r)}
          </span>
          {r.snoozedUntil && viewTab === 'snoozed' && (
            <span className="text-[7px] font-bold text-primary bg-primary/8 px-1.5 py-0.5 rounded-full">
              Until {new Date(r.snoozedUntil).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {r.completedAt && viewTab === 'completed' && (
            <span className="text-[7px] font-bold text-secondary bg-secondary/8 px-1.5 py-0.5 rounded-full">
              ✅ {new Date(r.completedAt).toLocaleString('en-IN', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      {/* Actions — ALWAYS VISIBLE */}
      <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
        {viewTab === 'active' && onTogglePin && (
          <button onClick={onTogglePin} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-chart-4/8 transition-all" title="Pin">
            <Pin className={`w-3 h-3 ${r.pinned ? 'text-chart-4 fill-chart-4' : 'text-muted-foreground/30'}`} />
          </button>
        )}
        {viewTab === 'active' && onToggle && (
          <button onClick={onToggle} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted/12 transition-all" title={r.enabled ? 'Disable' : 'Enable'}>
            <Power className={`w-3 h-3 ${r.enabled ? 'text-chart-4' : 'text-muted-foreground/30'}`} />
          </button>
        )}
        {viewTab === 'snoozed' && onCancelSnooze && (
          <button onClick={onCancelSnooze} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-primary/8 transition-all">
            <AlarmClockOff className="w-3 h-3 text-primary" />
          </button>
        )}
        {viewTab === 'completed' && onRestore && (
          <button onClick={onRestore} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-secondary/8 transition-all">
            <RotateCcw className="w-3 h-3 text-secondary" />
          </button>
        )}
        {onEdit && (
          <button onClick={onEdit} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-primary/8 transition-all">
            <Edit3 className="w-3 h-3 text-muted-foreground/40" />
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-destructive/8 transition-all">
            <Trash2 className="w-3 h-3 text-muted-foreground/40" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TODO FORM (ADD + EDIT)
   ═══════════════════════════════════════════════════════════════ */
function TodoForm({ initial, onSave, onCancel }: {
  initial?: TodoItem | null;
  onSave: (data: Omit<TodoItem, 'id' | 'createdAt' | 'completed'> & Partial<TodoItem>) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial?.text || '');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>(initial?.priority || 'medium');
  const [dueDate, setDueDate] = useState(initial?.dueDate || getLocalDateStr());
  const [dueTime, setDueTime] = useState(initial?.dueTime || '');
  const [category, setCategory] = useState(initial?.category || 'Study');

  const handleSubmit = () => {
    if (!text.trim()) { toast.error('Task text is required'); return; }
    onSave({ text: text.trim(), priority, dueDate, dueTime: dueTime || undefined, category });
  };

  return (
    <div className="space-y-4 pb-2">
      {/* Task text */}
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Task</label>
        <Input value={text} onChange={e => setText(e.target.value)} placeholder="What needs to be done?"
          className="h-10 text-sm bg-background/50 rounded-xl" autoFocus onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
      </div>

      {/* Date & Time */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Due Date</label>
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-10 text-sm rounded-xl" />
        </div>
        <div className="w-28">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Time</label>
          <Input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} className="h-10 text-sm rounded-xl" />
        </div>
      </div>

      {/* Priority */}
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Priority</label>
        <div className="flex gap-2">
          {PRIORITIES.map(p => (
            <button key={p.value} onClick={() => setPriority(p.value)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[11px] font-bold transition-all ${
                priority === p.value
                  ? `bg-${p.color}/10 border-${p.color}/20 text-${p.color}`
                  : 'bg-card/40 border-border/10 text-muted-foreground'
              }`}>
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Category</label>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`text-[10px] px-3 py-1.5 rounded-xl border font-semibold transition-all ${
                category === c ? 'bg-primary/8 border-primary/15 text-primary' : 'bg-card/30 border-border/10 text-muted-foreground'
              }`}>{c}</button>
          ))}
        </div>
      </div>

      {/* Validation feedback */}
      {!text.trim() && text.length > 0 && (
        <p className="text-[10px] text-destructive font-semibold flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Task name cannot be empty
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2.5 pt-3">
        <Button variant="ghost" onClick={onCancel} className="flex-1 h-11 text-xs font-bold rounded-xl border border-border/10">Cancel</Button>
        <motion.div whileTap={{ scale: 0.97 }} className="flex-1">
          <Button onClick={handleSubmit} disabled={!text.trim()}
            className="w-full h-11 text-xs font-black gap-2 rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-40">
            {initial ? <><Edit3 className="w-4 h-4" /> Save Changes</> : <><Plus className="w-4 h-4" /> Add Task ✨</>}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ALL TAB
   ═══════════════════════════════════════════════════════════════ */
function AllTabContent({ items, today, batchMode, batchSelected, onToggleBatch, onRequestComplete, onDeleteTodo, onEditTodo, onEditReminder, onDeleteReminder, onTogglePin, onToggleTodo }: {
  items: UnifiedItem[]; today: string; batchMode: boolean; batchSelected: Set<string>;
  onToggleBatch: (id: string) => void;
  onRequestComplete: (type: 'todo' | 'reminder', id: string, title: string) => void;
  onDeleteTodo: (t: TodoItem) => void; onEditTodo: (t: TodoItem) => void;
  onEditReminder: (r: Reminder) => void; onDeleteReminder: (id: string) => void;
  onTogglePin: (id: string) => void; onToggleTodo: (id: string) => void;
}) {
  if (items.length === 0) return <EmptyState icon={<Layers className="w-7 h-7 text-primary/25" />} title="All clear!" subtitle="No pending tasks or reminders. Enjoy! ✨" />;

  return (
    <div className="space-y-1.5">
      {items.map(item => {
        if (item.kind === 'todo') {
          const todo = item.data as TodoItem;
          return <PremiumTodoCard key={todo.id} todo={todo} today={today} batchMode={batchMode} selected={batchSelected.has(todo.id)}
            onToggleBatch={() => onToggleBatch(todo.id)} onRequestComplete={() => onRequestComplete('todo', todo.id, todo.text)}
            onDelete={() => onDeleteTodo(todo)} onEdit={() => onEditTodo(todo)} onToggleTodo={onToggleTodo} showBadge />;
        }
        const rem = item.data as Reminder;
        return <PremiumReminderCard key={rem.id} reminder={rem} viewTab="active" batchMode={batchMode} selected={batchSelected.has(rem.id)}
          onToggleBatch={() => onToggleBatch(rem.id)} onRequestComplete={() => onRequestComplete('reminder', rem.id, rem.title)}
          onEdit={() => onEditReminder(rem)} onDelete={() => onDeleteReminder(rem.id)} onTogglePin={() => onTogglePin(rem.id)} showBadge />;
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TODOS TAB
   ═══════════════════════════════════════════════════════════════ */
function TodosTabContent({ grouped, today, stats, priorityFilter, onPriorityFilter, collapsed, onToggleSection, batchMode, batchSelected, onToggleBatch, onRequestComplete, onDeleteTodo, onEditTodo, onToggleTodo }: {
  grouped: { overdue: TodoItem[]; today: TodoItem[]; tomorrow: TodoItem[]; upcoming: TodoItem[]; completed: TodoItem[] };
  today: string;
  stats: { all: number; done: number; pending: number; overdue: number; pct: number; todayPct: number };
  priorityFilter: PriorityFilter; onPriorityFilter: (f: PriorityFilter) => void;
  collapsed: Set<string>; onToggleSection: (id: string) => void;
  batchMode: boolean; batchSelected: Set<string>; onToggleBatch: (id: string) => void;
  onRequestComplete: (type: 'todo' | 'reminder', id: string, title: string) => void;
  onDeleteTodo: (t: TodoItem) => void; onEditTodo: (t: TodoItem) => void;
  onToggleTodo: (id: string) => void;
}) {
  const isEmpty = stats.all === 0;
  const todayAllDone = grouped.today.length === 0 && stats.pending > 0 ? false : (grouped.overdue.length === 0 && grouped.today.length === 0 && stats.all > 0);

  if (isEmpty) return <EmptyState icon={<ListChecks className="w-7 h-7 text-primary/25" />} title="No tasks yet" subtitle="Tap 'Add Task' to get started 📝" />;

  const renderSection = (id: string, icon: React.ReactNode, label: string, items: TodoItem[], color: string) => {
    if (items.length === 0) return null;
    const isCollapsed = collapsed.has(id);
    return (
      <div key={id}>
        <SectionHeader id={id} icon={icon} label={label} count={items.length} color={color} isCollapsed={isCollapsed} onToggle={onToggleSection} />
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden space-y-1.5 ml-1">
              {items.map(t => (
                <PremiumTodoCard key={t.id} todo={t} today={today} batchMode={batchMode} selected={batchSelected.has(t.id)}
                  onToggleBatch={() => onToggleBatch(t.id)} onRequestComplete={() => onRequestComplete('todo', t.id, t.text)}
                  onDelete={() => onDeleteTodo(t)} onEdit={() => onEditTodo(t)} onToggleTodo={onToggleTodo} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="space-y-1">
      <StatsBar stats={stats} />
      <PriorityPills active={priorityFilter} onChange={onPriorityFilter} />

      {/* 🎉 All Done Today Celebration */}
      {todayAllDone && <AllDoneCelebration />}

      {renderSection('overdue', <AlertTriangle className="w-3 h-3" />, 'Overdue', grouped.overdue, 'text-destructive')}
      {renderSection('today', <Star className="w-3 h-3" />, 'Today', grouped.today, 'text-chart-4')}
      {renderSection('tomorrow', <TrendingUp className="w-3 h-3" />, 'Tomorrow', grouped.tomorrow, 'text-primary')}
      {renderSection('upcoming', <CalendarDays className="w-3 h-3" />, 'Upcoming', grouped.upcoming, 'text-muted-foreground')}
      {renderSection('completed', <CheckCircle2 className="w-3 h-3" />, 'Completed', grouped.completed, 'text-secondary')}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ALERTS TAB
   ═══════════════════════════════════════════════════════════════ */
function AlertsTabContent({ displayed, viewTab, onViewTabChange, groups, batchMode, batchSelected, onToggleBatch, onRequestComplete, onEdit, onDelete, onToggle, onTogglePin, onRestore, onCancelSnooze }: {
  displayed: Reminder[]; viewTab: ReminderViewTab;
  onViewTabChange: (tab: ReminderViewTab) => void;
  groups: { active: Reminder[]; snoozed: Reminder[]; completed: Reminder[] };
  batchMode: boolean; batchSelected: Set<string>; onToggleBatch: (id: string) => void;
  onRequestComplete: (type: 'todo' | 'reminder', id: string, title: string) => void;
  onEdit: (r: Reminder) => void; onDelete: (id: string) => void; onToggle: (id: string) => void;
  onTogglePin: (id: string) => void; onRestore: (id: string) => void; onCancelSnooze: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/6 border border-border/6">
        {([
          { id: 'active' as ReminderViewTab, label: '🔔 Active', count: groups.active.length },
          { id: 'snoozed' as ReminderViewTab, label: '⏰ Snoozed', count: groups.snoozed.length },
          { id: 'completed' as ReminderViewTab, label: '✅ Done', count: groups.completed.length },
        ]).map(tab => (
          <button key={tab.id} onClick={() => onViewTabChange(tab.id)}
            className={`flex-1 text-[9px] font-bold py-1.5 rounded-lg transition-all ${
              viewTab === tab.id ? 'bg-card/80 text-foreground shadow-sm border border-border/10' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {tab.label} {tab.count > 0 && <span className="ml-0.5 opacity-60">({tab.count})</span>}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <EmptyState
          icon={<BellOff className="w-7 h-7 text-chart-4/25" />}
          title={viewTab === 'active' ? 'No active alerts' : viewTab === 'snoozed' ? 'No snoozed alerts' : 'No completed alerts'}
          subtitle={viewTab === 'active' ? 'Tap "New Reminder" to create one 🔔' : 'Items will appear here'}
        />
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence mode="popLayout">
            {displayed.map(r => (
              <PremiumReminderCard key={r.id} reminder={r} viewTab={viewTab} batchMode={batchMode} selected={batchSelected.has(r.id)}
                onToggleBatch={() => onToggleBatch(r.id)} onRequestComplete={() => onRequestComplete('reminder', r.id, r.title)}
                onEdit={() => onEdit(r)} onDelete={() => onDelete(r.id)} onToggle={() => onToggle(r.id)}
                onTogglePin={() => onTogglePin(r.id)} onRestore={() => onRestore(r.id)} onCancelSnooze={() => onCancelSnooze(r.id)} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ALL DONE CELEBRATION
   ═══════════════════════════════════════════════════════════════ */
function AllDoneCelebration() {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 18, stiffness: 200 }}
      className="relative py-8 text-center rounded-2xl border border-secondary/15 overflow-hidden mb-3"
      style={{ background: 'linear-gradient(135deg, hsl(var(--secondary)/0.08) 0%, hsl(var(--card)) 40%, hsl(var(--primary)/0.06) 100%)' }}>
      {/* Radial glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 3, repeat: Infinity }} className="w-32 h-32 rounded-full bg-secondary/20 blur-3xl" />
      </div>

      {/* Floating particles */}
      {[...Array(10)].map((_, i) => (
        <motion.div key={i} className={`absolute rounded-full ${i % 3 === 0 ? 'bg-secondary/30' : i % 3 === 1 ? 'bg-primary/20' : 'bg-chart-4/25'}`}
          style={{ left: `${10 + i * 9}%`, top: `${20 + (i % 3) * 20}%`, width: 3 + (i % 3), height: 3 + (i % 3) }}
          animate={{ y: [0, -25, 0], x: [0, (i % 2 ? 8 : -8), 0], opacity: [0, 1, 0] }}
          transition={{ duration: 2.5 + i * 0.2, repeat: Infinity, delay: i * 0.15 }} />
      ))}

      <motion.div animate={{ y: [0, -8, 0], rotate: [0, -5, 5, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }} className="relative z-10">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-secondary/15 border border-secondary/20 flex items-center justify-center mb-3"
          style={{ boxShadow: '0 0 20px hsl(var(--secondary)/0.15)' }}>
          <PartyPopper className="w-7 h-7 text-secondary" />
        </div>
      </motion.div>
      <h3 className="text-base font-black text-foreground relative z-10">🎉 All Done for Today!</h3>
      <p className="text-[11px] text-muted-foreground mt-1.5 relative z-10">You crushed it! Time to relax or get ahead 🏆</p>
      <motion.div initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 1.5, delay: 0.3, ease: 'easeOut' }}
        className="h-0.5 bg-gradient-to-r from-transparent via-secondary/30 to-transparent mx-8 mt-3" />
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   COMPLETION OVERLAY
   ═══════════════════════════════════════════════════════════════ */
function CompletionOverlay() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[95] flex items-center justify-center pointer-events-none">
      {/* Expanding rings */}
      {[0, 1, 2].map(i => (
        <motion.div key={i} initial={{ scale: 0.5, opacity: 0.6 }} animate={{ scale: 3 + i, opacity: 0 }}
          transition={{ duration: 0.8 + i * 0.15, delay: 0.1 + i * 0.1 }}
          className="absolute w-16 h-16 rounded-full border-2 border-secondary/30" />
      ))}
      <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 2, 1.5], opacity: [0, 0.4, 0] }}
        transition={{ duration: 0.8 }} className="absolute w-48 h-48 rounded-full"
        style={{ background: 'radial-gradient(circle, hsl(var(--secondary) / 0.5), transparent)' }} />
      <motion.div initial={{ scale: 0, rotate: -45 }} animate={{ scale: [0, 1.2, 1], rotate: [-45, 10, 0] }}
        transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.05 }}
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: 'hsl(var(--secondary) / 0.2)', border: '3px solid hsl(var(--secondary))', boxShadow: '0 0 40px hsl(var(--secondary) / 0.4), 0 0 80px hsl(var(--secondary) / 0.15)' }}>
        <Check className="w-10 h-10 text-secondary" strokeWidth={3} />
      </motion.div>
      <motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="absolute mt-28 text-sm font-black text-secondary tracking-wide">Done! ✨</motion.span>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SMART ALERTS SECTION
   ═══════════════════════════════════════════════════════════════ */
function SmartAlertsSection({ alerts, onDismiss, onAction }: {
  alerts: SmartAlert[];
  onDismiss: (key: string) => void;
  onAction: (tab: string) => void;
}) {
  const ALERT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    destructive: { bg: 'bg-destructive/6', border: 'border-l-destructive', text: 'text-destructive' },
    'chart-4': { bg: 'bg-chart-4/6', border: 'border-l-chart-4', text: 'text-chart-4' },
    primary: { bg: 'bg-primary/6', border: 'border-l-primary', text: 'text-primary' },
    secondary: { bg: 'bg-secondary/6', border: 'border-l-secondary', text: 'text-secondary' },
    accent: { bg: 'bg-accent/6', border: 'border-l-accent', text: 'text-accent' },
  };

  return (
    <div className="mb-3 space-y-1.5">
      <div className="flex items-center gap-1.5 px-1 mb-1.5">
        <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}>
          <Sparkles className="w-3.5 h-3.5 text-chart-4" />
        </motion.div>
        <span className="text-[10px] font-extrabold text-chart-4 uppercase tracking-wider">Smart Insights</span>
        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-chart-4/10 text-chart-4 font-black">{alerts.length}</span>
      </div>
      <AnimatePresence mode="popLayout">
        {alerts.map((alert, idx) => {
          const c = ALERT_COLORS[alert.color] || ALERT_COLORS.primary;
          return (
            <motion.div
              key={alert.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: -80, scale: 0.9, transition: { duration: 0.2 } }}
              transition={{ delay: idx * 0.04 }}
              className={`relative flex items-start gap-2.5 px-3.5 py-3 rounded-2xl border border-l-[3px] ${c.border} ${c.bg} border-border/8 overflow-hidden group`}
            >
              {/* Sparkle badge */}
              <div className="absolute top-1.5 right-1.5">
                <span className="text-[7px] px-1.5 py-0.5 rounded-md bg-chart-4/10 text-chart-4 font-black flex items-center gap-0.5">
                  <Sparkles className="w-2 h-2" /> Smart
                </span>
              </div>

              <span className="text-base mt-0.5 shrink-0">{alert.emoji}</span>
              <div className="flex-1 min-w-0 pr-12">
                <p className="text-[11px] font-bold text-foreground leading-snug">{alert.title}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed">{alert.subtitle}</p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => onAction(alert.actionTab)}
                    className={`text-[9px] font-bold px-2.5 py-1 rounded-lg ${c.bg} ${c.text} border border-current/10 hover:brightness-110 active:scale-95 transition-all`}
                  >
                    {alert.actionLabel}
                  </button>
                  <button
                    onClick={() => onDismiss(alert.dismissKey)}
                    className="text-[8px] font-semibold text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              {/* Priority indicator */}
              {alert.priority === 'high' && (
                <motion.div
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className={`absolute top-3 right-12 w-2 h-2 rounded-full ${c.text === 'text-destructive' ? 'bg-destructive' : c.text === 'text-chart-4' ? 'bg-chart-4' : 'bg-primary'}`}
                />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════════════ */
function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
      className="py-14 text-center space-y-4 relative">
      {/* Decorative rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.04, 0.08, 0.04] }}
          transition={{ duration: 4, repeat: Infinity }} className="w-40 h-40 rounded-full border border-primary/10" />
        <motion.div animate={{ scale: [1, 1.15, 1], opacity: [0.03, 0.06, 0.03] }}
          transition={{ duration: 5, repeat: Infinity, delay: 0.5 }} className="absolute w-56 h-56 rounded-full border border-secondary/8" />
      </div>

      <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="relative w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-muted/12 to-muted/4 border border-border/10 flex items-center justify-center shadow-sm">
        {icon}
        <motion.div animate={{ opacity: [0, 0.5, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary/20" />
      </motion.div>
      <div>
        <p className="text-sm font-extrabold text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground mt-1 max-w-[220px] mx-auto leading-relaxed">{subtitle}</p>
      </div>
    </motion.div>
  );
}
