import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Clock, ChevronDown, AlertTriangle, Trophy, Calendar, Zap } from 'lucide-react';
import CircularProgress from '../shared/CircularProgress';
import { getLocalDateStr, formatStudyTime, readableInk } from '../../lib/utils';
import type { Subject, Folder } from '../../types';

interface Props {
  folder: Folder;
  subjects: Subject[];
  onOpenSubject?: (subjectId: string) => void;
}

function Section({ title, emoji, defaultOpen = true, badge, children }: { title: string; emoji: string; defaultOpen?: boolean; badge?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border/15 bg-card/30 overflow-hidden">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left group hover:bg-card/40 transition-colors active:scale-[0.998]">
        <span className="text-base leading-none">{emoji}</span>
        <span className="text-[13px] font-bold text-foreground flex-1">{title}</span>
        {badge && !open && <div className="shrink-0">{badge}</div>}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="overflow-hidden">
            <div className="px-4 pb-4 pt-0.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FolderAnalytics({ folder, subjects, onOpenSubject }: Props) {
  const stats = useMemo(() => {
    let total = 0, done = 0, easy = 0, medium = 0, hard = 0;
    let easyDone = 0, medDone = 0, hardDone = 0;
    let impTotal = 0, impDone = 0, totalTime = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      total++; totalTime += t.timeSpent || 0;
      if (t.completed) done++;
      if (t.important) { impTotal++; if (t.completed) impDone++; }
      if (t.difficulty === 'Easy') { easy++; if (t.completed) easyDone++; }
      else if (t.difficulty === 'Medium') { medium++; if (t.completed) medDone++; }
      else { hard++; if (t.completed) hardDone++; }
    })));
    return { total, done, remaining: total - done, pct: total > 0 ? Math.round(done / total * 100) : 0, easy, medium, hard, easyDone, medDone, hardDone, impTotal, impDone, totalTime };
  }, [subjects]);

  const perSubject = useMemo(() => subjects.map(s => {
    let total = 0, done = 0, time = 0;
    s.units.forEach(u => u.subTopics.forEach(t => { total++; if (t.completed) done++; time += t.timeSpent || 0; }));
    return { id: s.id, name: s.shortName, fullName: s.name, color: s.color, image: s.image, total, done, time, pct: total > 0 ? Math.round(done / total * 100) : 0 };
  }).sort((a, b) => b.pct - a.pct), [subjects]);

  const velocity = useMemo(() => {
    const days: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = getLocalDateStr(d);
      let count = 0;
      subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
        if (t.completed && t.completedDate === ds) count++;
      })));
      days.push(count);
    }
    const total = days.reduce((a, b) => a + b, 0);
    return { days, avg: Math.round((total / 7) * 10) / 10, total };
  }, [subjects]);

  const rhythm = useMemo(() => {
    const b = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (!t.completed || !t.completedTime) return;
      const h = parseInt(t.completedTime.split(':')[0]);
      if (h >= 4 && h < 12) b.morning++;
      else if (h >= 12 && h < 17) b.afternoon++;
      else if (h >= 17 && h < 20) b.evening++;
      else b.night++;
    })));
    const peakLabel = Object.entries(b).sort((a, bx) => bx[1] - a[1])[0]?.[0] || 'morning';
    return { ...b, peakLabel };
  }, [subjects]);

  const estCompletion = useMemo(() => {
    if (stats.remaining === 0 || velocity.avg <= 0) return null;
    const daysNeeded = Math.ceil(stats.remaining / velocity.avg);
    const d = new Date(); d.setDate(d.getDate() + daysNeeded);
    return { days: daysNeeded, date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) };
  }, [stats, velocity]);

  const weeklyConsistency = useMemo(() => {
    const activeDates = new Set<string>();
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.completedDate) activeDates.add(t.completedDate);
    })));
    let active = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      if (activeDates.has(getLocalDateStr(d))) active++;
    }
    return Math.round((active / 7) * 100);
  }, [subjects]);

  const examWarnings = useMemo(() => {
    const today = new Date();
    return subjects.filter(s => s.examDate).map(s => {
      const exam = new Date(s.examDate + 'T00:00:00');
      const daysLeft = Math.ceil((exam.getTime() - today.getTime()) / 86400000);
      if (daysLeft <= 0 || daysLeft > 30) return null;
      const remaining = s.units.flatMap(u => u.subTopics).filter(t => !t.completed).length;
      if (remaining === 0) return null;
      return { name: s.shortName, color: s.color, daysLeft, remaining };
    }).filter(Boolean) as { name: string; color: string; daysLeft: number; remaining: number }[];
  }, [subjects]);

  const topSubject = perSubject.length > 0 ? perSubject[0] : null;
  const weakestSubject = perSubject.length > 1 ? perSubject[perSubject.length - 1] : null;

  if (subjects.length === 0) return null;

  const maxDay = Math.max(...velocity.days, 1);

  const diffRows = [
    { label: 'Easy', done: stats.easyDone, total: stats.easy, color: 'hsl(var(--diff-easy))' },
    { label: 'Medium', done: stats.medDone, total: stats.medium, color: 'hsl(var(--diff-medium))' },
    { label: 'Hard', done: stats.hardDone, total: stats.hard, color: 'hsl(var(--diff-hard))' },
  ];

  const rhythmData = [
    { label: 'Morning', time: '4 AM – 12 PM', emoji: '🌅', count: rhythm.morning, key: 'morning' },
    { label: 'Afternoon', time: '12 PM – 5 PM', emoji: '☀️', count: rhythm.afternoon, key: 'afternoon' },
    { label: 'Evening', time: '5 PM – 8 PM', emoji: '🌆', count: rhythm.evening, key: 'evening' },
    { label: 'Night', time: '8 PM – 4 AM', emoji: '🌙', count: rhythm.night, key: 'night' },
  ];

  return (
    <div className="space-y-3">
      {/* ══════ HERO CARD ══════ */}
      <div className="rounded-2xl border border-border/20 bg-card/50 backdrop-blur-xl overflow-hidden"
        style={{ boxShadow: '0 0 40px hsl(var(--primary) / 0.06), 0 4px 20px hsl(var(--border) / 0.12)' }}>
        
        <div className="relative p-5 overflow-hidden">
          {/* Ambient glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[-40%] left-[10%] w-[80%] h-[80%] rounded-full blur-[80px] opacity-20" style={{ backgroundColor: folder.color }} />
          </div>

          <div className="relative flex items-start gap-4">
            {/* Hero Ring — oversized for impact */}
            <div className="relative shrink-0">
              <div className="absolute inset-[-4px] rounded-full blur-xl opacity-25" style={{ backgroundColor: folder.color }} />
              <div className="relative w-[90px] h-[90px]">
                <svg viewBox="0 0 90 90" className="w-full h-full -rotate-90">
                  <circle cx="45" cy="45" r="38" fill="none" stroke="hsl(var(--muted) / 0.2)" strokeWidth="7" />
                  <circle cx="45" cy="45" r="38" fill="none" stroke={folder.color} strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 38}`}
                    strokeDashoffset={`${2 * Math.PI * 38 * (1 - stats.pct / 100)}`}
                    style={{ transition: 'stroke-dashoffset 1s ease-out', filter: `drop-shadow(0 0 8px ${folder.color}50)` }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.span className="text-[22px] font-black font-mono text-foreground leading-none"
                    initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, type: 'spring' }}>
                    {stats.pct}<span className="text-[13px] text-muted-foreground">%</span>
                  </motion.span>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 pt-1">
              <h2 className="text-xl font-black text-foreground leading-tight truncate">{folder.name}</h2>
              <p className="text-[12px] text-muted-foreground font-semibold mt-1 leading-snug">
                {stats.done}/{stats.total} topics · {stats.remaining} remaining
              </p>
              {estCompletion && (
                <p className="text-[11px] text-primary font-bold mt-1.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 shrink-0" /> Est. completion: {estCompletion.date} ({estCompletion.days}d)
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ══════ 4-CARD STATS GRID ══════ */}
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard emoji="✅" label="Completed" value={`${stats.done}`} sub={`${stats.pct}% done`} variant="success" />
            <StatCard emoji="📚" label="Remaining" value={`${stats.remaining}`} sub={`${100 - stats.pct}% left`} variant="neutral" />
            <StatCard emoji="⭐" label="Important" value={`${stats.impDone}/${stats.impTotal}`}
              sub={stats.impTotal > 0 ? `${Math.round((stats.impDone / stats.impTotal) * 100)}% done` : 'None'} variant="warning" />
            <StatCard emoji="⏱️" label="Time Invested" value={formatStudyTime(stats.totalTime)}
              sub={`${perSubject.filter(s => s.time > 0).length} subjects`} variant="info" />
          </div>

          {/* ══════ TOP & WEAKEST ══════ */}
          {(topSubject || weakestSubject) && (
            <div className="grid grid-cols-2 gap-2.5">
              {topSubject && topSubject.done > 0 && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-secondary/8 border border-secondary/20">
                  <Trophy className="w-5 h-5 text-secondary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-secondary/70 font-black uppercase tracking-wider leading-none">Top Performer</p>
                    <p className="text-[12px] font-bold text-foreground truncate mt-1 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: topSubject.color }} />
                      {topSubject.name} · {topSubject.pct}%
                    </p>
                  </div>
                </div>
              )}
              {weakestSubject && weakestSubject.total > 0 && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-destructive/8 border border-destructive/20">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-destructive/70 font-black uppercase tracking-wider leading-none">Needs Attention</p>
                    <p className="text-[12px] font-bold text-foreground truncate mt-1 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: weakestSubject.color }} />
                      {weakestSubject.name} · {weakestSubject.pct}%
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════ SUBJECT PROGRESS ══════ */}
      <Section title="Subject Progress" emoji="📊"
        badge={<span className="text-[10px] font-mono font-bold text-muted-foreground">{perSubject.length} subjects</span>}>
        <div className="space-y-2.5">
          {perSubject.map(s => (
            <button key={s.id} onClick={() => onOpenSubject?.(s.id)}
              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-card/60 transition-all text-left group border border-transparent hover:border-border/20 active:scale-[0.98]">
              <div className="w-3 h-8 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-foreground truncate flex items-center gap-1.5">
                    {s.image && <span className="text-sm">{s.image.startsWith('http') ? '' : '🩺'}</span>}
                    {s.fullName}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-muted-foreground font-semibold">{s.done}/{s.total}</span>
                    {s.time > 0 && <span className="text-[10px] font-mono text-secondary/70 font-semibold">{formatStudyTime(s.time)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 mt-1.5">
                  <div className="flex-1 h-2.5 rounded-full bg-muted/20 overflow-hidden">
                    <motion.div className="h-full rounded-full" style={{ backgroundColor: s.color }}
                      initial={{ width: 0 }} animate={{ width: `${s.pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
                  </div>
                  <span className="text-[11px] font-mono font-black text-foreground w-[36px] text-right">{s.pct}%</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Section>

      {/* ══════ DIFFICULTY HEATMAP ══════ */}
      <Section title="Difficulty Heatmap" emoji="🔥"
        badge={<span className="text-[10px] font-mono text-muted-foreground font-bold">{stats.easyDone + stats.medDone + stats.hardDone}/{stats.total}</span>}>
        <div className="grid grid-cols-3 gap-3">
          {diffRows.map(r => {
            const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
            return (
              <div key={r.label} className="rounded-xl bg-card/40 border border-border/15 p-3 flex flex-col items-center gap-2">
                <div className="relative w-14 h-14">
                  <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
                    <circle cx="28" cy="28" r="22" fill="none" stroke="hsl(var(--muted) / 0.2)" strokeWidth="5" />
                    <circle cx="28" cy="28" r="22" fill="none" stroke={r.color} strokeWidth="5" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 22}`}
                      strokeDashoffset={`${2 * Math.PI * 22 * (1 - pct / 100)}`}
                      style={{ transition: 'stroke-dashoffset 0.8s ease-out', filter: `drop-shadow(0 0 4px ${r.color}40)` }} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[12px] font-black font-mono" style={{ color: readableInk(r.color) }}>{pct}%</span>
                  </div>
                </div>
                <p className="text-[12px] font-bold text-foreground leading-none">{r.label}</p>
                <p className="text-[10px] text-muted-foreground font-mono font-semibold leading-none">{r.done}/{r.total}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ══════ 7-DAY VELOCITY ══════ */}
      <Section title="7-Day Velocity" emoji="📈"
        badge={<span className="text-[10px] font-bold text-primary">Avg: {velocity.avg}/day</span>}>
        <div>
          <div className="flex items-end gap-1.5 h-20 px-1">
            {velocity.days.map((d, i) => {
              const h = Math.max(8, (d / maxDay) * 100);
              const dayOfWeek = new Date();
              dayOfWeek.setDate(dayOfWeek.getDate() - (6 - i));
              const label = dayOfWeek.toLocaleDateString('en-US', { weekday: 'narrow' });
              const isToday = i === 6;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  {d > 0 && <span className="text-[8px] font-black font-mono text-foreground">{d}</span>}
                  <motion.div
                    className={`w-full rounded-lg ${isToday ? 'bg-primary' : 'bg-primary/60'}`}
                    initial={{ height: 0 }} animate={{ height: `${h}%` }}
                    transition={{ delay: i * 0.06, duration: 0.5, ease: 'easeOut' }}
                    style={{ minHeight: d > 0 ? 8 : 4, boxShadow: isToday ? '0 0 8px hsl(var(--primary) / 0.4)' : 'none' }}
                  />
                  <span className={`text-[9px] font-bold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>{label}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-3 px-1">
            <span className="text-[11px] text-muted-foreground font-semibold">
              Total: <strong className="text-foreground">{velocity.total}</strong> topics
            </span>
            <span className="text-[11px] font-bold text-primary">
              Avg: {velocity.avg}/day
            </span>
          </div>
        </div>
      </Section>

      {/* ══════ STUDY RHYTHM ══════ */}
      <Section title="Study Rhythm" emoji="🕐" defaultOpen={false}>
        <div className="grid grid-cols-4 gap-2">
          {rhythmData.map(r => (
            <div key={r.key} className={`text-center p-3 rounded-xl border transition-all ${
              r.key === rhythm.peakLabel ? 'bg-primary/10 border-primary/25 shadow-sm shadow-primary/10' : 'bg-card/30 border-border/10'
            }`}>
              <span className="text-xl leading-none">{r.emoji}</span>
              <p className="text-base font-black font-mono text-foreground mt-1.5">{r.count}</p>
              <p className="text-[9px] text-foreground font-bold mt-0.5">{r.label}</p>
              <p className="text-[7px] text-muted-foreground font-semibold whitespace-nowrap">{r.time}</p>
              {r.key === rhythm.peakLabel && r.count > 0 && (
                <span className="inline-block mt-1.5 text-[7px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-black tracking-wider">PEAK</span>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ══════ WEEKLY CONSISTENCY ══════ */}
      <div className="flex items-center gap-4 p-4 rounded-2xl border border-border/15 bg-card/30">
        <div className="relative w-12 h-12 shrink-0">
          <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
            <circle cx="24" cy="24" r="19" fill="none" stroke="hsl(var(--muted) / 0.2)" strokeWidth="4.5" />
            <circle cx="24" cy="24" r="19" fill="none"
              stroke={weeklyConsistency >= 70 ? 'hsl(var(--secondary))' : weeklyConsistency >= 40 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
              strokeWidth="4.5" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 19}`}
              strokeDashoffset={`${2 * Math.PI * 19 * (1 - weeklyConsistency / 100)}`}
              style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-black font-mono text-foreground">{weeklyConsistency}%</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-foreground">Weekly Consistency</p>
          <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">
            {weeklyConsistency >= 70 ? '🔥 Excellent streak!' : weeklyConsistency >= 40 ? '💪 Keep going!' : '⚡ Study more consistently'}
          </p>
        </div>
      </div>

      {/* ══════ EXAM PROXIMITY ══════ */}
      {examWarnings.length > 0 && (
        <Section title="Exam Alerts" emoji="⚠️">
          <div className="space-y-2">
            {examWarnings.map(e => (
              <div key={e.name} className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-destructive/8 border border-destructive/15">
                <AlertTriangle className="w-4.5 h-4.5 text-destructive shrink-0" />
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-foreground">{e.name}</p>
                  <p className="text-[10px] text-destructive font-semibold">{e.daysLeft} days left · {e.remaining} topics remaining</p>
                </div>
                <span className="text-lg shrink-0">{e.daysLeft <= 7 ? '🚨' : '⏰'}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ═══════ Stat Card ═══════ */
function StatCard({ emoji, label, value, sub, variant }: {
  emoji: string; label: string; value: string; sub: string;
  variant: 'success' | 'neutral' | 'warning' | 'info';
}) {
  const styles = {
    success: 'bg-secondary/8 border-secondary/20',
    neutral: 'bg-muted/10 border-border/20',
    warning: 'bg-chart-4/8 border-chart-4/20',
    info: 'bg-primary/8 border-primary/20',
  };
  return (
    <motion.div className={`rounded-xl border p-3.5 text-center ${styles[variant]}`}
      initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
      <span className="text-xl leading-none">{emoji}</span>
      <p className="text-xl font-black font-mono text-foreground leading-none mt-2">{value}</p>
      <p className="text-[10px] text-muted-foreground font-bold mt-1.5">{label}</p>
      <p className="text-[9px] text-muted-foreground/60 font-medium mt-0.5">{sub}</p>
    </motion.div>
  );
}
