import { useMemo } from 'react';
import type { Subject, DailyLog, DbStudySession } from '../../types';
import { getStats } from '../../lib/gamification';
import { formatStudyTime, getUnifiedTotalMinutes, readableInk } from '../../lib/utils';
import GlowCard from '../shared/GlowCard';

export default function OverviewTab({ subjects, dailyLogs, stats, dbSessions }: { subjects: Subject[]; dailyLogs: DailyLog[]; stats: ReturnType<typeof getStats>; dbSessions?: DbStudySession[] }) {
  const allTopics = subjects.flatMap(s => s.units.flatMap(u => u.subTopics));
  const easy = allTopics.filter(t => t.difficulty === 'Easy');
  const med = allTopics.filter(t => t.difficulty === 'Medium');
  const hard = allTopics.filter(t => t.difficulty === 'Hard');
  const totalDone = stats.done;
  const effectiveTime = useMemo(() => getUnifiedTotalMinutes(subjects, dbSessions, dailyLogs), [subjects, dbSessions, dailyLogs]);

  return (
    <div className="space-y-4">
      <GlowCard className="p-4" paper>
        <h3 className="text-xs font-bold text-foreground mb-3">📊 Lifetime Stats</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 rounded-xl bg-secondary/10 border border-secondary/15">
            <p className="text-2xl font-black font-mono text-secondary">{totalDone}</p>
            <p className="text-[9px] text-muted-foreground">Topics Completed</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-primary/10 border border-primary/15">
            <p className="text-2xl font-black font-mono text-primary">{formatStudyTime(effectiveTime)}</p>
            <p className="text-[9px] text-muted-foreground">Total Study Time</p>
          </div>
        </div>
      </GlowCard>

      <GlowCard className="p-4" paper>
        <h3 className="text-xs font-bold text-foreground mb-3">🎯 Difficulty Breakdown</h3>
        {[
          { label: 'Easy', items: easy, color: 'bg-diff-easy' },
          { label: 'Medium', items: med, color: 'bg-diff-medium' },
          { label: 'Hard', items: hard, color: 'bg-diff-hard' },
        ].map(d => {
          const done = d.items.filter(t => t.completed).length;
          const dpct = d.items.length > 0 ? Math.round((done / d.items.length) * 100) : 0;
          return (
            <div key={d.label} className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-foreground font-semibold">{d.label}</span>
                <span className="text-muted-foreground font-mono">{done}/{d.items.length} ({dpct}%)</span>
              </div>
              <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                <div className={`h-full rounded-full ${d.color} transition-all`} style={{ width: `${dpct}%` }} />
              </div>
            </div>
          );
        })}
      </GlowCard>

      <GlowCard className="p-4" paper>
        <h3 className="text-xs font-bold text-foreground mb-3">📅 Study Calendar</h3>
        <div className="grid grid-cols-7 gap-1">
          {dailyLogs.slice(-42).map(l => {
            const active = l.topicsCompleted > 0 || l.hoursStudied > 0;
            return (
              <div key={l.date} title={`${l.date}: ${l.topicsCompleted} topics`}
                className={`aspect-square rounded-sm border border-border/5 ${active ? 'bg-secondary/50' : 'bg-muted/20'}`} />
            );
          })}
        </div>
      </GlowCard>

      <GlowCard className="p-4" paper>
        <h3 className="text-xs font-bold text-foreground mb-3">📁 Subject Folders</h3>
        <div className="grid grid-cols-2 gap-2">
          {subjects.map(s => {
            const all = s.units.flatMap(u => u.subTopics);
            const done = all.filter(t => t.completed).length;
            const spct = all.length > 0 ? Math.round((done / all.length) * 100) : 0;
            return (
              <div key={s.id} className="rounded-xl border border-border p-3 bg-card/30" style={{ borderLeftColor: s.color, borderLeftWidth: 3 }}>
                <p className="text-xs font-bold text-foreground truncate">{s.shortName}</p>
                <p className="text-[10px] text-muted-foreground">{s.units.length} units · {all.length} topics</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${spct}%`, backgroundColor: s.color }} />
                  </div>
                  <span className="text-[9px] font-mono font-bold" style={{ color: readableInk(s.color) }}>{spct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </GlowCard>
    </div>
  );
}
