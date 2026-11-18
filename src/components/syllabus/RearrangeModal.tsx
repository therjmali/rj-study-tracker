import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  MeasuringStrategy,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, ChevronRight, ChevronDown, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import type { Subject, Folder } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: Subject[];
  folders: Folder[];
  onReorderSubjects: (subjectIds: string[]) => void;
  onReorderFolders?: (folderIds: string[]) => void;
}

type ListItem =
  | { kind: 'folder'; id: string; folder: Folder; subjects: Subject[] }
  | { kind: 'subject'; id: string; subject: Subject };

function SortableRow({ item, activeId, openFolders, onToggleFolder }: {
  item: ListItem;
  activeId: string | null;
  openFolders: Set<string>;
  onToggleFolder: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  if (item.kind === 'folder') {
    const isOpen = openFolders.has(item.id);
    return (
      <div ref={setNodeRef} style={style}>
        <div
          className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all ${
            isDragging
              ? 'bg-card border-border/40 shadow-2xl scale-[1.02]'
              : 'bg-card/60 border-border/15 hover:bg-card/80'
          }`}
        >
          <div {...attributes} {...listeners} className="touch-none cursor-grab active:cursor-grabbing p-1 -ml-1">
            <GripVertical className="w-5 h-5 text-muted-foreground/50" />
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: item.folder.color + '25' }}>
            {item.folder.icon || '📁'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{item.folder.name}</p>
            <p className="text-[10px] text-muted-foreground font-semibold">{item.subjects.length} subjects inside</p>
          </div>
          <button onClick={() => onToggleFolder(item.id)}
            className="w-8 h-8 rounded-xl bg-muted/30 flex items-center justify-center transition-colors hover:bg-muted/50">
            {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </button>
        </div>
        {/* Folder subjects peek */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden pl-6 mt-1 space-y-1"
            >
              {item.subjects.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/20 border border-border/10">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-[11px] font-semibold text-foreground/70 truncate flex-1">{s.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {s.units.flatMap(u => u.subTopics).filter(t => t.completed).length}/
                    {s.units.flatMap(u => u.subTopics).length}
                  </span>
                </div>
              ))}
              {item.subjects.length === 0 && (
                <p className="text-[10px] text-muted-foreground px-3 py-2">Empty folder</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Subject row
  const all = item.subject.units.flatMap(u => u.subTopics);
  const done = all.filter(t => t.completed).length;
  const pct = all.length > 0 ? Math.round((done / all.length) * 100) : 0;

  return (
    <div ref={setNodeRef} style={style}
      className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all ${
        isDragging
          ? 'bg-card border-border/40 shadow-2xl scale-[1.02] opacity-80'
          : 'bg-card/60 border-border/15 hover:bg-card/80'
      }`}
    >
      <div {...attributes} {...listeners} className="touch-none cursor-grab active:cursor-grabbing p-1 -ml-1">
        <GripVertical className="w-5 h-5 text-muted-foreground/50" />
      </div>
      <div className="w-3 h-10 rounded-full shrink-0" style={{ backgroundColor: item.subject.color + '60' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{item.subject.name}</p>
        <p className="text-[10px] text-muted-foreground font-semibold">{done}/{all.length} topics · {item.subject.units.length} units</p>
      </div>
      <span className="text-[11px] font-black font-mono text-foreground/50">{pct}%</span>
    </div>
  );
}

export default function RearrangeModal({ open, onClose, subjects, folders, onReorderSubjects, onReorderFolders }: Props) {
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  // Build flat list: folders first (sorted by order), then root subjects
  const buildList = useCallback((): ListItem[] => {
    const sortedFolders = [...folders].sort((a, b) => a.order - b.order);
    const rootSubjects = subjects.filter(s => !s.folderId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const folderItems: ListItem[] = sortedFolders.map(f => ({
      kind: 'folder',
      id: f.id,
      folder: f,
      subjects: subjects.filter(s => s.folderId === f.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    }));
    const subjectItems: ListItem[] = rootSubjects.map(s => ({ kind: 'subject', id: s.id, subject: s }));
    return [...folderItems, ...subjectItems];
  }, [folders, subjects]);

  const [list, setList] = useState<ListItem[]>([]);
  useEffect(() => { if (open) setList(buildList()); }, [open, buildList]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const onDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    navigator.vibrate?.(25);
  }, []);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setList(prev => {
      const from = prev.findIndex(i => i.id === active.id);
      const to = prev.findIndex(i => i.id === over.id);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
    navigator.vibrate?.([12, 24, 12]);
  }, []);

  const handleSave = useCallback(() => {
    // Separate folders and root subjects from the reordered list
    const folderIds = list.filter(i => i.kind === 'folder').map(i => i.id);
    // Reconstruct full subject order: root subjects then folder-subjects
    const allSubjectIds: string[] = [];
    list.forEach(item => {
      if (item.kind === 'subject') allSubjectIds.push(item.id);
      else if (item.kind === 'folder') item.subjects.forEach(s => allSubjectIds.push(s.id));
    });
    onReorderSubjects(allSubjectIds);
    if (onReorderFolders) onReorderFolders(folderIds);
    toast.success('✅ Order saved');
    onClose();
  }, [list, onReorderSubjects, onReorderFolders, onClose]);

  const activeItem = activeId ? list.find(i => i.id === activeId) : null;
  const ids = list.map(i => i.id);

  if (!open) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 350 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border/15 shrink-0">
        <button onClick={onClose}
          className="w-9 h-9 rounded-xl bg-muted/30 flex items-center justify-center hover:bg-muted/50 transition-colors">
          <X className="w-4 h-4 text-foreground" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-black text-foreground">Rearrange</h2>
          <p className="text-[11px] text-muted-foreground font-medium">Long-press or drag to reorder</p>
        </div>
        <button onClick={handleSave}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black active:scale-95 transition-all shadow-lg shadow-primary/20">
          Save Order
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="space-y-2 pb-8">
              {list.map(item => (
                <SortableRow
                  key={item.id}
                  item={item}
                  activeId={activeId}
                  openFolders={openFolders}
                  onToggleFolder={(id) => setOpenFolders(prev => {
                    const n = new Set(prev);
                    n.has(id) ? n.delete(id) : n.add(id);
                    return n;
                  })}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 160, easing: 'ease-out' }}>
            {activeItem ? (
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 border-primary/40 bg-card shadow-2xl scale-105 opacity-80">
                <GripVertical className="w-5 h-5 text-primary/60" />
                {activeItem.kind === 'folder' ? (
                  <>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: activeItem.folder.color + '25' }}>
                      {activeItem.folder.icon || '📁'}
                    </div>
                    <span className="text-sm font-bold text-foreground">{activeItem.folder.name}</span>
                  </>
                ) : (
                  <>
                    <div className="w-3 h-10 rounded-full" style={{ backgroundColor: activeItem.subject.color + '60' }} />
                    <span className="text-sm font-bold text-foreground">{activeItem.subject.name}</span>
                  </>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {list.length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-sm text-muted-foreground">Nothing to rearrange</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
