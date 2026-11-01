// ===== NurseTrack Pro v7.0 Types =====

/** Always the real release number (from package.json at build time) — it used to be a stale hard-coded "v7.0". */
export const APP_VERSION = `v${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}`;

export interface QuickMCQ {
  id: string;
  q: string;
  a: string;
  explanation?: string;
  createdAt: string;
}

export interface ResourceLink {
  id: string;
  url: string;
  title: string;
  type: 'youtube' | 'article' | 'pdf' | 'other';
}

export interface TopicAttachment {
  id: string;
  url: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
}

export type TopicStatus = 'incomplete' | 'in_process' | 'complete';

export interface TimeEntry {
  date: string;
  minutes: number;
  /** Time of day (HH:mm) this study block STARTED — powers Study Rhythm hours */
  time?: string;
  note?: string;
  status?: TopicStatus;
  /** When true, a DB session has already been created for this entry — skip on next save */
  synced?: boolean;
}

/** Revision rounds a completed topic can go through */
export type RevisionKey = 'R1' | 'R2' | 'R3' | 'R4';
export const REVISION_KEYS: RevisionKey[] = ['R1', 'R2', 'R3', 'R4'];
export type RevisionStatus = 'pending' | 'in_process' | 'complete';

/** Pointer to a topic — used for prev/next navigation inside the topic sheet */
export interface TopicNavRef { subjectId: string; unitId: string; topicId: string }

export interface RevisionData {
  status: RevisionStatus;
  /** Date this round was started (YYYY-MM-DD) */
  startedDate?: string;
  /** Date this round was completed (YYYY-MM-DD) */
  completedDate?: string;
  /** Time this round was completed (HH:MM) */
  completedTime?: string;
  /** Total minutes logged for this revision round */
  timeSpent: number;
  /** Per-date time entries logged for this revision round */
  timeEntries: TimeEntry[];
}

export interface SubTopic {
  id: string;
  name: string;
  completed: boolean;
  status?: TopicStatus;
  completedDate?: string;
  completedTime?: string;
  notes: string;
  notesArr?: string[];
  difficulty: 'Easy' | 'Medium' | 'Hard';
  timeSpent: number;
  timeEntries?: TimeEntry[];
  important: boolean;
  module?: string;
  subModule?: string;
  topicNumber?: number;
  mcqs?: QuickMCQ[];
  norcetRelevance?: 'High' | 'Med' | 'Low';
  rank?: 1 | 2 | 3 | 4 | 5;
  category?: string;
  tags?: string[];
  resourceLinks?: ResourceLink[];
  attachments?: TopicAttachment[];
  srsLevel?: number;
  srsDueDate?: string;
  lastReviewedDate?: string;
  /** Revision rounds R1–R4 (local-first, like timeEntries) */
  revisions?: Partial<Record<RevisionKey, RevisionData>>;
}

export interface Unit {
  id: string;
  name: string;
  subTopics: SubTopic[];
  /** Total minutes spent on this unit directly (not on individual topics) */
  timeSpent?: number;
  /** Per-date time entries logged at the unit level */
  timeEntries?: TimeEntry[];
}

export interface Subject {
  id: string;
  name: string;
  shortName: string;
  color: string;
  examDate: string;
  image?: string;
  icon?: string;
  iconShape?: 'square' | 'circle';
  iconSize?: 'sm' | 'md' | 'lg';
  showTopicNumbers?: boolean;
  hideHashSuffix?: boolean;
  unitFontSize?: 'small' | 'normal' | 'large' | 'xlarge' | string;
  moduleFontSize?: 'small' | 'normal' | 'large' | 'xlarge' | string;
  topicFontSize?: 'small' | 'normal' | 'large' | 'xlarge' | string;
  units: Unit[];
  folderId?: string;
  order?: number;
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  icon: string;
  iconShape?: 'square' | 'circle';
  iconSize?: 'sm' | 'md' | 'lg';
  coverImage?: string;
  description?: string;
  order: number;
  createdAt: string;
}

export interface StudySession {
  id: string;
  subjectId: string;
  subjectName: string;
  durationMinutes: number;
  note?: string;
  startTime: string;
  endTime?: string;
}

/** First-class DB study session — each is its own row in the StudySessions table */
export interface DbStudySession {
  id: string;
  date: string;
  minutes: number;
  description: string;
  type: 'Topic' | 'Unit' | 'Other';
  subjectId: string;
  subjectName: string;
  topicId?: string;
  unitId?: string;
  startTime?: string;
  endTime?: string;
  note?: string;
  loggedAt?: string;
}

export interface DailyLog {
  date: string;
  hoursStudied: number;
  topicsCompleted: number;
  mood?: 'Sad' | 'Tired' | 'Okay' | 'Neutral' | 'Happy' | 'Motivated';
  notes: string;
  subjectFocus: string;
  manualHours?: number;
  manualMinutes?: number;
  sessions?: StudySession[];
}

export type AppTab = 'dashboard' | 'syllabus' | 'daily' | 'revision' | 'charts' | 'countdown' | 'gamification' | 'history' | 'settings' | 'profile' | 'store';

export type ProfileTab = 'overview' | 'awards' | 'pomodoro' | 'exams' | 'history' | 'settings' | 'backup' | 'trash';

export type TrackingMode = 'hours' | 'topics';

export interface SemesterConfig {
  semesterName: string;
  studyStartDate: string;
  studyEndDate: string;
  exams: ExamConfig[];
}

export interface ExamConfig {
  id: string;
  label: string;
  date: string;
  /** Optional exam start time in HH:mm (24h). Defaults to 00:00 if omitted. */
  time?: string;
  subjects: string[];
  color: string;
  emoji: string;
  isCustom?: boolean;
  /** Custom icon image URL */
  iconUrl?: string;
  /** Background image URL for the countdown card */
  backgroundImage?: string;
}

export interface AppState {
  subjects: Subject[];
  dailyLogs: DailyLog[];
  lastUpdated: string;
  semesterConfig: SemesterConfig;
  folders: Folder[];
}

export interface User {
  email: string;
  name: string;
  avatar: string;
  loginTime: string;
  coverGradient?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  unlocked: boolean;
  unlockedAt?: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  category: 'streak' | 'topics' | 'hours' | 'special' | 'subject';
}

export interface Level {
  level: number;
  title: string;
  minXP: number;
  maxXP: number;
  minProgress: number;
  color: string;
  icon: string;
  unlocks?: string[];
}

export interface HistoryEntry {
  id: string;
  type: 'topic_complete' | 'topic_uncomplete' | 'daily_log' | 'difficulty_change' | 'important_toggle';
  timestamp: string;
  date: string;
  time: string;
  subjectName: string;
  subjectColor: string;
  unitName: string;
  topicName: string;
  detail?: string;
  icon: string;
}

export type ThemeId = 'default' | 'ocean' | 'emerald' | 'sunset' | 'rose' | 'purple' | 'ancient';
export type ThemeMode = 'light' | 'amoled' | 'ancient';

export interface PomodoroSettings {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  autoStartBreaks: boolean;
  soundEnabled: boolean;
}

export interface StudyGoals {
  dailyHours: number;
  dailyTopics: number;
  weeklyHours: number;
  weeklyTopics: number;
  monthlyHours: number;
  monthlyTopics: number;
}

export interface SRSQueueItem {
  topicId: string;
  subjectId: string;
  dueDate: string;
  srsLevel: number;
  lastReview: string;
}

export interface CoinTransaction {
  id: string;
  amount: number;
  reason: string;
  timestamp: string;
}

export interface CoinsState {
  balance: number;
  transactions: CoinTransaction[];
}

export type WeeklyRank = 'Iron' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
export type PomodoroAmbient = 'rain' | 'library' | 'nature' | 'silent';

export interface PomodoroSessionLog {
  id: string;
  subject: string;
  durationMin: number;
  completedAt: string;
  ambient: PomodoroAmbient;
}

export interface TrashItem {
  id: string;
  type: 'subject';
  data: Subject;
  deletedAt: string;
}

// ===== v7 Store System =====
export type StoreItemCategory = 'theme' | 'border' | 'confetti';

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  category: StoreItemCategory;
  price: number;
  icon: string;
  preview?: string;
}

export interface StoreState {
  unlockedItems: string[];
  equippedTheme?: string;
  equippedBorder?: string;
  equippedConfetti?: string;
}

// ===== v7 SRS Custom Intervals =====
export interface SRSConfig {
  easy: number[];
  medium: number[];
  hard: number[];
}

export const DEFAULT_SRS_CONFIG: SRSConfig = {
  easy: [2, 5, 10, 20, 40],
  medium: [1, 3, 7, 14, 30],
  hard: [1, 2, 4, 7, 15],
};

export type StudentMode = 'nursing' | 'agriculture';

export interface CustomQuote {
  id: string;
  text: string;
  author: string;
  imageUrl?: string;
  backgroundUrl?: string;
}

export interface UserSettings {
  theme: ThemeId;
  themeMode: ThemeMode;
  pomodoroSettings: PomodoroSettings;
  studyGoals: StudyGoals;
  trackingMode: TrackingMode;
  studentMode?: StudentMode;
  subjectGoals?: Record<string, number>;
  notificationTime?: string;
  fontScale?: 'small' | 'normal' | 'large';
  highContrast?: boolean;
  pomodoroAmbient?: PomodoroAmbient;
  lastBackupDate?: string;
  srsConfig?: SRSConfig;
  customQuotes?: CustomQuote[];
  hiddenBuiltInQuotes?: string[];
  builtInQuoteOverrides?: Record<number, Partial<CustomQuote> & { hidden?: boolean }>;
  examLabelNursing?: string;
  examLabelAgriculture?: string;
  textSizes?: { unit?: number; module?: number; topic?: number };
  density?: 'compact' | 'comfortable' | 'spacious';
  universalFontSizes?: { unitFontSize?: string; moduleFontSize?: string; topicFontSize?: string };
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'default',
  themeMode: 'light',
  pomodoroSettings: {
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    autoStartBreaks: false,
    soundEnabled: true,
  },
  studyGoals: {
    dailyHours: 6,
    dailyTopics: 10,
    weeklyHours: 30,
    weeklyTopics: 50,
    monthlyHours: 120,
    monthlyTopics: 150,
  },
  trackingMode: 'topics',
  studentMode: 'nursing',
  pomodoroAmbient: 'silent',
  fontScale: 'normal',
  highContrast: false,
  srsConfig: DEFAULT_SRS_CONFIG,
};

// ===== Pop Reminder System =====
export interface ReminderImage {
  id: string;
  url: string;
  name: string;
}

export type ReminderDateMode = 'single' | 'range' | 'specific_dates' | 'every_day';
export type ReminderTimeMode = 'on_app_open' | 'custom_window' | 'full_day';
export type ReminderColor = 'primary' | 'secondary' | 'accent' | 'destructive' | 'chart-4' | 'chart-5';

export const REMINDER_COLORS: { id: ReminderColor; label: string; emoji: string }[] = [
  { id: 'primary', label: 'Blue', emoji: '🔵' },
  { id: 'secondary', label: 'Green', emoji: '🟢' },
  { id: 'accent', label: 'Purple', emoji: '🟣' },
  { id: 'destructive', label: 'Red', emoji: '🔴' },
  { id: 'chart-4', label: 'Orange', emoji: '🟠' },
  { id: 'chart-5', label: 'Teal', emoji: '🩵' },
];

export interface Reminder {
  id: string;
  title: string;
  content: string;
  images: ReminderImage[];
  color: ReminderColor;
  dateMode: ReminderDateMode;
  dateFrom?: string;
  dateTo?: string;
  specificDates?: string[];
  timeMode: ReminderTimeMode;
  timeFrom?: string;
  timeTo?: string;
  enabled: boolean;
  pinned: boolean;
  snoozedUntil?: string;
  createdAt: string;
  dismissedDates: string[];
  completedAt?: string;
  nextAppOpen?: boolean;
}

/** @deprecated — reset is now server-side via confirmReset endpoint */
export const RESET_PASSWORD = '__DEPRECATED__';

// ===== Store Items Catalog =====
export const STORE_CATALOG: StoreItem[] = [
  // Accent Themes
  { id: 'theme-cherry', name: 'Cherry Blossom', description: 'Soft pink accent for a gentle study vibe', category: 'theme', price: 15, icon: '🌸' },
  { id: 'theme-midnight', name: 'Midnight Blue', description: 'Deep navy tones for focused study sessions', category: 'theme', price: 15, icon: '🌙' },
  { id: 'theme-forest', name: 'Forest Green', description: 'Nature-inspired calming theme', category: 'theme', price: 15, icon: '🌲' },
  { id: 'theme-golden', name: 'Golden Hour', description: 'Warm golden tones for evening study', category: 'theme', price: 20, icon: '🌅' },
  { id: 'theme-aurora', name: 'Aurora Lights', description: 'Northern lights inspired gradients', category: 'theme', price: 25, icon: '🌌' },
  // Avatar Borders
  { id: 'border-neon', name: 'Neon Glow', description: 'Pulsing neon border around your avatar', category: 'border', price: 10, icon: '💡' },
  { id: 'border-gold', name: 'Gold Ring', description: 'Premium gold border effect', category: 'border', price: 20, icon: '💛' },
  { id: 'border-rainbow', name: 'Rainbow Ring', description: 'Animated rainbow gradient border', category: 'border', price: 30, icon: '🌈' },
  { id: 'border-fire', name: 'Fire Ring', description: 'Fiery glowing border', category: 'border', price: 25, icon: '🔥' },
  // Confetti Effects
  { id: 'confetti-stars', name: 'Star Burst', description: 'Stars explode on achievements', category: 'confetti', price: 10, icon: '⭐' },
  { id: 'confetti-hearts', name: 'Heart Rain', description: 'Hearts rain down on milestones', category: 'confetti', price: 10, icon: '❤️' },
  { id: 'confetti-fireworks', name: 'Fireworks', description: 'Grand fireworks celebration', category: 'confetti', price: 20, icon: '🎆' },
  { id: 'confetti-sparkle', name: 'Sparkle Dust', description: 'Magical sparkle particles', category: 'confetti', price: 15, icon: '✨' },
];
