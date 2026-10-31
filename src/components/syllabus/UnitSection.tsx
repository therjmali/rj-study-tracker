import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Collapse from '../shared/Collapse';
import { ChevronDown, ChevronRight, CheckCheck, Plus, Pencil, Trash2, X, Check, ExternalLink, FolderOpen, Folder, Square, CheckSquare, Timer, Clock, CheckCircle2, Calendar } from 'lucide-react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@project/components/ui/alert-dialog';
import BottomSheet from '../shared/BottomSheet';
import { Label } from '@project/components/ui/label';
import TopicRow from './TopicRow';
import type { Unit, SubTopic, UserSettings } from '../../types';
import { formatStudyTime, formatDate, getLocalDateStr, getSubjectFontSize } from '../../lib/utils';
import { getUnitProgress, unitStatusEmoji } from '../../lib/unitProgress';
import type { SyllabusFilters } from './SyllabusHeader';
import { topicMatchesSearch } from '../../lib/syllabusFilter';
import SmartCopyButton from '../shared/SmartCopyButton';
import { toast } from 'sonner';
import { formatUnitSyllabus, formatUnitHeader, formatSubModuleSyllabus } from '../../lib/syllabusFormatter';

/** Progress fill uses a CSS variable so it adapts per theme */
const PROGRESS_FILL = 'var(--progress-fill, hsl(34 20% 90%))';

/** State-driven card styling helper */
function getStateStyles(pct: number, isComplete: boolean) {
  if (isComplete) return {
    bg: 'hsl(var(--state-complete-bg))',
    border: 'hsl(var(--state-complete-border))',
    accent: 'hsl(var(--state-complete-border))',
    text: 'hsl(var(--state-complete-text))',
    fill: 'hsl(var(--state-complete-bg))',
  };
  if (pct > 0) return {
    bg: 'hsl(var(--card))',
    border: 'hsl(var(--state-neutral-border))',
    accent: 'hsl(var(--state-complete-border) / 0.6)',
    text: 'hsl(var(--foreground))',
    fill: 'hsl(var(--state-complete-bg))',
  };
  return {
    bg: 'hsl(var(--card))',
    border: 'hsl(var(--state-neutral-border))',
    accent: 'hsl(var(--state-neutral-accent))',
    text: 'hsl(var(--foreground))',
    fill: 'transparent',
  };
}

function getExamLabelFromSettings(): string {
  try {
    const raw = localStorage.getItem('nursing-settings-v2');
    if (!raw) return 'NORCET';
    const s = JSON.parse(raw) as UserSettings;
    const mode = s.studentMode || 'nursing';
    if (mode === 'agriculture') return s.examLabelAgriculture || 'AAO';
    return s.examLabelNursing || 'NORCET';
  } catch { return 'NORCET'; }
}

interface SubModuleGroup { name: string; topics: SubTopic[]; done: number; total: number; }
interface ModuleGroup { name: string; topics: SubTopic[]; subModules: SubModuleGroup[]; done: number; total: number; }

interface Props {
  unit: Unit; unitIndex: number; isFirst: boolean; isLast: boolean;
  onMoveUp: () => void; onMoveDown: () => void;
  subjectId: string; subjectColor: string; search: string; filters: SyllabusFilters;
  /** Full subject name + deep-search flag so unit-level filtering matches the parent's search rules */
  subjectName?: string; deepSearch?: boolean;
  expanded: boolean; onToggle: () => void;
  onToggleTopic: (topicId: string) => void; onToggleImportant: (topicId: string) => void;
  onBulkToggle: () => void; onOpenTopicDetail: (topic: SubTopic) => void;
  onRenameUnit: (name: string) => void; onDeleteUnit: () => void;
  onAddTopic: (topic: SubTopic) => void;
  selectMode: boolean; selectedTopics: Set<string>; onSelectTopic: (id: string) => void;
  onSelectAllInUnit?: (topicIds: string[]) => void;
  onOpenUnitEditor?: () => void;
  onOpenPomodoro?: (unitId: string, topicId?: string) => void;
  onOpenTimer?: (topicId: string, topicName: string, timeSpent: number) => void;
  onCycleTopicStatus?: (topicId: string, newStatus: import('../../types').TopicStatus) => void;
  onCycleDifficulty?: (topicId: string, newDifficulty: 'Easy' | 'Medium' | 'Hard') => void;
  onReorderTopic?: (topicId: string, direction: 'up' | 'down') => void;
  editModeAll?: boolean;
  onJumpToPosition?: (newIndex: number) => void;
  totalUnits?: number;
  universalNumbers?: Map<string, number>;
  onUpdateTopicsModule?: (topicIds: string[], field: 'module' | 'subModule', value: string | undefined) => void;
  subjectShortName?: string;
  showTopicNumbers?: boolean;
  hideHashSuffix?: boolean;
  subjectUnitFontSize?: string;
  subjectModuleFontSize?: string;
  subjectTopicFontSize?: string;
}

const UnitSection = memo(function UnitSection({
  unit, unitIndex, isFirst, isLast, onMoveUp, onMoveDown, subjectId, subjectColor, search, filters, subjectName, deepSearch, expanded, onToggle,
  onToggleTopic, onToggleImportant, onBulkToggle, onOpenTopicDetail,
  onRenameUnit, onDeleteUnit, onAddTopic, selectMode, selectedTopics, onSelectTopic,
  onSelectAllInUnit,
  onOpenUnitEditor,
  onOpenPomodoro,
  onOpenTimer,
  onCycleTopicStatus,
  onCycleDifficulty,
  onReorderTopic,
  editModeAll = false,
  onJumpToPosition,
  totalUnits,
  universalNumbers,
  onUpdateTopicsModule,
  subjectShortName,
  showTopicNumbers = true,
  hideHashSuffix,
  subjectUnitFontSize,
  subjectModuleFontSize,
  subjectTopicFontSize,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(unit.name);
  const [addTopicOpen, setAddTopicOpen] = useState(false);
  const editMode = editModeAll;
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [collapsedSubModules, setCollapsedSubModules] = useState<Set<string>>(new Set());
  const [newTopic, setNewTopic] = useState({ name: '', difficulty: 'Medium' as SubTopic['difficulty'], important: false, norcetRelevance: undefined as string | undefined, module: '', subModule: '' });
  const [editingModule, setEditingModule] = useState<string | null>(null);
  const [editModuleName, setEditModuleName] = useState('');
  const [editingSubModule, setEditingSubModule] = useState<string | null>(null);
  const [editSubModuleName, setEditSubModuleName] = useState('');
  const [addModuleOpen, setAddModuleOpen] = useState(false);
  const [newModuleName, setNewModuleName] = useState('');
  const [addSubModuleFor, setAddSubModuleFor] = useState<string | null>(null);
  const [newSubModuleName, setNewSubModuleName] = useState('');

  // ── Module & Sub-Module CRUD handlers ──
  const handleRenameModule = (oldName: string) => {
    if (!editModuleName.trim() || !onUpdateTopicsModule) { setEditingModule(null); return; }
    const topicIds = unit.subTopics.filter(t => t.module === oldName).map(t => t.id);
    onUpdateTopicsModule(topicIds, 'module', editModuleName.trim());
    toast.success(`Module renamed to "${editModuleName.trim()}"`);
    setEditingModule(null);
  };

  const handleDeleteModule = (moduleName: string) => {
    if (!onUpdateTopicsModule) return;
    const topicIds = unit.subTopics.filter(t => t.module === moduleName).map(t => t.id);
    onUpdateTopicsModule(topicIds, 'module', undefined);
    // Also clear subModule for those topics
    onUpdateTopicsModule(topicIds, 'subModule', undefined);
    toast.success(`Module "${moduleName}" removed — ${topicIds.length} topics ungrouped`);
  };

  const handleRenameSubModule = (parentModule: string, oldName: string) => {
    if (!editSubModuleName.trim() || !onUpdateTopicsModule) { setEditingSubModule(null); return; }
    const topicIds = unit.subTopics.filter(t => t.module === parentModule && t.subModule === oldName).map(t => t.id);
    onUpdateTopicsModule(topicIds, 'subModule', editSubModuleName.trim());
    toast.success(`Sub-module renamed to "${editSubModuleName.trim()}"`);
    setEditingSubModule(null);
  };

  const handleDeleteSubModule = (parentModule: string, subModuleName: string) => {
    if (!onUpdateTopicsModule) return;
    const topicIds = unit.subTopics.filter(t => t.module === parentModule && t.subModule === subModuleName).map(t => t.id);
    onUpdateTopicsModule(topicIds, 'subModule', undefined);
    toast.success(`Sub-module "${subModuleName}" removed — topics moved to parent module`);
  };

  const handleAddModule = () => {
    if (!newModuleName.trim()) { setAddModuleOpen(false); return; }
    // Just open add topic with module pre-filled
    setNewTopic(p => ({ ...p, module: newModuleName.trim(), subModule: '' }));
    setAddModuleOpen(false);
    setAddTopicOpen(true);
    setNewModuleName('');
  };

  const handleAddSubModule = (parentModule: string) => {
    if (!newSubModuleName.trim()) { setAddSubModuleFor(null); return; }
    setNewTopic(p => ({ ...p, module: parentModule, subModule: newSubModuleName.trim() }));
    setAddSubModuleFor(null);
    setAddTopicOpen(true);
    setNewSubModuleName('');
  };

  const moduleNames = useMemo(() => {
    const names = new Set<string>();
    unit.subTopics.forEach(t => { if (t.module) names.add(t.module); });
    return Array.from(names);
  }, [unit.subTopics]);

  const filtered = useMemo(() => {
    let topics = unit.subTopics;
    // Same rules as the global/subject search (name, tags, module, unit, subject, + deep fields)
    if (search) topics = topics.filter(t => topicMatchesSearch(t, unit.name, subjectName || '', search, deepSearch));
    const sf = filters.status;
    if (sf === 'complete') topics = topics.filter(t => t.completed);
    else if (sf === 'in_process') topics = topics.filter(t => t.status === 'in_process');
    else if (sf === 'incomplete') topics = topics.filter(t => !t.completed && t.status !== 'in_process');
    else if (sf === 'important') topics = topics.filter(t => t.important);
    else if (sf === 'focus') topics = topics.filter(t => !t.completed && t.important);
    else if (sf === 'revision_due') { const today = getLocalDateStr(); topics = topics.filter(t => t.completed && t.srsDueDate && t.srsDueDate <= today); }
    else if (sf === 'has_time') topics = topics.filter(t => (t.timeSpent || 0) > 0);
    const df = filters.difficulty;
    if (df !== 'all') topics = topics.filter(t => t.difficulty === df);
    const rm = filters.revisionMissing;
    if (rm) topics = topics.filter(t => t.completed === true && t.revisions?.[rm]?.status !== 'complete');
    return topics;
  }, [unit.subTopics, unit.name, search, filters, subjectName, deepSearch]);

  // Interleaved module groups: ungrouped topics form separate segments
  // so that folder/module topics appear in their correct hierarchical position.
  const moduleGroups = useMemo(() => {
    const groups: ModuleGroup[] = [];
    const moduleGroupMap = new Map<string, ModuleGroup>();
    let currentUngrouped: ModuleGroup | null = null;
    let ungroupedIdx = 0;

    filtered.forEach(t => {
      if (!t.module) {
        if (!currentUngrouped) {
          currentUngrouped = { name: `__ungrouped__${ungroupedIdx++}`, topics: [], subModules: [], done: 0, total: 0 };
          groups.push(currentUngrouped);
        }
        currentUngrouped.topics.push(t);
        currentUngrouped.total++;
        if (t.completed) currentUngrouped.done++;
      } else {
        currentUngrouped = null;
        let group = moduleGroupMap.get(t.module);
        if (!group) {
          group = { name: t.module, topics: [], subModules: [], done: 0, total: 0 };
          moduleGroupMap.set(t.module, group);
          groups.push(group);
        }
        group.total++;
        if (t.completed) group.done++;
        if (t.subModule) {
          let subGroup = group.subModules.find(s => s.name === t.subModule);
          if (!subGroup) { subGroup = { name: t.subModule!, topics: [], done: 0, total: 0 }; group.subModules.push(subGroup); }
          subGroup.topics.push(t); subGroup.total++; if (t.completed) subGroup.done++;
        } else {
          group.topics.push(t);
        }
      }
    });
    return groups;
  }, [filtered]);

  const hasModules = moduleGroups.some(g => !g.name.startsWith('__ungrouped__'));
  const hasSubModules = moduleGroups.some(g => g.subModules.length > 0);

  const filteredDone = useMemo(() => {
    if (filters.difficulty === 'all') return unit.subTopics.filter(t => t.completed).length;
    return unit.subTopics.filter(t => t.difficulty === filters.difficulty && t.completed).length;
  }, [unit.subTopics, filters.difficulty]);

  const filteredTotal = useMemo(() => {
    if (filters.difficulty === 'all') return unit.subTopics.length;
    return unit.subTopics.filter(t => t.difficulty === filters.difficulty).length;
  }, [unit.subTopics, filters.difficulty]);

  const done = unit.subTopics.filter(t => t.completed).length;
  const allDone = unit.subTopics.length > 0 && done === unit.subTopics.length;
  const pct = filteredTotal > 0 ? Math.round((filteredDone / filteredTotal) * 100) : 0;

  // Three-state: count in_process topics
  const inProcessCount = unit.subTopics.filter(t => t.status === 'in_process').length;

  const toggleModule = (name: string) => { setCollapsedModules(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; }); };
  const toggleSubModule = (key: string) => { setCollapsedSubModules(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; }); };

  const handleAddTopic = () => {
    if (!newTopic.name.trim()) return;
    const topic: SubTopic = {
      id: `${unit.id}-ct-${Date.now()}`, name: newTopic.name.trim(), completed: false,
      notes: '', notesArr: [], difficulty: newTopic.difficulty, timeSpent: 0,
      important: newTopic.important, mcqs: [], tags: [],
      norcetRelevance: newTopic.norcetRelevance as any,
      module: newTopic.module || undefined, subModule: newTopic.subModule || undefined,
    };
    onAddTopic(topic);
    setNewTopic({ name: '', difficulty: 'Medium', important: false, norcetRelevance: undefined, module: newTopic.module, subModule: '' });
    setAddTopicOpen(false);
  };

  const saveRename = () => { if (editName.trim()) { onRenameUnit(editName.trim()); setEditing(false); } };

  // Compute hierarchical auto-numbers: unitIndex.topicIndex (e.g. 1.1, 1.2, 2.1)
  // Depend on topic ID list so any add/delete/reorder triggers recomputation
  const topicIdKey = useMemo(() => unit.subTopics.map(t => t.id).join(','), [unit.subTopics]);
  const autoNumberMap = useMemo(() => {
    const map = new Map<string, string>();
    // Use all unit topics (not filtered) for stable numbering
    unit.subTopics.forEach((t, idx) => {
      map.set(t.id, `${unitIndex + 1}.${idx + 1}`);
    });
    return map;
  }, [unit.subTopics, unitIndex, topicIdKey]);

  const renderTopic = (topic: SubTopic, idx: number, topicList?: SubTopic[]) => {
    return (
    <div key={topic.id} className="topic-row-container">
      <TopicRow topic={topic} subjectId={subjectId} unitId={unit.id}
        onToggle={() => onToggleTopic(topic.id)} onToggleImportant={() => onToggleImportant(topic.id)}
        onOpenDetail={() => onOpenTopicDetail(topic)}
        onOpenPomodoro={onOpenPomodoro ? () => onOpenPomodoro(unit.id, topic.id) : undefined}
        onOpenTimer={onOpenTimer ? () => onOpenTimer(topic.id, topic.name, topic.timeSpent) : undefined}
        onCycleStatus={onCycleTopicStatus ? (newStatus) => onCycleTopicStatus(topic.id, newStatus) : undefined}
        onCycleDifficulty={onCycleDifficulty ? () => {
          const order: ('Easy' | 'Medium' | 'Hard')[] = ['Easy', 'Medium', 'Hard'];
          const idx = order.indexOf(topic.difficulty as any);
          const next = order[(idx + 1) % 3];
          onCycleDifficulty(topic.id, next);
          const emoji = next === 'Easy' ? '🟢' : next === 'Medium' ? '🟡' : '🔴';
          toast(`${emoji} Marked ${next}`, { duration: 1200 });
        } : undefined}
        selectMode={selectMode} selected={selectedTopics.has(topic.id)} onSelect={() => onSelectTopic(topic.id)}
        universalNumber={universalNumbers?.get(topic.id)}
        searchQuery={search}
        autoNumber={autoNumberMap.get(topic.id)}
        subjectShortName={subjectShortName}
        subjectColor={subjectColor}
        totalInUnit={unit.subTopics.length}
        indexInUnit={unit.subTopics.indexOf(topic) + 1}
        showTopicNumbers={showTopicNumbers}
        hideHashSuffix={hideHashSuffix}
        subjectTopicFontSize={subjectTopicFontSize} />
    </div>
    );
  };

  const renderSubModule = (subGroup: SubModuleGroup, parentModule: string) => {
    const smKey = `${parentModule}::${subGroup.name}`;
    const isCollapsed = collapsedSubModules.has(smKey);
    const smPct = subGroup.total > 0 ? Math.round((subGroup.done / subGroup.total) * 100) : 0;
    const smComplete = subGroup.total > 0 && subGroup.done === subGroup.total;
    const isEditingSM = editingSubModule === smKey;
    const smTimeMin = subGroup.topics.reduce((a, t) => a + (t.timeSpent || 0), 0);
    const smLastDate = subGroup.topics.reduce((latest, t) => (t.completedDate && t.completedDate > latest ? t.completedDate : latest), '');
    const smStyles = getStateStyles(smPct, smComplete);

    return (
      <div key={smKey} className="space-y-2">
        {/* Sub-module card — same pattern as module card */}
        <div
          className="relative group/smhdr w-full cursor-pointer"
          style={{
            borderRadius: '16px',
            background: 'hsl(var(--card))',
            border: `1.5px solid hsl(var(--border) / 0.5)`,
            overflow: 'hidden',
          }}
        >
          {isEditingSM ? (
            <div className="flex items-center gap-1 flex-1 px-3 py-2">
              <Input value={editSubModuleName} onChange={e => setEditSubModuleName(e.target.value)} className="h-6 text-[10px] flex-1"
                onKeyDown={e => { if (e.key === 'Enter') handleRenameSubModule(parentModule, subGroup.name); if (e.key === 'Escape') setEditingSubModule(null); }} autoFocus />
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleRenameSubModule(parentModule, subGroup.name)}><Check className="w-2.5 h-2.5" /></Button>
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditingSubModule(null)}><X className="w-2.5 h-2.5" /></Button>
            </div>
          ) : (
            <div onClick={() => toggleSubModule(smKey)} style={{ padding: '12px 14px 10px' }}>
              {/* Top: folder emoji + title + collapse */}
              <div className="flex items-start gap-2">
                <span className="text-base shrink-0 mt-0.5 select-none cursor-pointer active:scale-[0.85] transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.vibrate?.(25);
                    const content = formatSubModuleSyllabus(subGroup.name, subGroup.topics);
                    navigator.clipboard?.writeText(content);
                    toast('📂 Subfolder copied', { icon: '📋', duration: 1500 });
                  }}
                  title="Tap to copy subfolder content"
                >📁</span>

                <h5 className="flex-1 min-w-0 font-bold uppercase leading-tight"
                  style={{ fontSize: getSubjectFontSize('module', subjectModuleFontSize) || 'var(--text-size-module, 14px)', letterSpacing: '0.2px', color: 'hsl(var(--foreground))', overflowWrap: 'break-word', wordBreak: 'normal', hyphens: 'none' }}>
                  {subGroup.name}
                </h5>

                <div className="flex items-center gap-0.5 shrink-0">
                  {onUpdateTopicsModule && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover/smhdr:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setEditSubModuleName(subGroup.name); setEditingSubModule(smKey); }}
                        className="w-5 h-5 rounded flex items-center justify-center hover:bg-muted/30 transition-colors" title="Rename sub-module">
                        <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button onClick={(e) => e.stopPropagation()} className="w-5 h-5 rounded flex items-center justify-center hover:bg-destructive/15 transition-colors" title="Delete sub-module">
                            <Trash2 className="w-2.5 h-2.5 text-destructive/60" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete Sub-Module</AlertDialogTitle>
                            <AlertDialogDescription>Remove &quot;{subGroup.name}&quot;? Its {subGroup.total} topics will move to the parent module.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteSubModule(parentModule, subGroup.name)}>Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); toggleSubModule(smKey); }} className="shrink-0 ml-1">
                    {isCollapsed ? <span className="text-muted-foreground/50 text-xs">▶</span> : <span className="text-muted-foreground/50 text-xs">▼</span>}
                  </button>
                </div>
              </div>

              {/* Metadata row */}
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" style={{ opacity: 0.5 }} />
                  {smTimeMin > 0 ? formatStudyTime(smTimeMin) : '0m'}
                </span>
                <span className="inline-flex items-center gap-1">
                  📅 {smLastDate ? formatDate(smLastDate) : '—'}
                </span>
                <span className="inline-flex items-center gap-1">
                  {unitStatusEmoji(getUnitProgress(subGroup.done, subGroup.total).status)} {subGroup.done}/{subGroup.total}
                </span>
                {smComplete && <span className="select-none">⭐</span>}
                <span className="ml-auto font-bold font-mono text-[12px] shrink-0"
                  style={{ color: 'hsl(var(--foreground))' }}>
                  {smPct}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-2 h-[4px] rounded-full overflow-hidden" style={{ background: 'hsl(var(--border) / 0.4)' }}>
                <div className="h-full rounded-full transition-all duration-500 ease-out" style={{
                  width: `${smPct}%`,
                  backgroundColor: subjectColor || 'hsl(var(--foreground) / 0.3)',
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Expanded topics — independent cards, no container */}
        <Collapse open={!isCollapsed} duration={150}>
              <div className="pl-3" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--density-gap, 8px)' }}>
                {subGroup.topics.map((topic, tIdx) => renderTopic(topic, tIdx))}
              </div>
        </Collapse>
      </div>
    );
  };

  const renderModule = (group: ModuleGroup, gIdx: number) => {
    const isUngrouped = group.name.startsWith('__ungrouped__');
    const isCollapsed = collapsedModules.has(group.name);
    const modulePct = group.total > 0 ? Math.round((group.done / group.total) * 100) : 0;
    const isEditingMod = editingModule === group.name;
    if (isUngrouped) return group.topics.map((topic, idx) => renderTopic(topic, idx));
    const moduleComplete = group.total > 0 && group.done === group.total;
    return (
      <div key={group.name} className={`relative group/modhdr rounded-lg transition-colors ${moduleComplete ? 'bg-secondary/8' : ''}`}>
        {isEditingMod ? (
          <div className="flex items-center gap-1.5 px-1 py-1">
            <FolderOpen className="w-[14px] h-[14px] text-primary/70 shrink-0" />
            <Input value={editModuleName} onChange={e => setEditModuleName(e.target.value)} className="h-7 text-xs flex-1"
              onKeyDown={e => { if (e.key === 'Enter') handleRenameModule(group.name); if (e.key === 'Escape') setEditingModule(null); }} autoFocus />
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleRenameModule(group.name)}><Check className="w-3 h-3" /></Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingModule(null)}><X className="w-3 h-3" /></Button>
          </div>
        ) : (
        <div className="w-full">
        <button onClick={() => toggleModule(group.name)} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted/20 transition-all group/mod">
          {/* Row 1: folder icon + name + edit controls + chevron */}
          <div className="flex items-start gap-2">
            <div className="shrink-0 w-[18px] flex items-center justify-center mt-0.5 cursor-pointer active:scale-[0.85] transition-all"
              onClick={(e) => {
                e.stopPropagation();
                navigator.vibrate?.(25);
                const smGroups = group.subModules.map(sm => ({ name: sm.name, topics: sm.topics }));
                const content = `📂 ${group.name}\n${group.topics.map(t => `  • ${t.name}`).join('\n')}${smGroups.length > 0 ? '\n' + smGroups.map(sm => `  ▸ ${sm.name}\n${sm.topics.map(t => `    • ${t.name}`).join('\n')}`).join('\n') : ''}`;
                navigator.clipboard?.writeText(content);
                toast('📂 Module copied', { icon: '📋', duration: 1500 });
              }}
              title="Tap to copy module content"
            >
              {moduleComplete ? <CheckCircle2 className="w-[14px] h-[14px] text-secondary" /> : isCollapsed ? <Folder className="w-[14px] h-[14px] text-muted-foreground" /> : <FolderOpen className="w-[14px] h-[14px] text-primary/70" />}
            </div>

            <span className={`flex-1 min-w-0 font-bold uppercase leading-tight ${moduleComplete ? 'text-secondary' : 'text-primary/80'}`} style={{ fontSize: getSubjectFontSize('module', subjectModuleFontSize) || 'var(--text-size-module, 14px)', letterSpacing: '0.2px', overflowWrap: 'break-word', wordBreak: 'normal', hyphens: 'none' }}>{group.name}</span>

            <div className="flex items-center gap-0.5 shrink-0">
              {onUpdateTopicsModule && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover/modhdr:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); setEditModuleName(group.name); setEditingModule(group.name); }}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-muted/30 transition-colors" title="Rename module">
                    <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setAddSubModuleFor(group.name); setNewSubModuleName(''); }}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-muted/30 transition-colors" title="Add sub-module">
                    <Plus className="w-2.5 h-2.5 text-muted-foreground" />
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button onClick={(e) => e.stopPropagation()} className="w-5 h-5 rounded flex items-center justify-center hover:bg-destructive/15 transition-colors" title="Delete module">
                        <Trash2 className="w-2.5 h-2.5 text-destructive/60" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete Module</AlertDialogTitle>
                        <AlertDialogDescription>Remove &quot;{group.name}&quot;? Its {group.total} topics will become ungrouped.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteModule(group.name)}>Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
              <button onClick={(e) => { e.stopPropagation(); toggleModule(group.name); }} className="shrink-0 ml-1">
                {isCollapsed ? <span className="text-muted-foreground/50 text-xs">▶</span> : <span className="text-muted-foreground/50 text-xs">▼</span>}
              </button>
            </div>
          </div>

          {/* Row 2: status metadata + progress bar */}
          <div className="flex items-center gap-3 mt-1.5 text-[11px] font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <span className="inline-flex items-center gap-1">
              {unitStatusEmoji(getUnitProgress(group.done, group.total).status)} {group.done}/{group.total}
            </span>
            <div className="flex-1 h-[4px] rounded-full overflow-hidden" style={{ background: 'hsl(var(--border) / 0.4)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${modulePct}%`, backgroundColor: modulePct >= 100 ? 'hsl(var(--secondary))' : subjectColor }} />
            </div>
            <span className="font-bold font-mono text-[12px] shrink-0" style={{ color: 'hsl(var(--foreground))' }}>
              {modulePct}%
            </span>
          </div>
        </button>
        </div>
        )}
        <Collapse open={!isCollapsed} duration={150} className="relative z-[1]">
              <div className="pl-3 pb-2 pr-2" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--density-gap, 8px)' }}>
                {group.topics.map((topic, tIdx) => renderTopic(topic, tIdx))}
                {group.subModules.map(sm => renderSubModule(sm, group.name))}
              </div>
        </Collapse>
      </div>
    );
  };

  // Total time across all topics in this unit
  const totalUnitTimeMin = useMemo(() => {
    return unit.subTopics.reduce((a, t) => a + (t.timeSpent || 0), 0) + (unit.timeSpent || 0);
  }, [unit.subTopics, unit.timeSpent]);

  // Last study date across all topics
  const lastStudyDate = useMemo(() => {
    let latest = '';
    unit.subTopics.forEach(t => {
      if (t.completedDate && t.completedDate > latest) latest = t.completedDate;
    });
    return latest;
  }, [unit.subTopics]);

  // Hide the unit when active filters/search leave nothing to show.
  // NOTE: must stay AFTER every hook above — returning earlier changes the hook count
  // between renders and crashes the whole subject card (React error #300).
  if (filtered.length === 0 && (search || filters.status !== 'all' || filters.difficulty !== 'all' || filters.revisionMissing)) return null;

  return (
    <div
      className="relative w-full"
      style={{
        borderRadius: '22px',
        background: 'hsl(var(--card))',
        border: `1.5px solid hsl(var(--border) / 0.6)`,
        boxShadow: '0 1px 4px hsl(var(--foreground) / 0.03)',
        overflow: 'hidden',
        position: 'relative' as const,
      }}
    >
      {/* Left Accent Strip */}
      <div className="absolute top-0 left-0 w-[5px] h-full rounded-l-[22px]" style={{ backgroundColor: subjectColor }} />

      {/* Unit Header */}
      <div className="relative z-[1]" style={{ padding: '20px 20px 16px 24px' }}>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-sm flex-1"
              onKeyDown={e => e.key === 'Enter' && saveRename()} autoFocus />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveRename}><Check className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(false); }}><X className="w-3.5 h-3.5" /></Button>
          </div>
        ) : (
          <>
            {/* Top row: chevron + badge + title */}
            <div className="flex items-center gap-2.5">
              {selectMode && onSelectAllInUnit && (
                <button onClick={() => {
                  const allIds = unit.subTopics.map(t => t.id);
                  onSelectAllInUnit(allIds);
                }} className="shrink-0">
                  {unit.subTopics.length > 0 && unit.subTopics.every(t => selectedTopics.has(t.id))
                    ? <CheckSquare className="w-4 h-4 text-primary" />
                    : <Square className="w-4 h-4 text-muted-foreground" />}
                </button>
              )}

              <button onClick={onToggle} className="shrink-0 transition-transform duration-200" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
              </button>

              {/* Unit Number Badge */}
              <UnitCopyBadge
                unitIndex={unitIndex}
                unitName={unit.name}
                subjectColor={subjectColor}
                subTopics={unit.subTopics}
              />

              {/* Title */}
              <button onClick={onOpenUnitEditor}
                className="flex-1 min-w-0 text-left group/unit"
                title="Click to open unit details">
                <h3
                  className="font-extrabold break-words leading-tight group-hover/unit:opacity-80 transition-opacity"
                  style={{ fontSize: getSubjectFontSize('unit', subjectUnitFontSize) || 'var(--text-size-unit, 24px)', fontWeight: 700, letterSpacing: '-0.3px', color: 'hsl(var(--foreground))' }}
                >
                  {unit.name}
                </h3>
              </button>

              {/* Edit mode controls */}
              <AnimatePresence>
                {editMode && (
                  <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 'auto', opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }} className="flex items-center gap-1 overflow-hidden shrink-0">
                    <PositionInput current={unitIndex} total={totalUnits ?? 1} onJump={(pos) => onJumpToPosition?.(pos)} />
                    <div className="flex flex-col -my-1">
                      <button onClick={e => { e.stopPropagation(); onMoveUp(); }} disabled={isFirst}
                        className="h-4 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 transition-all active:scale-90">
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); onMoveDown(); }} disabled={isLast}
                        className="h-4 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 transition-all active:scale-90">
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6"
                      onClick={() => { setEditName(unit.name); setEditing(true); }}><Pencil className="w-3 h-3" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/60 hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Delete Unit</AlertDialogTitle>
                          <AlertDialogDescription>Remove &quot;{unit.name}&quot; and its {unit.subTopics.length} topics?</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={onDeleteUnit}>Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom status row — time / done / date on left, percentage on right */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-4 text-[13px] font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" style={{ opacity: 0.5 }} />
                  {totalUnitTimeMin > 0 ? formatStudyTime(totalUnitTimeMin) : '0m'}
                </span>
                <span className="inline-flex items-center gap-1">
                  {unitStatusEmoji(getUnitProgress(filteredDone, filteredTotal).status)} {filteredDone}/{filteredTotal}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" style={{ opacity: 0.5 }} />
                  {lastStudyDate ? formatDate(lastStudyDate) : '—'}
                </span>
              </div>
              <span className="text-[16px] font-bold font-mono shrink-0"
                style={{ color: 'hsl(var(--foreground))' }}>
                {pct}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="mt-3 h-[5px] rounded-full overflow-hidden" style={{ background: 'hsl(var(--border) / 0.4)' }}>
              <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%`, backgroundColor: subjectColor || 'hsl(var(--foreground) / 0.3)' }} />
            </div>
          </>
        )}
      </div>

      {/* Expanded Content */}
      <Collapse open={expanded} duration={200}>
            <div className="px-4 sm:px-4 pb-4 sm:pb-4 relative z-[1]" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--density-gap, 8px)' }}>
              {/* Unit Stats Pills removed — info already in header */}
              {hasModules || hasSubModules ? (
                <>
                  {moduleGroups.map((group, gIdx) => renderModule(group, gIdx))}
                  {/* Add Sub-Module inline input */}
                  {addSubModuleFor && (
                    <div className="flex items-center gap-1.5 px-1 py-1 ml-[9px] pl-3 border-l border-primary/15">
                      <FolderOpen className="w-3 h-3 text-accent-foreground/50 shrink-0" />
                      <Input value={newSubModuleName} onChange={e => setNewSubModuleName(e.target.value)} className="h-6 text-[10px] flex-1"
                        placeholder={`New sub-module in ${addSubModuleFor}...`}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddSubModule(addSubModuleFor!); if (e.key === 'Escape') setAddSubModuleFor(null); }} autoFocus />
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleAddSubModule(addSubModuleFor!)}><Check className="w-2.5 h-2.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setAddSubModuleFor(null)}><X className="w-2.5 h-2.5" /></Button>
                    </div>
                  )}
                  {/* Add Module button */}
                  {onUpdateTopicsModule && !addModuleOpen && (
                    <Button variant="ghost" size="sm" onClick={() => { setAddModuleOpen(true); setNewModuleName(''); }} className="w-full text-[10px] gap-1 text-muted-foreground/60 h-6 mt-0.5">
                      <Plus className="w-2.5 h-2.5" /> Add Module
                    </Button>
                  )}
                  {addModuleOpen && (
                    <div className="flex items-center gap-1.5 px-1 py-1">
                      <Folder className="w-[14px] h-[14px] text-primary/50 shrink-0" />
                      <Input value={newModuleName} onChange={e => setNewModuleName(e.target.value)} className="h-7 text-xs flex-1"
                        placeholder="New module name..."
                        onKeyDown={e => { if (e.key === 'Enter') handleAddModule(); if (e.key === 'Escape') setAddModuleOpen(false); }} autoFocus />
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleAddModule}><Check className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAddModuleOpen(false)}><X className="w-3 h-3" /></Button>
                    </div>
                  )}
                </>
              ) : (
                filtered.map((topic, idx) => renderTopic(topic, idx))
              )}
              <Button variant="ghost" size="sm" onClick={() => setAddTopicOpen(true)} className="w-full text-xs gap-1 text-muted-foreground h-7 mt-1">
                <Plus className="w-3 h-3" /> Add Topic
              </Button>
            </div>
      </Collapse>

      {/* Add Topic Sheet */}
      <BottomSheet open={addTopicOpen} onClose={() => setAddTopicOpen(false)} title="➕ Add Topic">

        <div className="space-y-4">
          <div><Label className="text-xs text-muted-foreground">Topic Name</Label>
            <Input value={newTopic.name} onChange={e => setNewTopic(p => ({ ...p, name: e.target.value }))} className="mt-1" placeholder="e.g. Gametogenesis (Part-1)" /></div>
          <div>
            <Label className="text-xs text-muted-foreground">Module (Level 2 folder)</Label>
            <Input value={newTopic.module} onChange={e => setNewTopic(p => ({ ...p, module: e.target.value }))} className="mt-1" placeholder="e.g. Respiratory System" />
            {moduleNames.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {moduleNames.map(m => (
                  <button key={m} onClick={() => setNewTopic(p => ({ ...p, module: m }))}
                    className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors ${newTopic.module === m ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted/20 text-muted-foreground border-border/30 hover:bg-muted/40'}`}>
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Sub-Module (Level 3 folder, optional)</Label>
            <Input value={newTopic.subModule} onChange={e => setNewTopic(p => ({ ...p, subModule: e.target.value }))} className="mt-1" placeholder="e.g. Upper Respiratory Tract" />
          </div>
          <div><Label className="text-xs text-muted-foreground">Difficulty</Label>
            <div className="flex gap-2 mt-1">
              {(['Easy', 'Medium', 'Hard'] as const).map(d => (
                <Button key={d} size="sm" variant={newTopic.difficulty === d ? 'default' : 'outline'}
                  onClick={() => setNewTopic(p => ({ ...p, difficulty: d }))} className="flex-1 text-xs">{d}</Button>
              ))}</div></div>
          <div className="flex gap-4">
            <Button size="sm" variant={newTopic.important ? 'default' : 'outline'} className="flex-1 text-xs"
              onClick={() => setNewTopic(p => ({ ...p, important: !p.important }))}>{newTopic.important ? '⭐ Important' : 'Not Important'}</Button>
          </div>
          <div><Label className="text-xs text-muted-foreground">{getExamLabelFromSettings()} Relevance</Label>
            <div className="flex gap-1 mt-1">
              {['High', 'Med', 'Low', 'None'].map(r => (
                <Button key={r} size="sm" variant={newTopic.norcetRelevance === (r === 'None' ? undefined : r) ? 'default' : 'outline'}
                  onClick={() => setNewTopic(p => ({ ...p, norcetRelevance: r === 'None' ? undefined : r }))}
                  className="flex-1 text-[10px] px-1">{r}</Button>
              ))}</div></div>
          <Button className="w-full" onClick={handleAddTopic} disabled={!newTopic.name.trim()}>Add Topic</Button>
        </div>
      </BottomSheet>
    </div>
  );
});

export default UnitSection;

const formatTimeSpentShort = formatStudyTime;

function UnitStatsPills({ unit, subjectColor }: { unit: Unit; subjectColor: string }) {
  const topics = unit.subTopics;
  const done = topics.filter(t => t.completed).length;
  const topicMin = topics.reduce((a, t) => a + (t.timeSpent || 0), 0);
  const totalMin = topicMin + (unit.timeSpent || 0);
  const impCount = topics.filter(t => t.important).length;
  const impDone = topics.filter(t => t.important && t.completed).length;
  const easyCount = topics.filter(t => t.difficulty === 'Easy').length;
  const easyDone = topics.filter(t => t.difficulty === 'Easy' && t.completed).length;
  const medCount = topics.filter(t => t.difficulty === 'Medium').length;
  const medDone = topics.filter(t => t.difficulty === 'Medium' && t.completed).length;
  const hardCount = topics.filter(t => t.difficulty === 'Hard').length;
  const hardDone = topics.filter(t => t.difficulty === 'Hard' && t.completed).length;

  if (topics.length === 0) return null;

  const pct = topics.length > 0 ? Math.round((done / topics.length) * 100) : 0;
  const wipCount = topics.filter(t => t.status === 'in_process').length;
  const remaining = topics.length - done;
  const allDone = done === topics.length && topics.length > 0;

  const total = topics.length || 1;
  const ePct = (easyCount / total) * 100;
  const mPct = (medCount / total) * 100;
  const hPct = (hardCount / total) * 100;
  const eDonePct = easyCount > 0 ? (easyDone / easyCount) * 100 : 0;
  const mDonePct = medCount > 0 ? (medDone / medCount) * 100 : 0;
  const hDonePct = hardCount > 0 ? (hardDone / hardCount) * 100 : 0;

  return (
    <div className="py-1.5 px-1 space-y-2">
      {/* ── Compact 4-Metric Grid ── */}
      <div className="grid grid-cols-4 gap-1.5">
        <div className="flex flex-col items-center py-1.5 px-1 rounded-lg bg-card/30 border border-border/10">
          <span className="text-lg font-black font-mono text-foreground leading-none" style={{ color: allDone ? 'hsl(var(--secondary))' : pct >= 40 ? subjectColor : undefined }}>{pct}%</span>
          <span className="text-[8px] font-bold text-muted-foreground/60 mt-0.5 uppercase tracking-wider">Progress</span>
        </div>
        <div className="flex flex-col items-center py-1.5 px-1 rounded-lg bg-card/30 border border-border/10">
          <span className="text-lg font-black font-mono text-foreground leading-none">{done}<span className="text-[10px] text-muted-foreground/50">/{topics.length}</span></span>
          <span className="text-[8px] font-bold text-muted-foreground/60 mt-0.5 uppercase tracking-wider">Done</span>
        </div>
        <div className="flex flex-col items-center py-1.5 px-1 rounded-lg bg-card/30 border border-border/10">
          <span className="text-lg font-black font-mono text-foreground leading-none">{totalMin >= 60 ? `${Math.floor(totalMin / 60)}h` : `${totalMin}m`}</span>
          <span className="text-[8px] font-bold text-muted-foreground/60 mt-0.5 uppercase tracking-wider">⏱️ Time</span>
        </div>
        <div className="flex flex-col items-center py-1.5 px-1 rounded-lg bg-card/30 border border-border/10">
          {allDone ? (
            <span className="text-lg font-black font-mono leading-none" style={{ color: 'hsl(var(--secondary))' }}>✓</span>
          ) : wipCount > 0 ? (
            <span className="text-lg font-black font-mono text-chart-4 leading-none">{wipCount}</span>
          ) : (
            <span className="text-lg font-black font-mono text-muted-foreground/40 leading-none">{remaining}</span>
          )}
          <span className="text-[8px] font-bold text-muted-foreground/60 mt-0.5 uppercase tracking-wider">{allDone ? 'Complete' : wipCount > 0 ? 'WIP' : 'Left'}</span>
        </div>
      </div>

      {/* ── Extra info pills: Important + Diff ── */}
      <div className="flex items-center gap-1 flex-wrap">
        {impCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border bg-chart-4/10 border-chart-4/25 text-chart-4">
            ⭐ {impDone}/{impCount} imp
          </span>
        )}
        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold border bg-muted/15 border-border/15 text-muted-foreground">
          🟢{easyDone}/{easyCount} 🟡{medDone}/{medCount} 🔴{hardDone}/{hardCount}
        </span>
      </div>

      {/* ── Difficulty Stacked Bar ── */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-muted/10 border border-border/8">
          {easyCount > 0 && (
            <div className="h-full relative overflow-hidden" style={{ width: `${ePct}%` }}>
              <div className="absolute inset-0 bg-diff-easy/25" />
              <div className="absolute inset-y-0 left-0 bg-diff-easy transition-all duration-500" style={{ width: `${eDonePct}%` }} />
            </div>
          )}
          {medCount > 0 && (
            <div className="h-full relative overflow-hidden" style={{ width: `${mPct}%` }}>
              <div className="absolute inset-0 bg-diff-medium/25" />
              <div className="absolute inset-y-0 left-0 bg-diff-medium transition-all duration-500" style={{ width: `${mDonePct}%` }} />
            </div>
          )}
          {hardCount > 0 && (
            <div className="h-full relative overflow-hidden" style={{ width: `${hPct}%` }}>
              <div className="absolute inset-0 bg-diff-hard/25" />
              <div className="absolute inset-y-0 left-0 bg-diff-hard transition-all duration-500" style={{ width: `${hDonePct}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== Unit Number Badge with integrated two-step copy ===== */
function UnitCopyBadge({ unitIndex, unitName, subjectColor, subTopics }: {
  unitIndex: number; unitName: string; subjectColor: string; subTopics: SubTopic[];
}) {
  const [nextStep, setNextStep] = useState<1 | 2>(1);
  const [flashEmoji, setFlashEmoji] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const resetRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => { clearTimeout(timerRef.current); clearTimeout(resetRef.current); }, []);

  const getFullContent = useCallback(() => {
    return formatUnitSyllabus(unitIndex, unitName, subTopics);
  }, [unitName, subTopics, unitIndex]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.vibrate?.(25);
    clearTimeout(timerRef.current);
    clearTimeout(resetRef.current);

    if (nextStep === 1) {
      const header = formatUnitHeader(unitIndex, unitName);
      navigator.clipboard.writeText(header);
      toast(`Unit ${unitIndex + 1} name copied`, { icon: '📋', description: 'Tap again for full content', duration: 2500 });
      setFlashEmoji('📋');
      timerRef.current = setTimeout(() => setFlashEmoji(null), 600);
      setNextStep(2);
      // Auto-reset to step 1 after 4s idle
      resetRef.current = setTimeout(() => setNextStep(1), 4000);
    } else {
      navigator.clipboard.writeText(getFullContent());
      toast('Full unit content copied', { icon: '✨', duration: 2000 });
      setFlashEmoji('📑');
      timerRef.current = setTimeout(() => setFlashEmoji(null), 600);
      setNextStep(1);
    }
  };

  const displayNum = String(unitIndex + 1).padStart(2, '0');

  return (
    <button
      onClick={handleClick}
      className="shrink-0 relative active:scale-[0.85] transition-transform"
      title={nextStep === 1 ? '① Copy unit name' : '② Copy full content'}
    >
      <div className="flex flex-col items-center" style={{ minWidth: '32px' }}>
        {flashEmoji ? (
          <span className="text-base leading-none select-none">{flashEmoji}</span>
        ) : (
          <span
            className="text-[22px] leading-none select-none font-black"
            style={{ fontFamily: 'Inter, system-ui, sans-serif', color: subjectColor, letterSpacing: '-0.5px' }}
          >
            {unitIndex + 1}
          </span>
        )}
      </div>
    </button>
  );
}

function PositionInput({ current, total, onJump }: { current: number; total: number; onJump: (newIndex: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(current + 1));

  const commit = () => {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 1 && num <= total && num !== current + 1) {
      onJump(num - 1);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        type="number" min={1} max={total} value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-8 h-6 text-center text-[10px] font-mono font-bold rounded border border-primary/40 bg-primary/10 text-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
        autoFocus
        onClick={e => e.stopPropagation()}
      />
    );
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); setVal(String(current + 1)); setEditing(true); }}
      className="w-6 h-6 text-center text-[10px] font-mono font-bold rounded border border-border/30 bg-muted/20 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all"
      title={`Position ${current + 1}/${total} — click to jump`}
    >
      {current + 1}
    </button>
  );
}
