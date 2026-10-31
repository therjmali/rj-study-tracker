import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Pencil, Trash2, FolderOpen, ChevronRight, ChevronDown, Copy, FileText, FolderOutput, Clock, Star, ImagePlus, TrendingUp, Trophy, AlertTriangle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import { Button } from '@project/components/ui/button';
import type { Folder, Subject } from '../../types';
import { getLocalDateStr } from '../../lib/utils';
import { toast } from 'sonner';
import StatusFilterPills, { type StatusFilter } from '../shared/StatusFilterPills';

interface Props {
  folder: Folder;
  subjects: Subject[];
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onExport?: () => void;
  onMoveAllOut?: () => void;
}

function fmtTime(m: number) { if (m <= 0) return '0 min'; if (m < 60) return `${m} min`; const h = Math.floor(m / 60); const r = m % 60; return r > 0 ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h 00m`; }

export default function FolderCard({ folder, subjects, onOpen, onEdit, onDelete, onDuplicate, onExport, onMoveAllOut }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const stats = useMemo(() => {
    let total = 0, done = 0, easy = 0, med = 0, hard = 0, imp = 0, impDone = 0, time = 0;
    let easyDone = 0, medDone = 0, hardDone = 0;
    let lastCompleted = '';
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      total++; if (t.completed) { done++; if (t.completedDate && t.completedDate > lastCompleted) lastCompleted = t.completedDate; }
      if (t.difficulty === 'Easy') { easy++; if (t.completed) easyDone++; }
      else if (t.difficulty === 'Medium') { med++; if (t.completed) medDone++; }
      else { hard++; if (t.completed) hardDone++; }
      if (t.important) { imp++; if (t.completed) impDone++; }
      time += t.timeSpent || 0;
    })));
    return { total, done, pct: total > 0 ? Math.round(done / total * 100) : 0, easy, med, hard, easyDone, medDone, hardDone, imp, impDone, time, lastCompleted };
  }, [subjects]);

  const lastStudiedLabel = useMemo(() => {
    if (!stats.lastCompleted) return null;
    const now = new Date();
    const last = new Date(stats.lastCompleted + 'T12:00:00');
    const diffDays = Math.floor((now.getTime() - last.getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
  }, [stats.lastCompleted]);

  const perSubject = useMemo(() => subjects.map(s => {
    let total = 0, done = 0;
    s.units.forEach(u => u.subTopics.forEach(t => { total++; if (t.completed) done++; }));
    return { id: s.id, name: s.shortName, color: s.color, total, done, pct: total > 0 ? Math.round(done / total * 100) : 0 };
  }), [subjects]);

  const velocity = useMemo(() => {
    const days: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = getLocalDateStr(d);
      let count = 0;
      subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
        if (t.completed && t.completedDate === ds) count++;
      })));
      days.push(count);
    }
    const total = days.reduce((a, b) => a + b, 0);
    return { days, avg: Math.round((total / 7) * 10) / 10, total };
  }, [subjects]);

  const sortedSubjects = useMemo(() => [...perSubject].sort((a, b) => b.pct - a.pct), [perSubject]);
  const topSubject = sortedSubjects[0];
  const weakestSubject = sortedSubjects.length > 1 ? sortedSubjects[sortedSubjects.length - 1] : null;

  const hasCover = !!folder.coverImage;
  const maxDay = Math.max(...velocity.days, 1);

  const [folderCopyTap, setFolderCopyTap] = useState<1 | 2 | 3>(1);
  const handleCopyCoverLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.vibrate?.(20);
    if (folderCopyTap === 1) {
      navigator.clipboard.writeText(`✦ ${folder.name}`);
      toast('✦ Name copied', { icon: '📋', description: 'Tap again for full content' });
      setFolderCopyTap(2);
    } else if (folderCopyTap === 2) {
      const lines = [`✦ ${folder.name}`];
      if (folder.description) lines.push(`  ◆ ${folder.description}`);
      subjects.forEach(s => {
        lines.push(`  ◆ ${s.shortName} — ${s.units.length} units`);
      });
      lines.push(`  ◆ ${stats.done}/${stats.total} topics · ${stats.pct}%`);
      navigator.clipboard.writeText(lines.join('\n'));
      toast('◆ Full content copied', { icon: '✨', description: 'Tap to reset' });
      setFolderCopyTap(3);
    } else {
      setFolderCopyTap(1);
      toast('↺ Copy reset', { icon: '🔄' });
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01, y: -2 }}
        whileTap={{ scale: 0.98 }}
        className="rounded-2xl overflow-hidden cursor-pointer border border-border/15 backdrop-blur-xl bg-card/40 shadow-sm hover:shadow-lg hover:shadow-primary/5 transition-shadow duration-300"
        onClick={onOpen}
      >
        {/* Hero Banner */}
        <div className="relative h-32 overflow-hidden">
          {hasCover ? (
            <img src={folder.coverImage} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" style={{
              background: `linear-gradient(135deg, ${folder.color}30 0%, ${folder.color}15 40%, hsl(var(--card)) 100%)`,
            }}>
              <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: `radial-gradient(circle at 20% 50%, ${folder.color} 1px, transparent 1px), radial-gradient(circle at 80% 30%, ${folder.color} 1px, transparent 1px)`,
                backgroundSize: '40px 40px',
              }} />
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-muted-foreground/30">
                <ImagePlus className="w-4 h-4" />
                <span className="text-[9px] font-semibold">Add Cover</span>
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />

          {/* Overlaid content */}
          <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end gap-3">
            <div className={`${(folder.iconSize === 'sm' ? 'w-8 h-8' : folder.iconSize === 'lg' ? 'w-12 h-12' : 'w-10 h-10')} ${folder.iconShape === 'circle' ? 'rounded-full' : 'rounded-xl'} flex items-center justify-center text-xl shrink-0 backdrop-blur-md border border-white/10 shadow-lg overflow-hidden`}
              style={{ backgroundColor: folder.color + '30' }}>
              {folder.icon?.startsWith('http') ? (
                <img src={folder.icon} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl">{folder.icon || '📁'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate drop-shadow-sm hover:text-primary transition-colors cursor-pointer" onClick={e => { e.stopPropagation(); onOpen(); }}>{folder.name}</p>
              {folder.description && (
                <p className="text-[9px] text-foreground/60 truncate mt-0.5">{folder.description}</p>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-foreground/70 font-semibold">
                  {subjects.length} subject{subjects.length !== 1 ? 's' : ''} · {stats.total} topics · {stats.pct}%
                </span>
                {lastStudiedLabel && (
                  <span className="text-[9px] text-primary/70 font-semibold">· {lastStudiedLabel}</span>
                )}
              </div>
            </div>
            {/* Overall progress ring */}
            {stats.total > 0 && (
              <div className="relative w-11 h-11 shrink-0">
                <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(var(--muted) / 0.15)" strokeWidth="3.5" />
                  <circle cx="22" cy="22" r="18" fill="none" stroke={stats.pct >= 100 ? 'hsl(var(--secondary))' : folder.color} strokeWidth="3.5" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 18}`} strokeDashoffset={`${2 * Math.PI * 18 * (1 - stats.pct / 100)}`}
                    style={{ transition: 'stroke-dashoffset 0.8s ease-out', filter: stats.pct >= 100 ? 'drop-shadow(0 0 6px hsl(var(--secondary) / 0.5))' : `drop-shadow(0 0 4px ${folder.color}40)` }} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black font-mono text-foreground">
                  {stats.pct}%
                </span>
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <button className="relative w-8 h-8 shrink-0 backdrop-blur-md bg-background/30 rounded-lg border border-white/10 group/trigger hover:opacity-80 transition-opacity">
                  <svg viewBox="0 0 28 28" className="absolute inset-0 w-full h-full -rotate-90">
                    <circle cx="14" cy="14" r="11.5" fill="none" stroke="hsl(var(--muted) / 0.12)" strokeWidth="2" />
                    <circle cx="14" cy="14" r="11.5" fill="none" stroke={folder.color} strokeWidth="2" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 11.5}`} strokeDashoffset={`${2 * Math.PI * 11.5 * (1 - stats.pct / 100)}`}
                      style={{ transition: 'stroke-dashoffset 0.6s ease-out', opacity: 0.7 }} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center">
                    <MoreVertical className="w-3.5 h-3.5 text-foreground/80 group-hover/trigger:text-foreground transition-colors" />
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 z-[85]">
                {/* Header with folder info + copy link */}
                <div className="px-2 py-1.5 border-b border-border/20 mb-1">
                  <div className="flex items-center gap-2">
                    {hasCover && (
                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-border/20 shrink-0">
                        <img src={folder.coverImage} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {folder.icon?.startsWith('http') ? (
                          <img src={folder.icon} alt="" className="w-5 h-5 rounded object-cover" />
                        ) : (
                          <span className="text-sm">{folder.icon || '📁'}</span>
                        )}
                        <span className="text-[11px] font-bold text-foreground truncate">{folder.name}</span>
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground">{stats.pct}% complete</span>
                    </div>
                    <button
                      onClick={handleCopyCoverLink}
                      className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center hover:bg-muted/30 transition-colors"
                      title="Copy link"
                    >
                      <Copy className={`w-3.5 h-3.5 transition-all ${folderCopyTap === 2 ? 'text-primary animate-pulse' : folderCopyTap === 3 ? 'text-secondary' : 'text-muted-foreground'}`} />
                    </button>
                  </div>
                </div>

                <DropdownMenuItem onClick={e => { e.stopPropagation(); onOpen(); }} className="gap-2 text-sm font-medium">
                  <FolderOpen className="w-4 h-4" /> Open
                </DropdownMenuItem>
                <DropdownMenuItem onClick={e => { e.stopPropagation(); onEdit(); }} className="gap-2 text-sm font-medium">
                  <Pencil className="w-4 h-4" /> Edit Folder
                </DropdownMenuItem>
                {onDuplicate && (
                  <DropdownMenuItem onClick={e => { e.stopPropagation(); onDuplicate(); }} className="gap-2 text-sm font-medium">
                    <Copy className="w-4 h-4" /> Duplicate Folder
                  </DropdownMenuItem>
                )}
                {onExport && (
                  <DropdownMenuItem onClick={e => { e.stopPropagation(); onExport(); }} className="gap-2 text-sm font-medium">
                    <FileText className="w-4 h-4" /> Export Summary
                  </DropdownMenuItem>
                )}
                {onMoveAllOut && subjects.length > 0 && (
                  <DropdownMenuItem onClick={e => { e.stopPropagation(); onMoveAllOut(); }} className="gap-2 text-sm font-medium">
                    <FolderOutput className="w-4 h-4" /> Move All to Root
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={e => { e.stopPropagation(); setDeleteOpen(true); }} className="gap-2 text-sm font-medium text-destructive">
                  <Trash2 className="w-4 h-4" /> Delete Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ═══ BOTTOM SECTION — Premium Analytics ═══ */}
        {stats.total > 0 && (
          <div className="px-3 py-2.5 space-y-2">
            {/* Always-visible overall progress bar */}
            <div className="space-y-1">
              <div className="h-1.5 rounded-full overflow-hidden bg-muted/20">
                <motion.div className="h-full rounded-full" style={{ backgroundColor: stats.pct >= 100 ? 'hsl(var(--secondary))' : folder.color }}
                  initial={{ width: 0 }} animate={{ width: `${stats.pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-muted-foreground">{stats.done}/{stats.total} topics</span>
                <span className="text-[9px] font-bold" style={{ color: stats.pct >= 100 ? 'hsl(var(--secondary))' : folder.color }}>{stats.pct}% complete</span>
              </div>
            </div>

            {/* Inline per-subject completion rings */}
            {subjects.length > 0 && (
              <div className="flex items-center gap-2.5 flex-wrap">
                {perSubject.slice(0, 5).map(s => (
                  <div key={s.id} className="flex items-center gap-1.5" title={`${s.name}: ${s.pct}%`}>
                    <div className="relative w-7 h-7 shrink-0">
                      <svg viewBox="0 0 28 28" className="w-full h-full -rotate-90">
                        <circle cx="14" cy="14" r="10.5" fill="none" stroke="hsl(var(--muted) / 0.15)" strokeWidth="2.5" />
                        <circle cx="14" cy="14" r="10.5" fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 10.5}`} strokeDashoffset={`${2 * Math.PI * 10.5 * (1 - s.pct / 100)}`}
                          style={{ transition: 'stroke-dashoffset 0.5s ease-out', filter: `drop-shadow(0 0 3px ${s.color}40)` }} />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black font-mono" style={{ color: s.color }}>
                        {s.pct}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold text-muted-foreground truncate max-w-[50px]">{s.name}</span>
                  </div>
                ))}
                {subjects.length > 5 && (
                  <span className="text-[9px] font-bold text-muted-foreground">+{subjects.length - 5}</span>
                )}
              </div>
            )}

            {/* Difficulty bar + quick stats */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[80px] h-1.5 rounded-full overflow-hidden flex bg-muted/20">
                <div className="h-full bg-diff-easy" style={{ width: `${(stats.easy / stats.total) * 100}%` }} />
                <div className="h-full bg-diff-medium" style={{ width: `${(stats.med / stats.total) * 100}%` }} />
                <div className="h-full bg-diff-hard" style={{ width: `${(stats.hard / stats.total) * 100}%` }} />
              </div>
              {stats.imp > 0 && (
                <span className="text-[9px] text-chart-4 font-bold flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5 fill-chart-4" />{stats.impDone}/{stats.imp}
                </span>
              )}
              {stats.time > 0 && (
                <span className="text-[9px] text-muted-foreground font-semibold flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />{fmtTime(stats.time)}
                </span>
              )}
            </div>

            {/* Analytics Toggle */}
            <button
              onClick={e => { e.stopPropagation(); setAnalyticsOpen(p => !p); }}
              className="w-full flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-muted/15 transition-colors border border-border/10"
            >
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-bold text-foreground/70">Analytics</span>
              </div>
              {analyticsOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>

            {/* ═══ EXPANDED PREMIUM ANALYTICS ═══ */}
            <AnimatePresence>
              {analyticsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="space-y-3 pt-1">
                    <StatusFilterPills value={statusFilter} onChange={setStatusFilter} size="sm" counts={{
                      all: stats.total,
                      complete: stats.done,
                      in_process: (() => { let c = 0; subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => { if (t.status === 'in_process') c++; }))); return c; })(),
                      incomplete: stats.total - stats.done - (() => { let c = 0; subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => { if (t.status === 'in_process') c++; }))); return c; })(),
                      important: stats.imp,
                      focus: stats.imp - stats.impDone,
                    }} />
                    <div className="grid grid-cols-2 gap-2">
                      <MiniStat emoji="✅" label="Completed" value={`${stats.done}`} sub={`${stats.pct}% done`} cls="bg-secondary/8 border-secondary/15" />
                      <MiniStat emoji="📚" label="Remaining" value={`${stats.total - stats.done}`} sub={`${100 - stats.pct}% left`} cls="bg-muted/10 border-border/15" />
                      <MiniStat emoji="⭐" label="Important" value={`${stats.impDone}/${stats.imp}`} sub={stats.imp > 0 ? `${Math.round((stats.impDone / stats.imp) * 100)}%` : 'None'} cls="bg-chart-4/8 border-chart-4/15" />
                      <MiniStat emoji="⏱️" label="Time" value={fmtTime(stats.time)} sub={`${perSubject.filter(s => s.pct > 0).length} active`} cls="bg-primary/8 border-primary/15" />
                    </div>

                    {topSubject && topSubject.done > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/6 border border-secondary/12">
                          <Trophy className="w-4 h-4 text-secondary shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[8px] text-secondary/70 font-black uppercase tracking-wider">Top</p>
                            <p className="text-[10px] font-bold text-foreground truncate mt-0.5 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: topSubject.color }} />
                              {topSubject.name} · {topSubject.pct}%
                            </p>
                          </div>
                        </div>
                        {weakestSubject && weakestSubject.total > 0 && (
                          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-destructive/6 border border-destructive/12">
                            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[8px] text-destructive/70 font-black uppercase tracking-wider">Focus</p>
                              <p className="text-[10px] font-bold text-foreground truncate mt-0.5 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: weakestSubject.color }} />
                                {weakestSubject.name} · {weakestSubject.pct}%
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      {perSubject.map(s => (
                        <div key={s.id} className="flex items-center gap-2">
                          <div className="w-2 h-5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="text-[10px] font-bold text-foreground/80 truncate flex-1 min-w-0">{s.name}</span>
                          <div className="w-20 h-2 rounded-full bg-muted/20 overflow-hidden shrink-0">
                            <motion.div className="h-full rounded-full" style={{ backgroundColor: s.color, width: `${s.pct}%` }}
                              initial={{ width: 0 }} animate={{ width: `${s.pct}%` }} transition={{ duration: 0.5 }} />
                          </div>
                          <span className="text-[9px] font-mono font-bold text-muted-foreground w-[38px] text-right">{s.done}/{s.total}</span>
                          <span className="text-[9px] font-mono font-bold text-foreground w-[28px] text-right">{s.pct}%</span>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Easy', done: stats.easyDone, total: stats.easy, color: 'hsl(var(--diff-easy))' },
                        { label: 'Medium', done: stats.medDone, total: stats.med, color: 'hsl(var(--diff-medium))' },
                        { label: 'Hard', done: stats.hardDone, total: stats.hard, color: 'hsl(var(--diff-hard))' },
                      ].map(d => {
                        const pct = d.total > 0 ? Math.round((d.done / d.total) * 100) : 0;
                        return (
                          <div key={d.label} className="flex flex-col items-center py-2.5 rounded-xl border border-border/15 bg-card/30 gap-1.5">
                            <div className="relative w-10 h-10">
                              <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
                                <circle cx="20" cy="20" r="16" fill="none" stroke="hsl(var(--muted) / 0.2)" strokeWidth="3.5" />
                                <circle cx="20" cy="20" r="16" fill="none" stroke={d.color} strokeWidth="3.5" strokeLinecap="round"
                                  strokeDasharray={`${2 * Math.PI * 16}`}
                                  strokeDashoffset={`${2 * Math.PI * 16 * (1 - pct / 100)}`}
                                  style={{ transition: 'stroke-dashoffset 0.6s ease-out' }} />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[9px] font-black font-mono" style={{ color: d.color }}>{pct}%</span>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-foreground">{d.label}</span>
                            <span className="text-[8px] font-mono font-bold text-muted-foreground">{d.done}/{d.total}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-xl border border-border/10 bg-card/20 p-2.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-foreground/60 flex items-center gap-1">📈 7-Day Velocity</span>
                        <span className="text-[9px] font-bold text-primary">Avg: {velocity.avg}/day</span>
                      </div>
                      <div className="flex items-end gap-1 h-10">
                        {velocity.days.map((d, i) => {
                          const h = Math.max(6, (d / maxDay) * 100);
                          const isToday = i === 6;
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                              <motion.div
                                className={`w-full rounded-sm ${isToday ? 'bg-primary' : 'bg-primary/50'}`}
                                initial={{ height: 0 }} animate={{ height: `${h}%` }}
                                transition={{ delay: i * 0.04, duration: 0.3 }}
                                style={{ minHeight: d > 0 ? 4 : 2 }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[7px] font-bold text-muted-foreground/50">7d ago</span>
                        <span className="text-[7px] font-bold text-primary/60">Today</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-1 border-t border-border/10 font-semibold">
                      <span>Done: <strong className="text-foreground">{stats.done}/{stats.total}</strong></span>
                      {stats.imp > 0 && <span>⭐ <strong className="text-foreground">{stats.impDone}/{stats.imp}</strong></span>}
                      {stats.time > 0 && <span>⏱️ <strong className="text-secondary">{fmtTime(stats.time)}</strong></span>}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="glass-card bg-card/90 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{folder.name}&quot;? The {subjects.length} subject{subjects.length !== 1 ? 's' : ''} inside will be moved to root.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDelete(); setDeleteOpen(false); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MiniStat({ emoji, label, value, sub, cls }: { emoji: string; label: string; value: string; sub: string; cls: string }) {
  return (
    <div className={`rounded-xl border p-2.5 text-center ${cls}`}>
      <span className="text-base leading-none">{emoji}</span>
      <p className="text-sm font-black font-mono text-foreground leading-none mt-1">{value}</p>
      <p className="text-[8px] text-muted-foreground font-bold mt-0.5">{label}</p>
      <p className="text-[7px] text-muted-foreground/50 font-medium">{sub}</p>
    </div>
  );
}
