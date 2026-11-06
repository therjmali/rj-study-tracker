import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Sparkles, Plus, Check, Clock, Target, Flame, LayoutGrid, ChevronRight, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { requestPinWidget, isPinWidgetSupported } from '../../platform/widgetSync';
import { formatStudyTime } from '../../lib/utils';
import type { Subject, DailyLog, StudyGoals } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  todayMinutes: number;
  todayTopicsDone: number;
  targetTopics: number;
  streakDays: number;
  syllabusPercent: number;
  timerDisplay?: string;
}

export default function WidgetManagerModal({
  open,
  onClose,
  todayMinutes,
  todayTopicsDone,
  targetTopics,
  streakDays,
  syllabusPercent,
  timerDisplay = '25:00',
}: Props) {
  const [showManualGuide, setShowManualGuide] = useState(false);
  const [pinnedStudy, setPinnedStudy] = useState(false);
  const [pinnedFocus, setPinnedFocus] = useState(false);

  if (!open) return null;

  const handleAddWidget = (type: 'study' | 'focus') => {
    const supported = isPinWidgetSupported();
    if (supported) {
      const ok = requestPinWidget(type);
      if (ok) {
        if (type === 'study') setPinnedStudy(true);
        if (type === 'focus') setPinnedFocus(true);
        toast.success(
          type === 'study'
            ? '📌 Study Progress Widget request sent to your home screen!'
            : '📌 Focus Timer Widget request sent to your home screen!'
        );
        return;
      }
    }

    // Fallback: prompt manual launcher add
    setShowManualGuide(true);
    toast.info('To add widget: Long-press your home screen → Widgets → RJ Tracker Pro');
  };

  const topicPct = Math.min(100, Math.round((todayTopicsDone / (targetTopics || 5)) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-t-[28px] sm:rounded-3xl border border-white/15 bg-card/95 backdrop-blur-2xl shadow-2xl p-5 sm:p-6 space-y-5"
        style={{
          background: 'radial-gradient(120% 120% at 50% 0%, hsl(var(--card) / 0.98), hsl(var(--card) / 0.92))',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/15">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shadow-sm">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-foreground tracking-tight flex items-center gap-1.5">
                Android Home Screen Widgets
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary uppercase">v18.2</span>
              </h2>
              <p className="text-xs text-muted-foreground font-medium">Glanceable study stats & instant focus launcher on your phone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted/30 hover:bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Widget 1 Preview: Study Progress & Daily Target (4x2) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5 text-primary" /> Study Progress & Streak (4×2)
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">Standard</span>
          </div>

          {/* Realistic Widget Render */}
          <div
            className="rounded-3xl p-4 border border-white/15 shadow-xl relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #1A1F26 0%, #151920 100%)',
              boxShadow: '0 12px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/30 flex items-center justify-center text-[10px]">⚡</div>
                <span className="text-[11px] font-black text-white uppercase tracking-wider">RJ TRACKER PRO</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#242B35] border border-[#3B4654] text-[#FB923C]">
                🔥 {streakDays}d
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3 pt-1">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">TODAY'S STUDY</p>
                <p className="text-xl font-black font-mono text-[#38BDF8] mt-0.5">{formatStudyTime(todayMinutes)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">DAILY GOAL</p>
                <p className="text-sm font-black font-mono text-[#34D399] mt-0.5">{todayTopicsDone} / {targetTopics || 5} Topics</p>
              </div>
            </div>

            <div className="mt-3">
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#E0764F] to-[#B4452B]" style={{ width: `${topicPct}%` }} />
              </div>
              <div className="flex items-center justify-between text-[9px] text-slate-500 mt-1 font-semibold">
                <span>{syllabusPercent}% Syllabus Complete</span>
                <span className="text-[#E0764F] font-bold">Tap to open ⚡</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => handleAddWidget('study')}
            className="w-full h-10 rounded-2xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-md"
          >
            {pinnedStudy ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {pinnedStudy ? 'Widget Requested — Tap to Request Again' : 'Add Study Progress Widget to Home Screen'}
          </button>
        </div>

        {/* Widget 2 Preview: Quick Focus Timer (2x2) */}
        <div className="space-y-2 pt-2 border-t border-border/15">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-chart-4" /> Quick Focus Timer (2×2)
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">Compact</span>
          </div>

          {/* Compact Widget Render */}
          <div
            className="max-w-[200px] mx-auto rounded-3xl p-3.5 border border-white/15 shadow-xl text-center space-y-2"
            style={{
              background: 'linear-gradient(135deg, #1A1F26 0%, #151920 100%)',
              boxShadow: '0 12px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
          >
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-[#E0764F]">⚡ FOCUS</span>
              <span className="text-[#FB923C]">🔥 {streakDays}d</span>
            </div>
            <div>
              <p className="text-2xl font-black font-mono text-white tracking-tight">{timerDisplay}</p>
              <p className="text-[10px] text-slate-400 font-medium">Focus Ready</p>
            </div>
            <div className="h-7 rounded-xl bg-[#B4452B] text-white text-[10px] font-bold flex items-center justify-center gap-1 shadow-sm">
              ⏱️ Start Study
            </div>
          </div>

          <button
            onClick={() => handleAddWidget('focus')}
            className="w-full h-10 rounded-2xl bg-primary/15 border border-primary/25 text-primary text-xs font-bold flex items-center justify-center gap-2 hover:bg-primary/20 active:scale-[0.98] transition-all"
          >
            {pinnedFocus ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {pinnedFocus ? 'Widget Requested — Tap to Request Again' : 'Add Quick Focus Widget to Home Screen'}
          </button>
        </div>

        {/* Manual launcher guide */}
        <div className="pt-2">
          <button
            onClick={() => setShowManualGuide(!showManualGuide)}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-muted/20 border border-border/15 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-1.5 font-bold">
              <HelpCircle className="w-4 h-4 text-primary" /> How to add widgets manually on Android
            </span>
            <ChevronRight className={`w-4 h-4 transition-transform ${showManualGuide ? 'rotate-90' : ''}`} />
          </button>

          <AnimatePresence>
            {showManualGuide && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden space-y-2 pt-2.5 px-2 text-xs text-muted-foreground font-medium"
              >
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-black flex items-center justify-center shrink-0">1</span>
                  <p>Long-press any empty area on your Android phone's home screen launcher.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-black flex items-center justify-center shrink-0">2</span>
                  <p>Tap <strong>Widgets</strong> and scroll down the list to find <strong>RJ Tracker Pro</strong>.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-black flex items-center justify-center shrink-0">3</span>
                  <p>Touch and hold either the <strong>Study Progress</strong> or <strong>Focus Timer</strong> widget, then drag it directly onto your home screen!</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
