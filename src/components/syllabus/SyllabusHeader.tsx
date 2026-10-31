import { useState, useMemo } from 'react';
import { Search, Undo2, Redo2, Calendar, X } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import type { Subject, RevisionKey } from '../../types';
import { formatDate, getLocalDateStr } from '../../lib/utils';
import DeepSearchToggle from '../shared/DeepSearchToggle';
import StatusFilterPills, { type StatusFilter, type DiffFilter } from '../shared/StatusFilterPills';

export type { StatusFilter, DiffFilter } from '../shared/StatusFilterPills';
export interface SyllabusFilters {
  status: StatusFilter;
  difficulty: DiffFilter;
  /** Subject-level only: completed topics that still miss this revision round */
  revisionMissing?: RevisionKey | null;
}

interface Props {
  subjects: Subject[];
  search: string;
  onSearchChange: (v: string) => void;
  filters: SyllabusFilters;
  onFiltersChange: (f: SyllabusFilters) => void;
  activeLogDate: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAddSubject: () => void;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  totalTopics: number;
  doneTopics: number;
  onImport?: () => void;
  onAddFolder?: () => void;
  searchResultCount?: number;
  searchSubjectCount?: number;
  /** Controlled deep-search flag (so the toggle actually changes the results) */
  deepSearch?: boolean;
  onDeepSearchChange?: (v: boolean) => void;
  externalCounts?: { status: Partial<Record<StatusFilter, number>>; diff: Record<DiffFilter, number> };
  categories?: string[];
  activeCategory?: string;
  onCategoryChange?: (cat: string) => void;
}

export default function SyllabusHeader({
  subjects, search, onSearchChange, filters, onFiltersChange, activeLogDate,
  canUndo, canRedo, onUndo, onRedo, onAddSubject, selectMode, onToggleSelectMode,
  totalTopics, doneTopics, onImport, onAddFolder,
  searchResultCount, searchSubjectCount, externalCounts,
  categories, activeCategory, onCategoryChange,
  deepSearch: deepSearchProp, onDeepSearchChange,
}: Props) {
  const [localDeepSearch, setLocalDeepSearch] = useState(false);
  const deepSearch = deepSearchProp ?? localDeepSearch;
  const setDeepSearch = (fn: (p: boolean) => boolean) => {
    const next = fn(deepSearch);
    if (onDeepSearchChange) onDeepSearchChange(next); else setLocalDeepSearch(next);
  };

  const counts = useMemo(() => {
    if (externalCounts) return externalCounts;
    const today = getLocalDateStr();
    const status: Partial<Record<StatusFilter, number>> = { all: 0, complete: 0, in_process: 0, incomplete: 0, important: 0, focus: 0, revision_due: 0, has_time: 0 };
    const diff: Record<DiffFilter, number> = { all: 0, Easy: 0, Medium: 0, Hard: 0 };
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      status.all = (status.all || 0) + 1;
      diff.all++;
      if (t.completed) status.complete = (status.complete || 0) + 1;
      else if (t.status === 'in_process') status.in_process = (status.in_process || 0) + 1;
      else status.incomplete = (status.incomplete || 0) + 1;
      if (t.important) status.important = (status.important || 0) + 1;
      if (!t.completed && t.important) status.focus = (status.focus || 0) + 1;
      if (t.completed && t.srsDueDate && t.srsDueDate <= today) status.revision_due = (status.revision_due || 0) + 1;
      if (t.timeSpent && t.timeSpent > 0) status.has_time = (status.has_time || 0) + 1;
      if (t.difficulty === 'Easy') diff.Easy++;
      else if (t.difficulty === 'Medium') diff.Medium++;
      else if (t.difficulty === 'Hard') diff.Hard++;
    })));
    return { status, diff };
  }, [subjects, externalCounts]);

  return (
    <div className="space-y-3">
      {/* Title row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-foreground">📚 Syllabus</h2>
          <span className="text-xs text-muted-foreground font-mono">{doneTopics}/{totalTopics}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground glass-subtle px-1.5 py-0.5 rounded-lg">
            <Calendar className="w-3 h-3" />
            <span className="font-mono">{formatDate(activeLogDate)}</span>
          </div>
          <button disabled={!canUndo} onClick={onUndo} title="Undo"
            className="w-7 h-7 rounded-lg border border-border/20 bg-card/30 flex items-center justify-center disabled:opacity-30 hover:bg-muted/30 active:scale-90 transition-all">
            <Undo2 className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button disabled={!canRedo} onClick={onRedo} title="Redo"
            className="w-7 h-7 rounded-lg border border-border/20 bg-card/30 flex items-center justify-center disabled:opacity-30 hover:bg-muted/30 active:scale-90 transition-all">
            <Redo2 className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => onSearchChange(e.target.value)} placeholder={deepSearch ? "Deep search (notes, resources, files)..." : "Search topics... (Ctrl+K)"}
            className="pl-10 pr-8 bg-card/30 backdrop-blur-xl border-border/15" />
          {search && (
            <button onClick={() => onSearchChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted/70 transition-colors">
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
        <DeepSearchToggle enabled={deepSearch} onToggle={() => setDeepSearch(p => !p)} />
      </div>

      {/* Search result indicator */}
      {search && searchResultCount !== undefined && (
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
            🔍 {searchResultCount} found across {searchSubjectCount} subject{searchSubjectCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* ── Unified Emoji Filter Strip (status + difficulty in one row) ── */}
      <StatusFilterPills
        value={filters.status}
        onChange={(v) => onFiltersChange({ ...filters, status: v })}
        counts={counts.status}
        size="sm"
        diffValue={filters.difficulty}
        onDiffChange={(v) => onFiltersChange({ ...filters, difficulty: v })}
        diffCounts={counts.diff}
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={onCategoryChange}
      />
    </div>
  );
}
