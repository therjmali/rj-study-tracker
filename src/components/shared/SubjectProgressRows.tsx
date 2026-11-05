import { useState, useMemo } from 'react';
import { readableInk } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, ChevronUp, Star, Target, Clock } from 'lucide-react';
import SubjectLink from './SubjectLink';
import { getUnitProgress, unitStatusEmoji, unitMatchesFilter } from '../../lib/unitProgress';

type UnitFilter = 'all' | 'complete' | 'partial' | 'incomplete';

const UNIT_FILTERS: { id: UnitFilter; emoji: string; label: string }[] = [
  { id: 'all', emoji: '📋', label: 'All' },
  { id: 'complete', emoji: '✅', label: 'Done' },
  { id: 'partial', emoji: '🔄', label: 'Partial' },
  { id: 'incomplete', emoji: '❌', label: 'None' },
];

export function getTier(pct: number) {
  if (pct >= 90) return { label: 'Platinum', emoji: '🏆', color: 'hsl(var(--chart-4))' };
  if (pct >= 70) return { label: 'Gold', emoji: '🥇', color: 'hsl(var(--secondary))' };
  if (pct >= 50) return { label: 'Silver', emoji: '🥈', color: 'hsl(var(--primary))' };
  return { label: 'Bronze', emoji: '🥉', color: 'hsl(var(--destructive))' };
}

export interface UnitStat {
  id: string; name: string; total: number; done: number; serial?: number;
}

export interface SubjectRowData {
  id: string; shortName: string; color: string;
  total: number; done: number; pct: number;
  imp: number; impDone: number;
  tier: ReturnType<typeof getTier>;
  unitStats: UnitStat[];
  studyTimeMins?: number; // unified study time including session manager
}

export interface MiscSessionRow {
  label: string;
  mins: number;
  color: string;
}

function formatTimeMins(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function SubjectProgressRows({ subjectStats, expandedId, setExpandedId, onNavigate, onMoveSubject, totalSubjects, miscRows }: {
  subjectStats: SubjectRowData[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  onNavigate: (tab: string, filter?: Record<string, string>) => void;
  onMoveSubject?: (subjectId: string, direction: 'up' | 'down') => void;
  totalSubjects: number;
  miscRows?: MiscSessionRow[];
}) {
  const showTime = subjectStats.some(s => (s.studyTimeMins ?? 0) > 0) || (miscRows && miscRows.some(r => r.mins > 0));
  return (
    <div className="space-y-1">
      <p className="text-[9px] text-muted-foreground font-semibold flex items-center gap-1 mb-0.5">
        📋 <span className="font-bold">Subject Progress</span>
        <span className="ml-auto text-[8px] text-muted-foreground/60 font-mono">Topics</span>
        {showTime && <span className="w-14 text-right text-[8px] text-muted-foreground/60 font-mono">Time</span>}
        <span className="w-16 text-right text-[8px] text-muted-foreground/60 font-mono">Progress</span>
      </p>
      {subjectStats.map((s, idx) => (
        <SubjectRow
          key={s.id}
          subject={s}
          idx={idx}
          isExpanded={expandedId === s.id}
          onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
          onNavigate={onNavigate}
          onMoveSubject={onMoveSubject}
          isFirst={idx === 0}
          isLast={idx === subjectStats.length - 1}
          totalSubjects={totalSubjects}
          showTime={showTime}
        />
      ))}
      {/* Miscellaneous row for unmapped session time */}
      {miscRows && miscRows.filter(r => r.mins > 0).map((r, i) => (
        <div key={`misc-${i}`} className="rounded-xl border border-border/10 bg-card/20 overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2">
            <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: r.color }} />
            <div className="w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center shrink-0 text-[9px] font-black font-mono text-muted-foreground" style={{ borderColor: r.color }}>
              <Clock className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-bold text-muted-foreground">{r.label}</span>
              <p className="text-[8px] text-muted-foreground/60">Sessions not mapped to any subject</p>
            </div>
            {showTime && (
              <span className="text-[9px] font-mono font-bold w-14 text-right" style={{ color: readableInk(r.color) }}>
                {formatTimeMins(r.mins)}
              </span>
            )}
            <span className="text-[8px] w-16 text-right text-muted-foreground/50 font-mono">—</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SubjectRow({ subject: s, idx, isExpanded, onToggle, onNavigate, onMoveSubject, isFirst, isLast, totalSubjects, showTime }: {
  subject: SubjectRowData;
  idx: number;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: (tab: string, filter?: Record<string, string>) => void;
  onMoveSubject?: (subjectId: string, direction: 'up' | 'down') => void;
  isFirst: boolean;
  isLast: boolean;
  totalSubjects: number;
  showTime?: boolean;
}) {
  const [unitFilter, setUnitFilter] = useState<UnitFilter>('all');

  const filteredUnits = useMemo(() => {
    if (unitFilter === 'all') return s.unitStats;
    return s.unitStats.filter(u => {
      const progress = getUnitProgress(u.done, u.total);
      return unitMatchesFilter(progress, unitFilter);
    });
  }, [s.unitStats, unitFilter]);

  return (
    <div className="rounded-xl border border-border/10 bg-card/20 overflow-hidden">
      <div className="flex items-stretch">
        {/* Rank controls */}
        {onMoveSubject && totalSubjects > 1 && (
          <div className="flex flex-col items-center justify-center gap-0 px-1 border-r border-border/10 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onMoveSubject(s.id, 'up'); }} disabled={isFirst}
              className={`p-0.5 rounded-md transition-all ${isFirst ? 'text-muted-foreground/20 cursor-not-allowed' : 'text-muted-foreground hover:text-primary hover:bg-primary/10 active:scale-90'}`}>
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <span className="text-[8px] font-black font-mono text-muted-foreground/50 leading-none">{idx + 1}</span>
            <button onClick={(e) => { e.stopPropagation(); onMoveSubject(s.id, 'down'); }} disabled={isLast}
              className={`p-0.5 rounded-md transition-all ${isLast ? 'text-muted-foreground/20 cursor-not-allowed' : 'text-muted-foreground hover:text-primary hover:bg-primary/10 active:scale-90'}`}>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <button onClick={onToggle}
          className="flex-1 flex items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/5 transition-colors active:scale-[0.995]">
          {/* Color bar */}
          <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: s.color }} />

          {/* Percentage circle */}
          <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 text-[9px] font-black font-mono"
            style={{ borderColor: s.color, color: s.pct >= 70 ? readableInk(s.color) : undefined }}>
            {s.pct}%
          </div>

          {/* Name + progress bar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <SubjectLink shortName={s.shortName} color={s.color} subjectId={s.id} onNavigate={onNavigate} variant="text" />
              {s.imp > 0 && (
                <span className="flex items-center gap-0.5 text-[7px] font-bold text-chart-4">
                  <Star className="w-2.5 h-2.5 fill-chart-4 text-chart-4" />{s.impDone}/{s.imp}
                </span>
              )}
            </div>
            <div className="h-1.5 rounded-full bg-muted/25 overflow-hidden mt-1">
              <motion.div className="h-full rounded-full" style={{ backgroundColor: s.color }}
                initial={{ width: 0 }} animate={{ width: `${s.pct}%` }} transition={{ duration: 0.6 }} />
            </div>
          </div>

          {/* Stats — no duplicate pct since it's in circle */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] font-mono text-muted-foreground w-10 text-right">{s.done}/{s.total}</span>
            {showTime && (
              <span className="text-[9px] font-mono font-bold w-14 text-right" style={{ color: (s.studyTimeMins ?? 0) > 0 ? readableInk(s.color) : undefined }}>
                {(s.studyTimeMins ?? 0) > 0 ? formatTimeMins(s.studyTimeMins!) : '0m'}
              </span>
            )}
            <span className="text-[8px] w-16 text-right truncate font-semibold text-muted-foreground">
              {s.tier.emoji} {s.tier.label}
            </span>
            {isExpanded
              ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
              : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          </div>
        </button>
      </div>

      {/* Expanded units */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-3 pb-2.5 pt-1.5 ml-5 space-y-1.5 border-t border-border/10">
              {/* Unit filter pills */}
              <div className="flex gap-1 mb-1">
                {UNIT_FILTERS.map(f => {
                  const active = unitFilter === f.id;
                  return (
                    <button key={f.id} onClick={(e) => { e.stopPropagation(); setUnitFilter(f.id); }}
                      className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[8px] font-bold transition-all active:scale-95 ${
                        active
                          ? 'bg-primary/15 text-primary border border-primary/30'
                          : 'bg-muted/10 text-muted-foreground border border-border/10 hover:bg-muted/20'
                      }`}>
                      <span className="text-[9px]">{f.emoji}</span>
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {/* Units list */}
              {filteredUnits.length === 0 ? (
                <p className="text-[9px] text-muted-foreground/50 py-2 text-center">No units match this filter</p>
              ) : (
                filteredUnits.map((u, i) => {
                  const unitProg = getUnitProgress(u.done, u.total);
                  const uPct = unitProg.percentage;
                  const statusEmoji = unitStatusEmoji(unitProg.status);
                  return (
                    <button key={u.id} onClick={() => onNavigate('syllabus', { subjectId: s.id, unitId: u.id })}
                      className="w-full flex items-center gap-2 rounded-lg p-1 -m-1 hover:bg-card/40 transition-all active:scale-[0.98] group/unit cursor-pointer">
                      <span className="text-[9px] font-mono text-muted-foreground/50 w-4 text-right shrink-0">{u.serial ?? i + 1}</span>
                      <span className="text-[8px] shrink-0">{statusEmoji}</span>
                      <span className="text-[10px] text-muted-foreground flex-1 truncate text-left group-hover/unit:text-foreground transition-colors">{u.name}</span>
                      <div className="w-16 h-1.5 rounded-full bg-muted/20 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${uPct}%`, backgroundColor: s.color, opacity: 0.7 }} />
                      </div>
                      <span className="text-[9px] font-mono text-muted-foreground w-12 text-right">{u.done}/{u.total}</span>
                      <ChevronRight className="w-3 h-3 text-muted-foreground/0 group-hover/unit:text-muted-foreground transition-all shrink-0" />
                    </button>
                  );
                })
              )}
              <button onClick={() => onNavigate('syllabus', { subjectId: s.id })}
                className="text-[9px] font-bold text-primary hover:underline mt-1 flex items-center gap-0.5">
                Open in Syllabus <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FocusSuggestion({ weakest, onNavigate }: {
  weakest: { id: string; shortName: string; pct: number }[];
  onNavigate: (tab: string, filter?: Record<string, string>) => void;
}) {
  if (weakest.length === 0) return null;
  const names = weakest.map(s => s.shortName).join(', ');
  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-primary/[0.06] border border-primary/10">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Target className="w-4 h-4 text-primary" />
      </div>
      <p className="text-[10px] text-muted-foreground flex-1 leading-snug">
        Focus more on <span className="font-bold text-foreground">{names}</span> to improve your readiness!
      </p>
      <button
        onClick={() => onNavigate('syllabus', weakest[0] ? { subjectId: weakest[0].id } : undefined)}
        className="text-[9px] font-bold text-primary-foreground bg-primary px-3 py-1.5 rounded-lg hover:opacity-90 active:scale-95 transition-all shrink-0"
      >
        Study Now
      </button>
    </div>
  );
}

export function ReadinessHero({ pct, tier }: { pct: number; tier: ReturnType<typeof getTier> }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-[76px] h-[76px] shrink-0">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="5.5" opacity="0.25" />
          <motion.circle
            cx="40" cy="40" r={r} fill="none"
            stroke={tier.color} strokeWidth="5.5" strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ * (1 - pct / 100) }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ filter: pct >= 70 ? `drop-shadow(0 0 6px ${tier.color})` : 'none' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-black font-mono text-foreground leading-none">{pct}%</span>
          <span className="text-[7px] text-muted-foreground font-bold mt-0.5">syllabus</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-sm font-black mb-1 ${
          pct >= 90 ? 'bg-chart-4/15 border-chart-4/30 text-chart-4' :
          pct >= 70 ? 'bg-secondary/15 border-secondary/30 text-secondary' :
          pct >= 50 ? 'bg-primary/15 border-primary/30 text-primary' :
          'bg-destructive/10 border-destructive/20 text-destructive'
        }`}>
          <span className="text-sm">{tier.emoji}</span>
          {tier.label}
        </div>
        <p className="text-[10px] text-muted-foreground leading-snug">
          {pct >= 90 ? '🔥 Outstanding! Almost exam-ready' :
           pct >= 70 ? '💪 Great progress, keep pushing!' :
           pct >= 50 ? '📈 Good start, more to cover' :
           '🚀 Early stage — stay consistent!'}
        </p>
      </div>
    </div>
  );
}

export function TopicDistributionBar({ subjects, grandTotal }: {
  subjects: { id: string; shortName: string; color: string; allTopics: number }[];
  grandTotal: number;
}) {
  return (
    <div>
      <p className="text-[9px] text-muted-foreground font-semibold mb-1.5 flex items-center gap-1">
        📊 <span className="font-bold">Topic Distribution</span>
      </p>
      <div className="h-2.5 rounded-full overflow-hidden flex bg-muted/20">
        {subjects.map(s => {
          const w = grandTotal > 0 ? (s.allTopics / grandTotal) * 100 : 0;
          if (w < 1) return null;
          return (
            <motion.div key={s.id}
              className="h-full first:rounded-l-full last:rounded-r-full cursor-pointer hover:opacity-80 transition-opacity"
              style={{ backgroundColor: s.color, width: `${w}%` }}
              initial={{ width: 0 }} animate={{ width: `${w}%` }}
              transition={{ duration: 0.6 }}
              title={`${s.shortName}: ${s.allTopics} topics (${Math.round(w)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
        {subjects.map(s => (
          <div key={s.id} className="flex items-center gap-1 text-[8px]">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.shortName}</span>
            <span className="font-mono text-foreground font-bold">{s.allTopics}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
