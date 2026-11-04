import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Calendar, Clock, StickyNote, Timer, Play } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { toast } from 'sonner';
import BottomSheet from '../shared/BottomSheet';

interface Props {
  open: boolean;
  onClose: () => void;
  subjectName: string;
  unitName: string;
  totalTimeSpent: number;
  onLogTime?: (minutes: number, date: string, note: string) => void;
  onOpenFullTimer?: () => void;
}

function getLocalDateStr(d: Date = new Date()): string {
  return d.toISOString().split('T')[0];
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtTime(m: number): string {
  if (m <= 0) return '0 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h`;
}

export default function StudyTimeLogger({ open, onClose, subjectName, unitName, totalTimeSpent, onLogTime, onOpenFullTimer }: Props) {
  const [logDate, setLogDate] = useState(() => getLocalDateStr());
  const [addedMinutes, setAddedMinutes] = useState(0);
  const [note, setNote] = useState('');
  const [overrideTotal, setOverrideTotal] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const isToday = logDate === getLocalDateStr();

  const handleAdd = useCallback((mins: number) => {
    navigator.vibrate?.(20);
    setAddedMinutes(prev => prev + mins);
    toast(`+${mins}m added`, { duration: 1000, icon: '⏱️' });
  }, []);

  const handleReset = useCallback(() => {
    navigator.vibrate?.([15, 30, 15]);
    setAddedMinutes(0);
    setNote('');
    setOverrideTotal('');
    setCustomOpen(false);
    toast('Reset', { duration: 800, icon: '↺' });
  }, []);

  const handleCustomAdd = useCallback(() => {
    const v = parseInt(customValue, 10);
    if (!isNaN(v) && v > 0 && v <= 600) {
      handleAdd(v);
      setCustomValue('');
      setCustomOpen(false);
    }
  }, [customValue, handleAdd]);

  const handleSave = useCallback(() => {
    const totalMins = overrideTotal ? parseInt(overrideTotal, 10) : addedMinutes;
    if (totalMins <= 0) {
      toast.error('Add some time first');
      return;
    }
    navigator.vibrate?.([20, 40, 20]);
    onLogTime?.(totalMins, logDate, note);
    toast.success(`Logged ${fmtTime(totalMins)} for ${unitName}`, { icon: '✅' });
    setAddedMinutes(0);
    setNote('');
    setOverrideTotal('');
    onClose();
  }, [addedMinutes, overrideTotal, logDate, note, unitName, onLogTime, onClose]);

  const displayTotal = overrideTotal ? parseInt(overrideTotal, 10) || 0 : addedMinutes;

  return (
    <BottomSheet open={open} onClose={onClose} title="⏱️ Study Time">
      <div className="space-y-4">
        {/* ── Top Row: Timer Button + Total Time ── */}
        <div className="flex items-center gap-3">
          {/* Timer/Stopwatch launch button */}
          {onOpenFullTimer && (
            <button
              onClick={() => { onClose(); onOpenFullTimer(); }}
              className="flex-1 flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-border/20 bg-card/50 hover:bg-card/80 transition-all active:scale-[0.98]"
            >
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Play className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">⏱️ Focus Timer</p>
                <p className="text-[10px] font-bold text-muted-foreground">Countdown · Stopwatch</p>
              </div>
            </button>
          )}

          {/* Total time display */}
          <div className="flex-1 flex flex-col items-center px-4 py-3 rounded-2xl border border-border/20 bg-card/50">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">TOTAL TIME</span>
            </div>
            <motion.p
              key={totalTimeSpent + addedMinutes}
              initial={{ scale: 1.1, opacity: 0.7 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-lg font-black font-mono text-foreground mt-0.5"
            >
              {fmtTime(totalTimeSpent + displayTotal)}
            </motion.p>
          </div>
        </div>

        {/* ── Subject / Unit Context ── */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/10 border border-border/10">
          <Timer className="w-3.5 h-3.5 text-primary shrink-0" />
          <p className="text-xs font-bold text-foreground break-words">{subjectName}</p>
          <span className="text-muted-foreground">·</span>
          <p className="text-xs text-muted-foreground break-words flex-1">{unitName}</p>
        </div>

        {/* ── LOG STUDY TIME Section ── */}
        <div className="rounded-2xl border border-border/15 bg-card/30 p-4 space-y-4">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <h3 className="text-xs font-black text-foreground uppercase tracking-wider">LOG STUDY TIME</h3>
            {addedMinutes > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-auto text-xs font-black font-mono text-primary px-2 py-0.5 rounded-lg bg-primary/10"
              >
                Total: {fmtTime(displayTotal)}
              </motion.span>
            )}
          </div>

          {/* Date Picker Row */}
          <div className="flex items-center gap-2 p-3 rounded-xl border border-border/15 bg-card/40">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground">Logging for:</span>
            <input
              type="date"
              value={logDate}
              onChange={e => setLogDate(e.target.value)}
              max={getLocalDateStr()}
              className="flex-1 text-sm font-black font-mono text-foreground bg-transparent border-none outline-none cursor-pointer"
            />
            {!isToday && (
              <button
                onClick={() => setLogDate(getLocalDateStr())}
                className="text-[10px] font-bold text-primary px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors active:scale-95"
              >
                Today
              </button>
            )}
            {isToday && (
              <span className="text-[10px] font-bold text-secondary px-2 py-1 rounded-lg bg-secondary/10">Today</span>
            )}
          </div>

          {/* Quick-Add Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="w-10 h-10 rounded-xl border border-border/20 bg-card/40 flex items-center justify-center hover:bg-destructive/10 hover:border-destructive/20 transition-all active:scale-90"
              title="Reset"
            >
              <RotateCcw className="w-4 h-4 text-muted-foreground" />
            </button>
            {[10, 30, 60].map(mins => (
              <motion.button
                key={mins}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleAdd(mins)}
                className="flex-1 h-10 rounded-xl border border-primary/15 bg-primary/5 hover:bg-primary/12 transition-all text-sm font-black text-primary"
              >
                +{mins >= 60 ? `${mins / 60}h` : `${mins}m`}
              </motion.button>
            ))}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setCustomOpen(!customOpen)}
              className={`flex-1 h-10 rounded-xl border transition-all text-sm font-bold flex items-center justify-center gap-1 ${
                customOpen ? 'border-chart-4/30 bg-chart-4/10 text-chart-4' : 'border-border/20 bg-card/40 text-muted-foreground hover:bg-card/60'
              }`}
            >
              <span className="text-xs">✏️</span> Custom
            </motion.button>
          </div>

          {/* Custom Time Input */}
          <AnimatePresence>
            {customOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={customValue}
                    onChange={e => setCustomValue(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Minutes..."
                    className="flex-1 h-9 text-sm font-mono bg-card/50 border-border/20 rounded-xl"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleCustomAdd()}
                  />
                  <button
                    onClick={handleCustomAdd}
                    disabled={!customValue || isNaN(parseInt(customValue, 10)) || parseInt(customValue, 10) <= 0}
                    className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 active:scale-95 transition-all"
                  >
                    Add
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Note Field */}
          <div className="relative">
            <StickyNote className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Note (optional)..."
              className="h-10 pl-9 text-sm bg-card/40 border-border/15 rounded-xl"
            />
          </div>

          {/* Override Total */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/10 bg-card/20">
            <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Override total</span>
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={overrideTotal}
              onChange={e => setOverrideTotal(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder={String(addedMinutes)}
              className="flex-1 h-8 text-center text-sm font-black font-mono bg-card/40 border-border/15 rounded-lg"
            />
            <span className="text-xs font-semibold text-muted-foreground">min</span>
          </div>
        </div>

        {/* ── Save Button ── */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          disabled={displayTotal <= 0}
          className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-all shadow-lg"
          style={{ boxShadow: displayTotal > 0 ? '0 4px 20px hsl(var(--primary) / 0.25)' : undefined }}
        >
          <Clock className="w-4 h-4" />
          {displayTotal > 0 ? `Log ${fmtTime(displayTotal)}` : 'Add time to log'}
        </motion.button>
      </div>
    </BottomSheet>
  );
}
