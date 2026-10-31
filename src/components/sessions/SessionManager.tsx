import { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Clock, Check, AlertCircle, ChevronDown, ChevronUp,
  Edit2, Trash2, Copy, ArrowRightLeft, Hash, StickyNote,
  Timer, Filter, Undo2, X, Star, Layers
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
import { formatStudyTime } from '../../lib/utils';
import BottomSheet from '../shared/BottomSheet';

/* ─── helpers ─── */
function formatTime12h(t: string | undefined): string {
  if (!t) return '';
  const [hRaw, mRaw] = t.replace(/\./g, ':').split(':').map(Number);
  const h = isNaN(hRaw) ? 0 : hRaw;
  const m = isNaN(mRaw) ? 0 : mRaw;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function extractActivity(desc: string | undefined): string | null {
  if (!desc) return null;
  const m = desc.match(/^\[([^\]]+)\]/);
  return m ? m[1] : null;
}

/* ─── types ─── */
export interface MergedSession {
  id: string;
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
  _activity?: string | null;
  _synced: boolean;
  _status: 'Complete' | 'Pending';
  loggedAt?: string;
  topicId?: string;
}

type FilterMode = 'all' | 'subject' | 'activity' | 'completed' | 'pending';

interface Props {
  selectedDate: string;
  subjects: Subject[];
  dailyLogs: DailyLog[];
  dbSessions?: DbStudySession[];
  onCreateSession?: (session: {
    date: string; minutes: number; description: string;
    type: 'Topic' | 'Unit' | 'Other'; subjectId?: string;
    subjectName?: string; startTime?: string; endTime?: string; note?: string;
  }) => void;
  onUpdateSession?: (sessionId: string, changes: Record<string, any>) => void;
  onDeleteSession?: (sessionId: string) => void;
  onUpdateLogs?: (logs: DailyLog[]) => void;
}

export default function SessionManager({
  selectedDate, subjects, dailyLogs, dbSessions,
  onCreateSession, onUpdateSession, onDeleteSession, onUpdateLogs,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [filterValue, setFilterValue] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<MergedSession | null>(null);
  const [moveSession, setMoveSession] = useState<MergedSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MergedSession | null>(null);
  const undoRef = useRef<{ session: MergedSession; timer: ReturnType<typeof setTimeout> } | null>(null);

  /* ── merge db + legacy sessions ── */
  const sessions = useMemo<MergedSession[]>(() => {
    const dbForDay = (dbSessions || []).filter(s => s.date === selectedDate);
    const dayLog = dailyLogs.find(l => l.date === selectedDate);
    const legacySessions = (dayLog?.sessions || []) as StudySession[];
    const dbIds = new Set(dbForDay.map(s => s.id));

    const merged: MergedSession[] = [
      ...dbForDay.map(s => ({
        id: s.id,
        subjectId: s.subjectId || 'general',
        subjectName: s.subjectName || s.description || 'Study',
        durationMinutes: s.minutes || 0,
        note: s.note || '',
        startTime: s.startTime || '',
        endTime: s.endTime || '',
        type: s.type || 'Other',
        description: s.description || '',
        _source: 'db' as const,
        _color: subjects.find(sub => sub.id === s.subjectId)?.color,
        _activity: extractActivity(s.description),
        _synced: !s.id.startsWith('temp-'),
        _status: (s.endTime || (s.minutes && s.minutes > 0)) ? 'Complete' as const : 'Pending' as const,
        loggedAt: s.loggedAt,
        topicId: s.topicId,
      })),
      ...legacySessions
        .filter(s => !dbIds.has(s.id))
        .map(s => ({
          id: s.id,
          subjectId: s.subjectId || 'general',
          subjectName: s.subjectName || 'Study',
          durationMinutes: s.durationMinutes || 0,
          note: s.note || '',
          startTime: s.startTime || '',
          endTime: s.endTime || '',
          type: 'Other' as const,
          description: s.note || s.subjectName || '',
          _source: 'legacy' as const,
          _color: subjects.find(sub => sub.id === s.subjectId)?.color,
          _activity: null,
          _synced: !s.id.startsWith('temp-'),
          _status: (s.endTime || (s.durationMinutes && s.durationMinutes > 0)) ? 'Complete' as const : 'Pending' as const,
        })),
    ];
    return merged;
  }, [dbSessions, dailyLogs, selectedDate, subjects]);

  /* ── derived stats ── */
  const totalMins = sessions.reduce((a, s) => a + s.durationMinutes, 0);
  const completedCount = sessions.filter(s => s._status === 'Complete').length;
  const pendingCount = sessions.filter(s => s._status === 'Pending').length;

  /* ── unique subjects & activities for filters ── */
  const uniqueSubjects = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color?: string }>();
    sessions.forEach(s => {
      if (!map.has(s.subjectId)) {
        map.set(s.subjectId, { id: s.subjectId, name: s.subjectName, color: s._color });
      }
    });
    return Array.from(map.values());
  }, [sessions]);

  const uniqueActivities = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach(s => { if (s._activity) set.add(s._activity); });
    return Array.from(set);
  }, [sessions]);

  /* ── filtering ── */
  const filtered = useMemo(() => {
    let list = sessions;
    // search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s =>
        s.subjectName.toLowerCase().includes(q) ||
        (s.note || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
      );
    }
    // filter
    if (filterMode === 'subject' && filterValue) {
      list = list.filter(s => s.subjectId === filterValue);
    } else if (filterMode === 'activity' && filterValue) {
      list = list.filter(s => s._activity === filterValue);
    } else if (filterMode === 'completed') {
      list = list.filter(s => s._status === 'Complete');
    } else if (filterMode === 'pending') {
      list = list.filter(s => s._status === 'Pending');
    }
    return list;
  }, [sessions, searchQuery, filterMode, filterValue]);

  /* ── actions ── */
  const handleDelete = useCallback((session: MergedSession) => {
    // store for undo
    if (undoRef.current) clearTimeout(undoRef.current.timer);

    const timer = setTimeout(() => { undoRef.current = null; }, 6000);
    undoRef.current = { session, timer };

    if (onDeleteSession) {
      onDeleteSession(session.id);
    } else if (onUpdateLogs) {
      const updated = dailyLogs.map(l => {
        if (l.date !== selectedDate) return l;
        const found = (l.sessions || []).find((s: any) => s.id === session.id);
        if (!found) return l;
        return {
          ...l,
          sessions: (l.sessions || []).filter((s: any) => s.id !== session.id),
          hoursStudied: Math.max(0, Math.round((l.hoursStudied - session.durationMinutes / 60) * 100) / 100),
        };
      });
      onUpdateLogs(updated);
    }

    toast('Session deleted', {
      action: { label: 'Undo', onClick: () => handleUndoDelete(session) },
      duration: 5000,
    });
    setDeleteTarget(null);
  }, [onDeleteSession, onUpdateLogs, dailyLogs, selectedDate]);

  const handleUndoDelete = useCallback((session: MergedSession) => {
    if (undoRef.current) { clearTimeout(undoRef.current.timer); undoRef.current = null; }
    if (onCreateSession) {
      onCreateSession({
        date: selectedDate,
        minutes: session.durationMinutes,
        description: session.description || session.note || session.subjectName,
        type: (session.type as any) || 'Other',
        subjectId: session.subjectId,
        subjectName: session.subjectName,
        startTime: session.startTime,
        endTime: session.endTime,
        note: session.note,
      });
    }
    toast.success('Session restored');
  }, [onCreateSession, selectedDate]);

  const handleDuplicate = useCallback((session: MergedSession) => {
    if (!onCreateSession) return;
    onCreateSession({
      date: selectedDate,
      minutes: session.durationMinutes,
      description: session.description || `[Copy] ${session.subjectName}`,
      type: (session.type as any) || 'Other',
      subjectId: session.subjectId,
      subjectName: session.subjectName,
      startTime: session.startTime,
      endTime: session.endTime,
      note: session.note ? `(copy) ${session.note}` : undefined,
    });
    toast.success('Session duplicated');
  }, [onCreateSession, selectedDate]);

  const handleMoveSubject = useCallback((session: MergedSession, newSubjectId: string) => {
    const sub = subjects.find(s => s.id === newSubjectId);
    if (!sub) return;
    if (onUpdateSession) {
      onUpdateSession(session.id, { subjectId: newSubjectId, subjectName: sub.shortName });
    }
    setMoveSession(null);
    toast.success(`Moved to ${sub.shortName}`);
  }, [onUpdateSession, subjects]);

  const handleSaveEdit = useCallback((updated: MergedSession) => {
    if (onUpdateSession) {
      onUpdateSession(updated.id, {
        minutes: updated.durationMinutes,
        subjectId: updated.subjectId,
        subjectName: updated.subjectName,
        description: updated.description,
        startTime: updated.startTime,
        endTime: updated.endTime,
        note: updated.note,
      });
    }
    setEditingSession(null);
    toast.success('Session updated');
  }, [onUpdateSession]);

  const setFilter = (mode: FilterMode, val = '') => {
    if (filterMode === mode && filterValue === val) { setFilterMode('all'); setFilterValue(''); }
    else { setFilterMode(mode); setFilterValue(val); }
  };

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl overflow-hidden border border-border/20 shadow-lg">
        <SectionHeader count={0} totalMins={0} completed={0} pending={0} />
        <div className="bg-card/20 py-8 text-center">
          <Timer className="w-7 h-7 text-muted-foreground/15 mx-auto mb-2" />
          <p className="text-[11px] text-muted-foreground/50 font-medium">No sessions logged for this day</p>
          <p className="text-[9px] text-muted-foreground/30 mt-1">Add study time below to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-border/20 shadow-lg">
      {/* ── Summary Header ── */}
      <SectionHeader count={sessions.length} totalMins={totalMins} completed={completedCount} pending={pendingCount} />

      <div className="bg-card/20 backdrop-blur-sm">
        {/* ── Search ── */}
        <div className="px-3 pt-2.5 pb-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search sessions…"
              className="h-8 pl-8 text-[11px] bg-card/40 border-border/15 rounded-xl"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5">
                <X className="w-3 h-3 text-muted-foreground/40" />
              </button>
            )}
          </div>
        </div>

        {/* ── Filter Pills ── */}
        <div className="px-3 pt-1.5 pb-2 flex gap-1.5 flex-wrap">
          <FilterPill active={filterMode === 'all'} onClick={() => setFilter('all')} label="All" count={sessions.length} />
          {uniqueSubjects.map(s => (
            <FilterPill
              key={s.id}
              active={filterMode === 'subject' && filterValue === s.id}
              onClick={() => setFilter('subject', s.id)}
              label={s.name}
              color={s.color}
              count={sessions.filter(x => x.subjectId === s.id).length}
            />
          ))}
          {uniqueActivities.map(a => (
            <FilterPill
              key={a}
              active={filterMode === 'activity' && filterValue === a}
              onClick={() => setFilter('activity', a)}
              label={a}
              icon={<Layers className="w-2.5 h-2.5" />}
              count={sessions.filter(x => x._activity === a).length}
            />
          ))}
          {completedCount > 0 && (
            <FilterPill active={filterMode === 'completed'} onClick={() => setFilter('completed')} label="Complete" count={completedCount}
              icon={<Check className="w-2.5 h-2.5" />} />
          )}
          {pendingCount > 0 && (
            <FilterPill active={filterMode === 'pending'} onClick={() => setFilter('pending')} label="Pending" count={pendingCount}
              icon={<AlertCircle className="w-2.5 h-2.5" />} />
          )}
        </div>

        {/* ── Session List ── */}
        <div className="px-2.5 pb-2.5 space-y-1.5 max-h-[420px] overflow-y-auto">
          <AnimatePresence initial={false}>
            {filtered.map((session, idx) => (
              <SessionRow
                key={session.id}
                session={session}
                index={idx}
                expanded={expandedId === session.id}
                onToggleExpand={() => setExpandedId(expandedId === session.id ? null : session.id)}
                onEdit={() => setEditingSession(session)}
                onDelete={() => setDeleteTarget(session)}
                onDuplicate={() => handleDuplicate(session)}
                onMove={() => setMoveSession(session)}
                subjects={subjects}
              />
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <div className="py-6 text-center">
              <Filter className="w-5 h-5 text-muted-foreground/15 mx-auto mb-1.5" />
              <p className="text-[10px] text-muted-foreground/40">No sessions match your filter</p>
            </div>
          )}
        </div>

        {/* ── Footer total ── */}
        {filtered.length > 0 && (
          <div className="mx-2.5 mb-2.5 flex items-center justify-between px-3 py-2 rounded-xl bg-secondary/5 border border-secondary/10">
            <span className="text-[10px] font-bold text-muted-foreground">
              {filtered.length === sessions.length ? 'Total' : `${filtered.length} of ${sessions.length}`}
            </span>
            <span className="text-[11px] font-black font-mono text-secondary">
              {formatStudyTime(filtered.reduce((a, s) => a + s.durationMinutes, 0))}
            </span>
          </div>
        )}
      </div>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-xs rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete session?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will remove <strong>{deleteTarget?.subjectName}</strong> ({formatStudyTime(deleteTarget?.durationMinutes || 0)}) from your log. You can undo this action.
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

      {/* ── Move Subject Sheet ── */}
      {moveSession && (
        <BottomSheet open={true} onClose={() => setMoveSession(null)} title="Move to Subject">
          <div className="space-y-2 pt-2">
            <p className="text-[10px] text-muted-foreground mb-3">
              Move <strong>{moveSession.subjectName}</strong> ({formatStudyTime(moveSession.durationMinutes)}) to:
            </p>
            {subjects.map(s => (
              <button key={s.id} onClick={() => handleMoveSubject(moveSession, s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all active:scale-[0.98] ${
                  s.id === moveSession.subjectId
                    ? 'bg-primary/10 border-primary/25 ring-1 ring-primary/20'
                    : 'bg-card/40 border-border/10 hover:bg-card/60'
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

/* ═══════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════ */

function SectionHeader({ count, totalMins, completed, pending }: {
  count: number; totalMins: number; completed: number; pending: number;
}) {
  return (
    <div className="relative px-3.5 py-2.5 bg-gradient-to-r from-secondary/12 via-primary/6 to-accent/4 border-b border-border/10">
      <div className="relative flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-secondary/15 border border-secondary/20 flex items-center justify-center">
          <Timer className="w-3.5 h-3.5 text-secondary" />
        </div>
        <span className="text-[11px] font-bold text-foreground uppercase tracking-wide flex-1">Session Manager</span>
        {count > 0 && (
          <div className="flex items-center gap-1.5">
            {completed > 0 && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-chart-5/15 border border-chart-5/20 text-chart-5 flex items-center gap-0.5">
                <Check className="w-2.5 h-2.5" /> {completed}
              </span>
            )}
            {pending > 0 && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-chart-4/15 border border-chart-4/20 text-chart-4 flex items-center gap-0.5">
                <AlertCircle className="w-2.5 h-2.5" /> {pending}
              </span>
            )}
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-card/60 border border-border/15 font-mono text-secondary">
              {count} · {formatStudyTime(totalMins)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, label, count, color, icon }: {
  active: boolean; onClick: () => void; label: string; count?: number; color?: string; icon?: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`text-[8px] font-bold px-2 py-1 rounded-full border transition-all flex items-center gap-1 active:scale-95 ${
        active
          ? 'bg-primary/15 border-primary/25 text-primary shadow-[0_0_6px_hsl(var(--primary)/0.15)]'
          : 'bg-card/30 border-border/15 text-muted-foreground/60 hover:border-border/30'
      }`}>
      {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      {icon}
      <span className="truncate max-w-[60px]">{label}</span>
      {count !== undefined && <span className="opacity-60">{count}</span>}
    </button>
  );
}

function SessionRow({ session, index, expanded, onToggleExpand, onEdit, onDelete, onDuplicate, onMove, subjects }: {
  session: MergedSession; index: number; expanded: boolean;
  onToggleExpand: () => void; onEdit: () => void; onDelete: () => void;
  onDuplicate: () => void; onMove: () => void; subjects: Subject[];
}) {
  const activity = session._activity || (session.type !== 'Other' ? session.type : null);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, height: 0 }}
      transition={{ delay: index * 0.03 }}
      className="rounded-xl bg-card/40 border border-border/10 hover:bg-card/60 hover:border-border/20 transition-all overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: session._color || 'hsl(var(--primary))' }}
    >
      {/* Main row */}
      <button onClick={onToggleExpand} className="w-full flex items-center gap-2 px-3 py-2.5 text-left group">
        {/* Subject dot + name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: session._color || 'hsl(var(--primary))' }} />
            <span className="text-[11px] font-bold text-foreground truncate group-hover:text-primary transition-colors">
              {session.subjectName}
            </span>
            {/* Activity badge */}
            {activity && (
              <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-md bg-accent/10 border border-accent/15 text-accent shrink-0">
                {activity}
              </span>
            )}
          </div>
          {session.note && !expanded && (
            <p className="text-[9px] text-muted-foreground/50 truncate mt-0.5 ml-3.5">{session.note}</p>
          )}
        </div>

        {/* Start time */}
        {session.startTime && (
          <span className="text-[9px] font-mono text-muted-foreground/40 shrink-0">{formatTime12h(session.startTime.slice(0, 5))}</span>
        )}

        {/* Duration */}
        <span className="text-[10px] font-black font-mono text-secondary bg-secondary/10 border border-secondary/12 px-2 py-0.5 rounded-lg shrink-0">
          {formatStudyTime(session.durationMinutes)}
        </span>

        {/* Status indicator */}
        {session._status === 'Complete' ? (
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-md bg-chart-5/12 border border-chart-5/15 text-chart-5 shrink-0">✓</span>
        ) : (
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-md bg-chart-4/12 border border-chart-4/15 text-chart-4 shrink-0">⏳</span>
        )}

        {/* Expand arrow */}
        {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground/30 shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/30 shrink-0" />}
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0 space-y-2.5">
              {/* Detail grid */}
              <div className="grid grid-cols-2 gap-1.5">
                <DetailCell icon={<Clock className="w-3 h-3" />} label="Start" value={session.startTime ? formatTime12h(session.startTime.slice(0, 5)) : '—'} />
                <DetailCell icon={<Clock className="w-3 h-3" />} label="End" value={session.endTime ? formatTime12h(session.endTime.slice(0, 5)) : '—'} />
                <DetailCell icon={<Timer className="w-3 h-3" />} label="Duration" value={formatStudyTime(session.durationMinutes)} />
                <DetailCell icon={<Star className="w-3 h-3" />} label="Subject" value={session.subjectName} />
                <DetailCell icon={session._status === 'Complete' ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  label="Status" value={session._status === 'Complete' ? '✓ Complete' : '⏳ Pending'} />
                <DetailCell icon={<Layers className="w-3 h-3" />} label="Activity" value={session._activity || (session.type && session.type !== 'Other' ? session.type : 'Self-Study')} />
              </div>

              {/* Notes */}
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

              {/* Actions */}
              <div className="flex items-center gap-1.5 pt-1">
                <ActionBtn icon={<Edit2 className="w-3 h-3" />} label="Edit" onClick={onEdit} color="text-primary" />
                <ActionBtn icon={<Copy className="w-3 h-3" />} label="Duplicate" onClick={onDuplicate} color="text-accent" />
                <ActionBtn icon={<ArrowRightLeft className="w-3 h-3" />} label="Move" onClick={onMove} color="text-chart-4" />
                <div className="flex-1" />
                <ActionBtn icon={<Trash2 className="w-3 h-3" />} label="Delete" onClick={onDelete} color="text-destructive" destructive />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DetailCell({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-muted/5 border border-border/5">
      <span className="text-muted-foreground/30">{icon}</span>
      <div className="min-w-0">
        <p className="text-[7px] font-bold text-muted-foreground/40 uppercase tracking-widest">{label}</p>
        <p className={`text-[10px] font-semibold text-foreground/70 truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, onClick, color, destructive }: {
  icon: React.ReactNode; label: string; onClick: () => void; color: string; destructive?: boolean;
}) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }}
      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9px] font-bold transition-all active:scale-95 border ${
        destructive
          ? 'bg-destructive/5 border-destructive/10 text-destructive/60 hover:bg-destructive/10 hover:text-destructive'
          : `bg-card/40 border-border/10 ${color}/60 hover:bg-card/60`
      }`}>
      {icon} {label}
    </button>
  );
}

/* ── Edit Sheet ── */
function EditSheet({ session, subjects, onSave, onClose }: {
  session: MergedSession; subjects: Subject[];
  onSave: (s: MergedSession) => void; onClose: () => void;
}) {
  const ACTIVITIES = ['Self-Study', 'Seminar', 'Revision', 'Lecture', 'Practice', 'Other'];
  const [subId, setSubId] = useState(session.subjectId || 'general');
  const [activity, setActivity] = useState(session._activity || 'Self-Study');
  const [startTime, setStartTime] = useState(session.startTime?.slice(0, 5) || '09:00');
  const [endTime, setEndTime] = useState(session.endTime?.slice(0, 5) || '');
  const [durMins, setDurMins] = useState(session.durationMinutes || 30);
  const [note, setNote] = useState(session.note || '');

  const handleSave = () => {
    const sub = subjects.find(s => s.id === subId);
    const desc = `[${activity}] ${sub?.shortName || session.subjectName}`;
    const hasEnd = !!endTime;
    onSave({
      ...session,
      subjectId: subId,
      subjectName: sub?.shortName || session.subjectName,
      durationMinutes: durMins,
      description: desc,
      _activity: activity,
      _status: (hasEnd || durMins > 0) ? 'Complete' : 'Pending',
      startTime,
      endTime: endTime || undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <BottomSheet open={true} onClose={onClose} title="✏️ Edit Session">
      <div className="space-y-4 pt-2">
        <div>
          <p className="text-xs text-muted-foreground mb-2">Subject</p>
          <select value={subId} onChange={e => setSubId(e.target.value)}
            className="w-full h-9 text-xs rounded-xl border border-border bg-card px-3">
            <option value="general">General</option>
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
                }`}>
                {m >= 60 ? `${m / 60}h` : `${m}m`}
              </button>
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
        <Button onClick={handleSave} className="w-full h-10 text-sm font-semibold gap-2 rounded-xl">
          <Check className="w-4 h-4" /> Update Session
        </Button>
      </div>
    </BottomSheet>
  );
}
