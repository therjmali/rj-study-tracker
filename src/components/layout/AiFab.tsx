import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, CheckCircle2, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { useConnectivity } from '@/platform/connectivity';
import { getAiSettings, isAiConfigured, subscribeAiSettings } from '@/platform/ai';
import { useSyncExternalStore } from 'react';

const HINT_KEY = 'rj-ai-fab-hint-v1';
const LONG_PRESS_MS = 420;

/**
 * The floating AI Tutor button (replaces the old "+"). Tap → AI Tutor.
 * Long-press → Quick Complete and Focus Timer (the two actions the old "+" held).
 * The corner dot shows the AI's readiness at a glance: green = ready, amber = offline, red = add a key.
 */
export default function AiFab({ onOpenAi, onOpenQuickComplete, onOpenPomodoro, timerRunning }: {
  onOpenAi: () => void; onOpenQuickComplete: () => void; onOpenPomodoro: () => void; timerRunning: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const conn = useConnectivity();
  const configured = useSyncExternalStore(subscribeAiSettings, () => isAiConfigured(getAiSettings()), () => false);
  const timer = useRef<number | null>(null);
  const longFired = useRef(false);

  const clear = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clear, []);
  useEffect(() => {
    if (!expanded) return;
    const id = window.setTimeout(() => setExpanded(false), 6000);
    return () => window.clearTimeout(id);
  }, [expanded]);
  useEffect(() => {
    try { if (localStorage.getItem(HINT_KEY)) return; } catch { return; }
    const id = window.setTimeout(() => {
      try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignore */ }
      toast('Tip: long-press the AI button for Quick Complete & Focus Timer', { duration: 6000 });
    }, 9000);
    return () => window.clearTimeout(id);
  }, []);

  const down = useCallback(() => {
    longFired.current = false;
    clear();
    timer.current = window.setTimeout(() => {
      longFired.current = true;
      try { navigator.vibrate?.(12); } catch { /* ignore */ }
      setExpanded(true);
    }, LONG_PRESS_MS);
  }, []);
  const up = useCallback(() => clear(), []);
  const click = useCallback(() => {
    if (longFired.current) { longFired.current = false; return; }
    if (expanded) { setExpanded(false); return; }
    onOpenAi();
  }, [expanded, onOpenAi]);

  const dot = !configured ? 'bg-red-500' : conn.status === 'online' ? 'bg-emerald-500' : 'bg-amber-500';
  const label = !configured ? 'AI Tutor — add a key to start' : conn.status === 'online' ? 'AI Tutor' : 'AI Tutor — offline';

  return (
    <div className="fixed bottom-[6rem] right-4 z-[55] flex flex-col items-center gap-2 lg:bottom-6 lg:right-6">
      <AnimatePresence>
        {expanded && (
          <>
            <motion.button
              key="qc" initial={{ opacity: 0, scale: 0.6, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6, y: 16 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28, mass: 0.6 }}
              onClick={() => { setExpanded(false); onOpenQuickComplete(); }}
              className="flex h-11 items-center gap-2 rounded-full bg-secondary pl-3 pr-4 text-secondary-foreground shadow-lg"
              aria-label="Quick Complete"
            ><CheckCircle2 className="h-5 w-5" /><span className="text-[12px] font-bold">Quick Complete</span></motion.button>
            <motion.button
              key="pomo" initial={{ opacity: 0, scale: 0.6, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6, y: 16 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28, mass: 0.6, delay: 0.04 }}
              onClick={() => { setExpanded(false); onOpenPomodoro(); }}
              className="flex h-11 items-center gap-2 rounded-full bg-accent pl-3 pr-4 text-accent-foreground shadow-lg"
              aria-label="Focus Timer"
            ><Timer className="h-5 w-5" /><span className="text-[12px] font-bold">{timerRunning ? 'Timer running' : 'Focus Timer'}</span></motion.button>
          </>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
        onContextMenu={e => e.preventDefault()}
        onClick={click}
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className="relative flex h-14 w-14 touch-manipulation select-none items-center justify-center rounded-[20px] bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
        style={{ boxShadow: '0 2px 8px hsl(var(--primary) / 0.28), 0 10px 26px -6px hsl(var(--primary) / 0.45)' }}
        aria-label={label} title={label}
      >
        <Bot className="h-6 w-6" />
        <span className={`absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${dot}`} />
        {timerRunning && <span className="absolute -left-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-background bg-amber-500" />}
      </motion.button>
    </div>
  );
}
