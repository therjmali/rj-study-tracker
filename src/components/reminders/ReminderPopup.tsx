import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Pin, Clock, Check, CalendarDays, ChevronLeft, ChevronRight,
  ZoomIn, FileEdit, Repeat, Lock, ChevronDown, MoreHorizontal
} from 'lucide-react';
import type { Reminder } from '../../types';
import ImageLightbox from './ImageLightbox';

/** Split content into non-empty lines */
function contentLines(text: string): string[] {
  return text.split(/\r?\n/).filter(l => l.trim());
}

/* ── Known subject keywords for dynamic chip detection ── */
const KNOWN_SUBJECTS = [
  'NORCET', 'AIIMS', 'JIPMER', 'NCLEX', 'CHN', 'MHN', 'NML',
  'Anatomy', 'Physiology', 'Pharmacology', 'Pathology', 'Biochemistry',
  'Microbiology', 'Pediatrics', 'OBG', 'Surgery', 'Medicine',
  'Community Health', 'Mental Health', 'Nursing', 'Midwifery',
];

function detectSubject(title: string, content: string): string | null {
  const combined = `${title} ${content}`.toUpperCase();
  for (const subj of KNOWN_SUBJECTS) {
    if (combined.includes(subj.toUpperCase())) return subj;
  }
  return null;
}

/* ── Color Maps ── */
const GLOW: Record<string, string> = {
  primary: 'shadow-[0_0_30px_hsl(var(--primary)/0.15)]',
  secondary: 'shadow-[0_0_30px_hsl(var(--secondary)/0.15)]',
  accent: 'shadow-[0_0_30px_hsl(var(--accent)/0.15)]',
  destructive: 'shadow-[0_0_30px_hsl(var(--destructive)/0.15)]',
  'chart-4': 'shadow-[0_0_30px_hsl(var(--chart-4)/0.15)]',
  'chart-5': 'shadow-[0_0_30px_hsl(var(--chart-5)/0.15)]',
};
const DOT: Record<string, string> = {
  primary: 'bg-primary', secondary: 'bg-secondary', accent: 'bg-accent',
  destructive: 'bg-destructive', 'chart-4': 'bg-chart-4', 'chart-5': 'bg-chart-5',
};
const PRIORITY_MAP: Record<string, { label: string; emoji: string; cls: string }> = {
  destructive: { label: 'High Priority', emoji: '🔥', cls: 'bg-destructive/15 text-destructive border-destructive/25' },
  'chart-4': { label: 'Medium', emoji: '⚡', cls: 'bg-chart-4/15 text-chart-4 border-chart-4/25' },
  primary: { label: 'Normal', emoji: '📌', cls: 'bg-primary/15 text-primary border-primary/25' },
  secondary: { label: 'Low', emoji: '🟢', cls: 'bg-secondary/15 text-secondary border-secondary/25' },
  accent: { label: 'Focus', emoji: '🎯', cls: 'bg-accent/15 text-accent border-accent/25' },
  'chart-5': { label: 'Review', emoji: '📖', cls: 'bg-chart-5/15 text-chart-5 border-chart-5/25' },
};

/* ── Snooze Options (with hour thresholds for filtering) ── */
const SNOOZE_OPTIONS_ALL = [
  { key: '1hr', label: '1 Hour', icon: '🕐', time: '', pastAfterHour: -1 },
  { key: '2hr', label: '2 Hours', icon: '🕑', time: '', pastAfterHour: -1 },
  { key: 'evening', label: 'Evening', icon: '🌆', time: '5:00 PM', pastAfterHour: 17 },
  { key: 'tonight', label: 'Night', icon: '🌙', time: '8:00 PM', pastAfterHour: 20 },
  { key: 'tomorrow_morning', label: 'Tomorrow Morning', icon: '🌅', time: '8:00 AM', pastAfterHour: -1 },
  { key: 'tomorrow_afternoon', label: 'Tomorrow Afternoon', icon: '☀️', time: '2:00 PM', pastAfterHour: -1 },
  { key: 'tomorrow_evening', label: 'Tomorrow Evening', icon: '🌇', time: '5:00 PM', pastAfterHour: -1 },
  { key: 'tomorrow_night', label: 'Tomorrow Night', icon: '🌃', time: '8:00 PM', pastAfterHour: -1 },
  { key: 'next_week', label: 'Next Week', icon: '📅', time: '', pastAfterHour: -1 },
  { key: 'pick_date', label: 'Pick Date', icon: '📆', time: '', pastAfterHour: -1 },
  { key: 'pick_datetime', label: 'Pick Date & Time', icon: '🗓️', time: '', pastAfterHour: -1 },
];

/** Filter out today's time-based options that are already past */
function getFilteredSnoozeOptions(): typeof SNOOZE_OPTIONS_ALL {
  const h = new Date().getHours();
  return SNOOZE_OPTIONS_ALL.filter(opt => opt.pastAfterHour === -1 || h < opt.pastAfterHour);
}

function getSnoozeTime(key: string): Date {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7);
  switch (key) {
    case '1hr': return new Date(Date.now() + 60 * 60 * 1000);
    case '2hr': return new Date(Date.now() + 2 * 60 * 60 * 1000);
    case 'evening': { const t = new Date(today); t.setHours(17, 0); return t > now ? t : new Date(Date.now() + 60000); }
    case 'tonight': { const t = new Date(today); t.setHours(20, 0); return t > now ? t : new Date(Date.now() + 60000); }
    case 'tomorrow_morning': { const t = new Date(tomorrow); t.setHours(8, 0); return t; }
    case 'tomorrow_afternoon': { const t = new Date(tomorrow); t.setHours(14, 0); return t; }
    case 'tomorrow_evening': { const t = new Date(tomorrow); t.setHours(17, 0); return t; }
    case 'tomorrow_night': { const t = new Date(tomorrow); t.setHours(20, 0); return t; }
    case 'next_week': { nextWeek.setHours(8, 0); return nextWeek; }
    default: return new Date(Date.now() + 60 * 60 * 1000);
  }
}

/* ── Format current time ── */
function formatCurrentTime(): string {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/* ════════════════════════════════════════════════
   MAIN POPUP
   ════════════════════════════════════════════════ */
interface Props {
  reminders: Reminder[];
  onDismiss: (id: string) => void;
  onSnooze: (id: string, until: string) => void;
  onTogglePin: (id: string) => void;
  onComplete: (id: string) => void;
  onNextAppOpen: (id: string) => void;
  onClose: () => void;
}

export default function ReminderPopup({ reminders, onDismiss, onSnooze, onTogglePin, onComplete, onNextAppOpen, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [showDatePicker, setShowDatePicker] = useState<'date' | 'datetime' | null>(null);
  const [selectedSnooze, setSelectedSnooze] = useState<string | null>(null);
  const [showCompleteAnim, setShowCompleteAnim] = useState(false);
  const [liveTime, setLiveTime] = useState(formatCurrentTime);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [scrollPage, setScrollPage] = useState(0);

  // NOTE: no early return before the hooks below — the "nothing to show" return lives
  // after the last hook (changing the hook count between renders crashes React, error #300).
  const current = reminders[Math.max(0, Math.min(index, reminders.length - 1))] as (typeof reminders)[number] | undefined;
  const priority = PRIORITY_MAP[current?.color ?? 'primary'] || PRIORITY_MAP.primary;
  const glow = GLOW[current?.color ?? 'primary'] || GLOW.primary;
  const dot = DOT[current?.color ?? 'primary'] || DOT.primary;

  // Dynamic subject detection (Enhancement #1)
  const detectedSubject = useMemo(
    () => detectSubject(current?.title ?? '', current?.content ?? ''),
    [current?.title, current?.content]
  );

  // Filtered snooze options (Enhancement #2)
  const snoozeOptions = useMemo(() => getFilteredSnoozeOptions(), []);

  // Live time badge update
  useEffect(() => {
    const iv = setInterval(() => setLiveTime(formatCurrentTime()), 30_000);
    return () => clearInterval(iv);
  }, []);

  // Countdown timer
  useEffect(() => {
    setCountdown(60);
    const iv = setInterval(() => setCountdown(p => (p <= 1 ? 60 : p - 1)), 1000);
    return () => clearInterval(iv);
  }, [index, reminders.length]);

  // Carousel scroll tracking for indicators
  const handleCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) { setScrollPage(0); return; }
    const ratio = el.scrollLeft / maxScroll;
    setScrollPage(ratio < 0.33 ? 0 : ratio < 0.66 ? 1 : 2);
  }, []);

  const advanceOrClose = useCallback(() => {
    if (reminders.length <= 1) onClose();
    else setIndex(i => Math.min(i, reminders.length - 2));
  }, [reminders.length, onClose]);

  // Enhancement #6 — animated checkmark overlay
  const handleComplete = useCallback(() => {
    if (!current) return;
    const id = current.id;
    setShowCompleteAnim(true);
    setTimeout(() => {
      onComplete(id);
      setShowCompleteAnim(false);
      advanceOrClose();
    }, 900);
  }, [current, onComplete, advanceOrClose]);

  const handleNextAppOpen = useCallback(() => {
    // Only set nextAppOpen flag and close popup entirely — don't advance queue
    if (!current) return;
    onNextAppOpen(current.id);
    onClose();
  }, [current, onNextAppOpen, onClose]);

  const handleSnooze = useCallback((key: string) => {
    if (key === 'pick_date') { setShowDatePicker('date'); return; }
    if (key === 'pick_datetime') { setShowDatePicker('datetime'); return; }
    if (key === 'more') { setShowDatePicker('datetime'); return; }
    if (!current) return;
    const id = current.id;
    setSelectedSnooze(key);
    setTimeout(() => {
      const until = getSnoozeTime(key);
      onSnooze(id, until.toISOString());
      setSelectedSnooze(null);
      advanceOrClose();
    }, 300);
  }, [current, onSnooze, advanceOrClose]);

  const handleCustomSnooze = useCallback(() => {
    if (!customDate || !current) return;
    const [y, m, d] = customDate.split('-').map(Number);
    const [hh, mm] = customTime ? customTime.split(':').map(Number) : [8, 0];
    const dt = new Date(y, m - 1, d, hh, mm);
    if (dt <= new Date()) return;
    onSnooze(current.id, dt.toISOString());
    setShowDatePicker(null);
    advanceOrClose();
  }, [customDate, customTime, current, onSnooze, advanceOrClose]);

  if (!current) return null; // nothing to show — safe now, every hook above has already run

  const repeatLabel = current.dateMode === 'every_day' ? 'Daily' :
    current.dateMode === 'range' ? 'Range' :
    current.dateMode === 'specific_dates' ? 'Custom' : '';

  // Enhancement #7 — progress bar color transitions
  const progressPct = (countdown / 60) * 100;
  const barGradient = countdown > 30
    ? 'linear-gradient(90deg, hsl(var(--chart-4)), hsl(var(--accent)))'
    : countdown > 15
    ? 'linear-gradient(90deg, hsl(var(--chart-4)), hsl(var(--chart-4)))'
    : countdown > 5
    ? 'linear-gradient(90deg, hsl(var(--destructive) / 0.7), hsl(var(--chart-4)))'
    : 'linear-gradient(90deg, hsl(var(--destructive)), hsl(var(--destructive) / 0.7))';

  const countdownColor = countdown > 30 ? 'text-chart-4' : countdown > 15 ? 'text-chart-4' : countdown > 5 ? 'text-destructive/80' : 'text-destructive';

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[95]"
        style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.92) 100%)' }}
        onClick={onClose}
      />

      {/* ═══ COMPLETE ANIMATION OVERLAY (Enhancement #6) ═══ */}
      <AnimatePresence>
        {showCompleteAnim && <CompletionOverlay />}
      </AnimatePresence>

      {/* Main Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 60 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.88, y: 60 }}
        transition={{ type: 'spring', damping: 32, stiffness: 380, mass: 0.8 }}
        className={`fixed inset-x-3 top-[6vh] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[440px] z-[96] max-h-[88vh] overflow-y-auto overflow-x-hidden rounded-[28px] border border-border/15 ${glow}`}
        style={{
          background: 'hsl(var(--card) / 0.97)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* ═══ HEADER ═══ */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {/* Pin Button */}
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => onTogglePin(current.id)}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all border ${
                  current.pinned
                    ? 'bg-chart-4/20 border-chart-4/30 shadow-[0_0_12px_hsl(var(--chart-4)/0.25)]'
                    : 'bg-muted/15 border-border/15 hover:bg-muted/25'
                }`}
              >
                <Pin className={`w-5 h-5 transition-colors ${current.pinned ? 'text-chart-4 fill-chart-4' : 'text-muted-foreground/50'}`} />
              </motion.button>

              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className={`w-2 h-2 rounded-full ${dot}`} />
                  <span className="text-xs font-bold text-foreground">Note</span>

                  {/* Enhancement #1 — Dynamic subject chip */}
                  {detectedSubject && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/20 uppercase tracking-wider">
                      {detectedSubject}
                    </span>
                  )}

                  {/* Priority chip */}
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${priority.cls}`}>
                    {priority.emoji} {priority.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Close */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border border-border/20 bg-muted/10 hover:bg-muted/25 transition-all"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </motion.button>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-black text-foreground mt-3 leading-tight line-clamp-2 tracking-tight" style={{ fontFamily: 'var(--font-sans)' }}>
            {current.title}
          </h2>

          {/* Content is shown in the note card below — no inline duplicate */}

          {/* Live time badge */}
          <div className="flex items-center gap-2 mt-2.5">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/12 border border-border/12">
              <Clock className="w-3.5 h-3.5 text-muted-foreground/60" />
              <span className="text-[11px] font-semibold text-muted-foreground">{liveTime} • Today</span>
            </div>
          </div>
        </div>

        {/* ═══ PROGRESS BAR (Enhancement #7 — color shift) ═══ */}
        <div className="px-5 pb-3">
          <div className="relative h-1.5 rounded-full bg-muted/15 overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: barGradient }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.8, ease: 'linear' }}
            />
            {/* Urgent pulse when < 10s */}
            {countdown <= 10 && (
              <motion.div
                className="absolute inset-0 rounded-full bg-destructive/20"
                animate={{ opacity: [0, 0.5, 0] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            )}
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <motion.span
              className={`text-[10px] font-bold ${countdownColor} transition-colors`}
              animate={countdown <= 10 ? { scale: [1, 1.05, 1] } : {}}
              transition={countdown <= 10 ? { duration: 0.6, repeat: Infinity } : {}}
            >
              {countdown}s remaining
            </motion.span>
            <div className="flex items-center gap-3">
              {reminders.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <motion.button whileTap={{ scale: 0.85 }} onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={index === 0}
                    className="w-5 h-5 rounded-full bg-muted/15 flex items-center justify-center disabled:opacity-20">
                    <ChevronLeft className="w-3 h-3 text-muted-foreground" />
                  </motion.button>
                  <span className="text-[10px] font-mono font-bold text-muted-foreground">{index + 1} / {reminders.length}</span>
                  <motion.button whileTap={{ scale: 0.85 }} onClick={() => setIndex(i => Math.min(reminders.length - 1, i + 1))} disabled={index >= reminders.length - 1}
                    className="w-5 h-5 rounded-full bg-muted/15 flex items-center justify-center disabled:opacity-20">
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  </motion.button>
                </div>
              )}
              {repeatLabel && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                  <Repeat className="w-3 h-3" /> Repeats: {repeatLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ═══ NOTE SECTION — only for multi-line content ═══ */}
        {current.content && contentLines(current.content).length >= 2 && (
          <div className="px-5 pb-3">
            <div className="rounded-2xl border border-chart-4/15 bg-chart-4/5 p-4 relative">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileEdit className="w-4 h-4 text-chart-4" />
                  <span className="text-xs font-bold text-chart-4">Note</span>
                </div>
                <div className="relative">
                  <div className="w-8 h-8 rounded-lg border border-border/15 bg-muted/10 flex items-center justify-center">
                    <FileEdit className="w-3.5 h-3.5 text-muted-foreground/50" />
                  </div>
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-chart-4 text-[8px] font-bold text-white flex items-center justify-center">
                    {contentLines(current.content).length}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                {contentLines(current.content).map((line, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-chart-4/60 mt-1.5 shrink-0" />
                    <p className="text-xs text-foreground/80 leading-relaxed">{line}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Single-line content shown as simple note */}
        {current.content && contentLines(current.content).length === 1 && (
          <div className="px-5 pb-3">
            <div className="rounded-2xl border border-chart-4/15 bg-chart-4/5 p-3 flex items-start gap-2">
              <FileEdit className="w-4 h-4 text-chart-4 shrink-0 mt-0.5" />
              <p className="text-xs text-foreground/80 leading-relaxed">{current.content.trim()}</p>
            </div>
          </div>
        )}

        {/* Images */}
        {current.images.length > 0 && (
          <div className="px-5 pb-3">
            <div className={`grid ${current.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
              {current.images.map((img, i) => (
                <motion.button key={img.id} whileTap={{ scale: 0.97 }} onClick={() => setLightboxIdx(i)}
                  className="relative rounded-2xl overflow-hidden border border-border/15 group bg-muted/10">
                  <img src={img.url} alt={img.name} className={`w-full ${current.images.length === 1 ? 'max-h-[40vh]' : 'aspect-square'} object-cover`} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                    <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-opacity" />
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* ═══ SNOOZE SECTION ═══ */}
        <div className="px-5 pb-3">
          <motion.div
            className="rounded-2xl border border-border/12 overflow-hidden"
            style={{ background: 'hsl(var(--muted) / 0.08)' }}
          >
            <button
              onClick={() => setSnoozeOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">🕰️</span>
                <span className="text-sm font-bold text-foreground">Snooze</span>
                <span className="text-[10px] text-muted-foreground font-medium">Remind me again later</span>
              </div>
              <motion.div animate={{ rotate: snoozeOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </motion.div>
            </button>

            <AnimatePresence>
              {snoozeOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="overflow-hidden"
                >
                  {/* Horizontal carousel with filtered options */}
                  <div className="relative px-2 pb-3">
                    <div
                      ref={carouselRef}
                      onScroll={handleCarouselScroll}
                      className="flex gap-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 px-2"
                      style={{ scrollSnapType: 'x mandatory' }}
                    >
                      {/* Enhancement #2 — filtered snooze chips */}
                      {snoozeOptions.map(opt => (
                        <motion.button
                          key={opt.key}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => handleSnooze(opt.key)}
                          className={`flex-shrink-0 snap-start w-[88px] flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border transition-all ${
                            selectedSnooze === opt.key
                              ? 'bg-chart-4/15 border-chart-4/40 shadow-[0_0_12px_hsl(var(--chart-4)/0.2)]'
                              : 'bg-card/40 border-border/15 hover:border-chart-4/25 hover:bg-chart-4/5'
                          }`}
                        >
                          <span className="text-xl">{opt.icon}</span>
                          <span className="text-[10px] font-bold text-foreground text-center leading-tight">{opt.label}</span>
                          {opt.time && <span className="text-[9px] text-muted-foreground font-medium">{opt.time}</span>}
                          {selectedSnooze === opt.key && (
                            <div className="w-1 h-1 rounded-full bg-chart-4 mt-0.5" />
                          )}
                        </motion.button>
                      ))}

                      {/* Enhancement #3 — "More" chip at the end */}
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setShowDatePicker('datetime')}
                        className="flex-shrink-0 snap-start w-[88px] flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border border-dashed border-border/25 bg-card/20 hover:border-chart-4/25 hover:bg-chart-4/5 transition-all"
                      >
                        <div className="w-8 h-8 rounded-full bg-muted/15 flex items-center justify-center">
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground/60" />
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground text-center">More</span>
                      </motion.button>
                    </div>

                    {/* Reactive scroll indicators */}
                    <div className="flex justify-center gap-1 mt-1">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className={`h-1 rounded-full transition-all duration-300 ${
                            scrollPage === i ? 'w-6 bg-chart-4/50' : 'w-3 bg-muted-foreground/15'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Fade edges */}
                    <div className="absolute top-0 left-0 w-4 h-[calc(100%-16px)] pointer-events-none" style={{ background: 'linear-gradient(90deg, hsl(var(--card)/0.85), transparent)' }} />
                    <div className="absolute top-0 right-0 w-4 h-[calc(100%-16px)] pointer-events-none" style={{ background: 'linear-gradient(270deg, hsl(var(--card)/0.85), transparent)' }} />
                  </div>

                  {/* Date picker */}
                  <AnimatePresence>
                    {showDatePicker && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden px-4 pb-3"
                      >
                        <div className="space-y-2 p-3 rounded-xl border border-border/12 bg-card/30">
                          <div className="flex gap-2">
                            <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
                              className="flex-1 h-9 text-xs rounded-xl border border-border/20 bg-background/50 px-3 text-foreground" />
                            {showDatePicker === 'datetime' && (
                              <input type="time" value={customTime} onChange={e => setCustomTime(e.target.value)}
                                className="w-24 h-9 text-xs rounded-xl border border-border/20 bg-background/50 px-3 text-foreground" />
                            )}
                          </div>
                          <div className="flex gap-2">
                            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowDatePicker(null)}
                              className="flex-1 h-8 text-[11px] font-bold rounded-xl border border-border/20 text-muted-foreground">
                              Cancel
                            </motion.button>
                            <motion.button whileTap={{ scale: 0.95 }} onClick={handleCustomSnooze} disabled={!customDate}
                              className="flex-1 h-8 text-[11px] font-bold rounded-xl bg-chart-4/15 border border-chart-4/25 text-chart-4 disabled:opacity-30">
                              Set Snooze
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* ═══ PRIMARY ACTIONS — Premium Two-Button Area ═══ */}
        <div className="px-5 pb-4">
          <PremiumActionButtons onComplete={handleComplete} onNextOpen={handleNextAppOpen} />
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground/50">
            <Lock className="w-3 h-3" />
            <span>No action taken? I'll remind you again in 1 minute.</span>
          </div>
        </div>
      </motion.div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIdx !== null && (
          <ImageLightbox images={current.images} initialIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

/* ════════════════════════════════════════════════
   COMPLETION OVERLAY (Enhancement #6)
   ════════════════════════════════════════════════ */
function CompletionOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[99] flex items-center justify-center pointer-events-none"
    >
      {/* Radial glow */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.5, 1.2], opacity: [0, 0.3, 0] }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="absolute w-48 h-48 rounded-full"
        style={{ background: 'radial-gradient(circle, hsl(var(--secondary) / 0.4), transparent)' }}
      />
      {/* Checkmark circle */}
      <motion.div
        initial={{ scale: 0, rotate: -45 }}
        animate={{ scale: [0, 1.2, 1], rotate: [- 45, 10, 0] }}
        transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }}
        className="w-20 h-20 rounded-full flex items-center justify-center border-3"
        style={{
          background: 'hsl(var(--secondary) / 0.2)',
          borderColor: 'hsl(var(--secondary))',
          boxShadow: '0 0 40px hsl(var(--secondary) / 0.35), 0 0 80px hsl(var(--secondary) / 0.15)',
        }}
      >
        <motion.div
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Check className="w-10 h-10 text-secondary" strokeWidth={3} />
        </motion.div>
      </motion.div>
      {/* "Done!" text */}
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="absolute mt-28 text-sm font-black text-secondary"
      >
        Done! ✨
      </motion.span>
      {/* Expanding ring */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0.6 }}
        animate={{ scale: 3, opacity: 0 }}
        transition={{ duration: 0.7, delay: 0.2 }}
        className="absolute w-20 h-20 rounded-full border-2 border-secondary/40"
      />
    </motion.div>
  );
}

/* ════════════════════════════════════════════════
   PREMIUM ACTION BUTTONS — Two-step Complete + Next Open
   ════════════════════════════════════════════════ */
function PremiumActionButtons({ onComplete, onNextOpen }: { onComplete: () => void; onNextOpen: () => void }) {
  const [confirmStep, setConfirmStep] = useState<0 | 1>(0);
  const [nextOpenAnim, setNextOpenAnim] = useState(false);
  const [ripple, setRipple] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (confirmStep === 1) {
      confirmTimerRef.current = setTimeout(() => setConfirmStep(0), 3000);
      return () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); };
    }
  }, [confirmStep]);

  const handleCompleteTap = useCallback(() => {
    if (confirmStep === 0) {
      setConfirmStep(1);
    } else {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setRipple(true);
      setTimeout(() => { setRipple(false); setConfirmStep(0); onComplete(); }, 400);
    }
  }, [confirmStep, onComplete]);

  const handleNextOpenTap = useCallback(() => {
    setNextOpenAnim(true);
    setTimeout(() => { setNextOpenAnim(false); onNextOpen(); }, 700);
  }, [onNextOpen]);

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        {/* ── COMPLETE BUTTON — Ultra Premium ── */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280, delay: 0.05 }}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.02 }}
          onClick={handleCompleteTap}
          className={`flex-1 h-[58px] rounded-2xl border-2 flex items-center justify-center gap-3 font-black text-[14px] transition-all duration-300 relative overflow-hidden ${
            confirmStep === 1
              ? 'border-secondary text-secondary-foreground'
              : 'border-secondary/25 text-secondary hover:border-secondary/45'
          }`}
          style={{
            background: confirmStep === 1
              ? 'linear-gradient(135deg, hsl(var(--secondary)) 0%, hsl(var(--secondary)/0.85) 100%)'
              : 'linear-gradient(135deg, hsl(var(--secondary)/0.12) 0%, hsl(var(--secondary)/0.05) 100%)',
            boxShadow: confirmStep === 1
              ? '0 8px 32px hsl(var(--secondary)/0.35), 0 0 0 1px hsl(var(--secondary)/0.5), inset 0 1px 0 rgba(255,255,255,0.15)'
              : '0 4px 20px hsl(var(--secondary)/0.1), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Animated shimmer */}
          <motion.div className="absolute inset-0 pointer-events-none"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)', width: '50%' }} />

          {/* Ripple on confirm */}
          {ripple && (
            <motion.div initial={{ scale: 0, opacity: 0.5 }} animate={{ scale: 4, opacity: 0 }}
              transition={{ duration: 0.5 }} className="absolute w-16 h-16 rounded-full bg-white/20" />
          )}

          {/* Pulsing glow ring on confirm */}
          {confirmStep === 1 && (
            <motion.div className="absolute inset-[-2px] rounded-2xl"
              animate={{ opacity: [0.3, 0.7, 0.3], boxShadow: ['0 0 15px hsl(var(--secondary)/0.3)', '0 0 30px hsl(var(--secondary)/0.5)', '0 0 15px hsl(var(--secondary)/0.3)'] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }} />
          )}

          {/* Icon */}
          <motion.div
            animate={confirmStep === 1 ? { scale: [1, 1.25, 1], rotate: [0, -8, 8, 0] } : { scale: 1 }}
            transition={confirmStep === 1 ? { duration: 0.6, repeat: Infinity, repeatDelay: 0.8 } : {}}
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              confirmStep === 1 ? 'bg-white/20' : 'bg-secondary/15'
            }`}
          >
            <Check className="w-5 h-5" strokeWidth={3} />
          </motion.div>

          <AnimatePresence mode="wait">
            {confirmStep === 0 ? (
              <motion.span key="normal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                Complete ✅
              </motion.span>
            ) : (
              <motion.span key="confirm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }} className="flex items-center gap-1.5">
                Tap Again! <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.5, repeat: Infinity }}>🎯</motion.span>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* ── NEXT OPEN BUTTON — Ultra Premium ── */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280, delay: 0.12 }}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.02 }}
          onClick={handleNextOpenTap}
          disabled={nextOpenAnim}
          className="flex-1 h-[58px] rounded-2xl border-2 border-primary/25 hover:border-primary/45 flex items-center justify-center gap-3 font-black text-[14px] text-primary transition-all duration-300 relative overflow-hidden disabled:pointer-events-none"
          style={{
            background: nextOpenAnim
              ? 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.85) 100%)'
              : 'linear-gradient(135deg, hsl(var(--primary)/0.12) 0%, hsl(var(--primary)/0.05) 100%)',
            boxShadow: nextOpenAnim
              ? '0 8px 32px hsl(var(--primary)/0.35), inset 0 1px 0 rgba(255,255,255,0.15)'
              : '0 4px 20px hsl(var(--primary)/0.1), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Shimmer */}
          <motion.div className="absolute inset-0 pointer-events-none"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut', delay: 1 }}
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)', width: '50%' }} />

          <AnimatePresence mode="wait">
            {!nextOpenAnim ? (
              <motion.span key="normal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }} className="flex items-center gap-2">
                Next Open
                <motion.div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <CalendarDays className="w-5 h-5" strokeWidth={2} />
                </motion.div>
              </motion.span>
            ) : (
              <motion.span key="bye" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ type: 'spring', damping: 15 }}
                className="text-primary-foreground text-[13px] flex items-center gap-2">
                <motion.span animate={{ rotate: [0, 15, -10, 0] }} transition={{ duration: 0.5 }}>📅</motion.span>
                See you soon!
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Hint pills */}
      <div className="flex items-center justify-center gap-3 px-2">
        <span className="text-[9px] font-bold text-secondary/35 flex items-center gap-1"><Check className="w-2.5 h-2.5" /> Mark as done</span>
        <div className="w-px h-3 bg-border/15" />
        <span className="text-[9px] font-bold text-primary/35 flex items-center gap-1"><CalendarDays className="w-2.5 h-2.5" /> Next launch</span>
      </div>
    </div>
  );
}
