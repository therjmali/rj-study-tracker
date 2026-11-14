import { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarIcon, Clock, ChevronDown, RotateCcw, Pencil, Trash2, Save, Play, Pause, ExternalLink } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import type { SubTopic, TimeEntry, TopicStatus } from '../../../types';
import { formatDateRelative, formatStudyTime, getLocalDateStr, formatTime12h, formatTimeRange12h } from '../../../lib/utils';
import { SheetCard } from './CompactParts';
import { useTimer } from '../../../contexts/TimerContext';
import { useTimerTick } from '../../../hooks/useGlobalTimer';

/* ── One ⏱️ card: Stopwatch (left) · Countdown (right) · manual log — available in EVERY topic status ── */
const MODES = [
  { id: 'stopwatch', label: 'Stopwatch', hint: 'counts up' },
  { id: 'countdown', label: 'Countdown', hint: 'counts down' },
] as const;
const PRESETS = [25, 30, 45, 60];

const fmtClock = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
};

function Digit({ v }: { v: string }) {
  return (
    <span className="relative inline-flex w-[34px] h-[46px] items-center justify-center rounded-xl text-[26px] font-black font-mono text-background tabular-nums"
      style={{ background: 'linear-gradient(180deg, hsl(var(--foreground)/0.95) 0%, hsl(var(--foreground)/0.86) 49.5%, hsl(var(--foreground)/0.74) 50.5%, hsl(var(--foreground)/0.8) 100%)', boxShadow: '0 4px 12px hsl(var(--foreground)/0.15), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
      {v}
      <span className="absolute left-0 right-0 top-1/2 h-px bg-background/10" />
    </span>
  );
}

/** The ticking part lives alone so the long entry list below never re-renders every second. */
function ClockFace({ stopwatch, accent }: { stopwatch: boolean; accent: boolean }) {
  const { timeLeft, swTime } = useTimerTick();
  const txt = fmtClock(stopwatch ? swTime : timeLeft);
  const parts = txt.split(':');
  return (
    <div className={`flex items-center justify-center gap-1 py-1 transition-opacity ${accent ? 'opacity-100' : 'opacity-70'}`} role="timer" aria-live="off" aria-label={txt}>
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="flex flex-col gap-1.5 px-0.5"><i className="w-1.5 h-1.5 rounded-full bg-foreground/65" /><i className="w-1.5 h-1.5 rounded-full bg-foreground/65" /></span>}
          <Digit v={p[0] ?? '0'} /><Digit v={p[1] ?? '0'} />
        </span>
      ))}
    </div>
  );
}

function SaveButton({ stopwatch, enabled, onSave }: { stopwatch: boolean; enabled: boolean; onSave: () => void }) {
  const { timeLeft, swTime } = useTimerTick();
  const { state: timer } = useTimer();
  const elapsed = stopwatch ? swTime : Math.max(0, (!timer.cycle || timer.phase === 'focus' ? timer.focusDuration * 60 : 0) - timeLeft);
  if (!enabled || elapsed < 30) return null;
  return (
    <motion.button type="button" whileTap={{ scale: 0.93 }} onClick={onSave}
      className="h-11 px-5 rounded-full bg-secondary text-secondary-foreground text-sm font-bold flex items-center gap-2"
      style={{ boxShadow: '0 4px 16px hsl(var(--secondary) / 0.3)' }}>
      <Save className="w-4 h-4" /> Save {Math.max(1, Math.round(elapsed / 60))}m
    </motion.button>
  );
}

export default function StudyTimeCard({ draft, addTime, deleteTimeEntry, editTimeEntry, setField, subjectId, unitId, subjectName, onOpenFull }: {
  subjectId?: string; unitId?: string; subjectName?: string; onOpenFull?: () => void;
  draft: SubTopic;
  addTime: (mins: number, targetDate?: string, note?: string, time?: string) => void;
  deleteTimeEntry: (idx: number) => void;
  editTimeEntry: (idx: number, mins: number, note?: string, date?: string, time?: string) => void;
  setField: <K extends keyof SubTopic>(k: K, v: SubTopic[K]) => void;
}) {
  // addDate is purely UI state for the NEXT entry (never synced from completedDate)
  const [addDate, setAddDate] = useState(() => getLocalDateStr(new Date()));
  const [addNote, setAddNote] = useState('');
  const [customMinStr, setCustomMinStr] = useState('25');
  const [showCustom, setShowCustom] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [more, setMore] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editMin, setEditMin] = useState(0);
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  // Start time for the NEXT entry. '' = automatic (ends now, today only)
  const [addTimeStr, setAddTimeStr] = useState('');

  const { state: timer, actions: ta } = useTimer();
  const canTime = !!(subjectId && unitId);
  const busy = timer.active || timer.hasProgress;
  const isThis = timer.topicId === draft.id;
  const runningOther = busy && !isThis;
  const stopwatch = timer.appMode === 'stopwatch';
  const isBreak = timer.cycle && timer.phase !== 'focus';
  const statusLabel = runningOther ? 'Busy elsewhere' : timer.active && isThis ? 'Running' : timer.hasProgress && isThis ? 'Paused' : 'Ready';
  const statusTone = runningOther ? 'text-amber-600 bg-amber-500/10 border-amber-500/25'
    : timer.active && isThis ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25'
    : timer.hasProgress && isThis ? 'text-amber-600 bg-amber-500/10 border-amber-500/25'
    : 'text-muted-foreground bg-muted/20 border-border/15';
  const primaryLabel = timer.active ? 'Pause' : timer.hasProgress ? 'Resume' : 'Start';
  const onPrimary = () => { if (!isThis) ta.linkTopic(subjectId!, unitId!, draft.id, draft.name, subjectName || ''); ta.toggle(); navigator.vibrate?.(10); };

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
  const quickAdd = (mins: number) => { addTime(mins, addDate, addNote || undefined, addTimeStr || autoStart(mins)); setAddNote(''); setShowCustom(false); navigator.vibrate?.(8); };
  const isToday = addDate === getLocalDateStr(new Date());

  const statusColor = (status?: TopicStatus) =>
    status === 'complete' ? 'border-l-emerald-500' : status === 'in_process' ? 'border-l-chart-4' : 'border-l-muted-foreground/30';

  const chip = 'shrink-0 h-8 px-3 rounded-full border text-[11px] font-bold bg-chart-5/8 border-chart-5/20 text-chart-5 active:scale-95 transition-transform';

  return (
    <SheetCard className="!p-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        <span className="text-[15px] leading-none shrink-0" aria-hidden>⏱️</span>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Study time</span>
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

      {canTime && (
        <div className="px-3.5 pb-3 space-y-2.5" onPointerDown={e => e.stopPropagation()}>
          {runningOther ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/6 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-amber-600">Timer is running for another topic</p>
                <p className="text-xs text-foreground/60 truncate font-medium">{timer.topicName || timer.subjectName || 'Free study'}</p>
              </div>
              <button type="button" onClick={() => { ta.stopAndSave(); ta.linkTopic(subjectId!, unitId!, draft.id, draft.name, subjectName || ''); }}
                className="text-[10px] px-3 py-1.5 rounded-xl bg-amber-500/12 text-amber-600 font-bold border border-amber-500/25 active:scale-95 transition">Save &amp; switch</button>
            </div>
          ) : (
            <>
              {/* Left = Stopwatch, right = Countdown */}
              <div role="tablist" aria-label="Timer mode" className="relative grid grid-cols-2 rounded-2xl border border-border/20 bg-muted/20 p-0.5">
                {MODES.map(m => {
                  const on = timer.appMode === m.id;
                  return (
                    <button key={m.id} type="button" role="tab" aria-selected={on} disabled={busy && !on} onClick={() => ta.setAppMode(m.id)}
                      className={`relative z-10 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${on ? 'text-primary-foreground' : busy ? 'text-muted-foreground/40' : 'text-muted-foreground'}`}>
                      {on && <motion.span layoutId="study-mode-pill" className="absolute inset-0 rounded-xl bg-primary shadow-sm -z-10" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
                      {m.label}<span className="block text-[8px] font-semibold opacity-70 -mt-0.5">{m.hint}</span>
                    </button>
                  );
                })}
              </div>

              {!stopwatch && !isBreak && !busy && (
                <div className="flex gap-1.5">
                  {PRESETS.map(p => (
                    <button key={p} type="button" onClick={() => ta.selectPreset(p)}
                      className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition-all active:scale-95 ${timer.focusDuration === p ? 'bg-primary/12 text-primary border-primary/30' : 'bg-card/30 text-foreground/60 border-border/15'}`}>{p}m</button>
                  ))}
                </div>
              )}

              <ClockFace stopwatch={stopwatch} accent={busy && isThis} />

              {timer.cycle && !stopwatch && (
                <p className="text-center text-[10px] font-bold text-muted-foreground -mt-1">
                  {timer.phase === 'focus' ? '🍅 Focus' : timer.phase === 'short' ? '☕ Short break' : '🌿 Long break'}{timer.sessions > 0 ? ` · ${timer.sessions} done today` : ''}
                </p>
              )}

              <div className="flex items-center justify-center gap-2.5">
                {busy && (
                  <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => ta.reset()} aria-label="Reset timer"
                    className="w-10 h-10 rounded-xl bg-muted/30 border border-border/15 flex items-center justify-center"><RotateCcw className="w-4 h-4 text-muted-foreground" /></motion.button>
                )}
                <motion.button type="button" whileTap={{ scale: 0.93 }} onClick={onPrimary}
                  className="h-11 px-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2"
                  style={{ boxShadow: '0 4px 16px hsl(var(--primary) / 0.35)' }}>
                  {timer.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" fill="currentColor" />} {primaryLabel}
                </motion.button>
                <SaveButton stopwatch={stopwatch} enabled={isThis && busy && !isBreak} onSave={() => ta.stopAndSave()} />
              </div>

              <div className="flex items-center justify-between">
                {!stopwatch && !busy ? (
                  <button type="button" role="switch" aria-checked={timer.cycle} onClick={() => ta.setCycle(!timer.cycle)}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                    <span>🍅</span> Auto breaks
                    <span className={`relative w-7 h-4 rounded-full transition-colors ${timer.cycle ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                      <span className={`absolute top-[2px] left-[2px] w-3 h-3 rounded-full bg-white shadow transition-transform ${timer.cycle ? 'translate-x-3' : ''}`} />
                    </span>
                  </button>
                ) : <span />}
                {onOpenFull && (
                  <button type="button" onClick={onOpenFull} className="text-[10px] font-bold text-primary flex items-center gap-1">Full screen <ExternalLink className="w-3 h-3" /></button>
                )}
              </div>
            </>
          )}
          <div className="flex items-center gap-2 pt-0.5">
            <span className="h-px flex-1 bg-border/15" /><span className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">or add time manually</span><span className="h-px flex-1 bg-border/15" />
          </div>
        </div>
      )}

      <div className="px-3.5 pb-3 flex items-center gap-1.5 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }} onPointerDown={e => e.stopPropagation()}>
        {[{ label: '+10m', v: 10 }, { label: '+30m', v: 30 }, { label: '+1h', v: 60 }].map(p => (
          <motion.button key={p.label} type="button" whileTap={{ scale: 0.92 }} onClick={() => quickAdd(p.v)} className={chip}>{p.label}</motion.button>
        ))}
        <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={() => setShowCustom(s => !s)}
          className={`shrink-0 h-8 px-3 rounded-full border text-[11px] font-bold ${showCustom ? 'bg-chart-5/20 border-chart-5/30 text-chart-5' : 'bg-muted/20 border-border/15 text-muted-foreground'}`}>✏️ Custom</motion.button>
        <button type="button" onClick={() => setShowDate(s => !s)} aria-expanded={showDate}
          className={`shrink-0 h-8 px-2.5 rounded-full border text-[10px] font-bold flex items-center gap-1 ${
            isToday ? 'bg-muted/15 border-border/12 text-muted-foreground' : 'bg-amber-500/10 border-amber-500/30 text-amber-600'
          }`} title="Date this time is logged for">
          <CalendarIcon className="w-3 h-3" /> {formatDateRelative(addDate)}
        </button>
        <button type="button" onClick={() => setShowDate(true)} title="Start time of this study block — Auto means the block ends right now"
          className={`shrink-0 h-8 px-2.5 rounded-full border text-[10px] font-bold flex items-center gap-1 ${
            addTimeStr ? 'bg-amber-500/10 border-amber-500/30 text-amber-600' : 'bg-muted/15 border-border/12 text-muted-foreground'
          }`}>
          <Clock className="w-3 h-3" /> {addTimeStr ? formatTime12h(addTimeStr) : 'Auto'}
        </button>
      </div>

      {isToday && !addTimeStr && (
        <p className="px-3.5 pb-2.5 -mt-1 text-[10px] text-muted-foreground/80 leading-snug">
          ⏱ Auto: the block <strong className="text-foreground/70">ends now</strong> — e.g. +30m is saved as {formatTimeRange12h(autoStart(30), 30)}.
        </p>
      )}

      {showDate && (
        <div className="px-3.5 pb-3 flex items-center gap-2 animate-fade-in" onPointerDown={e => e.stopPropagation()}>
          <span className="text-[10px] font-bold text-chart-5 shrink-0">Logging for</span>
          <Input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} className="h-8 text-[11px] flex-1 bg-card border-chart-5/20 font-mono rounded-xl" />
          {!isToday && <button type="button" onClick={() => setAddDate(getLocalDateStr(new Date()))} className="text-[10px] font-bold text-primary px-2 h-8">Today</button>}
          <Input type="time" value={addTimeStr} onChange={e => setAddTimeStr(e.target.value)} aria-label="Start time of the block" title="Start time of the block" className="h-8 text-[11px] w-[6.5rem] bg-card border-chart-5/20 font-mono rounded-xl" />
          {addTimeStr && <button type="button" onClick={() => setAddTimeStr('')} className="text-[10px] font-bold text-primary px-1.5 h-8">Auto</button>}
        </div>
      )}

      {showCustom && (
        <div className="px-3.5 pb-3 flex items-center gap-2 animate-fade-in" onPointerDown={e => e.stopPropagation()}>
          <Input type="text" inputMode="numeric" pattern="[0-9]*" value={customMinStr}
            onChange={e => setCustomMinStr(e.target.value.replace(/[^0-9]/g, ''))}
            className="w-16 h-9 text-xs font-bold text-center bg-card border-chart-5/20 rounded-xl" />
          <span className="text-[10px] text-muted-foreground">min</span>
          <motion.button type="button" whileTap={{ scale: 0.92 }}
            onClick={() => { const v = parseInt(customMinStr, 10); if (!isNaN(v) && v >= 1 && v <= 600) quickAdd(v); }}
            className="h-9 px-4 rounded-full bg-chart-5 text-primary-foreground text-xs font-bold shadow-sm">
            + Add {parseInt(customMinStr, 10) > 0 ? parseInt(customMinStr, 10) : ''}m
          </motion.button>
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
