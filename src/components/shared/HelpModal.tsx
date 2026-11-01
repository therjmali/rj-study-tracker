import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { APP_VERSION } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SLIDES = [
  { icon: '📚', title: 'Welcome to RJ TRACKER Pro!', desc: `${APP_VERSION} — Your complete AI-powered study tracker for competitive exam preparation. Track subjects, topics, and your daily progress.` },
  { icon: '🎯', title: 'Syllabus Tracker', desc: 'Navigate to Syllabus tab to add subjects, units, and topics. Mark topics as complete, set difficulty and importance levels. Import syllabus in bulk.' },
  { icon: '🔥', title: 'Daily Tracker', desc: 'Log your daily study sessions with timestamps. Track hours, topics, mood, and build a streak. Use the calendar view for monthly overview.' },
  { icon: '🧠', title: 'Spaced Repetition', desc: 'The Revision tab uses SRS to schedule reviews. Customize intervals per difficulty in Settings. Review flashcards and track your memory retention.' },
  { icon: '⏱️', title: 'Focus Timer', desc: 'One timer with three modes — 🍅 Pomodoro (focus + breaks), ⏳ Countdown (one custom block) and ⏱️ Stopwatch (open-ended). Link a topic, control it from the notification, and your study time is auto-logged. It keeps running even if you close the app.' },
  { icon: '🪙', title: 'Study Coins & Store', desc: 'Earn 1 coin per 30 minutes of study. Spend coins in the Store to unlock accent themes, avatar borders, and celebration effects!' },
  { icon: '🎮', title: 'Gamification', desc: 'Earn XP, level up, unlock achievements, and climb weekly ranks. Check your progress in the Awards tab of your profile.' },
  { icon: '📱', title: 'Install as App', desc: 'RJ TRACKER works as a PWA! Install it on your phone for offline access and a native app experience.' },
];

export default function HelpModal({ open, onClose }: Props) {
  const [slide, setSlide] = useState(0);

  if (!open) return null;

  const isLast = slide === SLIDES.length - 1;
  const current = SLIDES[slide];

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xl flex items-center justify-center p-4"
        onClick={onClose}>
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          className="w-full max-w-sm bg-card border border-border/30 rounded-3xl p-7 shadow-2xl relative overflow-hidden"
          onClick={e => e.stopPropagation()}>

          {/* Decorative gradient blob */}
          <div className="absolute -top-20 -right-20 w-48 h-48 bg-primary/8 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-accent/8 rounded-full blur-3xl pointer-events-none" />

          <button onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-muted/40 flex items-center justify-center hover:bg-muted/60 transition-colors z-10"
            aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="text-center relative z-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={slide}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}>
                <span className="text-5xl block mb-5">{current.icon}</span>
                <h3 className="text-lg font-black text-foreground mb-2.5">{current.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed min-h-[60px]">{current.desc}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Step indicator */}
          <div className="flex justify-center gap-1.5 mt-7 relative z-10">
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => setSlide(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === slide ? 'bg-primary w-7' : 'bg-muted-foreground/20 w-1.5 hover:bg-muted-foreground/40'}`}
                aria-label={`Go to slide ${i + 1}`} />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 relative z-10">
            <Button variant="ghost" size="sm" onClick={() => setSlide(Math.max(0, slide - 1))}
              disabled={slide === 0} className="gap-1 text-xs font-semibold">
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
            <span className="text-[10px] text-muted-foreground font-mono font-semibold">{slide + 1} / {SLIDES.length}</span>
            {isLast ? (
              <Button size="sm" onClick={onClose} className="gap-1 text-xs font-bold px-5">
                Get Started 🚀
              </Button>
            ) : (
              <Button size="sm" onClick={() => setSlide(slide + 1)} className="gap-1 text-xs font-bold">
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
