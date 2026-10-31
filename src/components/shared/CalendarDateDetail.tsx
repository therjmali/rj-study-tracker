import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Clock, Smile, ListChecks, CheckCircle2, Flame } from 'lucide-react';
import type { Subject, DailyLog, DbStudySession } from '../../types';
import type { TodoItem } from '../../hooks/useTodos';
import BottomSheet from './BottomSheet';
import { formatStudyTime, getEffectiveDayMinutes } from '../../lib/utils';

const MOOD_MAP: Record<string, { emoji: string; label: string; color: string }> = {
  Sad: { emoji: '😔', label: 'Sad', color: 'text-blue-400' },
  Tired: { emoji: '😴', label: 'Tired', color: 'text-chart-4' },
  Okay: { emoji: '😐', label: 'Okay', color: 'text-muted-foreground' },
  Neutral: { emoji: '😐', label: 'Okay', color: 'text-muted-foreground' },
  Happy: { emoji: '😊', label: 'Happy', color: 'text-secondary' },
  Motivated: { emoji: '🔥', label: 'Motivated', color: 'text-destructive' },
};

const MOOD_ORDER = ['Sad', 'Tired', 'Okay', 'Happy', 'Motivated'] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  date: string;
  subjects: Subject[];
  dailyLogs: DailyLog[];
  todos?: TodoItem[];
  dbSessions?: DbStudySession[];
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function CalendarDateDetail({ open, onClose, date, subjects, dailyLogs, todos = [], dbSessions }: Props) {
  const log = useMemo(() => dailyLogs.find(l => l.date === date), [dailyLogs, date]);

  const topicsForDate = useMemo(() => {
    const results: { name: string; subjectName: string; subjectColor: string; difficulty: string; timeSpent: number; completedTime?: string; status: string; dateMinutes: number; timeNotes: { minutes: number; note?: string }[]; unitName: string; isUnitEntry?: boolean }[] = [];
    subjects.forEach(s => s.units.forEach(u => {
      // Unit-level time entries for this date
      const unitDateEntries = u.timeEntries?.filter(e => e.date === date) || [];
      if (unitDateEntries.length > 0) {
        const unitDateMins = unitDateEntries.reduce((a, e) => a + e.minutes, 0);
        results.push({
          name: `📁 ${u.name} (Unit)`, subjectName: s.shortName, subjectColor: s.color,
          difficulty: 'Medium', timeSpent: u.timeSpent || 0,
          completedTime: undefined, status: 'in_process', dateMinutes: unitDateMins,
          timeNotes: unitDateEntries.map(e => ({ minutes: e.minutes, note: e.note })),
          unitName: u.name, isUnitEntry: true,
        });
      }
      u.subTopics.forEach(t => {
        const dateEntries = t.timeEntries?.filter(e => e.date === date) || [];
        const dateMinutesFromEntries = dateEntries.reduce((a, e) => a + e.minutes, 0);
        const timeNotes = dateEntries.map(e => ({ minutes: e.minutes, note: e.note }));

        // Show completed topics on their completion date
        if (t.completed && t.completedDate === date) {
          const dateMinutes = dateMinutesFromEntries || t.timeSpent || 0;
          results.push({
            name: t.name, subjectName: s.shortName, subjectColor: s.color,
            difficulty: t.difficulty, timeSpent: t.timeSpent || 0,
            completedTime: t.completedTime, status: 'complete', dateMinutes, timeNotes,
            unitName: u.name,
          });
        }
        // Show topics that have time entries on this date (but weren't completed on this date)
        else if (dateMinutesFromEntries > 0) {
          results.push({
            name: t.name, subjectName: s.shortName, subjectColor: s.color,
            difficulty: t.difficulty, timeSpent: t.timeSpent || 0,
            completedTime: undefined, status: t.status || (t.completed ? 'complete' : 'incomplete'), dateMinutes: dateMinutesFromEntries, timeNotes,
            unitName: u.name,
          });
        }
      });
    }));
    return results.sort((a, b) => (a.completedTime || '').localeCompare(b.completedTime || ''));
  }, [subjects, date]);

  // Group topics by unit for display
  const unitGroups = useMemo(() => {
    const groups: { unitKey: string; unitName: string; subjectName: string; subjectColor: string; topics: typeof topicsForDate; totalDateMinutes: number }[] = [];
    const groupMap = new Map<string, typeof groups[0]>();
    topicsForDate.forEach(t => {
      const key = `${t.subjectName}::${t.unitName}`;
      let group = groupMap.get(key);
      if (!group) {
        group = { unitKey: key, unitName: t.unitName, subjectName: t.subjectName, subjectColor: t.subjectColor, topics: [], totalDateMinutes: 0 };
        groupMap.set(key, group);
        groups.push(group);
      }
      group.topics.push(t);
      group.totalDateMinutes += t.dateMinutes;
    });
    return groups;
  }, [topicsForDate]);

  const topicTimeMins = useMemo(() => topicsForDate.reduce((a, t) => a + t.dateMinutes, 0), [topicsForDate]);
  const loggedTimeMins = useMemo(() => {
    if (!log?.sessions) return 0;
    return log.sessions.reduce((a, s) => a + s.durationMinutes, 0);
  }, [log]);
  const totalStudyMins = useMemo(() => {
    // Single source of truth: use getEffectiveDayMinutes which combines
    // topic time + session time without double-counting
    return getEffectiveDayMinutes(subjects, dailyLogs, date, dbSessions);
  }, [subjects, dailyLogs, date, dbSessions]);

  const dateTodos = useMemo(() => todos.filter(t => t.dueDate === date), [todos, date]);

  // Last 7 days mood trend
  const moodTrend = useMemo(() => {
    const trend: { date: string; mood?: string; dayLabel: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(date + 'T00:00:00');
      d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayLog = dailyLogs.find(l => l.date === ds);
      trend.push({
        date: ds,
        mood: dayLog?.mood,
        dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
      });
    }
    return trend;
  }, [date, dailyLogs]);

  const hasMoodData = moodTrend.some(t => t.mood);

  return (
    <BottomSheet open={open} onClose={onClose} title={`📅 ${formatDateLabel(date)}`}>
      <div className="space-y-4 pt-1">

        {/* ── Section 1: Topics Completed ── */}
        <Section icon={<BookOpen className="w-3.5 h-3.5 text-primary" />} title="Study Activity" count={topicsForDate.length}>
          {topicsForDate.length === 0 ? (
            <EmptyBlock emoji="📋" text="No study activity on this day" />
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto scrollbar-hide">
              {unitGroups.map((group, gi) => (
                <div key={group.unitKey}>
                  {/* Unit header */}
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: group.subjectColor }} />
                    <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground flex-1 truncate">
                      {group.subjectName} · {group.unitName}
                    </span>
                    {group.totalDateMinutes > 0 && (
                      <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-chart-5/10 text-chart-5 border border-chart-5/15 shrink-0">
                        {formatStudyTime(group.totalDateMinutes)}
                      </span>
                    )}
                    <span className="text-[8px] font-bold text-muted-foreground/50">{group.topics.length}</span>
                  </div>
                  {/* Topics in this unit */}
                  <div className="space-y-1 ml-3 border-l-2 pl-2" style={{ borderLeftColor: group.subjectColor + '30' }}>
                    {group.topics.map((t, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: (gi * 0.05) + (i * 0.02) }}
                        className="flex items-center gap-2 p-1.5 rounded-lg bg-card/40 border border-border/10">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-foreground break-words">{t.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {t.completedTime && <span className="text-[8px] font-mono text-muted-foreground/60">⏰ {t.completedTime}</span>}
                            <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-bold ${
                              t.status === 'complete' ? 'bg-secondary/15 text-secondary' :
                              t.status === 'in_process' ? 'bg-chart-4/15 text-chart-4' :
                              'bg-muted/30 text-muted-foreground'
                            }`}>{t.status === 'complete' ? '✅ Done' : t.status === 'in_process' ? '🔄 WIP' : '📋'}</span>
                          </div>
                          {/* Time entries with notes */}
                          {t.timeNotes.length > 0 && t.timeNotes.some(tn => tn.note) && (
                            <div className="mt-1 space-y-0.5">
                              {t.timeNotes.filter(tn => tn.note).map((tn, j) => (
                                <div key={j} className="flex items-center gap-1.5">
                                  <span className="text-[8px] font-mono text-chart-5 font-bold">{formatStudyTime(tn.minutes)}</span>
                                  <span className="text-[8px] truncate text-muted-foreground/70">
                                    — {tn.note || '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <DiffBadge diff={t.difficulty} />
                        {t.dateMinutes > 0 && (
                          <span className="text-[8px] font-mono text-secondary font-bold shrink-0 bg-secondary/10 px-1.5 py-0.5 rounded-md">{formatStudyTime(t.dateMinutes)}</span>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Section 2: Study Time ── */}
        <Section icon={<Clock className="w-3.5 h-3.5 text-secondary" />} title="Study Time">
          {totalStudyMins === 0 ? (
            <EmptyBlock emoji="⏱️" text="No study time recorded" />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-4 p-3 rounded-xl bg-secondary/8 border border-secondary/15">
                <div className="w-12 h-12 rounded-xl bg-secondary/15 border border-secondary/20 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xl font-black font-mono text-foreground leading-none">{formatStudyTime(totalStudyMins)}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold mt-1">
                    {topicsForDate.length > 0 ? `across ${topicsForDate.length} topic${topicsForDate.length > 1 ? 's' : ''}` : 'logged time'}
                  </p>
                  {(topicTimeMins > 0 || loggedTimeMins > 0) && (topicTimeMins > 0 && loggedTimeMins > 0) && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/15">📚 {formatStudyTime(topicTimeMins)}</span>
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/15">📝 {formatStudyTime(loggedTimeMins)}</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Manual sessions from daily log */}
              {log?.sessions && log.sessions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">📝 Manual Sessions</p>
                  {log.sessions.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-card/40 border border-border/10">
                      <Clock className="w-3 h-3 text-chart-5 shrink-0" />
                      <span className="text-[10px] font-semibold text-foreground flex-1 truncate">{s.subjectName}</span>
                      {(s.subjectId === 'general' || !s.subjectId) && (
                        <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground border border-border/20">Other</span>
                      )}
                      {s.note && <span className="text-[8px] text-muted-foreground/60 truncate max-w-[80px]">{s.note}</span>}
                      <span className="text-[9px] font-mono font-bold text-secondary shrink-0">{formatStudyTime(s.durationMinutes)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Section 3: Mood (only if set) ── */}
        {log?.mood && MOOD_MAP[log.mood] && (
          <Section icon={<Smile className="w-3.5 h-3.5 text-accent" />} title="Mood">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-accent/8 border border-accent/15">
              <span className="text-3xl">{MOOD_MAP[log.mood].emoji}</span>
              <div>
                <p className={`text-sm font-bold ${MOOD_MAP[log.mood].color}`}>{MOOD_MAP[log.mood].label}</p>
                <p className="text-[10px] text-muted-foreground">Mood recorded for this day</p>
              </div>
            </div>
          </Section>
        )}

        {/* ── Mood Trend (last 7 days) ── */}
        {hasMoodData && (
          <div className="rounded-xl bg-card/30 border border-border/10 p-3">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">😊 Mood Trend — Last 7 Days</p>
            <div className="flex justify-between items-end">
              {moodTrend.map((t, i) => {
                const isSelected = t.date === date;
                return (
                  <div key={i} className={`flex flex-col items-center gap-1 ${isSelected ? 'scale-110' : ''}`}>
                    <span className="text-base leading-none">{t.mood ? MOOD_MAP[t.mood]?.emoji || '·' : '·'}</span>
                    <span className={`text-[8px] font-bold ${isSelected ? 'text-primary' : 'text-muted-foreground/50'}`}>{t.dayLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Section 4: To-Do List ── */}
        <Section icon={<ListChecks className="w-3.5 h-3.5 text-chart-4" />} title="Tasks" count={dateTodos.length}>
          {dateTodos.length === 0 ? (
            <EmptyBlock emoji="✅" text="No tasks scheduled for this day" />
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-hide">
              {dateTodos.map(todo => {
                const priorityDot = todo.priority === 'high' ? 'bg-destructive' : todo.priority === 'medium' ? 'bg-chart-4' : 'bg-secondary';
                return (
                  <div key={todo.id} className={`flex items-center gap-2 p-2 rounded-lg border ${
                    todo.completed ? 'bg-secondary/5 border-secondary/15 opacity-60' : 'bg-card/40 border-border/10'
                  }`}>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      todo.completed ? 'bg-secondary border-secondary' : 'border-muted-foreground/30'
                    }`}>
                      {todo.completed && <CheckCircle2 className="w-2.5 h-2.5 text-secondary-foreground" />}
                    </div>
                    <p className={`text-[11px] font-semibold flex-1 min-w-0 truncate ${todo.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {todo.priority === 'high' && !todo.completed && <Flame className="w-3 h-3 text-destructive inline mr-1 -mt-0.5" />}
                      {todo.text}
                    </p>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${priorityDot}`} />
                    {todo.dueTime && <span className="text-[8px] font-mono text-muted-foreground shrink-0">{todo.dueTime}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── Notes ── */}
        {log?.notes && (
          <div className="rounded-xl bg-card/30 border border-border/10 p-3">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">📝 Notes</p>
            <p className="text-[11px] text-foreground leading-relaxed">{log.notes}</p>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count?: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{title}</span>
        {count !== undefined && count > 0 && (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-black border border-primary/15">{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyBlock({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex items-center gap-2 py-4 justify-center opacity-50">
      <span className="text-lg">{emoji}</span>
      <span className="text-[11px] text-muted-foreground italic">{text}</span>
    </div>
  );
}

function DiffBadge({ diff }: { diff: string }) {
  const cls = diff === 'Easy' ? 'bg-diff-easy/15 text-diff-easy border-diff-easy/20'
    : diff === 'Medium' ? 'bg-diff-medium/15 text-diff-medium border-diff-medium/20'
    : 'bg-diff-hard/15 text-diff-hard border-diff-hard/20';
  return <span className={`text-[7px] px-1.5 py-0.5 rounded border font-bold shrink-0 ${cls}`}>{diff[0]}</span>;
}
