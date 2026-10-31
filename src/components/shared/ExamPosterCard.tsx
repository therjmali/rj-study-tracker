import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, TrendingUp, Settings, ChevronRight } from 'lucide-react';
import type { Subject, ExamConfig } from '../../types';

/* ── Brightness detection ── */
export function useImageBrightness(url?: string): 'dark' | 'light' | null {
  const [brightness, setBrightness] = useState<'dark' | 'light' | null>(null);
  useEffect(() => {
    if (!url) { setBrightness(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 32;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        setBrightness(total / (size * size) < 128 ? 'dark' : 'light');
      } catch { setBrightness(null); }
    };
    img.onerror = () => setBrightness(null);
    img.src = url;
  }, [url]);
  return brightness;
}

/* ── Status badge logic ── */
function statusBadge(days: number, pct: number) {
  if (pct >= 90) return { emoji: '🔥', label: 'Almost ready', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' };
  if (days <= 3) return { emoji: '🔴', label: 'CRITICAL — Study harder!', cls: 'bg-destructive/10 text-destructive border-destructive/20' };
  if (days <= 7) return { emoji: '⚡', label: 'Crunch week', cls: 'bg-chart-4/10 text-chart-4 border-chart-4/20' };
  if (days <= 14) return { emoji: '🟡', label: 'URGENT — Stay focused!', cls: 'bg-chart-4/10 text-chart-4 border-chart-4/20' };
  if (days <= 30) return { emoji: '💪', label: 'Building momentum', cls: 'bg-chart-2/10 text-chart-2 border-chart-2/20' };
  return { emoji: '🟢', label: 'ON TRACK — Keep going!', cls: 'bg-secondary/10 text-secondary border-secondary/20' };
}

export interface ExamPosterData {
  exam: ExamConfig;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
  total: number;
  done: number;
  pct: number;
  linkedSubs: { id: string; name: string; color: string; pct: number }[];
}

/** Compute poster data from exam + subjects + current time */
export function computeExamPosterData(exam: ExamConfig, subjects: Subject[], now: Date | number): ExamPosterData {
  const t = exam.time || '00:00';
  const target = new Date(`${exam.date}T${t}:00`).getTime();
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const diff = Math.max(0, target - nowMs);
  const isPast = target - nowMs <= 0;
  const linked = subjects.filter(s => exam.subjects.includes(s.id));
  const total = linked.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
  const done = linked.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(x => x.completed).length, 0), 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  const linkedSubs = linked.map(s => {
    const st = s.units.reduce((a, u) => a + u.subTopics.length, 0);
    const sd = s.units.reduce((a, u) => a + u.subTopics.filter(x => x.completed).length, 0);
    return { id: s.id, name: s.shortName, color: s.color, pct: st > 0 ? Math.round((sd / st) * 100) : 0 };
  });
  return { exam, days, hours, minutes, seconds, isPast, total, done, pct, linkedSubs };
}

interface Props {
  data: ExamPosterData;
  /** Manage button click → redirect to exam settings */
  onManage?: () => void;
  /** Click subject chip → go to syllabus */
  onSubjectClick?: (subjectId: string) => void;
  /** Compact mode for calendar inline */
  compact?: boolean;
}

export default function ExamPosterCard({ data, onManage, onSubjectClick, compact }: Props) {
  const { exam, days, hours, minutes, seconds, isPast, total, done, pct, linkedSubs } = data;
  const hasCustomBg = !!exam.backgroundImage;
  const bgBrightness = useImageBrightness(exam.backgroundImage);
  const isDarkBg = bgBrightness === 'dark';

  const tp = hasCustomBg ? (isDarkBg ? 'text-white' : 'text-gray-900') : 'text-foreground';
  const ts = hasCustomBg ? (isDarkBg ? 'text-white/70' : 'text-gray-700') : 'text-muted-foreground';
  const tm = hasCustomBg ? (isDarkBg ? 'text-white/50' : 'text-gray-500') : 'text-muted-foreground';
  const shadow = hasCustomBg ? '0 2px 8px rgba(0,0,0,0.5)' : undefined;
  const remaining = total - done;
  const topicsPerDay = days > 0 ? (remaining / days).toFixed(1) : '—';
  const badge = statusBadge(days, pct);

  const dd = String(days).padStart(2, '0');
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  const glassPanel = hasCustomBg
    ? (isDarkBg ? 'bg-black/30 border border-white/10' : 'bg-white/40 border border-black/10')
    : 'bg-muted/15 border border-border/10';

  if (isPast) {
    return (
      <div className="relative overflow-hidden rounded-2xl">
        {hasCustomBg && (
          <>
            <img src={exam.backgroundImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className={`absolute inset-0 ${isDarkBg ? 'bg-black/40' : 'bg-white/50'}`} />
          </>
        )}
        <div className="relative text-center py-6 space-y-2">
          {exam.iconUrl ? (
            <img src={exam.iconUrl} alt="" className="w-14 h-14 mx-auto rounded-2xl object-cover border-2 border-white/30 shadow-xl" />
          ) : (
            <span className="text-4xl">{exam.emoji}</span>
          )}
          <p className={`text-lg font-extrabold ${tp}`} style={{ textShadow: shadow }}>{exam.label}</p>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${hasCustomBg ? (isDarkBg ? 'bg-white/20 text-white' : 'bg-black/10 text-gray-800') : 'bg-secondary/15 text-secondary'}`}>
            ✅ Completed
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Background */}
      {hasCustomBg && (
        <>
          <img src={exam.backgroundImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className={`absolute inset-0 ${isDarkBg ? 'bg-black/30' : 'bg-white/40'} backdrop-blur-[1px]`} />
        </>
      )}

      <div className={`relative space-y-3 ${compact ? 'p-3' : 'p-4'}`}>
        {/* ═══ TOP: Icon | Name+Date | Manage ═══ */}
        <div className="flex items-center gap-3">
          {/* Left: Icon */}
          <div className={`shrink-0 ${compact ? 'w-12 h-12' : 'w-16 h-16'} rounded-2xl flex items-center justify-center overflow-hidden ${
            hasCustomBg ? (isDarkBg ? 'bg-black/30 border border-white/15' : 'bg-white/50 border border-black/10') : 'bg-gradient-to-br from-primary/8 to-secondary/8 border border-border/10'
          }`}>
            {exam.iconUrl ? (
              <img src={exam.iconUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className={`${compact ? 'text-2xl' : 'text-3xl'} drop-shadow-sm`}>{exam.emoji}</span>
            )}
          </div>

          {/* Center: Name + Date */}
          <div className="flex-1 min-w-0">
            <p className={`${compact ? 'text-sm' : 'text-lg'} font-black truncate leading-tight tracking-tight ${tp}`} style={{ textShadow: shadow }}>
              {exam.label}
            </p>
            <div className={`flex items-center gap-1.5 mt-1 ${ts}`}>
              <Calendar className="w-3 h-3" />
              <span className="text-[11px] font-semibold" style={hasCustomBg ? { textShadow: '0 1px 3px rgba(0,0,0,0.3)' } : undefined}>
                {formatExamDateFull(exam.date, exam.time)}
              </span>
            </div>
            {/* Subject chips */}
            {linkedSubs.length > 0 && (
              <div className="flex items-center gap-1 mt-1 overflow-x-auto scrollbar-hide">
                {linkedSubs.map(s => (
                  <button key={s.id} onClick={() => onSubjectClick?.(s.id)}
                    className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[8px] font-bold transition-all active:scale-95 ${
                      hasCustomBg ? (isDarkBg ? 'border-white/15 bg-white/10' : 'border-black/10 bg-black/5') : 'border-border/15 bg-card/30'
                    }`}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className={hasCustomBg ? (isDarkBg ? 'text-white/80' : 'text-gray-700') : 'text-muted-foreground'}>{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Manage toggle */}
          {onManage && (
            <button onClick={onManage}
              className={`shrink-0 p-2 rounded-xl transition-all active:scale-90 ${
                hasCustomBg ? (isDarkBg ? 'bg-white/15 hover:bg-white/25' : 'bg-black/10 hover:bg-black/15') : 'bg-primary/10 hover:bg-primary/15'
              }`}>
              <Settings className={`w-4 h-4 ${hasCustomBg ? (isDarkBg ? 'text-white/70' : 'text-gray-600') : 'text-primary'}`} />
            </button>
          )}
        </div>

        {/* ═══ MIDDLE: Countdown ═══ */}
        <div className={`rounded-xl ${compact ? 'p-2.5' : 'p-3'} ${glassPanel}`} >
          <p className={`text-[9px] text-center font-bold tracking-widest mb-2 ${tm}`}>⏳ COUNTDOWN</p>
          <div className="flex items-center justify-center gap-1.5">
            <CDUnit value={dd} label="DAYS" sz={compact ? 'sm' : 'lg'} tp={tp} tm={tm} shadow={shadow} />
            <Colon tp={tp} shadow={shadow} />
            <CDUnit value={hh} label="HRS" sz={compact ? 'sm' : 'lg'} tp={tp} tm={tm} shadow={shadow} />
            <Colon tp={tp} shadow={shadow} />
            <CDUnit value={mm} label="MIN" sz={compact ? 'sm' : 'lg'} tp={tp} tm={tm} shadow={shadow} />
            <Colon tp={tp} shadow={shadow} />
            <CDUnit value={ss} label="SEC" sz="sm" tp={tp} tm={tm} shadow={shadow} />
          </div>
        </div>

        {/* ═══ BOTTOM: Stats ═══ */}
        {/* Days remaining strip */}
        <div className={`flex items-center gap-2 p-2.5 rounded-xl ${glassPanel}`}>
          <Clock className={`w-4 h-4 shrink-0 ${hasCustomBg ? tp : 'text-primary'}`} />
          <p className={`text-xs font-medium flex-1 ${tp}`}>
            <span className="font-mono font-bold">{days}</span> day{days !== 1 ? 's' : ''} remaining
          </p>
          {total > 0 && (
            <span className={`text-[10px] font-mono font-bold ${ts}`}>{pct}% ready</span>
          )}
        </div>

        {/* Readiness + Progress bar */}
        {total > 0 && (
          <div>
            <div className={`flex justify-between text-xs mb-1 ${ts}`}>
              <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Readiness</span>
              <span className="font-mono font-bold">{pct}%</span>
            </div>
            <div className={`h-2 rounded-full ${hasCustomBg ? (isDarkBg ? 'bg-white/20' : 'bg-black/10') : 'bg-muted/20'}`}>
              <motion.div className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-secondary"
                initial={{ width: 0 }} animate={{ width: `${Math.max(pct, 1)}%` }}
                transition={{ type: 'spring', damping: 20, stiffness: 80 }} />
            </div>
            <div className={`flex justify-between text-[10px] mt-1 ${tm}`}>
              <span>{done}/{total} topics</span>
              {remaining > 0 && days > 0 && (
                <span>Need <span className={`font-mono font-bold ${tp}`}>{topicsPerDay}</span>/day</span>
              )}
            </div>
          </div>
        )}

        {/* Urgency status */}
        <div className={`text-center text-[10px] font-bold py-1.5 rounded-lg border ${badge.cls}`}
          style={hasCustomBg ? { } : undefined}>
          {badge.emoji} {badge.label}
        </div>
      </div>
    </div>
  );
}

function CDUnit({ value, label, sz, tp, tm, shadow }: { value: string; label: string; sz: 'sm' | 'lg'; tp: string; tm: string; shadow?: string }) {
  return (
    <div className="text-center">
      <p className={`font-black font-mono leading-none tracking-tight ${tp} ${sz === 'lg' ? 'text-3xl' : 'text-2xl'}`} style={{ textShadow: shadow }}>{value}</p>
      <p className={`text-[7px] font-bold tracking-widest mt-0.5 ${tm}`}>{label}</p>
    </div>
  );
}

function Colon({ tp, shadow }: { tp: string; shadow?: string }) {
  return <span className={`text-2xl font-black font-mono -mt-2 ${tp}`} style={{ textShadow: shadow }}>:</span>;
}

function formatExamDateFull(dateStr: string, time?: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let s = `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()} (${days[d.getDay()]})`;
  if (time) s += `, ${time}`;
  return s;
}
