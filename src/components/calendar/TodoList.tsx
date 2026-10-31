import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ChevronDown, Clock, ListChecks, Pencil, Check, X, Bell, CheckCircle2 } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import type { TodoItem } from '../../hooks/useTodos';
import CircularProgress from '../shared/CircularProgress';

interface Props {
  date: string;
  todos: TodoItem[];
  onAdd: (todo: Omit<TodoItem, 'id' | 'createdAt' | 'completed'>) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Pick<TodoItem, 'text' | 'priority' | 'category' | 'dueTime'>>) => void;
  notificationCount?: number;
}

const PRIORITIES = [
  { value: 'high' as const, label: 'High', color: 'bg-destructive/15 text-destructive border-destructive/25', dot: 'bg-destructive', ring: 'ring-destructive/30' },
  { value: 'medium' as const, label: 'Med', color: 'bg-chart-4/15 text-chart-4 border-chart-4/25', dot: 'bg-chart-4', ring: 'ring-chart-4/30' },
  { value: 'low' as const, label: 'Low', color: 'bg-secondary/15 text-secondary border-secondary/25', dot: 'bg-secondary', ring: 'ring-secondary/30' },
];

const CATEGORIES = ['Study', 'Practice', 'Review', 'Assignment', 'Personal', 'Other'];

export default function TodoList({ date, todos, onAdd, onToggle, onDelete, onUpdate, notificationCount = 0 }: Props) {
  const hasPending = todos.some(t => !t.completed);
  const [expanded, setExpanded] = useState(hasPending || todos.length > 0);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [dueTime, setDueTime] = useState('');
  const [category, setCategory] = useState('Study');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editPriority, setEditPriority] = useState<'high' | 'medium' | 'low'>('medium');

  // Completion confirmation state
  const [confirmTodo, setConfirmTodo] = useState<TodoItem | null>(null);
  const [completionNote, setCompletionNote] = useState('');

  const done = todos.filter(t => t.completed).length;
  const total = todos.length;

  const handleAdd = () => {
    if (!text.trim()) return;
    onAdd({ text: text.trim(), priority, dueDate: date, dueTime: dueTime || undefined, category });
    setText('');
    setDueTime('');
    setPriority('medium');
    setAdding(false);
  };

  const startEdit = (todo: TodoItem) => {
    setEditingId(todo.id);
    setEditText(todo.text);
    setEditPriority(todo.priority);
  };

  const saveEdit = (todo: TodoItem) => {
    if (onUpdate && editText.trim()) {
      onUpdate(todo.id, { text: editText.trim(), priority: editPriority });
    }
    setEditingId(null);
  };

  const handleToggleClick = (todo: TodoItem) => {
    setConfirmTodo(todo);
    setCompletionNote('');
  };

  const handleConfirmToggle = () => {
    if (!confirmTodo) return;
    onToggle(confirmTodo.id);
    if (!confirmTodo.completed && completionNote.trim() && onUpdate) {
      onUpdate(confirmTodo.id, { text: confirmTodo.text + ` [Note: ${completionNote.trim()}]` } as any);
    }
    setConfirmTodo(null);
    setCompletionNote('');
  };

  const sortedTodos = [...todos].sort((a, b) => {
    const pOrder = { high: 0, medium: 1, low: 2 };
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return pOrder[a.priority] - pOrder[b.priority];
  });

  return (
    <div className="rounded-2xl overflow-hidden border border-border/20 shadow-lg">
      {/* Premium Gradient Header */}
      <button onClick={() => setExpanded(p => !p)} className="w-full relative">
        <div className="relative px-3.5 py-3 bg-gradient-to-r from-chart-5/15 via-accent/8 to-primary/6 border-b border-border/15">
          <div className="absolute inset-0 bg-gradient-to-r from-chart-5/5 to-transparent" />
          <div className="relative flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-chart-5/15 border border-chart-5/20 flex items-center justify-center">
              <span className="text-sm">📋</span>
            </div>
            <div className="flex-1 text-left">
              <span className="text-[11px] font-black text-foreground uppercase tracking-wider">To-Do List</span>
              <span className="text-[8px] text-muted-foreground/60 block mt-0.5">Tasks & reminders</span>
            </div>
            {notificationCount > 0 && (
              <span className="relative flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/15 border border-destructive/25 text-[9px] font-bold text-destructive animate-pulse">
                <Bell className="w-3 h-3" />
                {notificationCount} urgent
              </span>
            )}
            {total > 0 && (
              <div className="flex items-center gap-2">
                <CircularProgress value={done} max={Math.max(total, 1)} size={24} strokeWidth={2.5}
                  color={done === total ? 'hsl(var(--secondary))' : 'hsl(var(--primary))'} />
                <span className="text-[10px] font-bold font-mono text-muted-foreground">{done}/{total}</span>
              </div>
            )}
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-4 h-4 text-muted-foreground/50" />
            </motion.div>
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5 bg-card/30 backdrop-blur-sm">
              {sortedTodos.length === 0 && !adding && (
                <div className="py-4 text-center">
                  <ListChecks className="w-7 h-7 text-muted-foreground/20 mx-auto mb-1.5" />
                  <p className="text-[11px] text-muted-foreground/60">No tasks for this day</p>
                  <p className="text-[9px] text-primary/50 font-semibold mt-0.5">Tap + to add your first task</p>
                </div>
              )}

              {sortedTodos.map(todo => {
                const p = PRIORITIES.find(x => x.value === todo.priority)!;
                const isEditing = editingId === todo.id;

                return (
                  <motion.div
                    key={todo.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10, height: 0 }}
                    className={`rounded-xl border transition-all ${
                      todo.completed ? 'bg-muted/8 border-border/8 opacity-50' : `${p.color}`
                    }`}
                  >
                    {isEditing ? (
                      <div className="p-2.5 space-y-2">
                        <Input
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          className="h-8 text-xs"
                          autoFocus
                          onKeyDown={e => e.key === 'Enter' && saveEdit(todo)}
                        />
                        <div className="flex gap-1">
                          {PRIORITIES.map(pr => (
                            <button key={pr.value} onClick={() => setEditPriority(pr.value)}
                              className={`text-[9px] px-2 py-1 rounded-full border font-bold transition-all ${
                                editPriority === pr.value ? pr.color + ' scale-105' : 'bg-card/30 border-border/15 text-muted-foreground'
                              }`}>
                              {pr.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 text-[10px] gap-1">
                            <X className="w-3 h-3" /> Cancel
                          </Button>
                          <Button size="sm" onClick={() => saveEdit(todo)} disabled={!editText.trim()} className="h-7 text-[10px] gap-1">
                            <Check className="w-3 h-3" /> Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-card/20 transition-colors active:scale-[0.99]"
                        onClick={() => !todo.completed && startEdit(todo)}
                      >
                        <button
                          onClick={e => { e.stopPropagation(); handleToggleClick(todo); }}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all hover:scale-110 active:scale-95 ${
                            todo.completed ? 'bg-secondary border-secondary shadow-[0_0_6px_hsl(var(--secondary)/0.3)]' : `border-current`
                          }`}>
                          {todo.completed && <span className="text-[9px] text-secondary-foreground font-bold">✓</span>}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] font-semibold leading-tight ${todo.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                            {todo.text}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {todo.dueTime && (
                              <span className="text-[9px] font-mono text-muted-foreground flex items-center gap-0.5 bg-card/30 px-1.5 py-0.5 rounded-md">
                                <Clock className="w-2.5 h-2.5" /> {todo.dueTime}
                              </span>
                            )}
                            {todo.category && (
                              <span className="text-[9px] text-muted-foreground bg-card/20 px-1.5 py-0.5 rounded-md font-medium">{todo.category}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!todo.completed && todo.priority === 'high' && (
                            <Bell className="w-3 h-3 text-destructive/60 animate-pulse" />
                          )}
                          <div className={`w-2 h-2 rounded-full ${p.dot} shadow-[0_0_4px_currentColor]`} />
                          {!todo.completed && (
                            <button
                              onClick={e => { e.stopPropagation(); startEdit(todo); }}
                              className="p-1 rounded-lg hover:bg-primary/10 transition-colors"
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground/40 hover:text-primary" />
                            </button>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); onDelete(todo.id); }}
                            className="p-1 rounded-lg hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-muted-foreground/30 hover:text-destructive" />
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {/* Add form */}
              <AnimatePresence>
                {adding && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2.5 pt-2 border-t border-border/10">
                      <Input
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="What needs to be done?"
                        className="h-9 text-xs"
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                      />
                      <div className="flex gap-1.5 flex-wrap">
                        {PRIORITIES.map(p => (
                          <button key={p.value} onClick={() => setPriority(p.value)}
                            className={`text-[9px] px-2.5 py-1 rounded-full border font-bold transition-all ${
                              priority === p.value ? p.color + ' scale-105' : 'bg-card/30 border-border/15 text-muted-foreground'
                            }`}>
                            {p.label}
                          </button>
                        ))}
                        <div className="w-px h-4 bg-border/20 self-center" />
                        {CATEGORIES.map(c => (
                          <button key={c} onClick={() => setCategory(c)}
                            className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold transition-all ${
                              category === c ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-card/30 border-border/15 text-muted-foreground/60'
                            }`}>
                            {c}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)}
                          className="h-7 text-[10px] w-28" placeholder="Time (optional)" />
                        <div className="flex-1" />
                        <Button size="sm" variant="ghost" onClick={() => setAdding(false)}
                          className="h-7 text-[10px]">Cancel</Button>
                        <Button size="sm" onClick={handleAdd} disabled={!text.trim()}
                          className="h-7 text-[10px] gap-1">
                          <Plus className="w-3 h-3" /> Add
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!adding && (
                <button onClick={() => setAdding(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border/20 text-[11px] font-bold text-muted-foreground/60 hover:text-primary hover:border-primary/25 hover:bg-primary/5 transition-all active:scale-[0.98]">
                  <Plus className="w-3.5 h-3.5" /> Add Task
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Completion Confirmation Dialog ── */}
      <AlertDialog open={!!confirmTodo} onOpenChange={open => { if (!open) setConfirmTodo(null); }}>
        <AlertDialogContent className="max-w-sm rounded-2xl border border-border/30 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className={`w-5 h-5 ${confirmTodo?.completed ? 'text-chart-4' : 'text-secondary'}`} />
              {confirmTodo?.completed ? 'Mark as incomplete?' : 'Mark as complete?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/20 border border-border/15">
                <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${PRIORITIES.find(p => p.value === confirmTodo?.priority)?.dot || 'bg-primary'}`} />
                <span className="text-sm font-medium text-foreground">{confirmTodo?.text}</span>
              </div>
              {/* Show note textarea only when completing (not uncompleting) */}
              {confirmTodo && !confirmTodo.completed && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Completion note (optional)
                  </label>
                  <textarea
                    value={completionNote}
                    onChange={e => setCompletionNote(e.target.value)}
                    placeholder="Any reflections or notes about this task..."
                    className="w-full text-xs bg-card/50 text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none min-h-[60px] border border-border/20 rounded-xl p-2.5 focus:border-secondary/30 focus:ring-1 focus:ring-secondary/20 transition-all"
                  />
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl text-xs font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmToggle}
              className={`rounded-xl text-xs font-bold gap-1.5 ${confirmTodo?.completed ? 'bg-chart-4 hover:bg-chart-4/90' : 'bg-secondary hover:bg-secondary/90'}`}
            >
              <Check className="w-3.5 h-3.5" />
              {confirmTodo?.completed ? 'Mark Incomplete' : 'Complete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Compact stat for the 4th column in date detail grid */
export function TodoStatusMini({ done, total }: { done: number; total: number }) {
  const hasPending = total > 0 && done < total;
  return (
    <div className={`flex flex-col items-center p-2.5 rounded-xl border transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
      hasPending
        ? 'bg-chart-5/10 border-chart-5/25 shadow-[0_0_8px_hsl(var(--chart-5)/0.15)]'
        : 'bg-chart-5/8 border-chart-5/15'
    }`}>
      {total > 0 ? (
        <>
          <div className="relative">
            <CircularProgress value={done} max={total} size={30} strokeWidth={3}
              color={done === total ? 'hsl(var(--secondary))' : 'hsl(var(--chart-5))'} />
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black font-mono text-foreground">
              {done}
            </span>
          </div>
          <span className="text-[9px] text-muted-foreground font-semibold mt-1">To-Do</span>
          <span className="text-[8px] text-muted-foreground/60 font-mono">{done}/{total}</span>
        </>
      ) : (
        <>
          <ListChecks className="w-5 h-5 text-muted-foreground/40 mb-0.5" />
          <span className="text-[9px] text-muted-foreground font-semibold">To-Do</span>
          <span className="text-[8px] text-primary/60 font-bold mt-0.5">+ Add</span>
        </>
      )}
    </div>
  );
}
