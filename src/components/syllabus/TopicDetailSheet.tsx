import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { Trash2, Plus, X, CalendarIcon, Hash, Undo2, Redo2, Timer, Clock, ChevronDown, ChevronRight, ChevronLeft, CheckCircle2, Circle, Flame, Target, BookOpen, AlertTriangle, Eye, Play, Pause, RotateCcw, Save, Link2, ExternalLink, Youtube, FileText, Pencil, ClipboardCopy, Sparkles, Zap, Trophy, Minus, Star } from 'lucide-react';
import { MarkdownEditor } from '@project/components/markdown-editor';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import BottomSheet from '../shared/BottomSheet';
import { useTimer } from '../../contexts/TimerContext';
import { useTimerTick } from '../../hooks/useGlobalTimer';
import type { SubTopic, TopicStatus, ResourceLink, UserSettings, TimeEntry, Subject } from '../../types';
import TopicAttachments from './TopicAttachments';
import { formatDate, formatDateRelative, formatStudyTime, getLocalDateStr, getCleanName } from '../../lib/utils';
import type { SaveState } from '../shared/SaveStatus';
import RevisionSheet from './RevisionSheet';
import type { RevisionMap } from './RevisionSheet';
import { REVISION_KEYS } from '../../types';
import { toast } from 'sonner';
import { DifficultyDots, SectionRow, CompactStatus } from './topicSheet/CompactParts';
import CompactTimeLog from './topicSheet/CompactTimeLog';
import ResourceManager from './topicSheet/ResourceManager';

interface Props {
  open: boolean;
  onClose: () => void;
  topic: SubTopic | null;
  onSave: (topic: SubTopic) => void;
  onDelete: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenPomodoro?: () => void;
  subjectId?: string;
  unitId?: string;
  subjectName?: string;
  subjectShortName?: string;
  unitName?: string;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  topicIndex?: number;
  totalTopics?: number;
  availableSubjects?: Subject[];
  onMoveToSubject?: (newSubjectId: string, newUnitId: string) => void;
  onRenameTopic?: (newName: string) => void;
  onNavigateToTopic?: (subjectId: string, unitId: string, topicId: string) => void;
  /** Override the default z-index (55) for the bottom sheet */
  sheetZIndex?: number;
  /** Called to create a DB study session — used to create sessions at the moment time is logged */
  onCreateSession?: (session: { date: string; minutes: number; description: string; type: 'Topic' | 'Unit' | 'Other'; subjectId?: string; subjectName?: string; topicId?: string; unitId?: string; startTime?: string; endTime?: string; note?: string }) => void;
}

const STATUS_CONFIG: { value: TopicStatus; label: string; emoji: string; desc: string }[] = [
  { value: 'incomplete', label: 'Not Started', emoji: '📋', desc: 'To do' },
  { value: 'in_process', label: 'In Progress', emoji: '🔄', desc: 'Studying' },
  { value: 'complete', label: 'Complete', emoji: '✅', desc: 'Done' },
];

function shortenSubjectName(name: string): string {
  const emojiMatch = name.match(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]+/u);
  const emoji = emojiMatch ? emojiMatch[0] : '';
  const text = name.slice(emoji.length).trim();
  if (text.length <= 15) return emoji ? `${emoji} ${text}` : text;
  const words = text.replace(/[()[\]]/g, '').split(/[\s,]+/).filter(Boolean);
  const skip = new Set(['&', 'of', 'and', 'the', 'in', 'for', 'to', '-']);
  const trailingCodes: string[] = [];
  for (let i = words.length - 1; i >= 0; i--) {
    if (words[i].length <= 4 && words[i] === words[i].toUpperCase() && /^[A-Z]+$/.test(words[i])) {
      trailingCodes.unshift(words[i]);
    } else break;
  }
  const mainWords = words.slice(0, words.length - trailingCodes.length);
  const abbr = mainWords.map(w => { if (w === '&') return '&'; if (skip.has(w.toLowerCase())) return ''; return w[0]?.toUpperCase() || ''; }).filter(Boolean).join('');
  if (abbr.length < 2) return emoji ? `${emoji} ${text.slice(0, 14)}…` : text.slice(0, 14) + '…';
  const result = trailingCodes.length > 0 ? `${abbr} ${trailingCodes.join(' ')}` : abbr;
  return emoji ? `${emoji} ${result}` : result;
}

function getExamLabel(): string {
  try {
    const raw = localStorage.getItem('nursing-settings-v2');
    if (!raw) return 'NORCET';
    const s = JSON.parse(raw) as UserSettings;
    const mode = s.studentMode || 'nursing';
    if (mode === 'agriculture') return s.examLabelAgriculture || 'AAO';
    return s.examLabelNursing || 'NORCET';
  } catch { return 'NORCET'; }
}

/* ===== Flip-clock digit renderer ===== */
function FlipDigit({ value }: { value: string }) {
  return (
    <div className="relative w-[38px] h-[52px] rounded-xl overflow-hidden" style={{
      background: 'linear-gradient(180deg, hsl(var(--foreground) / 0.95) 0%, hsl(var(--foreground) / 0.85) 49.5%, hsl(var(--foreground) / 0.75) 50.5%, hsl(var(--foreground) / 0.8) 100%)',
      boxShadow: '0 4px 12px hsl(var(--foreground) / 0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
    }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-black text-background font-mono tracking-tighter" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
          {value}
        </span>
      </div>
      {/* Center line */}
      <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-background/10" />
    </div>
  );
}

function FlipClock({ display }: { display: string }) {
  // display is "MM:SS" or "HH:MM:SS"
  const parts = display.split(':');
  const min = parts.length === 3 ? parts[0] + parts[1] : parts[0];
  const sec = parts.length === 3 ? parts[2] : parts[1];
  const m1 = (min || '00').padStart(2, '0')[0];
  const m2 = (min || '00').padStart(2, '0')[1];
  const s1 = (sec || '00').padStart(2, '0')[0];
  const s2 = (sec || '00').padStart(2, '0')[1];

  return (
    <div className="flex items-center gap-1.5 justify-center py-3">
      <FlipDigit value={m1} />
      <FlipDigit value={m2} />
      <div className="flex flex-col gap-2 px-0.5">
        <div className="w-2 h-2 rounded-full bg-foreground/70" />
        <div className="w-2 h-2 rounded-full bg-foreground/70" />
      </div>
      <FlipDigit value={s1} />
      <FlipDigit value={s2} />
    </div>
  );
}

/** Start time (HH:mm) for a block of `mins` that just finished — only for today's date */
function nowStartTime(mins: number, date?: string): string | undefined {
  const now = new Date();
  if (date && date !== getLocalDateStr(now)) return undefined;
  const startMin = Math.max(0, now.getHours() * 60 + now.getMinutes() - Math.round(mins));
  return `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
}

export default function TopicDetailSheet({ open, onClose, topic, onSave, onDelete, canUndo, canRedo, onUndo, onRedo, onOpenPomodoro, subjectId, unitId, subjectName, subjectShortName, unitName, onNavigatePrev, onNavigateNext, hasPrev, hasNext, topicIndex, totalTopics, availableSubjects = [], onMoveToSubject, onRenameTopic, onNavigateToTopic, sheetZIndex, onCreateSession }: Props) {
  const { state: timer, actions: timerActions } = useTimer();
  const [draft, setDraft] = useState<SubTopic | null>(null);
  const [newTag, setNewTag] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [moduleOpen, setModuleOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjectId || '');
  const [selectedUnitId, setSelectedUnitId] = useState(unitId || '');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<SaveState>('idle');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  useEffect(() => { if (!open) setRevisionOpen(false); }, [open]);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedRef = useRef<string>('');
  const justSavedRef = useRef(false);
  const skipAutoSaveRef = useRef(false);
  const currentTopicIdRef = useRef<string | null>(null);
  // Always call the newest onSave (the auto-save timer would otherwise fire an old closure that still holds
  // the subjects from 1.5 s ago and could overwrite changes made elsewhere in the meantime).
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const draftRef = useRef<SubTopic | null>(null);
  const [hasPendingSave, setHasPendingSave] = useState(false);
  // Bumped after undo / redo so the sheet re-reads the topic even if the parent hands back the same object
  const [resyncTick, setResyncTick] = useState(0);
  const forceAdoptRef = useRef(false);

  // Debounced auto-save (1.5s) — guarded against save→prop→draft loops
  useEffect(() => {
    if (!draft || !open) return;
    if (skipAutoSaveRef.current) { skipAutoSaveRef.current = false; return; }
    const draftJson = JSON.stringify(draft);
    if (draftJson === lastSavedRef.current) return;
    clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus('idle');
    setHasPendingSave(true);
    autoSaveTimer.current = setTimeout(() => {
      setAutoSaveStatus('saving');
      justSavedRef.current = true;
      // if the parent never echoes this save back, do not let the flag swallow the next real external change
      setTimeout(() => { justSavedRef.current = false; }, 800);
      lastSavedRef.current = JSON.stringify(draft);
      setHasPendingSave(false);
      try {
        onSaveRef.current(draft);
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      } catch {
        setAutoSaveStatus('error');
      }
    }, 1500);
    return () => clearTimeout(autoSaveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, open]);

  draftRef.current = draft;
  const dragX = useMotionValue(0);
  const contentOpacity = useTransform(dragX, [-120, 0, 120], [0.4, 1, 0.4]);
  const contentScale = useTransform(dragX, [-120, 0, 120], [0.96, 1, 0.96]);
  const swipeThreshold = 70;

  const saveAndNavigate = useCallback((direction: 'prev' | 'next') => {
    clearTimeout(autoSaveTimer.current);
    if (draft && JSON.stringify(draft) !== lastSavedRef.current) {
      justSavedRef.current = false; // Ensure navigation won't be blocked
      onSave(draft);
      lastSavedRef.current = JSON.stringify(draft);
    }
    navigator.vibrate?.(20);
    setSwipeDirection(direction === 'prev' ? 'right' : 'left');
    // Navigate immediately — the [topic] effect uses topic ID to distinguish
    // navigation from save-triggered re-renders, so no delay needed.
    requestAnimationFrame(() => {
      if (direction === 'prev') onNavigatePrev?.();
      else onNavigateNext?.();
      setSwipeDirection(null);
      scrollRef.current?.scrollTo({ top: 0 });
    });
  }, [draft, onSave, onNavigatePrev, onNavigateNext]);

  /** Save whatever is typed right now (used before undo / redo so they act on the latest edit). */
  const flushDraft = useCallback(() => {
    clearTimeout(autoSaveTimer.current);
    const d = draftRef.current;
    if (d && JSON.stringify(d) !== lastSavedRef.current) {
      lastSavedRef.current = JSON.stringify(d);
      justSavedRef.current = false;
      onSaveRef.current(d);
    }
    setHasPendingSave(false);
  }, []);

  const handleUndoClick = useCallback(() => {
    flushDraft();
    forceAdoptRef.current = true;
    onUndo?.();
    setResyncTick(t => t + 1);
  }, [flushDraft, onUndo]);
  const handleRedoClick = useCallback(() => {
    flushDraft();
    forceAdoptRef.current = true;
    onRedo?.();
    setResyncTick(t => t + 1);
  }, [flushDraft, onRedo]);

  // ── Swipe left / right to change topic ──────────────────────────────────────
  // Native touch handling (instead of a framer drag) so it works anywhere on the sheet and
  // never fights vertical scrolling. Ignored on inputs, sliders, the notes editor and
  // horizontally scrolling rows, so editing / scrolling those is never mistaken for a swipe.
  const touchRef = useRef<{ x: number; y: number; t: number; lock: 'h' | 'v' | null } | null>(null);

  const isSwipeBlocked = (target: EventTarget | null) => {
    let el = target as HTMLElement | null;
    while (el && el !== document.body) {
      if (el.matches?.('input, textarea, select, [role="slider"], [contenteditable="true"], .ProseMirror, [data-no-swipe]')) return true;
      const cs = getComputedStyle(el);
      // a short, horizontally scrolling strip (chip rows) owns horizontal gestures; the tall sheet scroller itself does not
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.clientHeight < 160 && el.scrollWidth > el.clientWidth + 8) return true;
      el = el.parentElement;
    }
    return false;
  };

  const onSwipeStart = (e: React.TouchEvent) => {
    if (!(hasPrev || hasNext) || e.touches.length !== 1 || isSwipeBlocked(e.target)) { touchRef.current = null; return; }
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), lock: null };
  };
  const onSwipeMove = (e: React.TouchEvent) => {
    const st = touchRef.current;
    if (!st) return;
    const t = e.touches[0];
    const dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (!st.lock) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) st.lock = 'h';
      else if (Math.abs(dy) > 10) st.lock = 'v';
    }
    if (st.lock === 'h') {
      const atEdge = (dx > 0 && !hasPrev) || (dx < 0 && !hasNext);
      dragX.set(dx * (atEdge ? 0.1 : 0.45)); // finger-following feedback, resists at the ends
    }
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    const st = touchRef.current;
    touchRef.current = null;
    if (!st || st.lock !== 'h') { if (dragX.get() !== 0) animate(dragX, 0, { type: 'spring', stiffness: 420, damping: 36 }); return; }
    const dx = e.changedTouches[0].clientX - st.x;
    const speed = Math.abs(dx) / Math.max(Date.now() - st.t, 1);
    animate(dragX, 0, { type: 'spring', stiffness: 420, damping: 36 });
    const committed = Math.abs(dx) > swipeThreshold * 0.85 || (Math.abs(dx) > 34 && speed > 0.45);
    if (!committed) return;
    if (dx > 0 && hasPrev) saveAndNavigate('prev');
    else if (dx < 0 && hasNext) saveAndNavigate('next');
    else {
      navigator.vibrate?.(10);
      toast(dx > 0 ? '⏮ This is the first topic in the list' : '⏭ That was the last topic in the list', { id: 'topic-list-end', duration: 1400 });
    }
  };

  // One-time hint so the gesture is discoverable
  useEffect(() => {
    if (!open || !(hasPrev || hasNext)) return;
    try {
      if (localStorage.getItem('topic-swipe-hint-v1')) return;
      localStorage.setItem('topic-swipe-hint-v1', '1');
    } catch { return; }
    const id = setTimeout(() => toast('👆 Swipe left / right to switch topics', { duration: 2600 }), 700);
    return () => clearTimeout(id);
  }, [open, hasPrev, hasNext]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        if (!editingName) setEditingName(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, editingName]);

  useEffect(() => {
    const isNewTopic = topic?.id !== currentTopicIdRef.current;

    // If this is the SAME topic re-rendered after a save, skip to avoid save→prop→draft loop.
    // But ALWAYS update draft when the topic ID changes (real navigation).
    const forced = forceAdoptRef.current;
    forceAdoptRef.current = false;
    if (!forced && !isNewTopic && justSavedRef.current) {
      justSavedRef.current = false;
      return;
    }

    setEditingName(false);
    setAutoSaveStatus('idle');
    setSelectedSubjectId(subjectId || '');
    setSelectedUnitId(unitId || '');
    if (topic) {
      currentTopicIdRef.current = topic.id;
      clearTimeout(autoSaveTimer.current);
      skipAutoSaveRef.current = true;
      justSavedRef.current = false; // Reset on navigation
      lastSavedRef.current = JSON.stringify(topic);
      setDraft({
      ...topic,
      status: topic.status || (topic.completed ? 'complete' : 'incomplete'),
      notesArr: topic.notesArr ? [...topic.notesArr] : [],
      mcqs: topic.mcqs ? topic.mcqs.map(m => ({ ...m })) : [],
      tags: topic.tags ? [...topic.tags] : [],
      resourceLinks: topic.resourceLinks ? topic.resourceLinks.map(r => ({ ...r })) : [],
      attachments: topic.attachments ? topic.attachments.map(a => ({ ...a })) : [],
      timeEntries: topic.timeEntries ? topic.timeEntries.map(e => ({ ...e })) : [],
    });
    } else if (!topic) {
      currentTopicIdRef.current = null;
    }
  }, [topic, subjectId, unitId, resyncTick]);

  // Compact-sheet UI state (must stay above the early return)
  const [timerOpen, setTimerOpen] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem('topic-sheet-sections-v1') || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const toggleSection = useCallback((id: string) => setOpenSections(prev => {
    const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
    try { localStorage.setItem('topic-sheet-sections-v1', JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }), []);
  const timerActive = timer.running || timer.swRunning;
  useEffect(() => { setTimerOpen(timerActive); }, [topic?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (timerActive) setTimerOpen(true); }, [timerActive]);

  // "Complete & next": mark complete, then move on once the draft has updated
  const pendingNextRef = useRef(false);
  useEffect(() => {
    if (pendingNextRef.current && draft?.completed) {
      pendingNextRef.current = false;
      saveAndNavigate('next');
    }
  }, [draft, saveAndNavigate]);

  if (!draft) return null;

  const setField = <K extends keyof SubTopic>(k: K, v: SubTopic[K]) => setDraft(d => d ? { ...d, [k]: v } : d);

  const setStatus = (status: TopicStatus) => {
    const now = new Date();
    const todayStr = getLocalDateStr(now);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    // FIX: completedDate is always set to TODAY (the real current date) when marking complete,
    // unless the user explicitly overrides it via the date picker afterward.
    // New reconciliation entries also use todayStr, never a stale completedDate.
    if (status === 'complete') {
      setDraft(d => {
        if (!d) return d;
        const prevEntries = d.timeEntries || [];
        const entrySum = prevEntries.reduce((a, e) => a + e.minutes, 0);
        const delta = d.timeSpent - entrySum;
        const newEntries = delta > 0 ? [...prevEntries, { date: todayStr, minutes: delta, status: 'complete' as TopicStatus, note: 'Marked complete' }] : prevEntries;
        return { ...d, status, completed: true, completedDate: todayStr, completedTime: d.completedTime || timeStr, timeEntries: newEntries };
      });
      setShowDatePicker(false);
    } else if (status === 'in_process') {
      setDraft(d => {
        if (!d) return d;
        const prevEntries = d.timeEntries || [];
        const entrySum = prevEntries.reduce((a, e) => a + e.minutes, 0);
        const delta = d.timeSpent - entrySum;
        const newEntries = delta > 0 ? [...prevEntries, { date: todayStr, minutes: delta, status: 'in_process' as TopicStatus }] : prevEntries;
        return { ...d, status, completed: false, completedTime: undefined, timeEntries: newEntries };
      });
      setShowDatePicker(true);
    } else {
      setDraft(d => d ? { ...d, status, completed: false, completedDate: undefined, completedTime: undefined } : d);
      setShowDatePicker(false);
    }
  };

  // FIX: addTime uses ONLY the explicitly passed targetDate, or falls back to today.
  // Never falls back to draft.completedDate — that would silently stamp entries with a stale date.
  const addTime = (mins: number, targetDate?: string, note?: string, time?: string) => {
    if (!draft) return;
    const dateStr = targetDate || getLocalDateStr(new Date());
    // Topic time is tracked ONLY on the topic itself — NOT as a study session.
    // Sessions are created separately via the calendar's "Add Study Time" flow.
    setDraft(d => {
      if (!d) return d;
      const newEntries = [...(d.timeEntries || []), { date: dateStr, minutes: mins, status: (d.status || 'incomplete') as TopicStatus, note, ...(time ? { time } : {}) }];
      return { ...d, timeSpent: d.timeSpent + mins, timeEntries: newEntries };
    });
  };

  const deleteTimeEntry = (idx: number) => {
    setDraft(d => {
      if (!d) return d;
      const entries = [...(d.timeEntries || [])];
      const removed = entries.splice(idx, 1)[0];
      return { ...d, timeSpent: Math.max(0, d.timeSpent - (removed?.minutes || 0)), timeEntries: entries };
    });
  };

  const editTimeEntry = (idx: number, mins: number, note?: string, date?: string, time?: string) => {
    setDraft(d => {
      if (!d) return d;
      const entries = [...(d.timeEntries || [])];
      const old = entries[idx];
      if (!old) return d;
      const diff = mins - old.minutes;
      entries[idx] = { ...old, minutes: mins, note: note ?? old.note, date: date ?? old.date, time: time || undefined };
      return { ...d, timeSpent: Math.max(0, d.timeSpent + diff), timeEntries: entries };
    });
  };

  // FIX: Changing completedDate must NEVER mutate existing time entries' dates.
  // Each entry's date is immutable after creation. completedDate is topic metadata only.
  const handleCompletedDateChange = (newDate: string | undefined) => {
    setDraft(d => d ? { ...d, completedDate: newDate } : d);
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (!tag || (draft.tags || []).includes(tag) || (draft.tags || []).length >= 8) return;
    setField('tags', [...(draft.tags || []), tag]);
    setNewTag('');
  };
  const removeTag = (idx: number) => setField('tags', (draft.tags || []).filter((_, i) => i !== idx));

  const difficulties: SubTopic['difficulty'][] = ['Easy', 'Medium', 'Hard'];
  const relevances: string[] = ['High', 'Med', 'Low', 'None'];
  const currentStatus = draft.status || (draft.completed ? 'complete' : 'incomplete');

  const selSubject = availableSubjects.find(s => s.id === selectedSubjectId);
  const unitsForSubject = selSubject?.units || [];
  const selUnit = unitsForSubject.find(u => u.id === selectedUnitId);
  const subjectColor = selSubject?.color || 'hsl(var(--primary))';

  const notesPreview = (draft.notes || '').replace(/[#*_`>~\[\]-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 56);
  const revs = draft.revisions || {};
  const revDone = REVISION_KEYS.filter(k => revs[k]?.status === 'complete').length;

  // Under the topic name: difficulty (three dots) + important star
  const quickControls = (
    <div className="flex items-center justify-between px-4 pb-1.5" onPointerDown={e => e.stopPropagation()}>
      <DifficultyDots value={draft.difficulty} onChange={d => setField('difficulty', d)} />
      <button type="button" onClick={() => { setField('important', !draft.important); navigator.vibrate?.(8); }}
        aria-pressed={!!draft.important} aria-label={draft.important ? 'Remove important mark' : 'Mark as important'} title={draft.important ? 'Important' : 'Mark important'}
        className={`h-8 px-2.5 rounded-xl border flex items-center gap-1 text-[10px] font-bold active:scale-90 transition-[transform,background-color,border-color] duration-150 ${
          draft.important ? 'bg-amber-500/12 border-amber-500/30 text-amber-600' : 'border-transparent text-muted-foreground/50 hover:bg-muted/20'
        }`}>
        <Star className={`w-4 h-4 ${draft.important ? 'fill-amber-500 text-amber-500' : ''}`} />
        {draft.important && 'Important'}
      </button>
    </div>
  );

  // Footer of the status card: total time + revision rounds (done topics) or the study timer toggle (open topics)
  const sessionBar = (
    <div className="flex items-center gap-2 pt-2.5 border-t border-border/10" onPointerDown={e => e.stopPropagation()}>
      <span className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-xl bg-chart-5/8 border border-chart-5/15 text-chart-5">
        <Clock className="w-3 h-3" /><span className="text-[12px] font-bold font-mono">{formatStudyTime(draft.timeSpent)}</span>
      </span>
      {draft.completed ? (
        <button type="button" onClick={() => { navigator.vibrate?.(10); setRevisionOpen(true); }} aria-label="Open revision window"
          className="flex-1 min-w-0 h-8 flex items-center gap-2 px-2.5 rounded-xl border border-border/15 bg-muted/15 hover:bg-muted/30 active:scale-[0.98] transition text-left">
          <span className="text-[13px] leading-none">🔁</span>
          <span className="flex gap-1">
            {REVISION_KEYS.map(k => {
              const st = revs[k]?.status || 'pending';
              return (
                <span key={k} className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${
                  st === 'complete' ? 'bg-secondary/15 border-secondary/35 text-secondary'
                    : st === 'in_process' ? 'bg-chart-4/15 border-chart-4/35 text-chart-4'
                    : 'bg-muted/25 border-border/15 text-muted-foreground/60'
                }`}>{st === 'complete' ? '✓' : ''}{k}</span>
              );
            })}
          </span>
          <span className="ml-auto text-[10px] font-semibold text-muted-foreground">{revDone}/4</span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
        </button>
      ) : subjectId && unitId ? (
        <button type="button" onClick={() => setTimerOpen(o => !o)} aria-expanded={timerOpen}
          className="flex-1 min-w-0 h-8 flex items-center gap-1.5 px-2.5 rounded-xl border border-border/15 bg-muted/15 hover:bg-muted/30 active:scale-[0.98] transition text-left">
          <Timer className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[11px] font-bold text-foreground/80">Study timer</span>
          {timerActive && <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse shrink-0" />}
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/60 ml-auto shrink-0 transition-transform duration-200 ${timerOpen ? 'rotate-180' : ''}`} />
        </button>
      ) : <span className="flex-1" />}
      {onOpenPomodoro && !draft.completed && (
        <button type="button" onClick={onOpenPomodoro} aria-label="Start a Pomodoro focus session" title="Pomodoro focus"
          className="shrink-0 w-8 h-8 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-sm active:scale-90 transition-transform">🍅</button>
      )}
    </div>
  );

  const showTimerPanel = !!(subjectId && unitId) && ((!draft.completed && timerOpen) || (timer.topicId === draft.id && timerActive));
  const timerPanel = showTimerPanel ? (
    <PremiumStudyTimer
      timer={timer} actions={timerActions} topicId={draft.id} topicName={draft.name}
      subjectId={subjectId!} unitId={unitId!} subjectName={subjectName || ''} isCompleted={!!draft.completed}
      onSaveTime={(mins, date, note) => addTime(mins, date, note, nowStartTime(mins, date))}
      revisions={draft.revisions} onOpenRevision={() => { navigator.vibrate?.(10); setRevisionOpen(true); }}
    />
  ) : null;

  return (
    <>
    <BottomSheet open={open} onClose={() => { clearTimeout(autoSaveTimer.current); if (draft && JSON.stringify(draft) !== lastSavedRef.current) { onSave(draft); lastSavedRef.current = JSON.stringify(draft); } onClose(); }} zIndex={sheetZIndex ?? 55}>
      {/* ═══════════════════════════════════════════════════
          PREMIUM TOP BAR — Progress + Navigation
         ═══════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-30 -mx-5 px-5 pt-1 pb-2 mb-2"
        style={{ background: 'hsl(var(--glass-bg) / 0.97)', }}>
        {/* Gradient progress bar */}
        {topicIndex != null && totalTopics != null && (
          <div className="absolute top-0 left-5 right-5 h-[3px] rounded-full bg-muted/30 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${subjectColor}, hsl(var(--primary)))` }}
              initial={false}
              animate={{ width: `${((topicIndex + 1) / totalTopics) * 100}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        )}

        {/* Fixed-slot toolbar: every button is ALWAYS rendered at a fixed size, so nothing ever shifts
            (Undo/Redo are disabled instead of hidden, and the save indicator is a badge, not a text label). */}
        <div className="flex items-center gap-1 pt-3">
          {/* Close */}
          <motion.button whileTap={{ scale: 0.88 }} onClick={() => { clearTimeout(autoSaveTimer.current); if (draft && JSON.stringify(draft) !== lastSavedRef.current) { onSave(draft); lastSavedRef.current = JSON.stringify(draft); } onClose(); }}
            className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted/70 transition-all shrink-0 shadow-sm" aria-label="Close" title="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </motion.button>

          {/* Prev */}
          <motion.button whileTap={{ scale: 0.88 }} onClick={() => hasPrev && saveAndNavigate('prev')} disabled={!hasPrev}
            className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center disabled:opacity-25 transition-opacity shrink-0 text-foreground/70" aria-label="Previous topic" title="Previous topic">
            <ChevronLeft className="w-4 h-4" />
          </motion.button>

          {/* Counter */}
          <div className="flex-1 min-w-0 text-center">
            {topicIndex != null && totalTopics != null && (
              <span className="text-sm font-bold text-foreground/70 tracking-wide whitespace-nowrap">
                {topicIndex + 1} <span className="text-muted-foreground/50 font-normal">/</span> <span className="text-muted-foreground/60">{totalTopics}</span>
              </span>
            )}
          </div>

          {/* Next */}
          <motion.button whileTap={{ scale: 0.88 }} onClick={() => hasNext && saveAndNavigate('next')} disabled={!hasNext}
            className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center disabled:opacity-25 transition-opacity shrink-0 text-foreground/70" aria-label="Next topic" title="Next topic">
            <ChevronRight className="w-4 h-4" />
          </motion.button>

          {/* Undo / Redo — always present, disabled when unavailable */}
          <motion.button whileTap={{ scale: 0.88 }} onClick={handleUndoClick} disabled={!canUndo && !hasPendingSave}
            className="w-7 h-8 rounded-full flex items-center justify-center disabled:opacity-25 text-muted-foreground hover:bg-muted/50 transition-opacity shrink-0" aria-label="Undo" title="Undo (Ctrl+Z)">
            <Undo2 className="w-3.5 h-3.5" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.88 }} onClick={handleRedoClick} disabled={!canRedo}
            className="w-7 h-8 rounded-full flex items-center justify-center disabled:opacity-25 text-muted-foreground hover:bg-muted/50 transition-opacity shrink-0" aria-label="Redo" title="Redo (Ctrl+Y)">
            <Redo2 className="w-3.5 h-3.5" />
          </motion.button>

          {/* Delete */}
          <motion.button whileTap={{ scale: 0.88 }} onClick={() => setShowDeleteConfirm(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10 transition-all shrink-0"
            aria-label="Delete topic" title="Delete topic">
            <Trash2 className="w-4 h-4" />
          </motion.button>

          {/* Save & Close — auto-save state shown as a corner badge (no layout impact) */}
          <motion.button whileTap={{ scale: 0.93 }} onClick={() => { clearTimeout(autoSaveTimer.current); if (draft && JSON.stringify(draft) !== lastSavedRef.current) { onSave(draft); lastSavedRef.current = JSON.stringify(draft); } onClose(); }}
            className="relative w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0"
            style={{ boxShadow: '0 4px 14px hsl(var(--primary) / 0.35)' }}
            aria-label="Save & Close" title={autoSaveStatus === 'saving' ? 'Saving…' : autoSaveStatus === 'saved' ? 'Saved — tap to close' : autoSaveStatus === 'error' ? 'Save failed — tap to retry & close' : 'Save & Close'}>
            <Save className="w-4 h-4" />
            <AnimatePresence>
              {autoSaveStatus !== 'idle' && (
                <motion.span key={autoSaveStatus}
                  initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.4 }}
                  className={`absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center pointer-events-none ${
                    autoSaveStatus === 'saved' ? 'bg-secondary text-secondary-foreground' : autoSaveStatus === 'error' ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                  {autoSaveStatus === 'saved' ? <CheckCircle2 className="w-2.5 h-2.5" /> : autoSaveStatus === 'error' ? <AlertTriangle className="w-2.5 h-2.5" /> : <RotateCcw className="w-2 h-2 animate-spin" />}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      <AnimatePresence mode="wait" custom={swipeDirection}>
      <motion.div
        key={topic?.id || 'empty'}
        onTouchStart={onSwipeStart}
        onTouchMove={onSwipeMove}
        onTouchEnd={onSwipeEnd}
        onTouchCancel={onSwipeEnd}
        style={{ x: dragX, opacity: contentOpacity, scale: contentScale }}
        initial={swipeDirection === 'left' ? { x: 250, opacity: 0 } : swipeDirection === 'right' ? { x: -250, opacity: 0 } : { opacity: 1 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        exit={swipeDirection === 'left' ? { x: -250, opacity: 0 } : swipeDirection === 'right' ? { x: 250, opacity: 0 } : { opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 350 }}
        className="space-y-2.5 touch-pan-y"
      >
        {/* ═══════════════════════════════════════════════════
            UNIFIED CONTEXT SHELF — Subject + Unit + Module + Topic
           ═══════════════════════════════════════════════════ */}
        <div onPointerDown={e => e.stopPropagation()}>
          <UnifiedContextShelf
            availableSubjects={availableSubjects}
            selectedSubjectId={selectedSubjectId}
            selectedUnitId={selectedUnitId}
            subjectName={subjectName}
            subjectShortName={subjectShortName}
            unitName={unitName}
            subjectColor={subjectColor}
            draft={draft}
            topic={topic}
            editingName={editingName}
            setEditingName={setEditingName}
            setField={setField}
            onRenameTopic={onRenameTopic}
            currentStatus={currentStatus}
            moduleOpen={moduleOpen}
            setModuleOpen={setModuleOpen}
            existingModules={(() => {
              const modules = new Map<string, number>();
              const selSubj = availableSubjects.find(s => s.id === selectedSubjectId);
              const selUn = selSubj?.units.find(u => u.id === selectedUnitId);
              if (selUn) {
                selUn.subTopics.forEach(t => {
                  if (t.module) modules.set(t.module, (modules.get(t.module) || 0) + 1);
                });
              }
              return modules;
            })()}
            onSubjectChange={(val) => {
              setSelectedSubjectId(val);
              const newSubj = availableSubjects.find(s => s.id === val);
              const firstUnit = newSubj?.units?.[0];
              const newUnitId = firstUnit?.id || '';
              setSelectedUnitId(newUnitId);
              onMoveToSubject?.(val, newUnitId);
              // Auto-navigate to first topic of first unit
              const firstTopic = firstUnit?.subTopics?.[0];
              if (firstTopic && onNavigateToTopic) {
                if (draft && JSON.stringify(draft) !== lastSavedRef.current) { onSave(draft); lastSavedRef.current = JSON.stringify(draft); }
                setTimeout(() => onNavigateToTopic(val, newUnitId, firstTopic.id), 100);
              }
              navigator.vibrate?.(15);
              toast.success(`📂 Moved to ${newSubj?.shortName || 'subject'}`);
            }}
            onUnitChange={(val) => {
              setSelectedUnitId(val);
              onMoveToSubject?.(selectedSubjectId, val);
              // Auto-navigate to first topic of that unit
              const selSubj = availableSubjects.find(s => s.id === selectedSubjectId);
              const selUn = selSubj?.units.find(u => u.id === val);
              const firstTopic = selUn?.subTopics?.[0];
              if (firstTopic && onNavigateToTopic) {
                if (draft && JSON.stringify(draft) !== lastSavedRef.current) { onSave(draft); lastSavedRef.current = JSON.stringify(draft); }
                setTimeout(() => onNavigateToTopic(selectedSubjectId, val, firstTopic.id), 100);
              }
              navigator.vibrate?.(15);
              toast.success(`📁 Moved to ${selUn?.name || 'unit'}`);
            }}
            onNavigateToTopic={(sId, uId, tId) => {
              if (draft && JSON.stringify(draft) !== lastSavedRef.current) { onSave(draft); lastSavedRef.current = JSON.stringify(draft); }
              onNavigateToTopic?.(sId, uId, tId);
            }}
            quickControls={quickControls}
          />
        </div>

        {/* ═══ SESSION — status, dates, time & revision in one compact card ═══ */}
        <CompactStatus
          currentStatus={currentStatus}
          setStatus={setStatus}
          showDatePicker={showDatePicker}
          draft={draft}
          handleCompletedDateChange={handleCompletedDateChange}
          setField={setField}
          unitDone={selUnit?.subTopics.filter(t => t.completed).length || 0}
          unitTotal={selUnit?.subTopics.length || 0}
          canCompleteAndNext={!!hasNext && currentStatus !== 'complete'}
          onCompleteAndNext={() => { pendingNextRef.current = true; setStatus('complete'); }}
          footer={sessionBar}
        />

        {timerPanel}

        {/* ═══ LOG TIME ═══ */}
        <CompactTimeLog draft={draft} addTime={addTime} deleteTimeEntry={deleteTimeEntry} editTimeEntry={editTimeEntry} setField={setField} />

        {/* ═══ RESOURCES — expandable ═══ */}
        <div className="rounded-2xl bg-card/80 border border-border/12 overflow-hidden" style={{ boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)' }}>
          <SectionRow id="resources" icon="🔗" title="Resources" hint={(draft.resourceLinks || [])[0]?.title || 'Links, videos, PDFs'}
            badge={(draft.resourceLinks || []).length ? String((draft.resourceLinks || []).length) : undefined}
            open={openSections.includes('resources')} onToggle={toggleSection}>
            <ResourceManager resources={draft.resourceLinks || []} onChange={(links) => setDraft(d => d ? { ...d, resourceLinks: links } : d)} />
          </SectionRow>
        </div>

        {/* ═══ TAGS — always visible, compact ═══ */}
        <div className="rounded-2xl bg-card/80 border border-border/12 p-3.5" style={{ boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)' }} onPointerDown={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-2">
            <Hash className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Tags</span>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground/60">{(draft.tags || []).length}/8</span>
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            {(draft.tags || []).map((tag, i) => (
              <span key={i} className="text-[11px] pl-2.5 pr-1.5 py-1 rounded-full bg-primary/8 text-primary border border-primary/15 flex items-center gap-1 font-semibold">
                #{tag}
                <button onClick={() => removeTag(i)} aria-label={`Remove tag ${tag}`} className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-destructive/15 hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}
            {(draft.tags || []).length < 8 && (
              <span className="flex items-center gap-1 flex-1 min-w-[130px]">
                <Input placeholder={(draft.tags || []).length === 0 ? 'Add a tag…' : '+ tag'} value={newTag} onChange={e => setNewTag(e.target.value)}
                  className="h-7 text-[11px] flex-1 bg-card border-border/20 rounded-full px-3" onKeyDown={e => e.key === 'Enter' && addTag()} />
                {newTag.trim() && (
                  <button onClick={addTag} aria-label="Add tag" className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-90 transition-transform"><Plus className="w-3.5 h-3.5" /></button>
                )}
              </span>
            )}
          </div>
        </div>

        {/* ═══ NOTES — expandable ═══ */}
        <div className="rounded-2xl bg-card/80 border border-border/12 overflow-hidden" style={{ boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)' }}>
          <SectionRow id="notes" icon="📝" title="Notes" hint={notesPreview || 'Add your own notes'} badge={notesPreview ? '✓' : undefined}
            open={openSections.includes('notes')} onToggle={toggleSection}>
            <MarkdownEditor content={draft.notes || ''} onChange={(md) => setField('notes', md)} height="dynamic-sm" hideHorizontalRule hideCode />
          </SectionRow>
        </div>

        {/* ═══ ATTACHMENTS — always visible, slim upload row ═══ */}
        <TopicAttachments compact attachments={draft.attachments || []} onChange={(atts) => setDraft(d => d ? { ...d, attachments: atts } : d)} />

        {/* ═══ EXAM RELEVANCE + OTHER DETAILS — always visible ═══ */}
        <div className="rounded-2xl bg-card/80 border border-border/12 overflow-hidden" style={{ boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)' }} onPointerDown={e => e.stopPropagation()}>
          <div className="p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">🎯</span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{getExamLabel()} relevance</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {relevances.map(r => {
                const isActive = draft.norcetRelevance === (r === 'None' ? undefined : r);
                return (
                  <motion.button key={r} whileTap={{ scale: 0.92 }} onClick={() => setField('norcetRelevance', r === 'None' ? undefined : r as any)}
                    className={`h-9 rounded-xl text-[11px] font-bold transition-colors ${isActive ? 'bg-primary/12 text-primary border border-primary/25' : 'bg-muted/30 text-muted-foreground border border-border/10'}`}>
                    {r}
                  </motion.button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-border/10 flat-card">
            <MetadataSection draft={draft} setField={setField} availableSubjects={availableSubjects} selectedSubjectId={selectedSubjectId} selectedUnitId={selectedUnitId} alwaysOpen />
          </div>
        </div>

        <div className="h-4" />
      </motion.div>
      </AnimatePresence>
    </BottomSheet>

    {/* Revision window — R1–R4 status + per-round study-time log */}
    <RevisionSheet
      open={open && revisionOpen}
      onClose={() => setRevisionOpen(false)}
      topic={draft}
      onUpdate={(fn) => setDraft(d => d ? { ...d, revisions: fn((d.revisions || {}) as RevisionMap) } : d)}
      subjectName={selSubject?.name || subjectName}
      subjectColor={selSubject?.color}
      unitName={selUnit?.name || unitName}
      unitTopics={selUnit?.subTopics || []}
      subjectTopics={(selSubject?.units || []).flatMap(u => u.subTopics)}
      zIndex={(sheetZIndex ?? 55) + 10}
    />

    {/* Delete confirmation — rendered OUTSIDE BottomSheet to avoid z-index conflict */}
    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent className="">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Topic</AlertDialogTitle>
          <AlertDialogDescription>This will permanently remove this topic and all its data.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setShowDeleteConfirm(false); onDelete(); onClose(); }}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════ */

function PremiumCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-card/80 border border-border/12 p-4 ${className}`}
      style={{ boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)' }}>
      {children}
    </div>
  );
}

function PremiumMiniCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <PremiumCard>
      <Label className="text-[9px] text-muted-foreground font-black uppercase tracking-[0.2em] flex items-center gap-1.5 mb-2">
        {icon} {label}
      </Label>
      {children}
    </PremiumCard>
  );
}

/* ═══════════════════════════════════════════════════════════
   UNIFIED CONTEXT SHELF — Collapsed by default, ultra premium
   ═══════════════════════════════════════════════════════════ */
function UnifiedContextShelf({
  availableSubjects, selectedSubjectId, selectedUnitId, subjectName, subjectShortName, unitName, subjectColor,
  draft, topic, editingName, setEditingName, setField, onRenameTopic, currentStatus,
  moduleOpen, setModuleOpen, existingModules,
  onSubjectChange, onUnitChange, onNavigateToTopic, quickControls,
}: {
  availableSubjects: Subject[];
  selectedSubjectId: string;
  selectedUnitId: string;
  subjectName?: string;
  subjectShortName?: string;
  unitName?: string;
  subjectColor: string;
  draft: SubTopic;
  topic: SubTopic | null;
  editingName: boolean;
  setEditingName: (v: boolean) => void;
  setField: <K extends keyof SubTopic>(k: K, v: SubTopic[K]) => void;
  onRenameTopic?: (name: string) => void;
  currentStatus: TopicStatus;
  moduleOpen: boolean;
  setModuleOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  existingModules: Map<string, number>;
  onSubjectChange: (id: string) => void;
  onUnitChange: (id: string) => void;
  onNavigateToTopic?: (subjectId: string, unitId: string, topicId: string) => void;
  /** Rendered directly under the topic name (difficulty dots, important star) */
  quickControls?: React.ReactNode;
}) {
  const [activeDropdown, setActiveDropdown] = useState<'subject' | 'unit' | 'module' | 'topic' | null>(null);
  const [showCustomModule, setShowCustomModule] = useState(false);
  const [shelfExpanded, setShelfExpanded] = useState(false);

  const toggle = (d: 'subject' | 'unit' | 'module' | 'topic') => setActiveDropdown(p => p === d ? null : d);

  const selSubject = availableSubjects.find(s => s.id === selectedSubjectId);
  const unitsForSubject = selSubject?.units || [];
  const selUnit = unitsForSubject.find(u => u.id === selectedUnitId);
  const unitIdx = unitsForSubject.findIndex(u => u.id === selectedUnitId);
  const displaySubject = selSubject?.shortName || subjectShortName || (subjectName ? shortenSubjectName(subjectName) : 'Subject');
  const displayUnit = selUnit ? `U${unitIdx + 1}: ${selUnit.name}` : (unitName || 'Unit');
  const displayModule = draft.module || 'No module';

  const unitTopics = selUnit?.subTopics || [];

  const statusDot = (t: SubTopic) => {
    const s = t.status || (t.completed ? 'complete' : 'incomplete');
    if (s === 'complete') return 'bg-secondary';
    if (s === 'in_process') return 'bg-chart-4';
    return 'bg-muted-foreground/30';
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const statusLabel = currentStatus === 'in_process' ? 'In Progress' : currentStatus === 'complete' ? 'Complete' : 'Not Started';
    const lines = [`📌 ${getCleanName(draft.name)}`, `Status: ${statusLabel}`, `Difficulty: ${draft.difficulty}`];
    if (draft.topicNumber != null) lines.push(`Topic #${draft.topicNumber}`);
    if (draft.module) lines.push(`Module: ${draft.module}`);
    if (draft.important) lines.push('⭐ Important');
    lines.push(`Time: ${formatStudyTime(draft.timeSpent)}`);
    navigator.clipboard?.writeText(lines.join('\n')).then(() => toast.success('📋 Copied!')).catch(() => toast.error('Copy failed'));
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    setEditingName(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const input = document.getElementById('topic-edit-input');
        if (input) { (input as HTMLInputElement).focus(); (input as HTMLInputElement).select(); }
      }, 50);
    });
  };

  const handleSelectModule = (mod: string) => {
    setField('module', mod);
    setActiveDropdown(null);
    const firstTopic = unitTopics.find(t => t.module === mod);
    if (firstTopic && firstTopic.id !== draft.id && onNavigateToTopic) {
      navigator.vibrate?.(15);
      onNavigateToTopic(selectedSubjectId, selectedUnitId, firstTopic.id);
    }
    toast.success(`📚 Module: "${mod}"`);
  };

  const moduleEntries = Array.from(existingModules.entries());

  // Collapsed context breadcrumb
  const contextBreadcrumb = `${displaySubject} › U${unitIdx + 1}${draft.module ? ` › ${draft.module}` : ''}`;

  return (
    <div className="rounded-2xl bg-card/80 border border-border/12 overflow-hidden relative"
      style={{ boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)', borderLeft: `3px solid ${subjectColor}` }}>
      <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{
        background: `linear-gradient(135deg, ${subjectColor}06, transparent 50%)`,
      }} />

      <div className="relative">
        {/* ── Collapsed Breadcrumb (default) ── */}
        <AnimatePresence initial={false}>
          {!shelfExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <button
                onClick={() => { setShelfExpanded(true); navigator.vibrate?.(8); }}
                className="w-full px-4 py-2.5 flex items-center gap-2 text-left"
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: subjectColor }} />
                <span className="text-[10px] font-bold text-muted-foreground/60 flex-1 truncate">{contextBreadcrumb}</span>
                <span className="text-[8px] font-mono text-muted-foreground/35 shrink-0">
                  {selUnit ? `${selUnit.subTopics.filter(t => t.completed).length}/${selUnit.subTopics.length}` : ''}
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Expanded Rows ── */}
        <AnimatePresence initial={false}>
          {shelfExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
              className="overflow-hidden"
            >
              {/* Collapse button */}
              <div className="px-4 pt-2 pb-0.5 flex justify-end">
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => { setShelfExpanded(false); setActiveDropdown(null); navigator.vibrate?.(8); }}
                  className="text-[8px] font-bold text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors uppercase tracking-widest"
                >
                  Collapse ▲
                </motion.button>
              </div>

              {/* ── Subject ── */}
              <div className="px-4 pb-1">
                <button onClick={() => toggle('subject')} className="flex items-center gap-2 w-full text-left">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: subjectColor }} />
                  <span className="text-[9px] text-muted-foreground/50 font-black uppercase tracking-[0.2em] shrink-0">Subject</span>
                  <span className="text-[12px] font-bold text-foreground flex-1" style={{ wordBreak: 'break-word' }}>{displaySubject}</span>
                </button>
                <AnimatePresence>
                  {activeDropdown === 'subject' && availableSubjects.length > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="flex flex-col gap-1 pt-2 pb-1 max-h-52 overflow-y-auto">
                        {availableSubjects.map(s => {
                          const total = s.units.reduce((a, u) => a + u.subTopics.length, 0);
                          const done = s.units.reduce((a, u) => a + u.subTopics.filter(t => t.completed).length, 0);
                          return (
                            <motion.button key={s.id} whileTap={{ scale: 0.97 }}
                              onClick={(e) => { e.stopPropagation(); onSubjectChange(s.id); setActiveDropdown(null); }}
                              className={`px-3 py-2 rounded-xl text-left text-[11px] font-semibold border transition-all flex items-center gap-2 ${
                                s.id === selectedSubjectId ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-card/40 border-border/10 text-foreground/80 hover:bg-muted/30'
                              }`}>
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                              <span className="flex-1" style={{ wordBreak: 'break-word' }}>{s.name}</span>
                              <span className="text-[8px] font-mono text-muted-foreground/50 shrink-0">{done}/{total}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mx-4 h-[1px] bg-border/8" />

              {/* ── Unit ── */}
              <div className="px-4 py-1">
                <button onClick={() => toggle('unit')} className="flex items-center gap-2 w-full text-left">
                  <span className="text-[9px] text-muted-foreground/50 font-black uppercase tracking-[0.2em] shrink-0 ml-1.5">Unit</span>
                  <span className="text-[11px] font-semibold text-foreground/80 flex-1" style={{ wordBreak: 'break-word' }}>{displayUnit}</span>
                  <span className="text-[8px] font-mono text-muted-foreground/40 shrink-0">{selUnit ? `${selUnit.subTopics.filter(t => t.completed).length}/${selUnit.subTopics.length}` : ''}</span>
                </button>
                <AnimatePresence>
                  {activeDropdown === 'unit' && unitsForSubject.length > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="flex flex-col gap-1 pt-2 pb-1 max-h-60 overflow-y-auto">
                        {unitsForSubject.map((u, i) => (
                          <motion.button key={u.id} whileTap={{ scale: 0.97 }}
                            onClick={(e) => { e.stopPropagation(); onUnitChange(u.id); setActiveDropdown(null); }}
                            className={`px-3 py-2 rounded-xl text-left text-[11px] font-semibold border transition-all flex items-start gap-2 ${
                              u.id === selectedUnitId ? 'bg-accent/10 border-accent/20 text-accent' : 'bg-card/40 border-border/10 text-foreground/80 hover:bg-muted/30'
                            }`}>
                            <span className="text-[10px] font-black text-muted-foreground/60 shrink-0 pt-0.5">U{i + 1}</span>
                            <span className="flex-1" style={{ wordBreak: 'break-word' }}>{u.name}</span>
                            <span className="text-[8px] font-mono text-muted-foreground/40 shrink-0 pt-0.5">({u.subTopics.length})</span>
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mx-4 h-[1px] bg-border/8" />

              {/* ── Module ── */}
              <div className="px-4 py-1">
                <button onClick={() => toggle('module')} className="flex items-center gap-2 w-full text-left">
                  <BookOpen className="w-3 h-3 text-accent/40 shrink-0" />
                  <span className="text-[9px] text-muted-foreground/50 font-black uppercase tracking-[0.2em] shrink-0">Module</span>
                  <span className={`text-[11px] font-semibold flex-1 ${draft.module ? 'text-foreground/80' : 'text-muted-foreground/35 italic'}`} style={{ wordBreak: 'break-word' }}>
                    {displayModule}
                  </span>
                </button>
                <AnimatePresence>
                  {activeDropdown === 'module' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="pt-2 pb-1 space-y-1.5">
                        {draft.module && (
                          <motion.button whileTap={{ scale: 0.97 }}
                            onClick={(e) => { e.stopPropagation(); setField('module', undefined); setActiveDropdown(null); toast.success('Module cleared'); }}
                            className="w-full px-3 py-1.5 rounded-xl text-left text-[10px] font-bold border border-destructive/12 text-destructive/50 hover:bg-destructive/5 transition-all">
                            ✕ Clear module
                          </motion.button>
                        )}
                        {moduleEntries.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {moduleEntries.map(([mod, count]) => (
                              <motion.button key={mod} whileTap={{ scale: 0.97 }}
                                onClick={(e) => { e.stopPropagation(); handleSelectModule(mod); }}
                                className={`px-3 py-2 rounded-xl text-left text-[11px] font-semibold border transition-all flex items-center gap-2 ${
                                  draft.module === mod ? 'bg-accent/12 border-accent/25 text-accent' : 'bg-card/40 border-border/10 text-foreground/80 hover:bg-muted/30'
                                }`}>
                                <span className="flex-1" style={{ wordBreak: 'break-word' }}>📚 {mod}</span>
                                <span className="text-[8px] font-mono text-muted-foreground/40 shrink-0">({count})</span>
                              </motion.button>
                            ))}
                          </div>
                        )}
                        <motion.button whileTap={{ scale: 0.97 }}
                          onClick={() => setShowCustomModule(true)}
                          className="w-full px-3 py-1.5 rounded-xl text-left text-[10px] font-bold border border-dashed border-primary/20 text-primary/60 hover:bg-primary/5 transition-all">
                          + New Module
                        </motion.button>
                        {showCustomModule && (
                          <Input value={draft.module || ''} onChange={e => setField('module', e.target.value || undefined)}
                            className="h-8 text-[10px] bg-background/50 border-border/15 rounded-xl" placeholder="Type module name..." autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') { setActiveDropdown(null); setShowCustomModule(false); }}} />
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mx-4 h-[1px] bg-border/8" />

              {/* ── Topic Picker ── */}
              <div className="px-4 py-1 pb-2">
                <button onClick={() => toggle('topic')} className="flex items-center gap-2 w-full text-left">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${statusDot(draft)}`} />
                  <span className="text-[9px] text-muted-foreground/50 font-black uppercase tracking-[0.2em] shrink-0">Topic</span>
                  <span className="text-[10px] font-medium text-muted-foreground/60 flex-1 truncate">Pick topic…</span>
                  {draft.topicNumber != null && (
                    <span className="text-[8px] font-mono font-bold text-muted-foreground/40 bg-muted/20 px-1.5 py-0.5 rounded shrink-0">#{String(draft.topicNumber).padStart(3, '0')}</span>
                  )}
                </button>
                <AnimatePresence>
                  {activeDropdown === 'topic' && unitTopics.length > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="flex flex-col gap-0.5 pt-2 pb-1 max-h-64 overflow-y-auto">
                        {unitTopics.map((t) => {
                          const isCurrent = t.id === draft.id;
                          return (
                            <motion.button key={t.id} whileTap={{ scale: 0.97 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isCurrent && onNavigateToTopic) {
                                  navigator.vibrate?.(15);
                                  onNavigateToTopic(selectedSubjectId, selectedUnitId, t.id);
                                }
                                setActiveDropdown(null);
                              }}
                              className={`px-3 py-1.5 rounded-xl text-left text-[10px] font-semibold border transition-all flex items-start gap-2 ${
                                isCurrent ? 'bg-primary/10 border-primary/20 text-primary ring-1 ring-primary/15' : 'bg-card/30 border-border/8 text-foreground/75 hover:bg-muted/25'
                              }`}>
                              <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${statusDot(t)}`} />
                              <span className="flex-1" style={{ wordBreak: 'break-word' }}>{t.name}</span>
                              {t.topicNumber != null && (
                                <span className="text-[7px] font-mono text-muted-foreground/35 shrink-0">#{t.topicNumber}</span>
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Topic Name Display (always visible) + Copy/Edit ── */}
        <div className="px-4 pt-1.5 pb-1.5">
          {editingName ? (
            <div className="space-y-2">
              <Input id="topic-edit-input" autoFocus value={draft.name}
                onChange={e => setField('name', e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); setEditingName(false); if (draft.name !== topic?.name) onRenameTopic?.(draft.name); }
                  if (e.key === 'Escape') { e.preventDefault(); setField('name', topic?.name || ''); setEditingName(false); }
                }}
                className="text-sm font-bold bg-muted/20 border-border/30 shadow-none px-3 py-2.5 h-auto focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
                placeholder="Topic name..." />
              <div className="flex items-center gap-2">
                <p className="flex-1 text-[9px] text-muted-foreground flex items-center gap-1">
                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-muted/30 font-mono">Enter</span> save
                  <span className="mx-0.5">·</span>
                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-muted/30 font-mono">Esc</span> cancel
                </p>
                <button type="button" onClick={() => { setEditingName(false); if (draft.name !== topic?.name) onRenameTopic?.(draft.name); }}
                  className="h-7 px-2.5 rounded-lg bg-secondary/12 border border-secondary/25 flex items-center justify-center gap-1 hover:bg-secondary/20 active:scale-95 transition-all text-[10px] font-bold text-secondary">
                  <CheckCircle2 className="w-3 h-3" /> Done
                </button>
                <button type="button" onClick={() => { setField('name', topic?.name || ''); setEditingName(false); }}
                  className="h-7 px-2 rounded-lg bg-destructive/8 border border-destructive/15 flex items-center justify-center hover:bg-destructive/15 active:scale-95 transition-all">
                  <X className="w-3 h-3 text-destructive" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <h2 className="flex-1 text-[15px] font-extrabold text-foreground leading-snug tracking-tight pt-0.5"
                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                {draft.name}
              </h2>
              <div className="flex gap-1 shrink-0">
                <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={handleCopy}
                  className="w-7 h-7 rounded-lg bg-muted/40 border border-border/12 flex items-center justify-center hover:bg-muted/60 transition-all"
                  title="Copy topic info">
                  <ClipboardCopy className="w-3.5 h-3.5 text-muted-foreground" />
                </motion.button>
                <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={handleEdit}
                  className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/15 flex items-center justify-center hover:bg-accent/20 transition-all"
                  title="Edit name (Ctrl+E)">
                  <Pencil className="w-3.5 h-3.5 text-accent" />
                </motion.button>
              </div>
            </div>
          )}
        </div>
        {quickControls}
      </div>
    </div>
  );
}

/* ===== Premium Study Timer with Flip Clock ===== */
function PremiumStudyTimer({ timer, actions, topicId, topicName, subjectId, unitId, subjectName, isCompleted, onSaveTime, revisions, onOpenRevision }: {
  timer: import('../../hooks/useGlobalTimer').GlobalTimerState;
  actions: import('../../hooks/useGlobalTimer').GlobalTimerActions;
  topicId: string; topicName: string; subjectId: string; unitId: string; subjectName: string; isCompleted: boolean;
  onSaveTime?: (minutes: number, date: string, note?: string) => void;
  revisions?: RevisionMap;
  onOpenRevision?: () => void;
}) {
  const { timeLeft, swTime } = useTimerTick();
  const isThisTopic = timer.topicId === topicId;
  const isRunningOther = (timer.running || timer.swRunning) && !isThisTopic;
  const isRunningThis = (timer.running || timer.swRunning) && isThisTopic;
  const [localMode, setLocalMode] = useState<'stopwatch' | 'timer'>('stopwatch');
  const [localPreset, setLocalPreset] = useState(30);
  const [customVal, setCustomVal] = useState(30);

  const fmt = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleStart = () => {
    actions.linkTopic(subjectId, unitId, topicId, topicName, subjectName);
    actions.setAppMode(localMode);
    if (localMode === 'timer') { actions.selectPreset(localPreset); setTimeout(() => actions.toggleTimer(), 50); }
    else { setTimeout(() => actions.toggleSw(), 50); }
  };

  const handlePause = () => {
    if (timer.appMode === 'timer') actions.toggleTimer();
    else actions.toggleSw();
  };

  const handleReset = () => {
    if (timer.appMode === 'timer') actions.resetTimer();
    else actions.resetSw();
  };

  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveFormData, setSaveFormData] = useState({ minutes: 0, date: '', time: '', note: '' });

  const handleSaveStop = () => {
    // Instead of directly calling stopSw, open the save form
    const mins = Math.max(1, Math.round(swTime / 60));
    const now = new Date();
    const dateStr = getLocalDateStr(now);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setSaveFormData({ minutes: mins, date: dateStr, time: timeStr, note: '' });
    setShowSaveForm(true);
  };

  const handleConfirmSave = () => {
    const { minutes, date, note } = saveFormData;
    if (minutes > 0 && onSaveTime) {
      onSaveTime(minutes, date, note || undefined);
      toast.success(`⏱️ ${minutes}m logged to this topic!`);
    }
    // Reset the stopwatch
    actions.resetSw();
    setShowSaveForm(false);
  };

  const handleCancelSave = () => {
    setShowSaveForm(false);
  };

  const display = isThisTopic
    ? (timer.appMode === 'stopwatch' ? fmt(swTime) : fmt(timeLeft))
    : '00:00';

  if (isRunningOther) {
    return (
      <PremiumCard className="border-amber-500/15 bg-amber-500/5">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-amber-500" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-amber-500 font-bold">Timer running for another topic</p>
            <p className="text-xs text-foreground/60 truncate font-medium">{timer.topicName}</p>
          </div>
          <button onClick={() => { actions.resetTimer(); actions.resetSw(); actions.clearLink(); }}
            className="text-[10px] px-3 py-1.5 rounded-xl bg-amber-500/12 text-amber-500 font-bold border border-amber-500/20 hover:bg-amber-500/20 transition-all">Stop & Switch</button>
        </div>
      </PremiumCard>
    );
  }

  const saveFormUI = showSaveForm && (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden">
      <div className="mt-3 p-3 rounded-xl bg-secondary/5 border border-secondary/15 space-y-2.5">
        <div className="flex items-center gap-2">
          <Save className="w-3.5 h-3.5 text-secondary" />
          <span className="text-[11px] font-black text-secondary uppercase tracking-wider">Save Study Time</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider">Duration (min)</Label>
            <Input type="text" inputMode="numeric" pattern="[0-9]*"
              value={saveFormData.minutes === 0 ? '' : String(saveFormData.minutes)}
              onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setSaveFormData(p => ({ ...p, minutes: v === '' ? 0 : parseInt(v, 10) })); }}
              className="h-8 text-xs font-mono font-bold text-center bg-card border-secondary/20 rounded-xl mt-1" />
          </div>
          <div>
            <Label className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider">Date</Label>
            <Input type="date" value={saveFormData.date}
              onChange={e => setSaveFormData(p => ({ ...p, date: e.target.value }))}
              className="h-8 text-[10px] font-mono bg-card border-border/20 rounded-xl mt-1" />
          </div>
        </div>
        <div>
          <Label className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider">Time Started</Label>
          <Input type="time" value={saveFormData.time}
            onChange={e => setSaveFormData(p => ({ ...p, time: e.target.value }))}
            className="h-8 text-[10px] font-mono bg-card border-border/20 rounded-xl mt-1 w-28" />
        </div>
        <div>
          <Label className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider">Note (optional)</Label>
          <Input placeholder="What did you study?" value={saveFormData.note}
            onChange={e => setSaveFormData(p => ({ ...p, note: e.target.value }))}
            className="h-8 text-[10px] bg-card border-border/20 rounded-xl mt-1" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={handleCancelSave} className="flex-1 h-9 text-xs rounded-xl">Cancel</Button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={handleConfirmSave}
            disabled={saveFormData.minutes <= 0}
            className="flex-1 h-9 rounded-xl bg-secondary text-secondary-foreground text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
            style={{ boxShadow: '0 4px 12px hsl(var(--secondary) / 0.3)' }}>
            <Save className="w-3.5 h-3.5" /> Save {saveFormData.minutes > 0 ? `${saveFormData.minutes}m` : ''}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );

  // Completed topics: the old "Revision Timer" is replaced by the Revision launcher (opens the R1–R4 window)
  if (isCompleted && !isRunningThis) {
    const revs = revisions || {};
    const doneCount = REVISION_KEYS.filter(k => revs[k]?.status === 'complete').length;
    return (
      <PremiumCard className="!p-0 overflow-hidden">
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => onOpenRevision?.()}
          className="w-full flex items-center gap-3 p-4 text-left" aria-label="Open revision window">
          <span className="text-xl shrink-0">🔁</span>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12px] font-black text-foreground">Revision</span>
              <span className="text-[9px] text-muted-foreground font-semibold">{doneCount}/4 rounds done</span>
            </div>
            <div className="flex gap-1.5">
              {REVISION_KEYS.map(k => {
                const st = revs[k]?.status || 'pending';
                return (
                  <span key={k} className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${
                    st === 'complete' ? 'bg-secondary/15 border-secondary/35 text-secondary'
                      : st === 'in_process' ? 'bg-chart-4/15 border-chart-4/35 text-chart-4'
                      : 'bg-muted/25 border-border/15 text-muted-foreground/60'
                  }`}>
                    {st === 'complete' ? '✓ ' : ''}{k}
                  </span>
                );
              })}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
        </motion.button>
      </PremiumCard>
    );
  }

  return (
    <PremiumCard>
      <TimerCore localMode={localMode} setLocalMode={setLocalMode} localPreset={localPreset} setLocalPreset={setLocalPreset}
        customVal={customVal} setCustomVal={setCustomVal} display={display} isRunningThis={isRunningThis} isThisTopic={isThisTopic}
        handleStart={handleStart} handlePause={handlePause} handleReset={handleReset} handleSaveStop={handleSaveStop} timer={timer} />
      <AnimatePresence>{saveFormUI}</AnimatePresence>
    </PremiumCard>
  );
}

/* Timer core UI */
function TimerCore({ localMode, setLocalMode, localPreset, setLocalPreset, customVal, setCustomVal, display, isRunningThis, isThisTopic, handleStart, handlePause, handleReset, handleSaveStop, timer }: {
  localMode: 'stopwatch' | 'timer'; setLocalMode: (m: 'stopwatch' | 'timer') => void;
  localPreset: number; setLocalPreset: (n: number) => void;
  customVal: number; setCustomVal: (n: number) => void;
  display: string; isRunningThis: boolean; isThisTopic: boolean;
  handleStart: () => void; handlePause: () => void; handleReset: () => void; handleSaveStop: () => void;
  timer: import('../../hooks/useGlobalTimer').GlobalTimerState;
}) {
  const { swTime } = useTimerTick();
  return (
    <div className="space-y-3" onPointerDown={e => e.stopPropagation()}>
      {/* Header + Mode Toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] flex items-center gap-1.5">
          <Timer className="w-3.5 h-3.5 text-primary" /> Study Timer
        </Label>
        <div className="flex rounded-full border border-border/20 bg-muted/20 p-0.5 gap-0.5">
          <button onClick={() => setLocalMode('stopwatch')}
            className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1 ${
              localMode === 'stopwatch' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            ⏱ Stopwatch
          </button>
          <button onClick={() => setLocalMode('timer')}
            className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1 ${
              localMode === 'timer' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            ⏰ Countdown
          </button>
        </div>
      </div>

      {/* Countdown presets */}
      {localMode === 'timer' && !isRunningThis && (
        <div className="flex gap-1.5 items-center">
          {[30, 60].map(m => (
            <button key={m} onClick={() => { setLocalPreset(m); setCustomVal(m); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                localPreset === m ? 'bg-primary/12 text-primary border-primary/30' : 'bg-card/30 text-foreground/60 border-border/15'
              }`}>
              {m}m
            </button>
          ))}
          <Input type="text" inputMode="numeric" pattern="[0-9]*" value={customVal === 0 ? '' : String(customVal)}
            onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); const n = v === '' ? 0 : parseInt(v, 10); setCustomVal(n); if (n > 0) setLocalPreset(n); }}
            className="w-14 h-9 text-xs font-bold text-center bg-card/30 border-border/15 rounded-xl" />
          <span className="text-[10px] text-muted-foreground font-medium">min</span>
        </div>
      )}

      {/* Flip Clock Display */}
      <FlipClock display={display} />

      {/* Controls */}
      <div className="flex justify-center gap-2.5">
        {isRunningThis && (
          <motion.button whileTap={{ scale: 0.9 }} onClick={handleReset}
            className="w-10 h-10 rounded-xl bg-muted/30 border border-border/15 flex items-center justify-center">
            <RotateCcw className="w-4 h-4 text-muted-foreground" />
          </motion.button>
        )}
        {!isRunningThis && !isThisTopic ? (
          <motion.button whileTap={{ scale: 0.93 }} onClick={handleStart}
            className="h-11 px-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2"
            style={{ boxShadow: '0 4px 16px hsl(var(--primary) / 0.35)' }}>
            <Play className="w-4 h-4" fill="currentColor" /> Start
          </motion.button>
        ) : (
          <motion.button whileTap={{ scale: 0.93 }} onClick={handlePause}
            className="h-11 px-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2"
            style={{ boxShadow: '0 4px 16px hsl(var(--primary) / 0.35)' }}>
            {(timer.running || timer.swRunning) ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" fill="currentColor" /> Resume</>}
          </motion.button>
        )}
        {isThisTopic && swTime >= 10 && !timer.swRunning && !timer.running && (
          <motion.button whileTap={{ scale: 0.93 }} onClick={handleSaveStop}
            className="h-11 px-5 rounded-full bg-secondary text-secondary-foreground text-sm font-bold flex items-center gap-2"
            style={{ boxShadow: '0 4px 16px hsl(var(--secondary) / 0.3)' }}>
            <Save className="w-4 h-4" /> Save {Math.max(1, Math.round(swTime / 60))}m
          </motion.button>
        )}
      </div>
    </div>
  );
}

/* ModuleSection merged into UnifiedContextShelf above */

/* ===== Metadata Section — Star, Category, Topic# — collapsed by default ===== */
function MetadataSection({ draft, setField, availableSubjects, selectedSubjectId, selectedUnitId, alwaysOpen = false }: {
  draft: SubTopic;
  setField: <K extends keyof SubTopic>(k: K, v: SubTopic[K]) => void;
  availableSubjects: Subject[];
  selectedSubjectId: string;
  selectedUnitId: string;
  /** Show the fields directly (no collapsible header) */
  alwaysOpen?: boolean;
}) {
  const [expandedState, setExpanded] = useState(false);
  const expanded = alwaysOpen || expandedState;
  const [customCatInput, setCustomCatInput] = useState('');
  const [managingCats, setManagingCats] = useState(false);
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameCatValue, setRenameCatValue] = useState('');

  const DEFAULT_CATEGORIES = ['Theory', 'Practical', 'Clinical', 'Lab', 'Case Study', 'Important'];

  // Collect all categories from the subject with counts
  const { existingCategories, categoryCounts } = useMemo(() => {
    const cats = new Set<string>();
    const counts = new Map<string, number>();
    DEFAULT_CATEGORIES.forEach(c => cats.add(c));
    const subj = availableSubjects.find(s => s.id === selectedSubjectId);
    subj?.units.forEach(u => u.subTopics.forEach(t => {
      if (t.category) {
        cats.add(t.category);
        counts.set(t.category, (counts.get(t.category) || 0) + 1);
      }
    }));
    return { existingCategories: Array.from(cats), categoryCounts: counts };
  }, [availableSubjects, selectedSubjectId]);

  const hasMeta = draft.rank != null || draft.category || draft.topicNumber != null;
  const summaryParts: string[] = [];
  if (draft.rank) summaryParts.push('★'.repeat(draft.rank));
  if (draft.category) summaryParts.push(draft.category);
  if (draft.topicNumber != null) summaryParts.push(`#${draft.topicNumber}`);

  return (
    <PremiumCard className="!p-0 overflow-hidden">
      {!alwaysOpen && (
      <button onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/10 transition-colors">
        <Trophy className="w-4 h-4 text-chart-4 shrink-0" />
        <span className="text-[11px] font-bold text-foreground flex-1 text-left">Star, Category & Topic #</span>
        {hasMeta && !expanded && (
          <span className="text-[10px] font-bold text-primary/70 bg-primary/8 px-2 py-0.5 rounded-md truncate max-w-[140px]">
            {summaryParts.join(' · ')}
          </span>
        )}
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground/50" />
        </motion.div>
      </button>
      )}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-4 border-t border-border/10 pt-3">
              {/* ⭐ Star Rating */}
              <div>
                <Label className="text-[9px] text-muted-foreground font-black uppercase tracking-[0.2em] flex items-center gap-1 mb-2">
                  <Trophy className="w-3 h-3 text-chart-4" /> Star Rating
                </Label>
                <div className="flex gap-1 justify-start">
                  {([1, 2, 3, 4, 5] as const).map(r => (
                    <motion.button key={r} whileTap={{ scale: 0.8 }}
                      onClick={() => setField('rank', draft.rank === r ? undefined : r)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all"
                      style={{
                        background: draft.rank != null && r <= draft.rank ? 'hsl(var(--chart-4) / 0.15)' : 'hsl(var(--muted) / 0.1)',
                        border: `1.5px solid ${draft.rank != null && r <= draft.rank ? 'hsl(var(--chart-4) / 0.35)' : 'hsl(var(--border) / 0.1)'}`,
                        boxShadow: draft.rank != null && r <= draft.rank ? '0 2px 8px hsl(var(--chart-4) / 0.15)' : 'none',
                      }}>
                      {draft.rank != null && r <= draft.rank ? '★' : '☆'}
                    </motion.button>
                  ))}
                  {draft.rank && (
                    <button onClick={() => setField('rank', undefined)}
                      className="ml-1 text-[9px] text-destructive/60 hover:text-destructive font-bold px-2 py-1 rounded-lg hover:bg-destructive/8 transition-colors">
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* 📂 Category — with CRUD */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[9px] text-muted-foreground font-black uppercase tracking-[0.2em] flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-accent" /> Category
                  </Label>
                  <button onClick={() => { setManagingCats(p => !p); setRenamingCat(null); }}
                    className={`text-[8px] font-bold px-2 py-1 rounded-lg transition-colors uppercase tracking-wider ${
                      managingCats ? 'bg-primary/12 text-primary border border-primary/20' : 'text-primary/60 hover:text-primary hover:bg-primary/8'
                    }`}>
                    {managingCats ? '✓ Done' : '⚙ Manage'}
                  </button>
                </div>

                {/* Current category - prominent display */}
                {draft.category && (
                  <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl border border-accent/25 bg-accent/8">
                    <span className="text-xs">📌</span>
                    <span className="text-[12px] font-bold text-accent-foreground flex-1">{draft.category}</span>
                    <button onClick={() => setField('category', undefined)}
                      className="text-[9px] text-destructive/50 hover:text-destructive font-bold px-2 py-0.5 rounded-lg hover:bg-destructive/8 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Manage mode - rename/delete */}
                <AnimatePresence>
                  {managingCats && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-2">
                      <div className="p-2.5 rounded-xl bg-muted/10 border border-border/10 space-y-1">
                        <span className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-wider">All categories in subject</span>
                        {existingCategories.map(cat => {
                          const count = categoryCounts.get(cat) || 0;
                          const isDefault = DEFAULT_CATEGORIES.includes(cat);
                          if (renamingCat === cat) {
                            return (
                              <div key={cat} className="flex items-center gap-1.5">
                                <Input value={renameCatValue} onChange={e => setRenameCatValue(e.target.value)}
                                  className="text-[10px] h-7 flex-1 bg-card border-border/20 rounded-lg" autoFocus
                                  onKeyDown={e => { if (e.key === 'Enter' && renameCatValue.trim()) { setRenamingCat(null); if (draft.category === cat) setField('category', renameCatValue.trim()); toast.success(`Renamed "${cat}" → "${renameCatValue.trim()}"`); } if (e.key === 'Escape') setRenamingCat(null); }} />
                                <button onClick={() => { if (renameCatValue.trim()) { setRenamingCat(null); if (draft.category === cat) setField('category', renameCatValue.trim()); toast.success(`Renamed "${cat}" → "${renameCatValue.trim()}"`); }}}
                                  className="text-[9px] font-bold text-secondary px-1.5 py-0.5 rounded hover:bg-secondary/10">Save</button>
                                <button onClick={() => setRenamingCat(null)} className="text-[9px] text-muted-foreground px-1">Cancel</button>
                              </div>
                            );
                          }
                          return (
                            <div key={cat} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-card/30 transition-colors group">
                              <span className="text-[10px] font-semibold text-foreground/70 flex-1">{cat}</span>
                              {count > 0 && <span className="text-[8px] font-mono text-muted-foreground/40 bg-muted/20 px-1.5 rounded">{count}</span>}
                              <button onClick={() => { setRenamingCat(cat); setRenameCatValue(cat); }}
                                className="opacity-0 group-hover:opacity-100 text-[8px] font-bold text-primary/60 hover:text-primary px-1 py-0.5 rounded hover:bg-primary/8 transition-all">
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                              {!isDefault && (
                                <button onClick={() => { if (draft.category === cat) setField('category', undefined); toast.success(`Removed "${cat}"`); }}
                                  className="opacity-0 group-hover:opacity-100 text-[8px] font-bold text-destructive/50 hover:text-destructive px-1 py-0.5 rounded hover:bg-destructive/8 transition-all">
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Category selection pills */}
                {!managingCats && (
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {existingCategories.map(cat => {
                      const isActive = draft.category === cat;
                      const count = categoryCounts.get(cat) || 0;
                      const isImportant = cat === 'Important';
                      return (
                        <motion.button key={cat} whileTap={{ scale: 0.9 }}
                          onClick={() => setField('category', isActive ? undefined : cat)}
                          className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-all flex items-center gap-1 ${
                            isActive
                              ? isImportant
                                ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 ring-1 ring-amber-500/20 shadow-sm'
                                : 'bg-accent/15 border-accent/30 text-accent-foreground ring-1 ring-accent/20 shadow-sm'
                              : 'bg-card/40 border-border/15 text-foreground/60 hover:bg-card/60 hover:text-foreground'
                          }`}>
                          {isImportant && '🔥 '}{cat}
                          {count > 0 && <span className={`text-[7px] font-mono px-1 rounded ${isActive ? 'text-inherit/60' : 'text-muted-foreground/40 bg-muted/20'}`}>{count}</span>}
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {/* Add custom category */}
                <div className="flex gap-1.5">
                  <Input
                    placeholder="Add custom category..."
                    value={customCatInput}
                    onChange={e => setCustomCatInput(e.target.value)}
                    className="text-[10px] h-8 flex-1 bg-card border-border/20 rounded-xl"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customCatInput.trim()) {
                        setField('category', customCatInput.trim());
                        setCustomCatInput('');
                      }
                    }}
                  />
                  <Button size="sm" variant="outline" disabled={!customCatInput.trim()}
                    onClick={() => { setField('category', customCatInput.trim()); setCustomCatInput(''); }}
                    className="text-[10px] h-8 px-3 gap-1 font-bold rounded-xl">
                    <Plus className="w-3 h-3" /> Set
                  </Button>
                </div>
              </div>

              {/* # Topic Number */}
              <div>
                <Label className="text-[9px] text-muted-foreground font-black uppercase tracking-[0.2em] flex items-center gap-1 mb-2">
                  <Hash className="w-3 h-3 text-primary" /> Topic Number
                </Label>
                <div className="flex items-center gap-1.5">
                  <motion.button whileTap={{ scale: 0.8 }}
                    onClick={() => setField('topicNumber', Math.max(0, (draft.topicNumber || 0) - 1))}
                    className="w-9 h-9 rounded-xl bg-muted/20 border border-border/15 flex items-center justify-center hover:bg-muted/40 transition-all">
                    <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                  </motion.button>
                  <span className="text-lg font-black font-mono text-foreground w-12 text-center">
                    {draft.topicNumber ?? '—'}
                  </span>
                  <motion.button whileTap={{ scale: 0.8 }}
                    onClick={() => setField('topicNumber', (draft.topicNumber || 0) + 1)}
                    className="w-9 h-9 rounded-xl bg-muted/20 border border-border/15 flex items-center justify-center hover:bg-muted/40 transition-all">
                    <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                  </motion.button>
                  {draft.topicNumber != null && (
                    <button onClick={() => setField('topicNumber', undefined)}
                      className="ml-2 text-[9px] text-destructive/60 hover:text-destructive font-bold px-2 py-1 rounded-lg hover:bg-destructive/8 transition-colors">
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* 🕐 Last Edited */}
              {(draft.completedDate || draft.lastReviewedDate) && (
                <div className="pt-2 border-t border-border/8">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-muted-foreground/40" />
                    <span className="text-[9px] text-muted-foreground/40 font-semibold">
                      Last modified: {formatDateRelative(draft.lastReviewedDate || draft.completedDate || '')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PremiumCard>
  );
}
