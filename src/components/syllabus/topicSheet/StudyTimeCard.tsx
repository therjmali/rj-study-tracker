import { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarIcon, Clock, ChevronDown, RotateCcw, Pencil, Trash2, Save, Plus } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import type { SubTopic, TimeEntry, TopicStatus, RevisionKey } from '../../../types';
import { formatDateRelative, formatStudyTime, getLocalDateStr, formatTime12h, formatTimeRange12h } from '../../../lib/utils';
import { SheetCard } from './CompactParts';
import DurationPicker from '../../shared/DurationPicker';
import StudyTimerPanel, { useTargetTimer } from '../../shared/StudyTimerPanel';

/* ── One ⏱️ card — SAME layout as Add Study Time: Duration picker (manual) → Stopwatch · Countdown timer.
      Available in EVERY topic status. ── */

export default function StudyTimeCard({ draft, addTime, deleteTimeEntry, editTimeEntry, setField, subjectId, unitId, subjectName, onOpenFull, revisionKey, onBeforeSave }: {
  subjectId?: string; unitId?: string; subjectName?: string; onOpenFull?: () => void;
  /** Set when this card logs a REVISION round (R1–R4) instead of the main topic — same timer, same controls. */
  revisionKey?: RevisionKey;
  /** Called right before a running timer is saved (the host flushes its unsaved draft first). */
  onBeforeSave?: () => void;
  draft: SubTopic;
  addTime: (mins: number, targetDate?: string, note?: string, time?: string) => void;
  deleteTimeEntry: (idx: number) => void;
  editTimeEntry: (idx: number, mins: number, note?: string, date?: string, time?: string) => void;
  setField: <K extends keyof SubTopic>(k: K, v: SubTopic[K]) => void;
}) {
  // addDate is purely UI state for the NEXT entry (never synced from completedDate)
  const [addDate, setAddDate] = useState(() => getLocalDateStr(new Date()));
  const [addNote, setAddNote] = useState('');
  const [addMins, setAddMins] = useState(30);
  const [showDate, setShowDate] = useState(false);
  const [more, setMore] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editMin, setEditMin] = useState(0);
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  // Start time for the NEXT entry. '' = automatic (ends now, today only)
  const [addTimeStr, setAddTimeStr] = useState('');

  const canTime = !!(subjectId && unitId);
  const target = { subjectId: subjectId || '', unitId: unitId || '', topicId: draft.id, topicName: draft.name, subjectName: subjectName || '', revisionKey: revisionKey || '' } as const;
  const { isThis, runningOther, statusLabel, statusTone, timer } = useTargetTimer(target);

  const entries = draft.timeEntries || [];
  const grouped = entries.reduce((acc, e, idx) => {
    (acc[e.date] ||= []).push({ ...e, _idx: idx });
    return acc;
  }, {} as Record<string, (TimeEntry & { _idx: number })[]>);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const startEdit = (idx: number) => { const e = entries[idx]; if (!e) return; setEditIdx(idx); setEditMin(e.minutes); setEditNote(e.note || ''); setEditDate(e.date); setEditTime(e.time || ''); };
  const saveEdit = () => { if (editIdx === null) return; editTimeEntry(editIdx, editMin, editNote, editDate, editTime); setEditIdx(null); };
  const autoStart = (mins: number): string | undefined => {
    if (addDate !== getLocalDateStr(new Date())) return undefined;
    const now = new Date();
    const m = Math.max(0, now.getHours() * 60 + now.getMinutes() - mins);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  const quickAdd = (mins: number) => { if (mins <= 0) return; addTime(mins, addDate, addNote || undefined, addTimeStr || autoStart(mins)); setAddNote(''); navigator.vibrate?.(8); };
  const isToday = addDate === getLocalDateStr(new Date());

  const statusColor = (status?: TopicStatus) =>
    status === 'complete' ? 'border-l-emerald-500' : status === 'in_process' ? 'border-l-chart-4' : 'border-l-muted-foreground/30';

  return (
    <SheetCard className="!p-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        <span className="text-[15px] leading-none shrink-0" aria-hidden>⏱️</span>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{revisionKey ? 'Revision time' : 'Study time'}</span>
        {revisionKey && <span className="text-[9px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">{revisionKey}</span>}
        {canTime && (
          <span className={`inline-flex items-center gap-1 h-5 px-2 rounded-full border text-[9px] font-black uppercase tracking-wider ${statusTone}`}>
            {(timer.active && isThis) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}{statusLabel}
          </span>
        )}
        <span className="ml-auto text-[10px] font-mono font-bold text-chart-5 bg-chart-5/8 px-2 py-0.5 rounded-lg">Total {formatStudyTime(draft.timeSpent)}</span>
        <button type="button" onClick={() => setMore(m => !m)} aria-expanded={more} aria-label={more ? 'Hide time details' : 'Show time details'}
          className="h-7 pl-2 pr-1.5 rounded-lg flex items-center gap-1 text-muted-foreground hover:bg-muted/20 active:scale-95 transition">
          {entries.length > 0 && <span className="text-[10px] font-bold">{entries.length}</span>}
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${more ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* ── Manual: the 4-up Duration picker (identical to Add Study Time) ── */}
      <div className="px-3.5 pb-3 space-y-3" onPointerDown={e => e.stopPropagation()}>
        <DurationPicker value={addMins} onChange={setAddMins} />

        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          <button type="button" onClick={() => setShowDate(s => !s)} aria-expanded={showDate}
            className={`h-8 px-2.5 rounded-full border text-[10px] font-bold flex items-center gap-1 ${
              isToday ? 'bg-muted/15 border-border/12 text-muted-foreground' : 'bg-amber-500/10 border-amber-500/30 text-amber-600'
            }`} title="Date this time is logged for">
            <CalendarIcon className="w-3 h-3" /> {formatDateRelative(addDate)}
          </button>
          <button type="button" onClick={() => setShowDate(true)} title="Start time of this study block — Auto means the block ends right now"
            className={`h-8 px-2.5 rounded-full border text-[10px] font-bold flex items-center gap-1 ${
              addTimeStr ? 'bg-amber-500/10 border-amber-500/30 text-amber-600' : 'bg-muted/15 border-border/12 text-muted-foreground'
            }`}>
            <Clock className="w-3 h-3" /> {addTimeStr ? formatTime12h(addTimeStr) : 'Auto'}
          </button>
        </div>

        {showDate && (
          <div className="flex items-center gap-2 animate-fade-in">
            <span className="text-[10px] font-bold text-chart-5 shrink-0">Logging for</span>
            <Input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} className="h-8 text-[11px] flex-1 bg-card border-chart-5/20 font-mono rounded-xl" />
            {!isToday && <button type="button" onClick={() => setAddDate(getLocalDateStr(new Date()))} className="text-[10px] font-bold text-primary px-2 h-8">Today</button>}
            <Input type="time" value={addTimeStr} onChange={e => setAddTimeStr(e.target.value)} aria-label="Start time of the block" title="Start time of the block" className="h-8 text-[11px] w-[6.5rem] bg-card border-chart-5/20 font-mono rounded-xl" />
            {addTimeStr && <button type="button" onClick={() => setAddTimeStr('')} className="text-[10px] font-bold text-primary px-1.5 h-8">Auto</button>}
          </div>
        )}

        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => quickAdd(addMins)} disabled={addMins <= 0}
          className="w-full h-10 rounded-xl bg-chart-5 text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40">
          <Plus className="w-3.5 h-3.5" /> Add {formatStudyTime(addMins)} {revisionKey ? `to ${revisionKey}` : 'study time'}
        </motion.button>

        {isToday && !addTimeStr && (
          <p className="text-center text-[10px] text-muted-foreground/80 leading-snug -mt-1">
            ⏱ Auto: the block <strong className="text-foreground/70">ends now</strong> — e.g. {formatStudyTime(addMins)} is saved as {formatTimeRange12h(autoStart(addMins), addMins)}.
          </p>
        )}
      </div>

      {/* ── Live: the Stopwatch · Countdown timer (identical to Add Study Time) ── */}
      {canTime && (
        <div className="px-3.5 pb-3 space-y-2.5" onPointerDown={e => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border/15" /><span className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">or study live with the timer</span><span className="h-px flex-1 bg-border/15" />
          </div>
          <StudyTimerPanel target={target} onBeforeSave={onBeforeSave} onOpenFull={onOpenFull}
            hint={revisionKey ? <>✅ Saving a session marks <strong className="text-foreground/70">{revisionKey}</strong> as Done and adds the time to today's study</> : undefined} />
        </div>
      )}

      {more && (
        <div className="border-t border-border/10 animate-fade-in" onPointerDown={e => e.stopPropagation()}>
          <div className="px-3.5 pt-3 pb-2">
            <Input placeholder="Note for the next entry (optional)…" value={addNote} onChange={e => setAddNote(e.target.value)}
              className="h-8 text-[11px] bg-muted/15 border-border/10 rounded-xl" />
          </div>

          {entries.length > 0 && (
            <div className="px-3.5 pb-2 space-y-1 max-h-64 overflow-y-auto">
              {sortedDates.map(date => (
                <div key={date} className="space-y-0.5">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[9px] font-bold text-foreground/50 uppercase tracking-wider">{formatDateRelative(date)}</span>
                    <span className="text-[9px] font-mono font-bold text-chart-5/70">{formatStudyTime(grouped[date].reduce((a, e) => a + e.minutes, 0))}</span>
                  </div>
                  {grouped[date].map(entry => (
                    <div key={entry._idx}>
                      {editIdx === entry._idx ? (
                        <div className="p-2 rounded-xl bg-chart-5/5 border border-chart-5/15 space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="h-7 text-[10px] flex-1 bg-card border-border/15 font-mono rounded-lg" />
                            <Input type="text" inputMode="numeric" pattern="[0-9]*" value={editMin === 0 ? '' : String(editMin)}
                              onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setEditMin(v === '' ? 0 : parseInt(v, 10)); }}
                              className="w-14 h-7 text-[10px] font-mono text-center bg-card border-border/15 rounded-lg" />
                            <span className="text-[9px] text-muted-foreground">m</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                            <Input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} aria-label="Start time" className="h-7 text-[10px] flex-1 bg-card border-border/15 font-mono rounded-lg" />
                            {editTime && <button type="button" onClick={() => setEditTime('')} className="text-[9px] font-bold text-muted-foreground px-1">Clear</button>}
                          </div>
                          <Input placeholder="Note…" value={editNote} onChange={e => setEditNote(e.target.value)} className="h-7 text-[10px] bg-card border-border/15 rounded-lg" />
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setEditIdx(null)} className="h-6 text-[10px] px-2">Cancel</Button>
                            <Button size="sm" onClick={saveEdit} className="h-6 text-[10px] px-2.5"><Save className="w-2.5 h-2.5 mr-0.5" /> Save</Button>
                          </div>
                        </div>
                      ) : (
                        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border-l-[3px] bg-card/30 ${statusColor(entry.status)}`}>
                          <span className="text-[11px] font-mono font-bold text-chart-5 shrink-0 w-12">{formatStudyTime(entry.minutes)}</span>
                          {entry.time && <span className="shrink-0 text-[9px] font-mono font-bold text-muted-foreground/70 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{formatTimeRange12h(entry.time, entry.minutes)}</span>}
                          <span className="flex-1 text-[10px] text-muted-foreground truncate">{entry.note || '—'}</span>
                          <button type="button" onClick={() => startEdit(entry._idx)} aria-label="Edit entry" className="p-1.5 rounded hover:bg-primary/10"><Pencil className="w-3 h-3 text-muted-foreground/60" /></button>
                          <button type="button" onClick={() => deleteTimeEntry(entry._idx)} aria-label="Delete entry" className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-3 h-3 text-muted-foreground/60" /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border/10 px-3.5 py-2.5 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/60 font-bold shrink-0">Override total</span>
            <Input type="text" inputMode="numeric" pattern="[0-9]*" value={draft.timeSpent === 0 ? '' : String(draft.timeSpent)}
              onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setField('timeSpent', v === '' ? 0 : parseInt(v, 10)); }}
              className="w-16 h-7 text-[11px] font-mono text-center bg-card border-border/10 rounded-lg" />
            <span className="text-[10px] text-muted-foreground/60">min</span>
            <button type="button" onClick={() => { setField('timeSpent', 0); setField('timeEntries', [] as any); }}
              className="ml-auto h-7 px-2.5 rounded-lg border border-destructive/20 bg-destructive/6 text-destructive text-[10px] font-bold flex items-center gap-1 active:scale-95 transition-transform">
              <RotateCcw className="w-3 h-3" /> Reset all
            </button>
          </div>
        </div>
      )}
    </SheetCard>
  );
}
