import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Trash2, Pencil, Check, X, ChevronDown, ListChecks } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import type { Subject, DbStudySession } from '../../types';
import { getLocalDateStr, formatStudyTime, formatTime12h, normalizeSubjectId } from '../../lib/utils';

interface Props {
  subjects: Subject[];
  dbSessions: DbStudySession[];
  onUpdateSession?: (sessionId: string, changes: Partial<DbStudySession>) => void;
  onDeleteSession?: (sessionId: string) => void;
}

const TYPE_BADGE: Record<string, { label: string; emoji: string; color: string }> = {
  Topic: { label: 'Topic', emoji: '📖', color: 'bg-primary/10 text-primary border-primary/20' },
  Unit: { label: 'Unit', emoji: '📁', color: 'bg-secondary/10 text-secondary border-secondary/20' },
  Other: { label: 'Session', emoji: '⏱️', color: 'bg-accent/10 text-accent border-accent/20' },
};

/** Parse activity type from description like "[Practice] O&G" */
function parseActivityType(desc: string): string {
  const m = desc.match(/^\[([^\]]+)\]/);
  return m ? m[1] : '';
}

const ACTIVITY_COLORS: Record<string, string> = {
  'Self-Study': 'bg-primary/10 text-primary border-primary/15',
  Lecture: 'bg-blue-500/10 text-blue-600 border-blue-500/15',
  Video: 'bg-purple-500/10 text-purple-600 border-purple-500/15',
  Seminar: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/15',
  Revision: 'bg-amber-500/10 text-amber-600 border-amber-500/15',
  Practice: 'bg-secondary/10 text-secondary border-secondary/15',
  Pomodoro: 'bg-chart-4/10 text-chart-4 border-chart-4/15',
};

export default function TodaySessions({ subjects, dbSessions, onUpdateSession, onDeleteSession }: Props) {
  const today = getLocalDateStr();
  const [expanded, setExpanded] = useState(true);

  const todaySessions = useMemo(() =>
    dbSessions
      .filter(s => s.date === today)
      .sort((a, b) => (b.loggedAt || b.startTime || '').localeCompare(a.loggedAt || a.startTime || '')),
    [dbSessions, today]
  );

  const totalMins = useMemo(() => todaySessions.reduce((a, s) => a + (s.minutes || 0), 0), [todaySessions]);

  const subjectMap = useMemo(() => {
    const m = new Map<string, { color: string; shortName: string }>();
    subjects.forEach(s => m.set(s.id, { color: s.color, shortName: s.shortName }));
    return m;
  }, [subjects]);

  // Per-subject breakdown — uses normalizeSubjectId for consistent "Other" handling
  const subjectBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    todaySessions.forEach(s => {
      const key = normalizeSubjectId(s.subjectId) || '_other_';
      map.set(key, (map.get(key) || 0) + (s.minutes || 0));
    });
    return Array.from(map.entries())
      .map(([id, mins]) => {
        if (id === '_other_') {
          return { id, name: 'Other', color: 'hsl(var(--muted-foreground))', mins };
        }
        const sub = subjectMap.get(id);
        return { id, name: sub?.shortName || 'Other', color: sub?.color || 'hsl(var(--muted-foreground))', mins };
      })
      .sort((a, b) => b.mins - a.mins);
  }, [todaySessions, subjectMap]);

  if (todaySessions.length === 0) return null;

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-card/30 transition-colors active:scale-[0.998]"
      >
        <div className="w-8 h-8 rounded-xl bg-secondary/10 border border-secondary/15 flex items-center justify-center shrink-0">
          <ListChecks className="w-4 h-4 text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-foreground leading-tight">Today's Sessions</h2>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
            {todaySessions.length} session{todaySessions.length !== 1 ? 's' : ''} · {formatStudyTime(totalMins)}
            {subjectBreakdown.length > 1 && (
              <span className="ml-1.5">
                ({subjectBreakdown.map(s => `${s.name} ${formatStudyTime(s.mins)}`).join(' · ')})
              </span>
            )}
          </p>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5">
              {/* Subject breakdown bar */}
              {subjectBreakdown.length > 0 && totalMins > 0 && (
                <div className="flex h-2 rounded-full overflow-hidden bg-muted/20 mb-2">
                  {subjectBreakdown.map(s => (
                    <motion.div
                      key={s.id}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{ backgroundColor: s.color, width: `${(s.mins / totalMins) * 100}%` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(s.mins / totalMins) * 100}%` }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      title={`${s.name}: ${formatStudyTime(s.mins)}`}
                    />
                  ))}
                </div>
              )}

              {/* Session cards */}
              {todaySessions.map((session, i) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  subjectInfo={subjectMap.get(session.subjectId)}
                  onUpdate={onUpdateSession}
                  onDelete={onDeleteSession}
                  index={i}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SessionCard({ session, subjectInfo, onUpdate, onDelete, index }: {
  session: DbStudySession;
  subjectInfo?: { color: string; shortName: string };
  onUpdate?: (id: string, changes: Partial<DbStudySession>) => void;
  onDelete?: (id: string) => void;
  index: number;
}) {
  const [editing, setEditing] = useState(false);
  const [editMins, setEditMins] = useState(String(session.minutes));

  const badge = TYPE_BADGE[session.type] || TYPE_BADGE.Other;
  const activityType = parseActivityType(session.description || '');
  const actColor = activityType ? (ACTIVITY_COLORS[activityType] || 'bg-muted/15 text-muted-foreground border-border/15') : '';

  const handleSave = useCallback(() => {
    const mins = parseInt(editMins, 10);
    if (isNaN(mins) || mins <= 0) return;
    onUpdate?.(session.id, { minutes: mins });
    setEditing(false);
  }, [editMins, session.id, onUpdate]);

  const handleCancel = useCallback(() => {
    setEditMins(String(session.minutes));
    setEditing(false);
  }, [session.minutes]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="flex items-center gap-2.5 p-2.5 rounded-xl bg-card/40 border border-border/10 hover:border-border/25 transition-all group"
    >
      {/* Subject color dot */}
      <div
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: subjectInfo?.color || 'hsl(var(--muted-foreground))', boxShadow: `0 0 6px ${subjectInfo?.color || 'transparent'}30` }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-foreground truncate">
            {subjectInfo?.shortName || session.subjectName || 'Study'}
          </span>
          {activityType ? (
            <span className={`text-[8px] px-1.5 py-0.5 rounded-md border font-bold shrink-0 ${actColor}`}>
              {activityType}
            </span>
          ) : (
            <span className={`text-[8px] px-1.5 py-0.5 rounded-md border font-bold shrink-0 ${badge.color}`}>
              {badge.emoji} {badge.label}
            </span>
          )}
        </div>
        {session.description && (
          <p className="text-[9px] text-muted-foreground truncate mt-0.5">{session.description}</p>
        )}
      </div>

      {/* Duration — editable */}
      {editing ? (
        <div className="flex items-center gap-1 shrink-0">
          <Input
            type="number"
            min={1}
            max={600}
            value={editMins}
            onChange={e => setEditMins(e.target.value)}
            className="w-16 h-7 text-xs text-center font-mono"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
          />
          <span className="text-[9px] text-muted-foreground">min</span>
          <button onClick={handleSave} className="w-6 h-6 rounded-lg bg-secondary/15 text-secondary flex items-center justify-center hover:bg-secondary/25 transition-colors">
            <Check className="w-3 h-3" />
          </button>
          <button onClick={handleCancel} className="w-6 h-6 rounded-lg bg-muted/15 text-muted-foreground flex items-center justify-center hover:bg-muted/25 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Time */}
          {session.startTime && (
            <span className="text-[9px] font-mono text-muted-foreground">
              {formatTime12h(session.startTime)}
            </span>
          )}
          {/* Duration */}
          <span className="text-xs font-black font-mono text-foreground px-1.5 py-0.5 rounded-lg bg-card/60">
            {formatStudyTime(session.minutes)}
          </span>

          {/* Edit button */}
          {onUpdate && (
            <button
              onClick={() => setEditing(true)}
              className="w-6 h-6 rounded-lg text-muted-foreground/30 hover:text-primary hover:bg-primary/10 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}

          {/* Delete button */}
          {onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="w-6 h-6 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-3 h-3" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete session?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove {formatStudyTime(session.minutes)} of study time from {session.subjectName || 'your records'}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(session.id)} className="bg-destructive text-destructive-foreground">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </motion.div>
  );
}
