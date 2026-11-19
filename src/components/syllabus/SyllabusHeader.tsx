import { useState, useMemo } from 'react';
import { Undo2, Redo2, Calendar } from 'lucide-react';
import type { Subject, RevisionKey } from '../../types';
import { formatDate, getLocalDateStr } from '../../lib/utils';
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
  deepSearch?: boolean;
  onDeepSearchChange?: (v: boolean) => void;
  externalCounts?: { status: Partial<Record<StatusFilter, number>>; diff: Record<DiffFilter, number> };
  categories?: string[];
  activeCategory?: string;
  onCategoryChange?: (cat: string) => void;
}

export default function SyllabusHeader({
  subjects, search, onSearchChange, filters, onFiltersChange, activeLogDate,
  canUndo, canRedo, onUndo, onRedo,
  totalTopics, doneTopics,
  searchResultCount, searchSubjectCount, externalCounts,
  categories, activeCategory, onCategoryChange,
}: Props) {

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

  const pct = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Title row */}
      <div className="flex items-center justify-between gap-3">
        {/* Completion only — the page name now lives in the top bar */}
        <div className="min-w-0 flex-1" aria-label={`${doneTopics} of ${totalTopics} topics complete, ${pct} percent`}>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black font-mono text-foreground leading-none">{doneTopics}</span>
            <span className="text-xs text-muted-foreground font-semibold">/ {totalTopics} topics</span>
            <span className="ml-1 text-[11px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary">{pct}%</span>
          </div>
          <div className="mt-1.5 h-1 rounded-full bg-muted/30 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground bg-card/50 border border-border/20 backdrop-blur-sm px-2 py-1 rounded-xl">
            <Calendar className="w-3 h-3" />
            <span className="font-mono font-semibold">{formatDate(activeLogDate)}</span>
          </div>
          <button disabled={!canUndo} onClick={onUndo} title="Undo"
            className="w-8 h-8 rounded-xl border border-border/20 bg-card/40 backdrop-blur-sm flex items-center justify-center disabled:opacity-30 hover:bg-muted/40 active:scale-90 transition-all min-h-[44px] min-w-[44px]">
            <Undo2 className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button disabled={!canRedo} onClick={onRedo} title="Redo"
            className="w-8 h-8 rounded-xl border border-border/20 bg-card/40 backdrop-blur-sm flex items-center justify-center disabled:opacity-30 hover:bg-muted/40 active:scale-90 transition-all min-h-[44px] min-w-[44px]">
            <Redo2 className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Search result indicator */}
      {search && searchResultCount !== undefined && (
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
            🔍 {searchResultCount} found across {searchSubjectCount} subject{searchSubjectCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Status filter pills */}
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
        onClear={() => { onFiltersChange({ ...filters, status: 'all', difficulty: 'all', revisionMissing: null }); onCategoryChange?.(''); }}
      />
    </div>
  );
}
