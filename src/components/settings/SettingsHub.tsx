import { useState, useMemo, useRef, useEffect, useCallback, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown, ChevronRight, CornerDownLeft } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import type { Subject, DailyLog, User, AppState, UserSettings, HistoryEntry, ExamConfig, TrashItem, Reminder, DbStudySession } from '../../types';
import { getStats } from '../../lib/gamification';
import { normalizeText, tokenizeQuery, scoreTitle, fuzzyIncludesAll } from '../../lib/searchUtils';
import HighlightText from '../shared/HighlightText';
import GamificationPanel from '../GamificationPanel';
import ExamCountdown from '../ExamCountdown';
import ReminderManager from '../reminders/ReminderManager';
import OverviewTab from '../profile/OverviewTab';
import AiDevicePanel from '../platform/AiDevicePanel';
import AppIconPanel from '../platform/AppIconPanel';
import NotificationsPanel from '../platform/NotificationsPanel';
import AutoBackupPanel from '../platform/AutoBackupPanel';
import CloudSettingsPanel from '../cloud/CloudSettingsPanel';
import DataHub, { type DataHubTab } from '../data/DataHub';
import TextLayoutSettings from './TextLayoutSettings';
import ZoomSettings from './ZoomSettings';
import {
  DisplayModeSettings, AccentColorSettings, StudentModeSettings, StudyGoalsSettings, SRSSettings,
  PomodoroSettingsPanel, HelpGuideSettings, KeyboardShortcutsSettings,
} from './SettingsSections';

/* ═══════════════════════════════════════════════════════════════════════
   SETTINGS HUB
   One searchable, categorised home for every preference in the app.

   Categories  →  Settings (sub-categories)  →  controls
   ═══════════════════════════════════════════════════════════════════════ */

export interface SettingsHubProps {
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
  reminders?: Reminder[];
  onUpdateReminders?: (r: Reminder[]) => void;
  onOpenHelp?: () => void;
  dbSessions?: DbStudySession[];
  initialSection?: string;
  /** Opens the profile editor sheet (owned by ProfilePage). */
  onEditProfile?: () => void;
  /** When provided, the search box renders into this element (the sticky header) instead of inline. */
  searchSlot?: HTMLElement | null;
  /** Ask the hub to open a setting from outside (status chips). Change `n` to re-trigger. */
  jump?: { id: string; n: number } | null;
}

export type ItemId =
  | 'analytics' | 'achievements'
  | 'displayMode' | 'accent' | 'textLayout' | 'zoom'
  | 'studentMode' | 'goals' | 'exams' | 'srs'
  | 'pomodoroTool' | 'pomodoroPrefs'
  | 'reminders'
  | 'aiDevice'
  | 'appIcon'
  | 'notifications'
  | 'autoBackup'
  | 'cloudSync' | 'profile' | 'dataHub'
  | 'shortcuts' | 'help';

interface ItemMeta { id: ItemId; icon: string; title: string; description: string; keywords: string[] }
interface CategoryMeta { id: string; icon: string; title: string; subtitle: string; items: ItemMeta[] }

const CATEGORIES: CategoryMeta[] = [
  {
    id: 'account', icon: '👤', title: 'Profile & Account', subtitle: 'Your name, photo, password and log out',
    items: [
      { id: 'profile', icon: '✏️', title: 'Edit Profile', description: 'Change your name, photo and cover, update your password, or log out', keywords: ['profile', 'name', 'photo', 'avatar', 'picture', 'cover', 'email', 'password', 'account', 'logout', 'log out', 'sign out', 'signout', 'edit', 'personal', 'information', 'delete account'] },
    ],
  },
  {
    id: 'cloud', icon: '☁️', title: 'Cloud & Sync', subtitle: 'Your account, devices and multi-device sync',
    items: [
      { id: 'cloudSync', icon: '☁️', title: 'Account & Devices', description: 'Sign in, sync now, see every device, restore points and conflicts', keywords: ['cloud', 'sync', 'account', 'login', 'sign in', 'sign up', 'password', 'device', 'devices', 'multi device', 'restore point', 'backup', 'online', 'server', 'merge', 'conflict', 'email'] },
    ],
  },
  {
    id: 'insights', icon: '📊', title: 'Progress & Rewards', subtitle: 'Your stats, streaks, badges and XP',
    items: [
      { id: 'analytics', icon: '📈', title: 'Study Analytics', description: 'Lifetime stats, difficulty breakdown, calendar and subject progress', keywords: ['stats', 'statistics', 'progress', 'breakdown', 'chart', 'heatmap', 'lifetime', 'time'] },
      { id: 'achievements', icon: '🏆', title: 'Achievements & Rewards', description: 'Badges, XP, levels, coins and the reward store', keywords: ['badge', 'xp', 'level', 'milestone', 'gamification', 'coins', 'store', 'streak'] },
    ],
  },
  {
    id: 'appearance', icon: '🎨', title: 'Appearance & Display', subtitle: 'Theme, accent colour, text size and layout',
    items: [
      { id: 'displayMode', icon: '🌗', title: 'Display Mode', description: 'Parchment, Ink or Papyrus — light and dark themes', keywords: ['theme', 'dark', 'light', 'mode', 'amoled', 'night', 'parchment', 'ink', 'papyrus', 'sepia', 'ancient'] },
      { id: 'accent', icon: '🎨', title: 'Accent Colour', description: 'The highlight colour used across the app', keywords: ['color', 'colour', 'accent', 'palette', 'tint', 'highlight'] },
      { id: 'zoom', icon: '🔍', title: 'Zoom', description: 'Zoom the whole app in or out, with a live preview', keywords: ['zoom', 'scale', 'magnify', 'bigger', 'smaller', 'larger', 'enlarge', 'shrink', 'size', 'tablet', 'landscape', 'display', 'percent', 'fit', 'whole app', 'everything', 'preview', 'pinch', 'in', 'out'] },
      { id: 'textLayout', icon: '🔤', title: 'Text Size & Layout', description: 'Unit, module and topic font sizes, presets and row density', keywords: ['text', 'font', 'size', 'bigger', 'smaller', 'large', 'small', 'universal', 'density', 'compact', 'spacious', 'spacing', 'readable', 'unit', 'module', 'topic', 'layout'] },
    ],
  },
  {
    id: 'study', icon: '🎓', title: 'Study Setup', subtitle: 'Your exam, goals, exam dates and revision plan',
    items: [
      { id: 'studentMode', icon: '🩺', title: 'Student Mode & Exam Labels', description: 'Nursing or Agriculture mode and the exam names shown in the app', keywords: ['mode', 'nursing', 'agriculture', 'student', 'agro', 'nurse', 'norcet', 'exam', 'label', 'branding'] },
      { id: 'goals', icon: '🎯', title: 'Study Goals & Targets', description: 'Daily, weekly and monthly hours and topic targets', keywords: ['goal', 'target', 'daily', 'weekly', 'monthly', 'hours', 'topics', 'plan'] },
      { id: 'exams', icon: '⏳', title: 'Exam Countdown', description: 'Add exam dates and track the days left', keywords: ['exam', 'countdown', 'date', 'deadline', 'days left', 'test'] },
      { id: 'srs', icon: '🧠', title: 'Spaced Repetition', description: 'Revision intervals for easy, medium and hard topics', keywords: ['srs', 'spaced', 'repetition', 'interval', 'review', 'revision', 'memory', 'schedule'] },
    ],
  },
  {
    id: 'focus', icon: '⏱️', title: 'Focus & Productivity', subtitle: 'Focus Timer and session preferences',
    items: [
      { id: 'pomodoroTool', icon: '⏱️', title: 'Focus Timer', description: 'Countdown (with auto breaks) or Stopwatch — start a session right here', keywords: ['pomodoro', 'countdown', 'auto breaks', 'timer', 'focus', 'session', 'stopwatch', 'start', 'productivity'] },
      { id: 'pomodoroPrefs', icon: '⚙️', title: 'Countdown & Break Preferences', description: 'Default length, auto-break lengths, auto-start and sound', keywords: ['pomodoro', 'timer', 'break', 'duration', 'minutes', 'sound', 'beep', 'auto start', 'focus'] },
    ],
  },
  {
    id: 'notifications', icon: '🔔', title: 'Reminders & Alerts', subtitle: 'Pop-up reminders and sticky notes',
    items: [
      { id: 'reminders', icon: '⏰', title: 'Pop Reminders', description: 'Create, edit and schedule reminders and sticky notes', keywords: ['reminder', 'notification', 'alert', 'pop', 'bell', 'sticky', 'note', 'notify', 'schedule'] },
    ],
  },
  {
    id: 'auto', icon: '🔔', title: 'Notifications & Auto-backup', subtitle: 'Daily reminders, live timer alerts and automatic backups',
    items: [
      { id: 'notifications', icon: '🔔', title: 'Notifications', description: 'Daily study reminders and timer / stopwatch alerts with quick actions', keywords: ['notification', 'reminder', 'alert', 'timer', 'pomodoro', 'stopwatch', 'daily', 'time', 'push'] },
      { id: 'autoBackup', icon: '💾', title: 'Automatic Backups', description: 'Daily backup on first open, custom times, chosen folder', keywords: ['backup', 'auto', 'download', 'folder', 'daily', 'schedule', 'export', 'storage'] },
    ],
  },
  {
    id: 'ai', icon: '✨', title: 'AI, Icon & Device', subtitle: 'AI tutor key, custom app icon, storage and offline status',
    items: [
      { id: 'appIcon', icon: '🖼️', title: 'Custom App Icon', description: 'Upload your own icon (JPG/PNG/WebP, max 2 MB)', keywords: ['icon', 'logo', 'app icon', 'upload', 'image', 'launcher', 'home screen', 'custom'] },
      { id: 'aiDevice', icon: '🔑', title: 'AI Tutor & Device Storage', description: 'Add your own AI key, check storage protection and offline mode', keywords: ['ai', 'api', 'key', 'gemini', 'claude', 'openai', 'tutor', 'chat', 'mcq', 'storage', 'offline', 'persistent', 'device', 'model'] },
    ],
  },
  {
    id: 'data', icon: '💾', title: 'Backup, Data & Trash', subtitle: 'Download, restore, recover and reset your data',
    items: [
      { id: 'dataHub', icon: '🗄️', title: 'Backup, Data & Trash', description: 'Download and verify everything, restore or reset, and recover deleted subjects — all in one place', keywords: ['data', 'download', 'export', 'backup', 'cloud copy', 'verify', 'self test', 'inventory', 'a-z', 'az', 'all data', 'all settings', 'checksum', 'integrity', 'compare', 'sync status', 'size', 'storage', 'import', 'restore', 'json', 'reset', 'clear', 'history', 'delete', 'merge', 'upload', 'file', 'recover', 'trash', 'bin', 'deleted', 'remove', 'empty'] },
    ],
  },
  {
    id: 'help', icon: '❓', title: 'Help & Shortcuts', subtitle: 'Guides and keyboard shortcuts',
    items: [
      { id: 'shortcuts', icon: '⌨️', title: 'Keyboard Shortcuts', description: 'Shortcuts for search, undo, redo and closing dialogs', keywords: ['keyboard', 'shortcut', 'hotkey', 'ctrl', 'undo', 'redo', 'key'] },
      { id: 'help', icon: '📖', title: 'Help & Onboarding Guide', description: 'A tour of every feature in the app', keywords: ['help', 'guide', 'tutorial', 'onboarding', 'faq', 'tour', 'how to', 'support'] },
    ],
  },
];

/** Map the old section ids (used by deep-links like the level badge) onto the new structure */
const LEGACY_SECTION: Record<string, { cat: string; item?: ItemId }> = {
  analytics: { cat: 'insights', item: 'analytics' },
  achievements: { cat: 'insights', item: 'achievements' },
  appearance: { cat: 'appearance' },
  preferences: { cat: 'study' },
  productivity: { cat: 'focus' },
  data: { cat: 'data' },
};

interface FlatItem extends ItemMeta { catId: string; catTitle: string; haystack: string; titleN: string }

const SUGGESTIONS = ['Dark mode', 'Text size', 'Daily goal', 'Cloud sync', 'Backup', 'Reminder', 'Timer'];

export default function SettingsHub(props: SettingsHubProps) {
  const { subjects, dailyLogs, settings, onUpdateSettings, dbSessions, trash, reminders, onUpdateReminders, onOpenHelp, initialSection, onEditProfile, searchSlot, jump } = props;
  const rootRef = useRef<HTMLDivElement>(null);

  // Which sections are even available (some depend on optional callbacks)
  const categories = useMemo(() => CATEGORIES
    .map(c => ({ ...c, items: c.items.filter(i => !(i.id === 'reminders' && !onUpdateReminders) && !(i.id === 'help' && !onOpenHelp)) }))
    .filter(c => c.items.length > 0), [onUpdateReminders, onOpenHelp]);

  const flat = useMemo<FlatItem[]>(() => categories.flatMap(c => c.items.map(i => ({
    ...i, catId: c.id, catTitle: c.title,
    titleN: normalizeText(i.title),
    haystack: normalizeText(`${i.title} ${i.description} ${i.keywords.join(' ')} ${c.title} ${c.subtitle}`),
  }))), [categories]);

  const initial = initialSection ? LEGACY_SECTION[initialSection] : undefined;
  const [openCat, setOpenCat] = useState<string | null>(initial?.cat ?? null);
  const [openItems, setOpenItems] = useState<Set<ItemId>>(() => {
    if (!initial) return new Set();
    if (initial.item) return new Set([initial.item]);
    const cat = CATEGORIES.find(c => c.id === initial.cat);
    return new Set(cat && cat.items.length <= 3 ? cat.items.map(i => i.id) : []);
  });

  /* ── search ── */
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [activeIdx, setActiveIdx] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tokens = useMemo(() => tokenizeQuery(deferredQuery), [deferredQuery]);
  const searching = tokens.length > 0;

  const { results, fuzzy } = useMemo(() => {
    if (!tokens.length) return { results: [] as FlatItem[], fuzzy: false };
    let hits = flat
      .filter(it => tokens.every(t => it.haystack.includes(t)))
      .map(it => ({ it, score: scoreTitle(it.title, tokens) * 3 + (tokens.every(t => it.titleN.includes(t)) ? 200 : 0) + (it.keywords.some(k => tokens.some(t => normalizeText(k).startsWith(t))) ? 40 : 0) }));
    let isFuzzy = false;
    if (hits.length === 0 && tokens.some(t => t.length >= 4)) {
      hits = flat.filter(it => fuzzyIncludesAll(it.haystack, tokens)).map(it => ({ it, score: 1 }));
      isFuzzy = hits.length > 0;
    }
    hits.sort((a, b) => b.score - a.score);
    return { results: hits.map(h => h.it), fuzzy: isFuzzy };
  }, [tokens, flat]);

  useEffect(() => { setActiveIdx(0); }, [deferredQuery]);

  /* ── navigation ── */
  const [scrollTarget, setScrollTarget] = useState<ItemId | null>(null);
  const [dataTab, setDataTab] = useState<{ tab: DataHubTab; n: number }>({ tab: 'download', n: 0 });
  const toggleCat = useCallback((id: string) => setOpenCat(prev => (prev === id ? null : id)), []);
  const toggleItem = useCallback((id: ItemId) => setOpenItems(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);

  const goTo = useCallback((it: { id: ItemId; catId: string }) => {
    if (it.id === 'dataHub') {
      // Land on the tab that matches what was searched for ("trash", "restore", …)
      const q = normalizeText(query);
      const tab: DataHubTab = /trash|bin|delet|recover|empty/.test(q) ? 'trash' : /restor|import|reset|clear|merge|upload|json|file/.test(q) ? 'restore' : 'download';
      setDataTab(d => ({ tab, n: d.n + 1 }));
    }
    setOpenCat(it.catId);
    setOpenItems(prev => new Set(prev).add(it.id));
    setQuery('');
    inputRef.current?.blur();
    setScrollTarget(it.id);
  }, [query]);

  // After the target has rendered, scroll it into view and flash it once
  useEffect(() => {
    if (!scrollTarget) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`setting-${scrollTarget}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.remove('settings-flash'); void el.offsetWidth; el.classList.add('settings-flash');
        window.setTimeout(() => el.classList.remove('settings-flash'), 1600);
      }
      setScrollTarget(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollTarget]);

  // Status chips (and other outside callers) can open a setting directly
  useEffect(() => {
    if (!jump) return;
    const target = flat.find(i => i.id === jump.id);
    if (target) goTo(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.n]);

  // Results render in the body while the (sticky) search box stays at the top: bring them into view
  useEffect(() => {
    if (searching) rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [searching]);

  // Deep-link on first mount
  useEffect(() => { if (initial?.item) setScrollTarget(initial.item); /* eslint-disable-next-line */ }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, Math.max(results.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { const r = results[activeIdx]; if (r) { e.preventDefault(); goTo(r); } }
    else if (e.key === 'Escape') { if (query) { e.preventDefault(); e.stopPropagation(); setQuery(''); } }
  };

  /* ── derived data for sections ── */
  const stats = useMemo(() => getStats(subjects, dailyLogs, dbSessions), [subjects, dailyLogs, dbSessions]);

  const renderItem = (id: ItemId) => {
    switch (id) {
      case 'analytics': return <OverviewTab subjects={subjects} dailyLogs={dailyLogs} stats={stats} dbSessions={dbSessions} />;
      case 'achievements': return <GamificationPanel subjects={subjects} dailyLogs={dailyLogs} onPomodoroComplete={props.onPomodoroComplete} pomodoroSettings={settings.pomodoroSettings} initialTab={initialSection === 'achievements' ? 'overview' : 'achievements'} dbSessions={dbSessions} />;
      case 'displayMode': return <DisplayModeSettings settings={settings} onUpdate={onUpdateSettings} />;
      case 'accent': return <AccentColorSettings settings={settings} onUpdate={onUpdateSettings} />;
      case 'textLayout': return <TextLayoutSettings settings={settings} onUpdate={onUpdateSettings} />;
      case 'zoom': return <ZoomSettings />;
      case 'studentMode': return <StudentModeSettings settings={settings} onUpdate={onUpdateSettings} />;
      case 'goals': return <StudyGoalsSettings settings={settings} onUpdate={onUpdateSettings} />;
      case 'exams': return <ExamCountdown subjects={subjects} exams={props.exams} onUpdateExams={props.onUpdateExams} />;
      case 'srs': return <SRSSettings settings={settings} onUpdate={onUpdateSettings} />;
      case 'pomodoroTool': return <GamificationPanel subjects={subjects} dailyLogs={dailyLogs} onPomodoroComplete={props.onPomodoroComplete} pomodoroSettings={settings.pomodoroSettings} initialTab="pomodoro" />;
      case 'pomodoroPrefs': return <PomodoroSettingsPanel settings={settings} onUpdate={onUpdateSettings} />;
      case 'reminders': return onUpdateReminders ? <ReminderManager reminders={reminders || []} onUpdate={onUpdateReminders} /> : null;
      case 'aiDevice': return <AiDevicePanel />;
      case 'appIcon': return <AppIconPanel />;
      case 'notifications': return <NotificationsPanel />;
      case 'autoBackup': return <AutoBackupPanel />;
      case 'cloudSync': return <CloudSettingsPanel />;
      case 'profile': return (
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground">Update how you appear across all your devices, change your password, or log out — all in one place.</p>
          <button onClick={onEditProfile} className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold active:scale-[0.99] transition-transform">Open profile editor</button>
        </div>
      );
      case 'dataHub': return (
        <DataHub appState={props.appState} subjects={subjects} settings={settings} history={props.history} trash={trash} user={props.user}
          onUpdateUser={props.onUpdateUser} onImport={props.onImport} onReset={props.onReset} onClearHistory={props.onClearHistory}
          onRestoreTrash={props.onRestoreTrash} onDeleteTrash={props.onDeleteTrash} onEmptyTrash={props.onEmptyTrash}
          initialTab={dataTab.n > 0 ? dataTab.tab : undefined} nonce={dataTab.n} />
      );
      case 'shortcuts': return <KeyboardShortcutsSettings />;
      case 'help': return onOpenHelp ? <HelpGuideSettings onOpenHelp={onOpenHelp} /> : null;
    }
  };

  const catBadge = (catId: string): string | undefined => (catId === 'data' && trash.length > 0 ? String(trash.length) : undefined);
  const staleDim = query !== deferredQuery;

  const searchInput = (
    <div className={`relative rounded-2xl border bg-card/40 transition-[border-color,box-shadow] duration-150 ${focused ? 'border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.10)]' : 'border-border/25'}`}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder="Search all settings…"
        role="combobox" aria-expanded={searching} aria-controls="settings-results" aria-label="Search settings"
        autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
        className="h-11 pl-10 pr-10 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
      />
      {query && (
        <button onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-muted/40 hover:bg-muted/70 flex items-center justify-center active:scale-90 transition-[transform,background-color]">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );

  return (
    <div ref={rootRef} className="space-y-3" style={{ scrollMarginTop: 'calc(var(--settings-header-h, 56px) + 4px)' }}>
      {/* ── Search: sits right under the AI Tutor card and stays in reach (below the title bar) while scrolling ── */}
      <div>
        <div className="sticky z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur-md" style={{ top: 'var(--settings-header-h, 56px)' }}>
          {searchSlot === undefined ? searchInput : searchSlot ? createPortal(searchInput, searchSlot) : null}
        </div>

        {!searching && (focused || !openCat) && (
          <div className="flex gap-1.5 flex-wrap mt-1.5 animate-fade-in">
            {SUGGESTIONS.map(s => (
              <button key={s} onMouseDown={e => e.preventDefault()} onClick={() => { setQuery(s); inputRef.current?.focus(); }}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-border/25 bg-card/30 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 active:scale-95 transition-[transform,background-color,border-color,color] duration-150">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Search results ── */}
      {searching ? (
        <div id="settings-results" role="listbox" className={`space-y-2 transition-opacity duration-100 ${staleDim ? 'opacity-60' : 'opacity-100'}`}>
          {results.length > 0 ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 px-1">
                {results.length} setting{results.length !== 1 ? 's' : ''} found{fuzzy ? ' · closest matches' : ''}
              </p>
              {results.map((r, i) => {
                const active = i === activeIdx;
                return (
                  <button key={r.id} role="option" aria-selected={active} onClick={() => goTo(r)} onMouseEnter={() => setActiveIdx(i)}
                    className={`w-full flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-[background-color,border-color,transform] duration-100 active:scale-[0.99] ${
                      active ? 'border-primary/45 bg-primary/8' : 'border-border/15 bg-card/25 hover:bg-card/50'
                    }`}>
                    <span className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center text-lg shrink-0">{r.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-bold text-foreground truncate"><HighlightText text={r.title} query={deferredQuery} /></span>
                      <span className="block text-[10px] font-semibold text-primary/80 mt-0.5">{r.catTitle}</span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5 line-clamp-2"><HighlightText text={r.description} query={deferredQuery} /></span>
                    </span>
                    {active ? <CornerDownLeft className="w-4 h-4 text-primary shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
                  </button>
                );
              })}
            </>
          ) : (
            !staleDim && (
              <div className="rounded-2xl border border-border/15 bg-card/20 p-8 text-center">
                <span className="text-3xl block mb-2">🔍</span>
                <p className="text-sm font-bold text-foreground">No settings match “{query.trim()}”</p>
                <p className="text-[11px] text-muted-foreground mt-1">Check the spelling, or try a broader word like “theme”, “goal” or “backup”.</p>
              </div>
            )
          )}
        </div>
      ) : (
        /* ── Category browser ── */
        <div className="space-y-2.5">
          {categories.map(cat => {
            const open = openCat === cat.id;
            const badge = catBadge(cat.id);
            return (
              <section key={cat.id} className="rounded-2xl border border-border/15 bg-card/20 overflow-hidden">
                <button onClick={() => toggleCat(cat.id)} aria-expanded={open}
                  className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-muted/5 active:bg-muted/10 transition-colors">
                  <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-accent/10 border border-primary/15 flex items-center justify-center text-[22px] shrink-0">{cat.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground truncate">{cat.title}</span>
                      {badge && <span className="min-w-5 h-5 px-1 rounded-full bg-destructive text-[9px] text-destructive-foreground font-bold flex items-center justify-center">{badge}</span>}
                    </span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5 truncate">{cat.subtitle}</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold text-muted-foreground/70 px-1.5 py-0.5 rounded-md bg-muted/25 shrink-0">{cat.items.length}</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="px-3 pb-3 space-y-2 animate-fade-in">
                    {cat.items.map(item => {
                      const itemOpen = openItems.has(item.id);
                      return (
                        <div key={item.id} id={`setting-${item.id}`} style={{ scrollMarginTop: 'calc(var(--settings-header-h, 56px) + 76px)' }}
                          className="rounded-xl border border-border/15 bg-background/40 overflow-hidden">
                          <button onClick={() => toggleItem(item.id)} aria-expanded={itemOpen}
                            className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-muted/5 active:bg-muted/10 transition-colors">
                            <span className="text-lg w-7 text-center shrink-0">{item.icon}</span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-[13px] font-semibold text-foreground">{item.title}</span>
                              <span className="block text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{item.description}</span>
                            </span>
                            {itemOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                          </button>
                          {itemOpen && (
                            <div className="px-3.5 pb-4 pt-3 border-t border-border/10 animate-fade-in">
                              {renderItem(item.id)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
          <p className="text-center text-[10px] text-muted-foreground/60 pt-1">Changes save automatically</p>
        </div>
      )}
    </div>
  );
}

