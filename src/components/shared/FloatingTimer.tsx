import { motion } from 'framer-motion';
import { useTimerTick } from '../../hooks/useGlobalTimer';
import type { GlobalTimerState } from '../../hooks/useGlobalTimer';

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface Props {
  timer: GlobalTimerState;
  onClick: () => void;
}

export default function FloatingTimer({ timer, onClick }: Props) {
  const { timeLeft, swTime } = useTimerTick();
  const isActive = timer.running || timer.swRunning;
  if (!isActive) return null;

  const display = timer.appMode === 'stopwatch' ? fmt(swTime) : fmt(timeLeft);
  const label = timer.topicName
    ? timer.topicName.length > 12 ? timer.topicName.slice(0, 11) + '…' : timer.topicName
    : timer.appMode === 'stopwatch' ? 'Stopwatch' : 'Focus';

  // Progress arc for timer mode
  const isTimer = timer.appMode === 'timer';
  const totalSec = timer.focusDuration * 60;
  const pct = isTimer ? Math.max(0, Math.min(100, ((totalSec - timeLeft) / totalSec) * 100)) : 0;
  const r = 24;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ - (pct / 100) * circ;

  return (
    <motion.button
      drag
      dragMomentum={false}
      onClick={onClick}
      className="fixed bottom-[12rem] right-4 lg:bottom-24 lg:right-6 z-[48] flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full border border-border/20 cursor-grab active:cursor-grabbing select-none"
      style={{
        background: 'hsl(var(--card) / 0.85)',
        boxShadow: '0 4px 20px hsl(var(--primary) / 0.15), 0 0 40px hsl(var(--primary) / 0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Mini progress ring */}
      <div className="relative w-10 h-10 shrink-0">
        <svg viewBox="0 0 52 52" className="w-full h-full -rotate-90">
          <circle cx="26" cy="26" r={r} fill="none" stroke="hsl(var(--muted) / 0.2)" strokeWidth="3" />
          {isTimer && (
            <circle cx="26" cy="26" r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.5s ease-out', filter: 'drop-shadow(0 0 4px hsl(var(--primary) / 0.4))' }} />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm">🍅</span>
      </div>

      <div className="flex flex-col items-start">
        <span className="text-xs font-black font-mono tracking-tight text-foreground">{display}</span>
        <span className="text-[9px] font-bold text-muted-foreground max-w-[70px] truncate">{label}</span>
      </div>

      {/* Pulse indicator */}
      <div className="w-2 h-2 rounded-full bg-secondary ml-1 shrink-0 animate-pulse" />
    </motion.button>
  );
}
