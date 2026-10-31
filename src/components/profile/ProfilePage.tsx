import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowLeft, Camera, Loader2 } from 'lucide-react';
import { useUpload } from '@/platform/upload';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { toast } from 'sonner';
import type { Subject, DailyLog, User, AppState, UserSettings, HistoryEntry, ExamConfig, TrashItem, Reminder, DbStudySession } from '../../types';
import { APP_VERSION } from '../../types';
import { getStats } from '../../lib/gamification';
import { formatStudyTime, getUnifiedTotalMinutes } from '../../lib/utils';
import SettingsHub from '../settings/SettingsHub';

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

const GRADIENTS = [
  'from-primary/30 via-accent/20 to-secondary/30',
  'from-destructive/30 via-primary/20 to-accent/30',
  'from-secondary/30 via-primary/20 to-destructive/30',
  'from-accent/30 via-secondary/20 to-primary/30',
];

export default function ProfilePage(props: Props) {
  const { user, onUpdateUser, subjects, dailyLogs, appState, settings, onUpdateSettings, onImport, onReset, onClearHistory, history, exams, onUpdateExams, onPomodoroComplete, trash, onRestoreTrash, onDeleteTrash, onEmptyTrash, onClose, onLogout, onOpenAi, reminders, onUpdateReminders, onOpenHelp, dbSessions, initialSection } = props;
  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState(user.name);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const { upload, isUploading: uploadBusy } = useUpload();

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const { url } = await upload(file);
      onUpdateUser({ ...user, avatar: url });
      toast.success('Profile photo updated!');
    } catch {
      toast.error('Failed to upload photo');
    }
    setAvatarUploading(false);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleRemovePhoto = () => {
    onUpdateUser({ ...user, avatar: '🎓' });
    toast.success('Photo removed');
  };

  const isPhotoUrl = user.avatar?.startsWith('http');

  const stats = useMemo(() => getStats(subjects, dailyLogs, dbSessions), [subjects, dailyLogs, dbSessions]);
  const totalTopics = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
  const doneTopics = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);
  const pct = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0;
  const rank = [...RANK_CONFIG].reverse().find(r => pct >= r.min) ?? RANK_CONFIG[0];
  const gradientIdx = user.coverGradient ? parseInt(user.coverGradient) % GRADIENTS.length : 0;

  const saveName = () => {
    onUpdateUser({ ...user, name: nameVal.trim() || user.name });
    setEditName(false);
    toast.success('Name updated');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className="fixed inset-0 z-[100] bg-background overflow-y-auto will-change-transform" style={{ willChange: 'scroll-position, transform' }}>
      {/* Cover */}
      <div className={`h-32 bg-gradient-to-br ${GRADIENTS[gradientIdx]} relative`}>
        <button onClick={onClose} className="absolute top-3 left-3 w-8 h-8 rounded-full bg-background/60 flex items-center justify-center border border-border/20" title="Close">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-background/60 flex items-center justify-center border border-border/20">
          <X className="w-4 h-4 text-foreground" />
        </button>
        <div className="absolute top-3 left-14 flex gap-1">
          {GRADIENTS.map((_, i) => (
            <button key={i} onClick={() => onUpdateUser({ ...user, coverGradient: String(i) })}
              className={`w-5 h-5 rounded-full bg-gradient-to-br ${GRADIENTS[i]} border-2 ${gradientIdx === i ? 'border-foreground' : 'border-transparent'}`} />
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-12 pb-8">
        {/* Avatar + Name */}
        <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        <div className="flex items-end gap-4 mb-4">
          <div className="relative group">
            <button
              onClick={() => isPhotoUrl && setPhotoViewerOpen(true)}
              className={`w-20 h-20 rounded-2xl bg-primary/20 border-4 border-background flex items-center justify-center text-2xl font-bold text-primary shadow-lg overflow-hidden ${isPhotoUrl ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
            >
              {avatarUploading ? (
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              ) : isPhotoUrl ? (
                <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                user.avatar
              )}
            </button>
            <button onClick={() => avatarInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md border-2 border-background hover:scale-110 active:scale-95 transition-all">
              <Camera className="w-3.5 h-3.5" />
            </button>
            {isPhotoUrl && (
              <button onClick={handleRemovePhoto}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md border-2 border-background opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex-1 pb-1">
            {editName ? (
              <div className="flex gap-2">
                <Input value={nameVal} onChange={e => setNameVal(e.target.value)} className="h-8 text-sm" autoFocus onKeyDown={e => e.key === 'Enter' && saveName()} />
                <Button size="sm" onClick={saveName}>Save</Button>
              </div>
            ) : (
              <button onClick={() => setEditName(true)} className="flex items-center gap-1 group">
                <h2 className="text-xl font-black text-foreground">{user.name}</h2>
                <span className="text-muted-foreground text-xs group-hover:text-primary">✏️</span>
              </button>
            )}
            <p className="text-xs text-muted-foreground">{user.email}</p>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono font-bold border border-border/20 inline-block mt-0.5">
              RJ TRACKER Pro {APP_VERSION}
            </span>
            <div className="flex gap-2 mt-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border border-border/30 bg-card/50 ${rank.color}`}>
                {rank.icon} {rank.title.toUpperCase()}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/20 font-bold">
                🔥 {stats.streak}d streak
              </span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
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

        {/* Logout */}
        <Button variant="outline" size="sm" onClick={onLogout} className="w-full mb-5 text-destructive border-destructive/20 hover:bg-destructive/10">
          Logout
        </Button>

        {/* ── Settings Hub: search + categories ── */}
        <SettingsHub
          user={user} onUpdateUser={onUpdateUser} subjects={subjects} dailyLogs={dailyLogs} appState={appState}
          settings={settings} onUpdateSettings={onUpdateSettings} onImport={onImport} onReset={onReset} onClearHistory={onClearHistory}
          history={history} exams={exams} onUpdateExams={onUpdateExams} onPomodoroComplete={onPomodoroComplete}
          trash={trash} onRestoreTrash={onRestoreTrash} onDeleteTrash={onDeleteTrash} onEmptyTrash={onEmptyTrash}
          reminders={reminders} onUpdateReminders={onUpdateReminders} onOpenHelp={onOpenHelp}
          dbSessions={dbSessions} initialSection={initialSection}
        />
      </div>

      {/* Full-screen photo viewer */}
      <AnimatePresence>
        {photoViewerOpen && isPhotoUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
            onClick={() => setPhotoViewerOpen(false)}
          >
            <button
              onClick={() => setPhotoViewerOpen(false)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors z-10"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            <motion.img
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              src={user.avatar}
              alt="Profile photo"
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
