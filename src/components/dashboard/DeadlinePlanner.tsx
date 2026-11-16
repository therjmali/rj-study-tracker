import { memo, useMemo, useState } from 'react';
import { ChevronDown, Check, RotateCcw, CalendarClock } from 'lucide-react';
import type { Subject, SubTopic } from '../../types';
import { getLocalDateStr, formatStudyTime } from '../../lib/utils';
import { buildPlans, suggestToday, STATUS_LABEL, type PlanStatus, type SubjectPlan, type PlanTask } from '../../lib/planner';
import { useStreakRules } from '../../lib/streakRules';

const OPEN_KEY = 'rj-planner-open-v1';
const TONE: Record<PlanStatus, string> = {
  done: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25',
  'on-track': 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25',
  behind: 'text-amber-600 bg-amber-500/10 border-amber-500/30',
  critical: 'text-rose-600 bg-rose-500/10 border-rose-500/30',
  'no-deadline': 'text-muted-foreground bg-muted/20 border-border/20',
  past: 'text-muted-foreground bg-muted/20 border-border/20',
};
const per = (n: number) => (n >= 10 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString());
const shortDate = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function PlanRow({ p }: { p: SubjectPlan }) {
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border/12 bg-card/50 p-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: p.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-extrabold text-foreground">{p.shortName}</span>
            {p.daysLeft != null && p.daysLeft > 0 && <span className="text-[10px] font-bold text-muted-foreground">{p.daysLeft}d left</span>}
            <span className={`inline-flex items-center h-5 px-2 rounded-full border text-[9px] font-black uppercase tracking-wider ${TONE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted/30 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.shortName} ${pct}% done`}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[15px] font-black font-mono leading-none text-foreground">{p.done}<span className="text-[10px] font-semibold text-muted-foreground">/{p.total}</span></p>
          <p className="mt-0.5 text-[9px] font-bold text-muted-foreground">Readiness {p.readiness.score}%</p>
        </div>
      </div>
      {p.status !== 'done' && p.status !== 'no-deadline' && p.status !== 'past' && (
        <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
          Needs <b className="text-foreground">{per(p.requiredPerDay)}</b> topics/day · you do <b className="text-foreground">{per(p.pace)}</b>/day
          {p.projectedFinish && p.examDate && (p.projectedFinish > p.examDate
            ? <> · at this pace you finish <b className="text-rose-600">{shortDate(p.projectedFinish)}</b>, {Math.max(1, Math.round((new Date(p.projectedFinish).getTime() - new Date(p.examDate).getTime()) / 86400000))}d after the exam</>
            : <> · on pace to finish {shortDate(p.projectedFinish)}</>)}
          {!p.projectedFinish && <> · no topics finished in the last 2 weeks</>}
        </p>
      )}
    </div>
  );
}

function TaskRow({ t, onDone, onOpen }: { t: PlanTask; onDone: () => void; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border/10 bg-background/50">
      <button type="button" onClick={onDone} disabled={t.kind === 'revise'} aria-label={t.kind === 'new' ? `Mark “${t.name}” done` : 'Open to revise'}
        className={`w-11 h-11 shrink-0 flex items-center justify-center rounded-l-xl ${t.kind === 'new' ? 'active:scale-90 transition' : 'opacity-60'}`}>
        <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${t.kind === 'new' ? 'border-primary/50' : 'border-secondary/50'}`}>
          {t.kind === 'revise' ? <RotateCcw className="w-3 h-3 text-secondary" /> : <Check className="w-3 h-3 text-transparent" />}
        </span>
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-2 pr-2 text-left">
        <span className="block text-[12px] font-semibold text-foreground leading-snug line-clamp-2">{t.name}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[9.5px] font-bold text-muted-foreground">
          <span className="px-1.5 rounded-md" style={{ background: `${t.color}22`, color: t.color }}>{t.subjectShort}</span>
          {t.important && <span>⭐ Important</span>}
          {t.kind === 'revise' && t.round && <span className="text-secondary">🔁 {t.round}</span>}
          <span>{t.reason}</span>
        </span>
      </button>
    </div>
  );
}

interface Props {
  subjects: Subject[];
  onToggleTopic?: (subjectId: string, unitId: string, topicId: string) => void;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string) => void;
}

/** Home card: how far behind or ahead each exam deadline is, and exactly what to study today. */
function DeadlinePlannerInner({ subjects, onToggleTopic, onOpenTopicDetail }: Props) {
  const today = getLocalDateStr();
  const { restDays } = useStreakRules();
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; } });
  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem(OPEN_KEY, n ? '1' : '0'); } catch { /* ignore */ } return n; });

  const plans = useMemo(() => buildPlans(subjects, today, { restDays }), [subjects, today, restDays]);
  const withDeadline = plans.filter(p => p.examDate && p.status !== 'past');
  const tasks = useMemo(() => suggestToday(subjects, plans, today), [subjects, plans, today]);
  const news = tasks.filter(t => t.kind === 'new');
  const revs = tasks.filter(t => t.kind === 'revise');
  const worst = withDeadline.find(p => p.status === 'critical') || withDeadline.find(p => p.status === 'behind');
  const restToday = restDays.includes(new Date().getDay());

  const find = (t: PlanTask): { topic: SubTopic } | null => {
    const s = subjects.find(x => x.id === t.subjectId); const u = s?.units.find(x => x.id === t.unitId);
    const topic = u?.subTopics.find(x => x.id === t.topicId);
    return topic ? { topic } : null;
  };
  const openTask = (t: PlanTask) => { const f = find(t); if (f) onOpenTopicDetail?.(f.topic, t.subjectId, t.unitId); };

  return (
    <section className="rounded-2xl border border-border/15 bg-card/60 overflow-hidden" aria-label="Deadline planner">
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full flex items-center gap-3 p-3 text-left min-h-[56px] active:bg-card/40">
        <span className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"><CalendarClock className="w-[18px] h-[18px] text-primary" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-extrabold text-foreground leading-tight">Deadline planner</span>
          <span className="block text-[10.5px] text-muted-foreground leading-snug">
            {withDeadline.length === 0 ? 'Add exam dates to your subjects to get a daily plan'
              : worst ? `${worst.shortName} needs ${per(worst.requiredPerDay)} topics/day — ${STATUS_LABEL[worst.status].toLowerCase()}`
              : 'Every deadline is on track'}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-2.5 pb-3 space-y-3">
          {withDeadline.length > 0 && <div className="space-y-1.5">{withDeadline.map(p => <PlanRow key={p.subjectId} p={p} />)}</div>}
          {withDeadline.length === 0 && plans.some(p => p.remaining > 0) && (
            <p className="rounded-xl bg-muted/15 border border-border/10 px-3 py-2.5 text-[11px] text-muted-foreground">
              Set an <b className="text-foreground">exam date</b> on a subject (Syllabus → subject → edit) and the planner will work out how many topics you need each day.
            </p>
          )}
          {(news.length > 0 || revs.length > 0) && (
            <div>
              <div className="flex items-baseline justify-between px-0.5 mb-1.5">
                <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Today’s plan</h4>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {news.length} new{revs.length ? ` + ${revs.length} revision${revs.length > 1 ? 's' : ''}` : ''}{news.length ? ` · ≈ ${formatStudyTime(news.length * 35 + revs.length * 15)}` : ''}
                </span>
              </div>
              {restToday && <p className="mb-1.5 px-0.5 text-[10px] font-semibold text-secondary">🌿 Today is a rest day — your streak is safe; this is optional.</p>}
              <div className="space-y-1.5">
                {news.map(t => <TaskRow key={t.topicId} t={t} onDone={() => { navigator.vibrate?.(10); onToggleTopic?.(t.subjectId, t.unitId, t.topicId); }} onOpen={() => openTask(t)} />)}
                {revs.map(t => <TaskRow key={'r' + t.topicId} t={t} onDone={() => openTask(t)} onOpen={() => openTask(t)} />)}
              </div>
              <p className="mt-1.5 px-0.5 text-[9.5px] text-muted-foreground/80">Plan = the topics you need per day to finish before each exam (Important and Hard first), plus revisions that are due. Finish one and the next appears.</p>
            </div>
          )}
          {tasks.length === 0 && withDeadline.length > 0 && (
            <p className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-3 py-2.5 text-[11px] text-emerald-700 font-semibold">🎉 Nothing left to schedule — keep revising to lock it in.</p>
          )}
        </div>
      )}
    </section>
  );
}

export default memo(DeadlinePlannerInner);
