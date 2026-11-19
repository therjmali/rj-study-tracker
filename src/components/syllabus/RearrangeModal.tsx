import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext, DragOverlay, closestCenter, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, MeasuringStrategy,
  type DragStartEvent, type DragEndEvent, type Modifier,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, ChevronRight, ChevronLeft, Undo2, Check, FolderOpen } from 'lucide-react';
import type { Subject, Folder } from '../../types';

/**
 * Rearrange mode — full-screen, touch-first.
 *  • Folders and root subjects at the top level; tap a folder to open it and reorder the subjects inside.
 *  • Long-press a card (or use the grip) and drag. The lifted card is scaled up with a big shadow and 80% opacity;
 *    its old slot becomes a dashed drop placeholder. The list auto-scrolls when you drag near the top / bottom.
 *  • Every drop is saved immediately (local state → cloud sync); Undo steps back one move.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: Subject[];
  folders: Folder[];
  /** Receives the ids of ONE group (root subjects, or the subjects of one folder) in their new order */
  onReorderSubjects: (subjectIds: string[]) => void;
  onReorderFolders?: (folderIds: string[]) => void;
  /** Called after a drop so the parent can switch the list to "Custom order" */
  onApplied?: () => void;
}

const lockToY: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const stats = (s: Subject) => {
  const all = s.units.flatMap(u => u.subTopics);
  const done = all.filter(t => t.completed).length;
  return { total: all.length, done, pct: all.length ? Math.round((done / all.length) * 100) : 0 };
};

/* ───────── rows ───────── */

function SubjectCardBody({ s }: { s: Subject }) {
  const { total, done, pct } = stats(s);
  return (
    <div className="flex items-center gap-3 px-3 min-h-[68px] rounded-2xl border border-border/20 bg-card">
      <GripVertical className="w-5 h-5 text-muted-foreground/50 shrink-0" aria-hidden />
      <span className="w-1.5 self-stretch my-2.5 rounded-full shrink-0" style={{ background: s.color }} aria-hidden />
      <div className="min-w-0 flex-1 py-2">
        <p className="text-[13.5px] font-extrabold text-foreground truncate">{s.name}</p>
        <p className="text-[10.5px] font-semibold text-muted-foreground">{s.shortName} · {done}/{total} topics · {s.units.length} units</p>
      </div>
      <div className="shrink-0 w-11 text-right">
        <span className="text-[12px] font-black font-mono text-foreground/70">{pct}%</span>
        <div className="mt-1 h-1 rounded-full bg-muted/30 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.color }} /></div>
      </div>
    </div>
  );
}

function FolderCardBody({ f, count, onOpen }: { f: Folder; count: number; onOpen?: () => void }) {
  return (
    <div className="relative flex items-center gap-3 px-3 min-h-[76px] rounded-2xl border bg-card" style={{ borderColor: `${f.color}66`, borderTopWidth: 3, borderTopColor: f.color }}>
      <GripVertical className="w-5 h-5 text-muted-foreground/50 shrink-0" aria-hidden />
      <span className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${f.color}26` }} aria-hidden>
        {f.icon && !f.icon.startsWith('http') ? f.icon : '📁'}
      </span>
      <div className="min-w-0 flex-1 py-2">
        <p className="text-[14px] font-extrabold text-foreground truncate">{f.name}</p>
        <p className="text-[10.5px] font-semibold text-muted-foreground">{count} {count === 1 ? 'subject' : 'subjects'} inside</p>
      </div>
      {onOpen && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
          aria-label={`Open ${f.name} to reorder its subjects`}
          className="shrink-0 h-11 pl-3 pr-2 rounded-xl bg-muted/30 flex items-center gap-1 text-[11px] font-bold text-foreground/80 active:scale-95 transition">
          Open <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/** A sortable slot: the whole card is the drag handle (long-press on touch). While lifted, the slot turns into a dashed placeholder. */
function SortableSlot({ id, children, onTap }: { id: string; children: ReactNode; onTap?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onTap}
      className="relative rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60 select-none [-webkit-touch-callout:none]"
    >
      <div className={isDragging ? 'invisible' : ''}>{children}</div>
      {isDragging && (
        <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 flex items-center justify-center" aria-hidden>
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-primary/60">Drop here</span>
        </div>
      )}
    </div>
  );
}

/** One sortable group (folders / root subjects / a folder's subjects). Calls `onChange` with the new id order on every drop. */
function SortableGroup({ ids, render, onChange, onDrop, onTap }: {
  ids: string[];
  render: (id: string) => ReactNode;
  onChange: (next: string[]) => void;
  onDrop: () => void;
  onTap?: (id: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const justDragged = useRef(0);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }), // long-press: scrolling still works until it fires
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const start = useCallback((e: DragStartEvent) => { setActiveId(String(e.active.id)); navigator.vibrate?.(25); }, []);
  const end = useCallback((e: DragEndEvent) => {
    setActiveId(null);
    justDragged.current = Date.now();
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    navigator.vibrate?.([12, 24, 12]);
    onChange(arrayMove(ids, from, to));
    onDrop();
  }, [ids, onChange, onDrop]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[lockToY]}
      measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
      autoScroll={{ threshold: { x: 0, y: 0.18 }, acceleration: 14, interval: 5 }}
      onDragStart={start}
      onDragEnd={end}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {ids.map(id => (
            <SortableSlot key={id} id={id} onTap={onTap ? () => { if (Date.now() - justDragged.current > 350) onTap(id); } : undefined}>
              {render(id)}
            </SortableSlot>
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }} modifiers={[lockToY]}>
        {activeId ? <div className="scale-105 shadow-2xl opacity-80 rounded-2xl ring-2 ring-primary/40">{render(activeId)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ───────── modal ───────── */

type Snapshot = { kind: 'folders' | 'subjects'; ids: string[] };

export default function RearrangeModal({ open, onClose, subjects, folders, onReorderSubjects, onReorderFolders, onApplied }: Props) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(0);
  const [history, setHistory] = useState<Snapshot[]>([]);

  useEffect(() => { if (open) { setFolderId(null); setHistory([]); setSavedTick(0); } }, [open]);

  const sortedFolders = useMemo(() => [...folders].sort((a, b) => a.order - b.order), [folders]);
  const rootSubjects = useMemo(() => subjects.filter(s => !s.folderId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [subjects]);
  const inFolder = useMemo(() => (folderId ? subjects.filter(s => s.folderId === folderId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : []), [subjects, folderId]);
  const folder = folderId ? folders.find(f => f.id === folderId) ?? null : null;

  const folderIds = useMemo(() => sortedFolders.map(f => f.id), [sortedFolders]);
  const rootIds = useMemo(() => rootSubjects.map(s => s.id), [rootSubjects]);
  const innerIds = useMemo(() => inFolder.map(s => s.id), [inFolder]);

  const byId = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects]);
  const folderById = useMemo(() => new Map(folders.map(f => [f.id, f])), [folders]);
  const countIn = useCallback((fid: string) => subjects.filter(s => s.folderId === fid).length, [subjects]);

  const saved = useCallback(() => { setSavedTick(t => t + 1); onApplied?.(); }, [onApplied]);

  const commitFolders = useCallback((next: string[]) => {
    setHistory(h => [...h.slice(-19), { kind: 'folders', ids: folderIds }]);
    onReorderFolders?.(next);
  }, [folderIds, onReorderFolders]);
  const commitSubjects = useCallback((next: string[], prev: string[]) => {
    setHistory(h => [...h.slice(-19), { kind: 'subjects', ids: prev }]);
    onReorderSubjects(next);
  }, [onReorderSubjects]);

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory(h => h.slice(0, -1));
    if (last.kind === 'folders') onReorderFolders?.(last.ids); else onReorderSubjects(last.ids);
    navigator.vibrate?.(10);
    saved();
  }, [history, onReorderFolders, onReorderSubjects, saved]);

  // Esc: step out of a folder, then close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (folderId) setFolderId(null); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, folderId, onClose]);

  if (!open) return null;

  const empty = !folder && folderIds.length === 0 && rootIds.length === 0;

  // Portal to <body>: a transformed page wrapper would otherwise trap `fixed`, leaving the app header / tab bar on top.
  return createPortal(
    <motion.div
      role="dialog" aria-modal="true" aria-label="Rearrange folders and subjects"
      className="fixed inset-0 z-[110] flex flex-col bg-background"
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 350 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-border/15 shrink-0">
        <button type="button" onClick={() => (folder ? setFolderId(null) : onClose())} aria-label={folder ? 'Back to all folders' : 'Close'}
          className="w-11 h-11 rounded-xl bg-muted/30 flex items-center justify-center active:scale-95 transition">
          {folder ? <ChevronLeft className="w-5 h-5 text-foreground" /> : <X className="w-5 h-5 text-foreground" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
            <button type="button" onClick={() => setFolderId(null)} className={folder ? 'underline-offset-2 hover:underline' : 'pointer-events-none'}>All</button>
            {folder && <><ChevronRight className="w-3 h-3" aria-hidden /><span className="text-foreground/80 truncate">{folder.name}</span></>}
          </div>
          <h2 className="text-lg font-black text-foreground leading-tight truncate">{folder ? folder.name : 'Rearrange'}</h2>
        </div>
        <button type="button" onClick={undo} disabled={!history.length} aria-label="Undo last move"
          className="w-11 h-11 rounded-xl border border-border/20 bg-card/50 flex items-center justify-center disabled:opacity-30 active:scale-95 transition">
          <Undo2 className="w-[18px] h-[18px] text-foreground" />
        </button>
        <button type="button" onClick={onClose}
          className="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-black active:scale-95 transition shadow-lg shadow-primary/20">
          Done
        </button>
      </div>

      {/* Hint + autosave indicator */}
      <div className="px-4 py-2 flex items-center justify-between gap-3 shrink-0">
        <p className="text-[11px] text-muted-foreground font-medium">Press and hold a card, then drag it</p>
        <AnimatePresence mode="wait">
          <motion.span key={savedTick} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: savedTick ? 1 : 0.6, scale: 1 }}
            className={`inline-flex items-center gap-1 text-[10.5px] font-black ${savedTick ? 'text-emerald-600' : 'text-muted-foreground'}`} role="status">
            <Check className="w-3.5 h-3.5" /> {savedTick ? 'Saved' : 'Saves automatically'}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Body — scrolls on its own and auto-scrolls while dragging near the top / bottom edge */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {folder ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold text-muted-foreground" style={{ background: `${folder.color}14` }}>
              <FolderOpen className="w-4 h-4" style={{ color: folder.color }} aria-hidden /> Subjects inside <b className="text-foreground">{folder.name}</b>
            </div>
            {innerIds.length === 0
              ? <p className="text-center text-sm text-muted-foreground py-16">This folder is empty</p>
              : <SortableGroup ids={innerIds} render={id => { const s = byId.get(id); return s ? <SubjectCardBody s={s} /> : null; }}
                  onChange={next => commitSubjects(next, innerIds)} onDrop={saved} />}
          </div>
        ) : (
          <div className="space-y-5">
            {folderIds.length > 0 && (
              <section aria-label="Folders">
                <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Folders · {folderIds.length}</h3>
                <SortableGroup ids={folderIds} render={id => { const f = folderById.get(id); return f ? <FolderCardBody f={f} count={countIn(id)} onOpen={() => setFolderId(id)} /> : null; }}
                  onChange={commitFolders} onDrop={saved} onTap={id => setFolderId(id)} />
              </section>
            )}
            {rootIds.length > 0 && (
              <section aria-label="Subjects">
                <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Subjects · {rootIds.length}</h3>
                <SortableGroup ids={rootIds} render={id => { const s = byId.get(id); return s ? <SubjectCardBody s={s} /> : null; }}
                  onChange={next => commitSubjects(next, rootIds)} onDrop={saved} />
              </section>
            )}
            {empty && (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">📭</div>
                <p className="text-sm text-muted-foreground">Nothing to rearrange yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
