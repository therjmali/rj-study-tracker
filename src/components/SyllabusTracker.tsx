import { useState, useCallback, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import type { Subject, SubTopic, HistoryEntry, TopicStatus, Unit, Folder, StudySession, TopicNavRef } from '../types';
import SyllabusHeader, { type SyllabusFilters } from './syllabus/SyllabusHeader';
import SubjectCard from './syllabus/SubjectCard';
import AddSubjectSheet from './syllabus/AddSubjectSheet';
import TopicDetailSheet from './syllabus/TopicDetailSheet';
import UnitDetailView from './syllabus/UnitDetailView';
import BulkSelectBar from './syllabus/BulkSelectBar';
import ImportSyllabusSheet from './syllabus/ImportSyllabusSheet';
import BulkImportSheet from './syllabus/BulkImportSheet';
import BottomSheet from './shared/BottomSheet';
import ConfirmDialog from './shared/ConfirmDialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Switch } from '@project/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { deleteRecords } from '@/platform/api';
import { ArrowLeft, Plus as PlusIcon, Search as SearchIcon, ImagePlus, ChevronDown, ChevronUp, ChevronRight, X, MoreHorizontal, MousePointer2, FileDown, ClipboardCopy } from 'lucide-react';
import DeepSearchToggle from './shared/DeepSearchToggle';
import CircularProgress from './shared/CircularProgress';
import SortBar, { type SortMode } from './syllabus/SortBar';
import FolderCard from './syllabus/FolderCard';
import CreateFolderSheet from './syllabus/CreateFolderSheet';
import MoveToSheet from './syllabus/MoveToSheet';
import FolderAnalytics from './syllabus/FolderAnalytics';
import ReportBuilder from './report/ReportBuilder';
import UnitListView from './syllabus/UnitListView';
import ErrorBoundary from './shared/ErrorBoundary';
import { getLocalDateStr, getLastActiveUnit } from '../lib/utils';
import { useBackGuard } from '../hooks/useBackGuard';
import { deepFilterSubjects, computeFilterCounts, getMatchingIds, topicMatchesSearch } from '../lib/syllabusFilter';
import { renumberTopicNumbers } from '../lib/renumberTopics';
import type { StatusFilter } from './shared/StatusFilterPills';
import StatusFilterPills from './shared/StatusFilterPills';
import type { DiffFilter } from './syllabus/SyllabusHeader';

interface Props {
  subjects: Subject[];
  onUpdate: (subjects: Subject[]) => void;
  activeLogDate: string;
  onHistoryLog: (entries: HistoryEntry[]) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onImportSubjects?: (subjects: Subject[]) => void;
  onTrashSubject?: (id: string) => void;
  dailyLogs?: import('../types').DailyLog[];
  onUpdateLogs?: (logs: import('../types').DailyLog[]) => void;
  pendingTopicDetail?: { topic: import('../types').SubTopic; subjectId: string; unitId: string } | null;
  onClearPendingTopic?: () => void;
  onOpenPomodoro?: (subjectId: string, unitId?: string, topicId?: string) => void;
  folders: Folder[];
  onUpdateFolders: (folders: Folder[]) => void;
  navTarget?: { subjectId?: string; unitId?: string } | null;
  onClearNavTarget?: () => void;
  onCreateSession?: (session: { date: string; minutes: number; description: string; type: 'Topic' | 'Unit' | 'Other'; subjectId?: string; subjectName?: string; topicId?: string; unitId?: string; startTime?: string; endTime?: string; note?: string }) => void;
}

// Helper: remove empty units that had topics before an operation
function cleanEmptyUnits(newSubjects: Subject[], oldSubjects: Subject[]): Subject[] {
  const oldUnitSizes = new Map<string, number>();
  oldSubjects.forEach(s => s.units.forEach(u => oldUnitSizes.set(u.id, u.subTopics.length)));
  return newSubjects.map(s => ({
    ...s,
    units: s.units.filter(u => u.subTopics.length > 0 || (oldUnitSizes.get(u.id) ?? 0) === 0),
  }));
}

export default function SyllabusTracker({ subjects, onUpdate, activeLogDate, onHistoryLog, canUndo, canRedo, onUndo, onRedo, onImportSubjects, onTrashSubject, dailyLogs, onUpdateLogs, pendingTopicDetail, onClearPendingTopic, onOpenPomodoro, folders, onUpdateFolders, navTarget, onClearNavTarget, onCreateSession }: Props) {
  const [search, setSearch] = useState('');
  // Typing stays instant; the heavy filtering follows one render behind (React keeps the input responsive)
  const deferredSearch = useDeferredValue(search);
  const [filters, setFilters] = useState<SyllabusFilters>({ status: 'all', difficulty: 'all' });
  const [categoryFilter, setCategoryFilter] = useState('');
  const [folderCategoryFilter, setFolderCategoryFilter] = useState('');
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  // Store previous expand state to restore when clearing filters
  const [preFilterExpanded, setPreFilterExpanded] = useState<{ subjects: Set<string>; units: Set<string> } | null>(null);

  // Auto-expand matching subjects/units and collapse non-matching when any filter changes
  // Use a ref to batch state updates and prevent cascading re-renders
  const isAutoExpandingRef = useRef(false);
  const preFilterExpandedRef = useRef<{ subjects: Set<string>; units: Set<string> } | null>(null);
  // Sync ref with state for reading in effects without stale closures
  preFilterExpandedRef.current = preFilterExpanded;

  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const hasActiveFilter = filters.status !== 'all' || filters.difficulty !== 'all';
    if (!hasActiveFilter) {
      // Restore pre-filter state when clearing all filters
      const saved = preFilterExpandedRef.current;
      if (saved) {
        isAutoExpandingRef.current = true;
        setExpandedSubjects(saved.subjects);
        setExpandedUnits(saved.units);
        setPreFilterExpanded(null);
        // Release guard after a full frame + microtask so React 18 batched updates settle
        clearTimeout(autoExpandTimerRef.current);
        autoExpandTimerRef.current = setTimeout(() => { isAutoExpandingRef.current = false; }, 80);
      }
      return;
    }
    // Save current expand state before first filter application
    if (!preFilterExpandedRef.current) {
      setPreFilterExpanded({ subjects: new Set(expandedSubjects), units: new Set(expandedUnits) });
    }
    isAutoExpandingRef.current = true;
    const filterState = { status: filters.status, difficulty: filters.difficulty, search };
    const { subjectIds, unitIds } = getMatchingIds(subjects, filterState);
    // Expand ONLY matching, collapse everything else
    setExpandedSubjects(subjectIds);
    setExpandedUnits(unitIds);
    clearTimeout(autoExpandTimerRef.current);
    autoExpandTimerRef.current = setTimeout(() => { isAutoExpandingRef.current = false; }, 80);
    return () => clearTimeout(autoExpandTimerRef.current);
  }, [filters.status, filters.difficulty]);

  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [editSubject, setEditSubject] = useState<Subject | null>(null);
  const [detailTopic, setDetailTopic] = useState<{ topic: SubTopic; subjectId: string; unitId: string } | null>(null);
  /** When the topic sheet was opened from a list (revision "next up", stat filters…) swipe / prev / next follow that list */
  const [detailNavList, setDetailNavList] = useState<TopicNavRef[] | null>(null);
  useEffect(() => { if (!detailTopic) setDetailNavList(null); }, [detailTopic]);
  // The sheet must show the CURRENT topic — undo / redo, timers and other screens change it behind the sheet's back.
  const liveDetail = useMemo(() => {
    if (!detailTopic) return null;
    const { topic, subjectId, unitId } = detailTopic;
    const inPlace = subjects.find(s => s.id === subjectId)?.units.find(u => u.id === unitId)?.subTopics.find(t => t.id === topic.id);
    if (inPlace) return { topic: inPlace, subjectId, unitId };
    for (const sj of subjects) for (const un of sj.units) {
      const t = un.subTopics.find(x => x.id === topic.id);
      if (t) return { topic: t, subjectId: sj.id, unitId: un.id };
    }
    return null;
  }, [detailTopic, subjects]);
  useEffect(() => { if (detailTopic && !liveDetail) setDetailTopic(null); }, [detailTopic, liveDetail]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [unitDetailData, setUnitDetailData] = useState<{ subjectId: string; unitId: string } | null>(null);

  // Topic Timer state

  // Report Builder state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSubjectId, setReportSubjectId] = useState<string | undefined>();
  const [reportUnitId, setReportUnitId] = useState<string | undefined>();
  const [reportFolderInfo, setReportFolderInfo] = useState<{ name: string; coverImage?: string } | undefined>();

  const handleOpenReport = useCallback((subjectId: string, unitId?: string) => {
    setReportSubjectId(subjectId);
    setReportUnitId(unitId);
    setReportFolderInfo(undefined);
    setReportOpen(true);
  }, []);

  const handleOpenFolderReport = useCallback((folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    setReportSubjectId(undefined);
    setReportUnitId(undefined);
    setReportFolderInfo({ name: folder.name, coverImage: folder.coverImage });
    // Pre-select all subjects in this folder
    setReportOpen(true);
  }, [folders]);

  // Folder system state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderFilters, setFolderFilters] = useState<SyllabusFilters>({ status: 'all', difficulty: 'all' });
  // folderFiltersExpanded removed — filters are now inline emoji chips
  const [sortMode, setSortMode] = useState<SortMode>('custom');
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [editFolderData, setEditFolderData] = useState<Folder | null>(null);
  const [moveToFolderOpen, setMoveToFolderOpen] = useState(false);
  const [moveSubjectId, setMoveSubjectId] = useState('');
  const [folderDeepSearch, setFolderDeepSearch] = useState(false);
  const [showFolderAnalytics, setShowFolderAnalytics] = useState(false);
  const [viewMode, setViewMode] = useState<'subjects' | 'units'>('subjects');
  const [toolbarOpen, setToolbarOpen] = useState(false);

  // Create Unit from Selected
  const [createUnitOpen, setCreateUnitOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [createUnitSubjectId, setCreateUnitSubjectId] = useState('');

  // Move Topics
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTargetSubject, setMoveTargetSubject] = useState('');
  const [moveTargetUnit, setMoveTargetUnit] = useState('');
  const [moveCreateNew, setMoveCreateNew] = useState(false);
  const [moveNewUnitName, setMoveNewUnitName] = useState('');

  // Copy Topics
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargetSubject, setCopyTargetSubject] = useState('');
  const [copyTargetUnit, setCopyTargetUnit] = useState('');
  const [copyCreateNew, setCopyCreateNew] = useState(false);
  const [copyNewUnitName, setCopyNewUnitName] = useState('');

  // ── Back button guards: phone back steps through hierarchy ──
  useBackGuard(!!currentFolderId && !unitDetailData && !detailTopic, () => {
    setCurrentFolderId(null);
    setFolderFilters({ status: 'all', difficulty: 'all' });
    setFolderCategoryFilter('');
  });
  useBackGuard(!!unitDetailData && !detailTopic, () => {
    setUnitDetailData(null);
  });
  useBackGuard(!!detailTopic, () => {
    setDetailTopic(null);
  });

  // Handle pending topic from external navigation (e.g., calendar click, global search)
  useEffect(() => {
    if (pendingTopicDetail) {
      // Clear unit detail view if the pending topic is from a different unit,
      // so the TopicDetailSheet opens cleanly from the syllabus list
      if (unitDetailData && (unitDetailData.subjectId !== pendingTopicDetail.subjectId || unitDetailData.unitId !== pendingTopicDetail.unitId)) {
        setUnitDetailData(null);
      }
      setDetailNavList(null);
      setDetailTopic(pendingTopicDetail);
      onClearPendingTopic?.();
    }
  }, [pendingTopicDetail]);

  // Handle nav target from dashboard — auto-expand subject/unit
  useEffect(() => {
    if (!navTarget) return;
    if (navTarget.subjectId) {
      const targetSubject = subjects.find(s => s.id === navTarget.subjectId);
      if (targetSubject?.folderId && targetSubject.folderId !== currentFolderId) {
        setCurrentFolderId(targetSubject.folderId);
      } else if (!targetSubject?.folderId && currentFolderId) {
        setCurrentFolderId(null);
      }
      if (navTarget.unitId) {
        setUnitDetailData({ subjectId: navTarget.subjectId, unitId: navTarget.unitId });
      } else {
        const lastUnit = getLastActiveUnit(targetSubject);
        if (lastUnit) {
          setUnitDetailData({ subjectId: navTarget.subjectId, unitId: lastUnit.id });
        } else {
          // Auto-expand the subject AND all its units (fallback when subject has no units)
          setExpandedSubjects(prev => new Set([...prev, navTarget.subjectId!]));
          if (targetSubject) {
            const unitIds = targetSubject.units.map(u => u.id);
            setExpandedUnits(prev => new Set([...prev, ...unitIds]));
          }
          setTimeout(() => {
            document.getElementById(`subject-${navTarget.subjectId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 350);
        }
      }
    }
    onClearNavTarget?.();
  }, [navTarget]);

  // Extract all unique categories from topics
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    (subjects || []).forEach(s => (s.units || []).forEach(u => (u.subTopics || []).forEach(t => {
      if (t.category) cats.add(String(t.category));
    })));
    return Array.from(cats).sort();
  }, [subjects]);

  const totalTopics = useMemo(() => subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0), [subjects]);
  const doneTopics = useMemo(() => subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0), [subjects]);

  // Unified filter counts for the header (from ALL subjects, not just displayed)
  const filterCounts = useMemo(() => computeFilterCounts(subjects), [subjects]);
  const studyPace = useMemo(() => {
    const wa = new Date(); wa.setDate(wa.getDate() - 7);
    const weekAgo = getLocalDateStr(wa);
    let count = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate >= weekAgo) count++;
    })));
    return Math.max(1, Math.round(count / 7));
  }, [subjects]);

  // Subject summary for clipboard indicator
  const subjectSummary = useMemo(() => {
    if (selectedTopics.size === 0) return '';
    const counts: Record<string, { name: string; count: number }> = {};
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (selectedTopics.has(t.id)) {
        if (!counts[s.id]) counts[s.id] = { name: s.shortName, count: 0 };
        counts[s.id].count++;
      }
    })));
    return Object.values(counts).map(c => `${c.name}: ${c.count}`).join(' · ');
  }, [subjects, selectedTopics]);

  // Default subject for create unit dialog
  const defaultCreateSubjectId = useMemo(() => {
    if (selectedTopics.size === 0) return subjects[0]?.id || '';
    const counts: Record<string, number> = {};
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (selectedTopics.has(t.id)) counts[s.id] = (counts[s.id] || 0) + 1;
    })));
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || subjects[0]?.id || '';
  }, [subjects, selectedTopics]);

  // ===== CENTRALIZED RENUMBER WRAPPER =====
  // Every handler that changes topic order or count should call this instead of onUpdate directly.
  // It applies renumberTopicNumbers to every subject with showTopicNumbers enabled,
  // atomically in the same state update — no setTimeout, no race conditions.
  const updateAndRenumber = useCallback((newSubjects: Subject[]) => {
    const renumbered = newSubjects.map(s => renumberTopicNumbers(s));
    onUpdate(renumbered);
  }, [onUpdate]);

  const detailSubject = unitDetailData ? subjects.find(s => s.id === unitDetailData.subjectId) : null;
  const detailUnit = detailSubject ? detailSubject.units.find(u => u.id === unitDetailData?.unitId) : null;
  const detailUnitIndex = detailSubject ? detailSubject.units.findIndex(u => u.id === unitDetailData?.unitId) : -1;

  const toggleExpand = useCallback((id: string) => {
    if (isAutoExpandingRef.current) return;
    setExpandedSubjects(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const toggleUnit = useCallback((id: string) => {
    // Guard: skip if auto-expand is in progress to prevent state conflicts
    if (isAutoExpandingRef.current) return;
    setExpandedUnits(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const expandAllUnits = useCallback((unitIds: string[]) => {
    setExpandedUnits(prev => {
      const allExpanded = unitIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allExpanded) { unitIds.forEach(id => next.delete(id)); }
      else { unitIds.forEach(id => next.add(id)); }
      return next;
    });
  }, []);

  const makeTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  const toggleTopic = useCallback((subjectId: string, unitId: string, topicId: string) => {
    const s = subjects.find(x => x.id === subjectId);
    const u = s?.units.find(x => x.id === unitId);
    const t = u?.subTopics.find(x => x.id === topicId);
    if (!s || !u || !t) return;
    const nc = !t.completed;
    onHistoryLog([{ id: `${Date.now()}-${topicId}`, type: nc ? 'topic_complete' : 'topic_uncomplete', timestamp: new Date().toISOString(), date: activeLogDate, time: makeTime(), subjectName: s.shortName, subjectColor: s.color, unitName: u.name, topicName: t.name, icon: nc ? '✅' : '↩️' }]);
    onUpdate(subjects.map(x => x.id !== subjectId ? x : { ...x, units: x.units.map(y => y.id !== unitId ? y : { ...y, subTopics: y.subTopics.map(z => z.id !== topicId ? z : { ...z, completed: nc, status: nc ? 'complete' as const : 'incomplete' as const, completedDate: nc ? (z.completedDate || activeLogDate) : undefined, completedTime: nc ? (z.completedTime || makeTime()) : undefined }) }) }));
  }, [subjects, onUpdate, activeLogDate, onHistoryLog]);

  const toggleImportant = useCallback((subjectId: string, unitId: string, topicId: string) => {
    onUpdate(subjects.map(s => s.id !== subjectId ? s : { ...s, units: s.units.map(u => u.id !== unitId ? u : { ...u, subTopics: u.subTopics.map(t => t.id !== topicId ? t : { ...t, important: !t.important }) }) }));
  }, [subjects, onUpdate]);

  // Bulk toggle state for confirmation
  const [bulkToggleConfirm, setBulkToggleConfirm] = useState<{ subjectId: string; unitId: string; unitName: string; topicCount: number; markAs: boolean } | null>(null);

  const bulkToggleUnit = useCallback((subjectId: string, unitId: string) => {
    const s = subjects.find(x => x.id === subjectId); const u = s?.units.find(x => x.id === unitId);
    if (!s || !u) return;
    const allDone = u.subTopics.every(t => t.completed); const markAs = !allDone;
    const affected = u.subTopics.filter(t => t.completed !== markAs).length;
    if (affected > 0) {
      setBulkToggleConfirm({ subjectId, unitId, unitName: u.name, topicCount: affected, markAs });
    }
  }, [subjects]);

  const executeBulkToggle = useCallback(() => {
    if (!bulkToggleConfirm) return;
    const { subjectId, unitId, markAs } = bulkToggleConfirm;
    const s = subjects.find(x => x.id === subjectId); const u = s?.units.find(x => x.id === unitId);
    if (!s || !u) { setBulkToggleConfirm(null); return; }
    const entries: HistoryEntry[] = u.subTopics.filter(t => t.completed !== markAs).map(t => ({ id: `${Date.now()}-${t.id}`, type: markAs ? 'topic_complete' as const : 'topic_uncomplete' as const, timestamp: new Date().toISOString(), date: activeLogDate, time: makeTime(), subjectName: s.shortName, subjectColor: s.color, unitName: u.name, topicName: t.name, icon: markAs ? '✅' : '↩️' }));
    if (entries.length) onHistoryLog(entries);
    onUpdate(subjects.map(x => x.id !== subjectId ? x : { ...x, units: x.units.map(y => y.id !== unitId ? y : { ...y, subTopics: y.subTopics.map(t => ({ ...t, completed: markAs, status: markAs ? 'complete' as const : 'incomplete' as const, completedDate: markAs ? (t.completedDate || activeLogDate) : undefined, completedTime: markAs ? (t.completedTime || makeTime()) : undefined })) }) }));
    toast.success(`${markAs ? 'Completed' : 'Uncompleted'} ${bulkToggleConfirm.topicCount} topics in "${bulkToggleConfirm.unitName}"`);
    setBulkToggleConfirm(null);
  }, [bulkToggleConfirm, subjects, onUpdate, activeLogDate, onHistoryLog]);

  const handleSaveSubject = useCallback((s: Subject) => {
    const exists = subjects.find(x => x.id === s.id);
    const withMeta = exists ? s : { ...s, folderId: currentFolderId || undefined, order: s.order ?? Date.now() };
    updateAndRenumber(exists ? subjects.map(x => x.id === s.id ? withMeta : x) : [...subjects, withMeta]);
    toast.success(exists ? 'Subject updated' : 'Subject added');
  }, [subjects, updateAndRenumber, currentFolderId]);

  const handleDuplicateSubject = useCallback((id: string) => {
    const subject = subjects.find(s => s.id === id);
    if (!subject) return;
    const ts = Date.now();
    const dup: Subject = {
      ...subject, id: `${subject.id}-dup-${ts}`, name: `${subject.name} (Copy)`, shortName: `${subject.shortName}C`,
      units: subject.units.map((u, ui) => ({ ...u, id: `${u.id}-dup-${ts}-${ui}`, subTopics: u.subTopics.map((t, ti) => ({ ...t, id: `${t.id}-dup-${ts}-${ui}-${ti}`, completed: false, completedDate: undefined, completedTime: undefined, status: 'incomplete' as const })) })),
    };
    onUpdate([...subjects, dup]);
  }, [subjects, onUpdate]);

  const handleDeleteSubject = useCallback((id: string) => {
    if (onTrashSubject) { onTrashSubject(id); } else {
      onUpdate(subjects.filter(x => x.id !== id));
      deleteRecords({ subjectIds: [id] }).catch(() => {});
      toast.success('Subject deleted');
    }
  }, [subjects, onUpdate, onTrashSubject]);

  const handleRenameUnit = useCallback((subjectId: string, unitId: string, name: string) => {
    updateAndRenumber(subjects.map(s => s.id !== subjectId ? s : { ...s, units: s.units.map(u => u.id !== unitId ? u : { ...u, name }) }));
  }, [subjects, updateAndRenumber]);

  const handleDeleteUnit = useCallback((subjectId: string, unitId: string) => {
    updateAndRenumber(subjects.map(s => s.id !== subjectId ? s : { ...s, units: s.units.filter(u => u.id !== unitId) }));
    // Delete unit + its topics from cloud DB
    deleteRecords({ unitIds: [unitId] }).catch(() => {});
    toast.success('Unit deleted');
  }, [subjects, updateAndRenumber]);

  const handleAddUnit = useCallback((subjectId: string, unit: Unit) => {
    updateAndRenumber(subjects.map(s => s.id !== subjectId ? s : { ...s, units: [...s.units, unit] }));
    toast.success('Unit added');
  }, [subjects, updateAndRenumber]);

  const handleAddTopic = useCallback((subjectId: string, unitId: string, topic: SubTopic) => {
    updateAndRenumber(subjects.map(s => s.id !== subjectId ? s : { ...s, units: s.units.map(u => u.id !== unitId ? u : { ...u, subTopics: [...u.subTopics, topic] }) }));
    toast.success('Topic added');
  }, [subjects, updateAndRenumber]);

  const handleSaveTopic = useCallback((topic: SubTopic) => {
    if (!detailTopic) return;
    const { subjectId, unitId } = detailTopic;
    const sub = subjects.find(s => s.id === subjectId);
    const oldTopic = sub?.units.find(u => u.id === unitId)?.subTopics.find(t => t.id === topic.id);
    const timeDiffMinutes = (topic.timeSpent || 0) - (oldTopic?.timeSpent || 0);

    // Session creation is now handled at point-of-entry (addTime / timer) in TopicDetailSheet.
    // handleSaveTopic only persists the topic data — no session creation here.

    onHistoryLog([{ id: `${Date.now()}-edit`, type: 'difficulty_change', timestamp: new Date().toISOString(), date: activeLogDate, time: makeTime(), subjectName: sub?.shortName || '', subjectColor: sub?.color || '', unitName: '', topicName: topic.name, icon: '✏️' }]);
    updateAndRenumber(subjects.map(s => s.id !== subjectId ? s : { ...s, units: s.units.map(u => u.id !== unitId ? u : { ...u, subTopics: u.subTopics.map(t => t.id !== topic.id ? t : topic) }) }));
    toast.success('Topic saved');
  }, [subjects, updateAndRenumber, detailTopic, activeLogDate, onHistoryLog, dailyLogs, onUpdateLogs]);

  const handleDeleteTopic = useCallback(() => {
    if (!detailTopic) return;
    const { subjectId, unitId, topic } = detailTopic;
    updateAndRenumber(subjects.map(s => s.id !== subjectId ? s : { ...s, units: s.units.map(u => u.id !== unitId ? u : { ...u, subTopics: u.subTopics.filter(t => t.id !== topic.id) }) }));
    // Delete topic from cloud DB
    deleteRecords({ topicIds: [topic.id] }).catch(() => {});
    toast.success('Topic deleted');
  }, [subjects, updateAndRenumber, detailTopic]);

  const handleBulkAction = useCallback((action: 'complete' | 'incomplete' | 'star' | 'delete') => {
    const sel = selectedTopics;
    if (sel.size === 0) return;
    if (action === 'delete') {
      const result = subjects.map(s => ({ ...s, units: s.units.map(u => ({ ...u, subTopics: u.subTopics.filter(t => !sel.has(t.id)) })) }));
      updateAndRenumber(cleanEmptyUnits(result, subjects));
      // Delete topics from cloud DB
      deleteRecords({ topicIds: Array.from(sel) }).catch(() => {});
    } else {
      onUpdate(subjects.map(s => ({ ...s, units: s.units.map(u => ({ ...u, subTopics: u.subTopics.map(t => {
        if (!sel.has(t.id)) return t;
        if (action === 'complete') return { ...t, completed: true, status: 'complete' as const, completedDate: activeLogDate, completedTime: makeTime() };
        if (action === 'incomplete') return { ...t, completed: false, status: 'incomplete' as const, completedDate: undefined, completedTime: undefined };
        return { ...t, important: !t.important };
      }) })) })));
    }
    toast.success(`${action === 'delete' ? 'Deleted' : 'Updated'} ${sel.size} topics`);
    setSelectedTopics(new Set()); setSelectMode(false);
  }, [subjects, onUpdate, selectedTopics, activeLogDate]);

  // ===== CREATE UNIT FROM SELECTED TOPICS =====
  const handleCreateUnitFromSelected = useCallback(() => {
    if (!newUnitName.trim() || selectedTopics.size === 0) return;
    const targetSubjectId = createUnitSubjectId || defaultCreateSubjectId;
    if (!targetSubjectId) return;

    const selectedList: SubTopic[] = [];
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (selectedTopics.has(t.id)) selectedList.push(t);
    })));
    if (selectedList.length === 0) return;

    const newUnit: Unit = { id: `cu-${Date.now()}`, name: newUnitName.trim(), subTopics: selectedList };

    const result = subjects.map(s => {
      const cleanedUnits = s.units.map(u => ({ ...u, subTopics: u.subTopics.filter(t => !selectedTopics.has(t.id)) }));
      if (s.id === targetSubjectId) return { ...s, units: [...cleanedUnits, newUnit] };
      return { ...s, units: cleanedUnits };
    });

    updateAndRenumber(cleanEmptyUnits(result, subjects));
    toast.success(`Created "${newUnitName}" with ${selectedList.length} topics`);
    setSelectedTopics(new Set()); setSelectMode(false); setCreateUnitOpen(false); setNewUnitName(''); setCreateUnitSubjectId('');
  }, [subjects, onUpdate, selectedTopics, newUnitName, createUnitSubjectId, defaultCreateSubjectId]);

  // ===== MOVE TOPICS TO UNIT =====
  const handleMoveTopics = useCallback(() => {
    if (!moveTargetSubject || selectedTopics.size === 0) return;
    // Determine target unit (existing or new)
    let targetUnitId = moveTargetUnit;
    let newUnit: Unit | null = null;
    if (moveCreateNew) {
      if (!moveNewUnitName.trim()) return;
      newUnit = { id: `mu-${Date.now()}`, name: moveNewUnitName.trim(), subTopics: [] };
      targetUnitId = newUnit.id;
    }
    if (!targetUnitId) return;

    const movedTopics: SubTopic[] = [];
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (selectedTopics.has(t.id)) movedTopics.push(t);
    })));

    const result = subjects.map(s => {
      let units = s.units.map(u => ({ ...u, subTopics: u.subTopics.filter(t => !selectedTopics.has(t.id)) }));
      if (s.id === moveTargetSubject) {
        if (newUnit) units = [...units, { ...newUnit, subTopics: movedTopics }];
        else units = units.map(u => u.id === targetUnitId ? { ...u, subTopics: [...u.subTopics, ...movedTopics] } : u);
      }
      return { ...s, units };
    });

    updateAndRenumber(cleanEmptyUnits(result, subjects));
    toast.success(`Moved ${movedTopics.length} topics`);
    setSelectedTopics(new Set()); setSelectMode(false); setMoveOpen(false); setMoveTargetSubject(''); setMoveTargetUnit(''); setMoveCreateNew(false); setMoveNewUnitName('');
  }, [subjects, onUpdate, selectedTopics, moveTargetSubject, moveTargetUnit, moveCreateNew, moveNewUnitName]);

  // ===== COPY TOPICS TO UNIT =====
  const handleCopyTopics = useCallback(() => {
    if (!copyTargetSubject || selectedTopics.size === 0) return;
    let targetUnitId = copyTargetUnit;
    let newUnit: Unit | null = null;
    if (copyCreateNew) {
      if (!copyNewUnitName.trim()) return;
      newUnit = { id: `cpu-${Date.now()}`, name: copyNewUnitName.trim(), subTopics: [] };
      targetUnitId = newUnit.id;
    }
    if (!targetUnitId) return;

    const ts = Date.now();
    const copiedTopics: SubTopic[] = [];
    let i = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (selectedTopics.has(t.id)) {
        copiedTopics.push({ ...t, id: `${t.id}-copy-${ts}-${i++}`, completed: false, completedDate: undefined, completedTime: undefined, status: 'incomplete' as const });
      }
    })));

    const result = subjects.map(s => {
      if (s.id !== copyTargetSubject) return s;
      let units = [...s.units];
      if (newUnit) units = [...units, { ...newUnit, subTopics: copiedTopics }];
      else units = units.map(u => u.id === targetUnitId ? { ...u, subTopics: [...u.subTopics, ...copiedTopics] } : u);
      return { ...s, units };
    });

    updateAndRenumber(result);
    toast.success(`Copied ${copiedTopics.length} topics`);
    setSelectedTopics(new Set()); setSelectMode(false); setCopyOpen(false); setCopyTargetSubject(''); setCopyTargetUnit(''); setCopyCreateNew(false); setCopyNewUnitName('');
  }, [subjects, onUpdate, selectedTopics, copyTargetSubject, copyTargetUnit, copyCreateNew, copyNewUnitName]);

  // ===== MERGE UNITS (fixed positioning) =====
  const handleMergeUnits = useCallback((subjectId: string, unitIds: string[]) => {
    if (unitIds.length < 2) return;
    updateAndRenumber(subjects.map(s => {
      if (s.id !== subjectId) return s;
      const mergeUnits = s.units.filter(u => unitIds.includes(u.id));
      // Use the first selected unit in original order
      const firstIdx = s.units.findIndex(u => unitIds.includes(u.id));
      const firstUnit = s.units[firstIdx];
      if (!firstUnit) return s;
      const allTopics = mergeUnits.flatMap(u => u.subTopics);
      const mergedUnit = { ...firstUnit, subTopics: allTopics };
      const remaining = s.units.filter(u => !unitIds.includes(u.id));
      // Insert merged unit at the position of the first selected unit
      remaining.splice(firstIdx, 0, mergedUnit);
      return { ...s, units: remaining };
    }));
    toast.success(`Merged ${unitIds.length} units`);
  }, [subjects, updateAndRenumber]);

  const toggleSelect = useCallback((id: string) => setSelectedTopics(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);

  // Select All in Unit
  const handleSelectAllInUnit = useCallback((topicIds: string[]) => {
    setSelectedTopics(prev => {
      const n = new Set(prev);
      const allSelected = topicIds.every(id => n.has(id));
      if (allSelected) topicIds.forEach(id => n.delete(id));
      else topicIds.forEach(id => n.add(id));
      return n;
    });
  }, []);

  // Select All visible topics
  const handleSelectAll = useCallback(() => {
    const all = new Set<string>();
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => all.add(t.id))));
    setSelectedTopics(all);
  }, [subjects]);

  const handleDeselectAll = useCallback(() => {
    setSelectedTopics(new Set());
  }, []);

  const handleImportedSubjects = useCallback((imported: Subject[]) => {
    if (onImportSubjects) { onImportSubjects(imported); } else { onUpdate([...subjects, ...imported]); }
  }, [onImportSubjects, subjects, onUpdate]);

  // ===== Unit Detail View Handlers =====
  const handleUnitDetailToggle = useCallback((topicId: string) => {
    if (!unitDetailData) return;
    toggleTopic(unitDetailData.subjectId, unitDetailData.unitId, topicId);
  }, [unitDetailData, toggleTopic]);

  const handleUnitDetailImportant = useCallback((topicId: string) => {
    if (!unitDetailData) return;
    toggleImportant(unitDetailData.subjectId, unitDetailData.unitId, topicId);
  }, [unitDetailData, toggleImportant]);

  const handleUnitDetailOpenDetail = useCallback((topic: SubTopic) => {
    if (!unitDetailData) return;
    setDetailNavList(null);
    setDetailTopic({ topic, subjectId: unitDetailData.subjectId, unitId: unitDetailData.unitId });
  }, [unitDetailData]);

  // ===== Topic prev/next navigation (crosses unit boundaries) =====
  const topicNavInfo = useMemo(() => {
    if (!detailTopic) return { hasPrev: false, hasNext: false, topicIndex: 0, totalTopics: 0 };
    if (detailNavList) {
      const at = detailNavList.findIndex(r => r.topicId === detailTopic.topic.id);
      if (at >= 0) return { hasPrev: at > 0, hasNext: at < detailNavList.length - 1, topicIndex: at, totalTopics: detailNavList.length };
    }
    const sub = subjects.find(s => s.id === detailTopic.subjectId);
    const unit = sub?.units.find(u => u.id === detailTopic.unitId);
    if (!unit || !sub) return { hasPrev: false, hasNext: false, topicIndex: 0, totalTopics: 0 };
    const idx = unit.subTopics.findIndex(t => t.id === detailTopic.topic.id);
    const unitIdx = sub.units.findIndex(u => u.id === unit.id);
    // Can go prev: either not first topic in unit, or there's a previous unit with topics
    const hasPrevInUnit = idx > 0;
    const hasPrevUnit = unitIdx > 0 && sub.units.slice(0, unitIdx).some(u => u.subTopics.length > 0);
    // Can go next: either not last topic in unit, or there's a next unit with topics
    const hasNextInUnit = idx < unit.subTopics.length - 1;
    const hasNextUnit = unitIdx < sub.units.length - 1 && sub.units.slice(unitIdx + 1).some(u => u.subTopics.length > 0);
    return { hasPrev: hasPrevInUnit || hasPrevUnit, hasNext: hasNextInUnit || hasNextUnit, topicIndex: Math.max(0, idx), totalTopics: unit.subTopics.length };
  }, [detailTopic, subjects, detailNavList]);

  // Use refs to always have latest state in navigation callbacks (avoids stale closures in setTimeout)
  const subjectsRef = useRef(subjects);
  subjectsRef.current = subjects;
  const detailTopicRef = useRef(detailTopic);
  detailTopicRef.current = detailTopic;
  const detailNavListRef = useRef(detailNavList);
  detailNavListRef.current = detailNavList;

  const handleNavigateTopic = useCallback((direction: 'prev' | 'next') => {
    const currentDetail = detailTopicRef.current;
    const currentSubjects = subjectsRef.current;
    if (!currentDetail) return;
    // Opened from a list (revision next-up, stat filter…) → follow that list
    const list = detailNavListRef.current;
    const at = list ? list.findIndex(r => r.topicId === currentDetail.topic.id) : -1;
    if (list && at >= 0) {
      const step = direction === 'prev' ? -1 : 1;
      for (let i = at + step; i >= 0 && i < list.length; i += step) {
        const ref = list[i];
        const topic = currentSubjects.find(s => s.id === ref.subjectId)?.units.find(u => u.id === ref.unitId)?.subTopics.find(t => t.id === ref.topicId);
        if (topic) { setDetailTopic({ topic, subjectId: ref.subjectId, unitId: ref.unitId }); return; }
      }
      return;
    }
    const sub = currentSubjects.find(s => s.id === currentDetail.subjectId);
    const unit = sub?.units.find(u => u.id === currentDetail.unitId);
    if (!unit || !sub) return;
    const idx = unit.subTopics.findIndex(t => t.id === currentDetail.topic.id);
    const targetIdx = direction === 'prev' ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < unit.subTopics.length) {
      setDetailTopic({ topic: unit.subTopics[targetIdx], subjectId: currentDetail.subjectId, unitId: currentDetail.unitId });
    } else {
      // Cross unit boundary
      const unitIdx = sub.units.findIndex(u => u.id === unit.id);
      if (direction === 'next') {
        for (let i = unitIdx + 1; i < sub.units.length; i++) {
          if (sub.units[i].subTopics.length > 0) {
            const nextUnit = sub.units[i];
            setDetailTopic({ topic: nextUnit.subTopics[0], subjectId: currentDetail.subjectId, unitId: nextUnit.id });
            toast(`📁 Unit ${i + 1}: ${nextUnit.name}`, { duration: 1500 });
            return;
          }
        }
      } else {
        for (let i = unitIdx - 1; i >= 0; i--) {
          if (sub.units[i].subTopics.length > 0) {
            const prevUnit = sub.units[i];
            const lastTopic = prevUnit.subTopics[prevUnit.subTopics.length - 1];
            setDetailTopic({ topic: lastTopic, subjectId: currentDetail.subjectId, unitId: prevUnit.id });
            toast(`📁 Unit ${i + 1}: ${prevUnit.name}`, { duration: 1500 });
            return;
          }
        }
      }
    }
  }, []);

  const handleNavigateToTopic = useCallback((subjectId: string, unitId: string, topicId: string) => {
    const currentSubjects = subjectsRef.current;
    const sub = currentSubjects.find(s => s.id === subjectId);
    const unit = sub?.units.find(u => u.id === unitId);
    const topic = unit?.subTopics.find(t => t.id === topicId);
    if (!topic) return;
    setDetailTopic({ topic, subjectId, unitId });
  }, []);

  const handleUnitDetailCycleStatus = useCallback((topicId: string, newStatus: TopicStatus) => {
    if (!unitDetailData) return;
    const { subjectId, unitId } = unitDetailData;
    const s = subjects.find(x => x.id === subjectId);
    const u = s?.units.find(x => x.id === unitId);
    const t = u?.subTopics.find(x => x.id === topicId);
    if (!s || !u || !t) return;
    if (newStatus === 'complete') {
      onHistoryLog([{ id: `${Date.now()}-${topicId}`, type: 'topic_complete', timestamp: new Date().toISOString(), date: activeLogDate, time: makeTime(), subjectName: s.shortName, subjectColor: s.color, unitName: u.name, topicName: t.name, icon: '✅' }]);
    }
    onUpdate(subjects.map(x => x.id !== subjectId ? x : {
      ...x, units: x.units.map(y => y.id !== unitId ? y : {
        ...y, subTopics: y.subTopics.map(z => z.id !== topicId ? z : {
          ...z, status: newStatus, completed: newStatus === 'complete',
          // Preserve existing date — only default to activeLogDate if no date was set
          completedDate: newStatus === 'incomplete' ? undefined : (z.completedDate || activeLogDate),
          completedTime: newStatus === 'incomplete' ? undefined : (newStatus === 'complete' ? (z.completedTime || makeTime()) : z.completedTime),
        })
      })
    }));
  }, [unitDetailData, subjects, onUpdate, activeLogDate, onHistoryLog]);

  const handleUnitDetailAddTopic = useCallback((topic: SubTopic) => {
    if (!unitDetailData) return;
    handleAddTopic(unitDetailData.subjectId, unitDetailData.unitId, topic);
  }, [unitDetailData, handleAddTopic]);

  const handleUnitDetailLogStudyTime = useCallback((minutes: number, date: string, note: string) => {
    if (!unitDetailData) return;
    const { subjectId, unitId } = unitDetailData;
    const sub = subjects.find(s => s.id === subjectId);
    const unit = sub?.units.find(u => u.id === unitId);
    if (!sub || !unit) return;
    const unitNote = note || `Unit study session`;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Use unified createStudySession — it handles dailyLogs, dbSessions, AND unit timeSpent/timeEntries
    if (onCreateSession) {
      onCreateSession({
        date,
        minutes,
        description: `[${unit.name}] ${unitNote}`,
        type: 'Unit',
        subjectId: sub.id,
        subjectName: sub.shortName,
        unitId,
        startTime: timeStr,
        note: unitNote,
      });
    } else {
      // Legacy fallback — update unit time directly + dailyLogs
      onUpdate(subjects.map(s => s.id !== subjectId ? s : {
        ...s, units: s.units.map(u => u.id !== unitId ? u : {
          ...u,
          timeSpent: (u.timeSpent || 0) + minutes,
          timeEntries: [...(u.timeEntries || []), { date, minutes, note: unitNote }],
        })
      }));
      if (dailyLogs && onUpdateLogs) {
        const session: StudySession = {
          id: `sess-${Date.now()}`,
          subjectId: sub.id,
          subjectName: sub.shortName,
          durationMinutes: minutes,
          note: `[${unit.name}] ${unitNote}`,
          startTime: timeStr,
        };
        const existingLog = dailyLogs.find(l => l.date === date);
        if (existingLog) {
          onUpdateLogs(dailyLogs.map(l => l.date !== date ? l : {
            ...l,
            hoursStudied: Math.round((l.hoursStudied + minutes / 60) * 100) / 100,
            sessions: [...(l.sessions || []), session],
          }));
        } else {
          onUpdateLogs([...dailyLogs, {
            date, hoursStudied: Math.round((minutes / 60) * 100) / 100, topicsCompleted: 0,
            notes: unitNote, subjectFocus: sub.shortName, sessions: [session],
          }]);
        }
      }
    }

    onHistoryLog([{
      id: `${Date.now()}-time`, type: 'difficulty_change' as const,
      timestamp: new Date().toISOString(), date, time: timeStr,
      subjectName: sub.shortName, subjectColor: sub.color,
      unitName: unit.name, topicName: `${unit.name} (unit log)`, icon: '⏱️',
    }]);
  }, [unitDetailData, subjects, onUpdate, onHistoryLog, dailyLogs, onUpdateLogs, onCreateSession]);

  const handleUnitDetailDeleteTopic = useCallback((topicId: string) => {
    if (!unitDetailData) return;
    const { subjectId, unitId } = unitDetailData;
    updateAndRenumber(subjects.map(s => s.id !== subjectId ? s : {
      ...s, units: s.units.map(u => u.id !== unitId ? u : {
        ...u, subTopics: u.subTopics.filter(t => t.id !== topicId)
      })
    }));
    deleteRecords({ topicIds: [topicId] }).catch(() => {});
  }, [unitDetailData, subjects, updateAndRenumber]);

  const handleUnitDetailBulkToggle = useCallback(() => {
    if (!unitDetailData) return;
    bulkToggleUnit(unitDetailData.subjectId, unitDetailData.unitId);
  }, [unitDetailData, bulkToggleUnit]);

  const handleUnitDetailDelete = useCallback(() => {
    if (!unitDetailData) return;
    handleDeleteUnit(unitDetailData.subjectId, unitDetailData.unitId);
    setUnitDetailData(null);
  }, [unitDetailData, handleDeleteUnit]);

  const handleUnitDetailRename = useCallback((name: string) => {
    if (!unitDetailData) return;
    handleRenameUnit(unitDetailData.subjectId, unitDetailData.unitId, name);
  }, [unitDetailData, handleRenameUnit]);

  const handleNavigateUnit = useCallback((direction: 'prev' | 'next') => {
    if (!unitDetailData || !detailSubject) return;
    const idx = detailSubject.units.findIndex(u => u.id === unitDetailData.unitId);
    const targetIdx = direction === 'prev' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= detailSubject.units.length) return;
    setUnitDetailData({ subjectId: unitDetailData.subjectId, unitId: detailSubject.units[targetIdx].id });
  }, [unitDetailData, detailSubject]);

  const handleNavigateToUnit = useCallback((targetIndex: number) => {
    if (!unitDetailData || !detailSubject) return;
    if (targetIndex < 0 || targetIndex >= detailSubject.units.length) return;
    setUnitDetailData({ subjectId: unitDetailData.subjectId, unitId: detailSubject.units[targetIndex].id });
  }, [unitDetailData, detailSubject]);

  const handleReorderUnits = useCallback((subjectId: string, unitIds: string[]) => {
    updateAndRenumber(subjects.map(s => {
      if (s.id !== subjectId) return s;
      const unitMap = new Map(s.units.map(u => [u.id, u]));
      const reordered = unitIds.map(id => unitMap.get(id)).filter(Boolean) as typeof s.units;
      return { ...s, units: reordered };
    }));
    toast.success('Units reordered');
  }, [subjects, updateAndRenumber]);

  // ===== CYCLE TOPIC STATUS (3-state: incomplete → in_process → complete) =====
  const handleCycleTopicStatus = useCallback((subjectId: string, unitId: string, topicId: string, newStatus: import('../types').TopicStatus) => {
    const s = subjects.find(x => x.id === subjectId);
    const u = s?.units.find(x => x.id === unitId);
    const t = u?.subTopics.find(x => x.id === topicId);
    if (!s || !u || !t) return;
    if (newStatus === 'complete') {
      onHistoryLog([{ id: `${Date.now()}-${topicId}`, type: 'topic_complete', timestamp: new Date().toISOString(), date: activeLogDate, time: makeTime(), subjectName: s.shortName, subjectColor: s.color, unitName: u.name, topicName: t.name, icon: '✅' }]);
    } else if (newStatus === 'incomplete' && t.completed) {
      onHistoryLog([{ id: `${Date.now()}-${topicId}`, type: 'topic_uncomplete', timestamp: new Date().toISOString(), date: activeLogDate, time: makeTime(), subjectName: s.shortName, subjectColor: s.color, unitName: u.name, topicName: t.name, icon: '↩️' }]);
    }
    onUpdate(subjects.map(x => x.id !== subjectId ? x : {
      ...x, units: x.units.map(y => y.id !== unitId ? y : {
        ...y, subTopics: y.subTopics.map(z => z.id !== topicId ? z : {
          ...z, status: newStatus, completed: newStatus === 'complete',
          completedDate: newStatus === 'incomplete' ? undefined : (z.completedDate || activeLogDate),
          completedTime: newStatus === 'incomplete' ? undefined : (newStatus === 'complete' ? (z.completedTime || makeTime()) : z.completedTime),
        })
      })
    }));
  }, [subjects, onUpdate, activeLogDate, onHistoryLog]);

  // ===== CYCLE TOPIC DIFFICULTY (Easy → Medium → Hard → Easy) =====
  const handleCycleDifficulty = useCallback((subjectId: string, unitId: string, topicId: string, newDifficulty: 'Easy' | 'Medium' | 'Hard') => {
    onUpdate(subjects.map(s => s.id !== subjectId ? s : {
      ...s, units: s.units.map(u => u.id !== unitId ? u : {
        ...u, subTopics: u.subTopics.map(t => t.id !== topicId ? t : { ...t, difficulty: newDifficulty }),
      }),
    }));
  }, [subjects, onUpdate]);

  // ===== REORDER TOPIC WITHIN UNIT (auto-updates universal SR numbers) =====
  const handleReorderTopic = useCallback((subjectId: string, unitId: string, topicId: string, direction: 'up' | 'down') => {
    updateAndRenumber(subjects.map(s => s.id !== subjectId ? s : {
      ...s, units: s.units.map(u => {
        if (u.id !== unitId) return u;
        const topics = [...u.subTopics];
        const idx = topics.findIndex(t => t.id === topicId);
        if (idx < 0) return u;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= topics.length) return u;
        [topics[idx], topics[targetIdx]] = [topics[targetIdx], topics[idx]];
        return { ...u, subTopics: topics };
      })
    }));
  }, [subjects, updateAndRenumber]);

  const handleMoveUnit = useCallback((subjectId: string, unitId: string, direction: 'up' | 'down') => {
    updateAndRenumber(subjects.map(s => {
      if (s.id !== subjectId) return s;
      const idx = s.units.findIndex(u => u.id === unitId);
      if (idx < 0) return s;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= s.units.length) return s;
      const newUnits = [...s.units];
      [newUnits[idx], newUnits[targetIdx]] = [newUnits[targetIdx], newUnits[idx]];
      return { ...s, units: newUnits };
    }));
    toast.success(`Unit moved ${direction}`);
  }, [subjects, updateAndRenumber]);

  // Move/Copy target data
  const moveTargetSubjectData = subjects.find(s => s.id === moveTargetSubject);
  const copyTargetSubjectData = subjects.find(s => s.id === copyTargetSubject);

  // ===== FOLDER SYSTEM HANDLERS =====
  const handleCreateFolder = useCallback((folder: Folder) => {
    onUpdateFolders([...folders, folder]);
    toast.success('📁 Folder created');
  }, [folders, onUpdateFolders]);

  const handleEditFolder = useCallback((folder: Folder) => {
    onUpdateFolders(folders.map(f => f.id === folder.id ? folder : f));
    toast.success('📁 Folder updated');
  }, [folders, onUpdateFolders]);

  const handleDeleteFolder = useCallback((folderId: string) => {
    onUpdate(subjects.map(s => s.folderId === folderId ? { ...s, folderId: undefined } : s));
    onUpdateFolders(folders.filter(f => f.id !== folderId));
    if (currentFolderId === folderId) setCurrentFolderId(null);
    toast.success('Folder deleted — subjects moved to root');
  }, [subjects, folders, onUpdate, onUpdateFolders, currentFolderId]);

  const handleDuplicateFolder = useCallback((folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    const ts = Date.now();
    const newFolderId = `folder-dup-${ts}`;
    const newFolder = { ...folder, id: newFolderId, name: `${folder.name} (Copy)`, order: ts, createdAt: new Date().toISOString() };
    const folderSubjects = subjects.filter(s => s.folderId === folderId);
    const newSubjects = folderSubjects.map((s, si) => ({
      ...s, id: `${s.id}-dup-${ts}-${si}`, name: `${s.name}`, folderId: newFolderId, order: ts + si,
      units: s.units.map((u, ui) => ({ ...u, id: `${u.id}-dup-${ts}-${ui}`,
        subTopics: u.subTopics.map((t, ti) => ({ ...t, id: `${t.id}-dup-${ts}-${ui}-${ti}`, completed: false, completedDate: undefined, completedTime: undefined, status: 'incomplete' as const }))
      }))
    }));
    onUpdateFolders([...folders, newFolder]);
    onUpdate([...subjects, ...newSubjects]);
    toast.success(`📁 Duplicated "${folder.name}" with ${newSubjects.length} subjects`);
  }, [folders, subjects, onUpdate, onUpdateFolders]);

  const handleExportFolder = useCallback((folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    const folderSubjects = subjects.filter(s => s.folderId === folderId);
    let text = `📁 ${folder.name}\n${'='.repeat(40)}\n`;
    if (folder.description) text += `${folder.description}\n`;
    text += `${folderSubjects.length} subjects\n\n`;
    folderSubjects.forEach(s => {
      const all = s.units.flatMap(u => u.subTopics);
      const done = all.filter(t => t.completed).length;
      text += `📚 ${s.name} (${s.shortName}) — ${done}/${all.length} done\n`;
      s.units.forEach((u, ui) => {
        text += `  Unit ${ui + 1}: ${u.name}\n`;
        u.subTopics.forEach(t => {
          text += `    ${t.completed ? '✅' : '⬜'} ${t.name} [${t.difficulty}]${t.important ? ' ⭐' : ''}\n`;
        });
      });
      text += '\n';
    });
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${folder.name}-summary.txt`; a.click();
    URL.revokeObjectURL(url);
    toast.success('📄 Folder summary exported!');
  }, [folders, subjects]);

  const handleMoveAllSubjectsOut = useCallback((folderId: string) => {
    onUpdate(subjects.map(s => s.folderId === folderId ? { ...s, folderId: undefined } : s));
    toast.success('All subjects moved to root');
  }, [subjects, onUpdate]);

  const handleMoveSubjectToFolder = useCallback((subjectId: string, folderId: string | null) => {
    onUpdate(subjects.map(s => s.id === subjectId ? { ...s, folderId: folderId || undefined } : s));
    toast.success(folderId ? '📁 Moved to folder' : '🏠 Moved to root');
  }, [subjects, onUpdate]);

  const handleMoveSubjectInList = useCallback((subjectId: string, direction: 'up' | 'down') => {
    const list = (currentFolderId
      ? subjects.filter(s => s.folderId === currentFolderId)
      : subjects.filter(s => !s.folderId)
    ).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = list.findIndex(s => s.id === subjectId);
    if (idx < 0) return;
    const ti = direction === 'up' ? idx - 1 : idx + 1;
    if (ti < 0 || ti >= list.length) return;
    const idA = list[idx].id, idB = list[ti].id;
    const oA = list[idx].order ?? idx, oB = list[ti].order ?? ti;
    onUpdate(subjects.map(s => {
      if (s.id === idA) return { ...s, order: oB };
      if (s.id === idB) return { ...s, order: oA };
      return s;
    }));
  }, [subjects, onUpdate, currentFolderId]);

  // ── Stable callbacks for SubjectCard to reduce re-render cascading ──
  const handleOpenTopicDetail = useCallback((topic: SubTopic, sId: string, uId: string, navList?: TopicNavRef[]) => {
    setDetailNavList(navList && navList.length > 1 ? navList : null);
    setDetailTopic({ topic, subjectId: sId, unitId: uId });
  }, []);
  const handleOpenUnitEditor = useCallback((sId: string, uId: string) => {
    setUnitDetailData({ subjectId: sId, unitId: uId });
  }, []);
  // One timer for the whole app: the per-topic ⏱️ button opens the unified Focus Timer, pre-linked to the topic.
  const handleOpenTimer = useCallback((subjectId: string, unitId: string, topicId: string, _topicName?: string, _timeSpent?: number) => {
    onOpenPomodoro?.(subjectId, unitId, topicId);
  }, [onOpenPomodoro]);
  const handleUpdateTopicsModule = useCallback((subjectId: string, unitId: string, topicIds: string[], field: 'module' | 'subModule', value: string | undefined) => {
    updateAndRenumber(subjects.map(s => s.id !== subjectId ? s : {
      ...s, units: s.units.map(u => u.id !== unitId ? u : {
        ...u, subTopics: u.subTopics.map(t => topicIds.includes(t.id) ? { ...t, [field]: value } : t)
      })
    }));
  }, [subjects, updateAndRenumber]);

  // Sort + Display logic
  const getSubjectPct = useCallback((s: Subject) => {
    let total = 0, done = 0;
    s.units.forEach(u => u.subTopics.forEach(t => { total++; if (t.completed) done++; }));
    return total > 0 ? done / total : 0;
  }, []);

  const currentFolder = currentFolderId ? folders.find(f => f.id === currentFolderId) || null : null;

  // Folder-scoped filter counts
  const folderFilterCounts = useMemo(() => {
    if (!currentFolderId) return null;
    const folderSubjects = subjects.filter(s => s.folderId === currentFolderId);
    return computeFilterCounts(folderSubjects);
  }, [subjects, currentFolderId]);

  const hasFolderFilter = currentFolderId ? (folderFilters.status !== 'all' || folderFilters.difficulty !== 'all' || !!folderCategoryFilter) : false;

  // Auto-expand matching subjects/units when folder filters change
  useEffect(() => {
    if (!currentFolderId || !hasFolderFilter || isAutoExpandingRef.current) return;
    isAutoExpandingRef.current = true;
    const folderSubjects = subjects.filter(s => s.folderId === currentFolderId);
    const { subjectIds, unitIds } = getMatchingIds(folderSubjects, { status: folderFilters.status, difficulty: folderFilters.difficulty, search });
    setExpandedSubjects(prev => new Set([...prev, ...subjectIds]));
    setExpandedUnits(prev => new Set([...prev, ...unitIds]));
    clearTimeout(autoExpandTimerRef.current);
    autoExpandTimerRef.current = setTimeout(() => { isAutoExpandingRef.current = false; }, 80);
  }, [folderFilters.status, folderFilters.difficulty, currentFolderId]);

  // Folder filtered topic count for indicator
  const folderFilteredCount = useMemo(() => {
    if (!hasFolderFilter || !currentFolderId) return 0;
    const folderSubjects = subjects.filter(s => s.folderId === currentFolderId);
    const filtered = deepFilterSubjects(folderSubjects, { status: folderFilters.status, difficulty: folderFilters.difficulty, search: '' });
    return filtered.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
  }, [subjects, currentFolderId, folderFilters, hasFolderFilter]);

  const displaySubjects = useMemo(() => {
    // While searching from the root, look inside folders too (results are shown flat, folder cards are hidden)
    let filtered = currentFolderId
      ? subjects.filter(s => s.folderId === currentFolderId)
      : deferredSearch ? subjects : subjects.filter(s => !s.folderId);
    // Apply search filtering at both root and folder level — same matcher as deepFilterSubjects,
    // so a subject is never dropped here that would have matched later (or the other way round).
    if (deferredSearch) {
      filtered = filtered.filter(s => {
        try {
          return (s.units || []).some(u => (u.subTopics || []).some(t => topicMatchesSearch(t, u.name, s.name, deferredSearch, folderDeepSearch)));
        } catch { return false; }
      });
    }
    const sorted = [...filtered];
    switch (sortMode) {
      case 'name': sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'newest': sorted.sort((a, b) => (b.order ?? 0) - (a.order ?? 0)); break;
      case 'oldest': sorted.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); break;
      case 'high': sorted.sort((a, b) => getSubjectPct(b) - getSubjectPct(a)); break;
      case 'low': sorted.sort((a, b) => getSubjectPct(a) - getSubjectPct(b)); break;
      default: sorted.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); break;
    }
    return sorted;
  }, [subjects, currentFolderId, sortMode, getSubjectPct, deferredSearch, folderDeepSearch]);

  // Deep-filter subjects: hide topics/units/subjects that don't match active filters
  const activeFilters = currentFolderId ? folderFilters : filters;
  const activeCategoryFilter = currentFolderId ? folderCategoryFilter : categoryFilter;
  const hasActiveFilter = activeFilters.status !== 'all' || activeFilters.difficulty !== 'all' || !!activeCategoryFilter;
  const filteredDisplaySubjects = useMemo(() => {
    let result = displaySubjects;
    if (activeFilters.status !== 'all' || activeFilters.difficulty !== 'all' || !!deferredSearch) {
      result = deepFilterSubjects(result, {
        status: activeFilters.status,
        difficulty: activeFilters.difficulty,
        search: deferredSearch,
        deepSearch: folderDeepSearch,
      });
    }
    // Apply category filter
    if (activeCategoryFilter) {
      result = result.map(s => ({
        ...s,
        units: s.units.map(u => ({
          ...u,
          subTopics: u.subTopics.filter(t => t.category === activeCategoryFilter),
        })).filter(u => u.subTopics.length > 0),
      })).filter(s => s.units.length > 0);
    }
    return result;
  }, [displaySubjects, activeFilters.status, activeFilters.difficulty, deferredSearch, folderDeepSearch, activeCategoryFilter]);

  // Filtered stats for display
  const filteredTotalTopics = useMemo(() => {
    if (!hasActiveFilter) return totalTopics;
    return filteredDisplaySubjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
  }, [filteredDisplaySubjects, hasActiveFilter, totalTopics]);

  const filteredDoneTopics = useMemo(() => {
    if (!hasActiveFilter) return doneTopics;
    return filteredDisplaySubjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);
  }, [filteredDisplaySubjects, hasActiveFilter, doneTopics]);

  // While searching: expand ONLY the subjects / units that contain results (everything else collapses),
  // then put the user's own expansion state back once the search is cleared.
  const displaySubjectsRef = useRef(displaySubjects);
  displaySubjectsRef.current = displaySubjects;
  const preSearchExpandedRef = useRef<{ subjects: Set<string>; units: Set<string> } | null>(null);
  const expandedSubjectsRef = useRef(expandedSubjects);
  expandedSubjectsRef.current = expandedSubjects;
  const expandedUnitsRef = useRef(expandedUnits);
  expandedUnitsRef.current = expandedUnits;
  useEffect(() => {
    if (!deferredSearch) {
      const saved = preSearchExpandedRef.current;
      if (saved) {
        preSearchExpandedRef.current = null;
        setExpandedSubjects(saved.subjects);
        setExpandedUnits(saved.units);
      }
      return;
    }
    try {
      if (!preSearchExpandedRef.current) {
        preSearchExpandedRef.current = { subjects: new Set(expandedSubjectsRef.current), units: new Set(expandedUnitsRef.current) };
      }
      const matchSubjects = new Set<string>();
      const matchUnits = new Set<string>();
      displaySubjectsRef.current.forEach(sj => {
        (sj.units || []).forEach(u => {
          if ((u.subTopics || []).some(t => topicMatchesSearch(t, u.name, sj.name, deferredSearch, folderDeepSearch))) { matchSubjects.add(sj.id); matchUnits.add(u.id); }
        });
      });
      setExpandedSubjects(matchSubjects);
      setExpandedUnits(matchUnits);
    } catch { /* never let search break the screen */ }
  }, [deferredSearch, folderDeepSearch]);

  const sortedFolders = useMemo(() => {
    const sorted = [...folders];
    if (sortMode === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => a.order - b.order);
    return sorted;
  }, [folders, sortMode]);

  const folderTopicCount = useMemo(() => {
    let c = 0;
    filteredDisplaySubjects.forEach(s => s.units.forEach(u => c += u.subTopics.length));
    return c;
  }, [filteredDisplaySubjects]);

  // Search result counts for header indicator
  const searchResultInfo = useMemo(() => {
    if (!deferredSearch) return { count: 0, subjectCount: 0 };
    let count = 0;
    let subjectCount = 0;
    filteredDisplaySubjects.forEach(s => {
      let subjectHasMatch = false;
      s.units.forEach(u => { count += u.subTopics.length; if (u.subTopics.length > 0) subjectHasMatch = true; });
      if (subjectHasMatch) subjectCount++;
    });
    return { count, subjectCount };
  }, [deferredSearch, filteredDisplaySubjects]);

  // ===== RENDER UNIT DETAIL VIEW =====
  if (unitDetailData && detailSubject && detailUnit) {
    return (
      <>
        <div className="animate-in fade-in duration-200">
          <UnitDetailView subject={detailSubject} unit={detailUnit} unitIndex={detailUnitIndex}
            onBack={() => setUnitDetailData(null)} onToggleTopic={handleUnitDetailToggle}
            onToggleImportant={handleUnitDetailImportant} onCycleStatus={handleUnitDetailCycleStatus}
            onCycleDifficulty={(topicId, newDifficulty) => {
              if (!unitDetailData) return;
              const { subjectId, unitId } = unitDetailData;
              updateAndRenumber(subjects.map(s => s.id !== subjectId ? s : {
                ...s, units: s.units.map(u => u.id !== unitId ? u : {
                  ...u, subTopics: u.subTopics.map(t => t.id !== topicId ? t : { ...t, difficulty: newDifficulty }),
                }),
              }));
            }}
            onOpenTopicDetail={handleUnitDetailOpenDetail} onAddTopic={handleUnitDetailAddTopic}
            onBulkToggle={handleUnitDetailBulkToggle} onLogStudyTime={handleUnitDetailLogStudyTime}
            onDeleteUnit={handleUnitDetailDelete}
            onRenameUnit={handleUnitDetailRename} onNavigatePrev={() => handleNavigateUnit('prev')}
            onNavigateNext={() => handleNavigateUnit('next')} hasPrev={detailUnitIndex > 0}
            hasNext={detailUnitIndex < detailSubject.units.length - 1}
            canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo}
            onNavigateToUnit={handleNavigateToUnit}
            onOpenReport={(sId, uId) => handleOpenReport(sId, uId)}
            onReorderTopics={(topicId, newIndex) => {
              if (!unitDetailData) return;
              const { subjectId: sId, unitId: uId } = unitDetailData;
              updateAndRenumber(subjects.map(s => s.id !== sId ? s : {
                ...s, units: s.units.map(u => {
                  if (u.id !== uId) return u;
                  const topics = [...u.subTopics];
                  const oldIdx = topics.findIndex(t => t.id === topicId);
                  if (oldIdx < 0 || newIndex < 0 || newIndex >= topics.length) return u;
                  const [moved] = topics.splice(oldIdx, 1);
                  topics.splice(newIndex, 0, moved);
                  return { ...u, subTopics: topics };
                })
              }));
            }}
            onOpenPomodoro={onOpenPomodoro}
            onDeleteTopic={handleUnitDetailDeleteTopic}
            onRenumberSubject={() => {
              if (!unitDetailData) return;
              onUpdate(subjects.map(s => s.id !== unitDetailData.subjectId ? s : renumberTopicNumbers(s)));
            }}
            onUpdateUnit={(updatedUnit) => {
              if (!unitDetailData) return;
              updateAndRenumber(subjects.map(s => s.id !== unitDetailData.subjectId ? s : {
                ...s, units: s.units.map(u => u.id !== updatedUnit.id ? u : updatedUnit),
              }));
            }}
            allSubjects={subjects}
            onSwitchSubject={(subjectId) => {
              const s = subjects.find(x => x.id === subjectId);
              if (s && s.units.length > 0) setUnitDetailData({ subjectId, unitId: s.units[0].id });
            }} />
        </div>
        <TopicDetailSheet open={!!detailTopic} onClose={() => setDetailTopic(null)} topic={liveDetail?.topic ?? detailTopic?.topic ?? null} onSave={handleSaveTopic} onDelete={handleDeleteTopic} canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} onOpenPomodoro={detailTopic && onOpenPomodoro ? () => onOpenPomodoro(detailTopic.subjectId, detailTopic.unitId, detailTopic.topic.id) : undefined} subjectId={detailTopic?.subjectId} unitId={detailTopic?.unitId} subjectName={detailTopic ? subjects.find(s => s.id === detailTopic.subjectId)?.name : undefined}
          subjectShortName={detailTopic ? subjects.find(s => s.id === detailTopic.subjectId)?.shortName : undefined}
          unitName={detailTopic ? subjects.find(s => s.id === detailTopic.subjectId)?.units.find(u => u.id === detailTopic.unitId)?.name : undefined}
          onNavigatePrev={() => handleNavigateTopic('prev')} onNavigateNext={() => handleNavigateTopic('next')}
          hasPrev={topicNavInfo.hasPrev} hasNext={topicNavInfo.hasNext}
          topicIndex={topicNavInfo.topicIndex} totalTopics={topicNavInfo.totalTopics}
          availableSubjects={subjects} onNavigateToTopic={handleNavigateToTopic}
          onCreateSession={onCreateSession} />
      </>
    );
  }

  // ===== RENDER SYLLABUS LIST =====
  return (
    <div className="space-y-4">
      {/* ===== FOLDER HEADER or ROOT HEADER ===== */}
      {currentFolderId && currentFolder ? (
        <motion.div className="space-y-3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
          {/* Hero Cover Banner */}
          <div className="relative rounded-2xl overflow-hidden border border-border/15 -mx-1">
            {currentFolder.coverImage ? (
              <img src={currentFolder.coverImage} alt="" className="w-full h-36 object-cover" />
            ) : (
              <div className="w-full h-36" style={{
                background: `linear-gradient(135deg, ${currentFolder.color}35 0%, ${currentFolder.color}15 50%, hsl(var(--card)) 100%)`,
              }}>
                <div className="absolute inset-0 opacity-8" style={{
                  backgroundImage: `radial-gradient(circle at 25% 40%, ${currentFolder.color} 1px, transparent 1px), radial-gradient(circle at 75% 60%, ${currentFolder.color} 1px, transparent 1px)`,
                  backgroundSize: '32px 32px',
                }} />
              </div>
            )}
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
            {/* Overlaid folder info */}
            <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end gap-3">
              <button onClick={() => { setCurrentFolderId(null); setFolderFilters({ status: 'all', difficulty: 'all' }); }}
                className="w-9 h-9 rounded-xl bg-background/50 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-background/70 transition-all active:scale-95 shrink-0">
                <ArrowLeft className="w-4 h-4 text-foreground" />
              </button>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl backdrop-blur-md border border-white/10 shrink-0 overflow-hidden"
                style={{ backgroundColor: currentFolder.color + '25' }}>
                {currentFolder.icon?.startsWith('http') ? (
                  <img src={currentFolder.icon} alt="" className="w-full h-full object-cover" />
                ) : (
                  currentFolder.icon || '📁'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[9px] text-foreground/50 font-bold uppercase tracking-widest">FILE ORGANIZER</span>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2 truncate drop-shadow-sm">
                  {currentFolder.name}
                </h2>
                <p className="text-[10px] text-foreground/60 font-semibold">
                  {displaySubjects.length} subject{displaySubjects.length !== 1 ? 's' : ''} · {folderTopicCount} topics
                </p>
              </div>
              {folderTopicCount > 0 && (() => {
                let d = 0; displaySubjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => { if (t.completed) d++; })));
                return <CircularProgress value={d} max={folderTopicCount} size={48} strokeWidth={4} color={currentFolder.color} />;
              })()}
            </div>
            {/* Change Cover button */}
            <button onClick={e => { e.stopPropagation(); setEditFolderData(currentFolder); setCreateFolderOpen(true); }}
              className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background/50 backdrop-blur-md border border-white/10 text-foreground/70 hover:text-foreground hover:bg-background/70 transition-all text-[10px] font-semibold">
              <ImagePlus className="w-3 h-3" /> {currentFolder.coverImage ? 'Change Cover' : 'Add Cover'}
            </button>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs">
            <button onClick={() => { setCurrentFolderId(null); setFolderFilters({ status: 'all', difficulty: 'all' }); }} className="text-primary font-semibold hover:underline">🏠 Home</button>
            <span className="text-muted-foreground">›</span>
            <span className="text-foreground font-semibold">{currentFolder.name}</span>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={folderDeepSearch ? `Deep search in ${currentFolder.name}...` : `Search in ${currentFolder.name}...`}
                className="pl-10 bg-card/30 backdrop-blur-xl border-border/15" />
            </div>
            <DeepSearchToggle enabled={folderDeepSearch} onToggle={() => setFolderDeepSearch(p => !p)} />
          </div>

          {/* Add Subject + Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditSubject(null); setAddSubjectOpen(true); }} className="gap-1 text-xs h-8 bg-card/30 border-border/15">
              <PlusIcon className="w-3.5 h-3.5" /> Add Subject
            </Button>
          </div>

          {/* ===== FOLDER FILTER SYSTEM — Unified emoji strip ===== */}
          <StatusFilterPills
            value={folderFilters.status}
            onChange={(v) => setFolderFilters(prev => ({ ...prev, status: v }))}
            counts={folderFilterCounts?.status}
            size="sm"
            diffValue={folderFilters.difficulty}
            onDiffChange={(v) => setFolderFilters(prev => ({ ...prev, difficulty: v }))}
            diffCounts={folderFilterCounts?.diff}
            categories={allCategories}
            activeCategory={folderCategoryFilter}
            onCategoryChange={setFolderCategoryFilter}
          />

          {/* Folder Analytics — hidden by default, expandable */}
          <div>
            <button onClick={() => setShowFolderAnalytics(p => !p)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-card/30 border border-border/10 hover:bg-card/50 transition-all active:scale-[0.99]">
              <span className="text-sm">📊</span>
              <span className="text-[10px] font-bold text-foreground/60 flex-1 text-left">Folder Analytics</span>
              <motion.div animate={{ rotate: showFolderAnalytics ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
              </motion.div>
            </button>
            <AnimatePresence>
              {showFolderAnalytics && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 350 }} className="overflow-hidden">
                  <FolderAnalytics folder={currentFolder} subjects={displaySubjects} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      ) : (
        <SyllabusHeader subjects={subjects} search={search} onSearchChange={setSearch}
          filters={filters} onFiltersChange={setFilters}
          activeLogDate={activeLogDate} canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo}
          onAddSubject={() => { setEditSubject(null); setAddSubjectOpen(true); }}
          selectMode={selectMode} onToggleSelectMode={() => { setSelectMode(p => !p); setSelectedTopics(new Set()); }}
          totalTopics={hasActiveFilter ? filteredTotalTopics : totalTopics} doneTopics={hasActiveFilter ? filteredDoneTopics : doneTopics} onImport={() => setImportOpen(true)}
          onAddFolder={() => { setEditFolderData(null); setCreateFolderOpen(true); }}
          searchResultCount={search ? searchResultInfo.count : undefined}
          searchSubjectCount={search ? searchResultInfo.subjectCount : undefined}
          deepSearch={folderDeepSearch} onDeepSearchChange={setFolderDeepSearch}
          externalCounts={filterCounts}
          categories={allCategories}
          activeCategory={categoryFilter}
          onCategoryChange={setCategoryFilter} />
      )}

      {/* ── Combined Toolbar: [Actions ▼] [Expand All] ── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <button onClick={() => setToolbarOpen(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${
              toolbarOpen ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-card/30 border-border/15 text-foreground/60 hover:text-foreground hover:bg-card/50'
            }`}>
            <MoreHorizontal className="w-3.5 h-3.5" />
            Actions
            {toolbarOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <div className="flex-1" />
          {filteredDisplaySubjects.length > 1 && (() => {
            const allIds = filteredDisplaySubjects.map(s => s.id);
            const allExpanded = allIds.every(id => expandedSubjects.has(id));
            return (
              <button
                onClick={() => {
                  if (allExpanded) {
                    setExpandedSubjects(prev => { const n = new Set(prev); allIds.forEach(id => n.delete(id)); return n; });
                  } else {
                    setExpandedSubjects(prev => new Set([...prev, ...allIds]));
                  }
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 shrink-0 ${
                  allExpanded
                    ? 'bg-primary/15 border-primary/30 text-primary'
                    : 'bg-muted/40 border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                {allExpanded ? '▼ Collapse' : '▶ Expand'} All
              </button>
            );
          })()}
        </div>

        {toolbarOpen && (
          <div className="space-y-2 pl-1 pb-1">
            {/* View mode tabs */}
            {!currentFolderId && (
              <div className="flex items-center gap-1">
                <button onClick={() => setViewMode('subjects')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95 ${viewMode === 'subjects' ? 'bg-primary/15 text-primary border border-primary/25' : 'text-muted-foreground hover:text-foreground'}`}>
                  📚 Subjects
                </button>
                <button onClick={() => setViewMode('units')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95 ${viewMode === 'units' ? 'bg-primary/15 text-primary border border-primary/25' : 'text-muted-foreground hover:text-foreground'}`}>
                  📋 Units
                </button>
              </div>
            )}

            {/* Sort options */}
            <div className="overflow-hidden">
              <SortBar active={sortMode} onChange={setSortMode} itemCount={filteredDisplaySubjects.length + (!currentFolderId && !deferredSearch ? sortedFolders.length : 0)} />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => setAddSubjectOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-card/30 border border-border/15 text-foreground/60 hover:text-foreground hover:bg-card/50 transition-all active:scale-95">
                <PlusIcon className="w-3 h-3" /> Subject
              </button>
              <button onClick={() => setCreateFolderOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-card/30 border border-border/15 text-foreground/60 hover:text-foreground hover:bg-card/50 transition-all active:scale-95">
                📁 Folder
              </button>
              <button onClick={() => { setSelectMode(p => !p); setSelectedTopics(new Set()); }}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all active:scale-95 ${
                  selectMode ? 'bg-primary/15 border-primary/25 text-primary' : 'bg-card/30 border-border/15 text-foreground/60 hover:text-foreground hover:bg-card/50'
                }`}>
                <MousePointer2 className="w-3 h-3" /> Select
              </button>
              <button onClick={() => setImportOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-card/30 border border-border/15 text-foreground/60 hover:text-foreground hover:bg-card/50 transition-all active:scale-95">
                <FileDown className="w-3 h-3" /> Import
              </button>
              <button onClick={() => {
                const lines: string[] = [];
                let count = 0;
                subjects.forEach(s => { s.units.forEach(u => { u.subTopics.filter(t => !t.completed).forEach(t => { lines.push(`☐ [${t.difficulty}] ${t.name} — ${s.shortName}`); count++; }); }); });
                if (count === 0) { toast.info('All topics completed! 🎉'); return; }
                const grouped = `Pending Topics (${count})\n${'─'.repeat(30)}\n${lines.join('\n')}`;
                navigator.clipboard.writeText(grouped).then(() => toast.success(`📋 Copied ${count} pending topics`));
              }} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-card/30 border border-border/15 text-foreground/60 hover:text-foreground hover:bg-card/50 transition-all active:scale-95">
                <ClipboardCopy className="w-3 h-3" /> Export
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Info line for root with folders */}
      {!currentFolderId && folders.length > 0 && (
        <p className="text-xs text-muted-foreground font-semibold px-1">
          {folders.length} folder{folders.length !== 1 ? 's' : ''} · {subjects.filter(s => !s.folderId).length} ungrouped subject{subjects.filter(s => !s.folderId).length !== 1 ? 's' : ''}
        </p>
      )}

      {/* ===== UNIT LIST VIEW ===== */}
      {viewMode === 'units' && !currentFolderId && (
        <UnitListView
          subjects={filteredDisplaySubjects}
          search={deferredSearch}
          onToggleTopic={toggleTopic}
          onToggleImportant={toggleImportant}
          onCycleTopicStatus={handleCycleTopicStatus}
          onOpenTopicDetail={(topic, sId, uId) => { setDetailNavList(null); setDetailTopic({ topic, subjectId: sId, unitId: uId }); }}
          onOpenUnitEditor={(sId, uId) => setUnitDetailData({ subjectId: sId, unitId: uId })}
          onAddTopic={(sId, uId, topic) => handleAddTopic(sId, uId, topic)}
          onBulkToggle={bulkToggleUnit}
        />
      )}

      {/* ===== SUBJECT LIST VIEW (default) ===== */}
      {(viewMode === 'subjects' || !!currentFolderId) && (
      <div className="space-y-3">
        {/* Folder cards (root only) */}
        {!currentFolderId && !deferredSearch && sortedFolders.map(folder => (
          <FolderCard key={folder.id} folder={folder}
            subjects={subjects.filter(s => s.folderId === folder.id)}
            onOpen={() => setCurrentFolderId(folder.id)}
            onEdit={() => { setEditFolderData(folder); setCreateFolderOpen(true); }}
            onDelete={() => handleDeleteFolder(folder.id)}
            onDuplicate={() => handleDuplicateFolder(folder.id)}
            onExport={() => handleOpenFolderReport(folder.id)}
            onMoveAllOut={() => handleMoveAllSubjectsOut(folder.id)} />
        ))}

        {/* Subject cards */}
        {filteredDisplaySubjects.map((subject, idx) => {
          // Find original subject for operations that need unfiltered data
          const origSubject = subjects.find(s => s.id === subject.id) || subject;
          return (
          <div key={subject.id} id={`subject-${subject.id}`}>
          {deferredSearch && !currentFolderId && origSubject.folderId && (
            <p className="text-[10px] font-bold text-muted-foreground/70 px-1.5 pb-1">📁 {folders.find(f => f.id === origSubject.folderId)?.name || 'Folder'}</p>
          )}
          <ErrorBoundary fallbackTitle={`${subject.shortName || 'Subject'} failed to render`}>
          <SubjectCard subject={subject} origSubject={origSubject} search={deferredSearch} deepSearch={folderDeepSearch} filters={activeFilters}
            expanded={expandedSubjects.has(subject.id)} onToggle={() => toggleExpand(subject.id)}
            expandedUnits={expandedUnits} onToggleUnit={toggleUnit}
            onToggleTopic={toggleTopic} onToggleImportant={toggleImportant} onBulkToggle={bulkToggleUnit}
            onOpenTopicDetail={handleOpenTopicDetail}
            onEditSubject={() => { setEditSubject(origSubject); setAddSubjectOpen(true); }}
            onDeleteSubject={() => handleDeleteSubject(subject.id)}
            onDuplicateSubject={() => handleDuplicateSubject(subject.id)}
            onRenameUnit={(unitId, name) => handleRenameUnit(subject.id, unitId, name)}
            onDeleteUnit={unitId => handleDeleteUnit(subject.id, unitId)}
            onAddUnit={unit => handleAddUnit(subject.id, unit)}
            onAddTopic={(unitId, topic) => handleAddTopic(subject.id, unitId, topic)}
            onMoveUnit={(unitId, dir) => handleMoveUnit(subject.id, unitId, dir)}
            selectMode={selectMode} selectedTopics={selectedTopics} onSelectTopic={toggleSelect}
            onSelectAllInUnit={handleSelectAllInUnit}
            studyPace={studyPace}
            onOpenUnitEditor={handleOpenUnitEditor}
            onMergeUnits={(unitIds) => handleMergeUnits(subject.id, unitIds)}
            onReorderUnits={(unitIds) => handleReorderUnits(subject.id, unitIds)}
            onImportSubject={handleImportedSubjects}
            onOpenPomodoro={onOpenPomodoro}
            onOpenTimer={handleOpenTimer}
            onCycleTopicStatus={handleCycleTopicStatus}
            onCycleDifficulty={handleCycleDifficulty}
            onReorderTopic={handleReorderTopic}
            onMoveToFolder={() => { setMoveSubjectId(subject.id); setMoveToFolderOpen(true); }}
            onMoveSubjectUp={idx > 0 ? () => handleMoveSubjectInList(subject.id, 'up') : undefined}
            onMoveSubjectDown={idx < filteredDisplaySubjects.length - 1 ? () => handleMoveSubjectInList(subject.id, 'down') : undefined}
            onExpandAllUnits={expandAllUnits}
            isFirstSubject={idx === 0}
            isLastSubject={idx === filteredDisplaySubjects.length - 1}
            onOpenReport={handleOpenReport}
            onUpdateTopicsModule={handleUpdateTopicsModule} />
          </ErrorBoundary>
          </div>
          );
        })}

        {/* Empty state when filters produce no results */}
        {filteredDisplaySubjects.length === 0 && (hasActiveFilter || !!search) && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="text-lg font-bold text-foreground mb-2">No matching results</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              No topics match the current {hasActiveFilter ? 'filters' : 'search'}.
              {hasActiveFilter && search ? ' Try adjusting your filters or search term.' : hasActiveFilter ? ' Try a different filter combination.' : ' Try a different search term.'}
            </p>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => { if (currentFolderId) { setFolderFilters({ status: 'all', difficulty: 'all' }); setFolderCategoryFilter(''); } else { setFilters({ status: 'all', difficulty: 'all' }); setCategoryFilter(''); } setSearch(''); }}>
              ✕ Clear All Filters
            </Button>
          </div>
        )}
      </div>
      )}

      <AddSubjectSheet open={addSubjectOpen} onClose={() => setAddSubjectOpen(false)} onSave={handleSaveSubject} editSubject={editSubject} />
      <TopicDetailSheet open={!!detailTopic} onClose={() => setDetailTopic(null)} topic={liveDetail?.topic ?? detailTopic?.topic ?? null} onSave={handleSaveTopic} onDelete={handleDeleteTopic} canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} onOpenPomodoro={detailTopic && onOpenPomodoro ? () => onOpenPomodoro(detailTopic.subjectId, detailTopic.unitId, detailTopic.topic.id) : undefined} subjectId={detailTopic?.subjectId} unitId={detailTopic?.unitId} subjectName={detailTopic ? subjects.find(s => s.id === detailTopic.subjectId)?.name : undefined}
          subjectShortName={detailTopic ? subjects.find(s => s.id === detailTopic.subjectId)?.shortName : undefined}
        unitName={detailTopic ? subjects.find(s => s.id === detailTopic.subjectId)?.units.find(u => u.id === detailTopic.unitId)?.name : undefined}
        onNavigatePrev={() => handleNavigateTopic('prev')} onNavigateNext={() => handleNavigateTopic('next')}
        hasPrev={topicNavInfo.hasPrev} hasNext={topicNavInfo.hasNext}
        topicIndex={topicNavInfo.topicIndex} totalTopics={topicNavInfo.totalTopics}
        availableSubjects={subjects} onNavigateToTopic={handleNavigateToTopic}
        onCreateSession={onCreateSession} />
      <BulkImportSheet open={bulkOpen} onClose={() => setBulkOpen(false)} existingSubjects={subjects} onApply={onUpdate} />
      <ImportSyllabusSheet onOpenBulk={() => { setImportOpen(false); setBulkOpen(true); }} open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImportedSubjects} onReplaceImport={(imported) => onUpdate(imported)} existingSubjects={subjects} />

      {/* Create Unit from Selected */}
      <BottomSheet open={createUnitOpen} onClose={() => setCreateUnitOpen(false)} title="📂 Create Unit from Selected">
        <div className="space-y-4">
          <p className="text-sm font-semibold text-foreground/70">{selectedTopics.size} topics will be moved to the new unit</p>
          <div>
            <Label className="text-sm font-bold text-foreground/80">Target Subject</Label>
            <Select value={createUnitSubjectId || defaultCreateSubjectId} onValueChange={setCreateUnitSubjectId}>
              <SelectTrigger className="mt-1 h-10 text-sm font-semibold"><SelectValue placeholder="Select subject..." /></SelectTrigger>
              <SelectContent>
                {subjects.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="font-semibold">{s.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm font-bold text-foreground/80">Unit Name</Label>
            <Input value={newUnitName} onChange={e => setNewUnitName(e.target.value)} className="mt-1" placeholder="e.g. Review Topics"
              onKeyDown={e => e.key === 'Enter' && handleCreateUnitFromSelected()} />
          </div>
          <Button className="w-full h-11 text-sm font-bold" onClick={handleCreateUnitFromSelected} disabled={!newUnitName.trim()}>
            Create Unit
          </Button>
        </div>
      </BottomSheet>

      {/* Move Topics to Unit */}
      <BottomSheet open={moveOpen} onClose={() => setMoveOpen(false)} title="📦 Move Topics to Unit">
        <div className="space-y-4">
          <p className="text-sm font-semibold text-foreground/70">Move {selectedTopics.size} topics to:</p>
          <div>
            <Label className="text-sm font-bold text-foreground/80">Target Subject</Label>
            <Select value={moveTargetSubject} onValueChange={v => { setMoveTargetSubject(v); setMoveTargetUnit(''); }}>
              <SelectTrigger className="mt-1 h-10 text-sm font-semibold"><SelectValue placeholder="Select subject..." /></SelectTrigger>
              <SelectContent>
                {subjects.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="font-semibold">{s.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {moveTargetSubjectData && (
            <div className="flex items-center gap-3">
              <Label className="text-sm font-bold text-foreground/80 shrink-0">Create new unit</Label>
              <Switch checked={moveCreateNew} onCheckedChange={setMoveCreateNew} />
            </div>
          )}
          {moveTargetSubjectData && !moveCreateNew && (
            <div>
              <Label className="text-sm font-bold text-foreground/80">Target Unit</Label>
              <Select value={moveTargetUnit} onValueChange={setMoveTargetUnit}>
                <SelectTrigger className="mt-1 h-10 text-sm font-semibold"><SelectValue placeholder="Select unit..." /></SelectTrigger>
                <SelectContent>
                  {moveTargetSubjectData.units.map((u, i) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="font-semibold">Unit {i + 1}: {u.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {moveTargetSubjectData && moveCreateNew && (
            <div>
              <Label className="text-sm font-bold text-foreground/80">New Unit Name</Label>
              <Input value={moveNewUnitName} onChange={e => setMoveNewUnitName(e.target.value)} className="mt-1" placeholder="e.g. Moved Topics" />
            </div>
          )}
          <Button className="w-full h-11 text-sm font-bold" onClick={handleMoveTopics}
            disabled={!moveTargetSubject || (moveCreateNew ? !moveNewUnitName.trim() : !moveTargetUnit)}>
            Move Topics
          </Button>
        </div>
      </BottomSheet>

      {/* Copy Topics to Unit */}
      <BottomSheet open={copyOpen} onClose={() => setCopyOpen(false)} title="📋 Copy Topics to Unit">
        <div className="space-y-4">
          <p className="text-sm font-semibold text-foreground/70">Duplicate {selectedTopics.size} topics (with new IDs) into:</p>
          <div>
            <Label className="text-sm font-bold text-foreground/80">Target Subject</Label>
            <Select value={copyTargetSubject} onValueChange={v => { setCopyTargetSubject(v); setCopyTargetUnit(''); }}>
              <SelectTrigger className="mt-1 h-10 text-sm font-semibold"><SelectValue placeholder="Select subject..." /></SelectTrigger>
              <SelectContent>
                {subjects.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="font-semibold">{s.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {copyTargetSubjectData && (
            <div className="flex items-center gap-3">
              <Label className="text-sm font-bold text-foreground/80 shrink-0">Create new unit</Label>
              <Switch checked={copyCreateNew} onCheckedChange={setCopyCreateNew} />
            </div>
          )}
          {copyTargetSubjectData && !copyCreateNew && (
            <div>
              <Label className="text-sm font-bold text-foreground/80">Target Unit</Label>
              <Select value={copyTargetUnit} onValueChange={setCopyTargetUnit}>
                <SelectTrigger className="mt-1 h-10 text-sm font-semibold"><SelectValue placeholder="Select unit..." /></SelectTrigger>
                <SelectContent>
                  {copyTargetSubjectData.units.map((u, i) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="font-semibold">Unit {i + 1}: {u.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {copyTargetSubjectData && copyCreateNew && (
            <div>
              <Label className="text-sm font-bold text-foreground/80">New Unit Name</Label>
              <Input value={copyNewUnitName} onChange={e => setCopyNewUnitName(e.target.value)} className="mt-1" placeholder="e.g. Copied Topics" />
            </div>
          )}
          <Button className="w-full h-11 text-sm font-bold" onClick={handleCopyTopics}
            disabled={!copyTargetSubject || (copyCreateNew ? !copyNewUnitName.trim() : !copyTargetUnit)}>
            Copy Topics
          </Button>
        </div>
      </BottomSheet>

      {/* Folder bottom sheets */}
      <CreateFolderSheet open={createFolderOpen}
        onClose={() => { setCreateFolderOpen(false); setEditFolderData(null); }}
        onSave={editFolderData ? handleEditFolder : handleCreateFolder}
        editFolder={editFolderData} />

      <MoveToSheet open={moveToFolderOpen}
        onClose={() => { setMoveToFolderOpen(false); setMoveSubjectId(''); }}
        folders={folders} subjects={subjects}
        currentFolderId={moveSubjectId ? subjects.find(s => s.id === moveSubjectId)?.folderId || null : null}
        onMove={(fId) => { handleMoveSubjectToFolder(moveSubjectId, fId); setMoveToFolderOpen(false); setMoveSubjectId(''); }}
        onCreateFolder={() => { setMoveToFolderOpen(false); setTimeout(() => setCreateFolderOpen(true), 200); }}
        itemName={moveSubjectId ? subjects.find(s => s.id === moveSubjectId)?.shortName : undefined} />

      <AnimatePresence>
        {reportOpen && (
          <ReportBuilder
            open={reportOpen}
            onClose={() => { setReportOpen(false); setReportFolderInfo(undefined); }}
            subjects={reportFolderInfo ? subjects.filter(s => {
              const folder = folders.find(f => f.name === reportFolderInfo.name);
              return folder ? s.folderId === folder.id : true;
            }) : subjects}
            preSelectSubjectId={reportSubjectId}
            preSelectUnitId={reportUnitId}
            folderInfo={reportFolderInfo}
          />
        )}
      </AnimatePresence>

      {/* Bulk Toggle Unit Confirmation */}
      <ConfirmDialog
        open={!!bulkToggleConfirm}
        onClose={() => setBulkToggleConfirm(null)}
        onConfirm={executeBulkToggle}
        title={bulkToggleConfirm?.markAs ? 'Mark All Complete' : 'Mark All Incomplete'}
        description={bulkToggleConfirm?.markAs
          ? `This will mark ${bulkToggleConfirm?.topicCount} topic${(bulkToggleConfirm?.topicCount || 0) !== 1 ? 's' : ''} in "${bulkToggleConfirm?.unitName}" as completed.`
          : `This will mark ${bulkToggleConfirm?.topicCount} topic${(bulkToggleConfirm?.topicCount || 0) !== 1 ? 's' : ''} in "${bulkToggleConfirm?.unitName}" as incomplete, removing their completion dates.`}
        severity={bulkToggleConfirm?.markAs ? 'info' : 'warning'}
        confirmLabel={bulkToggleConfirm?.markAs ? `Complete ${bulkToggleConfirm?.topicCount} Topics` : `Uncomplete ${bulkToggleConfirm?.topicCount} Topics`}
        itemCount={bulkToggleConfirm?.topicCount}
        details={bulkToggleConfirm?.markAs ? undefined : ['Study time and notes will be preserved.']}
      />

      <AnimatePresence>
        {selectMode && selectedTopics.size > 0 && (
          <BulkSelectBar count={selectedTopics.size} totalVisible={totalTopics}
            onMarkComplete={() => handleBulkAction('complete')}
            onMarkIncomplete={() => handleBulkAction('incomplete')}
            onToggleStar={() => handleBulkAction('star')}
            onDelete={() => handleBulkAction('delete')}
            onCancel={() => { setSelectMode(false); setSelectedTopics(new Set()); }}
            onCreateUnit={() => { setCreateUnitSubjectId(defaultCreateSubjectId); setCreateUnitOpen(true); }}
            onMoveTopics={() => setMoveOpen(true)}
            onCopyTopics={() => setCopyOpen(true)}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            subjectSummary={subjectSummary} />
        )}
      </AnimatePresence>
    </div>
  );
}
