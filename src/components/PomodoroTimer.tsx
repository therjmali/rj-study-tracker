import { useMemo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, Coffee, Brain, Zap, Square, BookOpen, Flame, Clock } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { useTimer } from '../contexts/TimerContext';
import { useTimerTick } from '../hooks/useGlobalTimer';
import type { PomodoroSettings, Subject } from '../types';
import type { TimerPhase } from '../hooks/useGlobalTimer';

const LABELS: Record<TimerPhase, { label: string; icon: React.ReactNode; color: string; stroke: string }> = {
  focus: { label: 'Focus', icon: <Brain className="w-4 h-4" />, color: 'text-primary', stroke: 'hsl(var(--primary))' },
  short: { label: 'Short Break', icon: <Coffee className="w-4 h-4" />, color: 'text-secondary', stroke: 'hsl(var(--secondary))' },
  long: { label: 'Long Break', icon: <Zap className="w-4 h-4" />, color: 'text-accent', stroke: 'hsl(var(--accent))' },
};

const PRESETS = [
  { label: '25m', value: 25 },
  { label: '30m', value: 30 },
  { label: '45m', value: 45 },
  { label: '1h', value: 60 },
];

interface Props {
  onSessionComplete: (data: { minutes: number; subjectId?: string; unitId?: string; topicId?: string }) => void;
  settings: PomodoroSettings;
  subjects?: Subject[];
  initialSubjectId?: string;
  initialUnitId?: string;
  initialTopicId?: string;
}

export default function PomodoroTimer({ settings, subjects = [], initialSubjectId, initialUnitId, initialTopicId }: Props) {
  const { state: timer, actions } = useTimer();
  const { timeLeft, swTime } = useTimerTick();
  const initDone = useRef(false);
  const [sessionLog, setSessionLog] = useState<{ time: string; mins: number; subject: string }[]>(() => {
    try {
      const saved = sessionStorage.getItem('pomodoro-sessions-today');
      if (saved) {
        const data = JSON.parse(saved);
        const today = new Date().toDateString();
        if (data.date === today) return data.sessions;
      }
    } catch {}
    return [];
  });

  // Pre-fill on mount when launched from a topic
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    if (initialSubjectId) {
      const s = subjects.find(x => x.id === initialSubjectId);
      const u = initialUnitId ? s?.units.find(x => x.id === initialUnitId) : undefined;
      const t = initialTopicId ? u?.subTopics.find(x => x.id === initialTopicId) : undefined;
      actions.linkTopic(initialSubjectId, initialUnitId || '', initialTopicId || '', t?.name || '', s?.name || '');
    }
  }, []);

  // Track completed sessions
  useEffect(() => {
    if (timer.sessions > 0) {
      const newEntry = {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mins: timer.focusDuration,
        subject: timer.subjectName || 'General',
      };
      setSessionLog(prev => {
        const updated = [...prev, newEntry];
        try {
          sessionStorage.setItem('pomodoro-sessions-today', JSON.stringify({ date: new Date().toDateString(), sessions: updated }));
        } catch {}
        return updated;
      });
    }
  }, [timer.sessions]);

  const selectedSubject = useMemo(() => subjects.find(s => s.id === timer.subjectId), [subjects, timer.subjectId]);
  const selectedUnit = useMemo(() => selectedSubject?.units.find(u => u.id === timer.unitId), [selectedSubject, timer.unitId]);

  const studyingLabel = useMemo(() => {
    if (timer.topicName && timer.subjectName) return `${timer.topicName} — ${timer.subjectName}`;
    if (timer.subjectName) return timer.subjectName;
    return '';
  }, [timer.topicName, timer.subjectName]);

  const isPreLinked = !!(initialSubjectId && initialTopicId);
  const isActive = timer.running || timer.swRunning;
  const isStopwatch = timer.appMode === 'stopwatch';

  // Unified ring calculations
  const durations = {
    focus: timer.focusDuration * 60,
    short: settings.shortBreakMin * 60,
    long: settings.longBreakMin * 60,
  };
  const totalTime = durations[timer.phase];
  const timerPct = isStopwatch
    ? Math.min(100, (swTime / 3600) * 100) // cap at 1hr for visual
    : ((totalTime - timeLeft) / totalTime) * 100;

  const displayTime = isStopwatch ? swTime : timeLeft;
  const hrs = Math.floor(displayTime / 3600);
  const mins = Math.floor((displayTime % 3600) / 60);
  const secs = displayTime % 60;

  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (timerPct / 100) * circumference;
  const totalFocusMins = timer.sessions * timer.focusDuration;

  const strokeColor = isStopwatch ? 'hsl(var(--primary))' : LABELS[timer.phase].stroke;
  const subjectColor = selectedSubject?.color;

  const handleSubjectChange = (id: string) => {
    const s = subjects.find(x => x.id === id);
    actions.setSubjectId(id);
    if (s) actions.setSubjectName(s.name);
  };

  const handleUnitChange = (id: string) => { actions.setUnitId(id); };
  const handleTopicChange = (id: string) => {
    const t = selectedUnit?.subTopics.find(x => x.id === id);
    actions.setTopicId(id, t?.name);
  };

  return (
    <div className="space-y-4">
      {/* Subject/Topic Link */}
      {subjects.length > 0 && (
        isPreLinked ? (
          <div className="rounded-xl border bg-card/50 p-3" style={{ borderColor: subjectColor ? subjectColor + '30' : undefined }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border" style={{ backgroundColor: (subjectColor || 'hsl(var(--primary))') + '15', borderColor: (subjectColor || 'hsl(var(--primary))') + '25' }}>
                <BookOpen className="w-4 h-4" style={{ color: subjectColor || 'hsl(var(--primary))' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Studying</p>
                <p className="text-sm font-black text-foreground truncate">{studyingLabel}</p>
                {selectedUnit && <p className="text-[10px] text-muted-foreground truncate">📂 {selectedUnit.name}</p>}
              </div>
            </div>
          </div>
        ) : (
          <SubjectSelector
            subjects={subjects}
            subjectId={timer.subjectId}
            unitId={timer.unitId}
            topicId={timer.topicId}
            selectedSubject={selectedSubject}
            selectedUnit={selectedUnit}
            studyingLabel={studyingLabel}
            onSubjectChange={handleSubjectChange}
            onUnitChange={handleUnitChange}
            onTopicChange={handleTopicChange}
          />
        )
      )}

      {/* ═══ UNIFIED CIRCULAR RING ═══ */}
      <div className="flex justify-center">
        <div className="relative w-56 h-56">
          {/* Glow effect when running */}
          {isActive && (
            <motion.div
              className="absolute inset-[-8px] rounded-full"
              animate={{ opacity: [0.15, 0.35, 0.15], scale: [0.97, 1.02, 0.97] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ background: `radial-gradient(circle, ${subjectColor || strokeColor}30 0%, transparent 70%)` }}
            />
          )}

          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            {/* Background ring */}
            <circle cx="60" cy="60" r="54" fill="none" stroke="hsl(var(--muted) / 0.15)" strokeWidth="5" />
            {/* Progress ring */}
            <motion.circle cx="60" cy="60" r="54" fill="none"
              stroke={subjectColor || strokeColor}
              strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              className="transition-all duration-300"
              style={{ filter: isActive ? `drop-shadow(0 0 8px ${subjectColor || strokeColor})` : 'none' }}
            />
            {/* Tick marks */}
            {[0, 90, 180, 270].map(deg => (
              <line key={deg} x1="60" y1="3" x2="60" y2="6"
                transform={`rotate(${deg} 60 60)`}
                stroke="hsl(var(--muted-foreground) / 0.2)" strokeWidth="1" />
            ))}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {/* Mode pill switcher inside ring */}
            <div className="flex rounded-full border border-border/20 bg-card/60 backdrop-blur-sm p-0.5 mb-2">
              <button onClick={() => actions.setAppMode('timer')}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${timer.appMode === 'timer' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                Timer
              </button>
              <button onClick={() => actions.setAppMode('stopwatch')}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${timer.appMode === 'stopwatch' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                Stopwatch
              </button>
            </div>

            {/* Time display */}
            <span className="text-4xl font-black font-mono text-foreground leading-none tracking-tight">
              {hrs > 0 && `${String(hrs).padStart(2, '0')}:`}{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>

            {/* Phase label / mode label */}
            <span className={`text-xs font-bold mt-1.5 ${isStopwatch ? 'text-primary' : LABELS[timer.phase].color}`}>
              {isStopwatch ? 'Stopwatch' : LABELS[timer.phase].label}
            </span>

            {/* Session streak */}
            {timer.sessions > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <Flame className="w-3 h-3 text-chart-4" />
                <span className="text-[10px] font-black text-chart-4">{timer.sessions}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timer Presets (only in timer mode) */}
      {!isStopwatch && (
        <>
          <div className="flex gap-2 items-center justify-center">
            {PRESETS.map(p => (
              <button key={p.value} onClick={() => actions.selectPreset(p.value)}
                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${timer.focusDuration === p.value ? 'bg-primary/20 text-primary border-primary/40 shadow-sm' : 'bg-card/30 text-foreground/70 border-border/20 hover:bg-card/50'}`}>
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <Input type="number" min={1} max={180} value={timer.customMinutes} onChange={e => actions.setCustomMinutes(+e.target.value)}
                onBlur={() => actions.applyCustom()} onKeyDown={e => e.key === 'Enter' && actions.applyCustom()}
                className="w-14 h-9 text-sm font-bold text-center bg-card/40 border-border/20" />
              <span className="text-xs font-bold text-foreground/50">m</span>
            </div>
          </div>

          {/* Phase Switcher */}
          <div className="flex justify-center gap-2">
            {(['focus', 'short', 'long'] as TimerPhase[]).map(m => (
              <Button key={m} variant={timer.phase === m ? 'default' : 'outline'} size="sm" onClick={() => actions.switchPhase(m)}
                className="gap-1.5 text-xs font-bold">
                {LABELS[m].icon} {LABELS[m].label}
              </Button>
            ))}
          </div>
        </>
      )}

      {/* Controls */}
      <div className="flex justify-center gap-3">
        <Button variant="outline" size="icon" onClick={() => isStopwatch ? actions.resetSw() : actions.resetTimer()} className="w-12 h-12 rounded-xl">
          <RotateCcw className="w-5 h-5" />
        </Button>
        <Button size="lg" onClick={() => isStopwatch ? actions.toggleSw() : actions.toggleTimer()}
          className="gap-2 px-10 h-12 text-base font-bold rounded-xl"
          style={subjectColor ? { backgroundColor: subjectColor, color: '#fff' } : undefined}>
          {isActive ? <><Pause className="w-5 h-5" /> Pause</> : <><Play className="w-5 h-5" /> Start</>}
        </Button>
        {isStopwatch && swTime > 0 && !timer.swRunning && (
          <Button variant="destructive" size="icon" onClick={() => actions.stopSw()} className="w-12 h-12 rounded-xl">
            <Square className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Stopwatch log hint */}
      {isStopwatch && swTime >= 60 && !timer.swRunning && (
        <p className="text-center text-sm font-bold text-secondary">
          ✅ Press ■ Stop to log {Math.round(swTime / 60)}min
        </p>
      )}

      {/* ═══ SESSION STATS ═══ */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox icon="🍅" value={`${timer.sessions}`} label="Sessions" />
        <StatBox icon="⏱️" value={`${Math.round(totalFocusMins / 60 * 10) / 10}h`} label="Focus" />
        <StatBox icon="🔥" value={`${totalFocusMins}m`} label="Total" />
      </div>

      {/* ═══ TODAY'S SESSION TIMELINE ═══ */}
      {sessionLog.length > 0 && (
        <div className="rounded-xl border border-border/15 bg-card/30 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold text-foreground/70">Today&apos;s Sessions</span>
            <span className="text-[9px] font-bold text-primary ml-auto">{sessionLog.length} sessions</span>
          </div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto scrollbar-hide">
            {sessionLog.slice(-8).map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground font-mono w-12">{s.time}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span className="font-bold text-foreground truncate">{s.subject}</span>
                <span className="font-mono text-muted-foreground ml-auto">{s.mins}m</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border/15 bg-card/30 p-3 text-center">
      <span className="text-sm">{icon}</span>
      <p className="text-xl font-black font-mono text-foreground leading-none mt-0.5">{value}</p>
      <p className="text-[10px] font-bold text-foreground/60 mt-0.5">{label}</p>
    </div>
  );
}

function SubjectSelector({ subjects, subjectId, unitId, topicId, selectedSubject, selectedUnit, studyingLabel, onSubjectChange, onUnitChange, onTopicChange }: {
  subjects: Subject[];
  subjectId: string; unitId: string; topicId: string;
  selectedSubject?: Subject; selectedUnit?: import('../types').Unit;
  studyingLabel: string;
  onSubjectChange: (id: string) => void;
  onUnitChange: (id: string) => void;
  onTopicChange: (id: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border/20 bg-card/30 p-3">
      <p className="text-xs font-bold text-foreground/80">📚 Link to Subject & Topic</p>
      <Select value={subjectId} onValueChange={onSubjectChange}>
        <SelectTrigger className="h-9 text-sm font-semibold bg-card/50 border-border/20">
          <SelectValue placeholder="Select Subject..." />
        </SelectTrigger>
        <SelectContent>
          {subjects.map(s => (
            <SelectItem key={s.id} value={s.id}>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="font-semibold">{s.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedSubject && selectedSubject.units.length > 0 && (
        <Select value={unitId} onValueChange={onUnitChange}>
          <SelectTrigger className="h-9 text-sm font-semibold bg-card/50 border-border/20">
            <SelectValue placeholder="Select Unit..." />
          </SelectTrigger>
          <SelectContent>
            {selectedSubject.units.map((u, i) => (
              <SelectItem key={u.id} value={u.id}>Unit {i + 1}: {u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {selectedUnit && selectedUnit.subTopics.length > 0 && (
        <Select value={topicId} onValueChange={onTopicChange}>
          <SelectTrigger className="h-9 text-sm font-semibold bg-card/50 border-border/20">
            <SelectValue placeholder="Select Topic..." />
          </SelectTrigger>
          <SelectContent>
            {selectedUnit.subTopics.filter(t => !t.completed).map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {studyingLabel && <p className="text-xs font-bold text-primary truncate">📖 {studyingLabel}</p>}
    </div>
  );
}
