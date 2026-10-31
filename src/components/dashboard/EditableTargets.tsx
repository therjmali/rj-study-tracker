import { useState, useMemo } from 'react';
import { Pencil, Check, Clock, BookOpen, TrendingUp } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import type { Subject, DailyLog, StudyGoals, DbStudySession } from '../../types';
import { getLocalDateStr, getCurrentWeekStart, getCurrentMonthStart, formatStudyHours, getEffectiveStudyMinutes } from '../../lib/utils';
import { useToday } from '../../hooks/useToday';

interface Props {
  studyGoals: StudyGoals;
  subjects: Subject[];
  dailyLogs: DailyLog[];
  onUpdateGoals: (goals: StudyGoals) => void;
  dbSessions?: DbStudySession[];
}

export default function EditableTargets({ studyGoals, subjects, dailyLogs, onUpdateGoals, dbSessions }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(studyGoals);

  const today = useToday();
  const todayHours = useMemo(() => getEffectiveStudyMinutes(subjects, dailyLogs, today, today, dbSessions) / 60, [subjects, dailyLogs, today, dbSessions]);

  // Calculate topic counts using CURRENT calendar week & month (not last 7/30 days)
  const { todayTopics, weekTopics, monthTopics, weekHours, monthHours, weekLabel, monthLabel } = useMemo(() => {
    const weekStart = getCurrentWeekStart(); // Monday of this week
    const monthStart = getCurrentMonthStart(); // 1st of this month

    let todayT = 0, weekT = 0, monthT = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (!t.completed || !t.completedDate) return;
      if (t.completedDate === today) todayT++;
      if (t.completedDate >= weekStart && t.completedDate <= today) weekT++;
      if (t.completedDate >= monthStart && t.completedDate <= today) monthT++;
    })));

    // Get readable month name
    const now = new Date();
    const mName = now.toLocaleString('en-US', { month: 'short' });
    const weekDay = now.toLocaleString('en-US', { weekday: 'short' });

    return {
      todayTopics: todayT,
      weekTopics: weekT,
      monthTopics: monthT,
      weekHours: Math.round(getEffectiveStudyMinutes(subjects, dailyLogs, weekStart, today, dbSessions) / 60 * 10) / 10,
      monthHours: Math.round(getEffectiveStudyMinutes(subjects, dailyLogs, monthStart, today, dbSessions) / 60 * 10) / 10,
      weekLabel: `This Week (Mon–${weekDay})`,
      monthLabel: `${mName} ${now.getFullYear()}`,
    };
  }, [subjects, dailyLogs, today, dbSessions]);

  const save = () => { onUpdateGoals(draft); setEditing(false); };

  const sections: { title: string; subtitle?: string; gradient: string; rows: { icon: React.ReactNode; label: string; current: number; key: keyof StudyGoals; unit: string; step: number }[] }[] = [
    {
      title: '📅 Daily', gradient: 'from-primary/10 to-transparent',
      rows: [
        { icon: <Clock className="w-3 h-3 text-primary" />, label: 'Hours', current: todayHours, key: 'dailyHours', unit: 'h', step: 0.5 },
        { icon: <BookOpen className="w-3 h-3 text-secondary" />, label: 'Topics', current: todayTopics, key: 'dailyTopics', unit: '', step: 1 },
      ],
    },
    {
      title: '📆 Weekly', subtitle: weekLabel, gradient: 'from-accent/10 to-transparent',
      rows: [
        { icon: <Clock className="w-3 h-3 text-accent" />, label: 'Hours', current: weekHours, key: 'weeklyHours', unit: 'h', step: 1 },
        { icon: <BookOpen className="w-3 h-3 text-secondary" />, label: 'Topics', current: weekTopics, key: 'weeklyTopics', unit: '', step: 5 },
      ],
    },
    {
      title: `🗓️ Monthly`, subtitle: monthLabel, gradient: 'from-destructive/10 to-transparent',
      rows: [
        { icon: <Clock className="w-3 h-3 text-destructive" />, label: 'Hours', current: monthHours, key: 'monthlyHours', unit: 'h', step: 5 },
        { icon: <BookOpen className="w-3 h-3 text-secondary" />, label: 'Topics', current: monthTopics, key: 'monthlyTopics', unit: '', step: 10 },
      ],
    },
  ];

  return (
    <div className="glass-card p-4 space-y-3 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-40 h-40 rounded-full bg-secondary/5 blur-3xl -ml-16 -mt-16 pointer-events-none" />
      <div className="flex items-center justify-between relative z-10">
        <h3 className="text-sm font-bold text-foreground">🎯 Study Targets</h3>
        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => editing ? save() : (setDraft(studyGoals), setEditing(true))}>
          {editing ? <Check className="w-4 h-4 text-secondary" /> : <Pencil className="w-3.5 h-3.5 text-muted-foreground" />}
        </Button>
      </div>

      {sections.map(section => (
        <div key={section.title} className="relative z-10">
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground">{section.title}</p>
            {section.subtitle && (
              <span className="text-[9px] text-muted-foreground/60 font-mono">({section.subtitle})</span>
            )}
          </div>
          <div className={`grid grid-cols-2 gap-2 p-2 rounded-xl bg-gradient-to-r ${section.gradient}`}>
            {section.rows.map(r => {
              const target = editing ? (draft[r.key] ?? 0) : (studyGoals[r.key] ?? 0);
              const pct = target > 0 ? Math.min(100, Math.round((r.current / target) * 100)) : 0;
              return (
                <TargetCell key={r.key} icon={r.icon} label={r.label} current={r.current} target={target}
                  pct={pct} unit={r.unit} editing={editing}
                  onChange={v => setDraft({ ...draft, [r.key]: v })} step={r.step} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TargetCell({ icon, label, current, target, pct, unit, editing, onChange, step }: {
  icon: React.ReactNode; label: string; current: number; target: number; pct: number; unit: string;
  editing: boolean; onChange: (v: number) => void; step: number;
}) {
  const barColor = pct >= 100 ? 'bg-secondary' : pct >= 50 ? 'bg-primary' : 'bg-accent';
  return (
    <div className="rounded-lg bg-card/50 border border-border/15 p-2 space-y-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] text-muted-foreground flex-1">{label}</span>
        {editing ? (
          <Input type="number" min={step} step={step} value={target} className="w-14 h-5 text-[10px] text-right p-1"
            onChange={e => onChange(Math.max(step, parseFloat(e.target.value) || step))} />
        ) : (
          <span className="text-[10px] font-mono text-foreground font-semibold">
            {unit === 'h' ? formatStudyHours(current) : current}/{unit === 'h' ? formatStudyHours(target) : `${target}${unit}`}
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-[8px] text-right font-bold ${pct >= 100 ? 'text-secondary' : 'text-muted-foreground'}`}>
        {pct >= 100 ? '✅ ' : ''}{pct}%
      </p>
    </div>
  );
}
