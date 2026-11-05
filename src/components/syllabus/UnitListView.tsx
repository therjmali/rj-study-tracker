import { useState, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Collapse from '../shared/Collapse';
import { ChevronRight, Clock, Calendar, Check, Star, Plus, Timer, Search, X } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import CircularProgress from '../shared/CircularProgress';
import type { Subject, SubTopic, TopicStatus, Unit } from '../../types';
import { formatStudyTime, formatDate, getCleanName, getDisplayTopicName, getSubjectFontSize, readableInk } from '../../lib/utils';
import { toast } from 'sonner';
import HighlightText from '../shared/HighlightText';
import { matchesFields } from '../../lib/searchUtils';
import { topicMatchesSearch } from '../../lib/syllabusFilter';

interface UnitListViewProps {
  subjects: Subject[];
  onToggleTopic: (subjectId: string, unitId: string, topicId: string) => void;
  onToggleImportant: (subjectId: string, unitId: string, topicId: string) => void;
  onCycleTopicStatus?: (subjectId: string, unitId: string, topicId: string, newStatus: TopicStatus) => void;
  onOpenTopicDetail: (topic: SubTopic, subjectId: string, unitId: string) => void;
  onOpenUnitEditor?: (subjectId: string, unitId: string) => void;
  onAddTopic?: (subjectId: string, unitId: string, topic: SubTopic) => void;
  onLogStudyTime?: (subjectId: string, unitId: string) => void;
  onBulkToggle?: (subjectId: string, unitId: string) => void;
  search?: string;
}

interface FlatUnit {
  subject: Subject;
  unit: Unit;
  unitIndex: number;
}

export default function UnitListView({
  subjects, onToggleTopic, onToggleImportant, onCycleTopicStatus,
  onOpenTopicDetail, onOpenUnitEditor, onAddTopic, onLogStudyTime, onBulkToggle, search,
}: UnitListViewProps) {
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [localSearch, setLocalSearch] = useState('');

  const toggleUnit = useCallback((id: string) => {
    setExpandedUnits(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const q = (localSearch || search || '').trim();

  const flatUnits = useMemo(() => {
    const result: FlatUnit[] = [];
    subjects.forEach(subject => {
      subject.units.forEach((unit, unitIndex) => {
        if (q) {
          const unitMatch = matchesFields(q, [unit.name, subject.name, subject.shortName]);
          const topicMatch = unit.subTopics.some(t => topicMatchesSearch(t, unit.name, subject.name, q, false));
          if (!unitMatch && !topicMatch) return;
        }
        result.push({ subject, unit, unitIndex });
      });
    });
    return result;
  }, [subjects, q]);

  // Group by subject for headers
  const grouped = useMemo(() => {
    const map = new Map<string, FlatUnit[]>();
    flatUnits.forEach(fu => {
      const list = map.get(fu.subject.id) || [];
      list.push(fu);
      map.set(fu.subject.id, list);
    });
    return map;
  }, [flatUnits]);

  const allExpanded = flatUnits.length > 0 && flatUnits.every(fu => expandedUnits.has(fu.unit.id));

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            placeholder="Search units & topics…"
            className="pl-10 h-10 bg-card/50 border-border/20 text-sm"
          />
          {localSearch && (
            <button onClick={() => setLocalSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
        {flatUnits.length > 1 && (
          <button
            onClick={() => {
              if (allExpanded) setExpandedUnits(new Set());
              else setExpandedUnits(new Set(flatUnits.map(fu => fu.unit.id)));
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 shrink-0 ${
              allExpanded
                ? 'bg-primary/15 border-primary/30 text-primary'
                : 'bg-muted/30 border-border/20 text-muted-foreground hover:text-foreground'
            }`}
          >
            {allExpanded ? '▼ Collapse' : '▶ Expand'} All
          </button>
        )}
      </div>

      {/* Stats summary */}
      <div className="flex items-center gap-3 px-1 text-xs text-muted-foreground font-semibold">
        <span>{flatUnits.length} unit{flatUnits.length !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>{flatUnits.reduce((a, fu) => a + fu.unit.subTopics.length, 0)} topics</span>
        <span>·</span>
        <span>{flatUnits.reduce((a, fu) => a + fu.unit.subTopics.filter(t => t.completed).length, 0)} done</span>
      </div>

      {/* Grouped unit cards */}
      {Array.from(grouped.entries()).map(([subjectId, units]) => {
        const subject = units[0].subject;
        return (
          <div key={subjectId} className="space-y-2">
            {/* Subject group header */}
            <div className="flex items-center gap-2.5 px-1 pt-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">{subject.name}</span>
              <div className="flex-1 h-px bg-border/20" />
              <span className="text-[10px] font-bold text-muted-foreground/60">{units.length} units</span>
            </div>

            {/* Unit cards */}
            {units.map(({ unit, unitIndex }) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                unitIndex={unitIndex}
                subject={subject}
                expanded={expandedUnits.has(unit.id)}
                onToggle={() => toggleUnit(unit.id)}
                onToggleTopic={onToggleTopic}
                onToggleImportant={onToggleImportant}
                onCycleTopicStatus={onCycleTopicStatus}
                onOpenTopicDetail={onOpenTopicDetail}
                onOpenUnitEditor={onOpenUnitEditor}
                onAddTopic={onAddTopic}
                onLogStudyTime={onLogStudyTime}
                onBulkToggle={onBulkToggle}
                searchQuery={q}
              />
            ))}
          </div>
        );
      })}

      {flatUnits.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-4xl mb-3">📭</span>
          <h3 className="text-base font-bold text-foreground mb-1">No units found</h3>
          <p className="text-sm text-muted-foreground">{q ? 'Try a different search term.' : 'Add subjects with units to get started.'}</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   UnitCard — Premium collapsible card
   ═══════════════════════════════════════════════════════════════ */

interface UnitCardProps {
  unit: Unit;
  unitIndex: number;
  subject: Subject;
  expanded: boolean;
  onToggle: () => void;
  onToggleTopic: (subjectId: string, unitId: string, topicId: string) => void;
  onToggleImportant: (subjectId: string, unitId: string, topicId: string) => void;
  onCycleTopicStatus?: (subjectId: string, unitId: string, topicId: string, newStatus: TopicStatus) => void;
  onOpenTopicDetail: (topic: SubTopic, subjectId: string, unitId: string) => void;
  onOpenUnitEditor?: (subjectId: string, unitId: string) => void;
  onAddTopic?: (subjectId: string, unitId: string, topic: SubTopic) => void;
  onLogStudyTime?: (subjectId: string, unitId: string) => void;
  onBulkToggle?: (subjectId: string, unitId: string) => void;
  searchQuery: string;
}

const UnitCard = memo(function UnitCard({
  unit, unitIndex, subject, expanded, onToggle,
  onToggleTopic, onToggleImportant, onCycleTopicStatus,
  onOpenTopicDetail, onOpenUnitEditor, onAddTopic, onLogStudyTime, onBulkToggle, searchQuery,
}: UnitCardProps) {
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');

  const done = unit.subTopics.filter(t => t.completed).length;
  const total = unit.subTopics.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;
  const inProgress = unit.subTopics.filter(t => t.status === 'in_process').length;
  const totalTimeMin = unit.subTopics.reduce((a, t) => a + (t.timeSpent || 0), 0) + (unit.timeSpent || 0);
  const lastDate = unit.subTopics.reduce((latest, t) => (t.completedDate && t.completedDate > latest ? t.completedDate : latest), '');
  const impCount = unit.subTopics.filter(t => t.important).length;

  // Module grouping
  const moduleGroups = useMemo(() => {
    const groups: { name: string; isModule: boolean; topics: SubTopic[] }[] = [];
    let currentUngrouped: SubTopic[] = [];
    const moduleMap = new Map<string, SubTopic[]>();

    unit.subTopics.forEach(t => {
      if (!t.module) {
        currentUngrouped.push(t);
      } else {
        if (currentUngrouped.length > 0) {
          groups.push({ name: '', isModule: false, topics: currentUngrouped });
          currentUngrouped = [];
        }
        let list = moduleMap.get(t.module);
        if (!list) {
          list = [];
          moduleMap.set(t.module, list);
          groups.push({ name: t.module, isModule: true, topics: list });
        }
        list.push(t);
      }
    });
    if (currentUngrouped.length > 0) {
      groups.push({ name: '', isModule: false, topics: currentUngrouped });
    }
    return groups;
  }, [unit.subTopics]);

  const toggleModule = (name: string) => {
    setCollapsedModules(p => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n; });
  };

  const handleQuickAddTopic = () => {
    if (!newTopicName.trim() || !onAddTopic) return;
    const topic: SubTopic = {
      id: `${unit.id}-qa-${Date.now()}`,
      name: newTopicName.trim(),
      completed: false,
      notes: '',
      difficulty: 'Medium',
      timeSpent: 0,
      important: false,
    };
    onAddTopic(subject.id, unit.id, topic);
    setNewTopicName('');
    setAddingTopic(false);
    toast.success('Topic added');
  };

  return (
    <motion.div
      className="relative overflow-hidden"
      style={{
        borderRadius: '20px',
        background: 'hsl(var(--card))',
        border: `1.5px solid hsl(var(--border) / ${expanded ? '0.5' : '0.3'})`,
        boxShadow: expanded
          ? `0 4px 24px hsl(var(--foreground) / 0.06), 0 0 0 1px hsl(var(--border) / 0.05)`
          : '0 1px 4px hsl(var(--foreground) / 0.03)',
        transition: 'box-shadow 0.3s ease',
      }}
    >
      {/* Left accent strip */}
      <div
        className="absolute top-0 left-0 w-[5px] h-full"
        style={{
          backgroundColor: subject.color,
          borderRadius: '20px 0 0 20px',
        }}
      />

      {/* ── Collapsed Header ── */}
      <div
        className="relative z-[1] cursor-pointer select-none"
        style={{ padding: '16px 16px 14px 22px' }}
        onClick={onToggle}
      >
        <div className="flex items-start gap-3">
          {/* Chevron */}
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="shrink-0 mt-1"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
          </motion.div>

          {/* Unit number badge */}
          <div
            className="shrink-0 mt-0.5 flex flex-col items-center"
            style={{ minWidth: 32 }}
          >
            <span
              className="text-[20px] font-black font-mono leading-none"
              style={{ color: readableInk(subject.color), letterSpacing: '-0.5px' }}
            >
              {String(unitIndex + 1).padStart(2, '0')}
            </span>
            <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50 mt-0.5">UNIT</span>
          </div>

          {/* Title + stats */}
          <div className="flex-1 min-w-0">
            <h3
              className="font-bold text-foreground break-words leading-tight"
              style={{ fontSize: '17px', letterSpacing: '-0.2px' }}
            >
              {unit.name}
            </h3>

            {/* Stats row */}
            <div className="flex items-center gap-3 mt-1.5 text-[11px] font-semibold text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3 opacity-50" />
                {totalTimeMin > 0 ? formatStudyTime(totalTimeMin) : '0m'}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3 opacity-50" />
                {lastDate ? formatDate(lastDate) : '—'}
              </span>
              <span className="inline-flex items-center gap-1">
                {allDone ? '✅' : '📋'} {done}/{total}
              </span>
              {impCount > 0 && (
                <span className="text-amber-500">⭐ {impCount}</span>
              )}
              {inProgress > 0 && (
                <span style={{ color: 'hsl(var(--chart-4))' }}>🔄 {inProgress}</span>
              )}
            </div>
          </div>

          {/* Progress ring */}
          <div className="shrink-0">
            <CircularProgress value={done} max={total || 1} size={44} strokeWidth={4} color={allDone ? 'hsl(var(--secondary))' : subject.color} />
          </div>
        </div>

        {/* Thin progress bar */}
        <div className="mt-3 h-[4px] rounded-full overflow-hidden" style={{ background: 'hsl(var(--border) / 0.3)' }}>
          <motion.div
            className="h-full rounded-full"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ backgroundColor: allDone ? 'hsl(var(--secondary))' : subject.color }}
          />
        </div>

        {/* Quick action buttons — only visible when collapsed */}
        {!expanded && (
          <div className="flex items-center gap-1.5 mt-2.5">
            {onOpenUnitEditor && (
              <button
                onClick={e => { e.stopPropagation(); onOpenUnitEditor(subject.id, unit.id); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-muted/20 border border-border/15 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all active:scale-95"
              >
                📝 Details
              </button>
            )}
            {onLogStudyTime && (
              <button
                onClick={e => { e.stopPropagation(); onLogStudyTime(subject.id, unit.id); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-muted/20 border border-border/15 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all active:scale-95"
              >
                <Timer className="w-3 h-3" /> Log
              </button>
            )}
            {onBulkToggle && total > 0 && (
              <button
                onClick={e => { e.stopPropagation(); onBulkToggle(subject.id, unit.id); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-muted/20 border border-border/15 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all active:scale-95"
              >
                {allDone ? '↩️ Undo All' : '✅ Complete All'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Expanded Content ── */}
      <Collapse open={expanded} duration={180}>
            <div className="px-4 pb-4 space-y-1" style={{ paddingLeft: '22px' }}>
              {/* Divider */}
              <div className="h-px bg-border/20 mb-2" />

              {/* Action row */}
              <div className="flex items-center gap-1.5 mb-3">
                {onOpenUnitEditor && (
                  <button
                    onClick={() => onOpenUnitEditor(subject.id, unit.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all active:scale-95"
                  >
                    📝 Unit Details
                  </button>
                )}
                {onLogStudyTime && (
                  <button
                    onClick={() => onLogStudyTime(subject.id, unit.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-muted/20 border border-border/15 text-muted-foreground hover:text-foreground transition-all active:scale-95"
                  >
                    <Timer className="w-3 h-3" /> Log Time
                  </button>
                )}
                {onBulkToggle && total > 0 && (
                  <button
                    onClick={() => onBulkToggle(subject.id, unit.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-muted/20 border border-border/15 text-muted-foreground hover:text-foreground transition-all active:scale-95"
                  >
                    {allDone ? '↩️ Undo' : '✅ All'}
                  </button>
                )}
              </div>

              {/* Topics / Modules */}
              {moduleGroups.map((group, gIdx) => {
                if (group.isModule) {
                  const mDone = group.topics.filter(t => t.completed).length;
                  const mPct = group.topics.length > 0 ? Math.round((mDone / group.topics.length) * 100) : 0;
                  const isCollapsed = collapsedModules.has(group.name);
                  return (
                    <div key={group.name} className="space-y-1">
                      {/* Module header */}
                      <button
                        onClick={() => toggleModule(group.name)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/15 border border-border/10 hover:bg-muted/25 transition-all"
                      >
                        <span className="text-sm">📂</span>
                        <span className="flex-1 text-left text-xs font-bold uppercase tracking-wide text-foreground/80">{group.name}</span>
                        <span className="text-[10px] font-mono font-bold text-muted-foreground">{mDone}/{group.topics.length}</span>
                        <div className="w-8 h-1.5 rounded-full bg-border/30 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${mPct}%`, backgroundColor: subject.color }} />
                        </div>
                        <span className="text-[10px] font-bold font-mono text-muted-foreground">{mPct}%</span>
                        <div style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.15s' }}>
                          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                        </div>
                      </button>
                      <Collapse open={!isCollapsed} duration={150}>
                            <div className="pl-3 space-y-1">
                              {group.topics.map(topic => (
                                <CompactTopicRow
                                  key={topic.id}
                                  topic={topic}
                                  subjectId={subject.id}
                                  unitId={unit.id}
                                  subjectColor={subject.color}
                                  onToggle={() => onToggleTopic(subject.id, unit.id, topic.id)}
                                  onToggleImportant={() => onToggleImportant(subject.id, unit.id, topic.id)}
                                  onCycleStatus={onCycleTopicStatus ? (s) => onCycleTopicStatus(subject.id, unit.id, topic.id, s) : undefined}
                                  onOpenDetail={() => onOpenTopicDetail(topic, subject.id, unit.id)}
                                  searchQuery={searchQuery}
                                />
                              ))}
                            </div>
                      </Collapse>
                    </div>
                  );
                }
                return group.topics.map(topic => (
                  <CompactTopicRow
                    key={topic.id}
                    topic={topic}
                    subjectId={subject.id}
                    unitId={unit.id}
                    subjectColor={subject.color}
                    onToggle={() => onToggleTopic(subject.id, unit.id, topic.id)}
                    onToggleImportant={() => onToggleImportant(subject.id, unit.id, topic.id)}
                    onCycleStatus={onCycleTopicStatus ? (s) => onCycleTopicStatus(subject.id, unit.id, topic.id, s) : undefined}
                    onOpenDetail={() => onOpenTopicDetail(topic, subject.id, unit.id)}
                    searchQuery={searchQuery}
                  />
                ));
              })}

              {/* Add topic inline */}
              {addingTopic ? (
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Input
                    value={newTopicName}
                    onChange={e => setNewTopicName(e.target.value)}
                    placeholder="Topic name…"
                    className="h-8 text-xs flex-1"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleQuickAddTopic();
                      if (e.key === 'Escape') { setAddingTopic(false); setNewTopicName(''); }
                    }}
                  />
                  <Button size="sm" className="h-8 text-xs" onClick={handleQuickAddTopic} disabled={!newTopicName.trim()}>Add</Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setAddingTopic(false); setNewTopicName(''); }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTopic(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/10 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Topic
                </button>
              )}
            </div>
      </Collapse>
    </motion.div>
  );
});

/* ═══════════════════════════════════════════════════════════════
   CompactTopicRow — Slim topic row for the expanded unit view
   ═══════════════════════════════════════════════════════════════ */

const DIFF_EMOJI: Record<string, string> = { Easy: '🟢', Medium: '🟡', Hard: '🔴' };

interface CompactTopicRowProps {
  topic: SubTopic;
  subjectId: string;
  unitId: string;
  subjectColor: string;
  onToggle: () => void;
  onToggleImportant: () => void;
  onCycleStatus?: (newStatus: TopicStatus) => void;
  onOpenDetail: () => void;
  searchQuery: string;
}

const CompactTopicRow = memo(function CompactTopicRow({
  topic, subjectColor, onToggle, onToggleImportant, onCycleStatus, onOpenDetail, searchQuery,
}: CompactTopicRowProps) {
  const status: TopicStatus = topic.status || (topic.completed ? 'complete' : 'incomplete');
  const isComplete = status === 'complete';
  const isInProgress = status === 'in_process';

  const handleStatusCycle = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.vibrate?.(25);
    if (onCycleStatus) {
      const next: TopicStatus = status === 'incomplete' ? 'in_process' : status === 'in_process' ? 'complete' : 'incomplete';
      onCycleStatus(next);
    } else {
      onToggle();
    }
  };

  return (
    <div
      onClick={onOpenDetail}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all hover:bg-muted/10 active:scale-[0.99] group/topic"
      style={{
        borderLeft: `3px solid ${isComplete ? 'hsl(var(--secondary))' : isInProgress ? 'hsl(var(--chart-4))' : 'transparent'}`,
      }}
    >
      {/* Status icon */}
      <button onClick={handleStatusCycle} className="shrink-0 transition-all active:scale-[0.75]">
        {isComplete ? (
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'hsl(var(--secondary))' }}>
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
        ) : isInProgress ? (
          <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center" style={{ borderColor: 'hsl(var(--chart-4))', background: 'hsl(var(--chart-4) / 0.1)' }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'hsl(var(--chart-4))' }} />
          </div>
        ) : (
          <div className="w-5 h-5 rounded-md border-[1.5px]" style={{ borderColor: 'hsl(var(--border))' }} />
        )}
      </button>

      {/* Name */}
      <span className={`flex-1 min-w-0 text-sm font-medium leading-snug break-words ${isComplete ? 'text-muted-foreground line-through decoration-1' : 'text-foreground'}`}>
        {isInProgress && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle animate-pulse" style={{ background: 'hsl(var(--chart-4))' }} />}
        <HighlightText text={getDisplayTopicName(topic.name)} query={searchQuery} />
      </span>

      {/* Metadata chips */}
      <div className="flex items-center gap-1.5 shrink-0 opacity-60 group-hover/topic:opacity-100 transition-opacity">
        {topic.timeSpent > 0 && (
          <span className="text-[10px] font-mono font-semibold text-muted-foreground">{formatStudyTime(topic.timeSpent)}</span>
        )}
        {topic.completedDate && (
          <span className="text-[10px] font-mono font-semibold text-muted-foreground">{formatDate(topic.completedDate)}</span>
        )}
        <span className="text-xs select-none">{DIFF_EMOJI[topic.difficulty] || '🟡'}</span>
        <button
          onClick={e => { e.stopPropagation(); navigator.vibrate?.(15); onToggleImportant(); }}
          className="transition-all active:scale-[1.3]"
        >
          <Star
            className={`w-3.5 h-3.5 ${topic.important ? 'fill-current' : ''}`}
            style={{
              color: topic.important ? 'hsl(var(--star-gold, 45 93% 47%))' : 'hsl(var(--muted-foreground) / 0.2)',
            }}
          />
        </button>
      </div>
    </div>
  );
});

