import { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Clock, Check, AlertCircle, ChevronDown, ChevronUp,
  Edit2, Trash2, Copy, ArrowRightLeft, StickyNote,
  Timer, Filter, X, Layers, Plus, Star, CalendarDays
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from '@project/components/ui/alert-dialog';
import type { Subject, DbStudySession, DailyLog, StudySession } from '../../types';
import { formatStudyTime, getLocalDateStr } from '../../lib/utils';
import BottomSheet from '../shared/BottomSheet';

/* ─── helpers ─── */
function fmt12h(t: string | undefined): string {
  if (!t) return '';
  const [hR, mR] = t.replace(/\./g, ':').split(':').map(Number);
  const h = isNaN(hR) ? 0 : hR, m = isNaN(mR) ? 0 : mR;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function extractAct(desc?: string): string | null {
  if (!desc) return null;
  const m = desc.match(/^\[([^\]]+)\]/);
  return m ? m[1] : null;
}

function dateLbl(dateStr: string): string {
  const today = getLocalDateStr();
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  if (dateStr === today) return 'Today';
  if (dateStr === getLocalDateStr(yd)) return 'Yesterday';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/* ─── types ─── */
interface MergedSession {
  id: string;
  date: string;
  subjectId: string;
  subjectName: string;
  durationMinutes: number;
  note?: string;
  startTime?: string;
  endTime?: string;
  type?: string;
  description?: string;
  _source: 'db' | 'legacy';
  _color?: string;
  _activity: string | null;
  _status: 'Complete' | 'Pending';
  loggedAt?: string;
}

type FilterMode = 'all' | 'subject' | 'activity' | 'completed' | 'pending';
const ACTIVITIES = ['Self-Study', 'Seminar', 'Revision', 'Lecture', 'Practice', 'Video', 'Quick Log', 'Other'];

interface Props {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  dbSessions?: DbStudySession[];
  activeDate: string;
  onCreateSession?: (session: { date: string; minutes: number; description: string; type: 'Topic' | 'Unit' | 'Other'; subjectId?: string; subjectName?: string; startTime?: string; endTime?: string; note?: string }) => void;
  onUpdateSession?: (sessionId: string, changes: Record<string, any>) => void;
  onDeleteSession?: (sessionId: string) => void;
  onUpdateLogs?: (logs: DailyLog[]) => void;
}

export default function AllSessionsManager({
  subjects, dailyLogs, dbSessions, activeDate,
  onCreateSession, onUpdateSession, onDeleteSession,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [filterValue, setFilterValue] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<MergedSession | null>(null);
  const [addingSession, setAddingSession] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MergedSession | null>(null);
  const [moveSession, setMoveSession] = useState<MergedSession | null>(null);
  const undoRef = useRef<{ timer: ReturnType<typeof setTimeout> } | null>(null);

  /* ── merge ALL sessions across all dates ── */
  const allSessions = useMemo<MergedSession[]>(() => {
    const dbAll = (dbSessions || []).map(s => ({
      id: s.id, date: s.date, subjectId: s.subjectId || '', subjectName: s.subjectName || s.description || 'Study',
      durationMinutes: s.minutes || 0, note: s.note || '', startTime: s.startTime || '', endTime: s.endTime || '',
      type: s.type || 'Other', description: s.description || '', _source: 'db' as const,
      _color: subjects.find(sub => sub.id === s.subjectId)?.color,
      _activity: extractAct(s.description),
      _status: (s.endTime || (s.minutes && s.minutes > 0)) ? 'Complete' as const : 'Pending' as const,
      loggedAt: s.loggedAt,
    }));
    const dbIds = new Set(dbAll.map(s => s.id));
    const legacy: MergedSession[] = [];
    dailyLogs.forEach(log => {
      (log.sessions || []).forEach((s: StudySession) => {
        if (dbIds.has(s.id)) return;
        legacy.push({
          id: s.id, date: log.date, subjectId: s.subjectId || '', subjectName: s.subjectName || 'Study',
          durationMinutes: s.durationMinutes || 0, note: s.note || '', startTime: s.startTime || '',
          endTime: s.endTime || '', type: 'Other', description: s.note || s.subjectName || '',
          _source: 'legacy', _color: subjects.find(sub => sub.id === s.subjectId)?.color,
          _activity: null, _status: (s.endTime || (s.durationMinutes && s.durationMinutes > 0)) ? 'Complete' : 'Pending',
        });
      });
    });
    return [...dbAll, ...legacy].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (a.startTime || '99:99').localeCompare(b.startTime || '99:99');
    });
  }, [dbSessions, dailyLogs, subjects]);

  /* ── derived ── */
  const totalMins = allSessions.reduce((a, s) => a + s.durationMinutes, 0);
  const completedCount = allSessions.filter(s => s._status === 'Complete').length;
  const pendingCount = allSessions.filter(s => s._status === 'Pending').length;

  const uniqueSubjects = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color?: string; count: number }>();
    allSessions.forEach(s => {
      if (!s.subjectId) return;
      const e = map.get(s.subjectId);
      if (e) e.count++; else map.set(s.subjectId, { id: s.subjectId, name: s.subjectName, color: s._color, count: 1 });
    });
    return Array.from(map.values());
  }, [allSessions]);

  const uniqueActivities = useMemo(() => {
    const map = new Map<string, number>();
    allSessions.forEach(s => {
      const act = s._activity || (s.type && s.type !== 'Other' ? s.type : null);
      if (act) map.set(act, (map.get(act) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [allSessions]);

  /* ── filtering ── */
  const filtered = useMemo(() => {
    let list = allSessions;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s =>
        s.subjectName.toLowerCase().includes(q) ||
        (s.note || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
      );
    }
    if (filterMode === 'subject' && filterValue) list = list.filter(s => s.subjectId === filterValue);
    else if (filterMode === 'activity' && filterValue) list = list.filter(s => (s._activity || s.type) === filterValue);
    else if (filterMode === 'completed') list = list.filter(s => s._status === 'Complete');
    else if (filterMode === 'pending') list = list.filter(s => s._status === 'Pending');
    return list;
  }, [allSessions, searchQuery, filterMode, filterValue]);

  /* ── group by date ── */
  const groupedByDate = useMemo(() => {
    const map = new Map<string, MergedSession[]>();
    filtered.forEach(s => { const arr = map.get(s.date) || []; arr.push(s); map.set(s.date, arr); });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const filteredMins = filtered.reduce((a, s) => a + s.durationMinutes, 0);

  /* ── CRUD actions ── */
  const handleDelete = useCallback((session: MergedSession) => {
    if (undoRef.current) clearTimeout(undoRef.current.timer);
    const timer = setTimeout(() => { undoRef.current = null; }, 6000);
    undoRef.current = { timer };
    if (onDeleteSession) onDeleteSession(session.id);
    toast('Session deleted', {
      action: { label: 'Undo', onClick: () => handleUndoDelete(session) },
      duration: 5000,
    });
    setDeleteTarget(null);
  }, [onDeleteSession]);

  const handleUndoDelete = useCallback((session: MergedSession) => {
    if (undoRef.current) { clearTimeout(undoRef.current.timer); undoRef.current = null; }
    if (onCreateSession) {
      onCreateSession({
        date: session.date, minutes: session.durationMinutes,
        description: session.description || session.note || session.subjectName,
        type: (session.type as any) || 'Other', subjectId: session.subjectId,
        subjectName: session.subjectName, startTime: session.startTime,
        endTime: session.endTime, note: session.note,
      });
    }
    toast.success('Session restored');
  }, [onCreateSession]);

  const handleDuplicate = useCallback((session: MergedSession) => {
    if (!onCreateSession) return;
    onCreateSession({
      date: session.date, minutes: session.durationMinutes,
      description: session.description || `[Copy] ${session.subjectName}`,
      type: (session.type as any) || 'Other', subjectId: session.subjectId,
      subjectName: session.subjectName, startTime: session.startTime,
      endTime: session.endTime, note: session.note ? `(copy) ${session.note}` : undefined,
    });
    toast.success('Session duplicated');
  }, [onCreateSession]);

  const handleMoveSubject = useCallback((session: MergedSession, newSubjectId: string) => {
    const sub = subjects.find(s => s.id === newSubjectId);
    if (!sub || !onUpdateSession) return;
    onUpdateSession(session.id, { subjectId: newSubjectId, subjectName: sub.shortName });
    setMoveSession(null);
    toast.success(`Moved to ${sub.shortName}`);
  }, [onUpdateSession, subjects]);

  const handleSaveEdit = useCallback((updated: MergedSession) => {
    if (onUpdateSession) {
      onUpdateSession(updated.id, {
        minutes: updated.durationMinutes, subjectId: updated.subjectId, subjectName: updated.subjectName,
        description: updated.description, startTime: updated.startTime, endTime: updated.endTime, note: updated.note,
      });
    }
    setEditingSession(null);
    toast.success('Session updated');
  }, [onUpdateSession]);

  const handleAddSession = useCallback((session: MergedSession) => {
    if (!onCreateSession) return;
    onCreateSession({
      date: session.date || activeDate, minutes: session.durationMinutes,
      description: session.description || session.subjectName,
      type: (session.type as any) || 'Other', subjectId: session.subjectId,
      subjectName: session.subjectName, startTime: session.startTime,
      endTime: session.endTime, note: session.note,
    });
    setAddingSession(false);
    toast.success(`Logged ${formatStudyTime(session.durationMinutes)}`);
  }, [onCreateSession, activeDate]);

  const toggleFilter = (mode: FilterMode, val = '') => {
    if (filterMode === mode && filterValue === val) { setFilterMode('all'); setFilterValue(''); }
    else { setFilterMode(mode); setFilterValue(val); }
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-border/20 shadow-lg">
      {/* ── Header ── */}
      <div className="relative px-3.5 py-2.5 bg-gradient-to-r from-secondary/12 via-primary/6 to-accent/4 border-b border-border/10">
        <div className="relative flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-secondary/15 border border-secondary/20 flex items-center justify-center">
            <Timer className="w-3.5 h-3.5 text-secondary" />
          </div>
          <span className="text-[11px] font-bold text-foreground uppercase tracking-wide flex-1">Session Manager</span>
          <button onClick={() => setAddingSession(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-primary/10 border border-primary/20 text-[9px] font-bold text-primary hover:bg-primary/15 transition-all active:scale-95">
            <Plus className="w-3 h-3" /> Add
          </button>
          {allSessions.length > 0 && (
            <div className="flex items-center gap-1.5">
              {completedCount > 0 && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-chart-5/15 border border-chart-5/20 text-chart-5 flex items-center gap-0.5">
                  <Check className="w-2.5 h-2.5" /> {completedCount}
                </span>
              )}
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-card/60 border border-border/15 font-mono text-secondary">
                {allSessions.length} · {formatStudyTime(totalMins)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-card/20 backdrop-blur-sm">
        {/* ── Search ── */}
        <div className="px-3 pt-2.5 pb-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search all sessions…" className="h-8 pl-8 text-[11px] bg-card/40 border-border/15 rounded-xl" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5">
                <X className="w-3 h-3 text-muted-foreground/40" />
              </button>
            )}
          </div>
        </div>

        {/* ── Filter Pills ── */}
        <div className="px-3 pt-1.5 pb-2 space-y-1.5">
          {/* All + Status row */}
          <div className="flex gap-1.5 flex-wrap">
            <FPill active={filterMode === 'all'} onClick={() => toggleFilter('all')} label="All" count={allSessions.length} />
            {completedCount > 0 && (
              <FPill active={filterMode === 'completed'} onClick={() => toggleFilter('completed')}
                label="Complete" count={completedCount} icon={<Check className="w-2.5 h-2.5" />} />
            )}
            {pendingCount > 0 && (
              <FPill active={filterMode === 'pending'} onClick={() => toggleFilter('pending')}
                label="Pending" count={pendingCount} icon={<AlertCircle className="w-2.5 h-2.5" />} />
            )}
          </div>

          {/* 📚 Subject filter group */}
          {uniqueSubjects.length > 0 && (
            <FilterGroup emoji="📚" title="Subject" defaultOpen={filterMode === 'subject'}>
              {uniqueSubjects.map(s => (
                <FPill key={s.id} active={filterMode === 'subject' && filterValue === s.id}
                  onClick={() => toggleFilter('subject', s.id)} label={s.name} color={s.color} count={s.count} />
              ))}
            </FilterGroup>
          )}

          {/* 🎯 Activity filter group */}
          {uniqueActivities.length > 0 && (
            <FilterGroup emoji="🎯" title="Activity" defaultOpen={filterMode === 'activity'}>
              {uniqueActivities.map(a => (
                <FPill key={a.name} active={filterMode === 'activity' && filterValue === a.name}
                  onClick={() => toggleFilter('activity', a.name)} label={a.name}
                  icon={<Layers className="w-2.5 h-2.5" />} count={a.count} />
              ))}
            </FilterGroup>
          )}
        </div>

        {/* ── Date-grouped session list ── */}
        <div className="max-h-[520px] overflow-y-auto">
          {groupedByDate.length > 0 ? (
            <div className="px-2.5 pb-2.5 space-y-0.5">
              {groupedByDate.map(([date, sessions]) => (
                <div key={date}>
                  <div className="flex items-center gap-2 px-1 pt-3 pb-1.5">
                    <CalendarDays className="w-3 h-3 text-muted-foreground/40" />
                    <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest flex-1">{dateLbl(date)}</span>
                    <span className="text-[8px] font-mono font-bold text-muted-foreground/40">
                      {sessions.length} · {formatStudyTime(sessions.reduce((a, s) => a + s.durationMinutes, 0))}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <AnimatePresence initial={false}>
                      {sessions.map((session, idx) => (
                        <SRow key={session.id} session={session} index={idx}
                          expanded={expandedId === session.id}
                          onToggle={() => setExpandedId(expandedId === session.id ? null : session.id)}
                          onEdit={() => setEditingSession(session)} onDelete={() => setDeleteTarget(session)}
                          onDuplicate={() => handleDuplicate(session)} onMove={() => setMoveSession(session)} />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
            </div>
          ) : allSessions.length === 0 ? (
            <div className="py-10 text-center">
              <Timer className="w-8 h-8 text-muted-foreground/15 mx-auto mb-2" />
              <p className="text-[11px] text-muted-foreground/50 font-medium">No sessions logged yet</p>
              <button onClick={() => setAddingSession(true)}
                className="mt-2 text-[10px] text-primary font-bold hover:underline">+ Add first session</button>
            </div>
          ) : (
            <div className="py-8 text-center">
              <Filter className="w-6 h-6 text-muted-foreground/15 mx-auto mb-1.5" />
              <p className="text-[10px] text-muted-foreground/40">No sessions match your filter</p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {filtered.length > 0 && (
          <div className="mx-2.5 mb-2.5 flex items-center justify-between px-3 py-2 rounded-xl bg-secondary/5 border border-secondary/10">
            <span className="text-[10px] font-bold text-muted-foreground">
              {filtered.length === allSessions.length ? 'Total' : `${filtered.length} of ${allSessions.length}`}
            </span>
            <span className="text-[11px] font-black font-mono text-secondary">{formatStudyTime(filteredMins)}</span>
          </div>
        )}
      </div>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-xs rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete session?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Remove <strong>{deleteTarget?.subjectName}</strong> ({formatStudyTime(deleteTarget?.durationMinutes || 0)}) from {dateLbl(deleteTarget?.date || '')}. You can undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8 rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="text-xs h-8 rounded-xl bg-destructive text-destructive-foreground"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Sheet ── */}
      {editingSession && (
        <EditSheet session={editingSession} subjects={subjects}
          onSave={handleSaveEdit} onClose={() => setEditingSession(null)} />
      )}

      {/* ── Add Sheet ── */}
      {addingSession && (
        <EditSheet
          session={{ id: '', date: activeDate, subjectId: '', subjectName: '', durationMinutes: 30, _source: 'db', _activity: 'Self-Study', _status: 'Pending' }}
          subjects={subjects} isAdd onSave={handleAddSession} onClose={() => setAddingSession(false)} />
      )}

      {/* ── Move Sheet ── */}
      {moveSession && (
        <BottomSheet open onClose={() => setMoveSession(null)} title="Move to Subject">
          <div className="space-y-2 pt-2">
            <p className="text-[10px] text-muted-foreground mb-3">
              Move <strong>{moveSession.subjectName}</strong> ({formatStudyTime(moveSession.durationMinutes)}) to:
            </p>
            {subjects.map(s => (
              <button key={s.id} onClick={() => handleMoveSubject(moveSession, s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all active:scale-[0.98] ${
                  s.id === moveSession.subjectId ? 'bg-primary/10 border-primary/25 ring-1 ring-primary/20' : 'bg-card/40 border-border/10 hover:bg-card/60'
                }`}>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-xs font-semibold text-foreground flex-1 text-left">{s.shortName}</span>
                {s.id === moveSession.subjectId && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════ */

function FPill({ active, onClick, label, count, color, icon }: {
  active: boolean; onClick: () => void; label: string; count?: number; color?: string; icon?: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`text-[8px] font-bold px-2 py-1 rounded-full border transition-all flex items-center gap-1 active:scale-95 ${
        active ? 'bg-primary/15 border-primary/25 text-primary shadow-[0_0_6px_hsl(var(--primary)/0.15)]'
               : 'bg-card/30 border-border/15 text-muted-foreground/60 hover:border-border/30'
      }`}>
      {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      {icon}
      <span className="truncate max-w-[60px]">{label}</span>
      {count !== undefined && <span className="opacity-60">{count}</span>}
    </button>
  );
}

function FilterGroup({ emoji, title, children, defaultOpen = false }: {
  emoji: string; title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/10 bg-card/20 overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-card/40 transition-colors">
        <span className="text-[10px]">{emoji}</span>
        <span className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-widest flex-1">{title}</span>
        {open ? <ChevronUp className="w-3 h-3 text-muted-foreground/30" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/30" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-2.5 pb-2 pt-0.5 flex gap-1.5 flex-wrap">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SRow({ session, index, expanded, onToggle, onEdit, onDelete, onDuplicate, onMove }: {
  session: MergedSession; index: number; expanded: boolean;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
  onDuplicate: () => void; onMove: () => void;
}) {
  const activity = session._activity || (session.type !== 'Other' ? session.type : null);
  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, height: 0 }} transition={{ delay: Math.min(index * 0.02, 0.15) }}
      className="rounded-xl bg-card/40 border border-border/10 hover:bg-card/60 hover:border-border/20 transition-all overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: session._color || 'hsl(var(--primary))' }}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2.5 text-left group">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: session._color || 'hsl(var(--primary))' }} />
            <span className="text-[11px] font-bold text-foreground truncate group-hover:text-primary transition-colors">{session.subjectName}</span>
            {activity && <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-md bg-accent/10 border border-accent/15 text-accent shrink-0">{activity}</span>}
          </div>
          {session.note && !expanded && <p className="text-[9px] text-muted-foreground/50 truncate mt-0.5 ml-3.5">{session.note}</p>}
        </div>
        {session.startTime && <span className="text-[9px] font-mono text-muted-foreground/40 shrink-0">{fmt12h(session.startTime.slice(0, 5))}</span>}
        <span className="text-[10px] font-black font-mono text-secondary bg-secondary/10 border border-secondary/12 px-2 py-0.5 rounded-lg shrink-0">
          {formatStudyTime(session.durationMinutes)}
        </span>
        {session._status === 'Complete'
          ? <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-md bg-chart-5/12 border border-chart-5/15 text-chart-5 shrink-0">✓</span>
          : <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-md bg-chart-4/12 border border-chart-4/15 text-chart-4 shrink-0">⏳</span>}
        {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground/30 shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/30 shrink-0" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-3 pb-3 pt-0 space-y-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                <DCell icon={<Clock className="w-3 h-3" />} label="Start" value={session.startTime ? fmt12h(session.startTime.slice(0, 5)) : '—'} />
                <DCell icon={<Clock className="w-3 h-3" />} label="End" value={session.endTime ? fmt12h(session.endTime.slice(0, 5)) : '—'} />
                <DCell icon={<Timer className="w-3 h-3" />} label="Duration" value={formatStudyTime(session.durationMinutes)} />
                <DCell icon={<Star className="w-3 h-3" />} label="Subject" value={session.subjectName || 'General'} />
                <DCell icon={session._status === 'Complete' ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  label="Status" value={session._status === 'Complete' ? '✓ Complete' : '⏳ Pending'} />
                <DCell icon={<Layers className="w-3 h-3" />} label="Activity"
                  value={session._activity || (session.type && session.type !== 'Other' ? session.type : 'Self-Study')} />
                <DCell icon={<CalendarDays className="w-3 h-3" />} label="Date" value={dateLbl(session.date)} />
              </div>
              {session.note && (
                <div className="px-2.5 py-2 rounded-lg bg-muted/10 border border-border/10">
                  <div className="flex items-center gap-1 mb-1">
                    <StickyNote className="w-3 h-3 text-muted-foreground/40" />
                    <span className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest">Notes</span>
                  </div>
                  <p className="text-[10px] text-foreground/70 leading-relaxed">{session.note}</p>
                </div>
              )}
              {session.loggedAt && (
                <p className="text-[8px] text-muted-foreground/30 text-right font-mono">
                  Logged: {new Date(session.loggedAt).toLocaleString()}
                </p>
              )}
              <div className="flex items-center gap-1.5 pt-1">
                <ABtn icon={<Edit2 className="w-3 h-3" />} label="Edit" onClick={onEdit} color="text-primary" />
                <ABtn icon={<Copy className="w-3 h-3" />} label="Duplicate" onClick={onDuplicate} color="text-accent" />
                <ABtn icon={<ArrowRightLeft className="w-3 h-3" />} label="Move" onClick={onMove} color="text-chart-4" />
                <div className="flex-1" />
                <ABtn icon={<Trash2 className="w-3 h-3" />} label="Delete" onClick={onDelete} color="text-destructive" destructive />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-muted/5 border border-border/5">
      <span className="text-muted-foreground/30">{icon}</span>
      <div className="min-w-0">
        <p className="text-[7px] font-bold text-muted-foreground/40 uppercase tracking-widest">{label}</p>
        <p className="text-[10px] font-semibold text-foreground/70 truncate">{value}</p>
      </div>
    </div>
  );
}

function ABtn({ icon, label, onClick, color, destructive }: {
  icon: React.ReactNode; label: string; onClick: () => void; color: string; destructive?: boolean;
}) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }}
      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9px] font-bold transition-all active:scale-95 border ${
        destructive ? 'bg-destructive/5 border-destructive/10 text-destructive/60 hover:bg-destructive/10 hover:text-destructive'
                    : `bg-card/40 border-border/10 ${color}/60 hover:bg-card/60`
      }`}>
      {icon} {label}
    </button>
  );
}

/* ── Edit / Add Sheet ── */
function EditSheet({ session, subjects, onSave, onClose, isAdd }: {
  session: MergedSession; subjects: Subject[];
  onSave: (s: MergedSession) => void; onClose: () => void; isAdd?: boolean;
}) {
  const [subId, setSubId] = useState(session.subjectId || '');
  const [activity, setActivity] = useState(session._activity || 'Self-Study');
  const [startTime, setStartTime] = useState(session.startTime?.slice(0, 5) || '09:00');
  const [endTime, setEndTime] = useState(session.endTime?.slice(0, 5) || '');
  const [durMins, setDurMins] = useState(session.durationMinutes || 30);
  const [note, setNote] = useState(session.note || '');
  const [date, setDate] = useState(session.date || getLocalDateStr());

  const save = () => {
    const sub = subjects.find(s => s.id === subId);
    const desc = `[${activity}] ${sub?.shortName || session.subjectName || 'Study'}`;
    onSave({
      ...session, date, subjectId: subId, subjectName: sub?.shortName || session.subjectName || 'Study',
      durationMinutes: durMins, description: desc, _activity: activity,
      _status: (endTime || durMins > 0) ? 'Complete' : 'Pending',
      startTime, endTime: endTime || undefined, note: note.trim() || undefined,
    });
  };

  return (
    <BottomSheet open onClose={onClose} title={isAdd ? '➕ Add Session' : '✏️ Edit Session'}>
      <div className="space-y-4 pt-2">
        {isAdd && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Date</p>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full h-9 text-xs rounded-xl border border-border bg-card px-3" />
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Subject</p>
          <select value={subId} onChange={e => setSubId(e.target.value)}
            className="w-full h-9 text-xs rounded-xl border border-border bg-card px-3">
            <option value="">General</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.shortName} — {s.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Activity</p>
          <div className="flex gap-1.5 flex-wrap">
            {ACTIVITIES.map(a => (
              <button key={a} onClick={() => setActivity(a)}
                className={`text-[10px] font-bold px-2.5 py-1.5 rounded-xl border transition-all ${
                  activity === a ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-card/30 border-border/15 text-muted-foreground'
                }`}>{a}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-2">Duration</p>
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => setDurMins(Math.max(5, durMins - 15))}
              className="w-10 h-10 rounded-xl bg-card/60 border border-border/20 flex items-center justify-center text-lg font-bold text-muted-foreground hover:bg-destructive/10 active:scale-90 transition-all">−</button>
            <span className="font-display-digit text-3xl font-black text-foreground min-w-[80px] text-center">
              {Math.floor(durMins / 60)}h {String(durMins % 60).padStart(2, '0')}m
            </span>
            <button onClick={() => setDurMins(durMins + 15)}
              className="w-10 h-10 rounded-xl bg-card/60 border border-border/20 flex items-center justify-center text-lg font-bold text-muted-foreground hover:bg-secondary/10 active:scale-90 transition-all">+</button>
          </div>
          <div className="flex justify-center gap-1.5 mt-2 flex-wrap">
            {[15, 30, 45, 60, 90, 120].map(m => (
              <button key={m} onClick={() => setDurMins(m)}
                className={`text-[9px] font-bold px-2.5 py-1 rounded-full border transition-all ${
                  durMins === m ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-card/30 border-border/15 text-muted-foreground'
                }`}>{m >= 60 ? `${m / 60}h` : `${m}m`}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Start</p>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full h-9 text-xs rounded-xl border border-border bg-card px-3" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">End</p>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="w-full h-9 text-xs rounded-xl border border-border bg-card px-3" />
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Notes</p>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Study notes…"
            className="w-full h-9 text-xs rounded-xl border border-border bg-card px-3" />
        </div>
        <Button onClick={save} className="w-full h-10 text-sm font-semibold gap-2 rounded-xl">
          <Check className="w-4 h-4" /> {isAdd ? 'Add Session' : 'Update Session'}
        </Button>
      </div>
    </BottomSheet>
  );
}
