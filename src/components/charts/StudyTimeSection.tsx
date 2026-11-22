import { memo, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Clock, Repeat, CheckCircle2, Pencil, Trash2, Copy, ChevronDown } from 'lucide-react';
import type { Subject, DailyLog, DbStudySession, RevisionKey } from '../../types';
import type { CalendarTopicInfo } from './DayDetailPanel';
import { formatStudyTime, formatTime12h, getDayStudyBreakdown, readableInk } from '../../lib/utils';
import { getDayIndex } from '../../lib/studySlices';
import { activityLabel, stripActivityTag } from '../../lib/activities';

/** A session row as the day card knows it. */
export interface DaySession {
  id: string;
  subjectId: string;
  subjectName: string;
  durationMinutes: number;
  note?: string;
  startTime?: string;
  endTime?: string;
  type?: string;
  description?: string;
  topicId?: string;
  unitId?: string;
  _color?: string;
}

type Filter = 'all' | 'topics' | 'revision' | 'sessions' | 'subject';

/* ─────────────────────────── module-level pieces ───────────────────────────
   These MUST live outside the section's render: components declared inside a render function get a new
   identity every render, so React unmounts and remounts every row (re-running its animation) on each update
   — which showed up as the whole list flickering. Here they are stable and memoised. */

const FilterPill = memo(function FilterPill({ active, onClick, label, count, color, tone }: {
  active: boolean; onClick: () => void; label: string; count?: number; color?: string; tone?: 'amber';
}) {
  return (
    <button type="button" onClick={onClick}
      className={`text-[9px] font-bold px-2.5 py-1 rounded-full border transition-all active:scale-95 flex items-center gap-1 ${
        active
          ? (tone === 'amber' ? 'bg-amber-500/18 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-[0_0_6px_hsl(38_92%_50%/0.2)]' : 'bg-primary/15 border-primary/25 text-primary shadow-[0_0_6px_hsl(var(--primary)/0.15)]')
          : (tone === 'amber' ? 'bg-amber-500/[0.06] border-amber-500/20 text-amber-600/70 dark:text-amber-400/70 hover:border-amber-500/40' : 'bg-card/30 border-border/15 text-muted-foreground/60 hover:border-border/30')
      }`}>
      {color && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {label}
      {count !== undefined && <span className="opacity-60">{count}</span>}
    </button>
  );
});

/** One topic / revision row — revision rounds get their own amber badge, tint and a ✓ when the round was finished. */
const TopicRow = memo(function TopicRow({ t, color, onOpen }: { t: CalendarTopicInfo; color: string; onOpen: (t: CalendarTopicInfo) => void }) {
  return (
    <button type="button" onClick={() => onOpen(t)}
      className={`flex items-center gap-2 w-full text-left py-1.5 px-2.5 rounded-xl transition-colors group active:scale-[0.99] ${t.revision ? 'bg-amber-500/[0.07] hover:bg-amber-500/12' : 'hover:bg-primary/5'}`}
      style={{ borderLeftWidth: 3, borderLeftColor: t.revision ? 'hsl(38 92% 50%)' : color }}>
      <span className="text-[10px] flex-1 truncate font-medium text-foreground group-hover:text-primary transition-colors">{t.revision ? t.topicName.replace(` · ${t.revision}`, '') : t.topicName}</span>
      {t.revision ? (
        <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-amber-500/18 text-amber-600 dark:text-amber-400 font-black shrink-0 flex items-center gap-0.5 border border-amber-500/25">
          <Repeat className="w-2 h-2" />{t.revision}
        </span>
      ) : (
        <span className="text-[7px] px-1 py-0.5 rounded bg-primary/8 text-primary font-bold shrink-0">Topic</span>
      )}
      {t.done && <CheckCircle2 className={`w-3 h-3 shrink-0 ${t.revision ? 'text-amber-500' : 'text-diff-easy'}`} aria-label="Done" />}
      {t.timeSpent > 0 && <span className={`text-[9px] font-mono font-bold shrink-0 ${t.revision ? 'text-amber-600 dark:text-amber-400' : 'text-secondary'}`}>{formatStudyTime(t.timeSpent)}</span>}
      {t.time && <span className="text-[8px] font-mono text-muted-foreground/50 shrink-0">{formatTime12h(t.time)}</span>}
    </button>
  );
});

const GroupedList = memo(function GroupedList({ rows, header, onOpen }: { rows: CalendarTopicInfo[]; header?: React.ReactNode; onOpen: (t: CalendarTopicInfo) => void }) {
  const groups = useMemo(() => {
    const map: Record<string, { subjectName: string; subjectColor: string; units: Record<string, { unitName: string; topics: CalendarTopicInfo[] }> }> = {};
    rows.forEach(t => {
      if (!map[t.subjectName]) map[t.subjectName] = { subjectName: t.subjectName, subjectColor: t.subjectColor, units: {} };
      if (!map[t.subjectName].units[t.unitName]) map[t.subjectName].units[t.unitName] = { unitName: t.unitName, topics: [] };
      map[t.subjectName].units[t.unitName].topics.push(t);
    });
    return Object.values(map);
  }, [rows]);
  return (
    <div>
      {header}
      {groups.map(subj => (
        <div key={subj.subjectName}>
          <div className="flex items-center gap-2 mb-1 px-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: subj.subjectColor }} />
            <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: subj.subjectColor }}>{subj.subjectName}</span>
          </div>
          {Object.values(subj.units).map(unit => (
            <div key={unit.unitName} className="ml-3 mb-1.5">
              <p className="text-[8px] text-muted-foreground/50 font-bold mb-0.5 uppercase tracking-wider">{unit.unitName}</p>
              {unit.topics.map((t, idx) => <TopicRow key={`${t.topicId}|${t.revision || ''}|${idx}`} t={t} color={subj.subjectColor} onOpen={onOpen} />)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});

/** A logged session. Tap it to reveal Edit / Duplicate / Delete — every change asks for confirmation. */
const SessionRow = memo(function SessionRow({ s, color, expanded, onToggle, onEdit, onDuplicate, onDelete }: {
  s: DaySession; color: string; expanded: boolean;
  onToggle: (id: string) => void; onEdit: (s: DaySession) => void; onDuplicate: (s: DaySession) => void; onDelete: (s: DaySession) => void;
}) {
  const act = activityLabel(s.description) || s.type || 'Other';
  const note = stripActivityTag(s.note || s.description);
  const showNote = note && note !== s.subjectName && note !== 'Other';
  return (
    <div className={`rounded-xl transition-colors ${expanded ? 'bg-card/50 ring-1 ring-primary/20' : 'hover:bg-card/40'}`} style={{ borderLeftWidth: 3, borderLeftColor: color }}>
      <button type="button" onClick={() => onToggle(s.id)} aria-expanded={expanded} aria-label={`${s.subjectName || 'Study'} session, ${formatStudyTime(s.durationMinutes)} — tap for actions`}
        className="w-full flex items-center gap-2 py-1.5 px-2.5 text-left active:scale-[0.99] transition-transform">
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-medium text-foreground block truncate">{s.subjectName || 'Study'}</span>
          {showNote && <span className="text-[8px] text-muted-foreground/60 block truncate">{note}</span>}
        </div>
        <span className="text-[7px] px-1 py-0.5 rounded bg-secondary/12 text-secondary font-bold shrink-0">{act}</span>
        <span className="text-[9px] font-mono font-bold text-secondary shrink-0">{formatStudyTime(s.durationMinutes)}</span>
        {s.startTime && <span className="text-[8px] font-mono text-muted-foreground/50 shrink-0">{formatTime12h(s.startTime)}</span>}
        <ChevronDown className={`w-3 h-3 text-muted-foreground/40 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="flex items-center gap-1.5 px-2.5 pb-2 animate-fade-in">
          <button type="button" onClick={() => onEdit(s)} className="flex-1 h-8 rounded-lg bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 transition"><Pencil className="w-3 h-3" /> Edit</button>
          <button type="button" onClick={() => onDuplicate(s)} className="flex-1 h-8 rounded-lg bg-muted/30 text-foreground/70 text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 transition"><Copy className="w-3 h-3" /> Duplicate</button>
          <button type="button" onClick={() => onDelete(s)} className="flex-1 h-8 rounded-lg bg-destructive/10 text-destructive text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 transition"><Trash2 className="w-3 h-3" /> Delete</button>
        </div>
      )}
    </div>
  );
});

/** Total = Topic + Revision + Session, with a proportional bar so each kind of study is visible at a glance. */
const Breakdown = memo(function Breakdown({ topicMins, revisionMins, sessionMins, total }: { topicMins: number; revisionMins: number; sessionMins: number; total: number }) {
  const parts = [
    { key: 'topic', label: 'Topic', icon: '📖', mins: topicMins, bar: 'bg-primary', ink: 'text-primary' },
    { key: 'rev', label: 'Revision', icon: '🔁', mins: revisionMins, bar: 'bg-amber-500', ink: 'text-amber-600 dark:text-amber-400' },
    { key: 'sess', label: 'Session', icon: '⏱', mins: sessionMins, bar: 'bg-secondary', ink: 'text-secondary' },
  ];
  return (
    <div className="rounded-xl bg-secondary/5 border border-secondary/10 mt-1 px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-muted-foreground">Total</span>
        <span className="text-[11px] font-black font-mono text-secondary">{formatStudyTime(total)}</span>
      </div>
      {total > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden bg-muted/30 mt-1.5 gap-px" role="img" aria-label="Topic, revision and session time">
          {parts.filter(x => x.mins > 0).map(x => <div key={x.key} className={x.bar} style={{ width: `${(x.mins / total) * 100}%` }} />)}
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5 mt-1.5">
        {parts.map(x => (
          <div key={x.key} className={`rounded-lg px-1.5 py-1 text-center ${x.mins > 0 ? 'bg-card/50' : 'bg-card/20 opacity-50'}`}>
            <p className="text-[8px] font-bold text-muted-foreground/70 whitespace-nowrap">{x.icon} {x.label}</p>
            <p className={`text-[10px] font-black font-mono ${x.ink}`}>{x.mins > 0 ? formatStudyTime(x.mins) : '—'}</p>
          </div>
        ))}
      </div>
    </div>
  );
});

/* ─────────────────────────── the section ─────────────────────────── */

export default function StudyTimeSection({ selectedDate, subjects, dailyLogs, dbSessions, topics, manualSessions, onOpenTopic, onEditSession, onDuplicateSession, onDeleteSession }: {
  selectedDate: string;
  subjects: Subject[];
  dailyLogs: DailyLog[];
  dbSessions?: DbStudySession[];
  topics: CalendarTopicInfo[];
  manualSessions: DaySession[];
  onOpenTopic: (t: CalendarTopicInfo) => void;
  onEditSession: (s: DaySession) => void;
  onDuplicateSession: (s: DaySession) => void;
  onDeleteSession: (s: DaySession) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [filterVal, setFilterVal] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ONE engine (lib/studySlices): topic + revision + unit entries and every session that is not the timer's mirror
  const data = useMemo(() => {
    const bd = getDayStudyBreakdown(subjects as any, selectedDate, (dbSessions || []) as any, dailyLogs as any);
    const day = getDayIndex(subjects as any, dailyLogs as any, dbSessions as any, true).get(selectedDate);
    const counted = new Set((day?.slices || []).filter(sl => sl.kind === 'session' && sl.sessionId).map(sl => sl.sessionId as string));
    const sessionOnly = manualSessions.filter(x => x.id && counted.has(x.id));
    const sessionMins = sessionOnly.reduce((a, x) => a + x.durationMinutes, 0);
    const mainRows = topics.filter(t => !t.revision);
    const revRows = topics.filter(t => t.revision);
    const rounds = (['R1', 'R2', 'R3', 'R4'] as RevisionKey[]).map(k => ({ k, rows: revRows.filter(t => t.revision === k) })).filter(r => r.rows.length > 0);
    const subjectMap: Record<string, { name: string; color: string; topicMins: number; sessionMins: number; topics: CalendarTopicInfo[]; sessions: DaySession[] }> = {};
    topics.forEach(t => {
      const key = t.subjectId || 'general';
      if (!subjectMap[key]) subjectMap[key] = { name: t.subjectName, color: t.subjectColor, topicMins: 0, sessionMins: 0, topics: [], sessions: [] };
      subjectMap[key].topicMins += t.timeSpent || 0;
      subjectMap[key].topics.push(t);
    });
    sessionOnly.forEach(x => {
      const key = x.subjectId || 'general';
      const sub = subjects.find(s => s.id === key);
      if (!subjectMap[key]) subjectMap[key] = { name: sub?.shortName || x.subjectName || 'Other', color: sub?.color || 'hsl(var(--foreground))', topicMins: 0, sessionMins: 0, topics: [], sessions: [] };
      subjectMap[key].sessionMins += x.durationMinutes;
      subjectMap[key].sessions.push(x);
    });
    const subjectGroups = Object.entries(subjectMap).sort((a, b) => (b[1].topicMins + b[1].sessionMins) - (a[1].topicMins + a[1].sessionMins));
    return { bd, sessionOnly, sessionMins, mainRows, revRows, rounds, subjectMap, subjectGroups };
  }, [subjects, dailyLogs, dbSessions, selectedDate, topics, manualSessions]);

  const { bd, sessionOnly, sessionMins, mainRows, revRows, rounds, subjectMap, subjectGroups } = data;
  const topicMins = bd.topicMins, revisionMins = bd.revisionMins, allMins = bd.totalMins;
  const roundSel = filter === 'revision' && filterVal ? filterVal as RevisionKey : null;
  const revisionShown = roundSel ? revRows.filter(t => t.revision === roundSel) : revRows;
  const rowsMins = (rows: CalendarTopicInfo[]) => rows.reduce((a, t) => a + (t.timeSpent || 0), 0);
  const activeTotal = filter === 'topics' ? topicMins
    : filter === 'revision' ? rowsMins(revisionShown)
    : filter === 'sessions' ? sessionMins
    : filter === 'subject' && filterVal ? (subjectMap[filterVal]?.topicMins || 0) + (subjectMap[filterVal]?.sessionMins || 0)
    : allMins;
  const hasRecords = topics.length > 0 || sessionOnly.length > 0;

  // tapping the active chip again clears the filter (back to All)
  const pick = (f: Filter, v = '') => {
    if (f !== 'all' && filter === f && filterVal === v) { setFilter('all'); setFilterVal(''); }
    else { setFilter(f); setFilterVal(v); }
  };
  const toggleSession = (id: string) => setExpandedId(cur => cur === id ? null : id);

  const renderSessions = (list: DaySession[], fallbackColor?: string) => list.map(x => (
    <SessionRow key={x.id} s={x} color={fallbackColor || x._color || 'hsl(var(--foreground))'} expanded={expandedId === x.id}
      onToggle={toggleSession} onEdit={onEditSession} onDuplicate={onDuplicateSession} onDelete={onDeleteSession} />
  ));

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
      className="rounded-2xl overflow-hidden border border-border/20 shadow-lg">
      <div className="relative px-3.5 py-2.5 bg-gradient-to-r from-primary/12 via-secondary/8 to-accent/6 border-b border-border/10">
        <div className="relative flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
            <BookOpen className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-[11px] font-bold text-foreground uppercase tracking-wide flex-1">Study Time</span>
          <span className="text-[10px] font-mono font-bold text-secondary bg-secondary/10 px-2 py-0.5 rounded-lg">{formatStudyTime(activeTotal)}</span>
        </div>
      </div>

      {/* Filter chips wrap — never scroll sideways */}
      <div className="px-3 pt-2 pb-1.5 flex gap-1 flex-wrap border-b border-border/5">
        <FilterPill active={filter === 'all'} onClick={() => pick('all')} label="All" count={topics.length + sessionOnly.length} />
        <FilterPill active={filter === 'topics'} onClick={() => pick('topics')} label="📖 Topic" count={mainRows.length} />
        {revRows.length > 0 && <FilterPill active={filter === 'revision' && !filterVal} onClick={() => pick('revision')} label="🔁 Revision" count={revRows.length} tone="amber" />}
        {rounds.map(r => <FilterPill key={r.k} active={filter === 'revision' && filterVal === r.k} onClick={() => pick('revision', r.k)} label={r.k} count={r.rows.length} tone="amber" />)}
        <FilterPill active={filter === 'sessions'} onClick={() => pick('sessions')} label="⏱ Session" count={sessionOnly.length} />
        {subjectGroups.length > 1 && subjectGroups.map(([id, g]) => (
          <FilterPill key={id} active={filter === 'subject' && filterVal === id} onClick={() => pick('subject', id)} label={g.name} color={g.color} count={g.topics.length + g.sessions.length} />
        ))}
      </div>

      <div className="bg-card/20">
        {hasRecords ? (
          <div className="p-2.5 space-y-1.5 max-h-[420px] overflow-y-auto">
            {filter === 'all' && topics.length > 0 && (
              <GroupedList rows={topics} onOpen={onOpenTopic}
                header={<p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-1 px-1 flex items-center gap-1"><BookOpen className="w-3 h-3" /> Topic &amp; Revision Time</p>} />
            )}
            {filter === 'topics' && mainRows.length > 0 && (
              <div>
                <GroupedList rows={mainRows} onOpen={onOpenTopic} />
                <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-primary/5 border border-primary/10 mt-1">
                  <span className="text-[10px] font-bold text-muted-foreground">Topic Total</span>
                  <span className="text-[10px] font-black font-mono text-primary">{formatStudyTime(topicMins)}</span>
                </div>
              </div>
            )}
            {filter === 'revision' && (
              <div>
                {revisionShown.length > 0 ? <GroupedList rows={revisionShown} onOpen={onOpenTopic} /> : <p className="text-[10px] text-muted-foreground/50 text-center py-3">No {roundSel || 'revision'} on this day</p>}
                <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-amber-500/8 border border-amber-500/20 mt-1">
                  <span className="text-[10px] font-bold text-muted-foreground">{roundSel ? `${roundSel} Total` : 'Revision Total'}</span>
                  <span className="text-[10px] font-black font-mono text-amber-600 dark:text-amber-400">{formatStudyTime(rowsMins(revisionShown))}</span>
                </div>
              </div>
            )}

            {filter === 'all' && topics.length > 0 && sessionOnly.length > 0 && <div className="h-px bg-border/15 my-1" />}

            {(filter === 'all' || filter === 'sessions') && sessionOnly.length > 0 && (
              <div>
                <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-1 px-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Session Time <span className="normal-case tracking-normal font-semibold opacity-70">· tap a session to edit or delete</span>
                </p>
                {renderSessions(sessionOnly)}
                {filter === 'sessions' && (
                  <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-secondary/5 border border-secondary/10 mt-1">
                    <span className="text-[10px] font-bold text-muted-foreground">Session Total</span>
                    <span className="text-[10px] font-black font-mono text-secondary">{formatStudyTime(sessionMins)}</span>
                  </div>
                )}
              </div>
            )}

            {filter === 'subject' && filterVal && subjectMap[filterVal] && (() => {
              const g = subjectMap[filterVal];
              return (
                <div>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                    <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: readableInk(g.color) }}>{g.name}</span>
                  </div>
                  {g.topics.map((t, idx) => <TopicRow key={`${t.topicId}|${t.revision || ''}|${idx}`} t={t} color={g.color} onOpen={onOpenTopic} />)}
                  {renderSessions(g.sessions, g.color)}
                  <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-secondary/5 border border-secondary/10 mt-1">
                    <span className="text-[10px] font-bold text-muted-foreground">{g.name} Total</span>
                    <span className="text-[10px] font-black font-mono text-secondary">{formatStudyTime(g.topicMins + g.sessionMins)}</span>
                  </div>
                </div>
              );
            })()}

            {filter === 'all' && <Breakdown topicMins={topicMins} revisionMins={revisionMins} sessionMins={sessionMins} total={allMins} />}
          </div>
        ) : (
          <div className="py-6 text-center">
            <BookOpen className="w-6 h-6 text-muted-foreground/15 mx-auto mb-2" />
            <p className="text-[11px] text-muted-foreground/50">No study time recorded</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
