import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { BookOpen, Clock, Trophy, TrendingUp, ChevronDown, ChevronRight, CheckCircle2, BarChart3 } from 'lucide-react';
import type { Subject, DailyLog, DbStudySession, SubTopic } from '../../types';
import { formatStudyHours, formatStudyTime, getEffectiveDayMinutes, getEffectiveStudyMinutes, getUnifiedTotalMinutes, getLocalDateStr, formatDate, readableInk } from '../../lib/utils';

type TimeFilter = 'all' | 'today' | 'weekly' | 'monthly' | 'custom';

interface Props {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  dbSessions?: DbStudySession[];
  /** Pre-computed date range */
  range: { from: string; to: string };
  /** Optional: show built-in filter pills */
  showFilter?: boolean;
  /** Hide the bottom 4-stat shelf (when parent already shows consolidated cards) */
  hideShelf?: boolean;
  /** When true, use getUnifiedTotalMinutes for total hours (matches dashboard all-time) */
  isAllTime?: boolean;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string) => void;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function dayLabel(dateStr: string, idx: number, all: string[]): string {
  const p = dateStr.split('-');
  if (p.length !== 3) return dateStr;
  const day = parseInt(p[2], 10);
  const month = parseInt(p[1], 10);
  if (idx > 0) {
    const pp = all[idx - 1].split('-');
    const prevMonth = pp.length === 3 ? parseInt(pp[1], 10) : month;
    if (month !== prevMonth) return `${MONTH_ABBR[month - 1]} ${day}`;
  }
  return String(day);
}

/* ─── Tooltip ─── */
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-xl bg-card/95 backdrop-blur-xl border border-border/25 shadow-xl p-3 min-w-[140px]">
      <p className="text-[10px] font-bold text-foreground mb-1.5">📅 {d.fullDate}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-chart-4" />
          <span className="text-[10px] text-muted-foreground flex-1">Topics</span>
          <span className="text-[11px] font-black font-mono text-foreground">{d.topics}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm bg-primary" />
          <span className="text-[10px] text-muted-foreground flex-1">Hours</span>
          <span className="text-[11px] font-black font-mono text-foreground">{formatStudyHours(d.hours)}</span>
        </div>
      </div>
    </div>
  );
}

export default function TrendAnalysis({ subjects, dailyLogs, dbSessions, range, showFilter, hideShelf, isAllTime, onOpenTopicDetail, onNavigate }: Props) {
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  const { from, to: rawTo } = range;

  // Cap end date to today — never show future dates on the chart
  const today = getLocalDateStr();
  const to = rawTo > today ? today : rawTo;

  // ── Chart data ──
  const chartData = useMemo(() => {
    const startDate = new Date(from + 'T00:00:00');
    const endDate = new Date(to + 'T00:00:00');
    const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);

    const rawDates: string[] = [];
    const raw: { dateStr: string; topics: number; mins: number }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const ds = getLocalDateStr(d);
      rawDates.push(ds);
      let topics = 0;
      subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
        if (t.completed && t.completedDate === ds) topics++;
      })));
      const mins = getEffectiveDayMinutes(subjects, dailyLogs, ds, dbSessions);
      raw.push({ dateStr: ds, topics, mins });
    }

    // Aggregate into buckets if > 35 days
    if (raw.length > 35) {
      const bucketSize = Math.ceil(raw.length / 30);
      const sampled: { date: string; fullDate: string; topics: number; hours: number }[] = [];
      for (let i = 0; i < raw.length; i += bucketSize) {
        const chunk = raw.slice(i, i + bucketSize);
        const topics = chunk.reduce((a, d) => a + d.topics, 0);
        const totalMins = chunk.reduce((a, d) => a + d.mins, 0);
        const hours = Math.round((totalMins / 60) * 100) / 100;
        const fd = parseInt(chunk[0].dateStr.split('-')[2], 10);
        const ld = parseInt(chunk[chunk.length - 1].dateStr.split('-')[2], 10);
        const fm = parseInt(chunk[0].dateStr.split('-')[1], 10);
        const pm = i > 0 ? parseInt(raw[i - 1].dateStr.split('-')[1], 10) : fm;
        const prefix = fm !== pm ? `${MONTH_ABBR[fm - 1]} ` : '';
        const label = chunk.length > 1 ? `${prefix}${fd}-${ld}` : `${prefix}${fd}`;
        const full = chunk.length > 1
          ? `${formatDate(chunk[0].dateStr)} – ${formatDate(chunk[chunk.length - 1].dateStr)}`
          : formatDate(chunk[0].dateStr);
        sampled.push({ date: label, fullDate: full, topics, hours });
      }
      return sampled;
    }

    return raw.map((d, i) => ({
      date: dayLabel(d.dateStr, i, rawDates),
      fullDate: formatDate(d.dateStr),
      topics: d.topics,
      hours: Math.round((d.mins / 60) * 100) / 100,
    }));
  }, [subjects, dailyLogs, dbSessions, from, to]);

  // ── Summary stats ──
  const stats = useMemo(() => {
    let totalTopics = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate >= from && t.completedDate <= to) totalTopics++;
    })));

    const totalMins = isAllTime
      ? getUnifiedTotalMinutes(subjects, dbSessions, dailyLogs)
      : getEffectiveStudyMinutes(subjects, dailyLogs, from, to, dbSessions);
    const totalHours = totalMins / 60;

    const totalDays = Math.max(1, Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000) + 1);
    const avgPerDay = Math.round((totalTopics / totalDays) * 10) / 10;

    // Best day
    const byDay: Record<string, number> = {};
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate >= from && t.completedDate <= to) {
        byDay[t.completedDate] = (byDay[t.completedDate] || 0) + 1;
      }
    })));
    let bestDate = '';
    let bestCount = 0;
    Object.entries(byDay).forEach(([d, c]) => { if (c > bestCount) { bestDate = d; bestCount = c; } });

    return { totalTopics, totalHours, avgPerDay, bestDate, bestCount };
  }, [subjects, dailyLogs, dbSessions, from, to, isAllTime]);

  // ── Subject breakdown (includes session manager time) ──
  const subjectBreakdown = useMemo(() => {
    // Build per-subject session time for the date range
    const sessMinsBySubject = new Map<string, number>();
    const sessOverlapBySubject = new Map<string, number>();
    const unmappedMins = { total: 0 };
    const subjectIds = new Set(subjects.map(s => s.id));
    if (dbSessions) {
      dbSessions.forEach(s => {
        if (s.date < from || s.date > to) return;
        const sid = s.subjectId && s.subjectId !== 'general' && s.subjectId !== '_general' ? s.subjectId : '';
        if (sid && subjectIds.has(sid)) {
          sessMinsBySubject.set(sid, (sessMinsBySubject.get(sid) || 0) + (s.minutes || 0));
          if (s.type === 'Topic' || s.type === 'Unit') {
            sessOverlapBySubject.set(sid, (sessOverlapBySubject.get(sid) || 0) + (s.minutes || 0));
          }
        } else {
          unmappedMins.total += s.minutes || 0;
        }
      });
    }

    const result = subjects.map(s => {
      const allTopics = s.units.flatMap(u => u.subTopics);
      const doneInRange = allTopics.filter(t => t.completed && t.completedDate && t.completedDate >= from && t.completedDate <= to);
      let topicTimeMins = 0;
      s.units.forEach(u => {
        topicTimeMins += u.timeSpent || 0;
        u.subTopics.forEach(t => {
          if (t.timeEntries && t.timeEntries.length > 0) {
            topicTimeMins += t.timeEntries.filter(e => e.date >= from && e.date <= to).reduce((a, e) => a + e.minutes, 0);
          } else if (t.completed && t.completedDate && t.completedDate >= from && t.completedDate <= to) {
            topicTimeMins += t.timeSpent || 0;
          } else if (isAllTime && (t.timeSpent || 0) > 0) {
            // Include undated topic time in all-time view
            topicTimeMins += t.timeSpent;
          }
        });
      });
      // Unified per-subject: sessions + max(0, topicTime - overlap)
      const sessAll = sessMinsBySubject.get(s.id) || 0;
      const sessOverlap = sessOverlapBySubject.get(s.id) || 0;
      const timeMins = sessAll > 0
        ? sessAll + Math.max(0, topicTimeMins - sessOverlap)
        : topicTimeMins;

      const units = s.units.map(u => {
        const unitDone = u.subTopics.filter(t => t.completed && t.completedDate && t.completedDate >= from && t.completedDate <= to);
        return { unit: u, done: unitDone, total: u.subTopics.length };
      }).filter(u => u.done.length > 0);

      return {
        subject: s,
        topicsDone: doneInRange.length,
        totalTopics: allTopics.length,
        timeMins,
        units,
        pct: allTopics.length > 0 ? Math.round((doneInRange.length / allTopics.length) * 100) : 0,
      };
    }).filter(s => s.topicsDone > 0 || s.timeMins > 0).sort((a, b) => b.topicsDone - a.topicsDone);

    // Add Miscellaneous row for unmapped session time
    if (unmappedMins.total > 0) {
      result.push({
        subject: { id: '__misc__', name: 'Miscellaneous', shortName: 'Misc', color: '#6B7280', examDate: '', units: [], icon: '📝' } as any,
        topicsDone: 0,
        totalTopics: 0,
        timeMins: unmappedMins.total,
        units: [],
        pct: 0,
      });
    }

    return result;
  }, [subjects, from, to, dbSessions, isAllTime]);

  const maxTopics = Math.max(...chartData.map(d => d.topics), 1);
  const maxHours = Math.max(...chartData.map(d => d.hours), 0.5);
  const topicsDomain: [number, number] = [0, Math.ceil(maxTopics * 1.15)];
  const hoursDomain: [number, number] = [0, Math.ceil(maxHours * 1.15 * 10) / 10];

  const count = chartData.length;
  const barSize = count <= 7 ? 20 : count <= 14 ? 14 : count <= 30 ? 8 : 6;
  const xInterval = count <= 20 ? 0 : Math.max(1, Math.floor(count / 12));
  const xFontSize = count <= 14 ? 9 : 7;
  const isEmpty = chartData.every(d => d.topics === 0 && d.hours === 0);

  return (
    <div className="space-y-3">
      {/* ═══ Chart ═══ */}
      <div className="rounded-2xl bg-card/30 border border-border/15 p-3">
        {isEmpty ? (
          <div className="h-[180px] flex flex-col items-center justify-center gap-2 opacity-40">
            <BarChart3 className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-[10px] text-muted-foreground font-semibold">No study data in this period</p>
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ left: -8, right: -4, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.12} horizontal vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: xFontSize, fontWeight: 600 }}
                  tickLine={false} axisLine={false} height={24}
                  interval={xInterval}
                />
                <YAxis
                  yAxisId="topics"
                  domain={topicsDomain}
                  tick={{ fill: 'hsl(var(--chart-4))', fontSize: 9, fontWeight: 700 }}
                  width={22} tickLine={false} axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="hours"
                  orientation="right"
                  domain={hoursDomain}
                  tick={{ fill: 'hsl(var(--primary))', fontSize: 9, fontWeight: 700 }}
                  width={32} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => formatStudyHours(v)}
                />
                <Tooltip content={<ChartTooltip />} />
                {/* Hours bars (tubes) */}
                <Bar
                  yAxisId="hours"
                  dataKey="hours"
                  fill="url(#trendBarGrad)"
                  radius={[6, 6, 0, 0]}
                  barSize={barSize}
                  name="Hours"
                />
                {/* Topics line with dots */}
                <Line
                  yAxisId="topics"
                  type="monotone"
                  dataKey="topics"
                  stroke="hsl(var(--chart-4))"
                  strokeWidth={2.5}
                  dot={{ r: count <= 14 ? 4 : 2.5, fill: 'hsl(var(--chart-4))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: 'hsl(var(--chart-4))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                  name="Topics"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* Legend */}
        {!isEmpty && (
          <div className="flex justify-center gap-5 mt-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
              <span className="w-3 h-3 rounded-sm bg-primary" /> Hours
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
              <span className="w-3 h-1 rounded-full bg-chart-4" /> Topics
            </span>
          </div>
        )}
      </div>

      {/* ═══ 4 Stat Shelf — compact horizontal scroll ═══ */}
      {!hideShelf && <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5 -mx-1 px-1">
        <StatShelfCard
          icon={<BookOpen className="w-3 h-3 text-chart-4" />}
          label="Total Topics"
          value={String(stats.totalTopics)}
          accent="chart-4"
        />
        <StatShelfCard
          icon={<Clock className="w-3 h-3 text-primary" />}
          label="Study Time"
          value={formatStudyHours(stats.totalHours)}
          accent="primary"
        />
        <StatShelfCard
          icon={<TrendingUp className="w-3 h-3 text-secondary" />}
          label="Avg/Day"
          value={`${stats.avgPerDay}`}
          sub="topics"
          accent="secondary"
        />
        <StatShelfCard
          icon={<Trophy className="w-3 h-3 text-accent" />}
          label="Best Day"
          value={stats.bestCount > 0 ? String(stats.bestCount) : '—'}
          sub={stats.bestDate ? formatDate(stats.bestDate) : ''}
          accent="accent"
        />
      </div>}

      {/* ═══ Subject Breakdown ═══ */}
      {subjectBreakdown.length > 0 && (
        <div className="rounded-2xl border border-border/15 bg-card/20 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border/10">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">📊 Subject Breakdown</p>
          </div>
          <div className="divide-y divide-border/8">
            {subjectBreakdown.map(({ subject: s, topicsDone, totalTopics: total, timeMins, units, pct }) => {
              const isOpen = expandedSubject === s.id;
              return (
                <div key={s.id}>
                  <button
                    onClick={() => setExpandedSubject(isOpen ? null : s.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-3 hover:bg-card/30 transition-colors active:scale-[0.998]"
                  >
                    <div className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: s.color, boxShadow: `0 0 6px ${s.color}30` }} />
                    <span className="text-[10px]">{(s as any).emoji || '📘'}</span>
                    <span className="text-[11px] font-bold text-foreground flex-1 text-left truncate">{s.shortName}</span>
                    {/* Progress bar */}
                    <div className="w-16 h-1.5 rounded-full bg-muted/25 overflow-hidden shrink-0">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                    </div>
                    <span className="text-[9px] font-mono text-muted-foreground shrink-0 w-10 text-right">{topicsDone}/{total}</span>
                    <span className="text-[8px] font-mono font-bold shrink-0 w-12 text-right" style={{ color: readableInk(s.color) }}>{formatStudyTime(timeMins)}</span>
                    <ChevronDown className={`w-3 h-3 text-muted-foreground/40 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 space-y-2">
                          {units.map(({ unit: u, done, total: uTotal }) => (
                            <div key={u.id} className="ml-6 rounded-xl bg-card/20 border border-border/10 p-2.5">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[10px] font-bold text-foreground">{u.name}</span>
                                <span className="text-[8px] font-mono text-muted-foreground ml-auto">{done.length}/{uTotal}</span>
                              </div>
                              <div className="space-y-0.5">
                                {done.map(t => (
                                  <button
                                    key={t.id}
                                    onClick={() => onOpenTopicDetail?.(t, s.id, u.id)}
                                    className="flex items-center gap-1.5 w-full py-1 px-1.5 rounded-md hover:bg-card/40 transition-colors group text-left"
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-secondary shrink-0" />
                                    <span className="text-[10px] text-foreground flex-1 truncate group-hover:text-primary transition-colors">{t.name}</span>
                                    <span className={`text-[7px] px-1 py-0.5 rounded font-bold shrink-0 ${
                                      t.difficulty === 'Easy' ? 'bg-emerald-500/15 text-emerald-500'
                                      : t.difficulty === 'Medium' ? 'bg-amber-500/15 text-amber-500'
                                      : 'bg-red-500/15 text-red-500'
                                    }`}>{t.difficulty?.[0] || 'M'}</span>
                                    {t.completedDate && (
                                      <span className="text-[8px] text-muted-foreground/50 font-mono">{formatDate(t.completedDate)}</span>
                                    )}
                                    <ChevronRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary/50 shrink-0" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                          {units.length === 0 && (
                            <p className="text-[10px] text-muted-foreground/50 italic ml-6 py-2">No unit completions in this period</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Stat Shelf Card (compact, inline) ─── */
function StatShelfCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent: string;
}) {
  return (
    <div className={`shrink-0 min-w-[80px] rounded-xl bg-${accent}/8 border border-${accent}/15 px-3 py-2 text-center backdrop-blur-sm`}>
      <div className="flex items-center justify-center mb-0.5">{icon}</div>
      <p className="text-base font-black font-mono text-foreground leading-none">{value}</p>
      <p className="text-[7px] text-muted-foreground font-bold mt-0.5 uppercase tracking-wider whitespace-nowrap">{label}</p>
      {sub && <p className="text-[7px] text-muted-foreground/50 leading-tight whitespace-nowrap">{sub}</p>}
    </div>
  );
}
