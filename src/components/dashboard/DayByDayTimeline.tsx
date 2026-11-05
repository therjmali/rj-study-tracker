import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, ChevronDown, Clock, BookOpen, ExternalLink, Moon, ArrowUpDown, X, ClipboardList } from 'lucide-react';
import type { Subject, SubTopic, DailyLog, DbStudySession } from '../../types';
import { getLocalDateStr, formatStudyHours, formatStudyTime, getEffectiveDayMinutes, normalizeSubjectId, readableInk } from '../../lib/utils';
import { useToday } from '../../hooks/useToday';
interface Props {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  dbSessions?: DbStudySession[];
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string) => void;
  externalRange?: { from: string; to: string } | null;
  externalSubjectFilter?: string;
  getTodosForDate?: (date: string) => { id: string; text: string; completed: boolean; priority: string }[];
  getPendingCountForDate?: (date: string) => number;
}

type SortMode = 'date-desc' | 'date-asc' | 'best' | 'topics-high' | 'topics-low' | 'hours-high' | 'hours-low';

interface TopicEntry {
  topic: SubTopic;
  subjectId: string;
  unitId: string;
  shortName: string;
  color: string;
  completedTime?: string;
  timeSpent: number;
  difficulty: string;
}

interface SubjectGroup {
  subjectId: string;
  subjectName: string;
  shortName: string;
  color: string;
  topics: { topic: SubTopic; unitId: string }[];
  totalTime: number;
  sessionTime: number; // time from logged sessions (type='Other')
}

interface LoggedSessionEntry {
  id: string;
  description: string;
  minutes: number;
  subjectName: string;
  color: string;
}

interface DayData {
  date: string;
  label: string;
  dayName: string;
  hours: number;
  topicTime: number;
  effectiveTime: number; // topic-primary, log-fallback (matches getEffectiveDayMinutes)
  topicCount: number;
  topicDetails: TopicEntry[];
  subjectGroups: SubjectGroup[];
  loggedSessions: LoggedSessionEntry[];
}

const DIFF_COLORS: Record<string, string> = {
  Easy: 'bg-diff-easy/20 text-diff-easy',
  Medium: 'bg-diff-medium/20 text-diff-medium',
  Hard: 'bg-diff-hard/20 text-diff-hard',
};

const SORT_OPTIONS: { id: SortMode; label: string; icon: string }[] = [
  { id: 'date-desc', label: 'Newest', icon: '📅' },
  { id: 'date-asc', label: 'Oldest', icon: '📆' },
  { id: 'best', label: 'Best', icon: '🏆' },
  { id: 'topics-high', label: 'Topics High', icon: '📚' },
  { id: 'topics-low', label: 'Topics Low', icon: '📖' },
  { id: 'hours-high', label: 'Hours High', icon: '⏱️' },
  { id: 'hours-low', label: 'Hours Low', icon: '⏳' },
];

function formatTime12(t: string | undefined): string {
  if (!t) return '';
  const normalized = t.replace(/\./g, ':');
  const [hRaw, mRaw] = normalized.split(':').map(Number);
  const h = isNaN(hRaw) ? 0 : hRaw;
  const m = isNaN(mRaw) ? 0 : mRaw;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const fmtMins = formatStudyTime;

function getRelativeLabel(dateStr: string, today: string): { label: string; dayName: string } {
  const yd = new Date(today + 'T12:00:00');
  yd.setDate(yd.getDate() - 1);
  const yesterdayStr = getLocalDateStr(yd);
  if (dateStr === today) return { label: 'Today', dayName: '' };
  if (dateStr === yesterdayStr) return { label: 'Yesterday', dayName: '' };
  const d = new Date(dateStr + 'T12:00:00');
  const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const day = d.getDate();
  return { label: `${dayName}, ${month} ${day}`, dayName };
}

/* ─── Inactive Day Row (compact) ─── */
function InactiveDayRow({ day }: { day: DayData }) {
  return (
    <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/5 bg-card/10"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/15 shrink-0" />
      <span className="text-[10px] text-muted-foreground/40 font-semibold flex-1">{day.label}</span>
      <span className="text-[9px] text-muted-foreground/30 italic font-medium flex items-center gap-1">
        <Moon className="w-2.5 h-2.5" /> No activity
      </span>
    </motion.div>
  );
}

/* ─── Day Row ─── */
/** Parse activity type from description like "[Practice] O&G" → { type: "Practice", rest: "O&G" } */
function parseActivity(desc: string): { type: string; rest: string } {
  const m = desc.match(/^\[([^\]]+)\]\s*(.*)/);
  if (m) return { type: m[1], rest: m[2] };
  return { type: '', rest: desc };
}

const ACTIVITY_COLORS: Record<string, string> = {
  'Self-Study': 'bg-primary/10 text-primary border-primary/20',
  Lecture: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  Video: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  Seminar: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  Revision: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  Practice: 'bg-secondary/10 text-secondary border-secondary/20',
  Pomodoro: 'bg-chart-4/10 text-chart-4 border-chart-4/20',
  Other: 'bg-muted/20 text-muted-foreground border-border/20',
};

function LoggedSessionsList({ sessions }: { sessions: LoggedSessionEntry[] }) {
  if (sessions.length === 0) return null;
  return (
    <div className="mt-2 pt-2 border-t border-border/10">
      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
        📋 Logged Sessions ({sessions.length})
      </p>
      <div className="space-y-0.5">
        {sessions.map(s => {
          const { type: actType, rest: actLabel } = parseActivity(s.description);
          const actColor = ACTIVITY_COLORS[actType] || ACTIVITY_COLORS.Other;
          return (
            <div key={s.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-card/30">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-[10px] font-semibold text-foreground flex-1 truncate">{actLabel || s.description}</span>
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 border"
                style={{ color: readableInk(s.color), borderColor: s.color + '30', backgroundColor: s.color + '10' }}>{s.subjectName}</span>
              {actType && (
                <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded-full shrink-0 border ${actColor}`}>{actType}</span>
              )}
              <span className="text-[9px] font-mono font-bold text-secondary shrink-0">{fmtMins(s.minutes)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayRow({ day, onOpenTopicDetail, isBest, isSubjectFiltered, pendingTodos, todosForDay }: {
  day: DayData;
  onOpenTopicDetail?: Props['onOpenTopicDetail'];
  isBest: boolean;
  isSubjectFiltered: boolean;
  pendingTodos: number;
  todosForDay: { id: string; text: string; completed: boolean; priority: string }[];
}) {
  const [open, setOpen] = useState(false);
  // FIX: Single source of truth — effectiveTime > 0 means active, period.
  // topicCount, loggedSessions, and subjectGroups are just display details.
  const hasActivity = day.effectiveTime > 0 || day.topicCount > 0 || day.loggedSessions.length > 0;
  const isToday = day.label === 'Today';
  const displayTime = day.effectiveTime;
  const displayTimeLabel = fmtMins(day.effectiveTime);

  return (
    <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', damping: 28, stiffness: 350 }}
      className={`rounded-xl border transition-colors ${
        open ? 'border-border/30 bg-card/40' : 'border-border/10 bg-card/20'
      } ${isToday ? 'ring-1 ring-primary/15' : ''} ${isBest ? 'ring-1 ring-chart-4/15' : ''}`}
    >
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-card/30 transition-colors active:scale-[0.998] rounded-xl"
      >
        <div className={`w-2 h-2 rounded-full shrink-0 ${isToday ? 'bg-primary' : hasActivity ? 'bg-secondary' : 'bg-muted-foreground/20'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-foreground'}`}>{day.label}</span>
            {isBest && <span className="text-[7px] font-bold px-1 py-0.5 rounded-full bg-chart-4/15 text-chart-4 border border-chart-4/20">🏆</span>}
          </div>
          {hasActivity && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] text-muted-foreground font-semibold flex items-center gap-0.5">
                <BookOpen className="w-2.5 h-2.5" /> {day.topicCount} topic{day.topicCount !== 1 ? 's' : ''}
              </span>
              {displayTime > 0 && (
                <span className="text-[9px] text-muted-foreground font-semibold flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" /> {displayTimeLabel}
                </span>
              )}
              {pendingTodos > 0 && (
                <span className="text-[9px] font-semibold flex items-center gap-0.5 text-accent">
                  📋 {pendingTodos} task{pendingTodos !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
        {!open && day.subjectGroups.length > 0 && (
          <div className="flex items-center gap-0.5 shrink-0">
            {day.subjectGroups.slice(0, 5).map(sg => (
              <div key={sg.subjectId} className="w-2.5 h-2.5 rounded-full border border-background/50" style={{ backgroundColor: sg.color }} />
            ))}
            {day.subjectGroups.length > 5 && <span className="text-[8px] text-muted-foreground ml-0.5">+{day.subjectGroups.length - 5}</span>}
          </div>
        )}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="overflow-hidden">
            <div className="px-3 pb-3 pt-0.5">
              {!hasActivity ? (
                <div className="flex items-center gap-2 py-3 justify-center">
                  <Moon className="w-3.5 h-3.5 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/60 italic font-medium">No study logged this day</span>
                </div>
              ) : day.topicDetails.length === 0 && day.loggedSessions.length === 0 ? (
                <div className="flex items-center gap-2 py-3 justify-center">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/60 italic font-medium">{fmtMins(day.effectiveTime)} studied (no topics marked)</span>
                </div>
              ) : day.topicDetails.length === 0 && day.loggedSessions.length > 0 ? (
                <LoggedSessionsList sessions={day.loggedSessions} />
              ) : (
                <>
                  {/* Topic list */}
                  <div className="space-y-0.5">
                    {day.topicDetails.map((td, ti) => (
                      <button key={td.topic.id}
                        onClick={(e) => { e.stopPropagation(); onOpenTopicDetail?.(td.topic, td.subjectId, td.unitId); }}
                        className="group w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-card/50 transition-colors text-left active:scale-[0.99]">
                        <div className="flex flex-col items-center shrink-0 w-3">
                          {ti > 0 && <div className="w-px h-1 bg-border/30" />}
                          <div className="w-2 h-2 rounded-full border-2 shrink-0" style={{ borderColor: td.color, backgroundColor: td.color + '30' }} />
                          {ti < day.topicDetails.length - 1 && <div className="w-px flex-1 bg-border/30 min-h-[4px]" />}
                        </div>
                        {td.completedTime && (
                          <span className="text-[9px] font-mono font-bold text-primary bg-primary/8 px-1.5 py-0.5 rounded shrink-0 border border-primary/10">
                            {formatTime12(td.completedTime)}
                          </span>
                        )}
                        <span className="text-[10px] font-semibold text-foreground flex-1 truncate group-hover:text-primary transition-colors">{td.topic.name}</span>
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 border"
                          style={{ color: readableInk(td.color), borderColor: td.color + '30', backgroundColor: td.color + '10' }}>{td.shortName}</span>
                        <span className={`text-[7px] font-bold px-1 py-0.5 rounded shrink-0 ${DIFF_COLORS[td.difficulty] || DIFF_COLORS.Medium}`}>{td.difficulty[0]}</span>
                        {td.timeSpent > 0 && <span className="text-[8px] font-mono text-muted-foreground shrink-0">{fmtMins(td.timeSpent)}</span>}
                        <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/30 group-hover:text-primary shrink-0 transition-colors" />
                      </button>
                    ))}
                  </div>

                  {/* Logged sessions */}
                  <LoggedSessionsList sessions={day.loggedSessions} />

                  {/* To-do items — Premium */}
                  {todosForDay.length > 0 && (() => {
                    const completedCount = todosForDay.filter(t => t.completed).length;
                    const pendingCount = todosForDay.length - completedCount;
                    const pct = todosForDay.length > 0 ? Math.round((completedCount / todosForDay.length) * 100) : 0;
                    return (
                      <div className="mt-2.5 pt-2 border-t border-border/10">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                            <ClipboardList className="w-3 h-3 text-accent" /> Tasks
                          </p>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${pct >= 100 ? 'bg-secondary/15 text-secondary' : 'bg-accent/10 text-accent'}`}>
                              {completedCount}/{todosForDay.length} · {pct}%
                            </span>
                          </div>
                        </div>
                        {/* Mini progress bar */}
                        <div className="h-1 rounded-full bg-muted/20 overflow-hidden mb-1.5">
                          <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-secondary' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="space-y-0.5">
                          {todosForDay.map(todo => (
                            <div key={todo.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${todo.completed ? 'bg-secondary/5' : 'bg-card/30 hover:bg-card/50'}`}>
                              <span className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 text-[8px] ${
                                todo.completed ? 'bg-secondary/20 border-secondary/40 text-secondary' : 'border-border/30'
                              }`}>
                                {todo.completed && '✓'}
                              </span>
                              <span className={`text-[10px] flex-1 ${todo.completed ? 'line-through text-muted-foreground/40 font-medium' : 'text-foreground font-semibold'}`}>
                                {todo.text}
                              </span>
                              {!todo.completed && (
                                <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full shrink-0 uppercase tracking-wider ${
                                  todo.priority === 'high' ? 'bg-destructive/12 text-destructive border border-destructive/15' :
                                  todo.priority === 'medium' ? 'bg-chart-4/12 text-chart-4 border border-chart-4/15' : 'bg-muted/20 text-muted-foreground border border-border/15'
                                }`}>{todo.priority === 'high' ? '🔴' : todo.priority === 'medium' ? '🟡' : '🟢'} {todo.priority}</span>
                              )}
                            </div>
                          ))}
                        </div>
                        {pendingCount > 0 && (
                          <p className="text-[8px] text-accent/60 font-semibold mt-1 text-center">
                            {pendingCount === 1 ? '1 task remaining' : `${pendingCount} tasks remaining`}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Subject time breakdown summary */}
                  {day.subjectGroups.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-border/15">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 px-1 flex items-center gap-1">
                        ⏱️ Time by Subject
                      </p>
                      <div className="space-y-1 px-1">
                        {day.subjectGroups.map(sg => (
                          <div key={sg.subjectId} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sg.color }} />
                            <span className="text-[10px] font-semibold text-foreground flex-1 truncate">{sg.shortName}</span>
                            {sg.topics.length > 0 && (
                              <span className="text-[9px] font-mono text-muted-foreground">
                                {sg.topics.length} topic{sg.topics.length !== 1 ? 's' : ''}
                              </span>
                            )}
                            {sg.sessionTime > 0 && sg.topics.length > 0 && (
                              <span className="text-[7px] font-bold px-1 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/15 shrink-0">
                                +{fmtMins(sg.sessionTime)} logged
                              </span>
                            )}
                            {sg.sessionTime > 0 && sg.topics.length === 0 && (
                              <span className="text-[7px] font-bold px-1 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/15 shrink-0">
                                📝 logged
                              </span>
                            )}
                            {sg.totalTime > 0 && (
                              <span className="text-[9px] font-mono font-bold text-primary">{fmtMins(sg.totalTime)}</span>
                            )}
                          </div>
                        ))}
                        {/* Total row */}
                        <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-border/10">
                          <div className="w-2 h-2 shrink-0" />
                          <span className="text-[10px] font-bold text-foreground flex-1">Total</span>
                          {day.effectiveTime > 0 && (
                            <span className="text-[9px] font-mono font-bold text-primary">{fmtMins(day.effectiveTime)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Main Component ─── */
export default function DayByDayTimeline({ subjects, dailyLogs, dbSessions, onOpenTopicDetail, externalRange, externalSubjectFilter, getTodosForDate: getTodosForDateProp, getPendingCountForDate: getPendingCountForDateProp }: Props) {
  const [open, setOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('date-desc');
  const [showSortBar, setShowSortBar] = useState(false);
  const today = useToday();
  const getTodosForDate = getTodosForDateProp || (() => []);
  const getPendingCountForDate = getPendingCountForDateProp || (() => 0);

  const activeSubjectFilter = externalSubjectFilter || 'all';
  const isSubjectFiltered = activeSubjectFilter !== 'all';

  const effectiveRange = useMemo(() => {
    if (externalRange) return externalRange;
    const from = new Date(today + 'T12:00:00');
    from.setDate(from.getDate() - 29);
    return { from: getLocalDateStr(from), to: today };
  }, [externalRange, today]);

  const dayCount = useMemo(() => {
    const fromDate = new Date(effectiveRange.from + 'T12:00:00');
    const toDate = new Date(effectiveRange.to + 'T12:00:00');
    return Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
  }, [effectiveRange]);

  const filteredSubjects = useMemo(() => {
    if (activeSubjectFilter === 'all') return subjects;
    const ids = activeSubjectFilter.split(',');
    return subjects.filter(s => ids.includes(s.id));
  }, [subjects, activeSubjectFilter]);

  const days: DayData[] = useMemo(() => {
    const result: DayData[] = [];
    const logMap = new Map(dailyLogs.map(l => [l.date, l]));
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(effectiveRange.to + 'T12:00:00');
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateStr(d);
      if (dateStr < effectiveRange.from) break;
      const { label, dayName } = getRelativeLabel(dateStr, today);
      const log = logMap.get(dateStr);
      const subjectMap = new Map<string, { subjectId: string; subjectName: string; shortName: string; color: string; topics: { topic: SubTopic; unitId: string }[] }>();
      const topicDetails: TopicEntry[] = [];
      filteredSubjects.forEach(s => {
        s.units.forEach(u => {
          u.subTopics.forEach(t => {
            if (t.completed && t.completedDate === dateStr) {
              let entry = subjectMap.get(s.id);
              if (!entry) { entry = { subjectId: s.id, subjectName: s.name, shortName: s.shortName, color: s.color, topics: [] }; subjectMap.set(s.id, entry); }
              entry.topics.push({ topic: t, unitId: u.id });
              topicDetails.push({ topic: t, subjectId: s.id, unitId: u.id, shortName: s.shortName, color: s.color, completedTime: t.completedTime, timeSpent: t.timeSpent || 0, difficulty: t.difficulty || 'Medium' });
            }
          });
          // FIX: Also pick up topics that have timeEntries on this date but were NOT completed on this date.
          // This ensures days with study-time-only (no completion) still show in subjectGroups.
          u.subTopics.forEach(t => {
            if (t.completedDate === dateStr) return; // already added above
            const entryMins = t.timeEntries?.filter(e => e.date === dateStr).reduce((a, e) => a + e.minutes, 0) || 0;
            if (entryMins > 0) {
              if (!subjectMap.has(s.id)) {
                subjectMap.set(s.id, { subjectId: s.id, subjectName: s.name, shortName: s.shortName, color: s.color, topics: [] });
              }
            }
          });
          // FIX: Also pick up unit-level timeEntries
          const unitEntryMins = u.timeEntries?.filter(e => e.date === dateStr).reduce((a, e) => a + e.minutes, 0) || 0;
          if (unitEntryMins > 0) {
            if (!subjectMap.has(s.id)) {
              subjectMap.set(s.id, { subjectId: s.id, subjectName: s.name, shortName: s.shortName, color: s.color, topics: [] });
            }
          }
        });
      });
      topicDetails.sort((a, b) => (a.completedTime || '').localeCompare(b.completedTime || ''));

      // Merge logged sessions into subject groups so every subject shows total = topic + session time
      const daySessions = (dbSessions || []).filter(s => s.date === dateStr);
      // Build per-subject session time (only type='Other' since Topic/Unit already updates topic.timeSpent)
      const sessionTimeBySubject = new Map<string, number>();
      const allSessionTimeBySubject = new Map<string, number>();
      daySessions.forEach(s => {
        const key = normalizeSubjectId(s.subjectId) || '__other__';
        allSessionTimeBySubject.set(key, (allSessionTimeBySubject.get(key) || 0) + (s.minutes || 0));
        if (s.type === 'Other') {
          sessionTimeBySubject.set(key, (sessionTimeBySubject.get(key) || 0) + (s.minutes || 0));
        }
      });

      // Add subject entries for sessions that have a subjectId but no topic completions on this day
      allSessionTimeBySubject.forEach((_, key) => {
        if (key === '__other__') {
          if (!subjectMap.has('__other__')) {
            subjectMap.set('__other__', { subjectId: '__other__', subjectName: 'Other', shortName: 'Other', color: '#6B7280', topics: [] });
          }
          return;
        }
        const subj = subjects.find(sub => sub.id === key);
        if (subj && filteredSubjects.some(fs => fs.id === subj.id) && !subjectMap.has(key)) {
          subjectMap.set(key, { subjectId: subj.id, subjectName: subj.name, shortName: subj.shortName, color: subj.color, topics: [] });
        }
      });

      const subjectGroups: SubjectGroup[] = Array.from(subjectMap.values())
        .map(sg => {
          // FIX: Use per-date topic time (from timeEntries), not all-time timeSpent
          let topicTimeForDate = 0;
          filteredSubjects.filter(s => s.id === sg.subjectId).forEach(s => {
            s.units.forEach(u => {
              // Topic timeEntries for this date
              u.subTopics.forEach(t => {
                const entryMins = t.timeEntries?.filter(e => e.date === dateStr).reduce((a, e) => a + e.minutes, 0) || 0;
                if (entryMins > 0) {
                  topicTimeForDate += entryMins;
                } else if (t.completed && t.completedDate === dateStr && (t.timeSpent || 0) > 0) {
                  topicTimeForDate += t.timeSpent;
                }
              });
              // Unit-level timeEntries for this date
              const unitMins = u.timeEntries?.filter(e => e.date === dateStr).reduce((a, e) => a + e.minutes, 0) || 0;
              topicTimeForDate += unitMins;
            });
          });
          const sessTime = sessionTimeBySubject.get(sg.subjectId === '__other__' ? '__other__' : sg.subjectId) || 0;
          return { ...sg, totalTime: topicTimeForDate + sessTime, sessionTime: sessTime };
        })
        .filter(sg => sg.topics.length > 0 || sg.totalTime > 0)
        .sort((a, b) => (b.topics.length + b.totalTime) - (a.topics.length + a.totalTime));
      const topicCount = subjectGroups.reduce((acc, sg) => acc + sg.topics.length, 0);
      const topicTime = topicDetails.reduce((acc, td) => acc + td.timeSpent, 0);
      const logHrs = log?.hoursStudied ?? 0;
      // Use the shared single source of truth for time (includes dbSessions)
      const effectiveTime = getEffectiveDayMinutes(filteredSubjects, dailyLogs, dateStr, dbSessions);

      // Collect logged sessions for this date (for individual listing — exclude Topic type since those appear as topic completions)
      const loggedSessions: LoggedSessionEntry[] = daySessions
        .filter(s => s.type !== 'Topic')
        .map(s => {
          const subj = subjects.find(sub => sub.id === s.subjectId);
          return {
            id: s.id,
            description: s.description || s.note || 'Study session',
            minutes: s.minutes,
            subjectName: subj?.shortName || s.subjectName || 'Other',
            color: subj?.color || '#6B7280',
          };
        });

      result.push({ date: dateStr, label, dayName, hours: logHrs, topicTime, effectiveTime, topicCount, subjectGroups, topicDetails, loggedSessions });
    }
    return result;
  }, [filteredSubjects, dailyLogs, today, dayCount, effectiveRange, dbSessions, subjects]);

  const sortedDays = useMemo(() => {
    const arr = [...days];
    switch (sortMode) {
      case 'date-desc': return arr; // newest first (default build order)
      case 'date-asc': return arr.reverse(); // oldest first
      case 'best': return arr.sort((a, b) => (b.topicCount + b.effectiveTime) - (a.topicCount + a.effectiveTime));
      case 'topics-high': return arr.sort((a, b) => b.topicCount - a.topicCount);
      case 'topics-low': return arr.sort((a, b) => a.topicCount - b.topicCount);
      case 'hours-high': return arr.sort((a, b) => b.effectiveTime - a.effectiveTime);
      case 'hours-low': return arr.sort((a, b) => a.effectiveTime - b.effectiveTime);
      default: return arr;
    }
  }, [days, sortMode, isSubjectFiltered]);

  const summary = useMemo(() => {
    const totalTopics = days.reduce((a, d) => a + d.topicCount, 0);
    const totalEffectiveMins = days.reduce((a, d) => a + d.effectiveTime, 0);
    const activeDays = days.filter(d => d.effectiveTime > 0 || d.topicCount > 0 || d.loggedSessions.length > 0).length;
    return { totalTopics, totalEffectiveMins, activeDays };
  }, [days]);

  const bestDayDate = useMemo(() => {
    const sorted = [...days].sort((a, b) => b.topicCount - a.topicCount);
    return sorted[0]?.topicCount > 0 ? sorted[0].date : null;
  }, [days]);

  const hasActiveFilters = sortMode !== 'date-desc';
  const activeSortLabel = SORT_OPTIONS.find(s => s.id === sortMode)?.label || 'Newest';
  const timeDisplay = fmtMins(summary.totalEffectiveMins);

  // FIX: Single source of truth — effectiveTime > 0 means active day
  const isInactive = (day: DayData) => day.effectiveTime === 0 && day.topicCount === 0 && day.loggedSessions.length === 0;

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-card/30 transition-colors active:scale-[0.998]"
      >
        <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center shrink-0">
          <CalendarDays className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-foreground leading-tight">Day-by-Day</h2>
            {hasActiveFilters && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15 truncate max-w-[120px]">
                {activeSortLabel}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
            📅 {summary.totalTopics} topics · {timeDisplay} · {summary.activeDays}/{dayCount} active
          </p>
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
            <div className="px-4 pb-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground font-semibold flex-1">
                  📊 {effectiveRange.from} → {effectiveRange.to}
                </span>
                <button
                  onClick={() => setShowSortBar(p => !p)}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all ${
                    showSortBar || hasActiveFilters ? 'bg-primary/10 text-primary border-primary/20' : 'bg-card/40 text-muted-foreground border-border/20'
                  }`}
                >
                  <ArrowUpDown className="w-3 h-3" /> Sort
                </button>
              </div>

              <AnimatePresence>
                {showSortBar && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="space-y-2 rounded-xl border border-border/15 bg-card/20 p-2.5">
                      <div>
                        <p className="text-[9px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Sort by</p>
                        <div className="flex flex-wrap gap-1">
                          {SORT_OPTIONS.map(s => (
                            <button key={s.id} onClick={() => setSortMode(s.id)}
                              className={`text-[9px] font-bold px-2 py-1 rounded-full border transition-all flex items-center gap-1 ${
                                sortMode === s.id ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-card/40 text-muted-foreground border-border/20 hover:bg-card/60'
                              }`}>
                              <span className="text-[8px]">{s.icon}</span> {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {hasActiveFilters && (
                        <button onClick={() => setSortMode('date-desc')}
                          className="text-[9px] font-bold text-destructive flex items-center gap-1 hover:underline">
                          <X className="w-3 h-3" /> Reset sort
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-1.5">
                <AnimatePresence mode="popLayout">
                  {sortedDays.map(day => (
                    isInactive(day) && sortMode === 'date-desc' ? (
                      <InactiveDayRow key={day.date} day={day} />
                    ) : isInactive(day) && sortMode === 'date-asc' ? (
                      <InactiveDayRow key={day.date} day={day} />
                    ) : (
                      <DayRow key={day.date} day={day} onOpenTopicDetail={onOpenTopicDetail} isBest={day.date === bestDayDate} isSubjectFiltered={isSubjectFiltered} pendingTodos={getPendingCountForDate(day.date)} todosForDay={getTodosForDate(day.date)} />
                    )
                  ))}
                </AnimatePresence>
              </div>

              {sortedDays.length === 0 && (
                <div className="py-6 text-center">
                  <p className="text-xs text-muted-foreground">No days in this range</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
