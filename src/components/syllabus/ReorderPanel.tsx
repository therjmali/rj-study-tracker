import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import {
  GripVertical, ChevronUp, ChevronDown, ArrowUpToLine, ArrowDownToLine, Star, Check, X, Pencil, Undo2,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay, MeasuringStrategy,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TopicStatus } from '../../types';
import type { TopicEdit } from './BulkUnitEditor';

type SortKind = 'az' | 'module' | 'difficulty' | 'status' | 'reverse';
type MoveMode = 'before' | 'after' | null;

interface PanelProps {
  topics: TopicEdit[];
  /** Replace the order (parent records one undo step per call) */
  commit: (next: TopicEdit[]) => void;
  updateTopic: (id: string, changes: Partial<TopicEdit>) => void;
  undoCount: number;
  onUndo: () => void;
}

const DIFF_COLOR = { Easy: 'hsl(var(--diff-easy))', Medium: 'hsl(var(--diff-medium))', Hard: 'hsl(var(--diff-hard))' } as const;
const lockX = ({ transform }: { transform: { x: number; y: number; scaleX: number; scaleY: number } }) => ({ ...transform, x: 0 });

/* ───────────────────────── Row ───────────────────────── */
interface RowProps {
  topic: TopicEdit;
  index: number;
  total: number;
  isSelected: boolean;
  isMoveTarget: boolean;
  moveMode: MoveMode;
  isFlash: boolean;
  onTap: (id: string) => void;
  onMoveBy: (id: string, delta: number) => void;
  onSwipe: (id: string, dir: 'up' | 'down', far: boolean) => void;
  onUpdate: (id: string, changes: Partial<TopicEdit>) => void;
}

const Row = memo(function Row({ topic, index, total, isSelected, isMoveTarget, moveMode, isFlash, onTap, onMoveBy, onSwipe, onUpdate }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: topic.id });
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const dragged = useRef(false);

  const commitName = () => {
    const v = val.trim();
    if (v && v !== topic.name) onUpdate(topic.id, { name: v });
    setEditing(false);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dx = info.offset.x, vx = info.velocity.x;
    setTimeout(() => { dragged.current = false; }, 60);
    if (dx > 150) onSwipe(topic.id, 'up', true);
    else if (dx > 64 || (dx > 30 && vx > 600)) onSwipe(topic.id, 'up', false);
    else if (dx < -150) onSwipe(topic.id, 'down', true);
    else if (dx < -64 || (dx < -30 && vx < -600)) onSwipe(topic.id, 'down', false);
  };

  const statusEmoji = topic.status === 'complete' ? '✅' : topic.status === 'in_process' ? '🔄' : '⬜';
  const first = index === 0, last = index === total - 1;

  return (
    <div
      ref={setNodeRef}
      data-rid={topic.id}
      style={{
        transform: CSS.Transform.toString(transform), transition,
        opacity: isDragging ? 0.3 : 1, zIndex: isDragging ? 50 : undefined,
        boxShadow: `inset 3px 0 0 ${DIFF_COLOR[topic.difficulty]}`,
      }}
      className={`flex items-stretch rounded-xl border-2 bg-card transition-colors ${
        isSelected ? 'border-primary/50 ring-2 ring-primary/15'
          : isMoveTarget ? 'border-dashed border-primary/35'
            : isFlash ? 'border-secondary/60 ring-2 ring-secondary/20'
              : 'border-border/15'
      }`}
    >
      {/* Drag handle */}
      <div {...attributes} {...listeners} aria-label={`Drag ${topic.name}`}
        className="shrink-0 w-9 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none rounded-l-[10px] bg-muted/10 border-r border-border/10 active:bg-primary/10">
        <GripVertical className="w-4 h-4 text-foreground/30" />
      </div>

      {/* Swipe zone */}
      <div className="relative flex-1 min-w-0 overflow-hidden rounded-r-[10px]">
        <div className="absolute inset-0 flex items-center justify-between px-3 text-[10px] font-black bg-gradient-to-r from-secondary/25 via-muted/10 to-primary/25" aria-hidden>
          <span className="flex items-center gap-1 text-secondary"><ChevronUp className="w-4 h-4" />Up</span>
          <span className="flex items-center gap-1 text-primary">Down<ChevronDown className="w-4 h-4" /></span>
        </div>

        <motion.div
          drag="x" dragDirectionLock dragConstraints={{ left: 0, right: 0 }} dragElastic={0.55} dragMomentum={false}
          onDragStart={() => { dragged.current = true; }} onDragEnd={onDragEnd}
          onClick={() => { if (!dragged.current) onTap(topic.id); }}
          style={isSelected ? { backgroundImage: 'linear-gradient(hsl(var(--primary) / 0.08), hsl(var(--primary) / 0.08))' } : undefined}
          className="relative flex items-center bg-card cursor-pointer select-none min-h-[58px]"
        >
          <div className="shrink-0 w-9 flex items-center justify-center">
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-mono font-black ${isSelected ? 'bg-primary/20 text-primary' : 'bg-muted/15 text-foreground/50'}`}>
              {index + 1}
            </span>
          </div>

          <div className="flex-1 min-w-0 py-2 pr-1">
            {editing ? (
              <input value={val} autoFocus onChange={e => setVal(e.target.value)} onClick={e => e.stopPropagation()}
                onPointerDownCapture={e => e.stopPropagation()}
                onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditing(false); }} onBlur={commitName}
                className="text-[12px] font-semibold bg-card border border-primary/30 rounded-lg px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-primary/40" />
            ) : (
              <p className={`text-[12px] font-semibold leading-snug break-words ${topic.status === 'complete' ? 'text-secondary/70 line-through' : 'text-foreground'}`}>{topic.name}</p>
            )}
            <div className="flex items-center gap-1 mt-1 flex-wrap" onClick={e => e.stopPropagation()}>
              <button aria-label="Cycle status" className="w-6 h-6 -ml-1 flex items-center justify-center text-[11px] active:scale-75 transition-transform"
                onClick={() => { const m: Record<string, TopicStatus> = { incomplete: 'in_process', in_process: 'complete', complete: 'incomplete' }; onUpdate(topic.id, { status: m[topic.status] || 'incomplete' }); navigator.vibrate?.(10); }}>
                {statusEmoji}
              </button>
              <button aria-label="Cycle difficulty" className="w-6 h-6 flex items-center justify-center active:scale-75 transition-transform"
                onClick={() => { const m = { Easy: 'Medium', Medium: 'Hard', Hard: 'Easy' } as const; onUpdate(topic.id, { difficulty: m[topic.difficulty] }); navigator.vibrate?.(10); }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: DIFF_COLOR[topic.difficulty] }} />
              </button>
              <button aria-label="Toggle important" className="w-6 h-6 flex items-center justify-center active:scale-110 transition-transform"
                onClick={() => { onUpdate(topic.id, { important: !topic.important }); navigator.vibrate?.(10); }}>
                <Star className={`w-3.5 h-3.5 ${topic.important ? 'fill-chart-4 text-chart-4' : 'text-foreground/25'}`} />
              </button>
              <button aria-label="Rename" className="w-6 h-6 flex items-center justify-center text-foreground/30 active:text-primary"
                onClick={() => { setVal(topic.name); setEditing(true); }}>
                <Pencil className="w-3 h-3" />
              </button>
              {topic.module && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold truncate max-w-[84px]">📁 {topic.module}</span>}
              {topic.subModule && <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-foreground font-bold truncate max-w-[72px]">📂 {topic.subModule}</span>}
            </div>
          </div>

          {isMoveTarget && moveMode && (
            <span className="shrink-0 mr-1 text-[9px] font-black text-primary px-2 py-1 rounded-lg bg-primary/10 border border-primary/20">
              {moveMode === 'before' ? '↑ Here' : '↓ Here'}
            </span>
          )}

          {/* Up / Down buttons */}
          <div className="shrink-0 self-stretch w-10 flex flex-col border-l border-border/10" onClick={e => e.stopPropagation()}>
            <button aria-label="Move up" disabled={first} onClick={() => onMoveBy(topic.id, -1)}
              className="flex-1 flex items-center justify-center text-foreground/60 disabled:opacity-20 active:bg-secondary/20 active:text-secondary transition-colors">
              <ChevronUp className="w-5 h-5" />
            </button>
            <button aria-label="Move down" disabled={last} onClick={() => onMoveBy(topic.id, 1)}
              className="flex-1 flex items-center justify-center text-foreground/60 border-t border-border/10 disabled:opacity-20 active:bg-primary/20 active:text-primary transition-colors">
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
});

/* ───────────────────────── Panel ───────────────────────── */
function DockBtn({ icon, label, onClick, disabled, active }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`flex-1 min-w-0 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 border text-[9px] font-black transition-all active:scale-90 disabled:opacity-25 ${
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border/20 text-foreground/80'
      }`}>
      {icon}{label}
    </button>
  );
}

export default function ReorderPanel({ topics, commit, updateTopic, undoCount, onUndo }: PanelProps) {
  const topicsRef = useRef(topics);
  topicsRef.current = topics;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState<MoveMode>(null);
  const [flashId, setFlashId] = useState<{ id: string; n: number } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [jump, setJump] = useState('');
  const selectedRef = useRef<string | null>(null);
  const modeRef = useRef<MoveMode>(null);
  selectedRef.current = selectedId;
  modeRef.current = moveMode;
  const listRef = useRef<HTMLDivElement>(null);

  const ids = useMemo(() => topics.map(t => t.id), [topics]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 90, tolerance: 8 } }),
  );

  // Scroll the moved row into view + clear the highlight
  useEffect(() => {
    if (!flashId) return;
    const el = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-rid]') ?? []).find(n => n.dataset.rid === flashId.id);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const t = setTimeout(() => setFlashId(null), 800);
    return () => clearTimeout(t);
  }, [flashId]);

  const place = useCallback((id: string, toIdx: number) => {
    const list = topicsRef.current;
    const from = list.findIndex(t => t.id === id);
    const to = Math.max(0, Math.min(toIdx, list.length - 1));
    if (from < 0 || from === to) return;
    commit(arrayMove(list, from, to));
    setFlashId(f => ({ id, n: (f?.n ?? 0) + 1 }));
    navigator.vibrate?.(10);
  }, [commit]);

  const moveBy = useCallback((id: string, delta: number) => {
    const idx = topicsRef.current.findIndex(t => t.id === id);
    if (idx >= 0) place(id, idx + delta);
  }, [place]);

  const onSwipe = useCallback((id: string, dir: 'up' | 'down', far: boolean) => {
    const idx = topicsRef.current.findIndex(t => t.id === id);
    if (idx < 0) return;
    const last = topicsRef.current.length - 1;
    if (dir === 'up') place(id, far ? 0 : idx - 1);
    else place(id, far ? last : idx + 1);
  }, [place]);

  const moveRelative = useCallback((src: string, tgt: string, after: boolean) => {
    const list = topicsRef.current;
    const item = list.find(t => t.id === src);
    if (!item || src === tgt) return;
    const rest = list.filter(t => t.id !== src);
    const at = rest.findIndex(t => t.id === tgt);
    if (at < 0) return;
    rest.splice(at + (after ? 1 : 0), 0, item);
    commit(rest);
    setFlashId(f => ({ id: src, n: (f?.n ?? 0) + 1 }));
    navigator.vibrate?.([10, 20, 10]);
  }, [commit]);

  const onTap = useCallback((id: string) => {
    const sel = selectedRef.current, mode = modeRef.current;
    if (mode && sel && sel !== id) {
      moveRelative(sel, id, mode === 'after');
      setMoveMode(null);
      return;
    }
    setSelectedId(sel === id ? null : id);
    setMoveMode(null);
  }, [moveRelative]);

  const sortBy = useCallback((kind: SortKind) => {
    const rank = { Easy: 0, Medium: 1, Hard: 2 } as const;
    const srank = { incomplete: 0, in_process: 1, complete: 2 } as const;
    const list = [...topicsRef.current];
    if (kind === 'reverse') list.reverse();
    else {
      const cmp: Record<Exclude<SortKind, 'reverse'>, (a: TopicEdit, b: TopicEdit) => number> = {
        az: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
        module: (a, b) => (a.module || '\uffff').localeCompare(b.module || '\uffff') || (a.subModule || '\uffff').localeCompare(b.subModule || '\uffff'),
        difficulty: (a, b) => rank[a.difficulty] - rank[b.difficulty],
        status: (a, b) => srank[a.status] - srank[b.status],
      };
      list.sort(cmp[kind]);
    }
    commit(list);
    navigator.vibrate?.([10, 20, 10]);
  }, [commit]);

  const onDragStart = useCallback((e: DragStartEvent) => { setActiveId(String(e.active.id)); navigator.vibrate?.(25); }, []);
  const onDragEnd = useCallback((e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const list = topicsRef.current;
    const from = list.findIndex(t => t.id === active.id), to = list.findIndex(t => t.id === over.id);
    if (from < 0 || to < 0) return;
    commit(arrayMove(list, from, to));
    navigator.vibrate?.([12, 24, 12]);
  }, [commit]);

  const selIdx = selectedId ? topics.findIndex(t => t.id === selectedId) : -1;
  const selTopic = selIdx >= 0 ? topics[selIdx] : null;
  const activeTopic = activeId ? topics.find(t => t.id === activeId) : null;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 pb-2 space-y-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/10">
          <GripVertical className="w-3.5 h-3.5 text-primary/60 shrink-0" />
          <p className="text-[10px] text-primary/80 font-semibold flex-1 leading-snug">
            {moveMode ? `Tap the topic to place it ${moveMode} →`
              : selectedId ? 'Use the dock below · ▲▼ buttons · swipe · drag'
                : 'Drag the grip, tap ▲▼, or swipe a row (right = up, left = down)'}
          </p>
          {undoCount > 0 && (
            <button onClick={onUndo}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary active:scale-90 transition-transform">
              <Undo2 className="w-3 h-3" /> Undo <span className="font-mono text-[8px] bg-primary/15 px-1 rounded">{undoCount}</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-muted-foreground/60 pr-0.5">Sort</span>
          {([['az', 'A → Z'], ['module', 'Module'], ['difficulty', 'Easy → Hard'], ['status', 'Pending first'], ['reverse', 'Reverse']] as const).map(([k, label]) => (
            <button key={k} onClick={() => sortBy(k)}
              className="shrink-0 h-7 px-2.5 rounded-full border border-border/15 bg-card/60 text-[10px] font-bold text-foreground/70 active:scale-95 transition-transform">
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1">
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[lockX]}
          measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
          onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5 pb-3">
              {topics.map((t, i) => (
                <Row key={t.id} topic={t} index={i} total={topics.length}
                  isSelected={selectedId === t.id}
                  isMoveTarget={moveMode !== null && selectedId !== null && selectedId !== t.id}
                  moveMode={moveMode}
                  isFlash={flashId?.id === t.id}
                  onTap={onTap} onMoveBy={moveBy} onSwipe={onSwipe} onUpdate={updateTopic} />
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 160, easing: 'ease-out' }}>
            {activeTopic ? (
              <div className="flex items-center gap-2 rounded-xl border-2 border-primary/40 bg-card px-3 py-3 shadow-2xl">
                <GripVertical className="w-4 h-4 text-primary/60 shrink-0" />
                <span className="w-7 h-7 rounded-lg bg-primary/20 text-primary text-[11px] font-mono font-black flex items-center justify-center shrink-0">
                  {topics.findIndex(t => t.id === activeTopic.id) + 1}
                </span>
                <p className="text-[12px] font-semibold text-foreground truncate">{activeTopic.name}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        {topics.length === 0 && (
          <div className="text-center py-10 space-y-2">
            <span className="text-2xl">📭</span>
            <p className="text-xs text-muted-foreground">No topics to reorder</p>
          </div>
        )}
      </div>

      {/* Selection dock */}
      <AnimatePresence initial={false}>
        {selTopic && (
          <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 420 }}
            className="shrink-0 mt-2 p-2.5 rounded-2xl border-2 border-primary/25 bg-card shadow-lg space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-primary/15 flex items-center justify-center text-[10px] font-mono font-black text-primary">{selIdx + 1}</span>
              <p className="text-[11px] font-bold text-foreground flex-1 min-w-0 truncate">{selTopic.name}</p>
              <span className="text-[9px] font-mono font-bold text-muted-foreground">of {topics.length}</span>
              <button onClick={() => { setSelectedId(null); setMoveMode(null); }} aria-label="Deselect"
                className="w-7 h-7 rounded-lg bg-muted/25 flex items-center justify-center active:scale-90">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            <div className="flex items-stretch gap-1">
              <DockBtn icon={<ArrowUpToLine className="w-4 h-4" />} label="Top" disabled={selIdx === 0} onClick={() => place(selTopic.id, 0)} />
              <DockBtn icon={<ChevronUp className="w-4 h-4" />} label="Up" disabled={selIdx === 0} onClick={() => moveBy(selTopic.id, -1)} />
              <DockBtn icon={<ChevronDown className="w-4 h-4" />} label="Down" disabled={selIdx === topics.length - 1} onClick={() => moveBy(selTopic.id, 1)} />
              <DockBtn icon={<ArrowDownToLine className="w-4 h-4" />} label="Bottom" disabled={selIdx === topics.length - 1} onClick={() => place(selTopic.id, topics.length - 1)} />
              <DockBtn icon={<span className="text-[11px] leading-none">↑B</span>} label="Before" active={moveMode === 'before'} onClick={() => setMoveMode(m => m === 'before' ? null : 'before')} />
              <DockBtn icon={<span className="text-[11px] leading-none">↓A</span>} label="After" active={moveMode === 'after'} onClick={() => setMoveMode(m => m === 'after' ? null : 'after')} />
            </div>
            <form className="flex items-center gap-2" onSubmit={e => {
              e.preventDefault();
              const n = parseInt(jump, 10);
              if (!isNaN(n)) { place(selTopic.id, n - 1); setJump(''); }
            }}>
              <span className="text-[10px] font-bold text-muted-foreground shrink-0">Go to position</span>
              <input value={jump} onChange={e => setJump(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={String(selIdx + 1)}
                className="flex-1 h-9 rounded-xl border border-border/20 bg-background px-3 text-[12px] font-mono font-bold focus:outline-none focus:ring-1 focus:ring-primary/40" />
              <button type="submit" disabled={!jump}
                className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-[11px] font-black flex items-center gap-1 disabled:opacity-30 active:scale-95">
                <Check className="w-3.5 h-3.5" /> Go
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
