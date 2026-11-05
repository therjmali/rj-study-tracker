import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense, startTransition, memo } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import { Timer, CheckCircle2, Plus, Loader2, Stethoscope, Wheat, GraduationCap } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { useAuth, saveProfile, type AuthMode } from '@/platform/auth';
import { updateAccountProfile } from '@/platform/cloud/authStore';
import { startSyncEngine, stopSyncEngine, syncNow, useSyncState } from '@/platform/cloud/syncEngine';
import { syncData, saveTopic, saveDailyLog, saveSettings, deleteRecords, saveSubjects, createSession, updateSession, deleteSession as deleteSessionEndpoint, migrateSessions } from '@/platform/api';
import { useDebouncedCallback } from 'use-debounce';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useTheme, isDarkCanvas } from './hooks/useTheme';
import { useGlobalTimer } from './hooks/useGlobalTimer';
import { useTimerNotifications } from './hooks/useTimerNotifications';
import { registerBackupContext } from './platform/autoBackup';
import type { BackupContext } from './lib/backupBuilder';
import { useBackGuard } from './hooks/useBackGuard';
import { TimerProvider } from './contexts/TimerContext';
import { DEFAULT_SEMESTER, generateDefaultLogs } from './data/syllabus';
import { getStats, getLevel, getLevelProgress } from './lib/gamification';
import { countDueTopics } from './lib/srs';
import type { AppTab, Subject, DailyLog, AppState, HistoryEntry, UserSettings, ExamConfig, TrashItem, StoreState, Folder, Reminder, StudentMode, DbStudySession } from './types';
import { getLocalDateStr, normalizeSubjectId } from './lib/utils';
import { DEFAULT_SETTINGS } from './types';
import { getDueReminders, getTodayStr } from './lib/reminderUtils';
import { getBrandConfig, getAppName } from './lib/brandConfig';
import { renumberTopicNumbers } from './lib/renumberTopics';
import { moveSubject, normalizeSubjectOrder } from './lib/subjectOrder';
import { useTodos } from './hooks/useTodos';
import ErrorBoundary from './components/shared/ErrorBoundary';
import TopHeader from './components/layout/TopHeader';
import BottomNav from './components/layout/BottomNav';
import SideNav from './components/layout/SideNav';
import InstallBanner from './components/shared/InstallBanner';
import { NotificationProvider } from './contexts/NotificationContext';
import NotificationContainer from './components/shared/NotificationContainer';
import HelpModal from './components/shared/HelpModal';
import FloatingTimer from './components/shared/FloatingTimer';
import MilestoneToast from './components/dashboard/MilestoneToast';
import AchievementPopup from './components/shared/AchievementPopup';
import BottomSheet, { forceResetScrollLock } from './components/shared/BottomSheet';
import GlobalSearch, { clearSearchSnapshot } from './components/shared/GlobalSearch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { syncDailyLogsWithSubjects } from './lib/dailyLogSync';

// Lazy load ALL heavy pages
// memo: skip re-rendering this whole page when App re-renders for unrelated reasons (sheets opening, sync status, etc.)
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: memo(m.default as React.ComponentType<any>) as unknown as typeof m.default })));
// memo: skip re-rendering this whole page when App re-renders for unrelated reasons (sheets opening, sync status, etc.)
const SyllabusTracker = lazy(() => import('./components/SyllabusTracker').then(m => ({ default: memo(m.default as React.ComponentType<any>) as unknown as typeof m.default })));
const DailyTracker = lazy(() => import('./components/DailyTracker'));
// memo: skip re-rendering this whole page when App re-renders for unrelated reasons (sheets opening, sync status, etc.)
const ChartsView = lazy(() => import('./components/ChartsView').then(m => ({ default: memo(m.default as React.ComponentType<any>) as unknown as typeof m.default })));
// memo: skip re-rendering this whole page when App re-renders for unrelated reasons (sheets opening, sync status, etc.)
const RevisionPanel = lazy(() => import('./components/RevisionPanel').then(m => ({ default: memo(m.default as React.ComponentType<any>) as unknown as typeof m.default })));
const ProfilePage = lazy(() => import('./components/profile/ProfilePage'));
// CoinStore removed — replaced by level-based LevelStore inside GamificationPanel
const GamificationPanel = lazy(() => import('./components/GamificationPanel'));
const FocusTimer = lazy(() => import('./components/FocusTimer'));
// memo: skip re-rendering this whole page when App re-renders for unrelated reasons (sheets opening, sync status, etc.)
const AIChat = lazy(() => import('./components/AIChat').then(m => ({ default: memo(m.default as React.ComponentType<any>) as unknown as typeof m.default })));
const MCQPractice = lazy(() => import('./components/MCQPractice'));
const FlashcardDeck = lazy(() => import('./components/FlashcardDeck'));
const TopicDetailSheet = lazy(() => import('./components/syllabus/TopicDetailSheet'));
const ReminderPopup = lazy(() => import('./components/reminders/ReminderPopup'));
const NotificationCenter = lazy(() => import('./components/NotificationCenter'));
const SyncCenter = lazy(() => import('./components/cloud/SyncCenter'));
const AuthScreen = lazy(() => import('./components/auth/AuthScreen'));
const CloudGate = lazy(() => import('./components/cloud/CloudGate'));

// Prefetch all lazy chunks during idle time so tab switches are instant
if (typeof window !== 'undefined') {
  const prefetch = () => {
    import('./components/Dashboard');
    import('./components/SyllabusTracker');
    import('./components/DailyTracker');
    import('./components/ChartsView');
    import('./components/RevisionPanel');
    import('./components/profile/ProfilePage');
    import('./components/GamificationPanel');
    import('./components/FocusTimer');
    import('./components/AIChat');
    import('./components/MCQPractice');
    import('./components/FlashcardDeck');
  };
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(prefetch);
  } else {
    setTimeout(prefetch, 2000);
  }
}

const MAX_HISTORY = 500;
const MAX_UNDO = 10;

/** Safely coerce any value to a string — prevents React error #300 from objects/arrays */
function safeStr(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return ''; }
}

/** Sanitize subjects to ensure all rendered fields are safe strings/arrays — prevents React error #310 from objects/arrays */
function sanitizeSubjects(subjects: Subject[]): Subject[] {
  if (!Array.isArray(subjects)) return [];
  return subjects.filter(s => s && typeof s === 'object' && s.id).map(s => {
    try {
      return {
        ...s,
        id: String(s.id || ''),
        name: String(s.name || ''),
        shortName: String(s.shortName || ''),
        color: String(s.color || '#888'),
        examDate: String(s.examDate || ''),
        image: typeof s.image === 'string' ? s.image : undefined,
        icon: typeof s.icon === 'string' ? s.icon : undefined,
        iconShape: typeof s.iconShape === 'string' ? s.iconShape as any : undefined,
        iconSize: typeof s.iconSize === 'string' ? s.iconSize as any : undefined,
        folderId: typeof s.folderId === 'string' ? s.folderId : undefined,
        units: Array.isArray(s.units) ? s.units.filter(u => u && typeof u === 'object').map(u => {
          try {
            return {
              ...u,
              id: String(u.id || ''),
              name: String(u.name || ''),
              timeSpent: typeof u.timeSpent === 'number' ? u.timeSpent : 0,
              timeEntries: Array.isArray(u.timeEntries) ? u.timeEntries : [],
              subTopics: Array.isArray(u.subTopics) ? u.subTopics.filter(t => t && typeof t === 'object' && t.id).map(t => {
                try {
                  return {
                    ...t,
                    id: String(t.id || ''),
                    name: safeStr(t.name),
                    completed: !!t.completed,
                    difficulty: (typeof t.difficulty === 'string' ? t.difficulty : 'Medium') as 'Easy' | 'Medium' | 'Hard',
                    status: typeof t.status === 'string' ? t.status : (t.completed ? 'complete' : 'incomplete'),
                    category: t.category != null ? safeStr(t.category) || undefined : undefined,
                    module: t.module != null ? safeStr(t.module) || undefined : undefined,
                    subModule: t.subModule != null ? safeStr(t.subModule) || undefined : undefined,
                    tags: Array.isArray(t.tags) ? t.tags.map((tag: any) => safeStr(tag)).filter(Boolean) : [],
                    rank: t.rank != null ? (typeof t.rank === 'number' && t.rank >= 1 && t.rank <= 5 ? t.rank as 1|2|3|4|5 : undefined) : undefined,
                    notes: typeof t.notes === 'string' ? t.notes : (t.notes != null ? safeStr(t.notes) : ''),
                    notesArr: Array.isArray(t.notesArr) ? t.notesArr : [],
                    completedDate: t.completedDate != null ? safeStr(t.completedDate) || undefined : undefined,
                    completedTime: t.completedTime != null ? safeStr(t.completedTime) || undefined : undefined,
                    norcetRelevance: typeof t.norcetRelevance === 'string' ? t.norcetRelevance : undefined,
                    topicNumber: typeof t.topicNumber === 'number' ? t.topicNumber : (t.topicNumber != null ? Number(t.topicNumber) || undefined : undefined),
                    timeSpent: typeof t.timeSpent === 'number' ? t.timeSpent : 0,
                    important: !!t.important,
                    mcqs: Array.isArray(t.mcqs) ? t.mcqs : [],
                    resourceLinks: Array.isArray(t.resourceLinks) ? t.resourceLinks : [],
                    attachments: Array.isArray(t.attachments) ? t.attachments : [],
                    timeEntries: Array.isArray(t.timeEntries) ? t.timeEntries : [],
                  };
                } catch { return null; }
              }).filter(Boolean) as any[] : [],
            };
          } catch { return { id: String(u?.id || `err-${Date.now()}`), name: 'Error', subTopics: [] }; }
        }) : [],
      };
    } catch { return null; }
  }).filter(Boolean) as Subject[];
}

function PageSkeleton() {
  return (
    <div className="space-y-3 min-h-[50vh]" style={{ contain: 'layout style' }}>
      <div className="flex items-center gap-3">
        <div className="h-8 w-40 rounded-xl bg-muted/15 animate-skeleton" />
        <div className="h-6 w-16 rounded-lg bg-muted/10 animate-skeleton" />
      </div>
      <div className="h-14 bg-muted/10 rounded-2xl animate-skeleton" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 bg-muted/8 rounded-2xl animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="h-20 bg-muted/8 rounded-2xl animate-skeleton" style={{ animationDelay: '400ms' }} />
    </div>
  );
}

const SPLASH_STAGES = [
  { text: 'Opening your study vault…', emoji: '☁️', delay: 0 },
  { text: 'Loading your data…', emoji: '📚', delay: 0.8 },
  { text: 'Preparing dashboard…', emoji: '✨', delay: 1.6 },
];

function SplashIcon({ mode }: { mode?: StudentMode | null }) {
  if (mode === 'agriculture') return <Wheat className="w-8 h-8 text-primary-foreground" />;
  if (mode === 'nursing') return <Stethoscope className="w-8 h-8 text-primary-foreground" />;
  return <GraduationCap className="w-8 h-8 text-primary-foreground" />;
}

function SplashScreen({ mode }: { mode?: StudentMode | null }) {
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    const timers = SPLASH_STAGES.map((_, i) =>
      setTimeout(() => setStageIdx(i), i * 900)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // Particle dots
  const particles = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 3,
      duration: 3 + Math.random() * 4,
      delay: Math.random() * 2,
    })),
  []);

  return (
    <div className="min-h-screen bg-background mesh-gradient flex items-center justify-center overflow-hidden relative">
      {/* Static gradient blobs — no animation to preserve GPU for splash transitions */}
      <div className="absolute top-[-15%] left-[-10%] w-[55%] h-[55%] rounded-full bg-primary/8 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-secondary/7 blur-[100px]" />
      <div className="absolute top-[30%] right-[20%] w-[30%] h-[30%] rounded-full bg-accent/5 blur-[80px]" />

      {/* Floating particles */}
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary/20"
          style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%` }}
          animate={{
            y: [0, -30, 0],
            x: [0, (p.id % 2 === 0 ? 10 : -10), 0],
            opacity: [0, 0.6, 0],
          }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
        />
      ))}

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 text-center space-y-6"
      >
        {/* Icon with glow */}
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="relative mx-auto w-fit"
        >
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-[-8px] rounded-2xl bg-primary/30 blur-2xl"
          />
          <motion.div
            animate={{ boxShadow: ['0 0 20px hsl(var(--primary)/0.2)', '0 0 40px hsl(var(--primary)/0.4)', '0 0 20px hsl(var(--primary)/0.2)'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="relative w-18 h-18 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-xl"
            style={{ width: 72, height: 72 }}
          >
            <SplashIcon mode={mode} />
          </motion.div>
        </motion.div>

        {/* App name + PRO badge */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex items-center justify-center gap-2"
        >
          <span className="font-heading text-foreground text-xl font-bold">{getAppName(mode)}</span>
          <motion.span
            animate={{
              backgroundPosition: ['0% 50%', '200% 50%'],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="text-[10px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider"
            style={{
              background: 'linear-gradient(90deg, hsl(var(--secondary)) 0%, hsl(var(--primary)) 50%, hsl(var(--secondary)) 100%)',
              backgroundSize: '200% 100%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            PRO
          </motion.span>
        </motion.div>

        {/* Progress bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="w-48 mx-auto"
        >
          <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden backdrop-blur-sm border border-border/10">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--secondary)), hsl(var(--accent)))' }}
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 2.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </motion.div>

        {/* Stage text with crossfade */}
        <div className="h-6 relative">
          <AnimatePresence mode="wait">
            <motion.p
              key={stageIdx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="text-[11px] text-muted-foreground font-medium flex items-center justify-center gap-1.5"
            >
              <span>{SPLASH_STAGES[stageIdx].emoji}</span>
              {SPLASH_STAGES[stageIdx].text}
            </motion.p>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

// URL ↔ Tab path mapping
const TAB_TO_PATH: Record<string, string> = {
  dashboard: '/', syllabus: '/syllabus', daily: '/daily', charts: '/stats', revision: '/review', gamification: '/ai',
};
const PATH_TO_TAB: Record<string, string> = {
  '/': 'dashboard', '/home': 'dashboard', '/syllabus': 'syllabus', '/daily': 'daily', '/stats': 'charts', '/review': 'revision', '/ai': 'gamification',
};

// Overlay paths — open sheets/modals on top of the current tab, each with its own shareable URL
const OVERLAY_PATHS: Record<string, string> = {
  '/profile': 'profile', '/settings': 'profile',
  '/pomodoro': 'pomodoro', '/timer': 'pomodoro',
  '/mcq': 'mcq', '/quiz': 'mcq',
  '/flashcards': 'flashcards',
  '/notifications': 'notifications', '/reminders': 'notifications',
  '/cloud-data': 'cloudData', '/cloud': 'cloudData',
  '/search': 'search',
};

function AppInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: authUser, isLoading: authLoading, loginWithRedirect, logout } = useAuth();
  const cloudSync = useSyncState();
  const [guestMode, setGuestMode] = useState(() => {
    try { return localStorage.getItem('rj-guest-mode-v1') === '1'; } catch { return false; }
  });
  const [guestBannerDismissed, setGuestBannerDismissed] = useState(false);
  const [authScreenMode, setAuthScreenMode] = useState<AuthMode | null>(null);
  const [pomodoroPreFill, setPomodoroPreFill] = useState<{ subjectId?: string; unitId?: string; topicId?: string } | null>(null);
  const [syllabusNavTarget, setSyllabusNavTarget] = useState<{ subjectId?: string; unitId?: string } | null>(null);

  // ── Unified filter state (shared between Dashboard & Charts) ──
  const [diffFilter, setDiffFilter] = useState<'all' | 'Easy' | 'Medium' | 'Hard'>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'weekly' | 'monthly' | 'custom'>('all');
  const [filterCustomFrom, setFilterCustomFrom] = useState('');
  const [filterCustomTo, setFilterCustomTo] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');

  const [appStateRaw, setAppStateRaw] = useLocalStorage<AppState>('nursing-tracker-v6', {
    subjects: [],
    dailyLogs: generateDefaultLogs(DEFAULT_SEMESTER),
    lastUpdated: new Date().toISOString(),
    semesterConfig: DEFAULT_SEMESTER,
    folders: [],
  });
  // Sanitize subjects on every read to prevent React error #300 from corrupt data
  const appState = useMemo(() => {
    const sanitized = sanitizeSubjects(appStateRaw.subjects);
    // Sort by user-defined rank order globally
    const sorted = sanitized.some(s => s.order != null)
      ? [...sanitized].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name))
      : sanitized;
    return { ...appStateRaw, subjects: sorted };
  }, [appStateRaw]);
  const setAppState = setAppStateRaw;
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>('nursing-history-v1', []);
  const [settings, setSettings] = useLocalStorage<UserSettings>('nursing-settings-v2', DEFAULT_SETTINGS);
  /** Always the newest subjects — updated synchronously by every writer, so delayed callbacks (auto-save timers,
   *  undo/redo fired right after a save) never work from a stale snapshot. */
  const latestSubjectsRef = useRef(appState.subjects);
  latestSubjectsRef.current = appState.subjects;
  const [trash, setTrash] = useLocalStorage<TrashItem[]>('nursing-trash-v1', []);
  const [store, setStore] = useLocalStorage<StoreState>('nursing-store-v1', { unlockedItems: [] });
  const [reminders, setReminders] = useLocalStorage<Reminder[]>('nursing-reminders-v1', []);
  const [reminderPopupOpen, setReminderPopupOpen] = useState(false);
  const [dueReminders, setDueReminders] = useState<Reminder[]>([]);
  const [notifCenterOpen, setNotifCenterOpen] = useState(false);
  const { todos, addTodo, toggleTodo, deleteTodo, updateTodo, getTodosForDate, getPendingCountForDate } = useTodos();

  const [activeTab, setActiveTabRaw] = useState<AppTab>(() => {
    // Initialize from URL path first, then fallback to sessionStorage.
    // Exception: if the URL is the root path '/', prefer sessionStorage
    // because mobile browsers often reset the URL to '/' on cold restart
    // from background, discarding the tab the user was actually on.
    const urlTab = PATH_TO_TAB[location.pathname];
    const isRoot = location.pathname === '/' || location.pathname === '';
    if (isRoot) {
      try {
        const stored = sessionStorage.getItem('active-tab') as AppTab | null;
        if (stored && TAB_TO_PATH[stored]) return stored;
      } catch {}
    }
    if (urlTab) return urlTab as AppTab;
    try { return (sessionStorage.getItem('active-tab') as AppTab) || 'dashboard'; } catch { return 'dashboard'; }
  });
  // Wrapper that also updates URL — use startTransition for smooth tab switch
  const setActiveTab = useCallback((tab: AppTab) => {
    startTransition(() => setActiveTabRaw(tab));
    const path = TAB_TO_PATH[tab] || '/';
    if (location.pathname !== path) {
      navigate(path, { replace: false });
    }
    // Scroll to top on tab change — critical UX fix
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [navigate, location.pathname]);
  // On mount: if sessionStorage restored a non-dashboard tab but URL is '/',
  // update the URL to match (fixes mobile cold restart from background)
  useEffect(() => {
    const path = TAB_TO_PATH[activeTab] || '/';
    if ((location.pathname === '/' || location.pathname === '') && path !== '/') {
      navigate(path, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only
  // Sync URL → tab on back/forward navigation (skip overlay paths — handled later)
  useEffect(() => {
    if (OVERLAY_PATHS[location.pathname]) return;
    const urlTab = PATH_TO_TAB[location.pathname] as AppTab | undefined;
    if (urlTab && urlTab !== activeTab) {
      setActiveTabRaw(urlTab);
    }
  }, [location.pathname]);
  useEffect(() => {
    try { sessionStorage.setItem('active-tab', activeTab); } catch {}
  }, [activeTab]);

  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [activeDate, setActiveDate] = useState(() => getLocalDateStr());
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileInitialSection, setProfileInitialSection] = useState<string | undefined>(undefined);
  const [cloudDataOpen, setCloudDataOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(() => {
    try { return !localStorage.getItem('nursetrack-onboarded-v7'); } catch { return false; }
  });
  const [pomodoroOpen, setPomodoroOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mcqOpen, setMcqOpen] = useState(false);
  const [flashcardOpen, setFlashcardOpen] = useState(false);
  const [revisionFilter, setRevisionFilter] = useState<Record<string, string> | undefined>();
  const [pendingTopicDetail, setPendingTopicDetail] = useState<{ topic: import('./types').SubTopic; subjectId: string; unitId: string } | null>(null);
  const [globalTopicDetail, setGlobalTopicDetailRaw] = useState<{ topic: import('./types').SubTopic; subjectId: string; unitId: string } | null>(() => {
    // Bug 1 fix: Restore topic detail sheet from sessionStorage on resume from background
    try {
      const saved = sessionStorage.getItem('nursetrack-topic-detail');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  /** Tracks where the topic detail was opened from — used to restore context on close.
   *  Persisted to sessionStorage so it survives app backgrounding/resume. */
  const topicDetailSourceRef = useRef<'search' | 'syllabus' | 'dashboard' | 'calendar' | 'revision' | 'other'>(
    (() => { try { return (sessionStorage.getItem('nursetrack-topic-source') as 'search' | 'syllabus' | 'dashboard' | 'calendar' | 'revision' | 'other') || 'other'; } catch { return 'other' as const; } })()
  );
  /** When true, search should be reopened with restored state on topic detail close */
  const [searchRestoreOnClose, setSearchRestoreOnClose] = useState(false);
  // Wrapper that persists to sessionStorage for background-resume restoration
  const setGlobalTopicDetail = useCallback((val: React.SetStateAction<{ topic: import('./types').SubTopic; subjectId: string; unitId: string } | null>) => {
    setGlobalTopicDetailRaw(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      try {
        if (next) sessionStorage.setItem('nursetrack-topic-detail', JSON.stringify(next));
        else sessionStorage.removeItem('nursetrack-topic-detail');
      } catch {}
      if (!next) queueMicrotask(() => setGlobalNavList(null));
      return next;
    });
  }, []);
  /** The list the open topic came from (search results, revision list…) — drives swipe / prev / next in the sheet */
  const [globalNavList, setGlobalNavList] = useState<import('./types').TopicNavRef[] | null>(null);
  const savedSearchQuery = useRef((() => {
    try { return sessionStorage.getItem('nursetrack-search-query') || ''; } catch { return ''; }
  })());

  // Reset the restoreState flag after search opens with it
  useEffect(() => {
    if (searchOpen && searchRestoreOnClose) {
      // Reset after one render cycle so GlobalSearch picks it up
      const timer = setTimeout(() => setSearchRestoreOnClose(false), 100);
      return () => clearTimeout(timer);
    }
  }, [searchOpen, searchRestoreOnClose]);

  const [quickCompleteOpen, setQuickCompleteOpen] = useState(false);

  // Back guards — phone back button closes sheets instead of exiting app
  useBackGuard(!!globalTopicDetail, () => {
    const detail = globalTopicDetail;
    setGlobalTopicDetail(null);
    // If topic was opened from search, navigate to its parent Unit Details
    if (topicDetailSourceRef.current === 'search' && detail) {
      topicDetailSourceRef.current = 'other';
      try { sessionStorage.setItem('nursetrack-topic-source', 'other'); } catch {}
      setSearchOpen(false);
      setSyllabusNavTarget({ subjectId: detail.subjectId, unitId: detail.unitId });
      setActiveTabRaw('syllabus');
      navigate('/syllabus');
    }
  });
  useBackGuard(quickCompleteOpen, () => setQuickCompleteOpen(false));
  const [qcSubjectId, setQcSubjectId] = useState('');
  const [qcUnitId, setQcUnitId] = useState('');
  const [qcTopicId, setQcTopicId] = useState('');
  const [qcDate, setQcDate] = useState(() => getLocalDateStr());

  // Sync state
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle');
  const [achievementPopup, setAchievementPopup] = useState<{ id: string; title: string; description: string; icon: string; xp: number; rarity: 'common' | 'rare' | 'epic' | 'legendary' } | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | undefined>(() => {
    try { const v = localStorage.getItem('nursetrack-avatar'); return v || undefined; } catch { return undefined; }
  });
  const [localCoverGradient, setLocalCoverGradient] = useState<string | undefined>(() => {
    try { const v = localStorage.getItem('nursetrack-cover-gradient'); return v || undefined; } catch { return undefined; }
  });
  const [dbSessions, setDbSessions] = useLocalStorage<DbStudySession[]>('nursing-dbsessions-v1', []);
  const dbSessionsRef = useRef(dbSessions);
  dbSessionsRef.current = dbSessions;

  const undoStack = useRef<Subject[][]>([]);
  const redoStack = useRef<Subject[][]>([]);
  const [undoLen, setUndoLen] = useState(0);
  const [redoLen, setRedoLen] = useState(0);

  useTheme(settings.theme, settings.themeMode ?? 'light', settings.glassTone ?? 'auto');

  // Apply text size CSS variables
  useEffect(() => {
    const ts = settings.textSizes;
    document.documentElement.style.setProperty('--text-size-unit', `${ts?.unit ?? 24}px`);
    document.documentElement.style.setProperty('--text-size-module', `${ts?.module ?? 14}px`);
    document.documentElement.style.setProperty('--text-size-topic', `${ts?.topic ?? 16}px`);
  }, [settings.textSizes]);

  // One-time migration: the old "Universal Text Sizes" (presets / custom) are folded into the single
  // px-based text size setting, then removed so there is only one source of truth.
  useEffect(() => {
    const u = settings.universalFontSizes;
    if (!u) return;
    const PRESET_PX: Record<string, Record<'unit' | 'module' | 'topic', number>> = {
      small: { unit: 18, module: 11, topic: 13 }, normal: { unit: 24, module: 14, topic: 16 },
      large: { unit: 28, module: 17, topic: 19 }, xlarge: { unit: 32, module: 20, topic: 22 },
    };
    const toPx = (v: string | undefined, level: 'unit' | 'module' | 'topic'): number | undefined => {
      if (!v) return undefined;
      if (v.startsWith('custom:')) { const n = parseInt(v.slice(7)); return Number.isFinite(n) ? n : undefined; }
      return PRESET_PX[v]?.[level];
    };
    setSettings(prev => {
      if (!prev.universalFontSizes) return prev;
      const uu = prev.universalFontSizes;
      const next = { ...(prev.textSizes || {}) };
      const unit = toPx(uu.unitFontSize, 'unit'); if (unit) next.unit = unit;
      const mod = toPx(uu.moduleFontSize, 'module'); if (mod) next.module = mod;
      const topic = toPx(uu.topicFontSize, 'topic'); if (topic) next.topic = topic;
      return { ...prev, textSizes: next, universalFontSizes: undefined };
    });
  }, [settings.universalFontSizes, setSettings]);

  // Apply density CSS variables
  useEffect(() => {
    const d = settings.density || 'comfortable';
    const padY = d === 'compact' ? '8px' : d === 'spacious' ? '20px' : '14px';
    const padX = d === 'compact' ? '12px' : d === 'spacious' ? '20px' : '16px';
    const gap = d === 'compact' ? '4px' : d === 'spacious' ? '12px' : '8px';
    document.documentElement.style.setProperty('--density-pad-y', padY);
    document.documentElement.style.setProperty('--density-pad-x', padX);
    document.documentElement.style.setProperty('--density-gap', gap);
  }, [settings.density]);

  // Periodic scroll-lock recovery — catches stale locks from HMR or race conditions
  useEffect(() => {
    const id = setInterval(() => forceResetScrollLock(), 5000);
    return () => clearInterval(id);
  }, []);

  // Load data from cloud on login — prefer local data if user already has subjects locally
  useEffect(() => {
    if (!authUser || dataLoaded) return;
    let cancelled = false;

    (async () => {
      setSyncStatus('syncing');
      try {
        const data = await syncData({});
        if (cancelled) return;

        const hasLocalSubjects = appState.subjects.length > 0;

        // Store DB sessions — MERGE cloud with local to avoid losing in-flight sessions
        if (data.studySessions) {
          setDbSessions(prev => {
            const cloudSessions = data.studySessions as DbStudySession[];
            const cloudIds = new Set(cloudSessions.map(s => s.id));
            // Keep ALL local sessions that aren't in cloud yet (temp- AND recently
            // created sessions whose real ID hasn't synced back to the DB query yet)
            const localOnly = prev.filter(s => !cloudIds.has(s.id));
            return [...cloudSessions, ...localOnly];
          });
        }

        // Build backward-compat sessions on dailyLogs from dbSessions
        const sessionsByDate = new Map<string, any[]>();
        ((data.studySessions || []) as any[]).forEach((s: any) => {
          if (!s.date) return;
          if (!sessionsByDate.has(s.date)) sessionsByDate.set(s.date, []);
          sessionsByDate.get(s.date)!.push({
            id: s.id,
            subjectId: normalizeSubjectId(s.subjectId) || 'general',
            subjectName: s.subjectName || s.description || 'Study',
            durationMinutes: s.minutes || 0,
            note: s.note || s.description || '',
            startTime: s.startTime || '',
            endTime: s.endTime || '',
          });
        });

        // Enrich dailyLogs with session data
        const enrichedLogs = (data.dailyLogs as any[]).map((l: any) => ({
          ...l,
          sessions: sessionsByDate.get(l.date) || l.sessions || [],
          hoursStudied: sessionsByDate.has(l.date)
            ? Math.round(sessionsByDate.get(l.date)!.reduce((a: number, s: any) => a + (s.durationMinutes || 0), 0) / 60 * 100) / 100
            : l.hoursStudied,
        }));

        if (!hasLocalSubjects && data.subjects.length > 0) {
          const trashedSubjectIds = new Set(
            JSON.parse(localStorage.getItem('nursing-trash-v1') || '[]')
              .map((t: any) => t.data?.id).filter(Boolean)
          );
          const filteredSubjects = sanitizeSubjects((data.subjects as any[]).filter(
            (s: any) => !trashedSubjectIds.has(s.id)
          ));
          setAppState(prev => ({
            ...prev,
            subjects: filteredSubjects,
            dailyLogs: enrichedLogs.length > 0 ? enrichedLogs : prev.dailyLogs,
            lastUpdated: new Date().toISOString(),
          }));
          toast.success('Restored from your device backup');
        } else if (hasLocalSubjects) {
          // Merge cloud dailyLogs with local — keep whichever has higher hoursStudied per date
          // to avoid losing locally-added session time that hasn't synced yet
          if (enrichedLogs.length > 0) {
            setAppState(prev => {
              const localMap = new Map(prev.dailyLogs.map(l => [l.date, l]));
              const mergedLogs = enrichedLogs.map((cl: any) => {
                const local = localMap.get(cl.date);
                if (!local) return cl;
                // Keep the higher hoursStudied (local may have unsync'd sessions)
                // and merge sessions arrays by ID
                const localSessions = (local.sessions || []) as any[];
                const cloudSessions = (cl.sessions || []) as any[];
                const sessionIds = new Set(cloudSessions.map((s: any) => s.id));
                const mergedSessions = [...cloudSessions, ...localSessions.filter((s: any) => !sessionIds.has(s.id))];
                const mergedHours = Math.max(local.hoursStudied || 0, cl.hoursStudied || 0);
                return { ...cl, sessions: mergedSessions, hoursStudied: mergedHours, mood: cl.mood || local.mood, notes: cl.notes || local.notes };
              });
              // Add local-only dates not in cloud
              const cloudDates = new Set(enrichedLogs.map((l: any) => l.date));
              const localOnlyLogs = prev.dailyLogs.filter(l => !cloudDates.has(l.date));
              return {
                ...prev,
                dailyLogs: [...mergedLogs, ...localOnlyLogs],
                lastUpdated: new Date().toISOString(),
              };
            });
          }
          toast.success('📱 Using local data');
        } else if (data.isNewUser) {
          toast.success('🎉 Welcome! Go to Syllabus tab to add your subjects.');
        }
        if (data.settings && !hasLocalSubjects) setSettings(data.settings);
        if (data.store && !hasLocalSubjects) setStore(data.store);

        // Restore persisted avatar & cover gradient from DB
        if (data.avatar) setLocalAvatar(data.avatar);
        if (data.coverGradient) setLocalCoverGradient(data.coverGradient);

        // Run one-time migration if user has legacy sessionsJson but no StudySessions
        if ((data.studySessions as any[]).length === 0 && (data.dailyLogs as any[]).some((l: any) => l.sessions?.length > 0 || l.sessionsJson)) {
          try {
            const migResult = await migrateSessions({});
            if (migResult.migrated > 0) {
              toast.success(`📦 Migrated ${migResult.migrated} legacy sessions to new format`);
              // Re-sync to get the migrated data
              const freshData = await syncData({});
              if (freshData.studySessions) {
                setDbSessions(prev => {
                  const cloudSessions = freshData.studySessions as DbStudySession[];
                  const cloudIds = new Set(cloudSessions.map(s => s.id));
                  const localOnly = prev.filter(s => !cloudIds.has(s.id));
                  return [...cloudSessions, ...localOnly];
                });
              }
            }
          } catch {
            // Migration failed silently — legacy data still works
          }
        }

        setSyncStatus('saved');
      } catch {
        setSyncStatus('error');
        toast.error('Could not read the on-device copy. Using current data.');
      }
      setDataLoaded(true);
    })();

    return () => { cancelled = true; };
  }, [authUser]);

  // Debounced cloud save for settings
  const debouncedSaveSettings = useDebouncedCallback(async (s: UserSettings, st: StoreState) => {
    if (!authUser) return;
    try {
      setSyncStatus('syncing');
      await saveSettings({
        settingsJson: JSON.stringify(s),
        storeJson: JSON.stringify(st),
      });
      setSyncStatus('saved');
    } catch {
      setSyncStatus('error');
    }
  }, 2000);

  useEffect(() => {
    if (!authUser || !dataLoaded) return;
    debouncedSaveSettings(settings, store);
  }, [settings, store]);

  // Debounced full subject tree save to cloud
  const saveSubjectsToCloud = useDebouncedCallback(async (subjects: Subject[]) => {
    if (!authUser) return;
    try {
      setSyncStatus('syncing');
      await saveSubjects({ subjects: subjects.map(s => ({ id: s.id, name: s.name, shortName: s.shortName, color: s.color, examDate: s.examDate, image: s.image, icon: s.icon, iconShape: s.iconShape, iconSize: s.iconSize, showTopicNumbers: s.showTopicNumbers, hideHashSuffix: s.hideHashSuffix, folderId: s.folderId, order: s.order, units: s.units.map(u => ({ id: u.id, name: u.name, timeSpent: u.timeSpent, timeEntries: u.timeEntries, subTopics: u.subTopics.map(t => ({ id: t.id, name: t.name, completed: t.completed, status: t.status, completedDate: t.completedDate, completedTime: t.completedTime, notes: t.notes, notesArr: t.notesArr, difficulty: t.difficulty, timeSpent: t.timeSpent, timeEntries: t.timeEntries, important: t.important, module: t.module, subModule: t.subModule, topicNumber: t.topicNumber, mcqs: t.mcqs, norcetRelevance: t.norcetRelevance, rank: t.rank, category: t.category, tags: t.tags, resourceLinks: t.resourceLinks, attachments: t.attachments, srsLevel: t.srsLevel, srsDueDate: t.srsDueDate, lastReviewedDate: t.lastReviewedDate })) })) })) });
      setSyncStatus('saved');
    } catch {
      setSyncStatus('error');
    }
  }, 3000);

  // Debounced topic save to cloud
  const saveTopicToCloud = useDebouncedCallback(async (topicId: string, changes: Record<string, any>) => {
    if (!authUser) return;
    try {
      setSyncStatus('syncing');
      await saveTopic({ topicId, changes });
      setSyncStatus('saved');
    } catch {
      setSyncStatus('error');
    }
  }, 500);

  // Debounced daily log save — now only saves day-level metadata
  const saveDailyLogToCloud = useDebouncedCallback(async (log: DailyLog & { _dbId?: string }) => {
    if (!authUser) return;
    try {
      setSyncStatus('syncing');
      await saveDailyLog({
        logId: log._dbId,
        date: log.date,
        mood: log.mood || 'Okay',
        notes: log.notes,
        subjectFocus: log.subjectFocus,
      });
      setSyncStatus('saved');
    } catch {
      setSyncStatus('error');
    }
  }, 1000);

  // Create a study session in the DB and update local state
  // This is the SINGLE SOURCE OF TRUTH for all study time logging.
  // It updates: dbSessions, dailyLogs (backward compat), AND syllabus unit timeSpent/timeEntries.
  const createStudySession = useCallback(async (session: {
    date: string; minutes: number; description: string;
    type: 'Topic' | 'Unit' | 'Other';
    subjectId?: string; subjectName?: string; topicId?: string;
    unitId?: string;
    startTime?: string; endTime?: string; note?: string;
  }) => {
    // Optimistically add to local state
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newDbSession: DbStudySession = {
      id: tempId,
      date: session.date,
      minutes: session.minutes,
      description: session.description,
      type: session.type,
      subjectId: normalizeSubjectId(session.subjectId),
      subjectName: session.subjectName || '',
      topicId: session.topicId,
      unitId: session.unitId,
      startTime: session.startTime,
      endTime: session.endTime,
      note: session.note,
      loggedAt: new Date().toISOString(),
    };

    setDbSessions(prev => [...prev, newDbSession]);

    // Update dailyLog hoursStudied + sessions for backward compat
    const backcompatSession = {
      id: tempId,
      subjectId: normalizeSubjectId(session.subjectId) || 'general',
      subjectName: session.subjectName || session.description,
      durationMinutes: session.minutes,
      note: session.note || session.description,
      startTime: session.startTime || '',
      endTime: session.endTime,
    };

    setAppState(prev => {
      const hrs = session.minutes / 60;

      // ── 1. Update dailyLogs ──
      let newLogs = prev.dailyLogs;
      const existingLog = prev.dailyLogs.find(l => l.date === session.date);
      if (existingLog) {
        newLogs = prev.dailyLogs.map(l => l.date !== session.date ? l : {
          ...l,
          hoursStudied: Math.round((l.hoursStudied + hrs) * 100) / 100,
          sessions: [...(l.sessions || []), backcompatSession],
        });
      } else {
        newLogs = [...prev.dailyLogs, {
          date: session.date,
          hoursStudied: Math.round(hrs * 100) / 100,
          topicsCompleted: 0,
          notes: '',
          subjectFocus: session.subjectName || '',
          sessions: [backcompatSession],
        }];
      }

      // ── 2. Update syllabus unit timeSpent/timeEntries ──
      // Only update unit-level time when there's no topicId (topic time is tracked separately on the topic itself).
      // When subjectId is provided without topicId, distribute to the specified unit or the first unit.
      let newSubjects = prev.subjects;
      if (session.subjectId && !session.topicId) {
        const sub = prev.subjects.find(s => s.id === session.subjectId);
        if (sub) {
          // ONLY update unit time when unitId is explicitly provided — no fallback
          const targetUnitId = session.unitId;
          if (targetUnitId) {
            const timeEntry = { date: session.date, minutes: session.minutes, note: session.note || session.description };
            newSubjects = prev.subjects.map(s => s.id !== session.subjectId ? s : {
              ...s,
              units: s.units.map(u => u.id !== targetUnitId ? u : {
                ...u,
                timeSpent: (u.timeSpent || 0) + session.minutes,
                timeEntries: [...(u.timeEntries || []), timeEntry],
              }),
            });
            // Also sync unit time to cloud
            saveSubjectsToCloud(newSubjects);
          }
        }
      }

      return {
        ...prev,
        subjects: newSubjects,
        dailyLogs: newLogs,
        lastUpdated: new Date().toISOString(),
      };
    });

    // Persist to cloud
    if (authUser) {
      try {
        setSyncStatus('syncing');
        const result = await createSession(session);
        // Replace temp ID with real ID
        setDbSessions(prev => prev.map(s => s.id === tempId ? { ...s, id: result.id } : s));
        setAppState(prev => ({
          ...prev,
          dailyLogs: prev.dailyLogs.map(l => l.date !== session.date ? l : {
            ...l,
            sessions: (l.sessions || []).map((s: any) => s.id === tempId ? { ...s, id: result.id } : s),
          }),
        }));
        setSyncStatus('saved');
      } catch {
        setSyncStatus('error');
      }
    }
  }, [authUser, setAppState, saveSubjectsToCloud]);

  // Update a study session in the DB
  const updateStudySession = useCallback(async (sessionId: string, changes: Partial<DbStudySession>) => {
    // Optimistic update
    setDbSessions(prev => prev.map(s => s.id !== sessionId ? s : { ...s, ...changes }));

    // Update backcompat in dailyLogs
    setAppState(prev => {
      const session = dbSessionsRef.current.find(s => s.id === sessionId) || prev.dailyLogs.flatMap(l => (l.sessions || []) as any[]).find((s: any) => s.id === sessionId);
      if (!session) return prev;

      const oldDate = (session as any).date || prev.dailyLogs.find(l => (l.sessions || []).some((s: any) => s.id === sessionId))?.date;
      const newDate = changes.date || oldDate;

      // If date changed, move session between days
      if (changes.date && changes.date !== oldDate) {
        return {
          ...prev,
          dailyLogs: prev.dailyLogs.map(l => {
            if (l.date === oldDate) {
              const filtered = (l.sessions || []).filter((s: any) => s.id !== sessionId);
              const removedMins = (session as any).durationMinutes || (session as any).minutes || 0;
              return { ...l, sessions: filtered, hoursStudied: Math.max(0, Math.round((l.hoursStudied - removedMins / 60) * 100) / 100) };
            }
            if (l.date === newDate) {
              const mins = changes.minutes || (session as any).durationMinutes || (session as any).minutes || 0;
              return {
                ...l,
                sessions: [...(l.sessions || []), { ...session, ...changes, durationMinutes: mins }],
                hoursStudied: Math.round((l.hoursStudied + mins / 60) * 100) / 100,
              };
            }
            return l;
          }),
          lastUpdated: new Date().toISOString(),
        };
      }

      // Same date — just update in place
      return {
        ...prev,
        dailyLogs: prev.dailyLogs.map(l => {
          if (l.date !== oldDate) return l;
          const oldMins = (l.sessions || []).find((s: any) => s.id === sessionId)?.durationMinutes || 0;
          const newMins = changes.minutes || oldMins;
          const diff = newMins - oldMins;
          return {
            ...l,
            sessions: (l.sessions || []).map((s: any) => s.id !== sessionId ? s : {
              ...s,
              ...changes,
              durationMinutes: newMins,
              subjectName: changes.subjectName || s.subjectName,
              note: changes.note !== undefined ? changes.note : s.note,
            }),
            hoursStudied: Math.max(0, Math.round((l.hoursStudied + diff / 60) * 100) / 100),
          };
        }),
        lastUpdated: new Date().toISOString(),
      };
    });

    if (authUser) {
      try {
        setSyncStatus('syncing');
        await updateSession({ sessionId, ...changes });
        setSyncStatus('saved');
      } catch {
        setSyncStatus('error');
      }
    }
  }, [authUser, setAppState]);

  // Delete a study session from the DB — with undo support
  const deleteStudySession = useCallback(async (sessionId: string) => {
    // Capture the session data BEFORE removing using fresh ref
    const deletedSession = dbSessionsRef.current.find(s => s.id === sessionId);
    let deletedBackcompat: any;
    let deletedDate: string | undefined;

    setDbSessions(prev => prev.filter(s => s.id !== sessionId));

    setAppState(prev => {
      const newLogs = prev.dailyLogs.map(l => {
        const found = (l.sessions || []).find((s: any) => s.id === sessionId);
        if (!found) return l;
        deletedBackcompat = found;
        deletedDate = l.date;
        return {
          ...l,
          sessions: (l.sessions || []).filter((s: any) => s.id !== sessionId),
          hoursStudied: Math.max(0, Math.round((l.hoursStudied - (found.durationMinutes || 0) / 60) * 100) / 100),
        };
      });
      return { ...prev, dailyLogs: newLogs, lastUpdated: new Date().toISOString() };
    });

    // Show undo toast for 5 seconds
    let undone = false;
    toast('Session deleted', {
      action: {
        label: 'UNDO',
        onClick: () => {
          undone = true;
          // Restore session
          if (deletedSession) {
            setDbSessions(prev => [...prev, deletedSession!]);
          }
          if (deletedBackcompat && deletedDate) {
            const bc = deletedBackcompat;
            const dt = deletedDate;
            setAppState(prev => ({
              ...prev,
              dailyLogs: prev.dailyLogs.map(l => {
                if (l.date !== dt) return l;
                return {
                  ...l,
                  sessions: [...(l.sessions || []), bc],
                  hoursStudied: Math.round((l.hoursStudied + (bc.durationMinutes || 0) / 60) * 100) / 100,
                };
              }),
              lastUpdated: new Date().toISOString(),
            }));
          }
          toast.success('Session restored');
        },
      },
      duration: 5000,
    });

    // Persist to cloud after a short delay (to allow undo)
    if (authUser) {
      setTimeout(async () => {
        if (undone) return;
        try {
          setSyncStatus('syncing');
          await deleteSessionEndpoint({ sessionId });
          setSyncStatus('saved');
        } catch {
          setSyncStatus('error');
        }
      }, 5500);
    }
  }, [authUser, setAppState]);

  const stats = useMemo(() => getStats(appState.subjects, appState.dailyLogs, dbSessions), [appState, dbSessions]);
  const srsDueCount = useMemo(() => countDueTopics(appState.subjects), [appState.subjects]);

  // Level requires BOTH XP and syllabus progress
  const xpLevel = useMemo(() => getLevel(stats.xp, stats.pct), [stats.xp, stats.pct]);
  const xpLevelProgress = useMemo(() => getLevelProgress(stats.xp, stats.pct), [stats.xp, stats.pct]);

  const updateSubjects = useCallback((subjects: Subject[]) => {
    const base = latestSubjectsRef.current;
    undoStack.current = [...undoStack.current.slice(-MAX_UNDO + 1), base];
    redoStack.current = [];
    latestSubjectsRef.current = subjects;
    setUndoLen(undoStack.current.length);
    setRedoLen(0);
    setAppState(prev => ({
      ...prev,
      subjects,
      dailyLogs: syncDailyLogsWithSubjects(prev.dailyLogs, prev.subjects, subjects, [activeDate]),
      lastUpdated: new Date().toISOString(),
    }));
    // Sync full tree to cloud (debounced)
    saveSubjectsToCloud(subjects);
  }, [setAppState, activeDate, saveSubjectsToCloud]);

  // Move subject up/down in global rank order
  const handleMoveSubject = useCallback((subjectId: string, direction: 'up' | 'down') => {
    const reordered = moveSubject(appState.subjects, subjectId, direction);
    if (reordered !== appState.subjects) {
      updateSubjects(reordered);
      toast.success(`Subject moved ${direction}`);
    }
  }, [appState.subjects, updateSubjects]);

  /** Apply a restored snapshot everywhere it matters: syllabus, daily logs, trash and cloud. */
  const applySnapshot = useCallback((target: Subject[], previous: Subject[], direction: 'undo' | 'redo') => {
    latestSubjectsRef.current = target;
    setAppState(s => ({
      ...s,
      subjects: target,
      dailyLogs: syncDailyLogsWithSubjects(s.dailyLogs, previous, target, [activeDate]),
      lastUpdated: new Date().toISOString(),
    }));
    const targetIds = new Set(target.map(x => x.id));
    setTrash(items => {
      // A subject brought back by undo must leave the trash (otherwise "restore" would duplicate it)…
      let next = items.filter(it => !(it.type === 'subject' && targetIds.has((it.data as Subject).id)));
      // …and a delete that is redone goes back into the trash.
      if (direction === 'redo') {
        previous.forEach(sj => {
          if (!targetIds.has(sj.id) && !next.some(it => it.type === 'subject' && (it.data as Subject).id === sj.id)) {
            next = [...next, { id: `trash-${Date.now()}-${sj.id}`, type: 'subject', data: sj, deletedAt: new Date().toISOString() }];
          }
        });
      }
      return next.length === items.length && next.every((it, i) => it === items[i]) ? items : next;
    });
    saveSubjectsToCloud(target);
  }, [setAppState, setTrash, activeDate, saveSubjectsToCloud]);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    const current = latestSubjectsRef.current;
    redoStack.current.push(current);
    setUndoLen(undoStack.current.length);
    setRedoLen(redoStack.current.length);
    applySnapshot(prev, current, 'undo');
    toast.info('↩ Undo');
  }, [applySnapshot]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    const current = latestSubjectsRef.current;
    undoStack.current.push(current);
    setUndoLen(undoStack.current.length);
    setRedoLen(redoStack.current.length);
    applySnapshot(next, current, 'redo');
    toast.info('↪ Redo');
  }, [applySnapshot]);

  const updateLogs = useCallback((dailyLogs: DailyLog[]) => {
    setAppState(prev => {
      // Only sync day-level metadata changes (mood, notes, subjectFocus) — session data goes through StudySessions
      const prevLogMap = new Map(prev.dailyLogs.map(l => [l.date, l]));
      dailyLogs.forEach(l => {
        const old = prevLogMap.get(l.date);
        if (!old || old.mood !== l.mood || old.notes !== l.notes || old.subjectFocus !== l.subjectFocus) {
          saveDailyLogToCloud(l);
        }
      });
      return { ...prev, dailyLogs, lastUpdated: new Date().toISOString() };
    });
  }, [setAppState, saveDailyLogToCloud]);

  const updateFolders = useCallback((folders: Folder[]) => {
    setAppState(prev => ({ ...prev, folders, lastUpdated: new Date().toISOString() }));
  }, [setAppState]);

  const addHistoryEntries = useCallback((entries: HistoryEntry[]) => {
    setHistory(prev => [...entries, ...prev].slice(0, MAX_HISTORY));
  }, [setHistory]);

  const handleToggleTopicGlobal = useCallback((subjectId: string, unitId: string, topicId: string) => {
    const s = appState.subjects.find(x => x.id === subjectId);
    const u = s?.units.find(x => x.id === unitId);
    const t = u?.subTopics.find(x => x.id === topicId);
    if (!s || !u || !t) return;
    const nc = !t.completed;
    const now = new Date();
    const dateStr = getLocalDateStr(now);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    addHistoryEntries([{
      id: `${Date.now()}-${topicId}`, type: nc ? 'topic_complete' : 'topic_uncomplete',
      timestamp: now.toISOString(), date: dateStr, time: timeStr,
      subjectName: s.shortName, subjectColor: s.color, unitName: u.name, topicName: t.name,
      icon: nc ? '✅' : '↩️',
    }]);

    // Preserve existing completedDate if the topic already had one — don't overwrite with today
    const preservedDate = nc ? (t.completedDate || dateStr) : undefined;
    const preservedTime = nc ? (t.completedTime || timeStr) : undefined;

    const newSubjects = appState.subjects.map(x => x.id !== subjectId ? x : {
      ...x, units: x.units.map(y => y.id !== unitId ? y : {
        ...y, subTopics: y.subTopics.map(z => z.id !== topicId ? z : {
          ...z, completed: nc, status: nc ? 'complete' as const : 'incomplete' as const,
          completedDate: preservedDate, completedTime: preservedTime,
        })
      })
    });
    updateSubjects(newSubjects);

    // Keep globalTopicDetail in sync if this topic is currently open
    if (globalTopicDetail && globalTopicDetail.topic.id === topicId) {
      const freshTopic = newSubjects.find(x => x.id === subjectId)?.units.find(y => y.id === unitId)?.subTopics.find(z => z.id === topicId);
      if (freshTopic) setGlobalTopicDetail(prev => prev ? { ...prev, topic: freshTopic } : null);
    }

    // Sync topic to cloud
    saveTopicToCloud(topicId, {
      completed: nc,
      status: nc ? 'complete' : 'incomplete',
      completedDate: preservedDate ?? null,
      completedTime: preservedTime ?? null,
    });
  }, [appState.subjects, updateSubjects, addHistoryEntries, saveTopicToCloud, globalTopicDetail]);

  const handlePomodoroComplete_inner = useCallback((data: { minutes: number; subjectId?: string; unitId?: string; topicId?: string; mode?: 'pomodoro' | 'countdown' | 'stopwatch'; cycle?: boolean; startedAt?: number; endedAt?: number; note?: string }) => {
    const { minutes, subjectId, unitId, topicId } = data;
    const sessionEnd = new Date(data.endedAt || Date.now());
    const sessionStart = new Date(data.startedAt || sessionEnd.getTime() - minutes * 60_000);
    const today = getLocalDateStr(sessionEnd);
    const modeTag = data.mode === 'stopwatch' ? 'Stopwatch' : 'Countdown';

    // Find subject/topic names for the session
    const subject = subjectId ? appState.subjects.find(s => s.id === subjectId) : undefined;
    const unit = unitId ? subject?.units.find(u => u.id === unitId) : undefined;
    const topic = topicId ? unit?.subTopics.find(t => t.id === topicId) : undefined;

    // Create a first-class DB session
    const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    createStudySession({
      date: today,
      minutes,
      description: topic ? `[${modeTag}] ${topic.name}` : subject ? `[${modeTag}] ${subject.shortName}` : `[${modeTag}] Focus Session`,
      type: topicId ? 'Topic' : 'Other',
      subjectId: subjectId || '',
      subjectName: subject?.shortName || '',
      topicId: topicId || undefined,
      unitId: unitId || undefined,
      startTime: hhmm(sessionStart),
      endTime: hhmm(sessionEnd),
      note: data.note,
    });

    // Also update topic timeSpent AND add a timeEntry so it shows in topic details
    if (subjectId && unitId && topicId) {
      setAppState(prev => {
        const prevTopic = prev.subjects.find(s => s.id === subjectId)?.units.find(u => u.id === unitId)?.subTopics.find(t => t.id === topicId);
        const isRevision = prevTopic?.completed || prevTopic?.status === 'complete';
        const timerMode = modeTag;
        const newEntry = {
          date: today,
          minutes,
          status: (isRevision ? 'complete' : (prevTopic?.status || 'in_process')) as import('./types').TopicStatus,
          note: [isRevision ? `[Revision ${timerMode}] ${minutes}min` : `[${timerMode}] ${minutes}min`, data.note].filter(Boolean).join(' — '),
        };
        const subjects = prev.subjects.map(s => s.id !== subjectId ? s : {
          ...s, units: s.units.map(u => u.id !== unitId ? u : {
            ...u, subTopics: u.subTopics.map(t => t.id !== topicId ? t : {
              ...t,
              timeSpent: t.timeSpent + minutes,
              timeEntries: [...(t.timeEntries || []), newEntry],
            })
          })
        });
        if (prevTopic) {
          saveTopicToCloud(topicId, {
            timeSpent: prevTopic.timeSpent + minutes,
            timeEntries: [...(prevTopic.timeEntries || []), newEntry],
          });
        }
        return { ...prev, subjects, lastUpdated: new Date().toISOString() };
      });
    }
  }, [appState.subjects, setAppState, saveTopicToCloud, createStudySession]);

  // Global timer state — persists across navigation and sheet close/open
  const [timerState, timerActions] = useGlobalTimer(settings.pomodoroSettings, handlePomodoroComplete_inner);
  const notifyExtra = useMemo(() => {
    const sub = appState.subjects.find(x => x.id === timerState.subjectId);
    return { unitName: sub?.units.find(u => u.id === timerState.unitId)?.name ?? '', subjectColor: sub?.color ?? '' };
  }, [appState.subjects, timerState.subjectId, timerState.unitId]);
  useTimerNotifications(timerState, settings.pomodoroSettings, notifyExtra);
  const timerCtxValue = useMemo(() => ({ state: timerState, actions: timerActions }), [timerState, timerActions]);

  // ── Stable callbacks (so memoised children are not re-rendered by fresh inline lambdas) ──
  const openProfile = useCallback(() => setProfileOpen(true), []);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const openReminders = useCallback(() => setNotifCenterOpen(true), []);
  const openCloudData = useCallback(() => setCloudDataOpen(true), []);
  const openPomodoro = useCallback(() => setPomodoroOpen(true), []);

  // Automatic backups read the newest data through this ref, so a scheduled backup never works from a stale snapshot.
  const backupCtxRef = useRef<BackupContext | null>(null);
  backupCtxRef.current = authUser
    ? { appState, subjects: appState.subjects, settings, history, trash, user: authUser as unknown as BackupContext['user'] }
    : null;
  useEffect(() => { registerBackupContext(() => backupCtxRef.current); }, []);

  // "Start focus" from a reminder notification.
  const timerActionsRef = useRef(timerActions);
  timerActionsRef.current = timerActions;
  const timerStateRef = useRef(timerState);
  timerStateRef.current = timerState;
  const subjectsRef = useRef(appState.subjects);
  subjectsRef.current = appState.subjects;

  /**
   * Tap on the running timer (notification, floating chip): jump straight to the topic being studied —
   * its own window, with the live timer card — or to the Focus Timer when the session is not linked to a topic.
   */
  const openRunningTopic = useCallback((ids?: { subjectId?: string; unitId?: string; topicId?: string }, attempt = 0) => {
    // Cold start from the notification: the syllabus may still be loading — wait for it instead of guessing.
    if (subjectsRef.current.length === 0 && attempt < 16) {
      setTimeout(() => openRunningTopic(ids, attempt + 1), 500);
      return;
    }
    const t = timerStateRef.current;
    const sId = ids?.subjectId || t.subjectId;
    const uId = ids?.unitId || t.unitId;
    const tId = ids?.topicId || t.topicId;
    const unit = subjectsRef.current.find(x => x.id === sId)?.units.find(u => u.id === uId);
    const topic = unit?.subTopics.find(x => x.id === tId);
    if (!topic) { setPomodoroOpen(true); return; }
    topicDetailSourceRef.current = 'other';
    try { sessionStorage.setItem('nursetrack-topic-source', 'other'); } catch {}
    setPomodoroOpen(false);
    setProfileOpen(false);
    setSearchOpen(false);
    setGlobalNavList(null);
    setGlobalTopicDetail({ topic, subjectId: sId, unitId: uId });
  }, [setGlobalTopicDetail]);
  useEffect(() => {
    const onAction = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id === 'start-focus') {
        setPomodoroOpen(true);
        const s = timerStateRef.current;
        if (s.appMode !== 'stopwatch' && !s.active) timerActionsRef.current.toggle();
      } else if (id === 'timer-notes') {
        setPomodoroOpen(true);
        setTimeout(() => window.dispatchEvent(new Event('rj:focus-note')), 450);
      } else if (id === 'timer-topic') {
        const d = (e as CustomEvent<{ subjectId?: string; unitId?: string; topicId?: string }>).detail;
        openRunningTopic(d);
      } else if (id === 'timer-open') {
        setPomodoroOpen(true);
      } else if (id === 'open-progress') {
        setProfileOpen(false); setPomodoroOpen(false);
        startTransition(() => setActiveTab('dashboard'));
        setTimeout(() => document.getElementById('progress-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 500);
      } else if (id === 'open-report') {
        startTransition(() => setActiveTab('charts'));
      } else if (id === 'open-history') {
        startTransition(() => setActiveTab('history'));
      } else if (id === 'open-settings') {
        setProfileInitialSection('focus');
        setProfileOpen(true);
      }
    };
    window.addEventListener('rj:native-action', onAction);
    // The Focus Timer sheet's "Open topic" button asks for the same navigation.
    const onOpenTopic = () => openRunningTopic(undefined);
    window.addEventListener('rj:open-running-topic', onOpenTopic);
    return () => {
      window.removeEventListener('rj:native-action', onAction);
      window.removeEventListener('rj:open-running-topic', onOpenTopic);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRunningTopic]);
  const clearPendingTopic = useCallback(() => setPendingTopicDetail(null), []);
  const clearSyllabusNavTarget = useCallback(() => setSyllabusNavTarget(null), []);
  const goHome = useCallback(() => { setSlideDir(null); startTransition(() => setActiveTab('dashboard')); }, [setActiveTab]);
  const handleSideNavChange = useCallback((t: AppTab) => { setSlideDir(null); startTransition(() => setActiveTab(t)); }, [setActiveTab]);
  const handleBottomNavChange = useCallback((tab: AppTab, dir?: 'left' | 'right') => { setSlideDir(dir ?? null); setRevisionFilter(undefined); startTransition(() => setActiveTab(tab)); }, [setActiveTab]);
  const handleThemeToggle = useCallback(() => setSettings(prev => {
    const cur = prev.themeMode ?? 'light';
    // Liquid Glass: the quick toggle flips its light / dark tone instead of leaving the theme
    if (cur === 'glass') {
      const dark = isDarkCanvas('glass', prev.glassTone ?? 'auto');
      return { ...prev, glassTone: dark ? 'light' : 'dark' };
    }
    const next = cur === 'light' ? 'amoled' : cur === 'amoled' ? 'ancient' : 'light';
    return { ...prev, themeMode: next };
  }), [setSettings]);
  const handleLevelClick = useCallback(() => { setProfileInitialSection('achievements'); setProfileOpen(true); }, []);
  const handleNavigateToCalendar = useCallback((date: string) => { setActiveDate(date); setSlideDir(null); startTransition(() => setActiveTab('charts')); }, [setActiveTab]);
  const handleOpenTopicFromCharts = useCallback((topic: import('./types').SubTopic, sId: string, uId: string) => {
    setPendingTopicDetail({ topic, subjectId: sId, unitId: uId });
    startTransition(() => setActiveTab('syllabus'));
  }, [setActiveTab]);
  const todayTopicsDone = useMemo(() => {
    const today = getLocalDateStr();
    let n = 0;
    for (const s of appState.subjects) for (const u of s.units) for (const t of u.subTopics) if (t.completed && t.completedDate === today) n++;
    return n;
  }, [appState.subjects]);

  const handleImport = useCallback((state: AppState) => { setAppState(state); }, [setAppState]);

  const handleReset = useCallback(() => {
    setAppState({ subjects: [], dailyLogs: generateDefaultLogs(DEFAULT_SEMESTER), lastUpdated: new Date().toISOString(), semesterConfig: DEFAULT_SEMESTER, folders: [] });
    setHistory([]); setTrash([]);
    undoStack.current = []; redoStack.current = [];
    setUndoLen(0); setRedoLen(0);
    localStorage.removeItem('nursing-gamification-v2');
  }, [setAppState, setHistory, setTrash]);

  const handleClearHistory = useCallback(() => { setHistory([]); }, [setHistory]);
  const handleTrackingModeChange = useCallback((mode: 'hours' | 'topics') => { setSettings(prev => ({ ...prev, trackingMode: mode })); }, [setSettings]);
  const updateExams = useCallback((exams: ExamConfig[]) => { setAppState(prev => ({ ...prev, semesterConfig: { ...prev.semesterConfig, exams } })); }, [setAppState]);

  const trashSubject = useCallback((subjectId: string) => {
    const subject = latestSubjectsRef.current.find(s => s.id === subjectId);
    if (!subject) return;
    setTrash(prev => [...prev, { id: `trash-${Date.now()}`, type: 'subject', data: subject, deletedAt: new Date().toISOString() }]);
    updateSubjects(latestSubjectsRef.current.filter(s => s.id !== subjectId));
    toast.success('Subject moved to trash');
  }, [setTrash, updateSubjects]);

  const restoreTrash = useCallback((trashId: string) => {
    const item = trash.find(t => t.id === trashId);
    if (!item) return;
    setAppState(prev => ({ ...prev, subjects: [...prev.subjects, item.data], lastUpdated: new Date().toISOString() }));
    setTrash(prev => prev.filter(t => t.id !== trashId));
    toast.success('Subject restored!');
  }, [trash, setAppState, setTrash]);

  const deleteTrash = useCallback((trashId: string) => {
    const item = trash.find(t => t.id === trashId);
    if (item?.data?.id) {
      deleteRecords({ subjectIds: [item.data.id] }).catch(() => {});
    }
    setTrash(prev => prev.filter(t => t.id !== trashId));
    toast.success('Permanently deleted');
  }, [trash, setTrash]);

  const emptyTrash = useCallback(() => {
    const subjectIds = trash.map(t => t.data?.id).filter(Boolean);
    if (subjectIds.length > 0) {
      deleteRecords({ subjectIds }).catch(() => {});
    }
    setTrash([]);
  }, [trash, setTrash]);

  const handleImportSubjects = useCallback((newSubjects: Subject[]) => {
    updateSubjects([...appState.subjects, ...newSubjects]);
  }, [appState.subjects, updateSubjects]);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    try { localStorage.setItem('nursetrack-onboarded-v7', 'true'); } catch {}
  }, []);

  const handleNavigate = useCallback((tab: string, filter?: Record<string, string>) => {
    setSlideDir(null);
    if (tab === 'syllabus' && filter && (filter.subjectId || filter.unitId)) {
      setSyllabusNavTarget({ subjectId: filter.subjectId, unitId: filter.unitId });
    }
    if (filter && !filter.subjectId && !filter.unitId) setRevisionFilter(filter);
    else setRevisionFilter(undefined);
    startTransition(() => setActiveTab(tab as AppTab));
  }, []);

  const handleUpdateSettings = useCallback((partial: Partial<UserSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, [setSettings]);

  const handleUpdateUser = useCallback((updatedUser: import('./types').User) => {
    // Update local state immediately
    setLocalAvatar(updatedUser.avatar);
    setLocalCoverGradient(updatedUser.coverGradient);
    // Persist to localStorage for instant reload
    try {
      if (updatedUser.avatar) localStorage.setItem('nursetrack-avatar', updatedUser.avatar);
      else localStorage.removeItem('nursetrack-avatar');
      if (updatedUser.coverGradient) localStorage.setItem('nursetrack-cover-gradient', updatedUser.coverGradient);
      else localStorage.removeItem('nursetrack-cover-gradient');
    } catch {}
    // Save avatar/coverGradient to the account so every device sees the same photo
    if (!authUser) return;
    // Display name (edited in the profile editor): applied instantly and saved to the account
    const nextName = (updatedUser.name ?? '').trim();
    const currentName = `${authUser.firstName || ''} ${authUser.lastName || ''}`.trim();
    if (nextName && nextName !== currentName) {
      const [firstName, ...rest] = nextName.split(/\s+/);
      saveProfile({ firstName, lastName: rest.join(' ') });
    }
    const changes: Record<string, string | undefined> = {};
    if (updatedUser.avatar !== undefined) changes.avatar = updatedUser.avatar;
    if (updatedUser.coverGradient !== undefined) changes.coverGradient = updatedUser.coverGradient;
    if (Object.keys(changes).length > 0) {
      saveSettings(changes).catch(() => {});
      updateAccountProfile(changes).catch(() => { /* retried on the next profile edit */ });
    }
  }, [authUser]);

  // ── Overlay URL routing — every sheet/modal gets its own shareable link ──
  const overlayStateRef = useRef({ profile: false, pomodoro: false, mcq: false, flashcards: false, notifications: false, cloudData: false, search: false });

  // URL → overlay state (handles bookmarks, page refresh, browser back/forward)
  useEffect(() => {
    const path = location.pathname;
    const overlayKey = OVERLAY_PATHS[path];
    if (overlayKey) {
      if (overlayKey === 'profile') setProfileOpen(true);
      else if (overlayKey === 'pomodoro') setPomodoroOpen(true);
      else if (overlayKey === 'mcq') setMcqOpen(true);
      else if (overlayKey === 'flashcards') setFlashcardOpen(true);
      else if (overlayKey === 'notifications') setNotifCenterOpen(true);
      else if (overlayKey === 'cloudData') setCloudDataOpen(true);
      else if (overlayKey === 'search') setSearchOpen(true);
    } else {
      // Navigated to a non-overlay path (tab or back) — close all overlays
      setProfileOpen(false);
      setPomodoroOpen(false);
      setMcqOpen(false);
      setFlashcardOpen(false);
      setNotifCenterOpen(false);
      setCloudDataOpen(false);
      setSearchOpen(false);
    }
  }, [location.pathname]);

  // Overlay state → URL (when overlays are opened/closed from buttons & code)
  useEffect(() => {
    const prev = overlayStateRef.current;
    const tabPath = TAB_TO_PATH[activeTab] || '/';
    // Detect overlay opened → push overlay URL
    if (profileOpen && !prev.profile) navigate('/profile');
    else if (pomodoroOpen && !prev.pomodoro) navigate('/pomodoro');
    else if (mcqOpen && !prev.mcq) navigate('/mcq');
    else if (flashcardOpen && !prev.flashcards) navigate('/flashcards');
    else if (notifCenterOpen && !prev.notifications) navigate('/notifications');
    else if (cloudDataOpen && !prev.cloudData) navigate('/cloud-data');
    else if (searchOpen && !prev.search) navigate('/search');
    // Detect overlay closed → navigate back to current tab
    else if (!profileOpen && prev.profile && location.pathname === '/profile') navigate(tabPath, { replace: true });
    else if (!pomodoroOpen && prev.pomodoro && location.pathname === '/pomodoro') navigate(tabPath, { replace: true });
    else if (!mcqOpen && prev.mcq && location.pathname === '/mcq') navigate(tabPath, { replace: true });
    else if (!flashcardOpen && prev.flashcards && location.pathname === '/flashcards') navigate(tabPath, { replace: true });
    else if (!notifCenterOpen && prev.notifications && location.pathname === '/notifications') navigate(tabPath, { replace: true });
    else if (!cloudDataOpen && prev.cloudData && location.pathname === '/cloud-data') navigate(tabPath, { replace: true });
    else if (!searchOpen && prev.search && location.pathname === '/search') navigate(tabPath, { replace: true });
    overlayStateRef.current = { profile: profileOpen, pomodoro: pomodoroOpen, mcq: mcqOpen, flashcards: flashcardOpen, notifications: notifCenterOpen, cloudData: cloudDataOpen, search: searchOpen };
  }, [profileOpen, pomodoroOpen, mcqOpen, flashcardOpen, notifCenterOpen, cloudDataOpen, searchOpen, location.pathname, activeTab, navigate]);

  // beforeunload — flush pending saves & warn if timer running
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      // Flush all debounced saves immediately
      debouncedSaveSettings.flush();
      saveSubjectsToCloud.flush();
      saveTopicToCloud.flush();
      saveDailyLogToCloud.flush();

      // The Focus Timer is persisted and restored on launch, so closing the app mid-session is safe:
      // no "leave site?" prompt (it used to appear on every close, timer or not).
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [timerState.phase, debouncedSaveSettings, saveSubjectsToCloud, saveTopicToCloud, saveDailyLogToCloud]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(p => !p); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  // ── Reminder check: on load + every 60s ──
  const lastPopupClosedAt = useRef(0);
  const hasCheckedOnLoad = useRef(false);
  const shownReminderIds = useRef(new Set<string>());
  const remindersRef = useRef(reminders);
  remindersRef.current = reminders;

  // Initial load: show nextAppOpen reminders + regular due, then clear nextAppOpen flags
  useEffect(() => {
    if (hasCheckedOnLoad.current) return;
    hasCheckedOnLoad.current = true;

    // Get all due reminders including those marked for next app open
    const due = getDueReminders(reminders, true);
    setDueReminders(due);
    due.forEach(r => shownReminderIds.current.add(r.id));

    // Clear nextAppOpen flags after showing them (use setTimeout to avoid re-triggering)
    const nextOpenIds = reminders.filter(r => r.nextAppOpen).map(r => r.id);
    if (nextOpenIds.length > 0) {
      setTimeout(() => {
        setReminders(prev => prev.map(r => nextOpenIds.includes(r.id) ? { ...r, nextAppOpen: false } : r));
      }, 500);
    }

    if (due.length > 0) {
      // Small delay to avoid racing with the 60s interval
      setTimeout(() => setReminderPopupOpen(true), 100);
    }
  }, []);

  // Periodic check: every 60s, find NEW due reminders not yet shown this session
  useEffect(() => {
    const id = setInterval(() => {
      const due = getDueReminders(remindersRef.current, false);
      // Only show reminders not already shown this session
      const newDue = due.filter(r => !shownReminderIds.current.has(r.id));
      if (newDue.length > 0) {
        newDue.forEach(r => shownReminderIds.current.add(r.id));
        setDueReminders(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          return [...prev, ...newDue.filter(r => !existingIds.has(r.id))];
        });
        const recentlyClosed = Date.now() - lastPopupClosedAt.current < 5000;
        if (!recentlyClosed) {
          setReminderPopupOpen(true);
        }
      }
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const handleDismissReminder = useCallback((id: string) => {
    const today = getTodayStr();
    setReminders(prev => prev.map(r => r.id === id ? { ...r, dismissedDates: [...r.dismissedDates, today] } : r));
    setDueReminders(prev => prev.filter(r => r.id !== id));
  }, [setReminders]);

  const handleSnoozeReminder = useCallback((id: string, until: string) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, snoozedUntil: until } : r));
    setDueReminders(prev => prev.filter(r => r.id !== id));
    toast.success('⏰ Reminder snoozed');
  }, [setReminders]);

  const handleTogglePinReminder = useCallback((id: string) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, pinned: !r.pinned } : r));
  }, [setReminders]);

  const handleCompleteReminder = useCallback((id: string) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, completedAt: new Date().toISOString(), enabled: false } : r));
    setDueReminders(prev => prev.filter(r => r.id !== id));
    toast.success('✅ Reminder completed');
  }, [setReminders]);

  const handleNextAppOpenReminder = useCallback((id: string) => {
    // Mark for next app open — set nextAppOpen flag, don't add to dismissedDates
    // so it will show again on next session launch via getDueReminders(_, true)
    setReminders(prev => prev.map(r => r.id === id ? { ...r, nextAppOpen: true, snoozedUntil: undefined } : r));
    setDueReminders(prev => prev.filter(r => r.id !== id));
    toast.success('🔄 Will show on next app open');
  }, [setReminders]);

  // The sheet must always show the CURRENT topic (undo / redo, timers and other screens change it behind the sheet's back),
  // not the snapshot that was captured when it was opened.
  const liveGlobalDetail = useMemo(() => {
    if (!globalTopicDetail) return null;
    const { topic, subjectId, unitId } = globalTopicDetail;
    const inPlace = appState.subjects.find(s => s.id === subjectId)?.units.find(u => u.id === unitId)?.subTopics.find(t => t.id === topic.id);
    if (inPlace) return { topic: inPlace, subjectId, unitId };
    for (const sj of appState.subjects) for (const un of sj.units) {
      const t = un.subTopics.find(x => x.id === topic.id);
      if (t) return { topic: t, subjectId: sj.id, unitId: un.id }; // moved to another unit / subject
    }
    return null; // deleted (e.g. by undo)
  }, [globalTopicDetail, appState.subjects]);
  useEffect(() => {
    if (globalTopicDetail && !liveGlobalDetail) setGlobalTopicDetail(null);
  }, [globalTopicDetail, liveGlobalDetail, setGlobalTopicDetail]);

  // Prev / next for the global topic sheet: follows the list the topic was opened from, else its unit's order
  const globalNav = useMemo(() => {
    if (!globalTopicDetail) return null;
    const curId = globalTopicDetail.topic.id;
    let list: import('./types').TopicNavRef[] | null = globalNavList && globalNavList.some(r => r.topicId === curId) ? globalNavList : null;
    if (!list) {
      const unit = appState.subjects.find(s => s.id === globalTopicDetail.subjectId)?.units.find(u => u.id === globalTopicDetail.unitId);
      list = (unit?.subTopics || []).map(t => ({ subjectId: globalTopicDetail.subjectId, unitId: globalTopicDetail.unitId, topicId: t.id }));
    }
    const index = list.findIndex(r => r.topicId === curId);
    return { list, index, total: list.length, hasPrev: index > 0, hasNext: index >= 0 && index < list.length - 1 };
  }, [globalTopicDetail, globalNavList, appState.subjects]);

  const handleGlobalNavigate = useCallback((dir: 'prev' | 'next') => {
    if (!globalNav || globalNav.index < 0) return;
    const step = dir === 'prev' ? -1 : 1;
    // skip topics that were deleted / moved since the list was built
    for (let i = globalNav.index + step; i >= 0 && i < globalNav.list.length; i += step) {
      const ref = globalNav.list[i];
      const topic = appState.subjects.find(s => s.id === ref.subjectId)?.units.find(u => u.id === ref.unitId)?.subTopics.find(t => t.id === ref.topicId);
      if (topic) { setGlobalTopicDetail({ topic, subjectId: ref.subjectId, unitId: ref.unitId }); return; }
    }
  }, [globalNav, appState.subjects, setGlobalTopicDetail]);

  const handleOpenGlobalTopicDetail = useCallback((topic: import('./types').SubTopic, subjectId: string, unitId: string, navList?: import('./types').TopicNavRef[]) => {
    setGlobalNavList(navList && navList.length > 1 ? navList : null);
    setGlobalTopicDetail({ topic, subjectId, unitId });
  }, []);

  const handleSaveGlobalTopic = useCallback((updatedTopic: import('./types').SubTopic) => {
    if (!globalTopicDetail) return;
    const { subjectId, unitId } = globalTopicDetail;

    // Session creation is now handled at point-of-entry (addTime / timer) in TopicDetailSheet.
    // This handler only persists the topic data — no session creation here.

    updateSubjects(latestSubjectsRef.current.map(s => s.id !== subjectId ? s : {
      ...s, units: s.units.map(u => u.id !== unitId ? u : {
        ...u, subTopics: u.subTopics.map(t => t.id !== updatedTopic.id ? t : updatedTopic)
      })
    }));
    // Update the snapshot so detail sheet reflects the save immediately
    setGlobalTopicDetail(prev => prev ? { ...prev, topic: updatedTopic } : null);
    saveTopicToCloud(updatedTopic.id, {
      ...updatedTopic,
      resourcesJson: updatedTopic.resourceLinks ? JSON.stringify(updatedTopic.resourceLinks) : undefined,
      attachmentsJson: updatedTopic.attachments ? JSON.stringify(updatedTopic.attachments) : undefined,
      mcqsJson: updatedTopic.mcqs ? JSON.stringify(updatedTopic.mcqs) : undefined,
      notesArrayJson: updatedTopic.notesArr ? JSON.stringify(updatedTopic.notesArr) : undefined,
    });
  }, [globalTopicDetail, updateSubjects, saveTopicToCloud]);

  const handleDeleteGlobalTopic = useCallback(() => {
    if (!globalTopicDetail) return;
    const { subjectId, unitId, topic } = liveGlobalDetail ?? globalTopicDetail;
    updateSubjects(latestSubjectsRef.current.map(s => {
      if (s.id !== subjectId) return s;
      const updated = {
        ...s, units: s.units.map(u => u.id !== unitId ? u : {
          ...u, subTopics: u.subTopics.filter(t => t.id !== topic.id)
        })
      };
      return renumberTopicNumbers(updated);
    }));
    setGlobalTopicDetail(null);
  }, [globalTopicDetail, liveGlobalDetail, updateSubjects]);

  // Auth loading — ultra-premium animated splash
  const studentMode = settings.studentMode || 'nursing';

  const studentModeKnown = studentMode;

  // Account → data lifecycle. The engine only runs while an account is signed in;
  // guest mode keeps everything purely on this device.
  useEffect(() => {
    if (!authUser) {
      stopSyncEngine();
      return;
    }
    startSyncEngine();
    return () => stopSyncEngine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  // Any part of the app can request the premium auth screen (guest banner, AI gate…).
  useEffect(() => {
    const onOpen = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: AuthMode }>).detail?.mode;
      setAuthScreenMode(mode === 'signup' ? 'signup' : 'signin');
    };
    const onSignedOut = () => setAuthScreenMode(null);
    const onOpenSyncCenter = () => {
      setProfileOpen(false);
      setCloudDataOpen(true);
    };
    window.addEventListener('rj:open-auth', onOpen);
    window.addEventListener('rj:cloud-signed-out', onSignedOut);
    window.addEventListener('rj:open-sync-center', onOpenSyncCenter);
    return () => {
      window.removeEventListener('rj:open-auth', onOpen);
      window.removeEventListener('rj:cloud-signed-out', onSignedOut);
      window.removeEventListener('rj:open-sync-center', onOpenSyncCenter);
    };
  }, []);

  // Signed in (first time or returning) → close any auth overlay.
  useEffect(() => { if (authUser) setAuthScreenMode(null); }, [authUser]);

  // The guest choice is remembered so a reload does not bounce the student back
  // to the sign-in screen (offline-first means offline stays offline).
  useEffect(() => {
    try {
      if (authUser) localStorage.removeItem('rj-guest-mode-v1');
      else if (guestMode) localStorage.setItem('rj-guest-mode-v1', '1');
    } catch { /* ignore */ }
  }, [authUser, guestMode]);

  const continueOffline = useCallback(() => {
    setGuestMode(true);
    setAuthScreenMode(null);
    try { localStorage.setItem('rj-guest-mode-v1', '1'); } catch { /* ignore */ }
    toast.success('Offline mode — everything stays on this device');
  }, []);

  if (authLoading) {
    return <SplashScreen mode={studentModeKnown} />;
  }

  // Not signed in: the premium account screen is the front door.
  if (!authUser && !guestMode) {
    return (
      <>
        <Toaster position="top-center" />
        <Suspense fallback={<SplashScreen mode={studentModeKnown} />}>
          <AuthScreen
            mode={authScreenMode ?? 'signin'}
            onContinueOffline={continueOffline}
          />
        </Suspense>
      </>
    );
  }

  const isGuest = !authUser && guestMode;

  // One headline status for the header + Sync Center, derived from the engine.
  const cloudSyncStatus: 'idle' | 'syncing' | 'saved' | 'error' = isGuest
    ? 'idle'
    : cloudSync.phase === 'syncing' ? 'syncing'
      : cloudSync.phase === 'synced' ? 'saved'
        : (cloudSync.phase === 'error' || cloudSync.phase === 'offline') ? 'error'
          : 'idle';

  // Build user object from auth or guest
  const user = isGuest ? {
    email: 'guest@demo.local',
    name: 'Guest User',
    avatar: '👀',
    loginTime: new Date().toISOString(),
    coverGradient: '0',
  } : {
    email: authUser!.email,
    name: `${authUser!.firstName || ''} ${authUser!.lastName || ''}`.trim() || authUser!.email.split('@')[0],
    avatar: localAvatar ?? authUser!.image ?? '🎓',
    loginTime: new Date().toISOString(),
    coverGradient: localCoverGradient ?? authUser!.coverGradient ?? '0',
  };

  const handleLogout = async () => {
    if (isGuest) {
      setGuestMode(false);
      try { localStorage.removeItem('rj-guest-mode-v1'); } catch { /* ignore */ }
      return;
    }
    setProfileOpen(false);
    setCloudDataOpen(false);
    try { localStorage.removeItem('nursetrack-was-authenticated'); } catch { /* ignore */ }
    try { await logout(); } catch { /* the local session is cleared regardless */ }
  };

  const handleOpenPomodoroForSubject = (subjectId: string, unitId?: string, topicId?: string) => {
    // Link topic in global timer state
    const s = appState.subjects.find(x => x.id === subjectId);
    const u = unitId ? s?.units.find(x => x.id === unitId) : undefined;
    const t = topicId ? u?.subTopics.find(x => x.id === topicId) : undefined;
    if (subjectId) {
      timerActions.linkTopic(subjectId, unitId || '', topicId || '', t?.name || '', s?.name || '');
    }
    setPomodoroPreFill({ subjectId, unitId, topicId });
    setPomodoroOpen(true);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return (
        <ErrorBoundary fallbackTitle="Dashboard failed to load">
          <Suspense fallback={<PageSkeleton />}>
            <Dashboard subjects={appState.subjects} dailyLogs={appState.dailyLogs} studyGoals={settings.studyGoals}
              trackingMode={settings.trackingMode || 'topics'} onNavigate={handleNavigate} onUpdateLogs={updateLogs}
              semesterConfig={appState.semesterConfig} settings={settings} onUpdateSettings={handleUpdateSettings}
              onToggleTopic={handleToggleTopicGlobal} onOpenProfile={openProfile}
              onOpenTopicDetail={handleOpenGlobalTopicDetail}
              onAddTodo={addTodo}
              dbSessions={dbSessions}
              onUpdateSession={updateStudySession} onDeleteSession={deleteStudySession}
              diffFilter={diffFilter} onDiffFilterChange={setDiffFilter}
              timeFilter={timeFilter} onTimeFilterChange={setTimeFilter}
              customFrom={filterCustomFrom} customTo={filterCustomTo}
              onCustomFromChange={setFilterCustomFrom} onCustomToChange={setFilterCustomTo}
              subjectFilter={subjectFilter} onSubjectFilterChange={setSubjectFilter}
              onMoveSubject={handleMoveSubject} />
          </Suspense>
        </ErrorBoundary>
      );
      case 'syllabus': return (
        <ErrorBoundary fallbackTitle="Syllabus failed to load">
          <Suspense fallback={<PageSkeleton />}>
            <SyllabusTracker subjects={appState.subjects} onUpdate={updateSubjects} activeLogDate={activeDate} onHistoryLog={addHistoryEntries} canUndo={undoLen > 0} canRedo={redoLen > 0} onUndo={handleUndo} onRedo={handleRedo} onImportSubjects={handleImportSubjects} onTrashSubject={trashSubject} dailyLogs={appState.dailyLogs} onUpdateLogs={updateLogs} pendingTopicDetail={pendingTopicDetail} onClearPendingTopic={clearPendingTopic} onOpenPomodoro={handleOpenPomodoroForSubject} folders={appState.folders || []} onUpdateFolders={updateFolders} navTarget={syllabusNavTarget} onClearNavTarget={clearSyllabusNavTarget} onCreateSession={createStudySession} />
          </Suspense>
        </ErrorBoundary>
      );
      case 'daily':
      case 'charts': return (
        <ErrorBoundary fallbackTitle="Charts failed to load">
          <Suspense fallback={<PageSkeleton />}>
            <ChartsView subjects={appState.subjects} dailyLogs={appState.dailyLogs} onUpdateLogs={updateLogs} studyGoals={settings.studyGoals}
              activeDate={activeDate} onDateChange={setActiveDate} trackingMode={settings.trackingMode || 'topics'} onTrackingModeChange={handleTrackingModeChange}
              onCreateSession={createStudySession} onUpdateSession={updateStudySession} onDeleteSession={deleteStudySession} onUpdateSubjects={updateSubjects}
              settings={settings} onUpdateSettings={setSettings}
              dbSessions={dbSessions}
              exams={appState.semesterConfig?.exams || []}
              diffFilter={diffFilter} timeFilter={timeFilter} customFrom={filterCustomFrom} customTo={filterCustomTo} subjectFilter={subjectFilter}
              onNavigateToCalendar={handleNavigateToCalendar}
              onNavigate={handleNavigate}
              todos={todos} addTodo={addTodo} toggleTodo={toggleTodo} deleteTodo={deleteTodo} updateTodo={updateTodo} getTodosForDate={getTodosForDate} getPendingCountForDate={getPendingCountForDate}
              onOpenTopicDetail={handleOpenTopicFromCharts} />
          </Suspense>
        </ErrorBoundary>
      );
      case 'revision': return (
        <ErrorBoundary fallbackTitle="Revision Panel failed to load">
          <Suspense fallback={<PageSkeleton />}>
            <RevisionPanel subjects={appState.subjects} onUpdate={updateSubjects} initialFilter={revisionFilter} onOpenTopicDetail={handleOpenGlobalTopicDetail} onNavigate={handleNavigate} />
          </Suspense>
        </ErrorBoundary>
      );
      case 'gamification': return (
        <ErrorBoundary fallbackTitle="AI Chat failed to load">
          <Suspense fallback={<PageSkeleton />}>
            <AIChat subjects={appState.subjects} dailyLogs={appState.dailyLogs} settings={settings} exams={appState.semesterConfig.exams} userName={user.name} dbSessions={dbSessions} />
          </Suspense>
        </ErrorBoundary>
      );
      default: return (
        <ErrorBoundary fallbackTitle="Dashboard failed to load">
          <Suspense fallback={<PageSkeleton />}>
            <Dashboard subjects={appState.subjects} dailyLogs={appState.dailyLogs} studyGoals={settings.studyGoals}
              trackingMode={settings.trackingMode || 'topics'} onNavigate={handleNavigate} onUpdateLogs={updateLogs}
              semesterConfig={appState.semesterConfig} settings={settings} onUpdateSettings={handleUpdateSettings}
              onToggleTopic={handleToggleTopicGlobal} onOpenProfile={openProfile}
              onOpenTopicDetail={handleOpenGlobalTopicDetail}
              onAddTodo={addTodo}
              dbSessions={dbSessions}
              onUpdateSession={updateStudySession} onDeleteSession={deleteStudySession}
              diffFilter={diffFilter} onDiffFilterChange={setDiffFilter}
              timeFilter={timeFilter} onTimeFilterChange={setTimeFilter}
              customFrom={filterCustomFrom} customTo={filterCustomTo}
              onCustomFromChange={setFilterCustomFrom} onCustomToChange={setFilterCustomTo}
              subjectFilter={subjectFilter} onSubjectFilterChange={setSubjectFilter}
              onMoveSubject={handleMoveSubject} />
          </Suspense>
        </ErrorBoundary>
      );
    }
  };

  return (
    <TimerProvider value={timerCtxValue}>
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Toaster position="top-center" closeButton toastOptions={{
        style: { background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', border: '1px solid hsl(var(--border) / 0.5)', borderRadius: 14, fontSize: 13, boxShadow: '0 4px 16px hsl(var(--foreground) / 0.06), 0 1px 3px hsl(var(--foreground) / 0.04)' },
      }} />

      <TopHeader user={user} pct={stats.pct} onOpenProfile={openProfile}
        onNavigateHome={goHome}
        themeMode={settings.themeMode ?? 'light'}
        streakDays={stats.streak}
        todayTopicsDone={todayTopicsDone}
        onToggleTheme={handleThemeToggle}
        level={xpLevel}
        xpProgress={xpLevelProgress}
        onLevelClick={handleLevelClick}
        onOpenSearch={openSearch}
        syncStatus={isGuest ? 'idle' : cloudSyncStatus}
        dueReminders={dueReminders.length + todos.filter(t => !t.completed && t.dueDate <= getLocalDateStr()).length}
        onOpenReminders={openReminders}
        studentMode={studentMode}
        onOpenCloudData={openCloudData} />

      {/* Sync indicator — inline below header with dismiss */}
      {isGuest && !guestBannerDismissed && (
        <div className="flex items-center justify-center gap-2 py-2 material-ultra-thin border-b border-chart-4/10">
          <button onClick={() => loginWithRedirect({ mode: 'signup' })}
            className="flex items-center gap-2 text-[11px] font-semibold text-chart-4 hover:text-chart-4/80 transition-colors">
            <span className="w-1.5 h-1.5 rounded-full bg-chart-4 animate-pulse" />
            Guest Mode — Sign up to sync your data
          </button>
          <button onClick={() => setGuestBannerDismissed(true)}
            className="w-5 h-5 rounded-full bg-muted/40 flex items-center justify-center hover:bg-muted/60 transition-colors shrink-0"
            aria-label="Dismiss">
            <span className="text-[10px] text-muted-foreground leading-none">✕</span>
          </button>
        </div>
      )}

      <div className="flex max-w-full bg-background min-h-[calc(100vh-3.5rem)]">
        <SideNav activeTab={activeTab} onTabChange={handleSideNavChange} onOpenProfile={openProfile} srsDueCount={srsDueCount} />
        <main className="flex-1 px-3 sm:px-4 py-4 pb-36 lg:pb-4 max-w-6xl mx-auto w-full">
          <div key={activeTab} className="animate-page-enter min-h-[50vh]">
              {renderContent()}
          </div>
        </main>
      </div>

      <BottomNav activeTab={activeTab} onTabChange={handleBottomNavChange} srsDueCount={srsDueCount} onOpenProfile={openProfile} profileOpen={profileOpen} />

      {/* Unified FAB — hidden on AI tab to avoid overlap */}
      {activeTab !== 'gamification' && <UnifiedFAB
        onOpenQuickComplete={() => { setQcDate(getLocalDateStr()); setQcSubjectId(''); setQcUnitId(''); setQcTopicId(''); setQuickCompleteOpen(true); }}
        onOpenPomodoro={openPomodoro}
        timerRunning={timerState.active}
      />}

      {/* Floating Mini-Player — hidden on AI tab to avoid overlap */}
      {activeTab !== 'gamification' && <FloatingTimer timer={timerState} onClick={() => openRunningTopic()}
        totalSec={(!timerState.cycle || timerState.phase === 'focus' ? timerState.focusDuration : timerState.phase === 'short' ? settings.pomodoroSettings.shortBreakMin : settings.pomodoroSettings.longBreakMin) * 60} />}

      <BottomSheet open={pomodoroOpen} onClose={() => { setPomodoroOpen(false); setPomodoroPreFill(null); }} title="⏱️ Focus Timer">
        <ErrorBoundary fallbackTitle="Focus Timer crashed">
          <Suspense fallback={<div className="h-40 flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
            <FocusTimer onSessionComplete={handlePomodoroComplete_inner} settings={settings.pomodoroSettings} subjects={appState.subjects}
              initialSubjectId={pomodoroPreFill?.subjectId} initialUnitId={pomodoroPreFill?.unitId} initialTopicId={pomodoroPreFill?.topicId} />
          </Suspense>
        </ErrorBoundary>
      </BottomSheet>

      {/* MCQ Practice Sheet */}
      <BottomSheet open={mcqOpen} onClose={() => setMcqOpen(false)} title="🧠 MCQ Practice">
        <ErrorBoundary fallbackTitle="MCQ Practice crashed">
          <Suspense fallback={<div className="h-40 flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
            <MCQPractice onClose={() => setMcqOpen(false)} />
          </Suspense>
        </ErrorBoundary>
      </BottomSheet>

      {/* Flashcard Deck Sheet */}
      <BottomSheet open={flashcardOpen} onClose={() => setFlashcardOpen(false)} title="🃏 AI Flashcards">
        <ErrorBoundary fallbackTitle="Flashcard Deck crashed">
          <Suspense fallback={<div className="h-40 flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
            <FlashcardDeck onClose={() => setFlashcardOpen(false)} />
          </Suspense>
        </ErrorBoundary>
      </BottomSheet>

      {/* Quick Complete Sheet */}
      <BottomSheet open={quickCompleteOpen} onClose={() => setQuickCompleteOpen(false)} title="✅ Quick Complete">
        <QuickCompleteForm
          subjects={appState.subjects}
          date={qcDate} onDateChange={setQcDate}
          subjectId={qcSubjectId} onSubjectChange={(v) => { setQcSubjectId(v); setQcUnitId(''); setQcTopicId(''); }}
          unitId={qcUnitId} onUnitChange={(v) => { setQcUnitId(v); setQcTopicId(''); }}
          topicId={qcTopicId} onTopicChange={setQcTopicId}
          onSubmit={() => {
            if (!qcSubjectId || !qcUnitId || !qcTopicId) return;
            const s = appState.subjects.find(x => x.id === qcSubjectId);
            const u = s?.units.find(x => x.id === qcUnitId);
            const t = u?.subTopics.find(x => x.id === qcTopicId);
            if (!s || !u || !t) return;
            const timeStr = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
            addHistoryEntries([{
              id: `${Date.now()}-${qcTopicId}`, type: 'topic_complete',
              timestamp: new Date().toISOString(), date: qcDate, time: timeStr,
              subjectName: s.shortName, subjectColor: s.color, unitName: u.name, topicName: t.name, icon: '✅',
            }]);
            updateSubjects(appState.subjects.map(x => x.id !== qcSubjectId ? x : {
              ...x, units: x.units.map(y => y.id !== qcUnitId ? y : {
                ...y, subTopics: y.subTopics.map(z => z.id !== qcTopicId ? z : {
                  ...z, completed: true, status: 'complete' as const, completedDate: qcDate, completedTime: timeStr,
                })
              })
            }));
            saveTopicToCloud(qcTopicId, { completed: true, status: 'complete', completedDate: qcDate, completedTime: timeStr });
            toast.success(`✅ ${t.name} marked complete`);
            setQuickCompleteOpen(false);
          }}
        />
      </BottomSheet>

      {/* Global Topic Detail Sheet (opened from Dashboard etc.) */}
      <Suspense fallback={null}>
        <TopicDetailSheet
          open={!!globalTopicDetail}
          onClose={() => {
            const detail = globalTopicDetail;
            setGlobalTopicDetail(null);
            // If topic was opened from search, navigate to its parent Unit Details
            if (topicDetailSourceRef.current === 'search' && detail) {
              topicDetailSourceRef.current = 'other';
              try { sessionStorage.setItem('nursetrack-topic-source', 'other'); } catch {}
              setSearchOpen(false);
              setSyllabusNavTarget({ subjectId: detail.subjectId, unitId: detail.unitId });
              setActiveTabRaw('syllabus');
              navigate('/syllabus');
            }
          }}
          sheetZIndex={65}
          topic={liveGlobalDetail?.topic ?? globalTopicDetail?.topic ?? null}
          onSave={handleSaveGlobalTopic}
          onDelete={handleDeleteGlobalTopic}
          canUndo={undoLen > 0}
          canRedo={redoLen > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onOpenPomodoro={globalTopicDetail ? () => handleOpenPomodoroForSubject(globalTopicDetail.subjectId, globalTopicDetail.unitId, globalTopicDetail.topic.id) : undefined}
          subjectId={liveGlobalDetail?.subjectId ?? globalTopicDetail?.subjectId}
          unitId={liveGlobalDetail?.unitId ?? globalTopicDetail?.unitId}
          subjectName={globalTopicDetail ? appState.subjects.find(s => s.id === globalTopicDetail.subjectId)?.name : undefined}
          subjectShortName={globalTopicDetail ? appState.subjects.find(s => s.id === globalTopicDetail.subjectId)?.shortName : undefined}
          unitName={globalTopicDetail ? appState.subjects.find(s => s.id === globalTopicDetail.subjectId)?.units.find(u => u.id === globalTopicDetail.unitId)?.name : undefined}
          onNavigatePrev={() => handleGlobalNavigate('prev')}
          onNavigateNext={() => handleGlobalNavigate('next')}
          hasPrev={!!globalNav?.hasPrev}
          hasNext={!!globalNav?.hasNext}
          topicIndex={globalNav && globalNav.index >= 0 ? globalNav.index : undefined}
          totalTopics={globalNav && globalNav.index >= 0 ? globalNav.total : undefined}
          availableSubjects={appState.subjects}
          onCreateSession={createStudySession}
          onMoveToSubject={(newSubjectId, newUnitId) => {
            if (!globalTopicDetail) return;
            const { subjectId: oldSubjId, unitId: oldUnitId, topic: t } = liveGlobalDetail ?? globalTopicDetail;
            // Remove topic from old location
            const subjectsAfterRemove = latestSubjectsRef.current.map(s => s.id !== oldSubjId ? s : {
              ...s, units: s.units.map(u => u.id !== oldUnitId ? u : {
                ...u, subTopics: u.subTopics.filter(tp => tp.id !== t.id)
              })
            });
            // Add topic to new location
            const subjectsAfterAdd = subjectsAfterRemove.map(s => s.id !== newSubjectId ? s : {
              ...s, units: s.units.map(u => u.id !== newUnitId ? u : {
                ...u, subTopics: [...u.subTopics, t]
              })
            });
            updateSubjects(subjectsAfterAdd);
            setGlobalTopicDetail({ ...globalTopicDetail, subjectId: newSubjectId, unitId: newUnitId });
          }}
          onRenameTopic={(newName) => {
            if (!globalTopicDetail) return;
            handleSaveGlobalTopic({ ...(liveGlobalDetail ?? globalTopicDetail).topic, name: newName });
          }}
          onNavigateToTopic={(sId, uId, tId) => {
            const sub = appState.subjects.find(s => s.id === sId);
            const unit = sub?.units.find(u => u.id === uId);
            const topic = unit?.subTopics.find(t => t.id === tId);
            if (topic) setGlobalTopicDetail({ topic, subjectId: sId, unitId: uId });
          }}
        />
      </Suspense>

      {/* Reminder Popup */}
      {reminderPopupOpen && dueReminders.length > 0 && (
        <Suspense fallback={null}>
          <ReminderPopup
            reminders={dueReminders}
            onDismiss={handleDismissReminder}
            onSnooze={handleSnoozeReminder}
            onTogglePin={handleTogglePinReminder}
            onComplete={handleCompleteReminder}
            onNextAppOpen={handleNextAppOpenReminder}
            onClose={() => { lastPopupClosedAt.current = Date.now(); setReminderPopupOpen(false); }}
          />
        </Suspense>
      )}

      {/* Notification Center (Bell icon) */}
      <Suspense fallback={null}>
        <NotificationCenter
          open={notifCenterOpen}
          onClose={() => setNotifCenterOpen(false)}
          todos={todos}
          onAddTodo={addTodo}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
          onUpdateTodo={updateTodo}
          reminders={reminders}
          dueReminders={dueReminders}
          onUpdateReminders={setReminders}
          subjects={appState.subjects}
          streakDays={stats.streak}
          todayTopicsDone={appState.subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed && t.completedDate === getLocalDateStr()).length, 0), 0)}
          onNavigate={(tab) => { setNotifCenterOpen(false); handleNavigate(tab); }}
          onNavigateToDate={(date) => {
            setActiveDate(date);
            setNotifCenterOpen(false);
            setSlideDir(null);
            startTransition(() => setActiveTab('charts'));
          }}
        />
      </Suspense>

      <GlobalSearch open={searchOpen} onClose={() => { savedSearchQuery.current = ''; clearSearchSnapshot(); try { sessionStorage.removeItem('nursetrack-search-query'); } catch {} setSearchOpen(false); }} subjects={appState.subjects} onToggleTopic={handleToggleTopicGlobal} onOpenPomodoro={handleOpenPomodoroForSubject} initialQuery={savedSearchQuery.current} onQueryChange={(q: string) => { savedSearchQuery.current = q; try { sessionStorage.setItem('nursetrack-search-query', q); } catch {} }} restoreState={searchRestoreOnClose} onOpenTopicDetail={(topic, subjectId, unitId, navList) => { setGlobalNavList(navList && navList.length > 1 ? navList : null); topicDetailSourceRef.current = 'search'; try { sessionStorage.setItem('nursetrack-topic-source', 'search'); } catch {} setSearchOpen(false); setSearchRestoreOnClose(false); setGlobalTopicDetail({ topic, subjectId, unitId }); }} onOpenUnitEditor={(subjectId, unitId) => { setSearchOpen(false); setSyllabusNavTarget({ subjectId, unitId }); setActiveTabRaw('syllabus'); navigate('/syllabus'); }} />
      <MilestoneToast subjects={appState.subjects} dailyLogs={appState.dailyLogs} studyGoals={settings.studyGoals} />
      <AchievementPopup achievement={achievementPopup} onDismiss={() => setAchievementPopup(null)} />
      <NotificationContainer />
      <InstallBanner />
      <HelpModal open={helpOpen} onClose={closeHelp} />

      <AnimatePresence>
        {cloudDataOpen && (
          <Suspense fallback={<div className="fixed inset-0 z-[100] bg-background flex items-center justify-center"><div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
            <SyncCenter
              appState={appState} settings={settings} history={history} trash={trash} reminders={reminders}
              dbSessions={dbSessions} dailyLogs={appState.dailyLogs}
              onClose={() => setCloudDataOpen(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Guest → account upgrade: full-screen premium auth */}
      <AnimatePresence>
        {isGuest && authScreenMode && (
          <Suspense fallback={null}>
            <AuthScreen
              mode={authScreenMode}
              onClose={() => setAuthScreenMode(null)}
              onContinueOffline={() => setAuthScreenMode(null)}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* First-sync decision + "cloud changes applied" refresh */}
      <Suspense fallback={null}>
        <CloudGate />
      </Suspense>

      <AnimatePresence>
        {profileOpen && (
          <ErrorBoundary fallbackTitle="Profile failed to load">
          <Suspense fallback={<div className="fixed inset-0 z-[100] bg-background flex items-center justify-center"><div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
            <ProfilePage
              user={user} onUpdateUser={handleUpdateUser}
              subjects={appState.subjects} dailyLogs={appState.dailyLogs}
              appState={appState} settings={settings} onUpdateSettings={setSettings}
              onImport={handleImport} onReset={handleReset} onClearHistory={handleClearHistory}
              history={history} exams={appState.semesterConfig.exams} onUpdateExams={updateExams}
              onPomodoroComplete={handlePomodoroComplete_inner}
              trash={trash} onRestoreTrash={restoreTrash} onDeleteTrash={deleteTrash} onEmptyTrash={emptyTrash}
              onClose={() => { setProfileOpen(false); setProfileInitialSection(undefined); }} onLogout={handleLogout}
              initialSection={profileInitialSection}
              reminders={reminders} onUpdateReminders={setReminders}
              onOpenHelp={() => { setProfileOpen(false); setHelpOpen(true); }}
              onOpenAi={() => { setProfileOpen(false); handleBottomNavChange('gamification'); }}
              dbSessions={dbSessions}
            />
          </Suspense>
          </ErrorBoundary>
        )}
      </AnimatePresence>
    </div>
    </TimerProvider>
  );
}

function UnifiedFAB({ onOpenQuickComplete, onOpenPomodoro, timerRunning }: {
  onOpenQuickComplete: () => void;
  onOpenPomodoro: () => void;
  timerRunning: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="fixed bottom-[6rem] right-4 lg:bottom-6 lg:right-6 z-[55] flex flex-col items-center gap-2">
      <AnimatePresence>
        {expanded && (
          <>
            <motion.button
              key="qc"
              initial={{ opacity: 0, scale: 0.6, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: 16 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28, mass: 0.6 }}
              onClick={() => { setExpanded(false); onOpenQuickComplete(); }}
              className="w-11 h-11 rounded-[14px] bg-secondary text-secondary-foreground flex items-center justify-center"
              style={{ boxShadow: '0 2px 8px hsl(var(--secondary) / 0.20), 0 6px 18px hsl(var(--secondary) / 0.12)' }}
              aria-label="Quick Complete"
            >
              <CheckCircle2 className="w-5 h-5" />
            </motion.button>
            <motion.button
              key="pomo"
              initial={{ opacity: 0, scale: 0.6, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: 16 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28, mass: 0.6, delay: 0.04 }}
              onClick={() => { setExpanded(false); onOpenPomodoro(); }}
              className="w-11 h-11 rounded-[14px] bg-chart-4 text-white flex items-center justify-center"
              style={{ boxShadow: '0 2px 8px hsl(var(--chart-4) / 0.20), 0 6px 18px hsl(var(--chart-4) / 0.12)' }}
              aria-label="Focus Timer"
            >
              <Timer className="w-5 h-5" />
            </motion.button>
          </>
        )}
      </AnimatePresence>
      <motion.button
        onClick={() => setExpanded(p => !p)}
        whileTap={{ scale: 0.92 }}
        animate={{ rotate: expanded ? 45 : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className={`w-14 h-14 rounded-[18px] flex items-center justify-center transition-colors ${timerRunning ? 'bg-chart-4' : 'bg-primary'} text-primary-foreground`}
        style={{ boxShadow: `0 2px 8px hsl(var(--primary) / 0.22), 0 6px 20px hsl(var(--primary) / 0.14)` }}
        aria-label="Actions"
      >
        {timerRunning ? <Timer className="w-5.5 h-5.5" /> : <Plus className="w-6 h-6" />}
      </motion.button>
    </div>
  );
}

function QuickCompleteForm({ subjects, date, onDateChange, subjectId, onSubjectChange, unitId, onUnitChange, topicId, onTopicChange, onSubmit }: {
  subjects: import('./types').Subject[];
  date: string; onDateChange: (v: string) => void;
  subjectId: string; onSubjectChange: (v: string) => void;
  unitId: string; onUnitChange: (v: string) => void;
  topicId: string; onTopicChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const selectedSubject = subjects.find(s => s.id === subjectId);
  const selectedUnit = selectedSubject?.units.find(u => u.id === unitId);
  const incompleteTopics = selectedUnit?.subTopics.filter(t => !t.completed) || [];

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-bold text-foreground/70">Date</Label>
        <Input type="date" value={date} onChange={e => onDateChange(e.target.value)} className="mt-1 h-10 text-sm" />
      </div>
      <div>
        <Label className="text-xs font-bold text-foreground/70">Subject</Label>
        <Select value={subjectId} onValueChange={onSubjectChange}>
          <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue placeholder="Select subject..." /></SelectTrigger>
          <SelectContent>
            {subjects.map(s => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.shortName} — {s.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selectedSubject && (
        <div>
          <Label className="text-xs font-bold text-foreground/70">Unit</Label>
          <Select value={unitId} onValueChange={onUnitChange}>
            <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue placeholder="Select unit..." /></SelectTrigger>
            <SelectContent>
              {selectedSubject.units.map((u, i) => (
                <SelectItem key={u.id} value={u.id}>Unit {i + 1}: {u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {selectedUnit && (
        <div>
          <Label className="text-xs font-bold text-foreground/70">Topic ({incompleteTopics.length} incomplete)</Label>
          <Select value={topicId} onValueChange={onTopicChange}>
            <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue placeholder="Select topic..." /></SelectTrigger>
            <SelectContent>
              {incompleteTopics.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Button className="w-full h-11 text-sm font-bold gap-2" onClick={onSubmit}
        disabled={!subjectId || !unitId || !topicId}>
        <CheckCircle2 className="w-4 h-4" /> Mark Complete ✅
      </Button>
    </div>
  );
}

// ═══════ App wrapper with BrowserRouter for URL-based routing ═══════
export default function App() {
  return (
    <NotificationProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Routes>
          <Route path="*" element={<AppInner />} />
        </Routes>
      </BrowserRouter>
    </NotificationProvider>
  );
}
