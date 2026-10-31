import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Clock, Edit2, Check } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { toast } from 'sonner';
import type { StudySession, Subject } from '../../types';
import { formatStudyHours, formatStudyTime } from '../../lib/utils';
import GlowCard from '../shared/GlowCard';
import BottomSheet from '../shared/BottomSheet';
import SubjectLink from '../shared/SubjectLink';

interface Props {
  sessions: StudySession[];
  subjects: Subject[];
  onUpdate: (sessions: StudySession[]) => void;
  date: string;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
  /** New first-class session CRUD — when provided, bypasses blob-based onUpdate */
  onCreateSession?: (session: { date: string; minutes: number; description: string; type: 'Topic' | 'Unit' | 'Other'; subjectId?: string; subjectName?: string; startTime?: string; endTime?: string; note?: string }) => void;
  onUpdateSession?: (sessionId: string, changes: Record<string, any>) => void;
  onDeleteSession?: (sessionId: string) => void;
}

export default function SessionTimeline({ sessions, subjects, onUpdate, date, onNavigate, onCreateSession, onUpdateSession, onDeleteSession }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [editSession, setEditSession] = useState<StudySession | null>(null);

  const totalMinutes = sessions.reduce((a, s) => a + s.durationMinutes, 0);
  const totalHoursDisplay = formatStudyHours(totalMinutes / 60);

  const handleDelete = useCallback((id: string) => {
    if (onDeleteSession) {
      onDeleteSession(id);
    } else {
      onUpdate(sessions.filter(s => s.id !== id));
      toast.success('Session deleted');
    }
  }, [sessions, onUpdate, onDeleteSession]);

  const handleEditSave = useCallback((updated: StudySession) => {
    if (onUpdateSession) {
      onUpdateSession(updated.id, {
        minutes: updated.durationMinutes,
        description: updated.note || updated.subjectName,
        subjectId: updated.subjectId,
        subjectName: updated.subjectName,
        startTime: updated.startTime,
        endTime: updated.endTime,
        note: updated.note,
      });
    } else {
      onUpdate(
        sessions.map(s => s.id === updated.id ? updated : s)
          .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
      );
    }
    setEditSession(null);
    toast.success('Session updated');
  }, [sessions, onUpdate, onUpdateSession]);

  const handleAdd = useCallback((session: StudySession) => {
    if (onCreateSession) {
      const subject = subjects.find(s => s.id === session.subjectId);
      onCreateSession({
        date,
        minutes: session.durationMinutes,
        description: session.note || session.subjectName || 'Study Session',
        type: 'Other',
        subjectId: session.subjectId,
        subjectName: session.subjectName || subject?.shortName || '',
        startTime: session.startTime,
        endTime: session.endTime,
        note: session.note,
      });
    } else {
      onUpdate([...sessions, session].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')));
    }
    toast.success(`Logged ${formatStudyTime(session.durationMinutes)}`);
    setAddOpen(false);
  }, [sessions, subjects, date, onUpdate, onCreateSession]);

  return (
    <GlowCard className="p-4" paper>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary" /> Study Sessions
          </h3>
          <p className="text-[10px] text-muted-foreground">{sessions.length} sessions · {totalHoursDisplay} total</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} className="gap-1 text-[10px] h-7">
          <Plus className="w-3 h-3" /> Add
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div className="py-6 text-center">
          <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[11px] text-muted-foreground">No sessions logged for this day</p>
          <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)} className="mt-2 text-xs text-primary">
            + Add first session
          </Button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-3 top-0 bottom-0 w-px bg-border/30" />
          <div className="space-y-3">
            {sessions.map((session) => {
              const subject = subjects.find(s => s.id === session.subjectId);
              const h = Math.floor(session.durationMinutes / 60);
              const m = session.durationMinutes % 60;
              return (
                <motion.div key={session.id}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-3 pl-1 relative">
                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 z-10 bg-card"
                    style={{ borderColor: subject?.color || 'hsl(var(--primary))' }}>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: subject?.color || 'hsl(var(--primary))' }} />
                  </div>
                  <div className="flex-1 glass-card p-2.5 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <SubjectLink
                          shortName={session.subjectName}
                          color={subject?.color || '#666'}
                          subjectId={session.subjectId}
                          onNavigate={onNavigate}
                        />
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {session.startTime?.slice(0, 5) || ''}
                          {session.endTime ? ` → ${session.endTime.slice(0, 5)}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold font-mono text-foreground">
                          {h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : m > 0 ? `${m} min` : '0 min'}
                        </span>
                        <Button variant="ghost" size="icon" className="w-6 h-6 text-primary/60 hover:text-primary"
                          onClick={() => setEditSession(session)} aria-label="Edit session">
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="w-6 h-6 text-destructive/60 hover:text-destructive"
                          onClick={() => handleDelete(session.id)} aria-label="Delete session">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {session.note && (
                      <p className="text-[10px] text-muted-foreground mt-1">{session.note}</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      <SessionFormSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        subjects={subjects}
        onSave={handleAdd}
        date={date}
        title="➕ Add Study Session"
      />

      <SessionFormSheet
        key={editSession?.id || 'add'}
        open={!!editSession}
        onClose={() => setEditSession(null)}
        subjects={subjects}
        onSave={handleEditSave}
        date={date}
        title="✏️ Edit Study Session"
        initial={editSession}
      />
    </GlowCard>
  );
}

function SessionFormSheet({ open, onClose, subjects, onSave, date, title, initial }: {
  open: boolean; onClose: () => void; subjects: Subject[];
  onSave: (s: StudySession) => void; date: string; title: string;
  initial?: StudySession | null;
}) {
  const [subjectId, setSubjectId] = useState(initial?.subjectId || 'general');
  const [startTime, setStartTime] = useState(initial?.startTime || '09:00');
  const [endTime, setEndTime] = useState(initial?.endTime || '10:00');
  const [note, setNote] = useState(initial?.note || '');

  useEffect(() => {
    if (open) {
      setSubjectId(initial?.subjectId || 'general');
      setStartTime(initial?.startTime || '09:00');
      setEndTime(initial?.endTime || '10:00');
      setNote(initial?.note || '');
    }
  }, [open, initial?.id]);

  const save = useCallback(() => {
    if (!subjectId || subjectId === 'general') { /* allow general */ }
    const subject = subjects.find(s => s.id === subjectId);
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const durationMinutes = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
    if (durationMinutes <= 0) { toast.error('End time must be after start'); return; }

    const session: StudySession = {
      id: initial?.id || `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      subjectId,
      subjectName: subject?.shortName || 'Unknown',
      durationMinutes,
      startTime,
      endTime,
      note: note.trim() || undefined,
    };
    onSave(session);
    if (!initial) {
      setSubjectId('');
      setNote('');
    }
    onClose();
  }, [subjectId, startTime, endTime, note, subjects, onSave, initial, onClose]);

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="space-y-4 pt-2">
        <div>
          <p className="text-xs text-muted-foreground mb-2">Subject</p>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Choose subject..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              {subjects.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.shortName} — {s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Start Time</p>
            <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9 text-xs" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">End Time</p>
            <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-9 text-xs" />
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Notes (optional)</p>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="What did you study?" className="h-9 text-xs" />
        </div>
        <Button onClick={save} className="w-full h-10 text-sm font-semibold gap-2">
          <Check className="w-4 h-4" /> {initial ? 'Update Session' : 'Save Session'}
        </Button>
      </div>
    </BottomSheet>
  );
}
