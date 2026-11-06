import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowLeft, LogOut, PencilLine } from 'lucide-react';
import { isImageAvatar } from '@/lib/avatar';
import { Button } from '@project/components/ui/button';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import type { Subject, DailyLog, User, AppState, UserSettings, HistoryEntry, ExamConfig, TrashItem, Reminder, DbStudySession } from '../../types';
import { APP_VERSION } from '../../types';
import { getStats } from '../../lib/gamification';
import { formatStudyTime, getUnifiedTotalMinutes } from '../../lib/utils';
import SettingsHub from '../settings/SettingsHub';
import ProfileEditorSheet, { COVER_GRADIENTS } from './ProfileEditorSheet';
import StatusStrip from '../data/StatusStrip';
import WidgetManagerModal from '../widgets/WidgetManagerModal';

interface Props {
  user: User;
  onUpdateUser: (u: User) => void;
  subjects: Subject[];
  dailyLogs: DailyLog[];
  appState: AppState;
  settings: UserSettings;
  onUpdateSettings: (s: UserSettings) => void;
  onImport: (s: AppState) => void;
  onReset: () => void;
  onClearHistory: () => void;
  history: HistoryEntry[];
  exams: ExamConfig[];
  onUpdateExams: (e: ExamConfig[]) => void;
  onPomodoroComplete: (data: { minutes: number; subjectId?: string; unitId?: string; topicId?: string }) => void;
  trash: TrashItem[];
  onRestoreTrash: (id: string) => void;
  onDeleteTrash: (id: string) => void;
  onEmptyTrash: () => void;
  onClose: () => void;
  onLogout: () => void;
  onOpenAi?: () => void;
  reminders?: Reminder[];
  onUpdateReminders?: (r: Reminder[]) => void;
  onOpenHelp?: () => void;
  dbSessions?: DbStudySession[];
  initialSection?: string;
}

const RANK_CONFIG = [
  { min: 0, icon: '🌱', title: 'Beginner', color: 'text-secondary' },
  { min: 20, icon: '⚡', title: 'Intermediate', color: 'text-accent' },
  { min: 50, icon: '🎓', title: 'Master', color: 'text-primary' },
  { min: 80, icon: '💎', title: 'Diamond', color: 'text-destructive' },
];


export default function ProfilePage(props: Props) {
  const { user, onUpdateUser, subjects, dailyLogs, appState, settings, onUpdateSettings, onImport, onReset, onClearHistory, history, exams, onUpdateExams, onPomodoroComplete, trash, onRestoreTrash, onDeleteTrash, onEmptyTrash, onClose, onLogout, onOpenAi, reminders, onUpdateReminders, onOpenHelp, dbSessions, initialSection } = props;
  const [editorOpen, setEditorOpen] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [widgetModalOpen, setWidgetModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null);

  const isPhotoUrl = isImageAvatar(user.avatar);

  // The settings search sticks right below the title bar; tell it exactly how tall that bar is.
  useLayoutEffect(() => {
    const header = headerRef.current; const host = scrollRef.current;
    if (!header || !host) return;
    const set = () => host.style.setProperty('--settings-header-h', `${Math.round(header.getBoundingClientRect().height / (Number(getComputedStyle(document.documentElement).getPropertyValue('--rj-zoom')) || 1))}px`);
    set();
    const ro = new ResizeObserver(set); ro.observe(header);
    window.addEventListener('resize', set);
    return () => { ro.disconnect(); window.removeEventListener('resize', set); };
  }, []);

  const stats = useMemo(() => getStats(subjects, dailyLogs, dbSessions), [subjects, dailyLogs, dbSessions]);
  const totalTopics = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
  const doneTopics = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);
  const pct = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0;
  const rank = [...RANK_CONFIG].reverse().find(r => pct >= r.min) ?? RANK_CONFIG[0];
  const gradientIdx = (parseInt(user.coverGradient ?? '0') || 0) % COVER_GRADIENTS.length;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      ref={scrollRef} className="fixed inset-0 z-[100] bg-background overflow-y-auto will-change-transform" style={{ willChange: 'scroll-position, transform' }}>

      {/* ── Sticky title bar ── */}
      <div ref={headerRef} className="sticky top-0 z-30 bg-background border-b border-border/20 shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-2.5 pb-2.5">
          <div className="flex items-center gap-2.5">
            <button onClick={onClose} aria-label="Back" className="w-8 h-8 rounded-full bg-card/60 flex items-center justify-center border border-border/20 active:scale-90 transition-transform">
              <ArrowLeft className="w-4 h-4 text-foreground" />
            </button>
            <h1 className="flex-1 text-[15px] font-black text-foreground tracking-tight">Profile &amp; Settings</h1>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-card/60 flex items-center justify-center border border-border/20 active:scale-90 transition-transform">
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 pb-12">
        {/* ── Profile card: identity; edit (and log out) via the ✏️ ── */}
        <section className="relative rounded-3xl border border-border/20 bg-card/30 overflow-hidden mb-3">
          <div className={`h-16 bg-gradient-to-br ${COVER_GRADIENTS[gradientIdx]}`} />
          {/* Small ✏️ in the corner: Edit profile (and, inside it, Log out) — nothing destructive sits on the main screen */}
          <button onClick={() => setEditorOpen(true)} aria-label="Edit profile"
            className="absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-background/80 backdrop-blur border border-border/30 shadow-sm flex items-center justify-center text-[15px] leading-none active:scale-90 hover:bg-background transition-all">
            <span aria-hidden>✏️</span>
          </button>
          <div className="px-4 pb-4 -mt-9">
            <div className="flex items-end gap-3.5">
              <button onClick={() => (isPhotoUrl ? setPhotoViewerOpen(true) : setEditorOpen(true))} aria-label={isPhotoUrl ? 'View photo' : 'Edit profile'}
                className="w-[72px] h-[72px] rounded-2xl bg-primary/20 border-4 border-background flex items-center justify-center text-2xl font-bold text-primary shadow-lg overflow-hidden shrink-0 active:scale-95 transition-transform">
                {isPhotoUrl ? <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" /> : <span className="max-w-full truncate px-1">{user.avatar}</span>}
              </button>
              <div className="flex-1 min-w-0 pb-0.5">
                <h2 className="text-lg font-black text-foreground truncate">{user.name}</h2>
                <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border border-border/30 bg-card/50 ${rank.color}`}>{rank.icon} {rank.title.toUpperCase()}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/20 font-bold">🔥 {stats.streak}d streak</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono font-bold border border-border/20 self-center">RJ TRACKER Pro {APP_VERSION}</span>
            </div>
          </div>
        </section>

        {/* ── Live status ── */}
        <StatusStrip onJump={id => setJump({ id, n: Date.now() })} />

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { icon: '📚', val: String(subjects.length), label: 'SUBJECTS' },
            { icon: '✅', val: `${doneTopics}/${totalTopics}`, label: 'TOPICS' },
            { icon: '📊', val: `${pct}%`, label: 'PROGRESS' },
            { icon: '🎯', val: `${stats.impPct}%`, label: 'IMPORTANT' },
            { icon: '🔥', val: `${stats.streak}d`, label: 'STREAK' },
            { icon: '⏱', val: formatStudyTime(getUnifiedTotalMinutes(subjects, dbSessions, dailyLogs)), label: 'TIME' },
          ].map(s => (
            <div key={s.label} className="glass-card p-2.5 text-center">
              <span className="text-sm">{s.icon}</span>
              <p className="text-sm font-bold font-mono text-foreground">{s.val}</p>
              <p className="text-[8px] text-muted-foreground font-semibold">{s.label}</p>
            </div>
          ))}
        </div>

        {onOpenAi && (
          <button onClick={onOpenAi} className="w-full mb-3 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-left active:scale-[0.99] transition-transform">
            <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl">🤖</span>
            <span className="flex-1"><span className="block text-[13px] font-bold text-foreground">AI Tutor</span><span className="block text-[11px] text-muted-foreground">Chat, MCQs, flashcards and study plans</span></span>
            <span className="text-primary text-lg">›</span>
          </button>
        )}

        {/* Android Home Screen Widgets Card */}
        <button
          onClick={() => setWidgetModalOpen(true)}
          className="w-full mb-4 flex items-center gap-3 rounded-2xl border border-primary/25 bg-card/60 hover:bg-card/80 p-3.5 text-left active:scale-[0.99] transition-all shadow-sm group"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-xl shadow-inner shrink-0 group-hover:scale-105 transition-transform">
            📱
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-black text-foreground">Android Home Screen Widgets</span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-primary/20 text-primary">NEW</span>
            </div>
            <span className="block text-[11px] text-muted-foreground truncate">Add live study progress &amp; focus timer widgets to your phone</span>
          </div>
          <span className="text-primary text-lg font-bold pr-1">›</span>
        </button>

        {/* ── Settings Hub: search + suggestions sit directly below the AI Tutor card ── */}
        <SettingsHub
          user={user} onUpdateUser={onUpdateUser} subjects={subjects} dailyLogs={dailyLogs} appState={appState}
          settings={settings} onUpdateSettings={onUpdateSettings} onImport={onImport} onReset={onReset} onClearHistory={onClearHistory}
          history={history} exams={exams} onUpdateExams={onUpdateExams} onPomodoroComplete={onPomodoroComplete}
          trash={trash} onRestoreTrash={onRestoreTrash} onDeleteTrash={onDeleteTrash} onEmptyTrash={onEmptyTrash}
          reminders={reminders} onUpdateReminders={onUpdateReminders} onOpenHelp={onOpenHelp}
          dbSessions={dbSessions} initialSection={initialSection}
          onEditProfile={() => setEditorOpen(true)} jump={jump}
        />
      </div>

      <ProfileEditorSheet open={editorOpen} user={user} onClose={() => setEditorOpen(false)} onSave={onUpdateUser} onLogout={onLogout} />

      {/* Android Home Screen Widgets Manager */}
      <WidgetManagerModal
        open={widgetModalOpen}
        onClose={() => setWidgetModalOpen(false)}
        todayMinutes={getUnifiedTotalMinutes(subjects, dbSessions, dailyLogs)}
        todayTopicsDone={doneTopics}
        targetTopics={settings.studyGoals?.dailyTopics || 5}
        streakDays={stats.streak}
        syllabusPercent={pct}
      />

      {/* Full-screen photo viewer */}
      <AnimatePresence>
        {photoViewerOpen && isPhotoUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center" onClick={() => setPhotoViewerOpen(false)}>
            <button onClick={() => setPhotoViewerOpen(false)} aria-label="Close photo" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors z-10">
              <X className="w-5 h-5 text-white" />
            </button>
            <motion.img initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              src={user.avatar} alt="Profile photo" className="max-w-[90vw] max-h-[85vh] object-contain rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
