import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pencil, Trash2, Check, X, ChevronDown, ChevronRight,
  Save, FolderOpen, Folder, Star, CheckCircle2, Circle, Clock,
  ArrowUp, ArrowDown, Plus, Search, Filter, Layers,
  CheckSquare, Square, Copy, Sparkles, Undo2, GripVertical,
  ChevronsUp, ChevronsDown, ArrowUpToLine, ArrowDownToLine, MoreVertical,
  Settings2, ListOrdered, FileText, RotateCcw
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@project/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, DragOverlay, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FullPageSheet from '../shared/FullPageSheet';
import ReorderPanel from './ReorderPanel';
import type { Unit, SubTopic, TopicStatus } from '../../types';
import { formatStudyTime, readableInk } from '../../lib/utils';
import { matchesFields } from '../../lib/searchUtils';

interface Props {
  open: boolean;
  onClose: () => void;
  unit: Unit;
  unitIndex: number;
  subjectColor: string;
  subjectName: string;
  onSave: (updatedUnit: Unit) => void;
  onDeleteTopic?: (topicId: string) => void;
}

type EditField = 'name' | 'module' | 'subModule' | 'difficulty' | 'status' | 'category' | 'tags';
type EditorTab = 'topics' | 'reorder';

export interface TopicEdit {
  id: string;
  name: string;
  module: string;
  subModule: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  status: TopicStatus;
  important: boolean;
  category: string;
  tags: string[];
}

export default function BulkUnitEditor({
  open, onClose, unit, unitIndex, subjectColor, subjectName, onSave, onDeleteTopic,
}: Props) {
  const [unitName, setUnitName] = useState(unit.name);
  const [topics, setTopics] = useState<TopicEdit[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<EditField | null>(null);
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [bulkModule, setBulkModule] = useState('');
  const [bulkSubModule, setBulkSubModule] = useState('');
  const [bulkDifficulty, setBulkDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [bulkStatus, setBulkStatus] = useState<TopicStatus>('incomplete');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [filterModule, setFilterModule] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>('topics');
  // Reorder state
  const [reorderUndoStack, setReorderUndoStack] = useState<TopicEdit[][]>([]);
  const initialRef = useRef<TopicEdit[]>([]);

  useEffect(() => {
    if (open) {
      const mapped = unit.subTopics.map(t => ({
        id: t.id,
        name: t.name,
        module: t.module || '',
        subModule: t.subModule || '',
        difficulty: t.difficulty,
        status: (t.status || (t.completed ? 'complete' : 'incomplete')) as TopicStatus,
        important: t.important || false,
        category: t.category || '',
        tags: t.tags || [],
      }));
      setTopics(mapped);
      initialRef.current = JSON.parse(JSON.stringify(mapped));
      setUnitName(unit.name);
      setSelected(new Set());
      setSearch('');
      setEditingId(null);
      setBulkAction(null);
      setHasChanges(false);
      setFilterModule('all');
      setActiveTab('topics');
      setReorderUndoStack([]);
    }
  }, [open, unit]);

  useEffect(() => {
    if (!open || savingRef.current) return;
    const changed = unitName !== unit.name ||
      JSON.stringify(topics) !== JSON.stringify(initialRef.current);
    setHasChanges(changed);
  }, [topics, unitName, unit.name, open]);

  const moduleNames = useMemo(() => {
    const names = new Set<string>();
    topics.forEach(t => { if (t.module) names.add(t.module); });
    return Array.from(names).sort();
  }, [topics]);

  const subModuleNames = useMemo(() => {
    const names = new Set<string>();
    topics.forEach(t => { if (t.subModule) names.add(t.subModule); });
    return Array.from(names).sort();
  }, [topics]);

  const filtered = useMemo(() => {
    let list = topics;
    if (search) {
      list = list.filter(t => matchesFields(search, [t.name, t.module, t.subModule]));
    }
    if (filterModule !== 'all') {
      if (filterModule === '__none__') list = list.filter(t => !t.module);
      else list = list.filter(t => t.module === filterModule);
    }
    return list;
  }, [topics, search, filterModule]);

  const stats = useMemo(() => ({
    total: topics.length,
    complete: topics.filter(t => t.status === 'complete').length,
    inProcess: topics.filter(t => t.status === 'in_process').length,
    important: topics.filter(t => t.important).length,
    easy: topics.filter(t => t.difficulty === 'Easy').length,
    med: topics.filter(t => t.difficulty === 'Medium').length,
    hard: topics.filter(t => t.difficulty === 'Hard').length,
    modules: moduleNames.length,
  }), [topics, moduleNames]);

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(t => t.id)));
  }, [filtered, selected]);

  const updateTopic = useCallback((id: string, changes: Partial<TopicEdit>) => {
    setTopics(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
  }, []);

  const applyBulkAction = useCallback(() => {
    if (selected.size === 0) { toast.error('Select topics first'); return; }
    const ids = selected;
    setTopics(prev => prev.map(t => {
      if (!ids.has(t.id)) return t;
      switch (bulkAction) {
        case 'module': return { ...t, module: bulkModule };
        case 'subModule': return { ...t, subModule: bulkSubModule };
        case 'difficulty': return { ...t, difficulty: bulkDifficulty };
        case 'status': return { ...t, status: bulkStatus };
        case 'star': return { ...t, important: true };
        case 'unstar': return { ...t, important: false };
        default: return t;
      }
    }));
    const count = ids.size;
    const actionNames: Record<string, string> = {
      module: `Module → "${bulkModule}"`, subModule: `Sub-module → "${bulkSubModule}"`,
      difficulty: `Difficulty → ${bulkDifficulty}`, status: `Status → ${bulkStatus}`,
      star: 'Starred ⭐', unstar: 'Unstarred',
    };
    toast.success(`✅ Updated ${count} topics: ${actionNames[bulkAction || ''] || ''}`);
    setBulkAction(null);
  }, [selected, bulkAction, bulkModule, bulkSubModule, bulkDifficulty, bulkStatus]);

  const handleDeleteSelected = useCallback(() => {
    const ids = selected;
    setTopics(prev => prev.filter(t => !ids.has(t.id)));
    toast.success(`🗑️ Removed ${ids.size} topics`);
    setSelected(new Set());
    setDeleteConfirmOpen(false);
  }, [selected]);

  const savingRef = useRef(false);

  const handleSave = useCallback(() => {
    if (savingRef.current) return;
    savingRef.current = true;

    const updatedTopics = topics.map(edited => {
      const original = unit.subTopics.find(t => t.id === edited.id);
      if (!original) return null;
      return {
        ...original,
        name: edited.name,
        module: edited.module || undefined,
        subModule: edited.subModule || undefined,
        difficulty: edited.difficulty,
        completed: edited.status === 'complete',
        status: edited.status,
        important: edited.important,
        category: edited.category || undefined,
        tags: edited.tags,
      } as SubTopic;
    }).filter(Boolean) as SubTopic[];

    // Include new topics (ones not in original unit)
    const newTopics = topics.filter(t => !unit.subTopics.find(o => o.id === t.id)).map(t => ({
      id: t.id,
      name: t.name,
      module: t.module || undefined,
      subModule: t.subModule || undefined,
      difficulty: t.difficulty,
      completed: t.status === 'complete',
      status: t.status,
      important: t.important,
      category: t.category || undefined,
      tags: t.tags,
      timeSpent: 0,
      notesArr: [],
      mcqs: [],
      resourceLinks: [],
      attachments: [],
      timeEntries: [],
      notes: '',
    } as SubTopic));

    const updatedUnit: Unit = {
      ...unit,
      name: unitName,
      subTopics: [...updatedTopics, ...newTopics],
    };

    // Save synchronously, then close — no setTimeout race condition
    onSave(updatedUnit);
    savingRef.current = false;
    toast.success('✅ Unit saved successfully');
    onClose();
  }, [topics, unitName, unit, onSave, onClose]);

  const handleRevert = useCallback(() => {
    setTopics(JSON.parse(JSON.stringify(initialRef.current)));
    setUnitName(unit.name);
    setHasChanges(false);
    setReorderUndoStack([]);
    toast('↩️ Changes reverted');
  }, [unit.name]);

  // ── Reorder: one undo step per committed change (immutable snapshots, no deep clone) ──
  const topicsRef = useRef<TopicEdit[]>(topics);
  topicsRef.current = topics;

  const handleReorderUndo = useCallback(() => {
    setReorderUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setTopics(last);
      navigator.vibrate?.(15);
      return prev.slice(0, -1);
    });
  }, []);

  const commitOrder = useCallback((next: TopicEdit[]) => {
    setReorderUndoStack(prev => [...prev.slice(-29), topicsRef.current]);
    setTopics(next);
  }, []);


  if (!open) return null;

  return (
    <FullPageSheet open={open}>
      <div className="flex flex-col h-full min-h-0">
        {/* ═══ HEADER ═══ */}
        <div className="shrink-0 rounded-2xl p-3 mb-3 border border-border/15"
          style={{ background: `linear-gradient(135deg, ${subjectColor}22 0%, hsl(var(--card) / 0.55) 75%)` }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: subjectColor + '25' }}>
              <Pencil className="w-4 h-4" style={{ color: readableInk(subjectColor) }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-black text-foreground leading-tight">Edit Unit</h3>
              <p className="text-[10px] text-muted-foreground font-semibold truncate">
                <span style={{ color: readableInk(subjectColor) }}>{subjectName}</span> · Unit {unitIndex + 1} · {stats.total} topics
              </p>
            </div>
            {reorderUndoStack.length > 0 && activeTab === 'reorder' && (
              <button onClick={handleReorderUndo} aria-label="Undo last move"
                className="h-9 px-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-[10px] font-black flex items-center gap-1 active:scale-90 transition-transform">
                <Undo2 className="w-3.5 h-3.5" />{reorderUndoStack.length}
              </button>
            )}
            <button onClick={() => { if (hasChanges) setDiscardConfirmOpen(true); else onClose(); }} aria-label="Close editor"
              className="w-9 h-9 rounded-xl bg-muted/25 flex items-center justify-center hover:bg-destructive/15 active:scale-90 transition-all">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <div className="flex-1 h-1.5 rounded-full bg-muted/25 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${stats.total ? (stats.complete / stats.total) * 100 : 0}%`, background: subjectColor }} />
            </div>
            <span className="text-[10px] font-mono font-black text-foreground/70">{stats.complete}/{stats.total}</span>
          </div>
          <Input
            value={unitName}
            onChange={e => setUnitName(e.target.value)}
            className="h-10 mt-3 text-sm bg-card/50 border-border/15 rounded-xl font-bold"
            placeholder="Unit name..."
            aria-label="Unit name"
          />
        </div>

        {/* ═══ TABS (segmented) ═══ */}
        <div className="relative grid grid-cols-2 p-1 mb-3 rounded-2xl bg-muted/20 border border-border/10 shrink-0">
          <TabButton icon={<FileText className="w-3.5 h-3.5" />} label="Topics" count={stats.total}
            active={activeTab === 'topics'} onClick={() => setActiveTab('topics')} />
          <TabButton icon={<ListOrdered className="w-3.5 h-3.5" />} label="Reorder"
            active={activeTab === 'reorder'} onClick={() => setActiveTab('reorder')} />
        </div>

        {/* ═══ TAB CONTENT ═══ */}
        <div className="flex-1 overflow-hidden min-h-0">
            {activeTab === 'topics' ? (
              <motion.div key="topics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}
                className="h-full flex flex-col overflow-hidden">
                <TopicsTab
                  topics={topics}
                  filtered={filtered}
                  stats={stats}
                  search={search}
                  setSearch={setSearch}
                  selected={selected}
                  toggleSelect={toggleSelect}
                  selectAll={selectAll}
                  editingId={editingId}
                  editingField={editingField}
                  setEditingId={setEditingId}
                  setEditingField={setEditingField}
                  updateTopic={updateTopic}
                  moduleNames={moduleNames}
                  subModuleNames={subModuleNames}
                  subjectColor={subjectColor}
                  filterModule={filterModule}
                  setFilterModule={setFilterModule}
                  showFilters={showFilters}
                  setShowFilters={setShowFilters}
                  bulkAction={bulkAction}
                  setBulkAction={setBulkAction}
                  bulkModule={bulkModule}
                  setBulkModule={setBulkModule}
                  bulkSubModule={bulkSubModule}
                  setBulkSubModule={setBulkSubModule}
                  bulkDifficulty={bulkDifficulty}
                  setBulkDifficulty={setBulkDifficulty}
                  bulkStatus={bulkStatus}
                  setBulkStatus={setBulkStatus}
                  applyBulkAction={applyBulkAction}
                  setDeleteConfirmOpen={setDeleteConfirmOpen}
                  setTopics={setTopics}
                />
              </motion.div>
            ) : (
              <div key="reorder" className="h-full">
                <ReorderPanel topics={topics} commit={commitOrder} updateTopic={updateTopic}
                  undoCount={reorderUndoStack.length} onUndo={handleReorderUndo} />
              </div>
            )}
        </div>

        {/* ═══ FOOTER — sticky, always visible ═══ */}
        <div className="shrink-0 flex items-center gap-2 pt-3 mt-1 border-t border-border/10">
          <div className="flex-1 min-w-0">
            {hasChanges ? (
              <p className="text-[11px] text-chart-4 font-bold flex items-center gap-1.5">
                <motion.span animate={{ scale: [1, 1.35, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>●</motion.span>
                Unsaved changes
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground/70 font-semibold flex items-center gap-1.5"><Check className="w-3 h-3" /> Up to date</p>
            )}
          </div>
          {hasChanges && (
            <Button variant="ghost" size="sm" onClick={handleRevert} className="h-10 text-xs gap-1 rounded-xl">
              <RotateCcw className="w-3.5 h-3.5" /> Revert
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!hasChanges} className="h-10 text-xs gap-1.5 px-5 font-black rounded-xl">
            <Save className="w-4 h-4" /> Save
          </Button>
        </div>
      </div>

      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-border/20">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits in this unit. Closing now will discard all changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDiscardConfirmOpen(false); onClose(); }} className="bg-destructive text-destructive-foreground">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-border/20">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} topics?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the selected topics from this unit. Click Save to confirm the changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FullPageSheet>
  );
}

/* ═══════════════════════════════════════════════════
   TAB BUTTON
   ═══════════════════════════════════════════════════ */
function TabButton({ icon, label, count, active, onClick }: {
  icon: React.ReactNode; label: string; count?: number; active: boolean; onClick: () => void; accent?: boolean;
}) {
  return (
    <button onClick={onClick} role="tab" aria-selected={active}
      className={`relative flex items-center justify-center gap-1.5 h-10 rounded-xl text-xs font-black transition-colors active:scale-[0.97] ${active ? 'text-foreground' : 'text-muted-foreground/70'}`}>
      {active && (
        <motion.span layoutId="unit-editor-tab" className="absolute inset-0 rounded-xl bg-card shadow-sm border border-border/20"
          transition={{ type: 'spring', stiffness: 500, damping: 36 }} />
      )}
      <span className="relative flex items-center gap-1.5">
        {icon}{label}
        {count != null && <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded-md bg-muted/30">{count}</span>}
      </span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════
   TOPICS TAB — Edit mode
   ═══════════════════════════════════════════════════ */
function TopicsTab({
  topics, filtered, stats, search, setSearch, selected, toggleSelect, selectAll,
  editingId, editingField, setEditingId, setEditingField, updateTopic,
  moduleNames, subModuleNames, subjectColor, filterModule, setFilterModule,
  showFilters, setShowFilters, bulkAction, setBulkAction, bulkModule, setBulkModule,
  bulkSubModule, setBulkSubModule, bulkDifficulty, setBulkDifficulty, bulkStatus, setBulkStatus,
  applyBulkAction, setDeleteConfirmOpen, setTopics,
}: {
  topics: TopicEdit[]; filtered: TopicEdit[]; stats: any; search: string; setSearch: (s: string) => void;
  selected: Set<string>; toggleSelect: (id: string) => void; selectAll: () => void;
  editingId: string | null; editingField: EditField | null; setEditingId: (id: string | null) => void;
  setEditingField: (f: EditField | null) => void; updateTopic: (id: string, c: Partial<TopicEdit>) => void;
  moduleNames: string[]; subModuleNames: string[]; subjectColor: string;
  filterModule: string; setFilterModule: (f: string) => void; showFilters: boolean; setShowFilters: (f: boolean | ((p: boolean) => boolean)) => void;
  bulkAction: string | null; setBulkAction: (a: string | null) => void;
  bulkModule: string; setBulkModule: (m: string) => void; bulkSubModule: string; setBulkSubModule: (m: string) => void;
  bulkDifficulty: 'Easy' | 'Medium' | 'Hard'; setBulkDifficulty: (d: 'Easy' | 'Medium' | 'Hard') => void;
  bulkStatus: TopicStatus; setBulkStatus: (s: TopicStatus) => void; applyBulkAction: () => void;
  setDeleteConfirmOpen: (o: boolean) => void; setTopics: React.Dispatch<React.SetStateAction<TopicEdit[]>>;
}) {
  const [addTopicOpen, setAddTopicOpen] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicModule, setNewTopicModule] = useState('');
  const [newTopicSubModule, setNewTopicSubModule] = useState('');
  const [newTopicDifficulty, setNewTopicDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [showNewModule, setShowNewModule] = useState(false);
  const [showNewSubModule, setShowNewSubModule] = useState(false);
  const [customNewModule, setCustomNewModule] = useState('');
  const [customNewSubModule, setCustomNewSubModule] = useState('');

  const handleAddTopic = () => {
    if (!newTopicName.trim()) { toast.error('Enter a topic name'); return; }
    const newTopic: TopicEdit = {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: newTopicName.trim(),
      module: newTopicModule,
      subModule: newTopicSubModule,
      difficulty: newTopicDifficulty,
      status: 'incomplete',
      important: false,
      category: '',
      tags: [],
    };
    setTopics(prev => [...prev, newTopic]);
    setNewTopicName('');
    navigator.vibrate?.([15, 30, 15]);
    toast.success(`✅ Added "${newTopic.name}"`);
  };

  return (
    <>
      {/* Stats + Add Topic */}
      <div className="flex items-center gap-1.5 flex-wrap shrink-0 px-1 pb-2">
        <StatPill emoji="📚" label={`${stats.total}`} sublabel="topics" />
        <StatPill emoji="✅" label={`${stats.complete}`} sublabel="done" color="text-secondary" />
        <StatPill emoji="🔄" label={`${stats.inProcess}`} sublabel="WIP" color="text-chart-4" />
        <StatPill emoji="⭐" label={`${stats.important}`} sublabel="imp" color="text-chart-4" />
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setAddTopicOpen(p => !p)}
          className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${addTopicOpen ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-accent/10 border-accent/20 text-accent-ink hover:bg-accent/20'}`}>
          <Plus className="w-3 h-3" /> Add Topic
        </motion.button>
      </div>

      {/* Add Topic Form */}
      <AnimatePresence>
        {addTopicOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden shrink-0 px-1 pb-2">
            <div className="p-3 rounded-xl border-2 border-dashed border-primary/20 bg-primary/5 space-y-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-bold text-foreground">New Topic</span>
              </div>
              <Input value={newTopicName} onChange={e => setNewTopicName(e.target.value)} placeholder="Topic name..." className="h-9 text-xs bg-card border-border/20 rounded-xl" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleAddTopic(); }} />
              <div className="grid grid-cols-2 gap-2">
                {/* Module dropdown */}
                <div>
                  <span className="text-[9px] font-bold text-foreground/70 mb-1 block">📁 Module</span>
                  {!showNewModule ? (
                    <div className="space-y-1">
                      {moduleNames.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {moduleNames.map(m => (
                            <button key={m} onClick={() => setNewTopicModule(newTopicModule === m ? '' : m)}
                              className={`text-[9px] px-2 py-1 rounded-lg font-bold border transition-all ${newTopicModule === m ? 'bg-primary/15 border-primary/25 text-primary' : 'bg-card/60 border-border/20 text-foreground/70 hover:bg-card/80'}`}>{m}</button>
                          ))}
                        </div>
                      )}
                      <button onClick={() => setShowNewModule(true)} className="text-[9px] font-bold text-primary/70 hover:text-primary transition-colors">+ New module</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Input value={customNewModule} onChange={e => setCustomNewModule(e.target.value)} placeholder="New module..." className="h-7 text-[10px] flex-1 bg-card border-border/20 rounded-lg" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter' && customNewModule.trim()) { setNewTopicModule(customNewModule.trim()); setShowNewModule(false); setCustomNewModule(''); } if (e.key === 'Escape') setShowNewModule(false); }} />
                      <button onClick={() => { if (customNewModule.trim()) { setNewTopicModule(customNewModule.trim()); } setShowNewModule(false); setCustomNewModule(''); }} className="text-[9px] font-bold text-primary px-1.5">✓</button>
                    </div>
                  )}
                </div>
                {/* Sub-module dropdown */}
                <div>
                  <span className="text-[9px] font-bold text-foreground/70 mb-1 block">📂 Sub-module</span>
                  {!showNewSubModule ? (
                    <div className="space-y-1">
                      {subModuleNames.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {subModuleNames.map(m => (
                            <button key={m} onClick={() => setNewTopicSubModule(newTopicSubModule === m ? '' : m)}
                              className={`text-[9px] px-2 py-1 rounded-lg font-bold border transition-all ${newTopicSubModule === m ? 'bg-accent/15 border-accent/25 text-accent-ink' : 'bg-card/60 border-border/20 text-foreground/70 hover:bg-card/80'}`}>{m}</button>
                          ))}
                        </div>
                      )}
                      <button onClick={() => setShowNewSubModule(true)} className="text-[9px] font-bold text-accent/70 hover:text-accent-ink transition-colors">+ New sub-module</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Input value={customNewSubModule} onChange={e => setCustomNewSubModule(e.target.value)} placeholder="New sub-module..." className="h-7 text-[10px] flex-1 bg-card border-border/20 rounded-lg" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter' && customNewSubModule.trim()) { setNewTopicSubModule(customNewSubModule.trim()); setShowNewSubModule(false); setCustomNewSubModule(''); } if (e.key === 'Escape') setShowNewSubModule(false); }} />
                      <button onClick={() => { if (customNewSubModule.trim()) { setNewTopicSubModule(customNewSubModule.trim()); } setShowNewSubModule(false); setCustomNewSubModule(''); }} className="text-[9px] font-bold text-accent-ink px-1.5">✓</button>
                    </div>
                  )}
                </div>
              </div>
              {/* Difficulty */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-foreground/70 shrink-0">🎯</span>
                {(['Easy', 'Medium', 'Hard'] as const).map(d => (
                  <button key={d} onClick={() => setNewTopicDifficulty(d)}
                    className={`flex-1 text-[10px] py-1.5 rounded-lg font-bold border transition-all ${newTopicDifficulty === d ? 'bg-primary/12 border-primary/25 text-primary' : 'bg-card/60 border-border/20 text-foreground/70'}`}>
                    {d === 'Easy' ? '🟢' : d === 'Medium' ? '🟡' : '🔴'} {d}
                  </button>
                ))}
              </div>
              {/* Selected values preview */}
              {(newTopicModule || newTopicSubModule) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {newTopicModule && <span className="text-[9px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/15 font-bold">📁 {newTopicModule}</span>}
                  {newTopicSubModule && <span className="text-[9px] px-2 py-0.5 rounded-md bg-accent/10 text-accent-ink border border-accent/15 font-bold">📂 {newTopicSubModule}</span>}
                </div>
              )}
              <Button size="sm" onClick={handleAddTopic} disabled={!newTopicName.trim()} className="w-full h-9 text-xs font-bold rounded-xl gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Topic
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search + Filter + Select */}
      <div className="flex items-center gap-2 shrink-0 px-1 pb-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search topics..." className="pl-9 h-8 text-xs bg-card/30 border-border/15 rounded-xl" />
        </div>
        {moduleNames.length > 0 && (
          <button onClick={() => setShowFilters(p => !p)}
            className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-colors ${
              showFilters || filterModule !== 'all'
                ? 'bg-primary/10 border-primary/25 text-primary'
                : 'bg-card/30 border-border/15 text-muted-foreground hover:bg-card/50'
            }`}
          >
            <Filter className="w-3 h-3" />
          </button>
        )}
        <button onClick={selectAll}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-card/30 border border-border/15 text-muted-foreground hover:bg-card/50 transition-colors"
        >
          {selected.size === filtered.length && filtered.length > 0
            ? <CheckSquare className="w-3 h-3 text-primary" />
            : <Square className="w-3 h-3" />}
          {selected.size > 0 ? `${selected.size}` : 'All'}
        </button>
      </div>

      {/* Module filter chips */}
      <AnimatePresence>
        {showFilters && moduleNames.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden shrink-0 px-1 pb-2">
            <div className="flex gap-1 flex-wrap">
              <button onClick={() => setFilterModule('all')} className={`text-[9px] px-2 py-1 rounded-lg font-bold border transition-all ${filterModule === 'all' ? 'bg-primary/12 border-primary/25 text-primary' : 'bg-card/30 border-border/15 text-muted-foreground'}`}>All</button>
              {moduleNames.map(m => (
                <button key={m} onClick={() => setFilterModule(filterModule === m ? 'all' : m)} className={`text-[9px] px-2 py-1 rounded-lg font-bold border transition-all ${filterModule === m ? 'bg-primary/12 border-primary/25 text-primary' : 'bg-card/30 border-border/15 text-muted-foreground'}`}>{m}</button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk actions */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden shrink-0 px-1 pb-2">
            <div className="p-3 rounded-xl border border-primary/15 bg-primary/5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />{selected.size} selected</span>
                <button onClick={() => { const s = new Set<string>(); toggleSelect('__clear__'); }} className="text-[10px] text-muted-foreground hover:text-foreground font-semibold">Clear</button>
              </div>
              <div className="flex gap-1 flex-wrap">
                {(['module', 'subModule', 'difficulty', 'status', 'star', 'unstar'] as const).map(action => (
                  <button key={action}
                    onClick={() => {
                      if (action === 'star' || action === 'unstar') {
                        setTopics(prev => prev.map(t => selected.has(t.id) ? { ...t, important: action === 'star' } : t));
                        toast.success(`${action === 'star' ? '⭐' : '☆'} ${selected.size} topics ${action === 'star' ? 'starred' : 'unstarred'}`);
                      } else {
                        setBulkAction(bulkAction === action ? null : action);
                      }
                    }}
                    className={`text-[10px] px-2.5 py-1.5 rounded-lg font-bold border transition-all active:scale-95 ${
                      bulkAction === action ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-card/40 border-border/15 text-foreground/60 hover:bg-card/60'
                    }`}
                  >
                    {action === 'module' && '📁 Module'}
                    {action === 'subModule' && '📂 Sub'}
                    {action === 'difficulty' && '🎯 Diff'}
                    {action === 'status' && '📊 Status'}
                    {action === 'star' && '⭐ Star'}
                    {action === 'unstar' && '☆ Unstar'}
                  </button>
                ))}
                <button onClick={() => setDeleteConfirmOpen(true)} className="text-[10px] px-2.5 py-1.5 rounded-lg font-bold border bg-destructive/8 border-destructive/20 text-destructive hover:bg-destructive/15 transition-all active:scale-95">🗑️ Delete</button>
              </div>
              <AnimatePresence mode="wait">
                {bulkAction === 'module' && (
                  <motion.div key="module" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-center gap-2">
                    <Input value={bulkModule} onChange={e => setBulkModule(e.target.value)} placeholder="Module name..." className="h-8 text-xs flex-1 rounded-xl" autoFocus />
                    <Button size="sm" onClick={applyBulkAction} disabled={!bulkModule.trim()} className="h-8 text-xs px-3 rounded-xl">Apply</Button>
                  </motion.div>
                )}
                {bulkAction === 'subModule' && (
                  <motion.div key="subModule" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-center gap-2">
                    <Input value={bulkSubModule} onChange={e => setBulkSubModule(e.target.value)} placeholder="Sub-module..." className="h-8 text-xs flex-1 rounded-xl" autoFocus />
                    <Button size="sm" onClick={applyBulkAction} disabled={!bulkSubModule.trim()} className="h-8 text-xs px-3 rounded-xl">Apply</Button>
                  </motion.div>
                )}
                {bulkAction === 'difficulty' && (
                  <motion.div key="difficulty" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-center gap-2">
                    {(['Easy', 'Medium', 'Hard'] as const).map(d => (
                      <Button key={d} size="sm" variant={bulkDifficulty === d ? 'default' : 'outline'} onClick={() => setBulkDifficulty(d)} className="flex-1 text-[10px] h-8 rounded-xl">
                        {d === 'Easy' ? '🟢' : d === 'Medium' ? '🟡' : '🔴'} {d}
                      </Button>
                    ))}
                    <Button size="sm" onClick={applyBulkAction} className="h-8 text-xs px-3 rounded-xl">Apply</Button>
                  </motion.div>
                )}
                {bulkAction === 'status' && (
                  <motion.div key="status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-center gap-2">
                    {([['incomplete', '⬜ Todo'], ['in_process', '🔄 WIP'], ['complete', '✅ Done']] as const).map(([s, label]) => (
                      <Button key={s} size="sm" variant={bulkStatus === s ? 'default' : 'outline'} onClick={() => setBulkStatus(s as TopicStatus)} className="flex-1 text-[10px] h-8 rounded-xl">{label}</Button>
                    ))}
                    <Button size="sm" onClick={applyBulkAction} className="h-8 text-xs px-3 rounded-xl">Apply</Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Topics list */}
      <div className="flex-1 overflow-y-auto px-1 space-y-1 min-h-0">
        <AnimatePresence mode="popLayout">
          {filtered.map((topic, idx) => (
            <motion.div key={topic.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: Math.min(idx * 0.015, 0.3) }}>
              <EditableTopicRow
                topic={topic} index={idx}
                isFirst={idx === 0} isLast={idx === filtered.length - 1}
                isSelected={selected.has(topic.id)}
                isEditing={editingId === topic.id}
                editingField={editingId === topic.id ? editingField : null}
                onToggleSelect={() => toggleSelect(topic.id)}
                onStartEdit={(field) => { setEditingId(topic.id); setEditingField(field); }}
                onStopEdit={() => { setEditingId(null); setEditingField(null); }}
                onUpdate={(changes) => updateTopic(topic.id, changes)}
                moduleNames={moduleNames}
                subModuleNames={subModuleNames}
                subjectColor={subjectColor}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className="text-center py-10 space-y-2">
            <span className="text-2xl">{search ? '🔍' : '📭'}</span>
            <p className="text-xs text-muted-foreground">{search ? `No topics matching "${search}"` : 'No topics in this unit'}</p>
          </div>
        )}
      </div>
    </>
  );
}

function StatPill({ emoji, label, sublabel, color }: { emoji: string; label: string; sublabel?: string; color?: string }) {
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-card/40 border border-border/10 text-[9px] font-bold ${color || 'text-foreground/60'}`}>
      <span className="text-xs leading-none">{emoji}</span>
      <span className="font-mono">{label}</span>
      {sublabel && <span className="text-foreground/30">{sublabel}</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   EDITABLE TOPIC ROW — Normal edit mode
   ═══════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════
   MODULE DROPDOWN EDITOR — shows existing options + Add New
   ═══════════════════════════════════════════════════ */
function ModuleDropdownEditor({ value, options, onChange, onCancel, placeholder, label }: {
  value: string; options: string[]; onChange: (v: string) => void; onCancel: () => void; placeholder: string; label: string;
}) {
  const [custom, setCustom] = useState(value);
  const [showCustomInput, setShowCustomInput] = useState(false);
  return (
    <div className="relative z-20">
      <div className="absolute top-0 left-0 min-w-[160px] max-w-[220px] bg-card border border-border/25 rounded-xl shadow-xl p-2 space-y-1" >
        {options.length > 0 && options.map(o => (
          <button key={o} onClick={() => onChange(o)}
            className={`w-full text-left text-[10px] px-2.5 py-1.5 rounded-lg font-bold border transition-all ${value === o ? 'bg-primary/12 border-primary/20 text-primary' : 'bg-card/60 border-border/15 text-foreground/80 hover:bg-muted/30'}`}>
            {label} {o}
          </button>
        ))}
        {value && !options.includes(value) && (
          <button onClick={() => onChange('')} className="w-full text-left text-[9px] px-2.5 py-1 rounded-lg font-bold text-destructive/60 hover:bg-destructive/8 border border-destructive/10">
            ✕ Clear
          </button>
        )}
        {!showCustomInput ? (
          <button onClick={() => setShowCustomInput(true)} className="w-full text-left text-[9px] px-2.5 py-1.5 rounded-lg font-bold text-primary/70 border border-dashed border-primary/20 hover:bg-primary/5">
            + Add New
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <Input value={custom} onChange={e => setCustom(e.target.value)} placeholder={placeholder} className="h-6 text-[9px] flex-1 bg-card border-border/20 rounded-lg" autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) onChange(custom.trim()); if (e.key === 'Escape') onCancel(); }} />
            <button onClick={() => { if (custom.trim()) onChange(custom.trim()); else onCancel(); }} className="text-[9px] font-bold text-primary px-1">✓</button>
          </div>
        )}
        <button onClick={onCancel} className="w-full text-[8px] text-center text-foreground/40 hover:text-foreground/60 font-bold pt-0.5">Cancel</button>
      </div>
    </div>
  );
}

function EditableTopicRow({
  topic, index, isFirst, isLast, isSelected, isEditing, editingField,
  onToggleSelect, onStartEdit, onStopEdit, onUpdate,
  moduleNames, subModuleNames, subjectColor,
}: {
  topic: TopicEdit; index: number; isFirst: boolean; isLast: boolean;
  isSelected: boolean; isEditing: boolean; editingField: EditField | null;
  onToggleSelect: () => void;
  onStartEdit: (field: EditField) => void; onStopEdit: () => void;
  onUpdate: (changes: Partial<TopicEdit>) => void;
  moduleNames: string[]; subModuleNames: string[]; subjectColor: string;
}) {
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && editingField && inputRef.current) inputRef.current.focus();
  }, [isEditing, editingField]);

  const startEdit = (field: EditField) => {
    const val = field === 'name' ? topic.name : field === 'module' ? topic.module : field === 'subModule' ? topic.subModule : field === 'category' ? topic.category : '';
    setEditValue(val);
    onStartEdit(field);
  };

  const commitEdit = () => {
    if (editingField === 'name') onUpdate({ name: editValue || topic.name });
    else if (editingField === 'module') onUpdate({ module: editValue.trim() });
    else if (editingField === 'subModule') onUpdate({ subModule: editValue.trim() });
    else if (editingField === 'category') onUpdate({ category: editValue.trim() });
    onStopEdit();
  };

  const cycleStatus = () => {
    const map: Record<string, TopicStatus> = { incomplete: 'in_process', in_process: 'complete', complete: 'incomplete' };
    navigator.vibrate?.(15);
    onUpdate({ status: map[topic.status] || 'incomplete' });
  };

  const cycleDifficulty = () => {
    const map: Record<string, 'Easy' | 'Medium' | 'Hard'> = { Easy: 'Medium', Medium: 'Hard', Hard: 'Easy' };
    navigator.vibrate?.(10);
    onUpdate({ difficulty: map[topic.difficulty] || 'Medium' });
  };

  const statusIcon = topic.status === 'complete'
    ? <CheckCircle2 className="w-4 h-4 text-secondary" />
    : topic.status === 'in_process'
      ? <Clock className="w-4 h-4 text-chart-4" />
      : <Circle className="w-4 h-4 text-muted-foreground/25" />;

  const diffBadge = topic.difficulty === 'Easy' ? '🟢' : topic.difficulty === 'Medium' ? '🟡' : '🔴';

  return (
    <div className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border transition-all ${
      isSelected
        ? 'bg-primary/8 border-primary/25 shadow-sm'
        : isEditing
          ? 'bg-accent/8 border-accent/25'
          : 'bg-card/20 border-border/10 hover:bg-card/35 hover:border-border/20'
    }`}>
      <button onClick={onToggleSelect} className="shrink-0 active:scale-90 transition-transform">
        {isSelected
          ? <CheckSquare className="w-4 h-4 text-primary" />
          : <Square className="w-4 h-4 text-muted-foreground/25 hover:text-muted-foreground/50" />}
      </button>
      <button onClick={cycleStatus} className="shrink-0 active:scale-75 transition-transform">{statusIcon}</button>
      <span className="text-[9px] font-mono font-bold text-foreground/50 w-5 text-center shrink-0">{index + 1}</span>
      <div className="flex-1 min-w-0">
        {isEditing && editingField === 'name' ? (
          <div className="flex items-center gap-1">
            <Input ref={inputRef} value={editValue} onChange={e => setEditValue(e.target.value)}
              className="h-7 text-xs flex-1 bg-background/50 rounded-lg"
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') onStopEdit(); }}
              onBlur={commitEdit} />
          </div>
        ) : (
          <button onClick={() => startEdit('name')} className="text-left w-full group/name">
            <p className={`text-[11px] font-semibold leading-snug break-words transition-colors ${
              topic.status === 'complete' ? 'text-secondary/70 line-through' : 'text-foreground group-hover/name:text-primary'
            }`}>{topic.name}</p>
          </button>
        )}
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {isEditing && editingField === 'module' ? (
            <ModuleDropdownEditor
              value={editValue}
              options={moduleNames}
              onChange={(v) => { onUpdate({ module: v }); onStopEdit(); }}
              onCancel={onStopEdit}
              placeholder="Module..."
              label="📁"
            />
          ) : topic.module ? (
            <button onClick={() => startEdit('module')} className="text-[8px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-bold hover:bg-primary/15 transition-colors truncate max-w-[100px]">📁 {topic.module}</button>
          ) : (
            <button onClick={() => startEdit('module')} className="text-[8px] px-1.5 py-0.5 rounded-md bg-muted/20 text-foreground/50 border border-border/15 font-bold hover:bg-muted/30 hover:text-foreground/70 transition-colors">+ Module</button>
          )}
          {isEditing && editingField === 'subModule' ? (
            <ModuleDropdownEditor
              value={editValue}
              options={subModuleNames}
              onChange={(v) => { onUpdate({ subModule: v }); onStopEdit(); }}
              onCancel={onStopEdit}
              placeholder="Sub-module..."
              label="📂"
            />
          ) : topic.subModule ? (
            <button onClick={() => startEdit('subModule')} className="text-[8px] px-1.5 py-0.5 rounded-md bg-accent/10 text-accent-ink border border-accent/20 font-bold hover:bg-accent/15 transition-colors truncate max-w-[80px]">📂 {topic.subModule}</button>
          ) : (
            <button onClick={() => startEdit('subModule')} className="text-[8px] px-1.5 py-0.5 rounded-md bg-muted/15 text-foreground/40 border border-border/12 font-bold hover:bg-muted/25 hover:text-foreground/60 transition-colors">+ Sub</button>
          )}
          <button onClick={cycleDifficulty} className="text-[9px] px-1.5 py-0.5 rounded-md border font-bold active:scale-90 transition-all select-none"
            style={{
              backgroundColor: topic.difficulty === 'Easy' ? 'hsl(var(--diff-easy) / 0.12)' : topic.difficulty === 'Hard' ? 'hsl(var(--diff-hard) / 0.12)' : 'hsl(var(--diff-medium) / 0.12)',
              borderColor: topic.difficulty === 'Easy' ? 'hsl(var(--diff-easy) / 0.2)' : topic.difficulty === 'Hard' ? 'hsl(var(--diff-hard) / 0.2)' : 'hsl(var(--diff-medium) / 0.2)',
              color: topic.difficulty === 'Easy' ? 'hsl(var(--diff-easy))' : topic.difficulty === 'Hard' ? 'hsl(var(--diff-hard))' : 'hsl(var(--diff-medium))',
            }}>{diffBadge} {topic.difficulty}</button>
        </div>
      </div>
      <button onClick={() => { navigator.vibrate?.(10); onUpdate({ important: !topic.important }); }} className="shrink-0 active:scale-125 transition-transform">
        <Star className={`w-3.5 h-3.5 transition-colors ${topic.important ? 'fill-chart-4 text-chart-4' : 'text-foreground/20 hover:text-foreground/40'}`} />
      </button>
    </div>
  );
}
