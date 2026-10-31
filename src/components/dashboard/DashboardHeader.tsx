import { useMemo, useState } from 'react';
import { Flame, Target, Trophy, Quote, RefreshCw, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Subject, CustomQuote, DailyLog, DbStudySession } from '../../types';
import { useStreak } from '../../hooks/useStreak';
import HeroClock from './HeroClock';
import { getAllActiveQuotes } from '../../lib/quotes';
import { getGreeting } from '../../lib/dayPeriods';

const greetings = () => getGreeting(new Date().getHours());

interface Props {
  subjects?: Subject[];
  dailyLogs?: DailyLog[];
  dbSessions?: DbStudySession[];
}

export default function DashboardHeader({ subjects = [], dailyLogs = [], dbSessions }: Props) {
  const QUOTES = useMemo(() => {
    try {
      const raw = localStorage.getItem('nursing-settings-v2');
      if (!raw) return getAllActiveQuotes();
      const s = JSON.parse(raw);
      return getAllActiveQuotes(s.customQuotes, s.hiddenBuiltInQuotes, s.builtInQuoteOverrides);
    } catch { return getAllActiveQuotes(); }
  }, []);

  const [quoteIdx, setQuoteIdx] = useState(() => {
    const d = new Date();
    return (d.getFullYear() * 366 + d.getMonth() * 31 + d.getDate()) % QUOTES.length;
  });

  // Use unified streak calculation (includes dailyLogs + topic completions + sessions)
  const streakData = useStreak(subjects, dailyLogs, dbSessions);
  const streak = streakData.current;
  const todayCount = streakData.todayDone;
  const { totalDone, totalAll } = useMemo(() => {
    let totalDone = 0, totalAll = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      totalAll++;
      if (t.completed) totalDone++;
    })));
    return { totalDone, totalAll };
  }, [subjects]);

  const g = greetings();
  const quote = QUOTES[quoteIdx];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-2"
    >
      {/* ── Full-width premium live clock + date ── */}
      <HeroClock />

      {/* ── Merged Greeting + Quote shelf ── */}
      <div className="glass-card glass-tint-primary overflow-hidden relative">
        {/* Decorative quote icon */}
        <div className="absolute top-2 right-3 opacity-[0.04] pointer-events-none">
          <Quote className="w-16 h-16 text-primary" />
        </div>

        <div className="p-4 relative">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            {/* Left: Greeting + badges */}
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-lg font-black text-foreground flex items-center gap-1.5 leading-tight">
                {g.text} {g.emoji}
              </h1>
              <p className="text-[10px] text-muted-foreground/70 italic font-medium mt-0.5">
                {g.sub}
              </p>

              {/* Quick stat badges */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {streak > 0 && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-chart-4/10 border border-chart-4/20"
                  >
                    <Flame className="w-3 h-3 text-chart-4" />
                    <span className="text-[10px] font-black text-chart-4 font-mono">{streak}d streak</span>
                  </motion.div>
                )}
                {todayCount > 0 && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/10 border border-secondary/20"
                  >
                    <Target className="w-3 h-3 text-secondary" />
                    <span className="text-[10px] font-bold text-secondary font-mono">{todayCount} today</span>
                  </motion.div>
                )}
                {totalAll > 0 && totalDone >= totalAll && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20"
                  >
                    <Trophy className="w-3 h-3 text-accent" />
                    <span className="text-[10px] font-bold text-accent">All done! 🎉</span>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Right: Motivational Quote */}
            <div className="sm:max-w-[52%] sm:text-right relative flex-shrink-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={quoteIdx}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                >
                  <p className="text-[12px] leading-relaxed text-foreground/80 font-medium italic">
                    "{quote.text}"
                  </p>
                  <p className="text-[9px] text-muted-foreground font-semibold mt-1 flex items-center gap-1 sm:justify-end">
                    — {quote.author}
                    {quote.isCustom && <Sparkles className="w-2 h-2 text-chart-4 inline" />}
                  </p>
                </motion.div>
              </AnimatePresence>
              <button
                onClick={() => setQuoteIdx(prev => (prev + 1) % QUOTES.length)}
                className="mt-1.5 sm:ml-auto w-5 h-5 rounded-md bg-muted/30 flex items-center justify-center hover:bg-muted/50 transition-colors active:scale-90"
                aria-label="New quote"
              >
                <RefreshCw className="w-2.5 h-2.5 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
