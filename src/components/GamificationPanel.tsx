import { useState, useMemo, useEffect, lazy, Suspense } from 'react';

import { motion } from 'framer-motion';
import { Trophy, Zap, Timer, Gift } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import type { Subject, DailyLog, Achievement, PomodoroSettings, StoreState, DbStudySession } from '../types';
import { computeXP, getLevel, getLevelProgress, getXPToNextLevel, getStats, LEVELS, checkAchievements, getDefaultAchievements } from '../lib/gamification';
import { formatStudyHours } from '../lib/utils';
import { useLocalStorage } from '../hooks/useLocalStorage';
import FocusTimer from './FocusTimer';

const LevelStore = lazy(() => import('./store/LevelStore'));

const RARITY_STYLE: Record<string, string> = {
  common: 'border-muted-foreground/30 bg-muted/50',
  rare: 'border-accent/40 bg-accent/10',
  epic: 'border-primary/40 bg-primary/10',
  legendary: 'border-destructive/40 bg-destructive/10',
};

interface Props {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  onPomodoroComplete: (data: { minutes: number; subjectId?: string; unitId?: string; topicId?: string }) => void;
  pomodoroSettings: PomodoroSettings;
  initialTab?: 'overview' | 'achievements' | 'pomodoro' | 'rewards';
  store?: StoreState;
  onUpdateStore?: (s: StoreState) => void;
  dbSessions?: DbStudySession[];
}

export default function GamificationPanel({ subjects, dailyLogs, onPomodoroComplete, pomodoroSettings, initialTab = 'overview', store, onUpdateStore, dbSessions }: Props) {
  const [tab, setTab] = useState<'overview' | 'achievements' | 'pomodoro' | 'rewards'>(initialTab);
  const [achievements, setAchievements] = useLocalStorage<Achievement[]>('nursing-gamification-v2', getDefaultAchievements());

  // Single source of truth: compute stats first, then derive level from XP + syllabus progress
  const stats = useMemo(() => getStats(subjects, dailyLogs, dbSessions, achievements), [subjects, dailyLogs, dbSessions, achievements]);
  const xp = stats.xp;
  const syllabusPct = stats.pct;
  const level = useMemo(() => getLevel(xp, syllabusPct), [xp, syllabusPct]);
  const progress = useMemo(() => getLevelProgress(xp, syllabusPct), [xp, syllabusPct]);
  const xpToNext = useMemo(() => getXPToNextLevel(xp, syllabusPct), [xp, syllabusPct]);

  useEffect(() => {
    const updated = checkAchievements(achievements, subjects, dailyLogs, dbSessions);
    const hasNew = updated.some((a, i) => a.unlocked !== achievements[i]?.unlocked);
    if (hasNew) setAchievements(updated);
  }, [subjects, dailyLogs, dbSessions]);

  const unlocked = achievements.filter(a => a.unlocked);
  const locked = achievements.filter(a => !a.unlocked);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button variant={tab === 'overview' ? 'default' : 'outline'} size="sm" onClick={() => setTab('overview')}>
          <Zap className="w-4 h-4 mr-1" /> Overview
        </Button>
        <Button variant={tab === 'achievements' ? 'default' : 'outline'} size="sm" onClick={() => setTab('achievements')}>
          <Trophy className="w-4 h-4 mr-1" /> Achievements ({unlocked.length}/{achievements.length})
        </Button>
        <Button variant={tab === 'rewards' ? 'default' : 'outline'} size="sm" onClick={() => setTab('rewards')}>
          <Gift className="w-4 h-4 mr-1" /> Rewards
        </Button>
        <Button variant={tab === 'pomodoro' ? 'default' : 'outline'} size="sm" onClick={() => setTab('pomodoro')}>
          <Timer className="w-4 h-4 mr-1" /> Focus Timer ⏱️
        </Button>
      </div>

      {tab === 'pomodoro' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-6">
          <FocusTimer onSessionComplete={onPomodoroComplete} settings={pomodoroSettings} />
        </motion.div>
      )}

      {tab === 'overview' && (
        <div className="space-y-4">
          {/* ═══ LEVEL CARD ═══ */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
            <span className="text-5xl">{level.icon}</span>
            <h3 className="text-xl font-bold text-foreground">Lv.{level.level} {level.title}</h3>
            <p className="text-sm text-muted-foreground font-mono">{xp.toLocaleString()} XP</p>
            <div className="h-3 rounded-full bg-muted overflow-hidden max-w-xs mx-auto">
              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, progress)}%` }}
                transition={{ duration: 1 }} className="h-full rounded-full bg-primary" />
            </div>
            <p className="text-xs text-muted-foreground">
              {progress.toFixed(1)}% — {level.level < 20 ? `${xpToNext.toLocaleString()} XP remaining` : 'Max level reached! 🏆'}
            </p>
            {level.level < 20 && (
              <p className="text-[10px] text-primary font-semibold">
                Next: Lv.{level.level + 1} {LEVELS[level.level]?.title}
              </p>
            )}
            <div className="flex items-center justify-center gap-4 pt-1 text-[10px] text-muted-foreground">
              <span>📊 Syllabus: <span className="font-bold text-foreground">{syllabusPct}%</span></span>
              <span>🎯 Required: <span className="font-bold text-foreground">{level.minProgress}%</span></span>
            </div>
          </motion.div>

          {/* ═══ STAT CARDS — each represents ONE metric ═══ */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: '✅', label: 'Topics Done', value: `${stats.done}/${stats.total}` },
              { icon: '⏱', label: 'Total Hours', value: formatStudyHours(stats.totalHours) },
              { icon: '🔥', label: 'Streak', value: `${stats.streak}d` },
              { icon: '⭐', label: 'Important', value: `${stats.impDone}/${stats.impTotal}` },
            ].map(s => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-3 text-center">
                <span className="text-lg">{s.icon}</span>
                <p className="text-lg font-bold font-mono text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* ═══ LEVEL PROGRESSION TABLE ═══ */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-1">🎮 Level Progression</h3>
            <p className="text-[9px] text-muted-foreground mb-3">
              Levels unlock when you meet <span className="font-bold">both</span> the XP and Syllabus Progress requirements.
            </p>
            <div className="space-y-2">
              {LEVELS.map((l) => {
                const isCurrentLevel = l.level === level.level;
                const isUnlocked = l.level <= level.level;
                const xpMet = xp >= l.minXP;
                const progMet = syllabusPct >= l.minProgress;
                const isActive = isCurrentLevel;
                const levelPct = isUnlocked && !isActive ? 100
                  : isActive ? Math.min(100, ((xp - l.minXP) / Math.max(1, l.maxXP - l.minXP)) * 100)
                  : 0;

                return (
                  <div key={l.level} className={`flex items-center gap-3 rounded-lg transition-colors ${isCurrentLevel ? 'bg-primary/8 -mx-1 px-1 py-1' : ''}`}>
                    <span className="text-lg w-8 text-center">{isUnlocked ? l.icon : '🔒'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs gap-1">
                        <span className={isUnlocked ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                          Lv.{l.level} {l.title}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${progMet ? 'bg-secondary/15 text-secondary' : 'bg-muted/30 text-muted-foreground/60'}`}
                            title="Minimum syllabus progress required">
                            📊 {l.minProgress}%
                          </span>
                          <span className={`text-[9px] font-mono ${xpMet ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {l.minXP.toLocaleString()} XP
                          </span>
                        </div>
                      </div>
                      <div className="h-1 rounded-full bg-muted mt-1">
                        <div className={`h-full rounded-full transition-all ${isUnlocked ? 'bg-primary' : 'bg-muted-foreground/20'}`}
                          style={{ width: `${Math.min(100, Math.max(0, levelPct))}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'rewards' && store && onUpdateStore && (
        <Suspense fallback={<div className="h-40 flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
          <LevelStore store={store} onUpdateStore={onUpdateStore} xp={xp} syllabusProgress={syllabusPct} />
        </Suspense>
      )}

      {tab === 'achievements' && (
        <div className="space-y-4">
          {/* Achievement progress summary */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-foreground">Achievement Progress</span>
              <span className="text-xs font-mono text-muted-foreground">{unlocked.length}/{achievements.length}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-secondary transition-all"
                style={{ width: `${achievements.length > 0 ? Math.min(100, (unlocked.length / achievements.length) * 100) : 0}%` }} />
            </div>
            <p className="text-[9px] text-muted-foreground mt-1">
              +{unlocked.reduce((a, ach) => a + ach.xp, 0)} XP earned from achievements
            </p>
          </div>

          {unlocked.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">🏆 Unlocked ({unlocked.length})</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {unlocked.map(a => <AchievementCard key={a.id} achievement={a} />)}
              </div>
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">🔒 Locked ({locked.length})</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {locked.map(a => <AchievementCard key={a.id} achievement={a} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AchievementCard({ achievement: a }: { achievement: Achievement }) {
  return (
    <div className={`rounded-xl border p-4 transition-colors ${RARITY_STYLE[a.rarity]} ${!a.unlocked ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-2xl">{a.unlocked ? a.icon : '🔒'}</span>
        <span className="text-[10px] font-mono text-muted-foreground capitalize px-2 py-0.5 rounded-full border border-border">
          {a.rarity}
        </span>
      </div>
      <h4 className="text-sm font-bold text-foreground">{a.title}</h4>
      <p className="text-[11px] text-muted-foreground mt-1">{a.description}</p>
      <p className="text-xs font-mono text-primary mt-2">+{a.xp} XP</p>
    </div>
  );
}
