import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CalendarIcon, Timer, Save, Pencil, Trash2, RotateCcw, Hash, Clock, Flame } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Button } from '@project/components/ui/button';
import BottomSheet from '../shared/BottomSheet';
import { REVISION_KEYS } from '../../types';
import type { SubTopic, RevisionKey, RevisionData, RevisionStatus, TimeEntry } from '../../types';
import { formatStudyTime, formatDateRelative, getLocalDateStr, getCleanName } from '../../lib/utils';

export type RevisionMap = Partial<Record<RevisionKey, RevisionData>>;

interface Props {
  open: boolean;
  onClose: () => void;
  topic: SubTopic;
  onUpdate: (fn: (prev: RevisionMap) => RevisionMap) => void;
  subjectName?: string;
  subjectColor?: string;
  unitName?: string;
  /** All topics of the current unit (the open topic may be un-saved — it is substituted with `topic`) */
  unitTopics: SubTopic[];
  /** All topics of the current subject */
  subjectTopics: SubTopic[];
  zIndex: number;
}

const ORDINAL: Record<RevisionKey, string> = { R1: '1st', R2: '2nd', R3: '3rd', R4: '4th' };
const ROUND_TITLE: Record<RevisionKey, string> = { R1: 'First Revision', R2: 'Second Revision', R3: 'Third Revision', R4: 'Fourth Revision' };

const STATUS_OPTIONS: { value: RevisionStatus; label: string; emoji: string }[] = [
  { value: 'pending', label: 'Not Started', emoji: '📋' },
  { value: 'in_process', label: 'In Progress', emoji: '🔄' },
  { value: 'complete', label: 'Done', emoji: '✅' },
];

export const emptyRevision = (): RevisionData => ({ status: 'pending', timeSpent: 0, timeEntries: [] });

const nowTime = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-card/80 border border-border/12 p-4 ${className}`}
      style={{ boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)' }}>
      {children}
    </div>
  );
}

/** Progress row — same visual language as the subject dashboard bars */
function ProgressRow({ label, done, total, barClass }: { label: string; done: number; total: number; barClass: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-foreground w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-muted/30 overflow-hidden">
        <div className={`h-full rounded-full ${barClass} transition-all duration-700 shadow-sm`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-24 text-right font-semibold">{done}/{total} · {pct}%</span>
    </div>
  );
}

export default function RevisionSheet({ open, onClose, topic, onUpdate, subjectName, subjectColor, unitName, unitTopics, subjectTopics, zIndex }: Props) {
  const revisions: RevisionMap = topic.revisions || {};
  const getRev = (k: RevisionKey): RevisionData => revisions[k] || emptyRevision();

  const firstOpenRound = (): RevisionKey => REVISION_KEYS.find(k => getRev(k).status !== 'complete') || 'R4';
  const [selected, setSelected] = useState<RevisionKey>(firstOpenRound);

  // Re-pick the working round whenever the window opens for a topic
  useEffect(() => {
    if (open) setSelected(firstOpenRound());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, topic.id]);

  const rev = getRev(selected);
  const color = subjectColor || 'hsl(var(--primary))';

  const update = (k: RevisionKey, fn: (r: RevisionData) => RevisionData) =>
    onUpdate(prev => ({ ...prev, [k]: fn(prev[k] || emptyRevision()) }));

  /* ───────── Status ───────── */
  const setStatus = (k: RevisionKey, status: RevisionStatus) => {
    const today = getLocalDateStr(new Date());
    update(k, r => {
      if (status === 'complete') return { ...r, status, startedDate: r.startedDate || today, completedDate: today, completedTime: nowTime() };
      if (status === 'in_process') return { ...r, status, startedDate: r.startedDate || today, completedDate: undefined, completedTime: undefined };
      return { ...r, status, startedDate: undefined, completedDate: undefined, completedTime: undefined };
    });
    navigator.vibrate?.(10);
  };

  /* ───────── Time log ───────── */
  const addTime = (k: RevisionKey, mins: number, date: string, note?: string) => {
    update(k, r => ({
      ...r,
      timeSpent: r.timeSpent + mins,
      timeEntries: [...r.timeEntries, { date, minutes: mins, note, status: 'complete', ...(() => {
        const now = new Date();
        if (date !== getLocalDateStr(now)) return {};
        const m = Math.max(0, now.getHours() * 60 + now.getMinutes() - mins);
        return { time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` };
      })() } as TimeEntry],
    }));
  };
  const deleteEntry = (k: RevisionKey, idx: number) => {
    update(k, r => {
      const entries = [...r.timeEntries];
      const removed = entries.splice(idx, 1)[0];
      return { ...r, timeSpent: Math.max(0, r.timeSpent - (removed?.minutes || 0)), timeEntries: entries };
    });
  };
  const editEntry = (k: RevisionKey, idx: number, mins: number, note: string, date: string) => {
    update(k, r => {
      const entries = [...r.timeEntries];
      const old = entries[idx];
      if (!old) return r;
      entries[idx] = { ...old, minutes: mins, note: note || undefined, date };
      return { ...r, timeSpent: Math.max(0, r.timeSpent + (mins - old.minutes)), timeEntries: entries };
    });
  };
  const resetTime = (k: RevisionKey) => update(k, r => ({ ...r, timeSpent: 0, timeEntries: [] }));

  /* ───────── Progress numbers (current topic substituted by the live draft) ───────── */
  const progress = useMemo(() => {
    const sub = (list: SubTopic[]) => list.map(t => (t.id === topic.id ? topic : t));
    const unit = sub(unitTopics);
    const subj = sub(subjectTopics);
    const countDone = (list: SubTopic[]) => list.filter(t => t.revisions?.[selected]?.status === 'complete').length;
    const timeOf = (list: SubTopic[]) => list.reduce((a, t) => a + (t.revisions?.[selected]?.timeSpent || 0), 0);
    return {
      unitDone: countDone(unit), unitTotal: unit.length,
      subjDone: countDone(subj), subjTotal: subj.length,
      subjTime: timeOf(subj),
    };
  }, [topic, unitTopics, subjectTopics, selected]);

  const roundsDone = REVISION_KEYS.filter(k => getRev(k).status === 'complete').length;
  const allRoundsTime = REVISION_KEYS.reduce((a, k) => a + getRev(k).timeSpent, 0);
  const roundsPct = Math.round((roundsDone / REVISION_KEYS.length) * 100);
  const ringR = 11;
  const ringC = 2 * Math.PI * ringR;

  return (
    <BottomSheet open={open} onClose={onClose} zIndex={zIndex}>
      {/* ═══ Sticky top bar ═══ */}
      <div className="sticky top-0 z-20 -mx-5 px-5 pt-1 pb-2 mb-3 flex items-center gap-2.5"
        style={{ background: 'hsl(var(--glass-bg) / 0.97)' }}>
        <motion.button whileTap={{ scale: 0.88 }} onClick={onClose} aria-label="Close revision"
          className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted/70 transition-all shrink-0 shadow-sm">
          <X className="w-4 h-4 text-muted-foreground" />
        </motion.button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black text-foreground tracking-tight flex items-center gap-1.5">🔁 Revision</h3>
          <p className="text-[9px] text-muted-foreground/60 font-semibold">{roundsDone} of 4 rounds done</p>
        </div>
        <svg width="30" height="30" viewBox="0 0 30 30" className="shrink-0">
          <circle cx="15" cy="15" r={ringR} fill="none" stroke="hsl(var(--muted) / 0.3)" strokeWidth="3" />
          <circle cx="15" cy="15" r={ringR} fill="none" stroke="hsl(var(--secondary))" strokeWidth="3"
            strokeDasharray={ringC} strokeDashoffset={ringC - (roundsPct / 100) * ringC} strokeLinecap="round"
            transform="rotate(-90 15 15)" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
          <text x="15" y="15.5" textAnchor="middle" dominantBaseline="middle" className="fill-foreground/70" style={{ fontSize: '8px', fontWeight: 800 }}>{roundsDone}/4</text>
        </svg>
      </div>

      <div className="space-y-3.5">
        {/* ═══ 1. Topic name & details ═══ */}
        <div className="rounded-2xl bg-card/80 border border-border/12 overflow-hidden relative"
          style={{ borderLeft: `3px solid ${color}`, boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)' }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(135deg, ${color}08, transparent 55%)` }} />
          <div className="relative p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[10px] font-bold text-muted-foreground/70 truncate">
                {[subjectName, unitName].filter(Boolean).join(' › ')}
              </span>
            </div>
            <h2 className="text-[15px] font-extrabold text-foreground leading-snug tracking-tight" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {getCleanName(topic.name)}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {topic.topicNumber != null && (
                <span className="text-[9px] font-mono font-bold px-2 py-1 rounded-lg bg-muted/30 text-muted-foreground flex items-center gap-1">
                  <Hash className="w-2.5 h-2.5" />{String(topic.topicNumber).padStart(3, '0')}
                </span>
              )}
              <span className="text-[9px] font-bold px-2 py-1 rounded-lg bg-muted/30 text-muted-foreground">
                {topic.difficulty === 'Easy' ? '🟢' : topic.difficulty === 'Hard' ? '🔴' : '🟡'} {topic.difficulty}
              </span>
              {topic.important && (
                <span className="text-[9px] font-bold px-2 py-1 rounded-lg bg-amber-500/12 text-amber-600 flex items-center gap-1">
                  <Flame className="w-2.5 h-2.5" /> Important
                </span>
              )}
              {topic.completedDate && (
                <span className="text-[9px] font-bold px-2 py-1 rounded-lg bg-secondary/12 text-secondary flex items-center gap-1">
                  <CalendarIcon className="w-2.5 h-2.5" /> Studied {formatDateRelative(topic.completedDate)}
                </span>
              )}
              <span className="text-[9px] font-mono font-bold px-2 py-1 rounded-lg bg-chart-5/10 text-chart-5 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> {formatStudyTime(topic.timeSpent)}
              </span>
            </div>
          </div>
        </div>

        {/* ═══ 2. STATUS — R1 · R2 · R3 · R4 ═══ */}
        <Card className="space-y-3.5">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.25em] flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              Status
            </Label>
            <span className="text-[9px] font-bold text-muted-foreground/50">Tap a round to open it</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {REVISION_KEYS.map(k => {
              const r = getRev(k);
              const isSel = selected === k;
              const done = r.status === 'complete';
              const prog = r.status === 'in_process';
              return (
                <motion.button key={k} whileTap={{ scale: 0.92 }}
                  onClick={() => { setSelected(k); navigator.vibrate?.(8); }}
                  className={`relative rounded-2xl py-3 px-1 flex flex-col items-center gap-1 border transition-all ${
                    isSel ? 'bg-card shadow-lg border-primary/40 ring-1 ring-primary/25' : 'bg-card/30 border-border/10 hover:bg-card/50'
                  }`}>
                  <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${done ? 'bg-secondary' : prog ? 'bg-chart-4' : 'bg-muted-foreground/25'}`} />
                  <span className="text-2xl select-none">{done ? '✅' : prog ? '🔄' : '⭕'}</span>
                  <span className={`text-sm font-black tracking-wide ${isSel ? 'text-foreground' : 'text-muted-foreground/60'}`}>{k}</span>
                  <span className={`text-[8px] font-bold uppercase tracking-[0.12em] ${done ? 'text-secondary' : prog ? 'text-chart-4' : 'text-muted-foreground/35'}`}>
                    {done ? 'Done' : prog ? 'Studying' : ORDINAL[k]}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Selected round status picker */}
          <div className="pt-3 border-t border-border/10 space-y-2.5">
            <p className="text-[11px] font-black text-foreground">
              {selected} · <span className="text-muted-foreground font-bold">{ROUND_TITLE[selected]}</span>
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {STATUS_OPTIONS.map(opt => {
                const active = rev.status === opt.value;
                const tone = opt.value === 'complete' ? 'bg-secondary/12 border-secondary/35 text-secondary'
                  : opt.value === 'in_process' ? 'bg-chart-4/12 border-chart-4/35 text-chart-4'
                  : 'bg-muted/30 border-border/25 text-foreground/70';
                return (
                  <motion.button key={opt.value} whileTap={{ scale: 0.94 }} onClick={() => setStatus(selected, opt.value)}
                    className={`h-10 rounded-xl border text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${
                      active ? tone : 'border-border/15 bg-card text-muted-foreground hover:bg-muted/30'
                    }`}>
                    <span>{opt.emoji}</span>{opt.label}
                  </motion.button>
                );
              })}
            </div>

            <AnimatePresence initial={false}>
              {rev.status !== 'pending' && (
                <motion.div key={rev.status} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  {rev.status === 'in_process' ? (
                    <div className="flex items-center gap-2 pt-1">
                      <CalendarIcon className="w-3.5 h-3.5 text-chart-4 shrink-0" />
                      <Label className="text-[9px] text-chart-4 font-bold shrink-0">Started</Label>
                      <Input type="date" value={rev.startedDate || ''}
                        onChange={e => update(selected, r => ({ ...r, startedDate: e.target.value || undefined }))}
                        className="h-8 text-[10px] flex-1 bg-card border-chart-4/20 font-mono rounded-xl" />
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-3.5 h-3.5 text-secondary shrink-0" />
                        <Label className="text-[9px] text-secondary font-bold shrink-0">Completed</Label>
                        <Input type="date" value={rev.completedDate || ''}
                          onChange={e => update(selected, r => ({ ...r, completedDate: e.target.value || undefined }))}
                          className="h-8 text-[10px] flex-1 bg-card border-secondary/20 font-mono rounded-xl" />
                      </div>
                      <div className="flex items-center gap-2 ml-5">
                        <Label className="text-[9px] text-muted-foreground font-bold shrink-0">Time</Label>
                        <Input type="time" value={rev.completedTime || ''}
                          onChange={e => update(selected, r => ({ ...r, completedTime: e.target.value || undefined }))}
                          className="h-8 text-[10px] w-28 bg-card border-border/20 font-mono rounded-xl" />
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>

        {/* ═══ 3. Round progress — same bars as the subject dashboard ═══ */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">📊 {selected} Progress</Label>
            <span className="text-[9px] font-bold text-muted-foreground/50">{ROUND_TITLE[selected]}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-secondary/12 text-secondary border border-secondary/20">✅ {progress.subjDone} done</span>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-muted/30 text-muted-foreground border border-border/15">📚 {Math.max(0, progress.subjTotal - progress.subjDone)} left</span>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-chart-5/10 text-chart-5 border border-chart-5/20 font-mono">⏱ {formatStudyTime(progress.subjTime)}</span>
          </div>
          <div className="space-y-2.5">
            <ProgressRow label="Topic" done={roundsDone} total={REVISION_KEYS.length} barClass="bg-primary" />
            <ProgressRow label="Unit" done={progress.unitDone} total={progress.unitTotal} barClass="bg-chart-4" />
            <ProgressRow label="Subject" done={progress.subjDone} total={progress.subjTotal} barClass="bg-secondary" />
          </div>
          <p className="text-[9px] text-muted-foreground/45 font-semibold text-center">
            {selected} done for {progress.unitDone} of {progress.unitTotal} topics in this unit
          </p>
        </Card>

        {/* ═══ 4. LOG STUDY TIME — for the selected revision round ═══ */}
        <RevisionTimeLog
          key={selected}
          roundKey={selected}
          rev={rev}
          allRoundsTime={allRoundsTime}
          onAdd={(mins, date, note) => addTime(selected, mins, date, note)}
          onDelete={idx => deleteEntry(selected, idx)}
          onEdit={(idx, mins, note, date) => editEntry(selected, idx, mins, note, date)}
          onReset={() => resetTime(selected)}
        />

        <div className="h-4" />
      </div>
    </BottomSheet>
  );
}

/* ═══════════════════════════════════════════════════════════
   LOG STUDY TIME (per revision round)
   ═══════════════════════════════════════════════════════════ */
function RevisionTimeLog({ roundKey, rev, allRoundsTime, onAdd, onDelete, onEdit, onReset }: {
  roundKey: RevisionKey;
  rev: RevisionData;
  allRoundsTime: number;
  onAdd: (mins: number, date: string, note?: string) => void;
  onDelete: (idx: number) => void;
  onEdit: (idx: number, mins: number, note: string, date: string) => void;
  onReset: () => void;
}) {
  const [addDate, setAddDate] = useState(() => getLocalDateStr(new Date()));
  const [addNote, setAddNote] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [customMinStr, setCustomMinStr] = useState('25');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editMin, setEditMin] = useState(0);
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const entries = rev.timeEntries || [];
  const grouped = entries.reduce((acc, e, idx) => {
    (acc[e.date] ||= []).push({ ...e, _idx: idx });
    return acc;
  }, {} as Record<string, (TimeEntry & { _idx: number })[]>);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const quickAdd = (mins: number) => { onAdd(mins, addDate, addNote.trim() || undefined); setAddNote(''); setShowCustom(false); };
  const startEdit = (idx: number) => { const e = entries[idx]; if (!e) return; setEditIdx(idx); setEditMin(e.minutes); setEditNote(e.note || ''); setEditDate(e.date); };
  const saveEdit = () => { if (editIdx === null || editMin <= 0) return; onEdit(editIdx, editMin, editNote, editDate); setEditIdx(null); };
  const customMins = parseInt(customMinStr, 10);

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center justify-between p-4 pb-2.5">
        <Label className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] flex items-center gap-1.5">
          <Timer className="w-3.5 h-3.5 text-chart-5" /> Log Study Time
          <span className="text-[9px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-md normal-case tracking-normal">{roundKey}</span>
        </Label>
        <span className="text-[10px] font-mono font-bold text-chart-5 bg-chart-5/8 px-2.5 py-1 rounded-lg">Total: {formatStudyTime(rev.timeSpent)}</span>
      </div>

      <div className="px-4 pb-2.5">
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-chart-5/6 border border-chart-5/12">
          <CalendarIcon className="w-3.5 h-3.5 text-chart-5 shrink-0" />
          <span className="text-[10px] font-bold text-chart-5">Logging for:</span>
          <div className="flex-1 flex items-center gap-1.5 min-w-0">
            <Input type="date" value={addDate} onChange={e => setAddDate(e.target.value)}
              className="h-6 text-[10px] bg-transparent border-none shadow-none p-0 font-mono text-chart-5 focus-visible:ring-0 w-[110px]" />
            <span className="text-[10px] font-bold text-chart-5/80 truncate">{formatDateRelative(addDate)}</span>
          </div>
        </div>
      </div>

      <div className="px-4 pb-2.5">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setConfirmReset(p => !p)} title="Reset time for this round"
            className="shrink-0 w-9 h-9 rounded-full border border-destructive/20 bg-destructive/8 flex items-center justify-center text-destructive">
            <RotateCcw className="w-3.5 h-3.5" />
          </motion.button>
          {[{ label: '+10m', value: 10 }, { label: '+30m', value: 30 }, { label: '+1h', value: 60 }].map(p => (
            <motion.button key={p.label} whileTap={{ scale: 0.9 }} onClick={() => quickAdd(p.value)}
              className="shrink-0 h-9 px-4 rounded-full border text-xs font-bold bg-chart-5/8 border-chart-5/20 text-chart-5 hover:bg-chart-5/15">
              {p.label}
            </motion.button>
          ))}
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowCustom(p => !p)}
            className={`shrink-0 h-9 px-4 rounded-full border text-xs font-bold ${showCustom ? 'bg-chart-5/20 border-chart-5/30 text-chart-5' : 'bg-muted/20 border-border/15 text-muted-foreground'}`}>
            ✏️ Custom
          </motion.button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {confirmReset && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mx-4 mb-2.5 p-2.5 rounded-xl bg-destructive/6 border border-destructive/15 flex items-center gap-2">
              <span className="flex-1 text-[10px] font-semibold text-destructive">Clear all {roundKey} time entries?</span>
              <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2" onClick={() => setConfirmReset(false)}>Cancel</Button>
              <Button size="sm" variant="destructive" className="h-7 text-[10px] px-2.5" onClick={() => { onReset(); setConfirmReset(false); }}>Clear</Button>
            </div>
          </motion.div>
        )}
        {showCustom && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-2.5 flex items-center gap-2">
              <Input type="text" inputMode="numeric" pattern="[0-9]*" value={customMinStr}
                onChange={e => setCustomMinStr(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-16 h-9 text-xs font-bold text-center bg-card border-chart-5/20 rounded-xl" />
              <span className="text-[10px] text-muted-foreground">min</span>
              <motion.button whileTap={{ scale: 0.9 }}
                onClick={() => { if (!isNaN(customMins) && customMins >= 1 && customMins <= 600) quickAdd(customMins); }}
                disabled={isNaN(customMins) || customMins < 1 || customMins > 600}
                className="h-9 px-4 rounded-full bg-chart-5 text-primary-foreground text-xs font-bold shadow-sm disabled:opacity-40">
                + Add {!isNaN(customMins) && customMins > 0 ? customMins : ''}m
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 pb-3">
        <Input placeholder="Note (optional)..." value={addNote} onChange={e => setAddNote(e.target.value)}
          className="h-8 text-[10px] bg-muted/15 border-border/10 rounded-xl" />
      </div>

      {entries.length > 0 ? (
        <div className="border-t border-border/10">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <div className="px-4 pb-3 space-y-1 max-h-72 overflow-y-auto">
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
                          <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="h-6 text-[10px] flex-1 bg-card border-border/15 font-mono rounded-lg" />
                          <Input type="text" inputMode="numeric" pattern="[0-9]*" value={editMin === 0 ? '' : String(editMin)}
                            onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setEditMin(v === '' ? 0 : parseInt(v, 10)); }}
                            className="w-14 h-6 text-[10px] font-mono text-center bg-card border-border/15 rounded-lg" />
                          <span className="text-[9px] text-muted-foreground">m</span>
                        </div>
                        <Input placeholder="Note..." value={editNote} onChange={e => setEditNote(e.target.value)} className="h-6 text-[10px] bg-card border-border/15 rounded-lg" />
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setEditIdx(null)} className="h-5 text-[9px] px-2">Cancel</Button>
                          <Button size="sm" onClick={saveEdit} disabled={editMin <= 0} className="h-5 text-[9px] px-2.5"><Save className="w-2.5 h-2.5 mr-0.5" /> Save</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border-l-[3px] border-l-chart-5/60 bg-card/30 hover:bg-card/50 transition-colors">
                        <span className="text-[10px] font-mono font-bold text-chart-5 shrink-0 w-12">{formatStudyTime(entry.minutes)}</span>
                        <span className="flex-1 text-[9px] text-muted-foreground truncate">{entry.note || '—'}</span>
                        <div className="flex items-center shrink-0">
                          <button onClick={() => startEdit(entry._idx)} className="p-1.5 rounded hover:bg-primary/10" aria-label="Edit entry"><Pencil className="w-3 h-3 text-muted-foreground/50 hover:text-primary" /></button>
                          <button onClick={() => onDelete(entry._idx)} className="p-1.5 rounded hover:bg-destructive/10" aria-label="Delete entry"><Trash2 className="w-3 h-3 text-muted-foreground/50 hover:text-destructive" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border-t border-border/10 px-4 py-3">
          <p className="text-[10px] text-muted-foreground/45 italic text-center">No time logged for {roundKey} yet</p>
        </div>
      )}

      <div className="border-t border-border/10 px-4 py-2.5 flex items-center justify-between">
        <span className="text-[9px] text-muted-foreground/50 font-bold">All revision rounds</span>
        <span className="text-[10px] font-mono font-bold text-muted-foreground">{formatStudyTime(allRoundsTime)}</span>
      </div>
    </Card>
  );
}
