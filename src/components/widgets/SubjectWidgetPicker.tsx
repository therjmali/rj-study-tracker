import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronDown, ChevronUp, Plus, ArrowRight, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import type { Subject } from '../../types';
import { getLastActiveUnit } from '../../lib/utils';
import { getLastActivity } from '../../lib/topicActivity';
import type { ActivityKind } from '../../lib/topicActivity';

export const WIDGET_MAX_SUBJECTS = 5;
const KIND_SYMBOL: Record<ActivityKind, string> = { completed: '✓', studied: '▶', revised: '↻' };

interface Row {
  subject: Subject;
  pct: number;
  done: number;
  total: number;
  unitId?: string;
  topicId?: string;
  lastLabel: string;
}

function buildRow(subject: Subject): Row {
  let done = 0, total = 0;
  subject.units.forEach(u => u.subTopics.forEach(t => { total++; if (t.completed) done++; }));
  const last = getLastActivity(subject);
  const unit = (last && subject.units.find(u => u.id === last.unitId)) || getLastActiveUnit(subject);
  return {
    subject, done, total,
    pct: total > 0 ? Math.round((done / total) * 100) : 0,
    unitId: unit?.id, topicId: last?.topicId,
    lastLabel: last ? `${KIND_SYMBOL[last.kind]} ${last.topicName}` : (unit ? unit.name.replace(/^Unit\s+\d+\s*:\s*/i, '') : 'Not started'),
  };
}

/**
 * Subject widget tab: pick WHICH subjects the home-screen widget shows (up to 5, in the order shown),
 * see a live preview of exactly that widget, and tap a row to resume where you last worked.
 */
export default function SubjectWidgetPicker({ subjects, selectedIds, onChange, onOpenUnit, onPin, pinned, highlightId }: {
  subjects: Subject[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onOpenUnit?: (subjectId: string, unitId?: string, topicId?: string) => void;
  onPin: () => void;
  pinned: boolean;
  /** A subject to scroll to / emphasise (opened from that subject's menu). */
  highlightId?: string;
}) {
  const rows = useMemo(() => new Map(subjects.map(s => [s.id, buildRow(s)])), [subjects]);
  const valid = selectedIds.filter(id => rows.has(id));
  const chosen = valid.map(id => rows.get(id)!);
  const full = valid.length >= WIDGET_MAX_SUBJECTS;

  const toggle = (id: string) => {
    if (valid.includes(id)) onChange(valid.filter(x => x !== id));
    else if (full) toast.error(`A widget shows up to ${WIDGET_MAX_SUBJECTS} subjects — remove one first`);
    else onChange([...valid, id]);
  };
  const move = (id: string, dir: -1 | 1) => {
    const i = valid.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= valid.length) return;
    const next = valid.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-primary" /> Subject widget
        </span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">{valid.length}/{WIDGET_MAX_SUBJECTS} · Interactive</span>
      </div>

      {/* Live preview — exactly what the home-screen widget draws */}
      <div className="rounded-3xl p-3.5 border border-white/15 shadow-xl relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1A1F26 0%, #151920 100%)', boxShadow: '0 12px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Subjects</span>
          <span className="text-[10px] font-bold text-slate-400">{chosen.length ? `${Math.round(chosen.reduce((a, r) => a + r.pct, 0) / chosen.length)}% avg` : '—'}</span>
        </div>
        {chosen.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-3 text-center">No subjects chosen — the widget follows your last active subject.<br /><span className="text-slate-500">Pick up to {WIDGET_MAX_SUBJECTS} below.</span></p>
        ) : (
          <div className="space-y-1.5">
            {chosen.map(r => (
              <button key={r.subject.id} type="button" onClick={() => onOpenUnit?.(r.subject.id, r.unitId, r.topicId)}
                className="w-full text-left rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.99] transition px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0" style={{ backgroundColor: r.subject.color + '30', color: '#fff', border: `1px solid ${r.subject.color}50` }}>{r.subject.shortName}</span>
                  <span className="text-[11px] font-bold text-white truncate flex-1">{r.subject.name}</span>
                  <span className="text-[10px] font-black text-[#34D399] shrink-0">{r.pct}%</span>
                </div>
                <p className="text-[9px] text-slate-400 font-medium truncate mt-0.5">{r.done} / {r.total} topics · {r.lastLabel}</p>
                <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden mt-1">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#E0764F] to-[#B4452B]" style={{ width: `${r.pct}%` }} />
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between text-[9px] text-slate-500 mt-2 font-semibold">
          <span>Tap a row → resume where you last worked</span>
          <span className="text-[#E0764F] font-bold">⚡ Resume ›</span>
        </div>
      </div>

      {/* Choose & order */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Choose subjects</p>
        <div className="space-y-1 max-h-64 overflow-y-auto pr-0.5">
          {subjects.map(s => {
            const r = rows.get(s.id)!;
            const idx = valid.indexOf(s.id);
            const on = idx >= 0;
            return (
              <div key={s.id} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition ${on ? 'bg-primary/10 border-primary/30' : 'bg-card/30 border-border/15'} ${highlightId === s.id ? 'ring-2 ring-primary/50' : ''}`}>
                <button type="button" onClick={() => toggle(s.id)} aria-pressed={on} aria-label={`${on ? 'Remove' : 'Add'} ${s.name} ${on ? 'from' : 'to'} the widget`}
                  className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition ${on ? 'bg-primary border-primary text-primary-foreground' : 'border-border/40 text-transparent'}`}>
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => toggle(s.id)} className="flex-1 min-w-0 text-left">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-[11px] font-bold text-foreground truncate">{s.name}</span>
                  </span>
                  <span className="block text-[9px] text-muted-foreground truncate">{r.pct}% · {r.lastLabel}</span>
                </button>
                {on && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <span className="text-[9px] font-black text-primary mr-1">#{idx + 1}</span>
                    <button type="button" onClick={() => move(s.id, -1)} disabled={idx === 0} aria-label="Move up in the widget" className="w-6 h-6 rounded-lg bg-muted/30 flex items-center justify-center disabled:opacity-25"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => move(s.id, 1)} disabled={idx === valid.length - 1} aria-label="Move down in the widget" className="w-6 h-6 rounded-lg bg-muted/30 flex items-center justify-center disabled:opacity-25"><ChevronDown className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {valid.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-[10px] font-bold text-muted-foreground mt-1.5 underline-offset-2 hover:underline">Clear selection</button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={onPin}
          className="flex-1 h-10 rounded-2xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-md">
          {pinned ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {pinned ? 'Widget Requested — Tap to Request Again' : 'Pin Subject Widget to Home Screen'}
        </button>
        {chosen[0] && onOpenUnit && (
          <button type="button" onClick={() => onOpenUnit(chosen[0].subject.id, chosen[0].unitId, chosen[0].topicId)}
            className="h-10 px-3 rounded-2xl bg-muted/40 hover:bg-muted/60 text-foreground text-xs font-bold flex items-center gap-1 transition-all" title="Open where you last worked in the first subject">
            <span>Launch</span><ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/70 leading-snug">
        Your widgets follow this list. Make a widget taller to show more rows. A widget you set up with its own picker keeps that choice.
      </p>
    </motion.div>
  );
}
