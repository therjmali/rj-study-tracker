import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, TrendingUp, TrendingDown, Minus, Flame, Target, BarChart3 } from 'lucide-react';
import type { Subject, DailyLog, DbStudySession } from '../../types';
import { formatStudyTime, getEffectiveDayMinutes, getLocalDateStr } from '../../lib/utils';

interface CalendarTopicInfo {
  subjectName: string;
  subjectColor: string;
  subjectId: string;
}

interface Props {
  subjects: Subject[];
  dailyLogs?: DailyLog[];
  dbSessions?: DbStudySession[];
  dateMap: Record<string, { done: number; subjects: Set<string>; topics: CalendarTopicInfo[] }>;
  rangeFrom: string;
  rangeTo: string;
  year: number;
  month: number;
}

export default function CalendarAnalysis({ subjects, dailyLogs, dbSessions, dateMap, rangeFrom, rangeTo, year, month }: Props) {
  const [expanded, setExpanded] = useState(true);

  const analysis = useMemo(() => {
    // Gather data within range
    let totalTopics = 0;
    let totalMins = 0;
    let bestDay = { date: '', topics: 0, mins: 0 };
    const subjectCounts: Record<string, { name: string; color: string; count: number; mins: number }> = {};
    const activeDatesSet = new Set<string>();

    // Range days
    const rangeDays = Math.max(1, Math.round((new Date(rangeTo).getTime() - new Date(rangeFrom).getTime()) / 86400000) + 1);

    // Iterate every day in range for accurate effective time
    const fromD = new Date(rangeFrom + 'T12:00:00');
    const toD = new Date(rangeTo + 'T12:00:00');
    for (let d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
      const ds = getLocalDateStr(d);
      const dayMins = getEffectiveDayMinutes(subjects, dailyLogs || [], ds, dbSessions);
      const data = dateMap[ds];
      const dayTopics = data?.done || 0;

      if (dayMins > 0 || dayTopics > 0) activeDatesSet.add(ds);

      totalTopics += dayTopics;
      totalMins += dayMins;

      if (data) {
        data.topics.forEach(t => {
          if (!subjectCounts[t.subjectId]) {
            subjectCounts[t.subjectId] = { name: t.subjectName, color: t.subjectColor, count: 0, mins: 0 };
          }
          subjectCounts[t.subjectId].count++;
        });
      }

      // Track best day by combined score
      const score = dayTopics * 10 + dayMins;
      const bestScore = bestDay.topics * 10 + bestDay.mins;
      if (score > bestScore) {
        bestDay = { date: ds, topics: dayTopics, mins: dayMins };
      }
    }

    // Add per-subject time from topics
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate && t.completedDate >= rangeFrom && t.completedDate <= rangeTo) {
        if (subjectCounts[s.id]) {
          subjectCounts[s.id].mins += t.timeSpent || 0;
        }
      }
    })));

    const activeDays = activeDatesSet.size;

    // Streak within range
    const sortedDates = [...activeDatesSet].sort();
    let maxStreak = 0, currentStreak = 0, prevDate = '';
    for (const dd of sortedDates) {
      if (prevDate) {
        const diff = (new Date(dd).getTime() - new Date(prevDate).getTime()) / 86400000;
        if (diff === 1) currentStreak++;
        else currentStreak = 1;
      } else currentStreak = 1;
      maxStreak = Math.max(maxStreak, currentStreak);
      prevDate = dd;
    }

    const totalHours = totalMins / 60;
    const dailyAvgTopics = totalTopics / rangeDays;
    const dailyAvgHours = totalHours / rangeDays;
    const consistency = Math.round((activeDays / rangeDays) * 100);

    // Previous period comparison using effective minutes
    const prevFrom = new Date(rangeFrom);
    prevFrom.setDate(prevFrom.getDate() - rangeDays);
    const prevFromStr = getLocalDateStr(prevFrom);
    let prevTopics = 0, prevMins = 0;
    Object.entries(dateMap).forEach(([date, data]) => {
      if (date >= prevFromStr && date < rangeFrom) prevTopics += data.done;
    });
    for (let d = new Date(prevFrom); d < new Date(rangeFrom + 'T12:00:00'); d.setDate(d.getDate() + 1)) {
      const ds = getLocalDateStr(d);
      prevMins += getEffectiveDayMinutes(subjects, dailyLogs || [], ds, dbSessions);
    }
    const topicTrend = prevTopics > 0 ? Math.round(((totalTopics - prevTopics) / prevTopics) * 100) : 0;
    const hoursTrend = prevMins > 0 ? Math.round(((totalMins - prevMins) / prevMins) * 100) : 0;

    // Subject ranking
    const subjectList = Object.values(subjectCounts).sort((a, b) => b.count - a.count);
    const maxSubjectCount = subjectList[0]?.count || 1;

    // Productivity score (0-100)
    const productivityScore = Math.min(100, Math.round(
      (consistency * 0.4) +
      (Math.min(dailyAvgTopics / 5, 1) * 30) +
      (Math.min(dailyAvgHours / 4, 1) * 30)
    ));

    return {
      totalTopics, totalHours: Math.round(totalHours * 10) / 10, totalMins,
      activeDays, rangeDays, dailyAvgTopics: Math.round(dailyAvgTopics * 10) / 10,
      dailyAvgHours: Math.round(dailyAvgHours * 10) / 10,
      consistency, maxStreak, bestDay,
      topicTrend, hoursTrend, subjectList, maxSubjectCount,
      productivityScore,
    };
  }, [dateMap, dailyLogs, rangeFrom, rangeTo, subjects, dbSessions]);

  const TrendIcon = ({ val }: { val: number }) => {
    if (val > 0) return <TrendingUp className="w-3 h-3 text-diff-easy" />;
    if (val < 0) return <TrendingDown className="w-3 h-3 text-destructive" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  const trendColor = (val: number) => val > 0 ? 'text-diff-easy' : val < 0 ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="mt-3 rounded-xl border border-accent/20 bg-accent/5 overflow-hidden">
      <button onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/10 transition-colors">
        <BarChart3 className="w-3.5 h-3.5 text-accent shrink-0" />
        <span className="text-[11px] font-bold text-foreground flex-1">Range Analysis</span>
        <span className="text-[9px] font-bold text-accent">{analysis.productivityScore}/100</span>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="overflow-hidden">
            <div className="px-3 pb-3 space-y-3">
              {/* Score ring + key stats */}
              <div className="flex gap-3">
                {/* Productivity score */}
                <div className="flex flex-col items-center justify-center shrink-0">
                  <div className="relative w-16 h-16">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--muted) / 0.15)" strokeWidth="2.5" />
                      <circle cx="18" cy="18" r="15.9" fill="none"
                        stroke={analysis.productivityScore >= 70 ? 'hsl(var(--primary))' : analysis.productivityScore >= 40 ? 'hsl(var(--chart-4))' : 'hsl(var(--destructive))'}
                        strokeWidth="2.5" strokeLinecap="round"
                        strokeDasharray={`${analysis.productivityScore} ${100 - analysis.productivityScore}`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-display-digit text-base font-black text-foreground">{analysis.productivityScore}</span>
                    </div>
                  </div>
                  <span className="text-[8px] font-bold text-muted-foreground mt-0.5">Score</span>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-1.5 flex-1">
                  <StatMini label="Topics" value={analysis.totalTopics} icon="✅" trend={analysis.topicTrend} />
                  <StatMini label="Hours" value={formatStudyTime(analysis.totalMins)} icon="⏱" trend={analysis.hoursTrend} />
                  <StatMini label="Active" value={`${analysis.activeDays}/${analysis.rangeDays}d`} icon="🔥" />
                  <StatMini label="Avg/Day" value={`${analysis.dailyAvgTopics}t`} icon="📊" />
                </div>
              </div>

              {/* Streak + Best Day + Consistency pills */}
              <div className="flex gap-1.5 flex-wrap">
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/15">
                  <Flame className="w-3 h-3 text-primary" />
                  <span className="text-[9px] font-bold text-primary">{analysis.maxStreak}d best streak</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-chart-4/10 border border-chart-4/15">
                  <Target className="w-3 h-3 text-chart-4" />
                  <span className="text-[9px] font-bold text-chart-4">{analysis.consistency}% consistency</span>
                </div>
                {analysis.bestDay.topics > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-secondary/10 border border-secondary/15">
                    <span className="text-[9px]">🏆</span>
                    <span className="text-[9px] font-bold text-secondary">Best: {analysis.bestDay.topics}t</span>
                  </div>
                )}
              </div>

              {/* Trend comparison */}
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card/40 border border-border/10">
                  <TrendIcon val={analysis.topicTrend} />
                  <span className="text-[9px] text-muted-foreground font-semibold">Topics</span>
                  <span className={`text-[9px] font-bold ml-auto ${trendColor(analysis.topicTrend)}`}>
                    {analysis.topicTrend > 0 ? '+' : ''}{analysis.topicTrend}%
                  </span>
                </div>
                <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card/40 border border-border/10">
                  <TrendIcon val={analysis.hoursTrend} />
                  <span className="text-[9px] text-muted-foreground font-semibold">Hours</span>
                  <span className={`text-[9px] font-bold ml-auto ${trendColor(analysis.hoursTrend)}`}>
                    {analysis.hoursTrend > 0 ? '+' : ''}{analysis.hoursTrend}%
                  </span>
                </div>
              </div>

              {/* Subject breakdown bars */}
              {analysis.subjectList.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Subject Breakdown</p>
                  {analysis.subjectList.map(s => (
                    <div key={s.name} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-[10px] font-semibold text-foreground w-14 truncate">{s.name}</span>
                      <div className="flex-1 h-2.5 rounded-full bg-muted/15 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(s.count / analysis.maxSubjectCount) * 100}%` }}
                          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: s.color + 'cc' }}
                        />
                      </div>
                      <span className="text-[9px] font-bold font-mono text-foreground/70 w-6 text-right">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatMini({ label, value, icon, trend }: { label: string; value: string | number; icon: string; trend?: number }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-card/30 border border-border/10">
      <span className="text-[10px]">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-display-digit text-xs font-bold text-foreground leading-none truncate">{value}</p>
        <p className="text-[7px] text-muted-foreground font-semibold mt-0.5">{label}</p>
      </div>
      {trend !== undefined && trend !== 0 && (
        <span className={`text-[8px] font-bold ${trend > 0 ? 'text-diff-easy' : 'text-destructive'}`}>
          {trend > 0 ? '↑' : '↓'}
        </span>
      )}
    </div>
  );
}
