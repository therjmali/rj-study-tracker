import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import BottomSheet from '../shared/BottomSheet';
import DurationPicker from '../shared/DurationPicker';
import type { Subject } from '../../types';
import { ACTIVITY_CHOICES, BASE_ACTIVITIES, activityLabel, stripActivityTag } from '../../lib/activities';
import { formatStudyTime, formatDate } from '../../lib/utils';

export interface EditableSession {
  id: string;
  date: string;
  subjectId?: string;
  subjectName?: string;
  durationMinutes: number;
  description?: string;
  note?: string;
  startTime?: string;
  endTime?: string;
}

export interface SessionChanges {
  date: string;
  minutes: number;
  subjectId: string;
  subjectName: string;
  description: string;
  startTime: string;
  endTime?: string;
  note?: string;
}

/**
 * The ONE editor for a logged study session (day card, Add Study Time duplicate flow …).
 * Every field is editable — including the date, so a session logged on the wrong day can be moved —
 * and saving always asks for confirmation, showing exactly what will change.
 */
export default function SessionEditSheet({ session, subjects, onSave, onClose }: {
  session: EditableSession;
  subjects: Subject[];
  onSave: (changes: SessionChanges) => void;
  onClose: () => void;
}) {
  const originalActivity = activityLabel(session.description) || 'Self-Study';
  const knownActivity = ACTIVITY_CHOICES.some(a => a.id === originalActivity && a.id !== 'Custom') ? originalActivity : null;
  const originalSubjectName = session.subjectName || '';
  // a note equal to the default text ("Other", the subject or topic name) is not a real note
  const cleanNote = (() => {
    const n = stripActivityTag(session.note || session.description);
    return n && n !== originalSubjectName && n !== 'Study' && n !== 'Other' ? n : '';
  })();

  const [date, setDate] = useState(session.date);
  const [subjectId, setSubjectId] = useState(session.subjectId && session.subjectId !== 'general' ? session.subjectId : '');
  const [activity, setActivity] = useState(knownActivity ?? 'Custom');
  const [customActivity, setCustomActivity] = useState(knownActivity ? '' : originalActivity);
  const [mins, setMins] = useState(session.durationMinutes || 30);
  const [startTime, setStartTime] = useState((session.startTime || '').slice(0, 5));
  const [endTime, setEndTime] = useState((session.endTime || '').slice(0, 5));
  const [note, setNote] = useState(cleanNote);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const subject = subjects.find(s => s.id === subjectId);
  const resolvedActivity = activity === 'Custom' ? (customActivity.trim() || 'Custom') : activity;
  const subjectName = subject?.shortName || (subjectId ? originalSubjectName : 'Other');

  const changes = useMemo<SessionChanges>(() => ({
    date,
    minutes: Math.max(1, mins),
    subjectId,
    subjectName,
    description: `[${resolvedActivity}] ${note.trim() || subjectName}`.trim(),
    startTime,
    endTime: endTime || undefined,
    note: note.trim() || undefined,
  }), [date, mins, subjectId, subjectName, resolvedActivity, note, startTime, endTime]);

  // a human summary of what is about to change
  const diff: string[] = [];
  if (date !== session.date) diff.push(`Date: ${formatDate(session.date)} → ${formatDate(date)}`);
  if (mins !== session.durationMinutes) diff.push(`Duration: ${formatStudyTime(session.durationMinutes)} → ${formatStudyTime(mins)}`);
  if ((subjectId || '') !== (session.subjectId && session.subjectId !== 'general' ? session.subjectId : '')) diff.push(`Subject: ${originalSubjectName || 'Other'} → ${subjectName}`);
  if (resolvedActivity !== originalActivity) diff.push(`Activity: ${originalActivity} → ${resolvedActivity}`);
  if (startTime !== (session.startTime || '').slice(0, 5) || endTime !== (session.endTime || '').slice(0, 5)) diff.push('Start / end time');
  if (note.trim() !== cleanNote) diff.push('Notes');

  return (
    <>
      <BottomSheet open onClose={onClose} title="✏️ Edit Study Session">
        <div className="space-y-4 pt-2">
          <div>
            <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5">Date</p>
            <Input type="date" value={date} max="2100-01-01" onChange={e => e.target.value && setDate(e.target.value)} className="h-9 text-xs font-mono" />
          </div>

          <div>
            <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5">Duration</p>
            <DurationPicker value={mins} onChange={setMins} min={1} />
          </div>

          <div>
            <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5">Activity</p>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Activity type">
              {ACTIVITY_CHOICES.map(a => {
                const on = activity === a.id;
                return (
                  <button key={a.id} type="button" role="radio" aria-checked={on} onClick={() => setActivity(a.id)}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl border px-1.5 py-2 min-h-[52px] transition-all active:scale-95 ${
                      on ? 'bg-secondary/15 border-secondary/40 text-secondary shadow-[0_0_10px_hsl(var(--secondary)/0.18)]' : 'bg-card/30 border-border/15 text-muted-foreground'}`}>
                    <span className="text-base leading-none">{a.icon}</span>
                    <span className="text-[10px] font-black leading-tight">{a.id}</span>
                  </button>
                );
              })}
            </div>
            {activity === 'Custom' && (
              <Input value={customActivity} onChange={e => setCustomActivity(e.target.value)} placeholder="Your own label (e.g. Video, Seminar)…" className="h-8 text-xs mt-2" />
            )}
          </div>

          <div>
            <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5">Subject</p>
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => setSubjectId('')}
                className={`text-[10px] px-2.5 py-1.5 rounded-lg border font-semibold ${!subjectId ? 'bg-muted/25 border-muted-foreground/25 text-foreground ring-1 ring-muted-foreground/20' : 'bg-card/30 border-border/15 text-muted-foreground'}`}>Other</button>
              {subjects.map(s => (
                <button key={s.id} type="button" onClick={() => setSubjectId(s.id)}
                  className={`text-[10px] px-2.5 py-1.5 rounded-lg border font-semibold flex items-center gap-1 ${subjectId === s.id ? 'bg-primary/15 border-primary/25 text-primary' : 'bg-card/30 border-border/15 text-muted-foreground'}`}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />{s.shortName}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5">Start</p><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9 text-xs" /></div>
            <div><p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5">End</p><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-9 text-xs" /></div>
          </div>

          <div>
            <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5">Notes</p>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="What did you study?" className="h-9 text-xs" />
          </div>

          <Button onClick={() => (diff.length ? setConfirmOpen(true) : onClose())} className="w-full h-10 text-sm font-semibold gap-2 rounded-xl">
            <Check className="w-4 h-4" /> {diff.length ? 'Update Session' : 'No changes — Close'}
          </Button>
        </div>
      </BottomSheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-xs rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Save these changes?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="text-xs space-y-1 text-left list-disc pl-4">{diff.map(d => <li key={d}>{d}</li>)}</ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8 rounded-xl">Keep editing</AlertDialogCancel>
            <AlertDialogAction className="text-xs h-8 rounded-xl" onClick={() => { setConfirmOpen(false); onSave(changes); }}>Save changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { BASE_ACTIVITIES };
