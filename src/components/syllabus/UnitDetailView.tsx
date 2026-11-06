import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import Collapse from '../shared/Collapse';
import {
  ArrowLeft, Search, ChevronDown, ChevronRight, ChevronLeft, MoreVertical,
  Star, CheckCircle2, Circle, Clock, Plus, Maximize2,
  Minimize2, Folder, FolderOpen, Shield, X, Trash2, Pencil,
  Undo2, Redo2, ArrowUp, ArrowDown, GripVertical, Layers
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@project/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { zoomModifier } from '../../platform/zoom';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatUnitNumber } from '../../lib/fancyDigits';
import { formatUnitSyllabus, formatUnitHeader, formatModuleSyllabus, formatSubModuleSyllabus, formatTopicDetail } from '../../lib/syllabusFormatter';
import { formatDate, formatStudyTime, getCleanName, getDisplayTopicName } from '../../lib/utils';
import type { Subject, SubTopic, Unit, TopicStatus } from '../../types';
import AddTopicInline from './AddTopicInline';
import DeepSearchToggle from '../shared/DeepSearchToggle';
import StatusFilterPills, { type StatusFilter } from '../shared/StatusFilterPills';
import { Copy, Sparkles } from 'lucide-react';
import SmartCopyButton from '../shared/SmartCopyButton';
import SubjectSwitcher from './SubjectSwitcher';
import StudyTimeLogger from './StudyTimeLogger';
import BulkUnitEditor from './BulkUnitEditor';
import HighlightText from '../shared/HighlightText';
import { topicMatchesSearch } from '../../lib/syllabusFilter';

type DifficultyFilter = 'all' | 'Easy' | 'Medium' | 'Hard';

interface SubModuleGroup { name: string; topics: SubTopic[]; }
interface ModuleGroup { name: string; directTopics: SubTopic[]; subModules: SubModuleGroup[]; allTopics: SubTopic[]; }

interface Props {
  subject: Subject;
  unit: Unit;
  unitIndex: number;
  onBack: () => void;
  onToggleTopic: (topicId: string) => void;
  onToggleImportant: (topicId: string) => void;
  onCycleStatus?: (topicId: string, newStatus: TopicStatus) => void;
  onCycleDifficulty?: (topicId: string, newDifficulty: 'Easy' | 'Medium' | 'Hard') => void;
  onOpenTopicDetail: (topic: SubTopic) => void;
  onAddTopic: (topic: SubTopic) => void;
  onBulkToggle: () => void;
  onDeleteUnit?: () => void;
  onRenameUnit?: (name: string) => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onReorderTopics?: (topicId: string, newIndex: number) => void;
  onNavigateToUnit?: (unitIndex: number) => void;
  onOpenReport?: (subjectId: string, unitId: string) => void;
  onOpenPomodoro?: (subjectId: string, unitId?: string, topicId?: string) => void;
  onLogStudyTime?: (minutes: number, date: string, note: string) => void;
  onDeleteTopic?: (topicId: string) => void;
  onRenumberSubject?: () => void;
  allSubjects?: Subject[];
  onSwitchSubject?: (subjectId: string) => void;
  onUpdateUnit?: (updatedUnit: Unit) => void;
}

const formatTimeSpent = formatStudyTime;

export default function UnitDetailView({
  subject, unit, unitIndex, onBack,
  onToggleTopic, onToggleImportant, onCycleStatus, onCycleDifficulty,
  onOpenTopicDetail, onAddTopic, onBulkToggle, onDeleteUnit, onRenameUnit,
  onNavigatePrev, onNavigateNext, hasPrev, hasNext,
  canUndo, canRedo, onUndo, onRedo, onReorderTopics, onNavigateToUnit, onOpenReport, onOpenPomodoro,
  allSubjects, onSwitchSubject, onLogStudyTime, onDeleteTopic, onUpdateUnit, onRenumberSubject,
}: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [diffFilter, setDiffFilter] = useState<DifficultyFilter>('all');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem(`udv-folders-${unit.id}`);
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set(['__first__']);
  });
  const [expandAll, setExpandAll] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [addTopicOpen, setAddTopicOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(unit.name);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [deepSearch, setDeepSearch] = useState(false);
  const [studyLoggerOpen, setStudyLoggerOpen] = useState(false);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [deleteTopicConfirmOpen, setDeleteTopicConfirmOpen] = useState(false);
  const [pendingDeleteTopicId, setPendingDeleteTopicId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [focusedTopicIdx, setFocusedTopicIdx] = useState(-1);
  const [starFilter, setStarFilter] = useState<number | 'any' | 'none'>('any');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [advFiltersOpen, setAdvFiltersOpen] = useState(false);

  // Unit copy step (for dropdown menu only)
  const [unitCopyStep, setUnitCopyStep] = useState<1 | 2>(1);
  const [showModuleTime, setShowModuleTime] = useState(false);
  const unitCopyTimer = useRef<ReturnType<typeof setTimeout>>();

  // Auto-reset unit copy after 4s
  useEffect(() => {
    if (unitCopyStep !== 1) {
      clearTimeout(unitCopyTimer.current);
      unitCopyTimer.current = setTimeout(() => setUnitCopyStep(1), 4000);
    }
    return () => clearTimeout(unitCopyTimer.current);
  }, [unitCopyStep]);

  // Persist last active unit for this subject so resuming jumps to last noted activity
  useEffect(() => {
    try {
      localStorage.setItem('last-active-unit-' + subject.id, unit.id);
      sessionStorage.setItem('last-active-unit-' + subject.id, unit.id);
    } catch {}
  }, [subject.id, unit.id]);

  const unitStripRef = useRef<HTMLDivElement>(null);
  const activeUnitRef = useRef<HTMLButtonElement | null>(null);

  const dragX = useMotionValue(0);
  const cardOpacity = useTransform(dragX, [-150, 0, 150], [0.5, 1, 0.5]);
  const cardScale = useTransform(dragX, [-150, 0, 150], [0.95, 1, 0.95]);
  const swipeThreshold = 80;
  const isSwiping = useRef(false);

  const handleSwipeDragEnd = useCallback((_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    const swipe = Math.abs(offset.x) > swipeThreshold || Math.abs(velocity.x) > 500;
    if (swipe) {
      if (offset.x > 0 && hasPrev) {
        setSwipeDirection('right');
        navigator.vibrate?.(20);
        // Use unified navigation: prefer onNavigateToUnit for consistency with strip
        setTimeout(() => {
          if (onNavigateToUnit) onNavigateToUnit(unitIndex - 1);
          else onNavigatePrev?.();
          setSwipeDirection(null);
        }, 150);
      } else if (offset.x < 0 && hasNext) {
        setSwipeDirection('left');
        navigator.vibrate?.(20);
        setTimeout(() => {
          if (onNavigateToUnit) onNavigateToUnit(unitIndex + 1);
          else onNavigateNext?.();
          setSwipeDirection(null);
        }, 150);
      }
    }
    isSwiping.current = false;
  }, [hasPrev, hasNext, onNavigatePrev, onNavigateNext, onNavigateToUnit, unitIndex]);

  const stats = useMemo(() => {
    const all = unit.subTopics;
    const completed = all.filter(t => t.completed).length;
    const pending = all.filter(t => t.status === 'in_process').length;
    const incomplete = all.filter(t => !t.completed && t.status !== 'in_process').length;
    const starred = all.filter(t => t.important).length;
    const total = all.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const topicTime = all.reduce((a, t) => a + (t.timeSpent || 0), 0);
    const totalTime = topicTime + (unit.timeSpent || 0);
    const easy = all.filter(t => t.difficulty === 'Easy').length;
    const med = all.filter(t => t.difficulty === 'Medium').length;
    const hard = all.filter(t => t.difficulty === 'Hard').length;
    return { completed, pending, starred, total, pct, remaining: incomplete, inProcess: pending, totalTime, easy, med, hard };
  }, [unit.subTopics]);

  const hasMostImportant = stats.starred >= 3;



  const cleanUnitName = useMemo(() => {
    const match = unit.name.match(/^Unit\s+\d+\s*:\s*(.+)/i);
    return match ? match[1].trim() : unit.name;
  }, [unit.name]);

  const filtered = useMemo(() => {
    let topics = unit.subTopics;
    if (search) {
      // same matcher as every other search in the app (multi-word, accent-insensitive, cached)
      topics = topics.filter(t => topicMatchesSearch(t, unit.name, '', search, deepSearch));
    }
    // Status filter
    switch (filter) {
      case 'complete': topics = topics.filter(t => t.completed); break;
      case 'in_process': topics = topics.filter(t => t.status === 'in_process'); break;
      case 'incomplete': topics = topics.filter(t => !t.completed && t.status !== 'in_process'); break;
      case 'important': topics = topics.filter(t => t.important); break;
      case 'focus': topics = topics.filter(t => t.important && !t.completed); break;
    }
    // Difficulty filter
    if (diffFilter !== 'all') {
      topics = topics.filter(t => t.difficulty === diffFilter);
    }
    // Star rating filter
    if (starFilter !== 'any') {
      if (starFilter === 'none') {
        topics = topics.filter(t => !t.rank);
      } else {
        topics = topics.filter(t => t.rank === starFilter);
      }
    }
    // Category filter
    if (catFilter !== 'all') {
      if (catFilter === '__none__') {
        topics = topics.filter(t => !t.category);
      } else {
        topics = topics.filter(t => t.category === catFilter);
      }
    }
    return topics;
  }, [unit.subTopics, search, filter, diffFilter, starFilter, catFilter]);

  // Build interleaved module groups that preserve the original topic order.
  // Ungrouped topics between module groups become separate segments so that
  // nested/folder topics appear in their correct hierarchical position.
  const moduleGroups = useMemo(() => {
    const groups: ModuleGroup[] = [];
    const moduleGroupMap = new Map<string, ModuleGroup>();
    let currentUngrouped: ModuleGroup | null = null;
    let ungroupedIdx = 0;

    filtered.forEach(t => {
      if (!t.module) {
        // Ungrouped topic — add to current ungrouped segment (or start a new one)
        if (!currentUngrouped) {
          currentUngrouped = { name: `__ungrouped__${ungroupedIdx++}`, directTopics: [], subModules: [], allTopics: [] };
          groups.push(currentUngrouped);
        }
        currentUngrouped.allTopics.push(t);
        currentUngrouped.directTopics.push(t);
      } else {
        // Module topic — end any current ungrouped run
        currentUngrouped = null;

        let group = moduleGroupMap.get(t.module);
        if (!group) {
          group = { name: t.module, directTopics: [], subModules: [], allTopics: [] };
          moduleGroupMap.set(t.module, group);
          groups.push(group);
        }
        group.allTopics.push(t);
        if (t.subModule) {
          let sm = group.subModules.find(s => s.name === t.subModule);
          if (!sm) { sm = { name: t.subModule!, topics: [] }; group.subModules.push(sm); }
          sm.topics.push(t);
        } else {
          group.directTopics.push(t);
        }
      }
    });
    return groups;
  }, [filtered]);

  const hasModules = moduleGroups.some(g => !g.name.startsWith('__ungrouped__'));
  // While a search is active only folders that contain results exist (see `filtered`) and all of them are opened
  const isSearching = search.trim().length > 0;

  // Star rating counts from unfiltered unit topics
  const starCounts = useMemo(() => {
    const counts: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, none: 0 };
    unit.subTopics.forEach(t => {
      if (t.rank) counts[String(t.rank)]++;
      else counts.none++;
    });
    return counts;
  }, [unit.subTopics]);

  // Category list from unfiltered unit topics
  const unitCategories = useMemo(() => {
    const map = new Map<string, number>();
    let noCategory = 0;
    unit.subTopics.forEach(t => {
      if (t.category) map.set(t.category, (map.get(t.category) || 0) + 1);
      else noCategory++;
    });
    return { categories: Array.from(map.entries()).sort((a, b) => b[1] - a[1]), noCategory };
  }, [unit.subTopics]);

  // Active advanced filter count
  const advFilterCount = (starFilter !== 'any' ? 1 : 0) + (catFilter !== 'all' ? 1 : 0);
  const anyFilterActive = filter !== 'all' || diffFilter !== 'all' || starFilter !== 'any' || catFilter !== 'all';

  // Per-module time breakdown (from unfiltered data)
  const moduleTimeMap = useMemo(() => {
    const map = new Map<string, { time: number; inProcess: number; done: number; total: number }>();
    unit.subTopics.forEach(t => {
      const key = t.module || '__ungrouped__';
      const entry = map.get(key) || { time: 0, inProcess: 0, done: 0, total: 0 };
      entry.time += t.timeSpent || 0;
      entry.total++;
      if (t.completed) entry.done++;
      if (t.status === 'in_process') entry.inProcess++;
      map.set(key, entry);
    });
    return map;
  }, [unit.subTopics]);

  const toggleFolder = useCallback((key: string) => {
    setExpandedFolders(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  const handleExpandAll = useCallback(() => {
    if (expandAll) { setExpandedFolders(new Set()); setExpandAll(false); }
    else {
      const allKeys = new Set<string>();
      moduleGroups.forEach(g => { allKeys.add(g.name); g.subModules.forEach(sm => allKeys.add(`${g.name}::${sm.name}`)); });
      setExpandedFolders(allKeys); setExpandAll(true);
    }
  }, [expandAll, moduleGroups]);

  useEffect(() => {
    if (moduleGroups.length > 0 && expandedFolders.has('__first__')) setExpandedFolders(new Set([moduleGroups[0].name]));
  }, [moduleGroups]);

  // Persist folder open/close state
  useEffect(() => {
    if (!expandedFolders.has('__first__')) {
      try { sessionStorage.setItem(`udv-folders-${unit.id}`, JSON.stringify([...expandedFolders])); } catch {}
    }
  }, [expandedFolders, unit.id]);

  // Auto-scroll active unit into view — reliable centering
  // Uses container.scrollTo (not scrollIntoView) to avoid scrolling the entire page
  const isInitialMount = useRef(true);
  const scrollAttemptRef = useRef(0);

  useEffect(() => {
    const isFirst = isInitialMount.current;
    isInitialMount.current = false;
    scrollAttemptRef.current++;
    const currentAttempt = scrollAttemptRef.current;

    const scrollToActive = (smooth: boolean) => {
      const container = unitStripRef.current;
      if (!container) return;
      // Find the active button by data attribute (more reliable than ref across re-renders)
      const el = container.querySelector<HTMLElement>(`[data-unit-active="true"]`);
      if (!el) return;
      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const targetScroll = container.scrollLeft + (elRect.left - containerRect.left) - (containerRect.width / 2) + (elRect.width / 2);
      container.scrollTo({ left: Math.max(0, targetScroll), behavior: smooth ? 'smooth' : 'instant' });
    };

    if (isFirst) {
      // Initial mount: instant scroll after a short frame wait
      requestAnimationFrame(() => {
        if (currentAttempt !== scrollAttemptRef.current) return;
        scrollToActive(false);
      });
    } else {
      // Navigation: wait for swipe animation + React re-render, then smooth scroll
      const timer = setTimeout(() => {
        if (currentAttempt !== scrollAttemptRef.current) return;
        scrollToActive(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [unitIndex, unit.id]);

  const handleReorderTopic = useCallback((topicId: string, direction: 'up' | 'down') => {
    if (!onReorderTopics) return;
    const allTopics = unit.subTopics;
    const topic = allTopics.find(t => t.id === topicId);
    if (!topic) return;
    // Constrain movement within the same module+subModule group
    const groupTopics = allTopics.filter(t =>
      (t.module || '') === (topic.module || '') &&
      (t.subModule || '') === (topic.subModule || '')
    );
    const posInGroup = groupTopics.findIndex(t => t.id === topicId);
    if (posInGroup < 0) return;
    if (direction === 'up' && posInGroup === 0) return;
    if (direction === 'down' && posInGroup === groupTopics.length - 1) return;
    const targetTopic = direction === 'up' ? groupTopics[posInGroup - 1] : groupTopics[posInGroup + 1];
    if (!targetTopic) return;
    const targetIdx = allTopics.findIndex(t => t.id === targetTopic.id);
    if (targetIdx < 0) return;
    onReorderTopics(topicId, targetIdx);
    navigator.vibrate?.([10, 30, 10]);
  }, [unit.subTopics, onReorderTopics]);

  // Drag-to-reorder sensors (long-press 400ms)
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 400, tolerance: 8 } })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderTopics) return;
    const newIdx = unit.subTopics.findIndex(t => t.id === over.id);
    if (newIdx >= 0) {
      onReorderTopics(active.id as string, newIdx);
      navigator.vibrate?.([15, 30, 15]);
    }
  }, [unit.subTopics, onReorderTopics]);

  const handleDuplicateTopic = useCallback((topicId: string) => {
    const topic = unit.subTopics.find(t => t.id === topicId);
    if (!topic) return;
    const clone: SubTopic = {
      ...topic,
      id: `${topic.id}-dup-${Date.now()}`,
      name: `${topic.name} (Copy)`,
      completed: false,
      status: 'incomplete' as TopicStatus,
      completedDate: undefined,
      completedTime: undefined,
      timeSpent: 0,
      timeEntries: [],
    };
    onAddTopic(clone);
    navigator.vibrate?.([15, 30, 15]);
    toast.success('📄 Topic duplicated');
  }, [unit.subTopics, onAddTopic]);

  const handleDeleteTopic = useCallback((topicId: string) => {
    if (!onDeleteTopic) return;
    setPendingDeleteTopicId(topicId);
    setDeleteTopicConfirmOpen(true);
  }, [onDeleteTopic]);

  const confirmDeleteTopic = useCallback(() => {
    if (!onDeleteTopic || !pendingDeleteTopicId) return;
    onDeleteTopic(pendingDeleteTopicId);
    toast('🗑️ Topic deleted', {
      action: onUndo ? { label: 'Undo', onClick: () => onUndo() } : undefined,
      duration: 5000,
    });
    setDeleteTopicConfirmOpen(false);
    setPendingDeleteTopicId(null);
  }, [onDeleteTopic, onUndo, pendingDeleteTopicId]);

  const cycleStatus = useCallback((topic: SubTopic) => {
    if (!onCycleStatus) { onToggleTopic(topic.id); return; }
    const currentStatus: TopicStatus = topic.status || (topic.completed ? 'complete' : 'incomplete');
    const nextMap: Record<string, TopicStatus> = { incomplete: 'in_process', in_process: 'complete', complete: 'incomplete' };
    const next = nextMap[currentStatus] || 'incomplete';
    navigator.vibrate?.(next === 'complete' ? [30, 50, 30] : 30);
    onCycleStatus(topic.id, next);
    const statusToast: Record<string, string> = { in_process: '⏳ In Progress', complete: '✅ Done!', incomplete: '↺ Reset' };
    toast(statusToast[next] || '', { duration: 1200 });
  }, [onCycleStatus, onToggleTopic]);

  const cycleDifficulty = useCallback((topic: SubTopic) => {
    if (!onCycleDifficulty) return;
    const order: ('Easy' | 'Medium' | 'Hard')[] = ['Easy', 'Medium', 'Hard'];
    const idx = order.indexOf(topic.difficulty as any);
    const next = order[(idx + 1) % 3];
    navigator.vibrate?.(15);
    onCycleDifficulty(topic.id, next);
    const emoji = next === 'Easy' ? '🟢' : next === 'Medium' ? '🟡' : '🔴';
    toast(`${emoji} Marked ${next}`, { duration: 1200 });
  }, [onCycleDifficulty]);

  // Keyboard shortcuts: ↑↓ navigate, Space toggle status
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const topics = filtered;
      if (topics.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedTopicIdx(prev => Math.min(prev + 1, topics.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedTopicIdx(prev => Math.max(prev - 1, 0));
      } else if (e.key === ' ' && focusedTopicIdx >= 0 && focusedTopicIdx < topics.length) {
        e.preventDefault();
        cycleStatus(topics[focusedTopicIdx]);
      } else if (e.key === 'Enter' && focusedTopicIdx >= 0 && focusedTopicIdx < topics.length) {
        e.preventDefault();
        onOpenTopicDetail(topics[focusedTopicIdx]);
      } else if (e.key === 'Escape') {
        setFocusedTopicIdx(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filtered, focusedTopicIdx, cycleStatus, onOpenTopicDetail]);

  const filterCounts = useMemo((): Partial<Record<StatusFilter, number>> => ({
    all: unit.subTopics.length,
    complete: unit.subTopics.filter(t => t.completed).length,
    in_process: unit.subTopics.filter(t => t.status === 'in_process').length,
    incomplete: unit.subTopics.filter(t => !t.completed && t.status !== 'in_process').length,
    important: unit.subTopics.filter(t => t.important).length,
    focus: unit.subTopics.filter(t => t.important && !t.completed).length,
  }), [unit.subTopics]);

  const handleSaveRename = () => {
    if (editName.trim() && onRenameUnit) {
      onRenameUnit(editName.trim());
      setEditingName(false);
      toast.success('Unit renamed');
    }
  };

  const handleStatPillClick = useCallback((type: StatusFilter) => {
    navigator.vibrate?.(15);
    setFilter(f => f === type ? 'all' : type);
  }, []);

  const handleDiffClick = useCallback((d: DifficultyFilter) => {
    navigator.vibrate?.(15);
    setDiffFilter(prev => prev === d ? 'all' : d);
  }, []);

  // Global sequential topic numbering — computed dynamically from current order
  // Always computed regardless of showTopicNumbers — display layer decides visibility
  // Depend on topic ID list so any add/delete/reorder triggers recomputation
  const topicIdKey = useMemo(() => subject.units.flatMap(u => u.subTopics.map(t => t.id)).join(','), [subject.units]);
  const globalTopicMap = useMemo(() => {
    const map = new Map<string, number>();
    let counter = 0;
    for (const u of subject.units) {
      for (const t of u.subTopics) {
        counter++;
        map.set(t.id, counter);
      }
    }
    return map;
  }, [subject, topicIdKey]);

  // Hierarchical topic number map based on ACTUAL position in unit.subTopics
  // Groups by module → subModule, numbers within each group: unitIdx.moduleIdx.positionInGroup
  // Auto-updates when topics are reordered — depends on topicIdKey for reliable recomputation
  const unitTopicIdKey = useMemo(() => unit.subTopics.map(t => t.id).join(','), [unit.subTopics]);
  const hierarchicalNumMap = useMemo(() => {
    const map = new Map<string, string>();
    const uIdx = unitIndex + 1;
    // Build module/subModule groups from unfiltered topics to get stable numbering
    const moduleOrder: string[] = [];
    const moduleMap = new Map<string, { direct: SubTopic[]; subModules: Map<string, SubTopic[]> }>();
    unit.subTopics.forEach(t => {
      const modKey = t.module || '__ungrouped__';
      if (!moduleMap.has(modKey)) {
        moduleMap.set(modKey, { direct: [], subModules: new Map() });
        moduleOrder.push(modKey);
      }
      const mod = moduleMap.get(modKey)!;
      if (t.subModule) {
        if (!mod.subModules.has(t.subModule)) mod.subModules.set(t.subModule, []);
        mod.subModules.get(t.subModule)!.push(t);
      } else {
        mod.direct.push(t);
      }
    });

    const hasModulesReal = moduleOrder.some(k => k !== '__ungrouped__');

    if (!hasModulesReal) {
      // No modules — simple unitIdx.topicIdx
      unit.subTopics.forEach((t, i) => {
        map.set(t.id, `${uIdx}.${i + 1}`);
      });
    } else {
      let moduleCounter = 0;
      let ungroupedCounter = 0;
      moduleOrder.forEach(modKey => {
        if (modKey === '__ungrouped__') {
          // Ungrouped topics get flat numbers
          const mod = moduleMap.get(modKey)!;
          mod.direct.forEach(t => {
            ungroupedCounter++;
            map.set(t.id, `${uIdx}.${ungroupedCounter}`);
          });
          return;
        }
        moduleCounter++;
        const mod = moduleMap.get(modKey)!;
        let directCounter = 0;
        // SubModule topics — unitIdx.moduleIdx.subModuleIdx.topicInSubModule
        let subModuleCounter = 0;
        mod.subModules.forEach(smTopics => {
          subModuleCounter++;
          smTopics.forEach((t, tIdx) => {
            map.set(t.id, `${uIdx}.${moduleCounter}.${subModuleCounter}.${tIdx + 1}`);
          });
        });
        // Direct topics in module (no submodule) — unitIdx.moduleIdx.topicIdx
        mod.direct.forEach(t => {
          directCounter++;
          map.set(t.id, `${uIdx}.${moduleCounter}.${directCounter}`);
        });
      });
    }
    return map;
  }, [unit.subTopics, unitIndex, unitTopicIdKey]);

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* ===== TOP BAR ===== */}
      <div className="sticky top-0 z-30 bg-background/95 border-b border-border/10">
        <div className="flex items-center gap-2 px-3 sm:px-6 py-2.5 max-w-5xl mx-auto">
          <button onClick={onBack} className="shrink-0 w-9 h-9 rounded-xl bg-card/60 border border-border/20 flex items-center justify-center hover:bg-card transition-colors active:scale-95">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <button onClick={() => {
            if (onNavigateToUnit) onNavigateToUnit(unitIndex - 1);
            else onNavigatePrev?.();
          }} disabled={!hasPrev}
            className="shrink-0 w-8 h-8 rounded-lg bg-card/40 border border-border/15 flex items-center justify-center disabled:opacity-20 hover:bg-card/60 active:scale-90 transition-all">
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <div className="flex items-center justify-center gap-1.5">
              {allSubjects && onSwitchSubject ? (
                <SubjectSwitcher currentSubject={subject} allSubjects={allSubjects} onSwitch={onSwitchSubject} />
              ) : (
                <span className="text-sm font-bold text-foreground">{subject.shortName}</span>
              )}
            </div>
            <p className="text-[10px] text-foreground/50 break-words font-semibold">{subject.name}</p>
          </div>
          <button onClick={() => {
            if (onNavigateToUnit) onNavigateToUnit(unitIndex + 1);
            else onNavigateNext?.();
          }} disabled={!hasNext}
            className="shrink-0 w-8 h-8 rounded-lg bg-card/40 border border-border/15 flex items-center justify-center disabled:opacity-20 hover:bg-card/60 active:scale-90 transition-all">
            <ChevronRight className="w-4 h-4 text-foreground" />
          </button>
          {(canUndo || canRedo) && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={onUndo} disabled={!canUndo} className="w-8 h-8 rounded-lg bg-card/60 border border-border/20 flex items-center justify-center hover:bg-card disabled:opacity-20 transition-all active:scale-90">
                <Undo2 className="w-3.5 h-3.5 text-foreground" />
              </button>
              <button onClick={onRedo} disabled={!canRedo} className="w-8 h-8 rounded-lg bg-card/60 border border-border/20 flex items-center justify-center hover:bg-card disabled:opacity-20 transition-all active:scale-90">
                <Redo2 className="w-3.5 h-3.5 text-foreground" />
              </button>
            </div>
          )}
          <button onClick={() => setSearchVisible(v => !v)} className="w-9 h-9 rounded-xl bg-card/60 border border-border/20 flex items-center justify-center hover:bg-card transition-colors">
            {searchVisible ? <X className="w-4 h-4 text-muted-foreground" /> : <Search className="w-4 h-4 text-muted-foreground" />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-9 h-9 rounded-xl bg-card/60 border border-border/20 flex items-center justify-center hover:bg-card transition-colors">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card/95 backdrop-blur-xl border-border/20 min-w-[180px]">
              <DropdownMenuItem onClick={onBack} className="gap-2 text-xs">
                <Pencil className="w-3.5 h-3.5" /> Edit Subject
              </DropdownMenuItem>
              {onUpdateUnit && (
                <DropdownMenuItem onClick={() => setBulkEditorOpen(true)} className="gap-2 text-xs">
                  <Layers className="w-3.5 h-3.5" /> Edit Unit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => { setEditName(unit.name); setEditingName(true); }} className="gap-2 text-xs">
                <Pencil className="w-3.5 h-3.5" /> Rename Unit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                navigator.vibrate?.([20, 40, 20]);
                if (unitCopyStep === 1) {
                  const header = formatUnitHeader(unitIndex, unit.name);
                  navigator.clipboard.writeText(header);
                  toast('✦ Unit info copied', { description: header.length > 50 ? header.slice(0, 50) + '…' : header, duration: 2500 });
                  setUnitCopyStep(2);
                } else if (unitCopyStep === 2) {
                  const full = formatUnitSyllabus(unitIndex, unit.name, unit.subTopics);
                  navigator.clipboard.writeText(full);
                  toast('✨ Full syllabus copied', { icon: '📑' });
                  setUnitCopyStep(1);
                }
              }} className="gap-2 text-xs">
                <span className="text-sm">{unitCopyStep === 1 ? '📋' : '📑'}</span>
                {unitCopyStep === 1 ? '① Copy Unit Info' : '② Copy Full Syllabus'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onBulkToggle} className="gap-2 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" /> Toggle All
              </DropdownMenuItem>
              {onOpenReport && (
                <DropdownMenuItem onClick={() => onOpenReport(subject.id, unit.id)} className="gap-2 text-xs">
                  📄 Report Preview
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {onDeleteUnit && (
                <DropdownMenuItem onClick={() => setDeleteDialogOpen(true)} className="gap-2 text-xs text-destructive focus:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" /> Delete Unit
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ===== NAVIGATION BREADCRUMB ===== */}
      <div className="px-3 sm:px-6 py-1.5 border-b border-border/5 bg-muted/5">
        <div className="flex items-center gap-1.5 text-[10px] max-w-5xl mx-auto overflow-x-auto scrollbar-hide">
          <button onClick={onBack} className="text-primary/70 font-bold hover:text-primary transition-colors shrink-0 flex items-center gap-1 active:scale-95">
            📚 {subject.shortName}
          </button>
          <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30 shrink-0" />
          
          {/* Clickable Unit dropdown to jump across units */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-card/50 hover:bg-card/90 text-foreground font-black border border-border/20 hover:border-border/35 transition-all active:scale-95 cursor-pointer shadow-xs"
                title="Click to jump to another unit"
              >
                <span>Unit {unitIndex + 1}</span>
                <ChevronDown className="w-2.5 h-2.5 text-primary opacity-80" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-card/95 backdrop-blur-2xl border-border/25 max-h-[340px] overflow-y-auto min-w-[250px] p-1.5 rounded-2xl shadow-2xl z-50">
              <div className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground border-b border-border/10 mb-1 flex items-center justify-between">
                <span>Select Unit</span>
                <span className="text-primary">{unitIndex + 1} of {subject.units.length}</span>
              </div>
              {subject.units.map((u, i) => {
                const uDone = u.subTopics.filter(t => t.completed).length;
                const uTotal = u.subTopics.length;
                const uPct = uTotal > 0 ? Math.round((uDone / uTotal) * 100) : 0;
                const isCur = i === unitIndex;
                const cleanUName = u.name.replace(/^Unit\s+\d+\s*:\s*/i, '');
                return (
                  <DropdownMenuItem
                    key={u.id}
                    onClick={() => {
                      if (!isCur && onNavigateToUnit) {
                        setSwipeDirection(i > unitIndex ? 'left' : 'right');
                        setTimeout(() => { onNavigateToUnit(i); setSwipeDirection(null); }, 100);
                      }
                    }}
                    className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                      isCur ? 'bg-primary/15 text-primary font-bold' : 'hover:bg-muted/30 text-foreground'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-black opacity-60">Unit {i + 1}</span>
                        {isCur && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                      </div>
                      <p className="text-[11px] font-medium truncate text-foreground/90 mt-0.5">{cleanUName}</p>
                    </div>
                    <span className="text-[10px] font-mono font-bold shrink-0 opacity-70 ml-2" style={{ color: uPct === 100 ? 'hsl(var(--secondary))' : undefined }}>{uPct}%</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30 shrink-0" />
          <span className="text-foreground/70 font-bold truncate">{cleanUnitName}</span>
        </div>
      </div>

      {/* ===== UNIT NAVIGATION STRIP — Ultra Premium ===== */}
      {subject.units.length > 1 && (
        <div className="sticky top-[57px] z-20 bg-background/90 backdrop-blur-md border-b border-border/5">
          <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2">
            <div ref={unitStripRef} className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5" style={{ WebkitOverflowScrolling: 'touch' }}>
              {subject.units.map((u, i) => {
                const isActive = u.id === unit.id;
                const uDone = u.subTopics.filter(t => t.completed).length;
                const uTotal = u.subTopics.length;
                const uPct = uTotal > 0 ? Math.round((uDone / uTotal) * 100) : 0;
                const hasStarted = uPct > 0;
                const cleanName = u.name.replace(/^Unit\s+\d+\s*:\s*/i, '');
                const ut = u.subTopics.reduce((a, t) => a + (t.timeSpent || 0), 0);
                return (
                  <motion.button
                    key={u.id}
                    ref={isActive ? activeUnitRef as React.Ref<HTMLButtonElement> : undefined}
                    data-unit-active={isActive ? 'true' : undefined}
                    onClick={() => {
                      if (!isActive && onNavigateToUnit) {
                        setSwipeDirection(i > unitIndex ? 'left' : 'right');
                        setTimeout(() => { onNavigateToUnit(i); setSwipeDirection(null); }, 100);
                      }
                    }}
                    whileTap={{ scale: 0.95 }}
                    className={`shrink-0 relative flex items-center gap-2 rounded-full overflow-hidden transition-all ${
                      isActive
                        ? 'shadow-lg z-10'
                        : hasStarted
                          ? 'opacity-70 hover:opacity-90'
                          : 'opacity-50 hover:opacity-70'
                    }`}
                    style={{
                      background: `linear-gradient(to right, ${subject.color}${isActive ? '30' : '1A'} ${uPct}%, ${subject.color}${isActive ? '0D' : '08'} ${uPct}%)`,
                      border: isActive
                        ? `2px solid ${subject.color}40`
                        : `1.5px solid ${subject.color}15`,
                      boxShadow: isActive ? `0 4px 16px ${subject.color}20` : undefined,
                      padding: '6px 14px 6px 8px',
                    }}
                  >
                    {/* Unit number badge */}
                    <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-black font-mono px-1.5 py-1 rounded-full"
                      style={{
                        backgroundColor: isActive ? subject.color + '20' : subject.color + '10',
                        color: isActive ? subject.color : subject.color + 'AA',
                      }}>
                      <span className="text-[7px]">✦</span> {i + 1}
                    </span>

                    {/* Name + stats */}
                    <div className="flex flex-col items-start min-w-0 gap-0">
                      <span className={`text-[10px] font-black uppercase leading-tight whitespace-nowrap ${
                        isActive ? 'text-foreground' : 'text-foreground/50'
                      }`}>{cleanName}</span>
                      {hasStarted && (
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black font-mono"
                            style={{ color: uPct >= 100 ? 'hsl(var(--secondary))' : subject.color }}>
                            {uPct}%
                          </span>
                          {ut > 0 && (
                            <span className="text-[8px] font-mono font-bold text-foreground/30">⏱{formatTimeSpent(ut)}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Active indicator bar */}
                    {isActive && (
                      <motion.div
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-[3px] rounded-full"
                        style={{ backgroundColor: subject.color }}
                        layoutId="activeUnitIndicator"
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-3 sm:px-6">
        {/* ===== RENAME INLINE ===== */}
        <Collapse open={!!editingName}>
              <div className="mt-3 flex items-center gap-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-10 text-sm flex-1 bg-card/60 border-border/20 rounded-xl" autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveRename()} placeholder="Unit name..." />
                <Button size="sm" onClick={handleSaveRename} disabled={!editName.trim()} className="h-10 px-4">Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingName(false)} className="h-10">Cancel</Button>
              </div>
        </Collapse>

        {/* ===== SWIPEABLE HERO CARD ===== */}
        <div className="mt-4 relative overflow-hidden">
          <AnimatePresence>
            {hasPrev && (
              <motion.div className="absolute left-0 top-0 bottom-0 w-10 z-10 flex items-center justify-center pointer-events-none"
                initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} exit={{ opacity: 0 }}>
                <div className="w-1.5 h-12 rounded-full bg-accent/40" />
              </motion.div>
            )}
            {hasNext && (
              <motion.div className="absolute right-0 top-0 bottom-0 w-10 z-10 flex items-center justify-center pointer-events-none"
                initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} exit={{ opacity: 0 }}>
                <div className="w-1.5 h-12 rounded-full bg-accent/40" />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait" custom={swipeDirection}>
            <motion.div
              key={unit.id}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragStart={() => { isSwiping.current = true; }}
              onDragEnd={handleSwipeDragEnd}
              style={{
                x: dragX, opacity: cardOpacity, scale: cardScale,
                background: 'hsl(var(--card))',
                border: '1.5px solid hsl(var(--border) / 0.3)',
                boxShadow: '0 4px 20px hsl(var(--accent) / 0.1)',
              }}
              initial={swipeDirection === 'left' ? { x: 300, opacity: 0 } : swipeDirection === 'right' ? { x: -300, opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ x: 0, opacity: 1, y: 0 }}
              exit={swipeDirection === 'left' ? { x: -300, opacity: 0 } : swipeDirection === 'right' ? { x: 300, opacity: 0 } : { opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="rounded-2xl border border-border/20 overflow-hidden relative touch-pan-y cursor-grab active:cursor-grabbing"
            >
              <div className="p-4 sm:p-5 relative">
                {/* ── ROW: Unit SR badge + ⏱️ time + 🟢🟡🔴 difficulty ── */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  {/* Unit SR badge */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl" style={{ background: 'hsl(var(--muted) / 0.15)' }}>
                      <span className="text-[8px] font-black tracking-[0.2em] uppercase text-foreground/35">UNIT</span>
                      <motion.span
                        key={unitIndex}
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                        className="text-2xl font-black font-mono leading-none select-none"
                        style={{ color: 'hsl(var(--destructive))', letterSpacing: '-1px' }}
                      >
                        {String(unitIndex + 1).padStart(2, '0')}
                      </motion.span>
                    </div>
                  </div>
                  {/* Time + Difficulty pills */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/10 border border-border/10">
                      <span className="text-sm leading-none">⏱️</span>
                      <span className="text-[10px] font-bold font-mono text-foreground/70">{formatTimeSpent(stats.totalTime)}</span>
                    </div>
                    <DifficultyPill emoji="🟢" count={stats.easy} label="Easy" active={diffFilter === 'Easy'} onClick={() => handleDiffClick('Easy')} />
                    <DifficultyPill emoji="🟡" count={stats.med} label="Medium" active={diffFilter === 'Medium'} onClick={() => handleDiffClick('Medium')} />
                    <DifficultyPill emoji="🔴" count={stats.hard} label="Hard" active={diffFilter === 'Hard'} onClick={() => handleDiffClick('Hard')} />
                  </div>
                </div>

                {/* ── MOST IMPORTANT badge ── */}
                {hasMostImportant && (
                  <div className="mb-3">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-secondary/15 text-secondary border border-secondary/20 inline-flex items-center gap-1">
                      <Shield className="w-3 h-3" /> MOST IMPORTANT
                    </span>
                  </div>
                )}

                {/* ── Title + Ring ── */}
                <div className="flex items-start gap-3 mb-1">
                  <div className="flex-1 min-w-0">
                    <h1 className="font-black text-foreground leading-snug tracking-tight uppercase" style={{ fontSize: 'var(--text-size-unit, 20px)' }}>
                      {cleanUnitName}
                    </h1>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[12px] text-foreground/55 font-semibold">
                        {stats.total} lectures · {stats.completed} completed
                      </span>
                      <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded-md bg-muted/20 text-foreground/50">{stats.completed}/{stats.total}</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-center gap-1.5">
                    <CompletionRing pct={stats.pct} />
                    <motion.button
                      onClick={() => { navigator.vibrate?.(25); setStudyLoggerOpen(true); }}
                      whileTap={{ scale: 0.8, rotate: -10 }}
                      whileHover={{ scale: 1.1, y: -1 }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-primary/25 hover:border-primary/40 transition-all"
                      style={{
                        background: 'hsl(var(--primary) / 0.08)',
                      }}
                      title="Log Study Time"
                    >
                      <span className="text-sm">⏱️</span>
                      <span className="text-[9px] font-black text-primary tracking-wider">LOG</span>
                    </motion.button>
                  </div>
                </div>


                {/* ── 4 Emoji Stat Buttons ── */}
                <div className="mt-4 grid grid-cols-4 gap-2">
                  <EmojiStatPill emoji="✅" label="COMPLETED" value={stats.completed}
                    active={filter === 'complete'} onClick={() => handleStatPillClick('complete')}
                    colorVar="--secondary" />
                  <EmojiStatPill emoji="🔄" label="IN PROCESS" value={stats.inProcess}
                    active={filter === 'in_process'} onClick={() => handleStatPillClick('in_process')}
                    colorVar="--chart-4" />
                  <EmojiStatPill emoji="⭕" label="REMAINING" value={stats.remaining}
                    active={filter === 'incomplete'} onClick={() => handleStatPillClick('incomplete')}
                    colorVar="--destructive" />
                  <EmojiStatPill emoji="⭐" label="STARRED" value={stats.starred}
                    active={filter === 'important'} onClick={() => handleStatPillClick('important')}
                    colorVar="--chart-4" />
                </div>

                {/* ── Per-Module Time Breakdown (collapsible) ── */}
                {stats.totalTime > 0 && (() => {
                  const moduleTimes = Array.from(moduleTimeMap.entries())
                    .filter(([, v]) => v.time > 0)
                    .sort((a, b) => b[1].time - a[1].time);
                  if (moduleTimes.length === 0) return null;
                  return (
                    <div className="mt-3">
                      <button onClick={() => setShowModuleTime(p => !p)}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-foreground/60 hover:text-foreground transition-colors mb-1.5">
                        <span>⏱️</span>
                        <span>Time per Module · {formatTimeSpent(stats.totalTime)}</span>
                        {showModuleTime
                          ? <ChevronDown className="w-3 h-3" />
                          : <ChevronRight className="w-3 h-3" />}
                      </button>
                      <AnimatePresence>
                        {showModuleTime && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                            <div className="space-y-1.5">
                              {moduleTimes.map(([name, data]) => {
                                const timePct = stats.totalTime > 0 ? Math.round((data.time / stats.totalTime) * 100) : 0;
                                const displayName = name.startsWith('__ungrouped__') ? 'Ungrouped' : name;
                                return (
                                  <div key={name} className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold text-foreground/70 break-words w-24 sm:w-32 shrink-0">{displayName}</span>
                                    <div className="flex-1 h-2 rounded-full bg-muted/20 overflow-hidden">
                                      <motion.div className="h-full rounded-full bg-secondary/60"
                                        initial={{ width: 0 }} animate={{ width: `${timePct}%` }}
                                        transition={{ duration: 0.5, ease: 'easeOut' }} />
                                    </div>
                                    <span className="text-[9px] font-mono font-bold text-secondary shrink-0 w-12 text-right">{formatTimeSpent(data.time)}</span>
                                    <span className="text-[8px] font-mono text-foreground/40 w-6 text-right">{timePct}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })()}
              </div>

            </motion.div>
          </AnimatePresence>
        </div>

        {/* ===== SEARCH BAR ===== */}
        <AnimatePresence>
          {searchVisible && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="mt-4 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={deepSearch ? "Deep search (notes, resources, files)..." : "Search topics or lectures..."} className="pl-10 h-11 text-sm bg-card/60 border-border/20 rounded-xl" autoFocus />
                </div>
                <DeepSearchToggle enabled={deepSearch} onToggle={() => setDeepSearch(p => !p)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===== STATUS FILTER PILLS ===== */}
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <StatusFilterPills value={filter} onChange={setFilter} counts={filterCounts} />
          </div>
          <button onClick={handleExpandAll} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-foreground/60 bg-card/40 border border-border/15 hover:bg-card/60 transition-colors">
            {expandAll ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            {expandAll ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {/* Keyboard shortcuts hint */}
        {focusedTopicIdx >= 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/15 text-[10px] text-primary font-semibold">
              <span className="font-mono bg-primary/10 px-1.5 py-0.5 rounded">↑↓</span> Navigate
              <span className="font-mono bg-primary/10 px-1.5 py-0.5 rounded">Space</span> Toggle Status
              <span className="font-mono bg-primary/10 px-1.5 py-0.5 rounded">Enter</span> Open Details
              <span className="text-muted-foreground/50 ml-auto">#{focusedTopicIdx + 1}</span>
            </div>
          </motion.div>
        )}

        {/* Active filter indicators */}
        <AnimatePresence>
          {anyFilterActive && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 overflow-hidden">
              <div className="flex items-center gap-1.5 flex-wrap">
                {diffFilter !== 'all' && (
                  <button onClick={() => setDiffFilter('all')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-card/50 border border-border/20 text-foreground/70 hover:bg-card/70 transition-colors">
                    <span>{diffFilter === 'Easy' ? '🟢' : diffFilter === 'Medium' ? '🟡' : '🔴'}</span>
                    {diffFilter}
                    <X className="w-2.5 h-2.5 text-muted-foreground" />
                  </button>
                )}
                {starFilter !== 'any' && (
                  <button onClick={() => setStarFilter('any')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-chart-4/8 border border-chart-4/20 text-chart-4 hover:bg-chart-4/15 transition-colors">
                    {starFilter === 'none' ? '☆ No stars' : `${'★'.repeat(starFilter as number)}`}
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
                {catFilter !== 'all' && (
                  <button onClick={() => setCatFilter('all')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-accent/8 border border-accent/20 text-accent-ink hover:bg-accent/15 transition-colors">
                    📂 {catFilter === '__none__' ? 'No category' : catFilter}
                    <X className="w-2.5 h-2.5 text-muted-foreground" />
                  </button>
                )}
                <button onClick={() => { setFilter('all'); setDiffFilter('all'); setStarFilter('any'); setCatFilter('all'); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-destructive/70 hover:text-destructive bg-destructive/5 border border-destructive/15 hover:bg-destructive/10 transition-colors">
                  Clear all <X className="w-2.5 h-2.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Advanced Filters — Star Rating & Category */}
        {(unit.subTopics.some(t => t.rank) || unit.subTopics.some(t => t.category)) && (
          <div className="mt-2">
            <button onClick={() => { setAdvFiltersOpen(p => !p); navigator.vibrate?.(8); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-card/30 border border-border/10 hover:bg-card/50 transition-all">
              <Sparkles className="w-3.5 h-3.5 text-primary/60" />
              <span className="text-[10px] font-bold text-foreground/60 flex-1 text-left">Advanced Filters</span>
              {advFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[9px] font-black flex items-center justify-center">{advFilterCount}</span>
              )}
              <motion.div animate={{ rotate: advFiltersOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
              </motion.div>
            </button>
            <AnimatePresence>
              {advFiltersOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                  className="overflow-hidden"
                >
                  <div className="px-2 pt-2.5 pb-1 space-y-3">
                    {/* Star Rating Filter */}
                    <div>
                      <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-[0.2em] mb-1.5 block">⭐ Star Rating</span>
                      <div className="flex gap-1 flex-wrap">
                        <FilterChip label="Any" active={starFilter === 'any'} onClick={() => setStarFilter('any')} />
                        <FilterChip label="☆ None" count={starCounts.none} active={starFilter === 'none'} onClick={() => setStarFilter('none')} />
                        {([1, 2, 3, 4, 5] as const).map(r => (
                          <FilterChip key={r} label={'★'.repeat(r)} count={starCounts[String(r)]} active={starFilter === r} onClick={() => setStarFilter(starFilter === r ? 'any' : r)} />
                        ))}
                      </div>
                    </div>
                    {/* Category Filter */}
                    {(unitCategories.categories.length > 0 || unitCategories.noCategory > 0) && (
                      <div>
                        <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-[0.2em] mb-1.5 block">📂 Category</span>
                        <div className="flex gap-1 flex-wrap">
                          <FilterChip label="All" active={catFilter === 'all'} onClick={() => setCatFilter('all')} />
                          <FilterChip label="No category" count={unitCategories.noCategory} active={catFilter === '__none__'} onClick={() => setCatFilter(catFilter === '__none__' ? 'all' : '__none__')} />
                          {unitCategories.categories.map(([cat, count]) => (
                            <FilterChip key={cat} label={cat} count={count} active={catFilter === cat} onClick={() => setCatFilter(catFilter === cat ? 'all' : cat)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ===== TOPIC FOLDERS LIST ===== */}
        <div className="mt-4 space-y-1.5" style={{ willChange: 'scroll-position' }}>
          {hasModules ? (
            moduleGroups.map((group, gIdx) => {
              if (group.name.startsWith('__ungrouped__')) return reorderMode ? (
                <DndContext key={group.name} sensors={dndSensors} collisionDetection={closestCenter} modifiers={[zoomModifier]} onDragEnd={handleDragEnd}>
                  <SortableContext items={group.directTopics.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {group.directTopics.map((topic, i) => (
                      <SortableLectureRow id={topic.id} key={topic.id} isDragActive topic={topic} index={i} onCycle={() => cycleStatus(topic)} onToggleImportant={() => onToggleImportant(topic.id)} onOpenDetail={() => onOpenTopicDetail(topic)} globalNumber={globalTopicMap.get(topic.id)} showGlobalNumber={subject.showTopicNumbers} searchQuery={search} isFocused={filtered.indexOf(topic) === focusedTopicIdx} showReorder onMoveUp={() => handleReorderTopic(topic.id, 'up')} onMoveDown={() => handleReorderTopic(topic.id, 'down')} isFirst={i === 0} isLast={i === group.directTopics.length - 1} onDelete={onDeleteTopic ? () => handleDeleteTopic(topic.id) : undefined} onDuplicate={() => handleDuplicateTopic(topic.id)} folderNum={hierarchicalNumMap.get(topic.id)} onCycleDifficulty={() => cycleDifficulty(topic)} />
                    ))}
                  </SortableContext>
                </DndContext>
              ) : (<div key={group.name}>{group.directTopics.map((topic, i) => (
                <LectureRow key={topic.id} topic={topic} index={i} onCycle={() => cycleStatus(topic)} onToggleImportant={() => onToggleImportant(topic.id)} onOpenDetail={() => onOpenTopicDetail(topic)} globalNumber={globalTopicMap.get(topic.id)} showGlobalNumber={subject.showTopicNumbers} searchQuery={search} isFocused={filtered.indexOf(topic) === focusedTopicIdx} showReorder={false} onMoveUp={() => handleReorderTopic(topic.id, 'up')} onMoveDown={() => handleReorderTopic(topic.id, 'down')} isFirst={i === 0} isLast={i === group.directTopics.length - 1} onDelete={onDeleteTopic ? () => handleDeleteTopic(topic.id) : undefined} onDuplicate={() => handleDuplicateTopic(topic.id)} folderNum={hierarchicalNumMap.get(topic.id)} onCycleDifficulty={() => cycleDifficulty(topic)} />
              ))}</div>);
              const isOpen = isSearching || expandedFolders.has(group.name);
              const groupDone = group.allTopics.filter(t => t.completed).length;
              // Count only module groups (not ungrouped segments) for folder numbering
              const moduleIdx = moduleGroups.slice(0, gIdx + 1).filter(g => !g.name.startsWith('__ungrouped__')).length;
              const folderNum = `${unitIndex + 1}.${moduleIdx}`;
              const displayName = group.name;
              return (
                <div key={group.name}>
                  {/* Module Card — clean section/card design */}
                  {(() => {
                    const folderPctVal = group.allTopics.length > 0 ? Math.round((groupDone / group.allTopics.length) * 100) : 0;
                    const moduleComplete = groupDone === group.allTopics.length && group.allTopics.length > 0;
                    const mt = moduleTimeMap.get(group.name);
                    const modTimeMin = mt?.time || 0;
                    const modLastDate = group.allTopics.reduce((latest: string, t: SubTopic) => (t.completedDate && t.completedDate > latest ? t.completedDate : latest), '');
                    return (
                    <div
                      className="rounded-[16px] overflow-hidden cursor-pointer group active:scale-[0.99] transition-all"
                      onClick={() => toggleFolder(group.name)}
                      style={{
                        background: 'hsl(var(--card) / 0.4)',
                        border: '1.5px solid hsl(var(--border) / 0.2)',
                      }}
                    >
                      {/* Folder icon + title */}
                      <div className="px-3 pt-3 pb-1 flex items-start gap-2">
                        <span className="text-base shrink-0 mt-0.5 select-none cursor-pointer active:scale-[0.85] transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.vibrate?.(25);
                            const content = formatModuleSyllabus(unitIndex, moduleIdx, group.name, group.directTopics, group.subModules);
                            navigator.clipboard?.writeText(content);
                            toast('📂 Folder copied', { icon: '📋', duration: 1500 });
                          }}
                        >📁</span>

                        <h4 className="flex-1 min-w-0 font-bold uppercase leading-tight"
                          style={{ fontSize: 'var(--text-size-module, 14px)', letterSpacing: '0.2px', color: moduleComplete ? 'hsl(var(--secondary))' : 'hsl(var(--foreground))', overflowWrap: 'break-word', wordBreak: 'normal', hyphens: 'none' }}>
                          {group.name}
                        </h4>
                      </div>

                      {/* Metadata row */}
                      <div className="px-3 pb-1 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" style={{ opacity: 0.5 }} />
                          {modTimeMin > 0 ? formatTimeSpent(modTimeMin) : '0m'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          📅 {modLastDate ? formatDate(modLastDate) : '—'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {moduleComplete ? '✅' : '📋'} {groupDone}/{group.allTopics.length}
                        </span>
                        {mt && mt.inProcess > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-chart-4 font-bold animate-soft-pulse">
                            🔄{mt.inProcess}
                          </span>
                        )}
                        <span className="ml-auto font-bold font-mono text-[12px] shrink-0"
                          style={{ color: moduleComplete ? 'hsl(var(--secondary))' : 'hsl(var(--foreground))' }}>
                          {folderPctVal}%
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mx-3 mb-2 mt-1 h-[4px] rounded-full overflow-hidden" style={{ background: 'hsl(var(--border) / 0.3)' }}>
                        <div className="h-full rounded-full transition-all duration-500 ease-out" style={{
                          width: `${folderPctVal}%`,
                          backgroundColor: subject.color || 'hsl(var(--foreground) / 0.3)',
                        }} />
                      </div>
                    </div>
                    );
                  })()}
                  {/* Progress bar is now built into the module card above */}
                  {/* Fade-in only: animating height:auto over a long topic list re-lays-out every frame */}
                  <>
                    {isOpen && (
                      <div className="overflow-hidden animate-fade-in">
                        <div className="ml-5 pl-4 border-l-2 border-border/15 space-y-0.5 py-1">
                          {group.subModules.map(sm => {
                            const smKey = `${group.name}::${sm.name}`;
                            const smOpen = isSearching || expandedFolders.has(smKey);
                            return (
                              <div key={smKey}>
                                <div className="flex items-center gap-1">
                                  <button onClick={() => toggleFolder(smKey)} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-card/30 transition-all flex-1 min-w-0">
                                    {smOpen ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                                    <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <span className="font-medium text-foreground/80 break-words" style={{ fontSize: 'var(--text-size-module, 12px)' }}>{sm.name}</span>
                                    </div>
                                    <span className="text-xs font-mono font-bold text-foreground/50 shrink-0">{sm.topics.filter(t => t.completed).length}/{sm.topics.length}</span>
                                  </button>
                                  <SmartCopyButton
                                    size="sm"
                                    textStep1={sm.name}
                                    textStep2={formatSubModuleSyllabus(sm.name, sm.topics)}
                                    label1={`✦ ${sm.name} copied`}
                                    label2="Subtopics copied"
                                  />
                                  {/* SubModule reorder */}
                                  {reorderMode && onReorderTopics && group.subModules.length > 1 && (() => {
                                    const smIdx = group.subModules.indexOf(sm);
                                    return (
                                      <div className="flex flex-col gap-0 shrink-0" onClick={e => e.stopPropagation()}>
                                        <motion.button whileTap={{ scale: 0.8 }} disabled={smIdx === 0}
                                          onClick={() => {
                                            const prevSm = group.subModules[smIdx - 1];
                                            if (!prevSm) return;
                                            const firstTopic = sm.topics[0];
                                            const prevFirstIdx = unit.subTopics.findIndex(t => prevSm.topics[0]?.id === t.id);
                                            if (prevFirstIdx >= 0 && firstTopic) { onReorderTopics(firstTopic.id, prevFirstIdx); navigator.vibrate?.(15); }
                                          }}
                                          className="w-4 h-3.5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 transition-all">
                                          <ArrowUp className="w-2.5 h-2.5" />
                                        </motion.button>
                                        <motion.button whileTap={{ scale: 0.8 }} disabled={smIdx === group.subModules.length - 1}
                                          onClick={() => {
                                            const nextSm = group.subModules[smIdx + 1];
                                            if (!nextSm) return;
                                            const lastTopicInNext = nextSm.topics[nextSm.topics.length - 1];
                                            const firstTopic = sm.topics[0];
                                            const lastIdx = unit.subTopics.findIndex(t => t.id === lastTopicInNext?.id);
                                            if (lastIdx >= 0 && firstTopic) { onReorderTopics(firstTopic.id, lastIdx); navigator.vibrate?.(15); }
                                          }}
                                          className="w-4 h-3.5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 transition-all">
                                          <ArrowDown className="w-2.5 h-2.5" />
                                        </motion.button>
                                      </div>
                                    );
                                  })()}
                                </div>
                                <>
                                  {smOpen && (
                                    <div className="overflow-hidden animate-fade-in">
                                      <div className="ml-4 pl-3 border-l border-border/10 space-y-0.5 py-0.5">
                                        {reorderMode ? (
                                        <DndContext sensors={dndSensors} collisionDetection={closestCenter} modifiers={[zoomModifier]} onDragEnd={handleDragEnd}>
                                          <SortableContext items={sm.topics.map(t => t.id)} strategy={verticalListSortingStrategy}>
                                            {sm.topics.map((topic, i) => <SortableLectureRow id={topic.id} key={topic.id} isDragActive topic={topic} index={i} onCycle={() => cycleStatus(topic)} onToggleImportant={() => onToggleImportant(topic.id)} onOpenDetail={() => onOpenTopicDetail(topic)} globalNumber={globalTopicMap.get(topic.id)} showGlobalNumber={subject.showTopicNumbers} searchQuery={search} isFocused={filtered.indexOf(topic) === focusedTopicIdx} showReorder onMoveUp={() => handleReorderTopic(topic.id, 'up')} onMoveDown={() => handleReorderTopic(topic.id, 'down')} isFirst={i === 0} isLast={i === sm.topics.length - 1} onDelete={onDeleteTopic ? () => handleDeleteTopic(topic.id) : undefined} onDuplicate={() => handleDuplicateTopic(topic.id)} folderNum={hierarchicalNumMap.get(topic.id)} onCycleDifficulty={() => cycleDifficulty(topic)} />)}
                                          </SortableContext>
                                        </DndContext>
                                        ) : sm.topics.map((topic, i) => <LectureRow key={topic.id} topic={topic} index={i} onCycle={() => cycleStatus(topic)} onToggleImportant={() => onToggleImportant(topic.id)} onOpenDetail={() => onOpenTopicDetail(topic)} globalNumber={globalTopicMap.get(topic.id)} showGlobalNumber={subject.showTopicNumbers} searchQuery={search} isFocused={filtered.indexOf(topic) === focusedTopicIdx} showReorder={false} onMoveUp={() => handleReorderTopic(topic.id, 'up')} onMoveDown={() => handleReorderTopic(topic.id, 'down')} isFirst={i === 0} isLast={i === sm.topics.length - 1} onDelete={onDeleteTopic ? () => handleDeleteTopic(topic.id) : undefined} onDuplicate={() => handleDuplicateTopic(topic.id)} folderNum={hierarchicalNumMap.get(topic.id)} onCycleDifficulty={() => cycleDifficulty(topic)} />)}
                                      </div>
                                    </div>
                                  )}
                                </>
                              </div>
                            );
                          })}
                          {reorderMode ? (
                          <DndContext sensors={dndSensors} collisionDetection={closestCenter} modifiers={[zoomModifier]} onDragEnd={handleDragEnd}>
                            <SortableContext items={group.directTopics.map(t => t.id)} strategy={verticalListSortingStrategy}>
                              {group.directTopics.map((topic, i) => <SortableLectureRow id={topic.id} key={topic.id} isDragActive topic={topic} index={i} onCycle={() => cycleStatus(topic)} onToggleImportant={() => onToggleImportant(topic.id)} onOpenDetail={() => onOpenTopicDetail(topic)} globalNumber={globalTopicMap.get(topic.id)} showGlobalNumber={subject.showTopicNumbers} searchQuery={search} isFocused={filtered.indexOf(topic) === focusedTopicIdx} showReorder onMoveUp={() => handleReorderTopic(topic.id, 'up')} onMoveDown={() => handleReorderTopic(topic.id, 'down')} isFirst={i === 0} isLast={i === group.directTopics.length - 1} onDelete={onDeleteTopic ? () => handleDeleteTopic(topic.id) : undefined} onDuplicate={() => handleDuplicateTopic(topic.id)} folderNum={hierarchicalNumMap.get(topic.id)} onCycleDifficulty={() => cycleDifficulty(topic)} />)}
                            </SortableContext>
                          </DndContext>
                          ) : group.directTopics.map((topic, i) => <LectureRow key={topic.id} topic={topic} index={i} onCycle={() => cycleStatus(topic)} onToggleImportant={() => onToggleImportant(topic.id)} onOpenDetail={() => onOpenTopicDetail(topic)} globalNumber={globalTopicMap.get(topic.id)} showGlobalNumber={subject.showTopicNumbers} searchQuery={search} isFocused={filtered.indexOf(topic) === focusedTopicIdx} showReorder={false} onMoveUp={() => handleReorderTopic(topic.id, 'up')} onMoveDown={() => handleReorderTopic(topic.id, 'down')} isFirst={i === 0} isLast={i === group.directTopics.length - 1} onDelete={onDeleteTopic ? () => handleDeleteTopic(topic.id) : undefined} onDuplicate={() => handleDuplicateTopic(topic.id)} folderNum={hierarchicalNumMap.get(topic.id)} onCycleDifficulty={() => cycleDifficulty(topic)} />)}
                        </div>
                      </div>
                    )}
                  </>
                </div>
              );
            })
          ) : reorderMode ? (
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} modifiers={[zoomModifier]} onDragEnd={handleDragEnd}>
              <SortableContext items={filtered.map(t => t.id)} strategy={verticalListSortingStrategy}>
                {filtered.map((topic, i) => <SortableLectureRow id={topic.id} key={topic.id} isDragActive topic={topic} index={i} onCycle={() => cycleStatus(topic)} onToggleImportant={() => onToggleImportant(topic.id)} onOpenDetail={() => onOpenTopicDetail(topic)} globalNumber={globalTopicMap.get(topic.id)} showGlobalNumber={subject.showTopicNumbers} searchQuery={search} isFocused={i === focusedTopicIdx} showReorder onMoveUp={() => handleReorderTopic(topic.id, 'up')} onMoveDown={() => handleReorderTopic(topic.id, 'down')} isFirst={i === 0} isLast={i === filtered.length - 1} onDelete={onDeleteTopic ? () => handleDeleteTopic(topic.id) : undefined} onDuplicate={() => handleDuplicateTopic(topic.id)} folderNum={hierarchicalNumMap.get(topic.id)} onCycleDifficulty={() => cycleDifficulty(topic)} />)}
              </SortableContext>
            </DndContext>
          ) : (
            filtered.map((topic, i) => <LectureRow key={topic.id} topic={topic} index={i} onCycle={() => cycleStatus(topic)} onToggleImportant={() => onToggleImportant(topic.id)} onOpenDetail={() => onOpenTopicDetail(topic)} globalNumber={globalTopicMap.get(topic.id)} showGlobalNumber={subject.showTopicNumbers} searchQuery={search} isFocused={i === focusedTopicIdx} showReorder={false} onMoveUp={() => handleReorderTopic(topic.id, 'up')} onMoveDown={() => handleReorderTopic(topic.id, 'down')} isFirst={i === 0} isLast={i === filtered.length - 1} onDelete={onDeleteTopic ? () => handleDeleteTopic(topic.id) : undefined} onDuplicate={() => handleDuplicateTopic(topic.id)} folderNum={hierarchicalNumMap.get(topic.id)} onCycleDifficulty={() => cycleDifficulty(topic)} />)
          )}
          {filtered.length === 0 && (
            <div className="text-center py-16 space-y-2">
              <span className="text-3xl block">{search ? '🔍' : anyFilterActive ? '🎯' : '📭'}</span>
              <p className="text-sm font-semibold text-foreground/70">{search ? `No results for "${search}"` : 'No topics match these filters'}</p>
              <p className="text-xs text-muted-foreground">{search ? 'Try a shorter keyword' : anyFilterActive ? 'Try removing some filters' : 'Add topics to get started'}</p>
              {anyFilterActive && !search && (
                <button onClick={() => { setFilter('all'); setDiffFilter('all'); setStarFilter('any'); setCatFilter('all'); }}
                  className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-primary bg-primary/8 border border-primary/15 hover:bg-primary/15 transition-colors">
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Add topic is accessible via the menu and unit section inline buttons */}
      </div>

      <AddTopicInline open={addTopicOpen} onClose={() => setAddTopicOpen(false)} unitId={unit.id}
        modules={[...new Set(unit.subTopics.map(t => t.module).filter(Boolean) as string[])]} onAdd={onAddTopic} />

      <StudyTimeLogger
        open={studyLoggerOpen}
        onClose={() => setStudyLoggerOpen(false)}
        subjectName={subject.shortName}
        unitName={cleanUnitName}
        totalTimeSpent={stats.totalTime}
        onLogTime={(minutes, date, note) => {
          if (onLogStudyTime) {
            onLogStudyTime(minutes, date, note);
          }
        }}
        onOpenFullTimer={onOpenPomodoro ? () => onOpenPomodoro(subject.id, unit.id) : undefined}
      />

      {onUpdateUnit && (
        <BulkUnitEditor
          open={bulkEditorOpen}
          onClose={() => setBulkEditorOpen(false)}
          unit={unit}
          unitIndex={unitIndex}
          subjectColor={subject.color}
          subjectName={subject.shortName}
          onSave={onUpdateUnit}
          onDeleteTopic={onDeleteTopic}
        />
      )}

      {/* Delete Topic Confirmation */}
      <AlertDialog open={deleteTopicConfirmOpen} onOpenChange={(open) => { setDeleteTopicConfirmOpen(open); if (!open) setPendingDeleteTopicId(null); }}>
        <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-border/20">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Topic</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{unit.subTopics.find(t => t.id === pendingDeleteTopicId)?.name || 'this topic'}&quot;? This action can be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTopic} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-border/20">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Remove &quot;{cleanUnitName}&quot;? This cannot be undone.</span>
              <span className="block text-xs text-foreground/60 bg-muted/20 rounded-lg p-2.5 space-y-1">
                <span className="flex items-center justify-between"><span>📚 Topics</span><span className="font-bold">{unit.subTopics.length}</span></span>
                <span className="flex items-center justify-between"><span>✅ Completed</span><span className="font-bold">{stats.completed}</span></span>
                <span className="flex items-center justify-between"><span>⏱️ Study Time</span><span className="font-bold">{formatTimeSpent(stats.totalTime)}</span></span>
                <span className="flex items-center justify-between"><span>⭐ Starred</span><span className="font-bold">{stats.starred}</span></span>
                <span className="flex items-center justify-between"><span>📝 With Notes</span><span className="font-bold">{unit.subTopics.filter(t => t.notes).length}</span></span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDeleteUnit?.(); setDeleteDialogOpen(false); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Unit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   DIFFICULTY FILTER PILL (🟢🟡🔴) — top-right of card
   ═══════════════════════════════════════════════════ */
function DifficultyPill({ emoji, count, label, active, onClick }: {
  emoji: string; count: number; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.8, rotate: -5 }}
      whileHover={{ scale: 1.08 }}
      title={`Filter by ${label}`}
      className={`relative flex items-center gap-1 px-2 py-1.5 rounded-xl border text-[10px] font-bold transition-all ${
        active
          ? 'bg-card/90 border-foreground/25 shadow-md ring-1 ring-foreground/10'
          : 'bg-card/30 border-border/10 hover:bg-card/50 hover:border-border/20'
      }`}
      style={active ? {
        boxShadow: '0 4px 12px hsl(var(--accent) / 0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
      } : undefined}
    >
      <motion.span className="text-sm leading-none"
        animate={active ? { scale: [1, 1.2, 1] } : undefined}
        transition={{ duration: 0.4 }}>
        {emoji}
      </motion.span>
      <span className={`font-mono font-black ${active ? 'text-foreground' : 'text-foreground/50'}`}>{count}</span>
    </motion.button>
  );
}

/* ═══════════════════════════════════════════════════
   EMOJI STAT PILL (✅🔄⭕⭐) — clean warm tiles
   ═══════════════════════════════════════════════════ */
function EmojiStatPill({ emoji, label, value, active, onClick, colorVar }: {
  emoji: string; label: string; value: number; active?: boolean; onClick?: () => void;
  colorVar: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      className={`relative flex flex-col items-center justify-center gap-1 py-3 px-1.5 sm:px-2 rounded-2xl border transition-all duration-200 overflow-hidden ${
        active
          ? 'border-primary/40 shadow-lg ring-1 ring-primary/25'
          : 'border-border/15 hover:border-border/30 hover:bg-card/60'
      }`}
      style={{
        background: active
          ? `linear-gradient(135deg, hsl(${colorVar} / 0.18), hsl(${colorVar} / 0.08))`
          : 'linear-gradient(135deg, hsl(var(--card) / 0.8), hsl(var(--card) / 0.4))',
      }}
    >
      {active && (
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-primary/10 to-transparent" />
      )}
      <span className="text-[20px] sm:text-[22px] leading-none select-none">
        {emoji}
      </span>
      <span className={`text-[7px] sm:text-[8px] tracking-[0.12em] uppercase font-black leading-none mt-0.5 ${
        active ? 'text-foreground' : 'text-foreground/50'
      }`}>{label}</span>
      <motion.span className={`text-base sm:text-lg font-black font-mono leading-none ${
        active ? 'text-foreground' : 'text-foreground/80'
      }`}
        key={`${label}-${value}`}
        initial={{ scale: 1.25, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
        {value}
      </motion.span>
    </motion.button>
  );
}

/* ═══════════════════════════════════════════════════
   FANCY UNIT BADGE
   ═══════════════════════════════════════════════════ */
function FancyUnitBadge({ unitIndex, isComplete, unitName, subTopics }: {
  unitIndex: number; isComplete?: boolean;
  unitName: string; subTopics: SubTopic[];
}) {
  const padded = formatUnitNumber(unitIndex + 1);
  const [copyStep, setCopyStep] = useState<1 | 2>(1);
  const [showIcon, setShowIcon] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const resetRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => { clearTimeout(timerRef.current); clearTimeout(resetRef.current); }, []);

  const cleanName = useMemo(() => {
    const match = unitName.match(/^Unit\s+\d+\s*:\s*(.+)/i);
    return match ? match[1].trim() : unitName;
  }, [unitName]);

  const getFullSyllabus = useCallback(() => {
    return formatUnitSyllabus(unitIndex, unitName, subTopics);
  }, [unitIndex, unitName, subTopics]);

  const handleCopy = () => {
    navigator.vibrate?.([20, 40, 20]);
    clearTimeout(timerRef.current);
    clearTimeout(resetRef.current);

    if (copyStep === 1) {
      const text = formatUnitHeader(unitIndex, unitName);
      navigator.clipboard.writeText(text);
      setShowIcon('📋');
      timerRef.current = setTimeout(() => setShowIcon(null), 800);
      toast('✦ Unit name copied', { description: 'Tap again for full syllabus', duration: 2500 });
      setCopyStep(2);
      resetRef.current = setTimeout(() => setCopyStep(1), 4000);
    } else {
      navigator.clipboard.writeText(getFullSyllabus());
      setShowIcon('📑');
      timerRef.current = setTimeout(() => setShowIcon(null), 800);
      toast('✨ Full unit syllabus copied', { icon: '📑', duration: 2500 });
      setCopyStep(1);
    }
  };

  const isCopied = !!showIcon;

  return (
    <motion.button
      onClick={handleCopy}
      whileTap={{ scale: 0.9, rotate: -3 }}
      initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.05 }}
      className="relative inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl overflow-hidden shrink-0 cursor-pointer"
      style={{
        background: isCopied
          ? 'linear-gradient(135deg, hsl(var(--secondary) / 0.3), hsl(var(--secondary) / 0.15), hsl(var(--secondary) / 0.25))'
          : copyStep === 2
            ? 'linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(var(--accent) / 0.15), hsl(var(--primary) / 0.2))'
            : isComplete
              ? 'linear-gradient(135deg, hsl(var(--secondary) / 0.2), hsl(var(--secondary) / 0.1), hsl(var(--secondary) / 0.2))'
              : 'linear-gradient(135deg, hsl(var(--accent) / 0.15), hsl(var(--primary) / 0.1), hsl(var(--accent) / 0.15))',
        border: isCopied
          ? '1.5px solid hsl(var(--secondary) / 0.6)'
          : copyStep === 2
            ? '1.5px solid hsl(var(--primary) / 0.4)'
            : isComplete ? '1.5px solid hsl(var(--secondary) / 0.35)' : '1.5px solid hsl(var(--accent) / 0.25)',
        boxShadow: isCopied
          ? '0 0 24px hsl(var(--secondary) / 0.4), 0 4px 24px hsl(var(--secondary) / 0.25), inset 0 1px 0 rgba(255,255,255,0.2)'
          : copyStep === 2
            ? '0 0 16px hsl(var(--primary) / 0.3), 0 4px 20px hsl(var(--primary) / 0.15), inset 0 1px 0 rgba(255,255,255,0.1)'
            : isComplete
              ? '0 4px 24px hsl(var(--secondary) / 0.2), 0 0 0 1px hsl(var(--secondary) / 0.1), inset 0 1px 0 rgba(255,255,255,0.15)'
              : '0 4px 24px hsl(var(--accent) / 0.12), 0 0 0 1px hsl(var(--accent) / 0.05), inset 0 1px 0 rgba(255,255,255,0.1)',
      }}
      title={copyStep === 1 ? '① Tap to copy unit name' : '② Tap to copy full syllabus'}
    >
      {/* Sparkles (CSS-only, compositor friendly) */}
      <span className="absolute left-1.5 top-1 text-[8px] text-accent-ink/30 pointer-events-none select-none animate-soft-pulse">✦</span>
      <span className="absolute right-1.5 bottom-1 text-[8px] text-accent-ink/30 pointer-events-none select-none animate-soft-pulse" style={{ animationDelay: '0.5s' }}>✦</span>
      {/* Copied icon overlay */}
      <AnimatePresence>
        {showIcon && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
            className="absolute inset-0 flex items-center justify-center z-20 rounded-2xl"
            style={{ background: 'hsl(var(--secondary) / 0.15)', }}
          >
            <motion.span className="text-lg drop-shadow-md" animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }} transition={{ duration: 0.6 }}>
              {showIcon === '📋' ? '✔' : '📑'}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
      <span className="text-[8px] font-black tracking-[0.2em] uppercase text-accent-ink/50 relative z-10">UNIT</span>
      <div className="flex gap-0.5 relative z-10">
        {padded.split('').map((char, i) => (
          <motion.span key={`${unitIndex}-${i}`} initial={{ opacity: 0, scale: 0, y: 10, rotate: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
            transition={{ delay: 0.12 + i * 0.1, type: 'spring', stiffness: 600, damping: 14 }}
            className="inline-block text-2xl font-black leading-none font-mono"
            style={{ background: 'linear-gradient(135deg, hsl(var(--accent-foreground)), hsl(var(--primary)), hsl(var(--secondary)))', backgroundSize: '200% 200%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 8px hsl(var(--accent) / 0.5))' }}>
            {char}
          </motion.span>
        ))}
      </div>
      {/* Step indicator dots */}
      <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5 z-10">
        <div className={`w-1.5 h-0.5 rounded-full transition-all ${copyStep === 1 ? 'bg-foreground/30' : 'bg-foreground/10'}`} />
        <div className={`w-1.5 h-0.5 rounded-full transition-all ${copyStep === 2 ? 'bg-primary' : 'bg-foreground/10'}`} />
      </div>
    </motion.button>
  );
}

function CompletionRing({ pct }: { pct: number }) {
  const size = 76; const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const strokeColor = pct >= 100 ? 'hsl(var(--secondary))' : pct >= 60 ? 'hsl(var(--secondary))' : pct >= 30 ? 'hsl(var(--chart-4))' : 'hsl(var(--destructive) / 0.7)';
  const isComplete = pct >= 100;
  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
    >
      {/* Outer glow ring for 100% */}
      {isComplete && (
        <div
          className="absolute -inset-1.5 rounded-full pointer-events-none animate-soft-pulse"
          style={{
            background: 'radial-gradient(circle, hsl(var(--secondary) / 0.2), transparent 70%)',
            boxShadow: '0 0 20px hsl(var(--secondary) / 0.3), 0 0 40px hsl(var(--secondary) / 0.15)',
          }}
        />
      )}
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90 relative z-10">
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted) / 0.12)" strokeWidth={strokeWidth} />
        {/* Progress arc */}
        <motion.circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          style={{ filter: isComplete ? 'drop-shadow(0 0 10px hsl(var(--secondary) / 0.6))' : `drop-shadow(0 0 6px hsl(var(--accent) / 0.4))` }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <motion.span
          className={`text-lg font-black font-mono ${isComplete ? 'text-secondary' : 'text-foreground'}`}
          key={pct}
          initial={{ scale: 1.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
          style={isComplete ? { filter: 'drop-shadow(0 0 6px hsl(var(--secondary) / 0.4))' } : undefined}
        >{pct}%</motion.span>
      </div>
    </motion.div>
  );
}


function FilterChip({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.9 }} onClick={() => { onClick(); navigator.vibrate?.(8); }}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${
        active
          ? 'bg-primary/12 border-primary/30 text-primary shadow-sm ring-1 ring-primary/15'
          : 'bg-card/30 border-border/10 text-foreground/50 hover:bg-card/50 hover:text-foreground/70'
      }`}>
      {label}
      {count != null && count > 0 && (
        <span className={`text-[8px] font-mono font-black px-1 py-0.5 rounded-md ${active ? 'bg-primary/15 text-primary' : 'bg-muted/30 text-foreground/35'}`}>{count}</span>
      )}
    </motion.button>
  );
}

function SortableLectureRow({ id, isDragActive, ...props }: { id: string; isDragActive: boolean } & Parameters<typeof LectureRow>[0]) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        zIndex: isDragging ? 50 : undefined,
        position: 'relative',
      }}
      className={isDragging ? 'scale-[1.02] shadow-xl rounded-xl ring-2 ring-primary/30' : ''}
    >
      {isDragActive && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-0 bottom-0 w-7 flex items-center justify-center cursor-grab active:cursor-grabbing z-10 touch-none rounded-l-xl hover:bg-primary/5 transition-colors"
        >
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30" />
        </div>
      )}
      <div style={{ paddingLeft: isDragActive ? '24px' : undefined }}>
        <LectureRow {...props} showReorder={!isDragActive && props.showReorder} />
      </div>
    </div>
  );
}

function LectureRow({ topic, index, onCycle, onToggleImportant, onOpenDetail, globalNumber, showGlobalNumber, searchQuery, isFocused, onMoveUp, onMoveDown, isFirst, isLast, showReorder, onDelete, onDuplicate, folderNum, onCycleDifficulty, hideHashSuffix }: {
  topic: SubTopic; index: number; onCycle: () => void; onToggleImportant: () => void; onOpenDetail: () => void;
  globalNumber?: number; showGlobalNumber?: boolean; searchQuery?: string; isFocused?: boolean;
  onMoveUp?: () => void; onMoveDown?: () => void; isFirst?: boolean; isLast?: boolean; showReorder?: boolean;
  onDelete?: () => void; onDuplicate?: () => void; folderNum?: string; onCycleDifficulty?: () => void;
  hideHashSuffix?: boolean;
}) {
  const status: TopicStatus = topic.status || (topic.completed ? 'complete' : 'incomplete');
  const videoIdMatch = topic.name.match(/#(\d+)/);
  const videoId = videoIdMatch ? parseInt(videoIdMatch[1]) : null;
  let displayName = getDisplayTopicName(topic.name, hideHashSuffix);
  const topicNum = showGlobalNumber
    ? (globalNumber != null ? globalNumber : folderNum ?? (index + 1))
    : (folderNum ?? (index + 1));

  return (
    <div
      className={`rounded-[16px] overflow-hidden transition-[transform,box-shadow,background-color] duration-150 active:scale-[0.99] group ${
        isFocused ? 'ring-2 ring-primary/40' : ''
      }`}
      style={{
        background: status === 'in_process'
            ? 'hsl(var(--chart-4) / 0.06)'
            : 'hsl(var(--card) / 0.3)',
        border: status === 'in_process'
            ? '1.5px solid hsl(var(--chart-4) / 0.2)'
            : '1.5px solid hsl(var(--border) / 0.15)',
      }}
    >
      {/* ── Top row: status icon + number + title + difficulty ── */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-start gap-2">
          <button onClick={(e) => { e.stopPropagation(); onCycle(); }} className="shrink-0 mt-0.5 transition-transform duration-100 active:scale-[0.7] active:rotate-90">
            {status === 'complete' ? (
              <CheckCircle2 className="w-6 h-6 text-secondary" style={{ filter: 'drop-shadow(0 0 4px hsl(var(--secondary) / 0.3))' }} />
            ) : status === 'in_process' ? (
              <Clock className="w-6 h-6 text-chart-4" style={{ filter: 'drop-shadow(0 0 4px hsl(var(--chart-4) / 0.3))' }} />
            ) : (
              <Circle className="w-6 h-6 text-muted-foreground/30 group-hover:text-muted-foreground/50" />
            )}
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); navigator.vibrate?.(25); const cn = getCleanName(topic.name); navigator.clipboard?.writeText(cn); toast('📋 Copied!', { duration: 1500 }); }}
            className="text-[12px] font-mono font-black min-w-[20px] text-center tabular-nums select-none shrink-0 leading-none mt-1 active:scale-[0.8] transition-all"
            style={{ color: 'hsl(var(--destructive))' }}
            title="Tap to copy"
            type="button"
          >
            {topicNum}
          </button>

          <button onClick={onOpenDetail} className="flex-1 min-w-0 text-left">
            <span className={`font-bold leading-snug break-words block ${
              status === 'complete' ? 'text-secondary' : status === 'in_process' ? 'text-chart-4' : 'text-foreground'
            }`} style={{ fontSize: 'var(--text-size-topic, 15px)' }}>
              <HighlightText text={displayName} query={searchQuery || ''} />
            </span>
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); onCycleDifficulty?.(); }}
            className="shrink-0 mt-0.5 text-lg leading-none select-none active:bg-muted/30 active:scale-[0.75] rounded-lg p-0.5 transition-[transform,background-color] duration-100 touch-manipulation"
            title={`${topic.difficulty} — tap to change`}
          >
            {topic.difficulty === 'Easy' ? '🟢' : topic.difficulty === 'Hard' ? '🔴' : '🟡'}
          </button>
        </div>
      </div>

      {/* ── Bottom row: metadata (time, date, status, tags) + actions ── */}
      <div className="px-3 pb-2 flex items-center gap-1.5 flex-wrap">
        {videoId && <span className="text-[10px] font-mono font-bold text-foreground/50">#{String(videoId).padStart(3, '0')}</span>}
        {topic.timeSpent > 0 && (
          <span className="text-[10px] font-mono font-bold text-secondary/70 inline-flex items-center gap-0.5">⏱️{formatTimeSpent(topic.timeSpent)}</span>
        )}
        {topic.completed && topic.completedDate && (
          <span className="text-[10px] text-muted-foreground font-semibold inline-flex items-center gap-0.5">📅 {formatDate(topic.completedDate)}</span>
        )}
        {status === 'complete' && (
          <span className="text-[10px] font-bold text-secondary inline-flex items-center gap-0.5">✓ COMPLETED</span>
        )}
        {status === 'in_process' && (
          <span className="text-[10px] font-bold text-chart-4 animate-soft-pulse">
            ⏳ IN PROGRESS
          </span>
        )}
        {topic.rank && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-chart-4/10 text-chart-4 font-bold">{'★'.repeat(Number(topic.rank) || 0)}</span>
        )}
        {topic.category && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-accent/10 text-accent-ink font-bold">{String(topic.category || '')}</span>
        )}
        {topic.tags?.map((tag, i) => <span key={String(tag || '') + i} className="text-[9px] px-1 py-0.5 rounded bg-accent/10 text-accent-ink font-bold">{String(tag || '')}</span>)}

        {/* Right-side actions */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <div onClick={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-6 h-6 rounded-lg flex items-center justify-center opacity-40 group-hover:opacity-100 hover:bg-muted/30 active:scale-[0.8] transition-[transform,opacity,background-color] duration-100">
                  <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} className="min-w-[190px] bg-card/95 backdrop-blur-xl border-border/20">
                <DropdownMenuItem onClick={onOpenDetail} className="gap-2 text-xs"><Pencil className="w-3 h-3" /> Edit Details</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onCycle} className="gap-2 text-xs">
                  {status === 'complete' ? <><Circle className="w-3 h-3" /> Mark Incomplete</> : status === 'in_process' ? <><CheckCircle2 className="w-3 h-3 text-secondary" /> Mark Complete</> : <><Clock className="w-3 h-3 text-chart-4" /> Start Progress</>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onToggleImportant} className="gap-2 text-xs">
                  <Star className={`w-3 h-3 ${topic.important ? 'fill-chart-4 text-chart-4' : ''}`} />
                  {topic.important ? 'Remove Star' : 'Star Important'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { navigator.clipboard?.writeText(formatTopicDetail(topic)); toast('📑 Details copied', { duration: 1200 }); }} className="gap-2 text-xs"><Copy className="w-3 h-3" /> Copy Full Details</DropdownMenuItem>
                {onDuplicate && <><DropdownMenuSeparator /><DropdownMenuItem onClick={onDuplicate} className="gap-2 text-xs"><Plus className="w-3 h-3" /> Duplicate</DropdownMenuItem></>}
                {onDelete && <DropdownMenuItem onClick={onDelete} className="gap-2 text-xs text-destructive focus:text-destructive"><Trash2 className="w-3 h-3" /> Delete</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onToggleImportant(); }} className="shrink-0 transition-transform duration-100 active:scale-150 active:rotate-[20deg]">
            <Star className={`w-4 h-4 transition-all ${topic.important ? 'fill-chart-4 text-chart-4' : 'text-muted-foreground/20 group-hover:text-muted-foreground/40'}`}
              style={topic.important ? { filter: 'drop-shadow(0 0 6px hsl(var(--chart-4) / 0.5))' } : undefined} />
          </button>
        </div>
      </div>

      {/* ── Status bar at bottom ── */}
      <div className="h-[4px] w-full" style={{
        backgroundColor: status === 'in_process'
            ? 'hsl(var(--chart-4))'
            : 'hsl(var(--border) / 0.15)',
      }} />
    </div>
  );
}
