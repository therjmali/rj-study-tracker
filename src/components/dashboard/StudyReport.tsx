import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import {
  Clock, BookOpen, Smile, TrendingUp, TrendingDown, ChevronDown, ChevronRight,
  Flame, Timer, Trophy, Target, CheckCircle2, BarChart3,
} from 'lucide-react';
import GlowCard from '../shared/GlowCard';
import TrendAnalysis from './TrendAnalysis';
import { getRotatingQuote } from '../../lib/quotes';
import { getLocalDateStr, formatStudyHours, formatStudyTime, formatDate, getEffectiveStudyMinutes, getUnifiedTotalMinutes } from '../../lib/utils';
import { useClock } from '../../hooks/useClock';
import { useStreak } from '../../hooks/useStreak';
import type { Subject, DailyLog, DbStudySession, SubTopic } from '../../types';

type TimeFilter = 'all' | 'today' | 'weekly' | 'monthly' | 'custom';

interface Props {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  dbSessions?: DbStudySession[];
  timeFilter: TimeFilter;
  customFrom: string;
  customTo: string;
  subjectFilter: string;
  externalRange?: { from: string; to: string };
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string) => void;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
}

const MOOD_EMOJI: Record<string, string> = { Sad: '😔', Tired: '😴', Okay: '😐', Happy: '😊', Motivated: '🔥', Neutral: '😐' };

function fmtDD(d: Date): string { return format(d, 'dd/MM/yyyy'); }

/* ─── Live Clock Badge ─── */
function LiveTimeBadge() {
  const now = useClock();
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/20 bg-card/60 px-2.5 py-1">
      <Timer className="w-3 h-3 text-primary" />
      <span className="font-mono text-xs font-black tracking-tight">
        <span className="text-primary">{String(h12).padStart(2, '0')}</span>
        <span className="text-muted-foreground">:</span>
        <span className="text-foreground">{String(m).padStart(2, '0')}</span>
        <span className="text-muted-foreground">:</span>
        <span className="text-secondary">{String(s).padStart(2, '0')}</span>
      </span>
      <span className="text-[8px] font-bold text-muted-foreground tracking-wider">{ampm}</span>
    </div>
  );
}

export default function StudyReport({ subjects, dailyLogs, dbSessions, timeFilter, customFrom, customTo, subjectFilter, externalRange, onOpenTopicDetail, onNavigate }: Props) {
  const [chartOpen, setChartOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(() => {
    try {
      const stored = localStorage.getItem('rj-study-report-open-v2');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const quote = useMemo(() => getRotatingQuote(), []);

  const toggleReportOpen = () => {
    setReportOpen(prev => {
      const next = !prev;
      try { localStorage.setItem('rj-study-report-open-v2', String(next)); } catch {}
      return next;
    });
  };

  const { startStr, endStr, startDate, endDate } = useMemo(() => {
    if (externalRange) {
      return { startStr: externalRange.from, endStr: externalRange.to, startDate: parseISO(externalRange.from), endDate: parseISO(externalRange.to) };
    }
    const now = new Date();
    const todayLocal = getLocalDateStr(now);
    if (timeFilter === 'today') { const d = parseISO(todayLocal); return { startStr: todayLocal, endStr: todayLocal, startDate: d, endDate: d }; }
    if (timeFilter === 'weekly') { const d = new Date(now); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); const ws = getLocalDateStr(d); return { startStr: ws, endStr: todayLocal, startDate: parseISO(ws), endDate: now }; }
    if (timeFilter === 'monthly') { const first = new Date(now.getFullYear(), now.getMonth(), 1); const last = new Date(now.getFullYear(), now.getMonth() + 1, 0); const fs = getLocalDateStr(first); const ls = getLocalDateStr(last); return { startStr: fs, endStr: ls, startDate: first, endDate: last }; }
    if (timeFilter === 'custom' && customFrom) { const to = customTo || customFrom; const [f, t] = customFrom <= to ? [customFrom, to] : [to, customFrom]; return { startStr: f, endStr: t, startDate: parseISO(f), endDate: parseISO(t) }; }
    let earliest = todayLocal;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => { if (t.completed && t.completedDate && t.completedDate < earliest) earliest = t.completedDate; })));
    dailyLogs.forEach(l => { if (l.date < earliest && (l.hoursStudied > 0 || l.topicsCompleted > 0)) earliest = l.date; });
    return { startStr: earliest, endStr: todayLocal, startDate: parseISO(earliest), endDate: now };
  }, [externalRange, timeFilter, customFrom, customTo, subjects, dailyLogs]);

  const { prevStartStr, prevEndStr } = useMemo(() => {
    const duration = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
    const ps = new Date(startDate); ps.setDate(ps.getDate() - duration);
    const pe = new Date(startDate); pe.setDate(pe.getDate() - 1);
    return { prevStartStr: format(ps, 'yyyy-MM-dd'), prevEndStr: format(pe, 'yyyy-MM-dd') };
  }, [startDate, endDate]);

  const filteredSubjects = useMemo(() =>
    subjectFilter === 'all' ? subjects : subjects.filter(s => subjectFilter.split(',').includes(s.id)),
    [subjects, subjectFilter]
  );

  const filteredLogs = useMemo(() => dailyLogs.filter(l => l.date >= startStr && l.date <= endStr), [dailyLogs, startStr, endStr]);

  const totalHours = useMemo(() =>
    timeFilter === 'all'
      ? getUnifiedTotalMinutes(filteredSubjects, dbSessions, dailyLogs) / 60
      : getEffectiveStudyMinutes(filteredSubjects, dailyLogs, startStr, endStr, dbSessions) / 60,
    [filteredSubjects, dailyLogs, startStr, endStr, timeFilter, dbSessions]);

  const lastMood = filteredLogs.filter(l => l.mood).pop()?.mood || '—';

  // Comprehensive stats for all 4 cards
  const cardData = useMemo(() => {
    // Topics done in range
    let topicsDone = 0;
    const bySubjectDone: { subject: Subject; topics: { topic: SubTopic; unitId: string; unitName: string }[] }[] = [];
    filteredSubjects.forEach(s => {
      const subTopics: { topic: SubTopic; unitId: string; unitName: string }[] = [];
      s.units.forEach(u => u.subTopics.forEach(t => {
        if (t.completed && t.completedDate && t.completedDate >= startStr && t.completedDate <= endStr) {
          topicsDone++;
          subTopics.push({ topic: t, unitId: u.id, unitName: u.name });
        }
      }));
      if (subTopics.length > 0) bySubjectDone.push({ subject: s, topics: subTopics });
    });

    // In-process topics
    const bySubjectInProcess: { subject: Subject; topics: { topic: SubTopic; unitId: string; unitName: string }[] }[] = [];
    let inProcessCount = 0;
    filteredSubjects.forEach(s => {
      const subTopics: { topic: SubTopic; unitId: string; unitName: string }[] = [];
      s.units.forEach(u => u.subTopics.forEach(t => {
        if (t.status === 'in_process') { inProcessCount++; subTopics.push({ topic: t, unitId: u.id, unitName: u.name }); }
      }));
      if (subTopics.length > 0) bySubjectInProcess.push({ subject: s, topics: subTopics });
    });

    // Best day & avg
    const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
    const avgPerDay = Math.round((topicsDone / totalDays) * 10) / 10;
    const byDay: Record<string, number> = {};
    filteredSubjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate >= startStr && t.completedDate <= endStr) {
        byDay[t.completedDate] = (byDay[t.completedDate] || 0) + 1;
      }
    })));
    let bestDate = '', bestCount = 0;
    Object.entries(byDay).forEach(([d, c]) => { if (c > bestCount) { bestDate = d; bestCount = c; } });

    // Prev period
    const prevHours = getEffectiveStudyMinutes(filteredSubjects, dailyLogs, prevStartStr, prevEndStr, dbSessions) / 60;
    let prevTopics = 0;
    filteredSubjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate >= prevStartStr && t.completedDate <= prevEndStr) prevTopics++;
    })));

    return { topicsDone, inProcessCount, avgPerDay, bestDate, bestCount, prevHours, prevTopics, bySubjectDone, bySubjectInProcess };
  }, [filteredSubjects, dailyLogs, startStr, endStr, startDate, endDate, prevStartStr, prevEndStr, dbSessions]);

  const streakData = useStreak(subjects, dailyLogs, dbSessions);

  const rangeLabel = useMemo(() => {
    if (timeFilter === 'today') return `Today — ${fmtDD(new Date())}`;
    if (timeFilter === 'weekly') return `This Week (${fmtDD(startDate)} – ${fmtDD(endDate)})`;
    if (timeFilter === 'monthly') return `This Month (${fmtDD(startDate)} – ${fmtDD(endDate)})`;
    if (timeFilter === 'custom') return `${fmtDD(startDate)} → ${fmtDD(endDate)}`;
    return `All Time (${fmtDD(startDate)} – ${fmtDD(endDate)})`;
  }, [timeFilter, startDate, endDate]);

  const toggleCard = (id: string) => setExpandedCard(prev => prev === id ? null : id);

  return (
    <GlowCard paper className="overflow-hidden">
      <div className="relative space-y-3 p-3 sm:p-4">
        <BgBlobs />

        {/* ── Toggle Header: title row, range, then chips — nothing is squeezed between siblings ── */}
        <div
          onClick={toggleReportOpen}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleReportOpen(); } }}
          className="relative z-10 cursor-pointer select-none group"
          aria-expanded={reportOpen}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="min-w-0 truncate text-base font-bold text-foreground transition-colors group-active:text-primary">
              📊 Study Report
            </h3>
            <motion.div
              animate={{ rotate: reportOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/20 bg-card/60"
            >
              <ChevronDown className="h-4 w-4 text-foreground" />
            </motion.div>
          </div>
          <p className="mt-0.5 break-words text-xs font-medium text-muted-foreground">{rangeLabel}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {!reportOpen && (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                {formatStudyHours(totalHours)} · {cardData.topicsDone} topics
              </span>
            )}
            {streakData.current > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-chart-4/20 bg-chart-4/15 px-2.5 py-1 text-xs font-bold text-chart-4">
                <Flame className="h-3 w-3" /> {streakData.current}d streak
              </span>
            )}
            <LiveTimeBadge />
          </div>
        </div>

        {/* ── Collapsible Body ── */}
        <AnimatePresence initial={false}>
          {reportOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-3 overflow-hidden"
            >
              {/* ═══ 4 Consolidated Stat Cards ═══ */}
              <div className="grid grid-cols-2 gap-2 relative z-10">
                {/* 1. Study Time — with avg/day subtitle */}
                <ConsolidatedCard
                  id="time"
                  icon={<Clock className="w-4 h-4 text-primary" />}
                  label="Study Hours"
                  value={formatStudyHours(totalHours)}
                  sub={`~${formatStudyTime(Math.round(totalHours * 60 / Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1)))}/day`}
                  color="primary"
                  diff={totalHours - cardData.prevHours}
                  isExpanded={expandedCard === 'time'}
                  onToggle={() => toggleCard('time')}
                />

                {/* 2. Topics Done — expandable with subject/unit breakdown */}
                <ConsolidatedCard
                  id="topics"
                  icon={<BookOpen className="w-4 h-4 text-secondary" />}
                  label="Topics Done"
                  value={String(cardData.topicsDone)}
                  sub={`Best: ${cardData.bestCount > 0 ? `${cardData.bestCount} on ${formatDate(cardData.bestDate)}` : '—'}`}
                  color="secondary"
                  diff={cardData.topicsDone - cardData.prevTopics}
                  hasDetail={cardData.bySubjectDone.length > 0}
                  isExpanded={expandedCard === 'topics'}
                  onToggle={() => toggleCard('topics')}
                />

                {/* 3. In Process — expandable with subject/unit breakdown */}
                <ConsolidatedCard
                  id="inprocess"
                  icon={<Target className="w-4 h-4 text-accent" />}
                  label="In Process"
                  value={String(cardData.inProcessCount)}
                  sub={`${cardData.avgPerDay} topics/day avg`}
                  color="accent"
                  hasDetail={cardData.bySubjectInProcess.length > 0}
                  isExpanded={expandedCard === 'inprocess'}
                  onToggle={() => toggleCard('inprocess')}
                />

                {/* 4. Mood */}
                <ConsolidatedCard
                  id="mood"
                  icon={<Smile className="w-4 h-4 text-destructive" />}
                  label="Mood"
                  value={MOOD_EMOJI[lastMood] || lastMood}
                  color="destructive"
                  isExpanded={false}
                  onToggle={() => {}}
                />
              </div>

              {/* Expanded Detail Panel — renders below the grid */}
              <AnimatePresence>
                {expandedCard === 'topics' && cardData.bySubjectDone.length > 0 && (
                  <SubjectUnitDetail
                    key="topics-detail"
                    title="✅ Completed Topics"
                    data={cardData.bySubjectDone}
                    onOpenTopicDetail={onOpenTopicDetail}
                    onNavigate={onNavigate}
                    accentColor="secondary"
                  />
                )}
                {expandedCard === 'inprocess' && cardData.bySubjectInProcess.length > 0 && (
                  <SubjectUnitDetail
                    key="inprocess-detail"
                    title="🔄 In-Progress Topics"
                    data={cardData.bySubjectInProcess}
                    onOpenTopicDetail={onOpenTopicDetail}
                    onNavigate={onNavigate}
                    accentColor="accent"
                  />
                )}
              </AnimatePresence>

              {/* Collapsible: Trend Chart */}
              <CollapsibleSection title="📈 Trend" subtitle={`${cardData.topicsDone} topics · ${formatStudyHours(totalHours)}`}
                open={chartOpen} onToggle={() => setChartOpen(p => !p)}>
                <div className="px-4 pb-4">
                  <TrendAnalysis
                    subjects={filteredSubjects}
                    dailyLogs={dailyLogs}
                    dbSessions={dbSessions}
                    range={{ from: startStr, to: endStr }}
                    isAllTime={timeFilter === 'all'}
                    onOpenTopicDetail={onOpenTopicDetail}
                    onNavigate={onNavigate}
                    hideShelf
                  />
                </div>
              </CollapsibleSection>

              {/* Quote footer */}
              <div className="pt-2 border-t border-border/10 relative z-10">
                <p className="text-sm text-foreground/70 italic font-medium">&ldquo;{quote.text}&rdquo;</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">— {quote.author}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlowCard>
  );
}

// ─── Sub-components ───

function BgBlobs() {
  // Static gradient instead of blur-3xl blobs: same look, no GPU blur cost while scrolling.
  return <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 45% at 100% 0%, hsl(var(--primary) / 0.07), transparent 70%), radial-gradient(45% 35% at 0% 100%, hsl(var(--accent) / 0.06), transparent 70%)' }} />;
}

/* ─── Consolidated Stat Card ─── */
function ConsolidatedCard({ id, icon, label, value, sub, color, diff, hasDetail, isExpanded, onToggle }: {
  id: string; icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
  diff?: number; hasDetail?: boolean; isExpanded: boolean; onToggle: () => void;
}) {
  const showDiff = diff !== undefined && diff !== 0;
  const isUp = (diff ?? 0) > 0;
  const clickable = hasDetail || id === 'time';

  return (
    <motion.button
      onClick={clickable ? onToggle : undefined}
      whileTap={clickable ? { scale: 0.97 } : {}}
      className={`relative flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
        isExpanded
          ? `bg-${color}/12 border-2 border-${color}/30 shadow-md`
          : `bg-${color}/5 border border-${color}/15 hover:border-${color}/30`
      } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className={`w-10 h-10 rounded-lg bg-${color}/10 flex items-center justify-center shrink-0`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xl font-black text-foreground font-mono leading-none">{value}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-[10px] text-muted-foreground font-semibold">{label}</p>
          {showDiff && (
            <span className={`text-[8px] font-bold flex items-center gap-0.5 ${isUp ? 'text-secondary' : 'text-destructive'}`}>
              {isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {isUp ? '+' : ''}{typeof diff === 'number' ? formatStudyHours(Math.abs(diff)) : diff}
            </span>
          )}
        </div>
        {sub && <p className="text-[8px] text-muted-foreground/60 font-medium mt-0.5 truncate">{sub}</p>}
      </div>
      {hasDetail && (
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/40 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      )}
    </motion.button>
  );
}

/* ─── Subject + Unit Detail Panel (ultra premium) ─── */
function SubjectUnitDetail({ title, data, onOpenTopicDetail, onNavigate, accentColor }: {
  title: string;
  data: { subject: Subject; topics: { topic: SubTopic; unitId: string; unitName: string }[] }[];
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string) => void;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
  accentColor: string;
}) {
  const [openSubject, setOpenSubject] = useState<string | null>(data.length === 1 ? data[0].subject.id : null);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 350 }}
      className="overflow-hidden relative z-10"
    >
      <div className={`rounded-2xl border border-${accentColor}/20 bg-card/30 backdrop-blur-sm overflow-hidden`}>
        {/* Header */}
        <div className="px-3 py-2 border-b border-border/10 flex items-center gap-2">
          <div className={`w-5 h-5 rounded-md bg-${accentColor}/15 flex items-center justify-center`}>
            <BarChart3 className={`w-3 h-3 text-${accentColor}`} />
          </div>
          <span className="text-[10px] font-black text-foreground uppercase tracking-wider">{title}</span>
          <span className="text-[9px] font-mono text-muted-foreground ml-auto">
            {data.reduce((a, d) => a + d.topics.length, 0)} topics
          </span>
        </div>

        {/* Subject rows */}
        <div className="divide-y divide-border/8 max-h-[320px] overflow-y-auto scrollbar-hide">
          {data.map(({ subject: s, topics }) => {
            const isOpen = openSubject === s.id;
            // Group topics by unit
            const unitMap = new Map<string, { unitName: string; unitId: string; topics: SubTopic[] }>();
            topics.forEach(({ topic, unitId, unitName }) => {
              if (!unitMap.has(unitId)) unitMap.set(unitId, { unitName, unitId, topics: [] });
              unitMap.get(unitId)!.topics.push(topic);
            });
            const units = Array.from(unitMap.values());

            return (
              <div key={s.id}>
                <button
                  onClick={() => setOpenSubject(isOpen ? null : s.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-card/40 transition-colors active:scale-[0.998]"
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}30` }} />
                  <span className="text-[11px] font-bold text-foreground flex-1 text-left truncate">{s.shortName}</span>
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-${accentColor}/10 text-${accentColor}`}>
                    {topics.length}
                  </span>
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
                        {units.map(u => (
                          <div key={u.unitId} className="ml-5 rounded-xl bg-card/20 border border-border/10 overflow-hidden">
                            {/* Unit header */}
                            <button
                              onClick={() => onNavigate?.('syllabus', { subjectId: s.id, unitId: u.unitId })}
                              className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-card/30 transition-colors group"
                            >
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                              <span className="text-[10px] font-bold text-foreground flex-1 text-left truncate group-hover:text-primary transition-colors">{u.unitName}</span>
                              <span className="text-[8px] font-mono text-muted-foreground">{u.topics.length} topics</span>
                              <ChevronRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary/50 transition-colors shrink-0" />
                            </button>
                            {/* Topics list */}
                            <div className="px-2 pb-1.5 space-y-0.5">
                              {u.topics.map(t => (
                                <button
                                  key={t.id}
                                  onClick={() => onOpenTopicDetail?.(t, s.id, u.unitId)}
                                  className="flex items-center gap-1.5 w-full py-1.5 px-2 rounded-lg hover:bg-primary/5 transition-colors group/topic text-left"
                                >
                                  <CheckCircle2 className={`w-3 h-3 shrink-0 ${t.completed ? 'text-secondary' : 'text-accent'}`} />
                                  <span className="text-[10px] text-foreground flex-1 truncate group-hover/topic:text-primary transition-colors font-medium">{t.name}</span>
                                  <span className={`text-[7px] px-1 py-0.5 rounded font-bold shrink-0 ${
                                    t.difficulty === 'Easy' ? 'bg-emerald-500/15 text-emerald-500'
                                    : t.difficulty === 'Medium' ? 'bg-amber-500/15 text-amber-500'
                                    : 'bg-red-500/15 text-red-500'
                                  }`}>{t.difficulty?.[0] || 'M'}</span>
                                  {t.timeSpent > 0 && (
                                    <span className="text-[7px] font-mono text-muted-foreground/50">{formatStudyTime(t.timeSpent)}</span>
                                  )}
                                  <ChevronRight className="w-3 h-3 text-muted-foreground/20 group-hover/topic:text-primary/40 shrink-0" />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function CollapsibleSection({ title, subtitle, open, onToggle, children }: {
  title: string; subtitle: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <>
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-card/30 transition-colors border-t border-border/10">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-foreground">{title}</h4>
          <p className="text-[10px] text-muted-foreground font-medium">{subtitle}</p>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="overflow-hidden">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
