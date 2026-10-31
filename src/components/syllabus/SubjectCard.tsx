import { useState, useMemo, useEffect, useCallback, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Collapse from '../shared/Collapse';
import { ChevronDown, ChevronRight, Plus, MoreVertical, Pencil, Copy, Download, Trash2, X, Bot, Search, Maximize2, Minimize2, FileText } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@project/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import BottomSheet from '../shared/BottomSheet';
import UnitSection from './UnitSection';
import SubjectOverview from './SubjectOverview';
import SubjectActionsSheet from './SubjectActionsSheet';
import type { Subject, SubTopic, Unit, RevisionKey, TopicNavRef } from '../../types';
import type { SyllabusFilters } from './SyllabusHeader';
import { formatDate, getCleanName } from '../../lib/utils';
import { computeGlobalTopicNumbers } from '../../lib/computeGlobalTopicNumbers';
import { topicMatchesFilter, topicMatchesSearch, type SyllabusFilterState } from '../../lib/syllabusFilter';
import { toast } from 'sonner';
import DeepSearchToggle from '../shared/DeepSearchToggle';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  subject: Subject;
  /** Unfiltered subject for mutations, export, edit mode. Falls back to `subject` if not provided. */
  origSubject?: Subject;
  search: string;
  /** Deep search (notes, resources, files) is on for the global search box */
  deepSearch?: boolean;
  filters: SyllabusFilters;
  expanded: boolean;
  onToggle: () => void;
  expandedUnits: Set<string>;
  onToggleUnit: (id: string) => void;
  onToggleTopic: (subjectId: string, unitId: string, topicId: string) => void;
  onToggleImportant: (subjectId: string, unitId: string, topicId: string) => void;
  onBulkToggle: (subjectId: string, unitId: string) => void;
  onOpenTopicDetail: (topic: SubTopic, subjectId: string, unitId: string, navList?: TopicNavRef[]) => void;
  onEditSubject: () => void;
  onDeleteSubject: () => void;
  onDuplicateSubject?: () => void;
  onRenameUnit: (unitId: string, name: string) => void;
  onDeleteUnit: (unitId: string) => void;
  onAddUnit: (unit: Unit) => void;
  onAddTopic: (unitId: string, topic: SubTopic) => void;
  onMoveUnit: (unitId: string, direction: 'up' | 'down') => void;
  onReorderUnits?: (unitIds: string[]) => void;
  selectMode: boolean;
  selectedTopics: Set<string>;
  onSelectTopic: (id: string) => void;
  studyPace: number;
  onOpenUnitEditor?: (subjectId: string, unitId: string) => void;
  onMergeUnits?: (unitIds: string[]) => void;
  onImportSubject?: (subjects: Subject[]) => void;
  onSelectAllInUnit?: (topicIds: string[]) => void;
  onOpenPomodoro?: (subjectId: string, unitId?: string, topicId?: string) => void;
  onOpenTimer?: (subjectId: string, unitId: string, topicId: string, topicName: string, timeSpent: number) => void;
  onCycleTopicStatus?: (subjectId: string, unitId: string, topicId: string, newStatus: import('../../types').TopicStatus) => void;
  onCycleDifficulty?: (subjectId: string, unitId: string, topicId: string, newDifficulty: 'Easy' | 'Medium' | 'Hard') => void;
  onReorderTopic?: (subjectId: string, unitId: string, topicId: string, direction: 'up' | 'down') => void;
  onMoveToFolder?: () => void;
  onMoveSubjectUp?: () => void;
  onMoveSubjectDown?: () => void;
  isFirstSubject?: boolean;
  isLastSubject?: boolean;
  onExpandAllUnits?: (unitIds: string[]) => void;
  onOpenReport?: (subjectId: string) => void;
  onUpdateTopicsModule?: (subjectId: string, unitId: string, topicIds: string[], field: 'module' | 'subModule', value: string | undefined) => void;
}

const SubjectCard = memo(function SubjectCard({
  subject, origSubject: origSubjectProp, search, deepSearch: globalDeepSearch, filters, expanded, onToggle, expandedUnits, onToggleUnit,
  onToggleTopic, onToggleImportant, onBulkToggle, onOpenTopicDetail,
  onEditSubject, onDeleteSubject, onDuplicateSubject, onRenameUnit, onDeleteUnit, onAddUnit, onAddTopic,
  selectMode, selectedTopics, onSelectTopic, studyPace, onOpenUnitEditor, onMoveUnit,
  onReorderUnits, onMergeUnits, onImportSubject, onSelectAllInUnit, onOpenPomodoro, onOpenTimer,
  onCycleTopicStatus, onCycleDifficulty, onReorderTopic,
  onMoveToFolder, onMoveSubjectUp, onMoveSubjectDown, isFirstSubject, isLastSubject, onExpandAllUnits, onOpenReport,
  onUpdateTopicsModule,
}: Props) {
  // origSubject has ALL units/topics (for export, edit mode, overall stats).
  // `subject` may be pre-filtered by the parent (deepFilterSubjects) for display.
  const origSubject = origSubjectProp || subject;

  // Global text sizes now come from the --text-size-* CSS variables (Settings → Text Size & Layout);
  // only a subject's own override is passed down, so there is no second global source to conflict.
  const universalFontSizes = { unitFontSize: undefined as string | undefined, moduleFontSize: undefined as string | undefined, topicFontSize: undefined as string | undefined };

  const [addUnitOpen, setAddUnitOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [overviewCollapsed, setOverviewCollapsed] = useState(true);
  const parentDiff = filters.difficulty as 'all' | 'Easy' | 'Medium' | 'Hard';
  const [subjectDiffFilter, setSubjectDiffFilter] = useState<'all' | 'Easy' | 'Medium' | 'Hard'>(parentDiff !== 'all' ? parentDiff : 'all');
  const [subjectStatusFilter, setSubjectStatusFilter] = useState<import('../shared/StatusFilterPills').StatusFilter>('all');
  // Revision card filter: completed topics still missing this round
  const [revisionFilter, setRevisionFilter] = useState<RevisionKey | null>(null);

  // Sync subject-level difficulty filter when parent filter changes
  useEffect(() => {
    if (parentDiff !== 'all') {
      setSubjectDiffFilter(parentDiff);
    }
  }, [parentDiff]);
  const [editModeAll, setEditModeAll] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set());
  const [activeStatPill, setActiveStatPill] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [localSearch, setLocalSearch] = useState('');
  const [localDeepSearch, setLocalDeepSearch] = useState(false);

  // Unit drag-to-reorder
  const unitDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 500, tolerance: 8 } })
  );
  const handleUnitDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderUnits) return;
    const oldIdx = origSubject.units.findIndex(u => u.id === active.id);
    const overIdx = origSubject.units.findIndex(u => u.id === over.id);
    if (oldIdx < 0 || overIdx < 0) return;
    const newUnits = [...origSubject.units];
    const [moved] = newUnits.splice(oldIdx, 1);
    newUnits.splice(overIdx, 0, moved);
    onReorderUnits(newUnits.map(u => u.id));
    navigator.vibrate?.([15, 30, 15]);
  }, [origSubject.units, onReorderUnits]);

  // ── Stable callback wrappers for UnitSection to prevent re-render cascades ──
  const stableOnToggleTopic = useCallback((topicId: string, unitId: string) => {
    onToggleTopic(subject.id, unitId, topicId);
  }, [onToggleTopic, subject.id]);
  const stableOnToggleImportant = useCallback((topicId: string, unitId: string) => {
    onToggleImportant(subject.id, unitId, topicId);
  }, [onToggleImportant, subject.id]);
  const stableOnBulkToggle = useCallback((unitId: string) => {
    onBulkToggle(subject.id, unitId);
  }, [onBulkToggle, subject.id]);
  const stableOnOpenTopicDetail = useCallback((topic: SubTopic, unitId: string) => {
    onOpenTopicDetail(topic, subject.id, unitId);
  }, [onOpenTopicDetail, subject.id]);
  const stableOnRenameUnit = useCallback((unitId: string, name: string) => {
    onRenameUnit(unitId, name);
  }, [onRenameUnit]);
  const stableOnDeleteUnit = useCallback((unitId: string) => {
    onDeleteUnit(unitId);
  }, [onDeleteUnit]);
  const stableOnAddTopic = useCallback((unitId: string, topic: SubTopic) => {
    onAddTopic(unitId, topic);
  }, [onAddTopic]);
  const stableOnOpenUnitEditor = useCallback((unitId: string) => {
    onOpenUnitEditor?.(subject.id, unitId);
  }, [onOpenUnitEditor, subject.id]);
  const stableOnOpenPomodoro = useCallback((unitId: string, topicId?: string) => {
    onOpenPomodoro?.(subject.id, unitId, topicId);
  }, [onOpenPomodoro, subject.id]);
  const stableOnOpenTimer = useMemo(() => onOpenTimer ? (unitId: string, topicId: string, topicName: string, timeSpent: number) => {
    onOpenTimer(subject.id, unitId, topicId, topicName, timeSpent);
  } : undefined, [onOpenTimer, subject.id]);
  const stableOnCycleTopicStatus = useMemo(() => onCycleTopicStatus ? (unitId: string, topicId: string, newStatus: import('../../types').TopicStatus) => {
    onCycleTopicStatus(subject.id, unitId, topicId, newStatus);
  } : undefined, [onCycleTopicStatus, subject.id]);
  const stableOnCycleDifficulty = useMemo(() => onCycleDifficulty ? (unitId: string, topicId: string, newDiff: 'Easy' | 'Medium' | 'Hard') => {
    onCycleDifficulty(subject.id, unitId, topicId, newDiff);
  } : undefined, [onCycleDifficulty, subject.id]);
  const stableOnReorderTopic = useMemo(() => onReorderTopic ? (unitId: string, topicId: string, dir: 'up' | 'down') => {
    onReorderTopic(subject.id, unitId, topicId, dir);
  } : undefined, [onReorderTopic, subject.id]);
  const stableOnUpdateTopicsModule = useMemo(() => onUpdateTopicsModule ? (unitId: string, topicIds: string[], field: 'module' | 'subModule', value: string | undefined) => {
    onUpdateTopicsModule(origSubject.id, unitId, topicIds, field, value);
  } : undefined, [onUpdateTopicsModule, origSubject.id]);

  // Use origSubject for overall (unfiltered) stats
  const all = origSubject.units.flatMap(u => u.subTopics);
  const done = all.filter(t => t.completed).length;
  const remaining = all.length - done;

  // Compute global sequential topic numbers from unfiltered subject
  const topicIdKey = useMemo(() => origSubject.units.flatMap(u => u.subTopics.map(t => t.id)).join(','), [origSubject.units]);
  const universalNumbers = useMemo(() => computeGlobalTopicNumbers(origSubject), [origSubject, topicIdKey]);
  const pct = all.length > 0 ? Math.round((done / all.length) * 100) : 0;
  const daysLeft = Math.max(0, Math.ceil((new Date(subject.examDate).getTime() - Date.now()) / 86400000));
  // Compute which units have at least one topic matching active filters
  const effectiveStatus = subjectStatusFilter !== 'all' ? subjectStatusFilter : filters.status;
  const effectiveFilters = { status: effectiveStatus, difficulty: subjectDiffFilter !== 'all' ? subjectDiffFilter : filters.difficulty, revisionMissing: revisionFilter };
  // Local (per-subject) search uses its own Deep toggle; otherwise follow the global one
  const effectiveDeepSearch = localSearch ? localDeepSearch : !!globalDeepSearch;
  const hasActiveFilter = effectiveFilters.status !== 'all' || effectiveFilters.difficulty !== 'all' || !!revisionFilter || !!(localSearch || search);
  const visibleUnits = useMemo(() => {
    // `subject` is already pre-filtered by the parent (deepFilterSubjects) —
    // its units only contain matching topics. So start from `subject.units`.
    // If there's a local search or subject-level filter, apply an
    // additional pass on top of the already-filtered data.
    const needsLocalFilter = !!localSearch || !!revisionFilter || (subjectDiffFilter !== 'all' && subjectDiffFilter !== filters.difficulty) || (subjectStatusFilter !== 'all' && subjectStatusFilter !== filters.status);
    if (!needsLocalFilter && !hasActiveFilter) return subject.units;
    if (!needsLocalFilter) return subject.units; // already filtered by parent

    const combinedSearch = localSearch || search;
    const filterState: SyllabusFilterState = {
      status: effectiveFilters.status as any,
      difficulty: effectiveFilters.difficulty as any,
      search: combinedSearch,
      revisionMissing: revisionFilter,
    };
    // Re-filter from origSubject when local filters differ from parent filters
    const sourceUnits = needsLocalFilter ? origSubject.units : subject.units;
    return sourceUnits
      .map(unit => {
        const filteredTopics = unit.subTopics.filter(t =>
          topicMatchesFilter(t, filterState) &&
          topicMatchesSearch(t, unit.name, origSubject.name, combinedSearch, effectiveDeepSearch)
        );
        if (filteredTopics.length === 0) return null;
        return { ...unit, subTopics: filteredTopics };
      })
      .filter(Boolean) as Unit[];
  }, [subject.units, origSubject.units, effectiveFilters.status, effectiveFilters.difficulty, localSearch, search, hasActiveFilter, origSubject.name, subjectDiffFilter, subjectStatusFilter, filters.difficulty, filters.status, revisionFilter, effectiveDeepSearch]);

  // Filtered stats — recalculate from visible data only
  const filteredAll = useMemo(() => visibleUnits.flatMap(u => u.subTopics), [visibleUnits]);
  const filteredDone = useMemo(() => {
    if (!hasActiveFilter) return done;
    return filteredAll.filter(t => t.completed).length;
  }, [hasActiveFilter, done, filteredAll]);
  const filteredTotal = hasActiveFilter ? filteredAll.length : all.length;
  const filteredRemaining = filteredTotal - filteredDone;
  const displayPct = hasActiveFilter && filteredTotal > 0 ? Math.round((filteredDone / filteredTotal) * 100) : pct;

  const handleAddUnit = () => {
    if (!newUnitName.trim()) return;
    const unit: Unit = { id: `${subject.id}-cu-${Date.now()}`, name: newUnitName.trim(), subTopics: [] };
    onAddUnit(unit); setNewUnitName(''); setAddUnitOpen(false);
  };

  const handleExport = () => {
    const data = JSON.stringify(origSubject, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${subject.shortName}-syllabus.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Subject exported as JSON');
  };

  const handleDuplicate = () => {
    onDuplicateSubject?.();
    toast.success('Subject duplicated');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportSubject) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        let subjects: Subject[] = [];
        if (Array.isArray(data)) subjects = data.filter((s: any) => s.id && s.name && Array.isArray(s.units));
        else if (data.id && data.name && Array.isArray(data.units)) subjects = [data];
        else if (data.subjects) subjects = data.subjects.filter((s: any) => s.id && s.name && Array.isArray(s.units));
        if (subjects.length === 0) { toast.error('No valid subjects found'); return; }
        onImportSubject(subjects);
        toast.success(`Imported ${subjects.length} subject(s)!`);
      } catch { toast.error('Invalid JSON file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleMergeUnits = () => {
    if (mergeSelected.size < 2) { toast.error('Select at least 2 units to merge'); return; }
    onMergeUnits?.(Array.from(mergeSelected));
    setMergeMode(false); setMergeSelected(new Set());
  };

  return (
    <div className="glass-card overflow-hidden transition-all duration-300 hover:border-border/30"
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 ${expanded ? '24' : '0'}px ${subject.color}20, 0 2px 12px ${subject.color}08`,
        background: `linear-gradient(135deg, hsl(var(--card) / 0.85) 0%, color-mix(in srgb, ${subject.color} 6%, hsl(var(--card) / 0.75)) 50%, hsl(var(--card) / 0.65) 100%)`,
        borderLeft: `3px solid ${subject.color}50`,
      }}>
      {/* Subject Cover Image — with fallback on load error */}
      {subject.image && (
        <div className="relative h-28 sm:h-36 w-full overflow-hidden rounded-t-2xl">
          <img src={subject.image} alt={subject.name} className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div className="absolute inset-0 bg-gradient-to-t from-card/95 via-card/40 to-transparent" />
          <div className="absolute bottom-2 left-3 right-3 flex items-end gap-2">
            <span className="text-xs font-black px-2.5 py-1 rounded-lg border backdrop-blur-md" style={{ backgroundColor: subject.color + '30', color: '#fff', borderColor: subject.color + '50', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{subject.shortName}</span>
            <span className="text-sm font-bold text-white break-words drop-shadow-lg">{subject.name}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-2">
        <button onClick={onToggle} className="flex items-center gap-3 flex-1 min-w-0">
          {/* Subject Icon — rendered like FolderCard with shape/size/custom image support */}
          {(() => {
            try {
              const icon = typeof subject.icon === 'string' ? subject.icon : undefined;
              const shape = typeof subject.iconShape === 'string' ? subject.iconShape : 'square';
              const size = typeof subject.iconSize === 'string' ? subject.iconSize : 'md';
              const sizeClass = size === 'sm' ? 'w-8 h-8 text-base' : size === 'lg' ? 'w-12 h-12 text-2xl' : 'w-10 h-10 text-lg';
              const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl';
              const hasCustomIcon = icon && (icon.startsWith('http') || (icon.length <= 4 && icon !== ''));

              if (!hasCustomIcon) {
                return <div className="w-2 h-14 rounded-full shrink-0" style={{ backgroundColor: subject.color, boxShadow: `0 0 16px ${subject.color}50` }} />;
              }

              return (
                <div className={`${sizeClass} ${shapeClass} flex items-center justify-center shrink-0 backdrop-blur-md border shadow-lg overflow-hidden`}
                  style={{ backgroundColor: subject.color + '25', borderColor: subject.color + '30' }}>
                  {icon.startsWith('http') ? (
                    <img src={icon} alt="" className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <span>{icon}</span>
                  )}
                </div>
              );
            } catch {
              return <div className="w-2 h-14 rounded-full shrink-0" style={{ backgroundColor: subject.color, boxShadow: `0 0 16px ${subject.color}50` }} />;
            }
          })()}
          <div className="flex-1 text-left min-w-0">
            {!subject.image && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-black px-2.5 py-1 rounded-lg border" style={{ backgroundColor: subject.color + '15', color: subject.color, borderColor: subject.color + '25' }}>{subject.shortName}</span>
                <span className="text-base font-bold text-foreground break-words">{subject.name}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1.5 font-semibold">
              {hasActiveFilter ? `${filteredTotal} matching` : `${done}/${all.length} done`} · Exam: {formatDate(subject.examDate)}
              {daysLeft > 0 && <span className="ml-1 font-bold" style={{ color: daysLeft <= 7 ? 'hsl(var(--destructive))' : subject.color }}>({daysLeft}d left)</span>}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {/* Edit mode indicator */}
          {editModeAll && (
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1 text-primary border-primary/30 bg-primary/10"
              onClick={() => setEditModeAll(false)}>
              <X className="w-3 h-3" /> Done
            </Button>
          )}

          {/* Progress Ring — enhanced with glow + shimmer for 90-99% */}
          <div className="flex items-center gap-2.5">
            <div className={`relative w-14 h-14 shrink-0 ${displayPct >= 90 && displayPct < 100 ? 'animate-pulse' : ''}`}>
              <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
                <circle cx="24" cy="24" r="19" fill="none" stroke="hsl(var(--muted) / 0.15)" strokeWidth="4" />
                <circle cx="24" cy="24" r="19" fill="none" stroke={displayPct >= 100 ? 'hsl(var(--secondary))' : subject.color} strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 19}`} strokeDashoffset={`${2 * Math.PI * 19 * (1 - displayPct / 100)}`}
                  style={{
                    transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)',
                    filter: displayPct >= 100 ? 'drop-shadow(0 0 8px hsl(var(--secondary) / 0.6))' : `drop-shadow(0 0 6px ${subject.color}50)`,
                  }} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-black font-mono text-foreground">{displayPct}%</span>
              {displayPct >= 100 && (
                <span className="absolute -top-0.5 -right-0.5 text-[10px]">🏆</span>
              )}
            </div>
          </div>

          {/* Subject actions — premium bottom sheet, trigger keeps the mini completion ring */}
          <button className="relative w-9 h-9 shrink-0 group/trigger active:scale-90 transition-transform" aria-label="Subject actions" aria-haspopup="dialog"
            onClick={e => { e.stopPropagation(); setActionsOpen(true); }}>
            <svg viewBox="0 0 28 28" className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="14" cy="14" r="11.5" fill="none" stroke="hsl(var(--muted) / 0.12)" strokeWidth="2" />
              <circle cx="14" cy="14" r="11.5" fill="none" stroke={subject.color} strokeWidth="2" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 11.5}`} strokeDashoffset={`${2 * Math.PI * 11.5 * (1 - displayPct / 100)}`}
                style={{ transition: 'stroke-dashoffset 0.6s ease-out', opacity: 0.7 }} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center">
              <MoreVertical className="w-3.5 h-3.5 text-muted-foreground group-hover/trigger:text-foreground transition-colors" />
            </span>
          </button>
        </div>
      </div>

      <SubjectActionsSheet
        open={actionsOpen} onClose={() => setActionsOpen(false)} subject={origSubject} pct={displayPct} filtered={hasActiveFilter}
        onEditUnits={() => { setEditModeAll(true); if (!expanded) onToggle(); }}
        onEditSubject={onEditSubject}
        onDuplicate={handleDuplicate}
        onExport={handleExport}
        onImport={() => document.getElementById(`import-file-${subject.id}`)?.click()}
        onReport={() => onOpenReport?.(subject.id)}
        onMerge={origSubject.units.length >= 2 ? () => { setMergeMode(true); setMergeSelected(new Set()); if (!expanded) onToggle(); } : undefined}
        onMoveToFolder={onMoveToFolder}
        onMoveUp={onMoveSubjectUp && !isFirstSubject ? onMoveSubjectUp : undefined}
        onMoveDown={onMoveSubjectDown && !isLastSubject ? onMoveSubjectDown : undefined}
        onCopyName={() => { navigator.clipboard.writeText(getCleanName(subject.name)).then(() => toast.success('📋 Copied!')).catch(() => {}); }}
        onDelete={() => setDeleteConfirmOpen(true)}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="glass-card bg-card/90 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subject</AlertDialogTitle>
            <AlertDialogDescription>Remove &quot;{subject.name}&quot; and all {all.length} topics?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDeleteSubject(); setDeleteConfirmOpen(false); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clickable Stats Pills — horizontally scrollable */}
      <div className="px-4 pb-2 relative">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5" style={{ WebkitOverflowScrolling: 'touch' }}>
        {(() => {
          const displayTopics = hasActiveFilter ? filteredAll : all;
          const displayDone = hasActiveFilter ? filteredDone : done;
          const displayRemaining = hasActiveFilter ? filteredRemaining : remaining;
          const impCount = displayTopics.filter(t => t.important).length;
          const totalMin = displayTopics.reduce((a, t) => a + (t.timeSpent || 0), 0);
          const pills = [
            {
              id: 'completed',
              emoji: displayDone >= displayTopics.length && displayTopics.length > 0 ? '🏆' : displayDone > displayTopics.length * 0.5 ? '✅' : displayDone > 0 ? '📋' : '📭',
              label: `${displayDone} done`,
              color: displayDone >= displayTopics.length && displayTopics.length > 0 ? 'bg-secondary/15 border-secondary/30 text-secondary' : 'bg-primary/10 border-primary/25 text-primary',
            },
            {
              id: 'remaining',
              emoji: displayRemaining === 0 ? '🎉' : displayRemaining <= 5 ? '🔥' : displayRemaining <= 20 ? '📝' : '📚',
              label: `${displayRemaining} left`,
              color: displayRemaining === 0 ? 'bg-secondary/15 border-secondary/30 text-secondary' : displayRemaining <= 5 ? 'bg-chart-4/10 border-chart-4/25 text-chart-4' : 'bg-muted/30 border-border/30 text-muted-foreground',
            },
            {
              id: 'important',
              emoji: impCount === 0 ? '☆' : impCount >= 10 ? '🌟' : '⭐',
              label: `${impCount} imp`,
              color: impCount > 0 ? 'bg-chart-4/10 border-chart-4/25 text-chart-4' : 'bg-muted/30 border-border/30 text-muted-foreground',
            },
            {
              id: 'time',
              emoji: totalMin === 0 ? '⏱️' : totalMin >= 120 ? '🔥' : '⏰',
              label: totalMin >= 60 ? `${Math.floor(totalMin/60)}h ${String(totalMin%60).padStart(2,'0')}m` : totalMin > 0 ? `${totalMin} min` : '0 min',
              color: totalMin > 0 ? 'bg-secondary/10 border-secondary/25 text-secondary' : 'bg-muted/30 border-border/30 text-muted-foreground',
              onClick: () => onOpenPomodoro?.(subject.id),
            },
          ];
          return pills.map(p => (
            <button
              key={p.id}
              onClick={(e) => {
                e.stopPropagation();
                if (p.onClick) { p.onClick(); return; }
                setActiveStatPill(prev => prev === p.id ? null : p.id);
                toast(`${p.emoji} ${p.label}`, { duration: 1500 });
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all active:scale-95 hover:scale-[1.02] shrink-0 ${p.color} ${activeStatPill === p.id ? 'ring-1 ring-primary shadow-sm scale-[1.03]' : ''}`}
            >
              <span className="text-xs">{p.emoji}</span>
              {p.label}
            </button>
          ));
        })()}
        </div>
      </div>

      {/* Overview */}
      <SubjectOverview subject={origSubject} onToggleTopic={onToggleTopic} onOpenTopicDetail={onOpenTopicDetail}
        onOpenUnitEditor={onOpenUnitEditor}
        collapsed={overviewCollapsed} onToggleCollapse={() => setOverviewCollapsed(p => !p)}
        diffFilter={subjectDiffFilter} onDiffFilterChange={setSubjectDiffFilter}
        parentDiffFilter={parentDiff}
        statusFilter={subjectStatusFilter} onStatusFilterChange={setSubjectStatusFilter}
        revisionFilter={revisionFilter}
        onRevisionFilterChange={(r) => { setRevisionFilter(r); if (r && !expanded) onToggle(); }} />

      {/* AI Advice */}
      <AiAdviceSection subject={subject} remaining={remaining} daysLeft={daysLeft} />

      {/* Units Toggle */}
      <div className="px-4 pb-1">
        <div className="flex items-center gap-1.5">
          <button onClick={onToggle} className="flex items-center gap-2 flex-1 text-left py-2 px-3 rounded-lg hover:bg-muted/20 transition-colors">
            {expanded ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            <span className="text-sm font-bold text-foreground">
              {expanded ? 'Hide' : 'Show'} Units ({visibleUnits.length})
              {hasActiveFilter && visibleUnits.length !== origSubject.units.length && (
                <span className="text-[10px] text-muted-foreground font-semibold ml-1">of {origSubject.units.length}</span>
              )}
            </span>
          </button>
          {expanded && visibleUnits.length > 1 && (() => {
            const unitIds = visibleUnits.map(u => u.id);
            const allExpanded = unitIds.every(id => expandedUnits.has(id));
            return (
              <button
                onClick={(e) => { e.stopPropagation(); onExpandAllUnits?.(unitIds); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 shrink-0 ${
                  allExpanded
                    ? 'bg-primary/15 border-primary/30 text-primary'
                    : 'bg-muted/40 border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                {allExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                {allExpanded ? 'Collapse' : 'Expand'} All
              </button>
            );
          })()}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Per-Subject Search Bar */}
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              <input
                value={localSearch}
                onChange={e => setLocalSearch(e.target.value)}
                placeholder={localDeepSearch ? `Deep search in ${subject.shortName}...` : `Search in ${subject.shortName}...`}
                className="w-full h-8 pl-8 pr-16 rounded-lg bg-card/40 border border-border/20 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
              />
              {localSearch && (() => {
                let count = 0;
                try {
                  (origSubject.units || []).forEach(u => (u.subTopics || []).forEach(t => {
                    if (topicMatchesSearch(t, u.name, origSubject.name, localSearch, localDeepSearch)) count++;
                  }));
                } catch { /* skip */ }
                return (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">{count} found</span>
                    <button onClick={() => setLocalSearch('')} className="w-4 h-4 rounded-full bg-muted/40 flex items-center justify-center hover:bg-muted/60"><X className="w-2.5 h-2.5 text-muted-foreground" /></button>
                  </div>
                );
              })()}
            </div>
            <DeepSearchToggle enabled={localDeepSearch} onToggle={() => setLocalDeepSearch(p => !p)} />
          </div>
          {editModeAll ? (
          <DndContext sensors={unitDndSensors} collisionDetection={closestCenter} onDragEnd={handleUnitDragEnd}>
            <SortableContext items={origSubject.units.map(u => u.id)} strategy={verticalListSortingStrategy}>
          {origSubject.units.map((unit, idx) => (
            <SortableUnitWrapper key={unit.id} id={unit.id} isDragActive>
            <UnitSection unit={unit} unitIndex={idx} isFirst={idx === 0} isLast={idx === origSubject.units.length - 1}
              onMoveUp={() => onMoveUnit(unit.id, 'up')} onMoveDown={() => onMoveUnit(unit.id, 'down')}
              subjectId={subject.id} subjectColor={subject.color}
              search={localSearch || search} filters={effectiveFilters as any} subjectName={origSubject.name} deepSearch={effectiveDeepSearch}
              expanded={expandedUnits.has(unit.id)} onToggle={() => onToggleUnit(unit.id)}
              onToggleTopic={topicId => onToggleTopic(subject.id, unit.id, topicId)}
              onToggleImportant={topicId => onToggleImportant(subject.id, unit.id, topicId)}
              onBulkToggle={() => onBulkToggle(subject.id, unit.id)}
              onOpenTopicDetail={topic => onOpenTopicDetail(topic, subject.id, unit.id)}
              onRenameUnit={name => onRenameUnit(unit.id, name)}
              onDeleteUnit={() => onDeleteUnit(unit.id)}
              onAddTopic={topic => onAddTopic(unit.id, topic)}
              selectMode={selectMode} selectedTopics={selectedTopics} onSelectTopic={onSelectTopic}
              onSelectAllInUnit={onSelectAllInUnit}
              onOpenUnitEditor={() => onOpenUnitEditor?.(subject.id, unit.id)}
              onOpenPomodoro={(unitId, topicId) => onOpenPomodoro?.(subject.id, unitId, topicId)}
              onOpenTimer={onOpenTimer ? (topicId, topicName, timeSpent) => onOpenTimer(subject.id, unit.id, topicId, topicName, timeSpent) : undefined}
              onCycleTopicStatus={onCycleTopicStatus ? (topicId, newStatus) => onCycleTopicStatus(subject.id, unit.id, topicId, newStatus) : undefined}
              onCycleDifficulty={onCycleDifficulty ? (topicId, newDiff) => onCycleDifficulty(subject.id, unit.id, topicId, newDiff) : undefined}
              onReorderTopic={onReorderTopic ? (topicId, dir) => onReorderTopic(subject.id, unit.id, topicId, dir) : undefined}
              editModeAll={editModeAll}
              totalUnits={origSubject.units.length}
              universalNumbers={universalNumbers}
              onUpdateTopicsModule={onUpdateTopicsModule ? (topicIds, field, value) => onUpdateTopicsModule(origSubject.id, unit.id, topicIds, field, value) : undefined}
              subjectShortName={origSubject.shortName}
              showTopicNumbers={origSubject.showTopicNumbers !== false}
              hideHashSuffix={origSubject.hideHashSuffix}
              subjectUnitFontSize={origSubject.unitFontSize || universalFontSizes.unitFontSize}
              subjectModuleFontSize={origSubject.moduleFontSize || universalFontSizes.moduleFontSize}
              subjectTopicFontSize={origSubject.topicFontSize || universalFontSizes.topicFontSize}
              onJumpToPosition={(newIdx) => {
                if (newIdx === idx || newIdx < 0 || newIdx >= origSubject.units.length) return;
                const newUnits = [...origSubject.units];
                const [moved] = newUnits.splice(idx, 1);
                newUnits.splice(newIdx, 0, moved);
                onReorderUnits?.(newUnits.map(u => u.id));
              }} />
            </SortableUnitWrapper>
          ))}
            </SortableContext>
          </DndContext>
          ) : (
          <>
          {visibleUnits.map((unit) => {
            const idx = origSubject.units.findIndex(u => u.id === unit.id);
            return (
            <div key={unit.id} style={{ contentVisibility: expandedUnits.has(unit.id) ? 'visible' : 'auto' }}>
            <UnitSection unit={unit} unitIndex={idx} isFirst={idx === 0} isLast={idx === origSubject.units.length - 1}
              onMoveUp={() => onMoveUnit(unit.id, 'up')} onMoveDown={() => onMoveUnit(unit.id, 'down')}
              subjectId={subject.id} subjectColor={subject.color}
              search={localSearch || search} filters={effectiveFilters as any} subjectName={origSubject.name} deepSearch={effectiveDeepSearch}
              expanded={expandedUnits.has(unit.id)} onToggle={() => onToggleUnit(unit.id)}
              onToggleTopic={topicId => stableOnToggleTopic(topicId, unit.id)}
              onToggleImportant={topicId => stableOnToggleImportant(topicId, unit.id)}
              onBulkToggle={() => stableOnBulkToggle(unit.id)}
              onOpenTopicDetail={topic => stableOnOpenTopicDetail(topic, unit.id)}
              onRenameUnit={name => stableOnRenameUnit(unit.id, name)}
              onDeleteUnit={() => stableOnDeleteUnit(unit.id)}
              onAddTopic={topic => stableOnAddTopic(unit.id, topic)}
              selectMode={selectMode} selectedTopics={selectedTopics} onSelectTopic={onSelectTopic}
              onSelectAllInUnit={onSelectAllInUnit}
              onOpenUnitEditor={() => stableOnOpenUnitEditor(unit.id)}
              onOpenPomodoro={(unitId, topicId) => stableOnOpenPomodoro(unitId, topicId)}
              onOpenTimer={stableOnOpenTimer ? (topicId, topicName, timeSpent) => stableOnOpenTimer(unit.id, topicId, topicName, timeSpent) : undefined}
              onCycleTopicStatus={stableOnCycleTopicStatus ? (topicId, newStatus) => stableOnCycleTopicStatus(unit.id, topicId, newStatus) : undefined}
              onCycleDifficulty={stableOnCycleDifficulty ? (topicId, newDiff) => stableOnCycleDifficulty(unit.id, topicId, newDiff) : undefined}
              onReorderTopic={stableOnReorderTopic ? (topicId, dir) => stableOnReorderTopic(unit.id, topicId, dir) : undefined}
              editModeAll={false}
              totalUnits={origSubject.units.length}
              universalNumbers={universalNumbers}
              onUpdateTopicsModule={stableOnUpdateTopicsModule ? (topicIds, field, value) => stableOnUpdateTopicsModule(unit.id, topicIds, field, value) : undefined}
              subjectShortName={origSubject.shortName}
              showTopicNumbers={origSubject.showTopicNumbers !== false}
              hideHashSuffix={origSubject.hideHashSuffix}
              subjectUnitFontSize={origSubject.unitFontSize || universalFontSizes.unitFontSize}
              subjectModuleFontSize={origSubject.moduleFontSize || universalFontSizes.moduleFontSize}
              subjectTopicFontSize={origSubject.topicFontSize || universalFontSizes.topicFontSize}
              onJumpToPosition={(newIdx) => {
                if (newIdx === idx || newIdx < 0 || newIdx >= origSubject.units.length) return;
                const newUnits = [...origSubject.units];
                const [moved] = newUnits.splice(idx, 1);
                newUnits.splice(newIdx, 0, moved);
                onReorderUnits?.(newUnits.map(u => u.id));
              }} />
            </div>
            );
          })}
          </>
          )}
          <Button variant="ghost" size="sm" onClick={() => setAddUnitOpen(true)} className="w-full text-sm gap-1.5 text-muted-foreground h-9 hover:bg-card/30 font-semibold">
            <Plus className="w-4 h-4" /> Add Unit
          </Button>
        </div>
      )}

      {/* Hidden file input for import */}
      <input type="file" accept=".json" id={`import-file-${subject.id}`} className="hidden" onChange={handleImportFile} />

      {/* Merge Units Bar */}
      <Collapse open={!!mergeMode} className="px-4 pb-3">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
              <p className="text-sm font-bold text-foreground">🔀 Select units to merge ({mergeSelected.size} selected)</p>
              <div className="space-y-1">
                {origSubject.units.map((u, i) => (
                  <button key={u.id} onClick={() => setMergeSelected(prev => { const n = new Set(prev); n.has(u.id) ? n.delete(u.id) : n.add(u.id); return n; })}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${mergeSelected.has(u.id) ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-card/30 text-foreground/70 border border-border/20'}`}>
                    <span className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 text-xs"
                      style={{ borderColor: mergeSelected.has(u.id) ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}>
                      {mergeSelected.has(u.id) && '✓'}
                    </span>
                    Unit {i + 1}: {u.name} ({u.subTopics.length} topics)
                  </button>
                ))}
              </div>
              {mergeSelected.size >= 2 && (() => {
                const orderedSelected = origSubject.units.filter(u => mergeSelected.has(u.id));
                const firstName = orderedSelected[0]?.name || '';
                const totalTopicCount = orderedSelected.reduce((a, u) => a + u.subTopics.length, 0);
                const names = orderedSelected.map(u => `${u.subTopics.length}`).join(' + ');
                return (
                  <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs font-semibold text-primary">
                    Will combine {names} topics into &quot;{firstName}&quot; ({totalTopicCount} total)
                  </div>
                );
              })()}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleMergeUnits} disabled={mergeSelected.size < 2} className="flex-1 h-10 text-sm font-bold">
                  Merge {mergeSelected.size} Units
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setMergeMode(false); setMergeSelected(new Set()); }} className="h-10 text-sm font-bold">
                  Cancel
                </Button>
              </div>
            </div>
      </Collapse>

      <BottomSheet open={addUnitOpen} onClose={() => setAddUnitOpen(false)} title="➕ Add Unit">
        <div className="space-y-4">
          <div><Label className="text-sm text-muted-foreground font-semibold">Unit Name</Label>
            <Input value={newUnitName} onChange={e => setNewUnitName(e.target.value)} className="mt-1" placeholder="e.g. Unit 1: Basics"
              onKeyDown={e => e.key === 'Enter' && handleAddUnit()} /></div>
          <Button className="w-full" onClick={handleAddUnit} disabled={!newUnitName.trim()}>Add Unit</Button>
        </div>
      </BottomSheet>
    </div>
  );
});

export default SubjectCard;

// Sortable unit wrapper for drag-to-reorder
function SortableUnitWrapper({ id, isDragActive, children }: { id: string; isDragActive: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  if (!isDragActive) return <>{children}</>;
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : undefined,
        position: 'relative',
      }}
      className={isDragging ? 'scale-[1.01] shadow-xl ring-2 ring-primary/30 rounded-xl' : ''}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

// AI Advice component with caching
function AiAdviceSection({ subject, remaining, daysLeft }: { subject: Subject; remaining: number; daysLeft: number }) {
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const all = subject.units.flatMap(u => u.subTopics);
  const done = all.filter(t => t.completed).length;
  const cacheKey = `ai-advice-${subject.id}-${done}-${all.length}`;

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) { setAdvice(cached); setFetched(true); }
    } catch {}
  }, [cacheKey]);

  const fetchAdvice = useCallback(async () => {
    if (loading || fetched) return;
    setLoading(true);
    try {
      const { studyAdvice } = await import('@/platform/api');
      const easyRemaining = all.filter(t => !t.completed && t.difficulty === 'Easy').length;
      const medRemaining = all.filter(t => !t.completed && t.difficulty === 'Medium').length;
      const hardRemaining = all.filter(t => !t.completed && t.difficulty === 'Hard').length;
      const result = await studyAdvice({
        subjectName: subject.name,
        totalTopics: all.length,
        doneTopics: done,
        daysUntilExam: daysLeft,
        easyCount: easyRemaining,
        mediumCount: medRemaining,
        hardCount: hardRemaining,
      });
      setAdvice(result.advice);
      setFetched(true);
      try { sessionStorage.setItem(cacheKey, result.advice); } catch {}
    } catch {
      setAdvice('Keep going — consistency beats intensity!');
      setFetched(true);
    } finally { setLoading(false); }
  }, [loading, fetched, subject, all, done, daysLeft, cacheKey]);

  if (remaining === 0) return null;

  return (
    <div className="px-4 pb-2">
      {!fetched && !loading ? (
        <button onClick={fetchAdvice} className="flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary font-semibold transition-colors">
          <Bot className="w-3.5 h-3.5" /> 🤖 Get AI Advice
        </button>
      ) : loading ? (
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-primary animate-pulse" />
          <div className="h-3 w-48 bg-muted/30 rounded animate-pulse" />
        </div>
      ) : advice ? (
        <p className="text-xs text-primary/80 font-medium flex items-start gap-1.5">
          <Bot className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
          <span>{advice}</span>
        </p>
      ) : null}
    </div>
  );
}
