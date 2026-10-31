import { useState, useMemo, useEffect } from 'react';
import { Pencil, Check, Flame, Clock, BookOpen, GraduationCap, Target, Settings2 } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@project/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import type { Subject, DailyLog, StudyGoals, ExamConfig, DbStudySession } from '../../types';
import { getCurrentWeekStart, getCurrentMonthStart, formatStudyHours, getLocalDateStr, getEffectiveStudyMinutes } from '../../lib/utils';
import { useToday } from '../../hooks/useToday';
import { useStreak } from '../../hooks/useStreak';

interface Props {
  studyGoals: StudyGoals;
  subjects: Subject[];
  dailyLogs: DailyLog[];
  exams?: ExamConfig[];
  onUpdateGoals: (goals: StudyGoals) => void;
  dbSessions?: DbStudySession[];
}

function GoalRow({ label, current, target, color, isHours }: {
  label: string; current: number; target: number; color: string; isHours?: boolean;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const cur = isHours ? formatStudyHours(current) : String(current);
  const tgt = isHours ? formatStudyHours(target) : String(target);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
        <span className="text-[11px] font-bold text-foreground font-mono">
          {cur}<span className="text-muted-foreground">/{tgt}</span>
          <span className={`ml-1.5 text-[10px] ${pct >= 100 ? 'text-secondary' : 'text-primary'}`}>{pct}%</span>
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${pct >= 100 ? 'bg-secondary' : `bg-${color}`}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function GoalSection({ emoji, title, items }: {
  emoji: string; title: string;
  items: { label: string; current: number; target: number; color: string; isHours?: boolean }[];
}) {
  return (
    <div className="rounded-xl border border-border/15 bg-card/30 p-3 space-y-2.5">
      <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
        <span>{emoji}</span> {title}
      </p>
      {items.map(item => <GoalRow key={item.label} {...item} />)}
    </div>
  );
}

export default function TargetsTicker({ studyGoals, subjects, dailyLogs, exams, onUpdateGoals, dbSessions }: Props) {
  const [draft, setDraft] = useState(studyGoals);
  const [editOpen, setEditOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const today = useToday();
  const todayHours = useMemo(() => getEffectiveStudyMinutes(subjects, dailyLogs, today, today, dbSessions) / 60, [subjects, dailyLogs, today, dbSessions]);

  const stats = useMemo(() => {
    const weekStart = getCurrentWeekStart();
    const monthStart = getCurrentMonthStart();
    let todayT = 0, weekT = 0, monthT = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (!t.completed || !t.completedDate) return;
      if (t.completedDate === today) todayT++;
      if (t.completedDate >= weekStart && t.completedDate <= today) weekT++;
      if (t.completedDate >= monthStart && t.completedDate <= today) monthT++;
    })));
    return { todayT, weekT, monthT };
  }, [subjects, dailyLogs, today]);

  const periodHours = useMemo(() => {
    const weekStart = getCurrentWeekStart();
    const monthStart = getCurrentMonthStart();
    return {
      weekHours: getEffectiveStudyMinutes(subjects, dailyLogs, weekStart, today, dbSessions) / 60,
      monthHours: getEffectiveStudyMinutes(subjects, dailyLogs, monthStart, today, dbSessions) / 60,
    };
  }, [subjects, dailyLogs, today, dbSessions]);

  const streakData = useStreak(subjects, dailyLogs, dbSessions);
  const streak = streakData.current;

  const closestExam = useMemo(() => {
    if (!exams || exams.length === 0) return null;
    const now = Date.now();
    const upcoming = exams
      .map(e => ({ ...e, diff: new Date(e.date).getTime() - now }))
      .filter(e => e.diff > 0)
      .sort((a, b) => a.diff - b.diff);
    if (upcoming.length === 0) return null;
    const days = Math.ceil(upcoming[0].diff / 86400000);
    return { label: upcoming[0].label, emoji: upcoming[0].emoji, days };
  }, [exams]);

  const pct = (cur: number, goal: number) => goal > 0 ? Math.round((cur / goal) * 100) : 0;

  // Ticker visibility preferences
  const TICKER_KEY = 'nursetrack-ticker-prefs';
  type TickerItem = 'dailyTopics' | 'dailyHours' | 'weekly' | 'monthly' | 'nextExam' | 'streak';
  const defaultPrefs: Record<TickerItem, boolean> = { dailyTopics: true, dailyHours: true, weekly: true, monthly: true, nextExam: true, streak: true };
  const [tickerPrefs, setTickerPrefs] = useState<Record<TickerItem, boolean>>(() => {
    try { return { ...defaultPrefs, ...JSON.parse(localStorage.getItem(TICKER_KEY) || '{}') }; } catch { return defaultPrefs; }
  });
  const [tickerSettingsOpen, setTickerSettingsOpen] = useState(false);
  useEffect(() => { localStorage.setItem(TICKER_KEY, JSON.stringify(tickerPrefs)); }, [tickerPrefs]);
  const togglePref = (key: TickerItem) => setTickerPrefs(p => ({ ...p, [key]: !p[key] }));

  const tickerItems: { key: TickerItem; label: string; emoji: string; text: string }[] = [
    { key: 'dailyTopics', label: 'Daily Topics', emoji: '📅', text: `Daily: ${stats.todayT}/${studyGoals.dailyTopics} topics (${pct(stats.todayT, studyGoals.dailyTopics)}%)` },
    { key: 'dailyHours', label: 'Daily Hours', emoji: '⏱️', text: `${formatStudyHours(todayHours)}/${formatStudyHours(studyGoals.dailyHours)} studied` },
    { key: 'weekly', label: 'Weekly Progress', emoji: '📆', text: `Weekly: ${stats.weekT}/${studyGoals.weeklyTopics} (${pct(stats.weekT, studyGoals.weeklyTopics)}%)` },
    { key: 'monthly', label: 'Monthly Progress', emoji: '🗓️', text: `Monthly: ${stats.monthT}/${studyGoals.monthlyTopics} (${pct(stats.monthT, studyGoals.monthlyTopics)}%)` },
    { key: 'nextExam', label: 'Next Exam', emoji: '🎯', text: closestExam ? `Next: ${closestExam.emoji} ${closestExam.label} in ${closestExam.days}d` : '' },
    { key: 'streak', label: 'Streak', emoji: '🔥', text: `${streak}d streak` },
  ];

  const tickerText = tickerItems
    .filter(i => tickerPrefs[i.key] && i.text)
    .map(i => `${i.emoji} ${i.text}`)
    .join('    ·    ') || '📚 Tap ✏️ to set your study goals';

  const save = () => { onUpdateGoals(draft); setEditOpen(false); };
  const handleEditFromPopup = () => {
    setStatsOpen(false);
    setTimeout(() => { setEditOpen(true); setDraft(studyGoals); }, 200);
  };

  const goalFields: { label: string; key: keyof StudyGoals; step: number }[] = [
    { label: 'Daily Hours', key: 'dailyHours', step: 0.5 },
    { label: 'Daily Topics', key: 'dailyTopics', step: 1 },
    { label: 'Weekly Hours', key: 'weeklyHours', step: 1 },
    { label: 'Weekly Topics', key: 'weeklyTopics', step: 5 },
    { label: 'Monthly Hours', key: 'monthlyHours', step: 5 },
    { label: 'Monthly Topics', key: 'monthlyTopics', step: 10 },
  ];

  return (
    <>
      <div className="flex items-center gap-0 rounded-xl overflow-hidden border border-destructive/30 bg-destructive shadow-lg shadow-destructive/20 max-w-full">
        {/* LIVE Badge */}
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-destructive-foreground/10 border-r border-destructive-foreground/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive-foreground opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive-foreground" />
          </span>
          <span className="text-[10px] font-black text-destructive-foreground tracking-wider">📰 LIVE</span>
        </div>

        {/* Marquee area — clickable to open stats popup */}
        <button
          onClick={() => setStatsOpen(true)}
          className="flex-1 overflow-hidden relative h-9 text-left cursor-pointer hover:bg-destructive-foreground/5 transition-colors min-w-0"
        >
          <div className="news-ticker-track whitespace-nowrap text-[11px] font-bold text-destructive-foreground leading-9">
            <span className="inline-block news-ticker-item">{tickerText}</span>
            <span className="inline-block news-ticker-item ml-24">{tickerText}</span>
          </div>
        </button>

        {/* Ticker settings button */}
        <Button variant="ghost" size="icon" onClick={() => setTickerSettingsOpen(true)}
          className="w-8 h-8 shrink-0 text-destructive-foreground hover:bg-destructive-foreground/10">
          <Settings2 className="w-3 h-3" />
        </Button>

        {/* Edit button (quick access) */}
        <Sheet open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (v) setDraft(studyGoals); }}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0 mr-1 text-destructive-foreground hover:bg-destructive-foreground/10">
              <Pencil className="w-3 h-3" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle className="text-sm">🎯 Edit Study Targets</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-3 mt-4">
              {goalFields.map(f => (
                <div key={f.key}>
                  <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
                  <Input type="number" min={f.step} step={f.step}
                    value={draft[f.key]} className="h-8 text-xs mt-0.5"
                    onChange={e => setDraft({ ...draft, [f.key]: Math.max(f.step, parseFloat(e.target.value) || f.step) })} />
                </div>
              ))}
            </div>
            <Button className="w-full mt-4" size="sm" onClick={save}>
              <Check className="w-3.5 h-3.5 mr-1.5" /> Save Goals
            </Button>
          </SheetContent>
        </Sheet>

        <style>{`
          .news-ticker-track {
            display: inline-flex;
            animation: news-marquee 35s linear infinite;
            will-change: transform;
            backface-visibility: hidden;
          }
          @keyframes news-marquee {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .news-ticker-track:hover {
            animation-play-state: paused;
          }
        `}</style>
      </div>

      {/* Stats popup dialog */}
      <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
        <DialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden border-border/30">
          <div className="bg-gradient-to-br from-card to-background p-5 space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" /> Study Goals & Progress
              </DialogTitle>
            </DialogHeader>

            {/* Daily */}
            <GoalSection emoji="📅" title="Daily" items={[
              { label: 'Topics', current: stats.todayT, target: studyGoals.dailyTopics, color: 'primary' },
              { label: 'Hours', current: todayHours, target: studyGoals.dailyHours, color: 'secondary', isHours: true },
            ]} />

            {/* Weekly */}
            <GoalSection emoji="📆" title="Weekly" items={[
              { label: 'Topics', current: stats.weekT, target: studyGoals.weeklyTopics, color: 'primary' },
              { label: 'Hours', current: periodHours.weekHours, target: studyGoals.weeklyHours, color: 'secondary', isHours: true },
            ]} />

            {/* Monthly */}
            <GoalSection emoji="🗓️" title="Monthly" items={[
              { label: 'Topics', current: stats.monthT, target: studyGoals.monthlyTopics, color: 'primary' },
              { label: 'Hours', current: periodHours.monthHours, target: studyGoals.monthlyHours, color: 'secondary', isHours: true },
            ]} />

            {/* Streak + Exam row */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-chart-4/20 bg-chart-4/5 p-3 text-center">
                <Flame className="w-5 h-5 text-chart-4 mx-auto mb-1" />
                <p className="text-2xl font-black text-foreground font-mono leading-none">{streak}</p>
                <p className="text-[9px] text-muted-foreground font-semibold mt-1">day streak 🔥</p>
              </div>
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 text-center">
                <GraduationCap className="w-5 h-5 text-accent mx-auto mb-1" />
                {closestExam ? (
                  <>
                    <p className="text-2xl font-black text-foreground font-mono leading-none">{closestExam.days}<span className="text-sm">d</span></p>
                    <p className="text-[9px] text-muted-foreground font-semibold mt-1 truncate">{closestExam.emoji} {closestExam.label}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-muted-foreground mt-1">—</p>
                    <p className="text-[9px] text-muted-foreground font-semibold mt-1">No exams set</p>
                  </>
                )}
              </div>
            </div>

            {/* Edit Goals button */}
            <Button variant="outline" className="w-full gap-2" size="sm" onClick={handleEditFromPopup}>
              <Pencil className="w-3.5 h-3.5" /> Edit Goals
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ticker Visibility Settings */}
      <Dialog open={tickerSettingsOpen} onOpenChange={setTickerSettingsOpen}>
        <DialogContent className="max-w-xs rounded-2xl p-0 overflow-hidden border-border/30">
          <div className="p-5 space-y-3">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" /> Ticker Display
              </DialogTitle>
            </DialogHeader>
            <p className="text-[10px] text-muted-foreground">Choose what appears in the live news ticker</p>
            <div className="space-y-1">
              {tickerItems.map(item => (
                <label key={item.key}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${tickerPrefs[item.key] ? 'bg-primary/8 border border-primary/15' : 'bg-muted/5 border border-transparent hover:bg-muted/10'}`}>
                  <input type="checkbox" checked={tickerPrefs[item.key]}
                    onChange={() => togglePref(item.key)}
                    className="w-4 h-4 rounded accent-primary shrink-0" />
                  <span className="text-sm">{item.emoji}</span>
                  <span className="text-xs font-semibold text-foreground">{item.label}</span>
                  {tickerPrefs[item.key] && <span className="ml-auto text-[8px] text-primary font-bold">ON</span>}
                </label>
              ))}
            </div>
            <Button size="sm" className="w-full" onClick={() => setTickerSettingsOpen(false)}>
              <Check className="w-3.5 h-3.5 mr-1.5" /> Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
