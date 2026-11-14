import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Subject, DailyLog, DbStudySession } from '../../types';
import { getEffectiveDayMinutes, getEffectiveStudyMinutes, getLocalDateStr, formatStudyTime } from '../../lib/utils';

/**
 * ⚖️ Growth comparison — this period vs the period right before it (same length).
 * One component, used in Analytics & Trends, the Study Report, the Daily Trend and the Calendar,
 * so every screen answers the same question the same way: "am I growing?".
 */

export type GrowthPeriod = 'day' | 'week' | 'month' | 'days30' | 'custom';

interface Range { from: string; to: string }
interface Frame { cur: Range; prev: Range; curLabel: string; prevLabel: string }

const PERIODS: { id: GrowthPeriod; label: string }[] = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: 'This month' },
  { id: 'days30', label: '30 days' },
  { id: 'custom', label: 'Custom' },
];
const MAX_DAYS = 400;
const LS_KEY = 'growth-compare-period-v1';

const parse = (s: string) => new Date(`${s}T12:00:00`);
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return getLocalDateStr(d); };
const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
const listDays = (r: Range) => { const out: string[] = []; const n = Math.min(MAX_DAYS, diffDays(r.from, r.to) + 1); for (let i = 0; i < n; i++) out.push(addDays(r.from, i)); return out; };
const short = (s: string) => parse(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const span = (r: Range) => (r.from === r.to ? short(r.from) : `${short(r.from)} – ${short(r.to)}`);

function buildFrame(period: GrowthPeriod, from: string, to: string): Frame | null {
  const today = getLocalDateStr();
  if (period === 'day') {
    const y = addDays(today, -1);
    return { cur: { from: today, to: today }, prev: { from: y, to: y }, curLabel: 'Today so far', prevLabel: 'Yesterday' };
  }
  if (period === 'week') {
    return { cur: { from: addDays(today, -6), to: today }, prev: { from: addDays(today, -13), to: addDays(today, -7) }, curLabel: 'Last 7 days', prevLabel: 'Previous 7 days' };
  }
  if (period === 'days30') {
    return { cur: { from: addDays(today, -29), to: today }, prev: { from: addDays(today, -59), to: addDays(today, -30) }, curLabel: 'Last 30 days', prevLabel: 'Previous 30 days' };
  }
  if (period === 'month') {
    const t = parse(today);
    const first = getLocalDateStr(new Date(t.getFullYear(), t.getMonth(), 1, 12));
    const pFirst = new Date(t.getFullYear(), t.getMonth() - 1, 1, 12);
    const pLast = new Date(t.getFullYear(), t.getMonth(), 0, 12).getDate();
    const pTo = getLocalDateStr(new Date(pFirst.getFullYear(), pFirst.getMonth(), Math.min(t.getDate(), pLast), 12));
    return { cur: { from: first, to: today }, prev: { from: getLocalDateStr(pFirst), to: pTo }, curLabel: 'This month so far', prevLabel: 'Same days last month' };
  }
  if (!from || !to || from > to) return null;
  const len = diffDays(from, to) + 1;
  return { cur: { from, to }, prev: { from: addDays(from, -len), to: addDays(from, -1) }, curLabel: 'Selected range', prevLabel: 'Range before it' };
}

interface Stats { total: number; days: number[]; active: number; avg: number; best: number; done: number; consistency: number }

function computeStats(r: Range, subjects: Subject[], dailyLogs: DailyLog[], dbSessions?: DbStudySession[]): Stats {
  const dates = listDays(r);
  const days = dates.map(d => getEffectiveDayMinutes(subjects as any, dailyLogs as any, d, dbSessions as any));
  const total = Math.round(getEffectiveStudyMinutes(subjects as any, dailyLogs as any, r.from, r.to, dbSessions as any));
  const active = days.filter(m => m > 0).length;
  let done = 0;
  subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => { if (t.completed && t.completedDate && t.completedDate >= r.from && t.completedDate <= r.to) done++; })));
  return { total, days, active, avg: active ? Math.round(total / active) : 0, best: Math.max(0, ...days), done, consistency: dates.length ? Math.round((active / dates.length) * 100) : 0 };
}

function delta(cur: number, prev: number) {
  const diff = cur - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : null;
  const dir: 'up' | 'down' | 'flat' = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  return { diff, pct, dir, isNew: prev === 0 && cur > 0 };
}

function Badge({ cur, prev, unit, invert = false }: { cur: number; prev: number; unit?: 'time' | 'pp' | 'n'; invert?: boolean }) {
  const d = delta(cur, prev);
  const good = invert ? d.dir === 'down' : d.dir === 'up';
  const tone = d.dir === 'flat' ? 'text-muted-foreground bg-muted/25 border-border/15'
    : good ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25' : 'text-rose-600 bg-rose-500/10 border-rose-500/25';
  const Icon = d.dir === 'up' ? TrendingUp : d.dir === 'down' ? TrendingDown : Minus;
  const abs = Math.abs(d.diff);
  const absTxt = unit === 'time' ? formatStudyTime(abs) : unit === 'pp' ? `${abs} pts` : String(abs);
  const label = d.dir === 'flat' ? 'No change' : d.isNew ? `New · +${absTxt}` : unit === 'pp' ? `${d.dir === 'up' ? '+' : '−'}${absTxt}` : `${d.dir === 'up' ? '+' : '−'}${d.pct}%`;
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-full border text-[9px] font-black ${tone}`} title={d.dir === 'flat' ? 'Same as before' : `${d.dir === 'up' ? '+' : '−'}${absTxt} vs previous`}>
      <Icon className="w-2.5 h-2.5" />{label}
    </span>
  );
}

function Metric({ label, cur, prev, fmt, unit, invert }: { label: string; cur: number; prev: number; fmt: (n: number) => string; unit?: 'time' | 'pp' | 'n'; invert?: boolean }) {
  return (
    <div className="rounded-xl border border-border/12 bg-muted/10 p-2.5 min-w-0">
      <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/80 truncate">{label}</p>
      <p className="text-base font-black font-mono text-foreground leading-tight mt-0.5 truncate">{fmt(cur)}</p>
      <div className="flex items-center justify-between gap-1 mt-1">
        <span className="text-[9px] text-muted-foreground/70 font-mono truncate">was {fmt(prev)}</span>
        <Badge cur={cur} prev={prev} unit={unit} invert={invert} />
      </div>
    </div>
  );
}

/** Two aligned series: previous (muted) behind, current (solid) in front. */
function PairedBars({ cur, prev }: { cur: number[]; prev: number[] }) {
  const n = Math.max(cur.length, prev.length);
  const max = Math.max(1, ...cur, ...prev);
  if (n === 0) return null;
  // Long ranges: bucket so bars never get thinner than ~4px
  const bucket = Math.max(1, Math.ceil(n / 40));
  const agg = (a: number[]) => { const o: number[] = []; for (let i = 0; i < n; i += bucket) o.push(a.slice(i, i + bucket).reduce((x, y) => x + y, 0)); return o; };
  const c = agg(cur), p = agg(prev), m = Math.max(1, ...c, ...p);
  void max;
  return (
    <div className="flex items-end gap-[3px] h-20" role="img" aria-label="Daily study time, current period against the previous one">
      {c.map((v, i) => (
        <div key={i} className="relative flex-1 min-w-[3px] h-full flex items-end">
          <div className="absolute inset-x-0 bottom-0 rounded-t-sm bg-muted-foreground/25" style={{ height: `${Math.max(2, ((p[i] || 0) / m) * 100)}%` }} />
          <motion.div className="relative w-full rounded-t-sm bg-primary" initial={{ height: 0 }} animate={{ height: `${Math.max(2, (v / m) * 100)}%` }} transition={{ duration: 0.45, delay: Math.min(i * 0.012, 0.4) }} style={{ opacity: v > 0 ? 1 : 0.35 }} />
        </div>
      ))}
    </div>
  );
}

export default function GrowthComparison({ subjects, dailyLogs, dbSessions, variant = 'full', defaultPeriod = 'week', title = 'Growth comparison', persistKey = LS_KEY }: {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  dbSessions?: DbStudySession[];
  variant?: 'full' | 'compact';
  defaultPeriod?: GrowthPeriod;
  title?: string;
  /** Each screen remembers its own period */
  persistKey?: string;
}) {
  const [period, setPeriod] = useState<GrowthPeriod>(() => {
    try { const v = localStorage.getItem(persistKey) as GrowthPeriod | null; if (v && PERIODS.some(p => p.id === v)) return v; } catch { /* ignore */ }
    return defaultPeriod;
  });
  const [from, setFrom] = useState(() => addDays(getLocalDateStr(), -6));
  const [to, setTo] = useState(() => getLocalDateStr());
  const [showSubjects, setShowSubjects] = useState(false);
  const pick = (p: GrowthPeriod) => { setPeriod(p); try { localStorage.setItem(persistKey, p); } catch { /* ignore */ } };

  const frame = useMemo(() => buildFrame(period, from, to), [period, from, to]);
  const stats = useMemo(() => {
    if (!frame) return null;
    return { cur: computeStats(frame.cur, subjects, dailyLogs, dbSessions), prev: computeStats(frame.prev, subjects, dailyLogs, dbSessions) };
  }, [frame, subjects, dailyLogs, dbSessions]);

  const perSubject = useMemo(() => {
    if (!frame || variant !== 'full' || !showSubjects) return [];
    const one = (s: Subject, r: Range) => {
      const sess = (dbSessions || []).filter(x => x.subjectId === s.id);
      return Math.round(getEffectiveStudyMinutes([s] as any, [] as any, r.from, r.to, sess as any));
    };
    return subjects
      .map(s => ({ s, cur: one(s, frame.cur), prev: one(s, frame.prev) }))
      .filter(x => x.cur > 0 || x.prev > 0)
      .sort((a, b) => (b.cur - b.prev) - (a.cur - a.prev));
  }, [frame, subjects, dbSessions, showSubjects, variant]);

  const headline = useMemo(() => {
    if (!stats) return null;
    const d = delta(stats.cur.total, stats.prev.total);
    if (stats.cur.total === 0 && stats.prev.total === 0) return { emoji: '🌱', text: 'No study time in either period yet — log a session to start the comparison.', tone: 'text-muted-foreground' };
    if (d.dir === 'flat') return { emoji: '⚖️', text: 'Exactly the same pace as the previous period.', tone: 'text-muted-foreground' };
    if (d.isNew) return { emoji: '🚀', text: `Fresh start — ${formatStudyTime(stats.cur.total)} studied, nothing in the period before.`, tone: 'text-emerald-600' };
    if (d.dir === 'up') return { emoji: '📈', text: `Up ${d.pct}% — ${formatStudyTime(d.diff)} more than the previous period.`, tone: 'text-emerald-600' };
    return { emoji: '📉', text: `Down ${Math.abs(d.pct ?? 0)}% — ${formatStudyTime(Math.abs(d.diff))} less than the previous period.`, tone: 'text-rose-600' };
  }, [stats]);

  const compact = variant === 'compact';
  const hm = (n: number) => formatStudyTime(n);

  return (
    <section className="rounded-2xl bg-card/80 border border-border/12 overflow-hidden" style={{ boxShadow: '0 2px 12px hsl(var(--foreground) / 0.03)' }} aria-label={title}>
      <div className="px-3.5 pt-3 pb-2 flex items-center gap-2">
        <span className="text-base leading-none" aria-hidden>⚖️</span>
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{title}</h3>
        {frame && <span className="ml-auto text-[9px] font-mono text-muted-foreground/70 truncate">{span(frame.cur)} <span className="opacity-60">vs</span> {span(frame.prev)}</span>}
      </div>

      <div className="px-3.5 pb-2 flex gap-1.5 overflow-x-auto scrollbar-hide" role="tablist" aria-label="Comparison period" onPointerDown={e => e.stopPropagation()}>
        {PERIODS.map(p => (
          <button key={p.id} type="button" role="tab" aria-selected={period === p.id} onClick={() => pick(p.id)}
            className={`shrink-0 h-7 px-3 rounded-full border text-[10px] font-bold transition-colors active:scale-95 ${period === p.id ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-muted/15 border-border/15 text-muted-foreground'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="px-3.5 pb-2 flex items-center gap-2 text-[10px]">
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="h-8 flex-1 rounded-xl border border-border/20 bg-card px-2 font-mono" aria-label="From date" />
          <span className="text-muted-foreground">→</span>
          <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="h-8 flex-1 rounded-xl border border-border/20 bg-card px-2 font-mono" aria-label="To date" />
        </div>
      )}

      {!frame || !stats ? (
        <p className="px-3.5 pb-4 text-[11px] text-muted-foreground">Pick a valid start and end date to compare.</p>
      ) : (
        <div className="px-3.5 pb-3.5 space-y-3">
          {headline && (
            <div className="flex items-start gap-2 rounded-xl bg-muted/12 border border-border/10 px-3 py-2">
              <span className="text-base leading-none mt-0.5">{headline.emoji}</span>
              <p className={`text-[11px] font-bold leading-snug ${headline.tone}`}>{headline.text}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Metric label="Study time" cur={stats.cur.total} prev={stats.prev.total} fmt={hm} unit="time" />
            <Metric label="Topics done" cur={stats.cur.done} prev={stats.prev.done} fmt={n => String(n)} unit="n" />
            {!compact && <>
              <Metric label="Active days" cur={stats.cur.active} prev={stats.prev.active} fmt={n => String(n)} unit="n" />
              <Metric label="Avg / active day" cur={stats.cur.avg} prev={stats.prev.avg} fmt={hm} unit="time" />
              <Metric label="Best day" cur={stats.cur.best} prev={stats.prev.best} fmt={hm} unit="time" />
              <Metric label="Consistency" cur={stats.cur.consistency} prev={stats.prev.consistency} fmt={n => `${n}%`} unit="pp" />
            </>}
          </div>

          {stats.cur.days.length > 1 && (
            <div className="space-y-1.5">
              <PairedBars cur={stats.cur.days} prev={stats.prev.days} />
              <div className="flex items-center justify-center gap-4 text-[9px] font-bold text-muted-foreground">
                <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-primary" />{frame.curLabel}</span>
                <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/30" />{frame.prevLabel}</span>
              </div>
            </div>
          )}

          {!compact && (
            <div>
              <button type="button" onClick={() => setShowSubjects(s => !s)} aria-expanded={showSubjects}
                className="w-full flex items-center gap-2 h-9 px-3 rounded-xl border border-border/15 bg-muted/10 text-[11px] font-bold text-foreground/80 active:scale-[0.99] transition">
                📚 Growth by subject
                <ChevronDown className={`w-4 h-4 ml-auto text-muted-foreground transition-transform ${showSubjects ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {showSubjects && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="pt-2 space-y-1.5">
                      {perSubject.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-2">No subject time in these periods.</p>}
                      {perSubject.map(({ s, cur, prev }) => {
                        const top = Math.max(1, cur, prev);
                        return (
                          <div key={s.id} className="rounded-xl border border-border/10 bg-card/50 px-2.5 py-2">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                              <span className="text-[11px] font-bold truncate flex-1">{s.shortName || s.name}</span>
                              <span className="text-[10px] font-mono text-foreground/80">{hm(cur)}</span>
                              <Badge cur={cur} prev={prev} unit="time" />
                            </div>
                            <div className="mt-1.5 space-y-1">
                              <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(cur / top) * 100}%`, background: s.color }} /></div>
                              <div className="h-1 rounded-full bg-muted/20 overflow-hidden"><div className="h-full rounded-full bg-muted-foreground/35" style={{ width: `${(prev / top) * 100}%` }} /></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {frame.cur.to === getLocalDateStr() && (
            <p className="text-[9px] text-muted-foreground/70 text-center">Current period is still running — the comparison updates live as you study.</p>
          )}
        </div>
      )}
    </section>
  );
}
