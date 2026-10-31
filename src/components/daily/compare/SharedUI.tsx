import { useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  CartesianGrid, ReferenceLine,
} from 'recharts';
import GlowCard from '../../shared/GlowCard';
import { fmtDD, pctChange } from './utils';
import type { PeriodStats } from './utils';

/* ═══ Trend Badge ═══ */
export function TrendBadge({ pct, invert }: { pct: number; invert?: boolean }) {
  if (pct === 0) return <span className="text-[10px] text-muted-foreground font-bold flex items-center gap-0.5"><Minus className="w-3 h-3" /> 0%</span>;
  const pos = invert ? pct < 0 : pct > 0;
  return (
    <span className={`text-[10px] font-bold flex items-center gap-0.5 ${pos ? 'text-secondary' : 'text-destructive'}`}>
      {pct > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {pct > 0 ? '+' : ''}{pct}%
    </span>
  );
}

/* ═══ Compact Compare Metric — single row ═══ */
export function CompareMetric({ label, icon, current, previous, format: fmt, invert }: {
  label: string; icon: React.ReactNode; current: number; previous: number;
  format?: (n: number) => string; invert?: boolean;
}) {
  const f = fmt || ((n: number) => String(Math.round(n * 10) / 10));
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-card/40 border border-border/15">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider leading-none">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-sm font-black font-mono text-foreground leading-none">{f(current)}</span>
          <span className="text-[9px] text-muted-foreground">vs {f(previous)}</span>
        </div>
      </div>
      <TrendBadge pct={pctChange(current, previous)} invert={invert} />
    </div>
  );
}

/* ═══ Collapsible Section ═══ */
export function Section({ title, icon, open, onToggle, badge, gradient, children }: {
  title: string; icon: string; open: boolean; onToggle: () => void;
  badge?: React.ReactNode; gradient?: string; children: React.ReactNode;
}) {
  return (
    <GlowCard paper className="overflow-hidden">
      <button onClick={onToggle}
        className={`w-full flex items-center gap-3 p-3.5 text-left transition-colors ${gradient || 'hover:bg-card/30'}`}>
        <span className="text-base">{icon}</span>
        <h4 className="text-[13px] font-bold text-foreground flex-1 min-w-0 truncate">{title}</h4>
        {badge && <div className="shrink-0">{badge}</div>}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="overflow-hidden">
            <div className="px-3.5 pb-3.5 space-y-2.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlowCard>
  );
}

/* ═══ Category Group Header ═══ */
export function CategoryHeader({ title, icon, subtitle }: { title: string; icon: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-4 pb-1.5">
      <span className="text-sm">{icon}</span>
      <div className="flex-1 min-w-0">
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">{title}</h3>
        {subtitle && <p className="text-[9px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex-1 h-px bg-border/20" />
    </div>
  );
}

/* ═══ Custom Tooltip for dual-line chart ═══ */
function DualLineTooltip({ active, payload, label, labelCurrent, labelPrevious }: any) {
  if (!active || !payload?.length) return null;
  const cur = payload.find((p: any) => p.dataKey === 'current');
  const prev = payload.find((p: any) => p.dataKey === 'previous');
  return (
    <div className="rounded-xl px-3 py-2 shadow-xl border border-border/20 backdrop-blur-xl"
      style={{ background: 'hsl(var(--card)/0.96)' }}>
      <p className="text-[10px] font-bold text-foreground mb-1">{label}</p>
      {prev && (
        <div className="flex items-center gap-2 mb-0.5">
          <span className="w-3 h-0 border-t-[2px] border-dashed border-muted-foreground/50" />
          <span className="text-[9px] text-muted-foreground">{labelPrevious} :</span>
          <span className="text-[10px] font-bold text-muted-foreground ml-auto">{prev.value}</span>
        </div>
      )}
      {cur && (
        <div className="flex items-center gap-2">
          <span className="w-3 h-[3px] rounded-full bg-primary" />
          <span className="text-[10px] font-bold text-primary">{labelCurrent} :</span>
          <span className="text-[10px] font-black text-primary ml-auto">{cur.value}</span>
        </div>
      )}
    </div>
  );
}

/* ═══ Active Dot with glow ═══ */
function GlowDot(props: any) {
  const { cx, cy, fill } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={fill} opacity={0.15} />
      <circle cx={cx} cy={cy} r={3.5} fill="hsl(var(--card))" stroke={fill} strokeWidth={2} />
    </g>
  );
}

/* ═══ Overlay Line/Area Chart — Premium Dual-Line ═══ */
export function OverlayLineChart({ current, previous, labelCurrent, labelPrevious }: {
  current: PeriodStats; previous: PeriodStats; labelCurrent: string; labelPrevious: string;
}) {
  const gId = useId().replace(/:/g, '');
  const data = current.daily.map((d, i) => ({
    date: fmtDD(d.date),
    current: d.topics,
    previous: previous.daily[i]?.topics ?? 0,
  }));
  const showDots = data.length <= 14;

  return (
    <div className="rounded-xl bg-card/30 border border-border/15 p-3">
      <div className="flex items-center gap-5 mb-2.5 justify-center">
        <span className="flex items-center gap-1.5 text-[10px] font-bold">
          <span className="relative flex items-center">
            <span className="w-5 h-[3px] rounded-full bg-primary" />
            {showDots && <span className="absolute left-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full bg-primary border border-card" />}
          </span>
          <span className="text-primary">{labelCurrent}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
          <span className="w-5 h-0 border-t-[2px] border-dashed border-muted-foreground/40" />
          <span className="text-muted-foreground/70">{labelPrevious}</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ left: -10, top: 8, right: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={`cg_${gId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity={0.12} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.01} />
            </linearGradient>
            <filter id={`glow_${gId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border)/0.1)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9, fontWeight: 600 }} tickLine={false} axisLine={false}
            interval={Math.max(0, Math.floor(data.length / 7))} />
          <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} width={22} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<DualLineTooltip labelCurrent={labelCurrent} labelPrevious={labelPrevious} />}
            cursor={{ stroke: 'hsl(var(--foreground)/0.08)', strokeWidth: 1 }} />
          <Area type="monotone" dataKey="previous" stroke="hsl(var(--muted-foreground)/0.35)" fill="none"
            strokeWidth={1.8} strokeDasharray="6 4" name={labelPrevious} dot={false}
            activeDot={{ r: 3, fill: 'hsl(var(--muted-foreground)/0.5)', stroke: 'hsl(var(--card))', strokeWidth: 1.5 }} />
          <Area type="monotone" dataKey="current" stroke="hsl(var(--primary))" fill={`url(#cg_${gId})`}
            strokeWidth={2.5} name={labelCurrent} filter={`url(#glow_${gId})`}
            dot={showDots ? { r: 3, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2 } as any : false}
            activeDot={<GlowDot fill="hsl(var(--primary))" />} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══ Difficulty Radar ═══ */
export function DifficultyRadar({ current, previous }: { current: PeriodStats; previous: PeriodStats }) {
  const data = [
    { d: 'Easy', current: current.easyDone, previous: previous.easyDone },
    { d: 'Medium', current: current.mediumDone, previous: previous.mediumDone },
    { d: 'Hard', current: current.hardDone, previous: previous.hardDone },
  ];
  return (
    <div className="rounded-xl bg-card/30 border border-border/15 p-3">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center mb-1">Difficulty Breakdown</p>
      <ResponsiveContainer width="100%" height={130}>
        <RadarChart data={data}>
          <PolarGrid stroke="hsl(var(--border)/0.3)" />
          <PolarAngleAxis dataKey="d" tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 700 }} />
          <PolarRadiusAxis tick={false} axisLine={false} />
          <Radar name="Previous" dataKey="previous" stroke="hsl(var(--muted-foreground)/0.5)" fill="hsl(var(--muted-foreground)/0.1)" strokeDasharray="4 3" />
          <Radar name="Current" dataKey="current" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.15)" strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══ Hourly Heatmap ═══ */
export function HourlyHeatmap({ buckets }: { buckets: number[] }) {
  const max = Math.max(...buckets, 1);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-1">
        {buckets.slice(0, 12).map((v, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div className="w-full aspect-square rounded-md transition-colors" style={{
              backgroundColor: v > 0 ? `hsl(var(--primary) / ${Math.max(0.12, v / max)})` : 'hsl(var(--muted)/0.15)',
            }} />
            <span className="text-[7px] text-muted-foreground font-mono">{i}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-1">
        {buckets.slice(12).map((v, i) => (
          <div key={i + 12} className="flex flex-col items-center gap-0.5">
            <div className="w-full aspect-square rounded-md transition-colors" style={{
              backgroundColor: v > 0 ? `hsl(var(--primary) / ${Math.max(0.12, v / max)})` : 'hsl(var(--muted)/0.15)',
            }} />
            <span className="text-[7px] text-muted-foreground font-mono">{i + 12}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="text-[8px] text-muted-foreground">Less</span>
        <div className="flex gap-0.5">{[0.1, 0.3, 0.5, 0.7, 1].map(o => (
          <div key={o} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `hsl(var(--primary) / ${o})` }} />
        ))}</div>
        <span className="text-[8px] text-muted-foreground">More</span>
      </div>
    </div>
  );
}

/* ═══ Diff Pill — label prominent ═══ */
export function DiffPill({ label, current, prev, color }: { label: string; current: number; prev: number; color: string }) {
  const diff = current - prev;
  return (
    <div className={`text-center p-2.5 rounded-xl bg-${color}/5 border border-${color}/15`}>
      <p className={`text-[9px] font-bold text-${color} uppercase tracking-wider mb-0.5`}>{label}</p>
      <p className="text-base font-black font-mono text-foreground leading-none">{current}</p>
      {diff !== 0 && (
        <span className={`text-[10px] font-bold ${diff > 0 ? 'text-secondary' : 'text-destructive'}`}>
          {diff > 0 ? '+' : ''}{diff}
        </span>
      )}
    </div>
  );
}

/* ═══ Badge Pill ═══ */
export function BadgePill({ text, color }: { text: string; color?: string }) {
  const c = color || 'primary';
  return (
    <span className={`text-[9px] px-2 py-0.5 rounded-full bg-${c}/10 text-${c} font-bold border border-${c}/20 whitespace-nowrap`}>
      {text}
    </span>
  );
}
