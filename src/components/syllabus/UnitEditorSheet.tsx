import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Star, Pencil, Loader2, X, Search, Plus, CheckCheck } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Progress } from '@project/components/ui/progress';
import BottomSheet from '../shared/BottomSheet';
import type { Unit, SubTopic, TopicStatus } from '../../types';
import { formatDate, formatStudyTime, readableInk } from '../../lib/utils';
import { matchesFields } from '../../lib/searchUtils';

type UnitFilter = 'all' | 'pending' | 'done' | 'important' | 'hard';

interface Props {
  open: boolean;
  onClose: () => void;
  unit: Unit | null;
  subjectColor: string;
  subjectName: string;
  onToggleTopic: (topicId: string) => void;
  onToggleImportant: (topicId: string) => void;
  onOpenTopicDetail: (topic: SubTopic) => void;
  onCycleStatus?: (topicId: string, newStatus: TopicStatus) => void;
  onAddTopic?: (name: string, difficulty: SubTopic['difficulty']) => void;
  onBulkToggle?: () => void;
}

export default function UnitEditorSheet({
  open, onClose, unit, subjectColor, subjectName,
  onToggleTopic, onToggleImportant, onOpenTopicDetail,
  onCycleStatus, onAddTopic, onBulkToggle,
}: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<UnitFilter>('all');
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDiff, setNewDiff] = useState<SubTopic['difficulty']>('Medium');

  // Reset when sheet opens
  useEffect(() => {
    if (open) { setSearch(''); setFilter('all'); setAddMode(false); setNewName(''); }
  }, [open]);

  const topics = unit?.subTopics ?? [];
  const done = topics.filter(t => t.completed).length;
  const total = topics.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;
  const easy = topics.filter(t => t.difficulty === 'Easy').length;
  const med = topics.filter(t => t.difficulty === 'Medium').length;
  const hard = topics.filter(t => t.difficulty === 'Hard').length;
  const imp = topics.filter(t => t.important).length;
  const inProcess = topics.filter(t => t.status === 'in_process').length;

  // Filtered topics
  const filtered = useMemo(() => {
    let list = topics;
    if (search) {
      list = list.filter(t => matchesFields(search, [t.name, t.module, t.subModule, ...(t.tags || [])]));
    }
    switch (filter) {
      case 'pending': return list.filter(t => !t.completed);
      case 'done': return list.filter(t => t.completed);
      case 'important': return list.filter(t => t.important);
      case 'hard': return list.filter(t => t.difficulty === 'Hard');
      default: return list;
    }
  }, [topics, search, filter]);

  // Filter counts
  const counts: Record<UnitFilter, number> = useMemo(() => ({
    all: topics.length,
    pending: topics.filter(t => !t.completed).length,
    done,
    important: imp,
    hard,
  }), [topics, done, imp, hard]);

  if (!unit) return null;

  const handleAddTopic = () => {
    if (!newName.trim() || !onAddTopic) return;
    onAddTopic(newName.trim(), newDiff);
    setNewName('');
    setNewDiff('Medium');
    setAddMode(false);
  };

  const cycleStatus = (topic: SubTopic) => {
    if (!onCycleStatus) { onToggleTopic(topic.id); return; }
    const currentStatus: TopicStatus = topic.status || (topic.completed ? 'complete' : 'incomplete');
    const nextMap: Record<string, TopicStatus> = { incomplete: 'in_process', in_process: 'complete', complete: 'incomplete' };
    navigator.vibrate?.(30);
    onCycleStatus(topic.id, nextMap[currentStatus] || 'incomplete');
  };

  const filters: { id: UnitFilter; label: string; emoji: string }[] = [
    { id: 'all', label: 'All', emoji: '📋' },
    { id: 'pending', label: 'Pending', emoji: '⬜' },
    { id: 'done', label: 'Done', emoji: '✅' },
    { id: 'important', label: 'Star', emoji: '⭐' },
    { id: 'hard', label: 'Hard', emoji: '🔴' },
  ];

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">📖 Unit Editor</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            <span className="font-semibold" style={{ color: readableInk(subjectColor) }}>{subjectName}</span> · {unit.name}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onBulkToggle && (
            <Button variant={allDone ? 'default' : 'outline'} size="sm" onClick={onBulkToggle}
              className="h-8 px-2.5 text-[10px] gap-1">
              <CheckCheck className="w-3.5 h-3.5" />
              {allDone ? 'Unmark All' : 'Mark All'}
            </Button>
          )}
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted/30 flex items-center justify-center hover:bg-destructive/20 transition-all active:scale-90">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="glass-subtle p-3 rounded-xl mb-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">{done}/{total} completed</span>
          <span className="text-xs font-black font-mono" style={{ color: readableInk(subjectColor) }}>{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex gap-2.5 text-[10px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-diff-easy" /> Easy: <b className="text-foreground">{easy}</b></span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-diff-medium" /> Med: <b className="text-foreground">{med}</b></span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-diff-hard" /> Hard: <b className="text-foreground">{hard}</b></span>
          <span className="flex items-center gap-1"><Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> <b className="text-foreground">{imp}</b></span>
          {inProcess > 0 && (
            <span className="flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 text-amber-500" /> WIP: <b className="text-foreground">{inProcess}</b></span>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search topics..."
          className="pl-9 h-8 text-xs bg-card/30 border-border/15" />
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-hide pb-0.5">
        {filters.map(f => (
          <Button key={f.id} variant={filter === f.id ? 'default' : 'outline'} size="sm"
            onClick={() => setFilter(f.id)}
            className={`text-[9px] h-6 px-2 gap-1 whitespace-nowrap shrink-0 ${filter !== f.id ? 'bg-card/30 border-border/15' : 'shadow-sm'}`}>
            <span>{f.emoji}</span> {f.label}
            <span className="font-mono opacity-70">{counts[f.id]}</span>
          </Button>
        ))}
      </div>

      {/* Topics List */}
      <div className="space-y-1.5 max-h-[42vh] overflow-y-auto pr-1">
        <AnimatePresence mode="popLayout">
          {filtered.map((topic, idx) => (
            <UnitTopicCard
              key={topic.id}
              topic={topic}
              index={idx}
              subjectColor={subjectColor}
              onCycleStatus={() => cycleStatus(topic)}
              onToggleImportant={() => onToggleImportant(topic.id)}
              onOpenDetail={() => onOpenTopicDetail(topic)}
            />
          ))}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground">{search ? `No topics matching "${search}"` : 'No topics in this filter'}</p>
          </div>
        )}
      </div>

      {/* Add Topic */}
      {onAddTopic && (
        <div className="mt-3 pt-3 border-t border-border/15">
          <AnimatePresence mode="wait">
            {addMode ? (
              <motion.div key="form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="space-y-2">
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Topic name..."
                  className="text-xs h-8" autoFocus onKeyDown={e => e.key === 'Enter' && handleAddTopic()} />
                <div className="flex gap-1.5">
                  {(['Easy', 'Medium', 'Hard'] as const).map(d => (
                    <Button key={d} size="sm" variant={newDiff === d ? 'default' : 'outline'}
                      onClick={() => setNewDiff(d)} className="flex-1 text-[10px] h-7">
                      {d === 'Easy' ? '🟢' : d === 'Medium' ? '🟡' : '🔴'} {d}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={handleAddTopic} disabled={!newName.trim()} className="flex-1 text-xs h-8">
                    <Plus className="w-3 h-3 mr-1" /> Add Topic
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddMode(false); setNewName(''); }} className="text-xs h-8">
                    Cancel
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Button variant="ghost" size="sm" onClick={() => setAddMode(true)}
                  className="w-full text-xs gap-1.5 text-muted-foreground h-8 hover:text-primary">
                  <Plus className="w-3.5 h-3.5" /> Add Topic to Unit
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </BottomSheet>
  );
}

function UnitTopicCard({ topic, index, subjectColor, onCycleStatus, onToggleImportant, onOpenDetail }: {
  topic: SubTopic; index: number; subjectColor: string;
  onCycleStatus: () => void; onToggleImportant: () => void; onOpenDetail: () => void;
}) {
  const status: TopicStatus = topic.status || (topic.completed ? 'complete' : 'incomplete');
  const diffColors: Record<string, string> = {
    Easy: 'bg-diff-easy/12 text-diff-easy border-diff-easy/20',
    Medium: 'bg-diff-medium/12 text-diff-medium border-diff-medium/20',
    Hard: 'bg-diff-hard/12 text-diff-hard border-diff-hard/20',
  };

  const statusHint = status === 'incomplete' ? 'Tap → In Process' : status === 'in_process' ? 'Tap → Complete' : 'Tap → Incomplete';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      transition={{ delay: Math.min(index * 0.02, 0.3) }}
      className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all ${
        topic.completed ? 'bg-muted/10 border-border/10 opacity-60' : status === 'in_process' ? 'bg-amber-500/5 border-amber-500/15' : 'bg-card/40 border-border/20 hover:border-border/40'
      }`}
    >
      {/* Status toggle — cycles through 3 states */}
      <button onClick={onCycleStatus} className="shrink-0 active:scale-75 transition-transform" title={statusHint}>
        {status === 'complete' ? (
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }}>
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </motion.div>
        ) : status === 'in_process' ? (
          <Loader2 className="w-5 h-5 text-amber-500 animate-spin" style={{ animationDuration: '3s' }} />
        ) : (
          <Circle className="w-5 h-5 text-muted-foreground/30 hover:text-primary transition-colors" />
        )}
      </button>

      {/* Topic info */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium leading-snug ${topic.completed ? 'line-through text-muted-foreground' : status === 'in_process' ? 'text-amber-300' : 'text-foreground'}`}>
          {topic.name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className={`text-[9px] px-1.5 py-0.5 rounded border ${diffColors[topic.difficulty]}`}>
            {topic.difficulty}
          </span>
          {status === 'in_process' && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 font-bold">WIP</span>
          )}
          {topic.completedDate && (
            <span className="text-[8px] text-muted-foreground font-mono">{formatDate(topic.completedDate)}</span>
          )}
          {topic.timeSpent > 0 && (
            <span className="text-[8px] text-muted-foreground font-mono">{formatStudyTime(topic.timeSpent)}</span>
          )}
          {topic.tags?.map(tag => (
            <span key={tag} className="text-[8px] px-1 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15">{tag}</span>
          ))}
        </div>
      </div>

      {/* Important star */}
      <motion.button whileTap={{ scale: 1.3 }} onClick={onToggleImportant} className="shrink-0">
        <Star className={`w-4 h-4 transition-colors ${topic.important ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/20'}`} />
      </motion.button>

      {/* Edit button */}
      <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0 hover:bg-primary/10" onClick={onOpenDetail}>
        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
      </Button>
    </motion.div>
  );
}
