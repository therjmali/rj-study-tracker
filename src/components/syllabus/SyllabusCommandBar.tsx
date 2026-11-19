import { useRef, useEffect, useCallback, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@project/components/ui/dropdown-menu';
import { ChevronDown, ArrowUpDown, LayoutGrid, FolderPlus, FolderOpen, Download, Upload, MousePointer2, GripVertical, Plus, ClipboardCopy, FileDown, ChevronRight } from 'lucide-react';
import type { SortMode } from './SortBar';

interface Props {
  sortMode: SortMode;
  onSortChange: (s: SortMode) => void;
  viewMode: 'subjects' | 'units';
  onViewModeChange: (v: 'subjects' | 'units') => void;
  onAddSubject: () => void;
  onAddFolder: () => void;
  onRearrange: () => void;
  onImport: () => void;
  onExport: () => void;
  selectMode: boolean;
  onToggleSelect: () => void;
  itemCount: number;
  expandAll: () => void;
  collapseAll: () => void;
  allExpanded: boolean;
  hasMultipleItems: boolean;
  inFolder?: boolean;
}

const SORT_OPTIONS: { id: SortMode; label: string; icon: string }[] = [
  { id: 'custom', label: 'Custom Order', icon: '⋮⋮' },
  { id: 'name', label: 'Name A → Z', icon: '🔤' },
  { id: 'newest', label: 'Newest First', icon: '🆕' },
  { id: 'oldest', label: 'Oldest First', icon: '📅' },
  { id: 'high', label: 'High % First', icon: '📈' },
  { id: 'low', label: 'Low % First', icon: '📉' },
];

export default function SyllabusCommandBar({
  sortMode, onSortChange,
  viewMode, onViewModeChange,
  onAddSubject, onAddFolder, onRearrange,
  onImport, onExport,
  selectMode, onToggleSelect,
  itemCount, expandAll, collapseAll, allExpanded,
  hasMultipleItems, inFolder,
}: Props) {

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* (the count lives in the "N folders · M subjects" line below — a bare number here only looked like a cut-off label) */}
      {/* Sort dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold border border-border/20 bg-card/40 text-foreground/70 hover:text-foreground hover:bg-card/60 hover:border-border/40 backdrop-blur-sm whitespace-nowrap shrink-0 transition-all active:scale-95 min-h-[44px]">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Sort</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="z-50 shadow-xl rounded-xl min-w-[180px]">
          <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sort By</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={sortMode} onValueChange={(v) => onSortChange(v as SortMode)}>
            {SORT_OPTIONS.map(opt => (
              <DropdownMenuRadioItem key={opt.id} value={opt.id} className="text-[12px] font-semibold cursor-pointer">
                <span className="mr-2 text-sm">{opt.icon}</span> {opt.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* View dropdown */}
      {!inFolder && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold border whitespace-nowrap shrink-0 transition-all active:scale-95 min-h-[44px] ${
              viewMode !== 'subjects' ? 'bg-primary/15 border-primary/30 text-primary' : 'border-border/20 bg-card/40 text-foreground/70 hover:text-foreground hover:bg-card/60 backdrop-blur-sm'
            }`}>
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>View</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-50 shadow-xl rounded-xl min-w-[160px]">
            <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Display Mode</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onViewModeChange('subjects')} className={`text-[12px] font-semibold cursor-pointer ${viewMode === 'subjects' ? 'text-primary' : ''}`}>
              <span className="mr-2 text-sm">📚</span> Subjects
              {viewMode === 'subjects' && <span className="ml-auto text-primary text-xs">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewModeChange('units')} className={`text-[12px] font-semibold cursor-pointer ${viewMode === 'units' ? 'text-primary' : ''}`}>
              <span className="mr-2 text-sm">📋</span> Units
              {viewMode === 'units' && <span className="ml-auto text-primary text-xs">✓</span>}
            </DropdownMenuItem>
            {hasMultipleItems && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={allExpanded ? collapseAll : expandAll} className="text-[12px] font-semibold cursor-pointer">
                  <span className="mr-2 text-sm">{allExpanded ? '▼' : '▶'}</span>
                  {allExpanded ? 'Collapse All' : 'Expand All'}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Manage dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold border border-border/20 bg-card/40 text-foreground/70 hover:text-foreground hover:bg-card/60 hover:border-border/40 backdrop-blur-sm whitespace-nowrap shrink-0 transition-all active:scale-95 min-h-[44px]">
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Manage</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="z-50 shadow-xl rounded-xl min-w-[180px]">
          <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Manage</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onAddSubject} className="text-[12px] font-semibold cursor-pointer">
            <Plus className="w-3.5 h-3.5 mr-2" /> Add Subject
          </DropdownMenuItem>
          {!inFolder && (
            <DropdownMenuItem onClick={onAddFolder} className="text-[12px] font-semibold cursor-pointer">
              <FolderPlus className="w-3.5 h-3.5 mr-2" /> Add Folder
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onRearrange} className="text-[12px] font-semibold cursor-pointer">
            <GripVertical className="w-3.5 h-3.5 mr-2" /> Rearrange
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Import/Export dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold border border-border/20 bg-card/40 text-foreground/70 hover:text-foreground hover:bg-card/60 hover:border-border/40 backdrop-blur-sm whitespace-nowrap shrink-0 transition-all active:scale-95 min-h-[44px]">
            <Download className="w-3.5 h-3.5" />
            <span>Import / Export</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="z-50 shadow-xl rounded-xl min-w-[170px]">
          <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Data</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onImport} className="text-[12px] font-semibold cursor-pointer">
            <FileDown className="w-3.5 h-3.5 mr-2" /> Import Syllabus
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExport} className="text-[12px] font-semibold cursor-pointer">
            <ClipboardCopy className="w-3.5 h-3.5 mr-2" /> Export to Clipboard
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Select toggle — direct action */}
      <button
        onClick={onToggleSelect}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold border whitespace-nowrap shrink-0 transition-all active:scale-95 min-h-[44px] ${
          selectMode
            ? 'bg-primary/15 border-primary/30 text-primary shadow-sm'
            : 'border-border/20 bg-card/40 text-foreground/70 hover:text-foreground hover:bg-card/60 backdrop-blur-sm'
        }`}
      >
        <MousePointer2 className="w-3.5 h-3.5" />
        <span>{selectMode ? 'Selecting…' : 'Select'}</span>
      </button>
    </div>
  );
}
