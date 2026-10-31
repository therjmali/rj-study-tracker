import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Square, RotateCcw, Timer, Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import BottomSheet from '../shared/BottomSheet';

type TimerMode = 'stopwatch' | 'countdown';

interface Props {
  open: boolean;
  onClose: () => void;
  topicName: string;
  currentTimeSpent: number; // minutes already tracked
  onSaveTime: (addedMinutes: number) => void;
}

export default function TopicTimerSheet({ open, onClose, topicName, currentTimeSpent, onSaveTime }: Props) {
  const [mode, setMode] = useState<TimerMode>('stopwatch');
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0); // for stopwatch
  const [countdownTotal, setCountdownTotal] = useState(30 * 60); // seconds
  const [countdownRemaining, setCountdownRemaining] = useState(30 * 60); // seconds
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setRunning(false);
      setElapsedMs(0);
      setCountdownRemaining(countdownTotal);
      pausedElapsedRef.current = 0;
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [open]);

  const startStopwatch = useCallback(() => {
    startTimeRef.current = Date.now();
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setElapsedMs(pausedElapsedRef.current + (Date.now() - startTimeRef.current));
    }, 100);
  }, []);

  const startCountdown = useCallback(() => {
    startTimeRef.current = Date.now();
    setRunning(true);
    const startRemaining = countdownRemaining;
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const remaining = Math.max(0, startRemaining - elapsed);
      setCountdownRemaining(remaining);
      if (remaining <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setRunning(false);
        // Vibrate / notify
        navigator.vibrate?.([200, 100, 200]);
        toast.success(`⏱️ Countdown finished for "${topicName}"!`);
      }
    }, 100);
  }, [countdownRemaining, topicName]);

  const handleStart = () => {
    if (mode === 'stopwatch') startStopwatch();
    else startCountdown();
  };

  const handlePause = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    if (mode === 'stopwatch') {
      pausedElapsedRef.current = elapsedMs;
    }
  };

  const handleReset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    if (mode === 'stopwatch') {
      setElapsedMs(0);
      pausedElapsedRef.current = 0;
    } else {
      setCountdownRemaining(countdownTotal);
    }
  };

  const handleSave = () => {
    let totalSeconds: number;
    if (mode === 'stopwatch') {
      totalSeconds = Math.floor(elapsedMs / 1000);
    } else {
      totalSeconds = countdownTotal - Math.floor(countdownRemaining);
    }
    const addedMinutes = Math.max(1, Math.round(totalSeconds / 60));
    if (totalSeconds < 10) {
      toast.error('Timer too short to save (min 10 seconds)');
      return;
    }
    onSaveTime(addedMinutes);
    toast.success(`⏱️ Added ${addedMinutes}m to "${topicName}"`);
    handleReset();
    onClose();
  };

  const handleStop = () => {
    handlePause();
    // Auto-save prompt
  };

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const adjustCountdown = (delta: number) => {
    if (running) return;
    const newTotal = Math.max(60, Math.min(3600, countdownTotal + delta));
    setCountdownTotal(newTotal);
    setCountdownRemaining(newTotal);
  };

  const countdownPct = countdownTotal > 0 ? ((countdownTotal - countdownRemaining) / countdownTotal) * 100 : 0;
  const hasTime = mode === 'stopwatch' ? elapsedMs > 10000 : (countdownTotal - countdownRemaining) > 10;

  return (
    <BottomSheet open={open} onClose={() => { handlePause(); onClose(); }} zIndex={60}>
      <div className="space-y-4 pb-2">
        {/* Header */}
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">⏱️ Topic Timer</p>
          <p className="text-sm font-black text-foreground mt-1 break-words px-4">{topicName}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Already tracked: <span className="font-mono font-bold text-primary">{currentTimeSpent}m</span>
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 justify-center">
          <button onClick={() => { if (!running) setMode('stopwatch'); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
              mode === 'stopwatch'
                ? 'bg-cyan-500/20 text-cyan-500 border-cyan-500/40'
                : 'bg-card border-border/20 text-muted-foreground hover:bg-muted/50'
            }`}>
            <Timer className="w-3.5 h-3.5" /> Stopwatch
          </button>
          <button onClick={() => { if (!running) { setMode('countdown'); setCountdownRemaining(countdownTotal); } }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
              mode === 'countdown'
                ? 'bg-amber-500/20 text-amber-500 border-amber-500/40'
                : 'bg-card border-border/20 text-muted-foreground hover:bg-muted/50'
            }`}>
            <Clock className="w-3.5 h-3.5" /> Countdown
          </button>
        </div>

        {/* Timer Display */}
        <div className="relative flex flex-col items-center justify-center py-6">
          {/* Background ring for countdown */}
          {mode === 'countdown' && (
            <svg className="absolute w-44 h-44" viewBox="0 0 176 176">
              <circle cx="88" cy="88" r="80" fill="none" stroke="hsl(var(--muted)/0.2)" strokeWidth="6" />
              <circle cx="88" cy="88" r="80" fill="none" stroke="hsl(var(--primary))" strokeWidth="6"
                strokeDasharray={2 * Math.PI * 80} strokeDashoffset={2 * Math.PI * 80 * (1 - countdownPct / 100)}
                strokeLinecap="round" transform="rotate(-90 88 88)" className="transition-all duration-200" />
            </svg>
          )}

          {mode === 'stopwatch' ? (
            <motion.p key="sw" initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className={`text-5xl font-black font-mono tracking-tight z-10 ${running ? 'text-cyan-500' : 'text-foreground'}`}>
              {formatTime(elapsedMs)}
            </motion.p>
          ) : (
            <div className="flex flex-col items-center z-10">
              {!running && (
                <div className="flex items-center gap-3 mb-2">
                  <button onClick={() => adjustCountdown(-60)} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 active:scale-90">
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <span className="text-[10px] text-muted-foreground font-bold">{Math.floor(countdownTotal / 60)}m</span>
                  <button onClick={() => adjustCountdown(60)} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 active:scale-90">
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              )}
              <motion.p key="cd" initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                className={`text-5xl font-black font-mono tracking-tight ${
                  countdownRemaining <= 10 ? 'text-destructive animate-pulse' : running ? 'text-amber-500' : 'text-foreground'
                }`}>
                {formatCountdown(countdownRemaining)}
              </motion.p>
            </div>
          )}

          {/* Quick presets for countdown */}
          {mode === 'countdown' && !running && (
            <div className="flex gap-2 mt-3 z-10 items-center flex-wrap justify-center">
              {[30, 60].map(m => (
                <button key={m} onClick={() => { setCountdownTotal(m * 60); setCountdownRemaining(m * 60); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    countdownTotal === m * 60 ? 'bg-amber-500/20 text-amber-500 border-amber-500/30' : 'bg-card border-border/20 text-muted-foreground hover:bg-muted/50'
                  }`}>
                  {m}m
                </button>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={180}
                  placeholder="Custom"
                  className="w-16 h-8 rounded-lg border border-border/30 bg-card text-center text-xs font-mono text-foreground focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const val = parseInt((e.target as HTMLInputElement).value);
                      if (val > 0 && val <= 180) { setCountdownTotal(val * 60); setCountdownRemaining(val * 60); }
                    }
                  }}
                  onBlur={e => {
                    const val = parseInt(e.target.value);
                    if (val > 0 && val <= 180) { setCountdownTotal(val * 60); setCountdownRemaining(val * 60); }
                  }}
                />
                <span className="text-[10px] text-muted-foreground font-bold">min</span>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="icon" onClick={handleReset} disabled={running}
            className="w-12 h-12 rounded-full">
            <RotateCcw className="w-5 h-5" />
          </Button>

          {!running ? (
            <motion.button whileTap={{ scale: 0.9 }} onClick={handleStart}
              className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
                mode === 'stopwatch'
                  ? 'bg-cyan-500 text-white shadow-cyan-500/30 hover:bg-cyan-600'
                  : 'bg-amber-500 text-white shadow-amber-500/30 hover:bg-amber-600'
              }`}>
              <Play className="w-7 h-7 ml-0.5" />
            </motion.button>
          ) : (
            <motion.button whileTap={{ scale: 0.9 }} onClick={handlePause}
              className="w-16 h-16 rounded-full bg-muted flex items-center justify-center shadow-lg hover:bg-muted/80">
              <Pause className="w-7 h-7 text-foreground" />
            </motion.button>
          )}

          <Button variant="outline" size="icon" onClick={handleStop} disabled={!hasTime || running}
            className="w-12 h-12 rounded-full">
            <Square className="w-5 h-5" />
          </Button>
        </div>

        {/* Save Button */}
        {hasTime && !running && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Button onClick={handleSave} className="w-full h-11 text-sm font-bold gap-2 rounded-xl">
              💾 Save {mode === 'stopwatch' ? formatTime(elapsedMs) : `${Math.round((countdownTotal - countdownRemaining) / 60)}m`} to Topic
            </Button>
          </motion.div>
        )}
      </div>
    </BottomSheet>
  );
}
