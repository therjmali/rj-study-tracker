import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Share2, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import type { DailyLog, DbStudySession, StudyGoals, Subject } from '../../types';
import { PERIODS, buildReport, deltaLabel, fmtMinutes, verdict, type PeriodId } from '../../lib/progressReport';
import { getLocalDateStr } from '../../lib/utils';
import { useCountUp } from '../../hooks/useCountUp';

interface Props {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  studyGoals: StudyGoals;
  dbSessions?: DbStudySession[];
}

const KEY = 'rj-progress-period-v1';

function load(): { period: PeriodId; from: string; to: string } {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (p && PERIODS.some(x => x.id === p.period)) return { period: p.period, from: p.from ?? '', to: p.to ?? '' };
  } catch { /* ignore */ }
  return { period: 'today', from: '', to: '' };
}

function Ring({ pct, size = 112 }: { pct: number; size?: number }) {
  const stroke = 9, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={stroke} />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, pct / 100)) }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
    </svg>
  );
}

function Delta({ now, before, unit }: { now: number; before: number; unit: string }) {
  const d = deltaLabel(now, before);
  if (d.up === null) return <span className="text-[10px] font-semibold text-muted-foreground">vs {unit}: {d.text}</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${d.up ? 'text-emerald-600' : 'text-destructive'}`}>
      {d.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{d.text} <span className="font-semibold text-muted-foreground">vs {unit}</span>
    </span>
  );
}

/**
 * Progress card — the same card the nightly notification opens. Switch between Today, Yesterday, 1 week,
 * 30 days, a custom range or the complete journey.
 */
export default function ProgressCard({ subjects, dailyLogs, studyGoals, dbSessions }: Props) {
  const init = useRef(load()).current;
  const [period, setPeriod] = useState<PeriodId>(init.period);
  const today = getLocalDateStr();
  const [from, setFrom] = useState(init.from || '');
  const [to, setTo] = useState(init.to || today);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ period, from, to })); } catch { /* ignore */ } }, [period, from, to]);

  const report = useMemo(
    () => buildReport({ subjects, dailyLogs, dbSessions, goals: studyGoals }, period, period === 'custom' ? { from: from || to, to: to || today } : undefined),
    [subjects, dailyLogs, dbSessions, studyGoals, period, from, to, today],
  );
  const v = verdict(report);
  const shownMinutes = useCountUp(report.minutes, 900, 0);
  const maxBar = Math.max(1, ...report.series.map(p => p.minutes));
  const subjectTotal = report.subjects.reduce((a, s) => a + s.minutes, 0) || 1;
  const prevUnit = period === 'today' ? 'yesterday' : period === 'yesterday' ? 'day before' : 'previous';

  const share = async () => {
    const text = [
      `📊 ${report.title} · ${report.subtitle}`,
      `⏱ ${fmtMinutes(report.minutes)} studied · ✅ ${report.topics} topics · 🎯 ${report.score}% of goal`,
      report.streak ? `🔥 ${report.streak}-day streak` : '',
    ].filter(Boolean).join('\n');
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast.success('Copied to clipboard'); } } catch { /* cancelled */ }
  };

  return (
    <section id="progress-card" aria-label="Progress card" className="rounded-3xl overflow-hidden border border-border/20 shadow-lg shadow-primary/10 scroll-mt-20">
      {/* ── Hero ── */}
      <div className="relative text-primary-foreground p-4 sm:p-5" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, hsl(var(--primary)) 62%, #000) 0%, color-mix(in srgb, hsl(var(--primary)) 52%, #000) 55%, color-mix(in srgb, hsl(var(--secondary)) 58%, #000) 130%)' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,0.22), transparent 55%)' }} />
        <div className="relative flex items-center justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Progress card</p>
            <p className="text-[15px] font-extrabold leading-tight truncate">{report.title}</p>
            <p className="text-[11px] opacity-85 truncate">{report.subtitle}</p>
          </div>
          <button onClick={share} aria-label="Share progress" className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center active:scale-90 transition-all shrink-0"><Share2 className="w-4 h-4" /></button>
        </div>

        {/* period chips */}
        <div role="tablist" aria-label="Period" className="relative flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1 mb-3">
          {PERIODS.map(p => {
            const on = p.id === period;
            return (
              <button key={p.id} role="tab" aria-selected={on} onClick={() => setPeriod(p.id)}
                className={`shrink-0 px-3 h-8 rounded-full text-[11px] font-bold transition-all active:scale-95 ${on ? 'bg-white text-[#1d1d1f] shadow-md' : 'bg-white/15 text-primary-foreground hover:bg-white/25'}`}>
                {p.label}
              </button>
            );
          })}
        </div>

        {period === 'custom' && (
          <div className="relative flex items-center gap-2 mb-3">
            <input type="date" aria-label="From date" value={from || report.from} max={to || today} onChange={e => setFrom(e.target.value)}
              className="flex-1 min-w-0 h-9 rounded-xl bg-white/90 text-[#1d1d1f] text-[12px] font-semibold px-2.5 border-0" />
            <span className="text-[11px] font-bold opacity-80">to</span>
            <input type="date" aria-label="To date" value={to} min={from || undefined} max={today} onChange={e => setTo(e.target.value)}
              className="flex-1 min-w-0 h-9 rounded-xl bg-white/90 text-[#1d1d1f] text-[12px] font-semibold px-2.5 border-0" />
          </div>
        )}

        <div className="relative flex items-center gap-4">
          <div className="relative shrink-0">
            <Ring pct={report.score} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[26px] font-black font-mono leading-none">{report.score}<span className="text-[13px]">%</span></span>
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-85 mt-0.5">of goal</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[34px] sm:text-[38px] font-black font-mono leading-none tabular-nums">{fmtMinutes(shownMinutes)}</p>
            <p className="text-[11px] font-semibold opacity-90 mt-1">studied · {report.topics} topic{report.topics === 1 ? '' : 's'} completed</p>
            <p className="text-[11px] opacity-90 mt-1.5 leading-snug">{v.emoji} {v.line}</p>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="bg-card p-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { k: 'Study time', v: fmtMinutes(report.minutes), sub: report.goalMinutes ? `goal ${fmtMinutes(report.goalMinutes)}` : '', d: report.prev ? { n: report.minutes, b: report.prev.minutes } : null },
            { k: 'Topics', v: String(report.topics), sub: report.goalTopics ? `goal ${report.goalTopics}` : '', d: report.prev ? { n: report.topics, b: report.prev.topics } : null },
            { k: 'Active days', v: `${report.activeDays}/${report.days}`, sub: report.avgPerActiveDay ? `${fmtMinutes(report.avgPerActiveDay)} avg` : '', d: null },
          ].map(t => (
            <div key={t.k} className="rounded-2xl border border-border/20 bg-muted/20 px-2.5 py-2.5 text-center">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground">{t.k}</p>
              <p className="text-[17px] font-black font-mono text-foreground leading-tight mt-0.5">{t.v}</p>
              <p className="text-[9px] text-muted-foreground min-h-[12px]">{t.sub}</p>
              {t.d && <div className="mt-0.5"><Delta now={t.d.n} before={t.d.b} unit={prevUnit} /></div>}
            </div>
          ))}
        </div>

        {/* bars */}
        {report.days > 1 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Study time per {report.series.length < report.days ? 'period' : 'day'}</p>
              {report.best && <p className="text-[10px] font-semibold text-muted-foreground inline-flex items-center gap-1"><Trophy className="w-3 h-3 text-chart-4" /> Best {fmtMinutes(report.best.minutes)}</p>}
            </div>
            <div className="flex items-end gap-[3px] h-24" role="img" aria-label="Bar chart of study minutes">
              {report.series.map((p, i) => (
                <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
                  <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(p.minutes > 0 ? 6 : 2, (p.minutes / maxBar) * 100)}%` }}
                    transition={{ duration: 0.6, delay: Math.min(i * 0.015, 0.5), ease: [0.22, 1, 0.36, 1] }}
                    title={`${p.label}: ${fmtMinutes(p.minutes)} · ${p.topics} topics`}
                    className={`w-full rounded-t-md ${p.minutes > 0 ? 'bg-gradient-to-t from-primary to-primary/60' : 'bg-muted/50'}`} />
                </div>
              ))}
            </div>
            <div className="flex gap-[3px] mt-1">
              {report.series.map((p, i) => (
                <span key={i} className="flex-1 min-w-0 text-center text-[8px] font-semibold text-muted-foreground truncate">{report.series.length > 16 && i % 3 ? '' : p.label}</span>
              ))}
            </div>
          </div>
        )}

        {/* subjects */}
        {report.subjects.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Where your time went</p>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-muted/40">
              {report.subjects.filter(s => s.minutes > 0).map(s => (
                <motion.div key={s.id} initial={{ width: 0 }} animate={{ width: `${(s.minutes / subjectTotal) * 100}%` }} transition={{ duration: 0.7 }} style={{ backgroundColor: s.color }} title={s.name} />
              ))}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {report.subjects.slice(0, 6).map(s => (
                <li key={s.id} className="flex items-center gap-1.5 min-w-0 text-[11px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="font-semibold text-foreground truncate">{s.name}</span>
                  <span className="ml-auto font-mono font-bold text-muted-foreground shrink-0">{fmtMinutes(s.minutes)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-between rounded-2xl bg-muted/20 border border-border/20 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-foreground"><Flame className="w-4 h-4 text-orange-500" /> {report.streak}-day streak</span>
          <span className="text-[11px] text-muted-foreground font-medium">{report.sessions} session{report.sessions === 1 ? '' : 's'} logged</span>
        </div>
      </div>
    </section>
  );
}
