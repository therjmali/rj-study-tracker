import { useMemo } from 'react';
import {
  Pencil, FileText, Copy, Download, Upload, GitMerge, FolderInput, ArrowUp, ArrowDown,
  Trash2, ClipboardCopy, Layers, ListChecks, Clock, ChevronRight,
} from 'lucide-react';
import BottomSheet from '../shared/BottomSheet';
import type { Subject } from '../../types';
import { formatStudyTime } from '../../lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  subject: Subject;
  pct: number;
  filtered: boolean;
  onEditUnits: () => void;
  onEditSubject: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onImport: () => void;
  onReport?: () => void;
  onMerge?: () => void;
  onMoveToFolder?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onCopyName: () => void;
  onDelete: () => void;
}

function Tile({ icon, label, hint, color, onClick }: { icon: React.ReactNode; label: string; hint: string; color: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex flex-col items-start gap-2 p-3 rounded-2xl border border-border/15 bg-card/40 text-left active:scale-[0.96] transition-transform hover:bg-card/60">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: color + '1f', color }}>{icon}</span>
      <span>
        <span className="block text-[12px] font-black text-foreground leading-tight">{label}</span>
        <span className="block text-[10px] text-muted-foreground font-medium leading-tight mt-0.5">{hint}</span>
      </span>
    </button>
  );
}

function Row({ icon, label, hint, onClick, danger }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 text-left active:bg-muted/30 transition-colors ${danger ? 'text-destructive' : 'text-foreground'}`}>
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${danger ? 'bg-destructive/10' : 'bg-muted/25'}`}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-bold leading-tight">{label}</span>
        {hint && <span className={`block text-[10px] font-medium mt-0.5 ${danger ? 'text-destructive/70' : 'text-muted-foreground'}`}>{hint}</span>}
      </span>
      {!danger && <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/70 px-1 mb-1.5">{title}</p>
      <div className="rounded-2xl border border-border/15 bg-card/35 divide-y divide-border/10 overflow-hidden">{children}</div>
    </div>
  );
}

export default function SubjectActionsSheet(p: Props) {
  const { subject, pct } = p;
  const stats = useMemo(() => {
    const all = subject.units.flatMap(u => u.subTopics);
    const mins = all.reduce((a, t) => a + (t.timeSpent || 0), 0) + subject.units.reduce((a, u) => a + (u.timeSpent || 0), 0);
    return { topics: all.length, done: all.filter(t => t.completed).length, units: subject.units.length, mins };
  }, [subject]);

  const run = (fn?: () => void) => () => { p.onClose(); if (fn) setTimeout(fn, 120); };
  const c = subject.color;

  return (
    <BottomSheet open={p.open} onClose={p.onClose} zIndex={90}>
      <div className="space-y-4 -mt-1">
        {/* Header */}
        <div className="rounded-2xl p-3.5 border border-border/15 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${c}26 0%, hsl(var(--card) / 0.6) 70%)` }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center border border-border/20"
              style={{ background: c + '25' }}>
              {subject.image
                ? <img src={subject.image} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : <span className="text-sm font-black" style={{ color: c }}>{subject.shortName.slice(0, 3)}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: c }}>{subject.shortName}</p>
              <p className="text-sm font-black text-foreground leading-snug break-words">{subject.name}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xl font-black font-mono text-foreground leading-none">{pct}%</p>
              <p className="text-[9px] font-bold text-muted-foreground">{p.filtered ? 'filtered' : 'complete'}</p>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-muted/25 mt-3 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: c }} />
          </div>
          <div className="flex items-center gap-3 mt-2.5 text-[10px] font-bold text-muted-foreground">
            <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{stats.units} units</span>
            <span className="flex items-center gap-1"><ListChecks className="w-3 h-3" />{stats.done}/{stats.topics} topics</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatStudyTime(stats.mins)}</span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <Tile icon={<Layers className="w-4 h-4" />} label="Edit Units" hint="Rename, reorder, bulk edit" color={c} onClick={run(p.onEditUnits)} />
          <Tile icon={<Pencil className="w-4 h-4" />} label="Edit Subject" hint="Name, cover, icon, exam date" color="#6366f1" onClick={run(p.onEditSubject)} />
          <Tile icon={<Copy className="w-4 h-4" />} label="Duplicate" hint="Make an exact copy" color="#0ea5e9" onClick={run(p.onDuplicate)} />
          <Tile icon={<FileText className="w-4 h-4" />} label="Report" hint="Preview a printable report" color="#10b981" onClick={run(p.onReport)} />
        </div>

        <Group title="Organise">
          {p.onMoveToFolder && <Row icon={<FolderInput className="w-4 h-4" />} label="Move to folder" hint="File this subject in a folder" onClick={run(p.onMoveToFolder)} />}
          {p.onMerge && <Row icon={<GitMerge className="w-4 h-4" />} label="Merge units" hint="Combine two or more units" onClick={run(p.onMerge)} />}
          {p.onMoveUp && <Row icon={<ArrowUp className="w-4 h-4" />} label="Move up" onClick={run(p.onMoveUp)} />}
          {p.onMoveDown && <Row icon={<ArrowDown className="w-4 h-4" />} label="Move down" onClick={run(p.onMoveDown)} />}
        </Group>

        <Group title="Share & data">
          <Row icon={<Download className="w-4 h-4" />} label="Export as JSON" hint="Backup this subject" onClick={run(p.onExport)} />
          <Row icon={<Upload className="w-4 h-4" />} label="Import subject" hint="Add subjects from a JSON file" onClick={run(p.onImport)} />
          <Row icon={<ClipboardCopy className="w-4 h-4" />} label="Copy subject name" onClick={run(p.onCopyName)} />
        </Group>

        <Group title="Danger zone">
          <Row icon={<Trash2 className="w-4 h-4" />} label="Delete subject" hint={`Removes all ${stats.topics} topics`} danger onClick={run(p.onDelete)} />
        </Group>
      </div>
    </BottomSheet>
  );
}
