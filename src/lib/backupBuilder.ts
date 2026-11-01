/**
 * Builds the complete "A-Z" backup document. Shared by the manual export in
 * Settings → Backup & Restore and by the automatic daily / scheduled backups.
 */
import type { Subject, AppState, UserSettings, HistoryEntry, TrashItem, User } from '../types';
import { APP_VERSION } from '../types';
import { getUnifiedTotalMinutes } from './utils';
import { exportAllFiles } from '../platform/files';

export interface BackupContext {
  appState: AppState;
  subjects?: Subject[];
  settings?: UserSettings;
  history?: HistoryEntry[];
  trash?: TrashItem[];
  user?: User;
}

export interface BuiltBackup { data: Record<string, any>; topics: number; mcqs: number; subjects: number }

export async function buildFullBackup(ctx: BackupContext): Promise<BuiltBackup> {
  const { appState, subjects, settings, history, trash, user } = ctx;
  const readLocalStorage = (key: string) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
  };
    // ── Compute comprehensive stats for the backup summary ──
    const allSubjects = subjects || [];
    const allTopicsList = allSubjects.flatMap(s => s.units.flatMap(u => u.subTopics.map(t => ({ ...t, subjectName: s.name, subjectShortName: s.shortName, subjectColor: s.color, unitName: u.name }))));
    const completedTopics = allTopicsList.filter(t => t.completed);
    const incompleteTopics = allTopicsList.filter(t => !t.completed);
    const totalMinutes = allTopicsList.reduce((a, t) => a + (t.timeSpent || 0), 0);
    const easyTopics = allTopicsList.filter(t => t.difficulty === 'Easy');
    const medTopics = allTopicsList.filter(t => t.difficulty === 'Medium');
    const hardTopics = allTopicsList.filter(t => t.difficulty === 'Hard');
    const importantTopics = allTopicsList.filter(t => t.important);
    const topicsWithNotes = allTopicsList.filter(t => t.notes || (t.notesArr && t.notesArr.length > 0));
    const topicsWithMcqs = allTopicsList.filter(t => t.mcqs && t.mcqs.length > 0);
    const topicsWithAttachments = allTopicsList.filter(t => t.attachments && t.attachments.length > 0);
    const topicsWithResources = allTopicsList.filter(t => t.resourceLinks && t.resourceLinks.length > 0);
    const topicsWithTags = allTopicsList.filter(t => t.tags && t.tags.length > 0);
    const topicsWithSrs = allTopicsList.filter(t => t.srsLevel && t.srsLevel > 0);
    const totalMcqs = allTopicsList.reduce((a, t) => a + (t.mcqs?.length || 0), 0);
    const totalAttachments = allTopicsList.reduce((a, t) => a + (t.attachments?.length || 0), 0);
    const totalResources = allTopicsList.reduce((a, t) => a + (t.resourceLinks?.length || 0), 0);
    const allTags = [...new Set(allTopicsList.flatMap(t => t.tags || []))];
    const totalUnits = allSubjects.reduce((a, s) => a + s.units.length, 0);
    const logDays = appState.dailyLogs.filter(l => l.hoursStudied > 0 || l.topicsCompleted > 0);
    const totalStudyHours = getUnifiedTotalMinutes(allSubjects, readLocalStorage('nursing-dbsessions-v1') || undefined, appState.dailyLogs) / 60;
    const totalSessions = appState.dailyLogs.reduce((a, l) => a + (l.sessions?.length || 0), 0);
    const moods = appState.dailyLogs.filter(l => l.mood).map(l => l.mood!);
    const moodCounts: Record<string, number> = {};
    moods.forEach(m => { moodCounts[m] = (moodCounts[m] || 0) + 1; });

    // Per-subject breakdown
    const subjectBreakdown = allSubjects.map(s => {
      const topics = s.units.flatMap(u => u.subTopics);
      const done = topics.filter(t => t.completed).length;
      const mins = topics.reduce((a, t) => a + (t.timeSpent || 0), 0);
      return {
        id: s.id, name: s.name, shortName: s.shortName, color: s.color, examDate: s.examDate,
        units: s.units.length, totalTopics: topics.length, completedTopics: done,
        progressPct: topics.length > 0 ? Math.round((done / topics.length) * 100) : 0,
        totalTimeMinutes: mins,
        difficulty: { easy: topics.filter(t => t.difficulty === 'Easy').length, medium: topics.filter(t => t.difficulty === 'Medium').length, hard: topics.filter(t => t.difficulty === 'Hard').length },
        importantCount: topics.filter(t => t.important).length,
        mcqCount: topics.reduce((a, t) => a + (t.mcqs?.length || 0), 0),
      };
    });

    // Completion timeline (which dates had completions)
    const completionDates: Record<string, number> = {};
    completedTopics.forEach(t => {
      if (t.completedDate) completionDates[t.completedDate] = (completionDates[t.completedDate] || 0) + 1;
    });

    const attachedFiles = await exportAllFiles();
    const fullBackup = {
      files: attachedFiles,
      _backupVersion: 'v7-full-az',
      _exportedAt: new Date().toISOString(),
      _exportedTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      _app: 'RJ TRACKER Pro ' + APP_VERSION,
      _deviceInfo: { userAgent: navigator.userAgent, language: navigator.language, platform: navigator.platform, screenWidth: screen.width, screenHeight: screen.height },

      // ── A-Z Summary (human-readable snapshot) ──
      summary: {
        totalSubjects: allSubjects.length,
        totalUnits,
        totalTopics: allTopicsList.length,
        completedTopics: completedTopics.length,
        incompleteTopics: incompleteTopics.length,
        overallProgressPct: allTopicsList.length > 0 ? Math.round((completedTopics.length / allTopicsList.length) * 100) : 0,
        totalStudyTimeMinutes: totalMinutes,
        totalLoggedHours: Math.round(totalStudyHours * 100) / 100,
        totalStudySessions: totalSessions,
        activeDays: logDays.length,
        totalDailyLogs: appState.dailyLogs.length,
        difficulty: { easy: easyTopics.length, medium: medTopics.length, hard: hardTopics.length },
        difficultyCompleted: { easy: easyTopics.filter(t => t.completed).length, medium: medTopics.filter(t => t.completed).length, hard: hardTopics.filter(t => t.completed).length },
        importantTopics: importantTopics.length,
        importantCompleted: importantTopics.filter(t => t.completed).length,
        topicsWithNotes: topicsWithNotes.length,
        topicsWithMcqs: topicsWithMcqs.length,
        totalMcqs,
        topicsWithAttachments: topicsWithAttachments.length,
        totalAttachments,
        topicsWithResources: topicsWithResources.length,
        totalResources,
        topicsWithTags: topicsWithTags.length,
        allUniqueTags: allTags,
        topicsWithSrs: topicsWithSrs.length,
        moodDistribution: moodCounts,
        historyEntries: (history || []).length,
        trashItems: (trash || []).length,
        remindersCount: readLocalStorage('nursing-reminders-v1')?.length || 0,
        foldersCount: (appState.folders || []).length,
        subjectBreakdown,
        completionTimeline: completionDates,
      },

      // ── Core Data (A-Z complete) ──
      appState,
      settings: settings || readLocalStorage('nursing-settings-v2'),
      store: readLocalStorage('nursing-store-v1'),
      history: history || readLocalStorage('nursing-history-v1'),
      trash: trash || readLocalStorage('nursing-trash-v1'),
      reminders: readLocalStorage('nursing-reminders-v1'),
      gamification: readLocalStorage('nursing-gamification-v2'),
      coins: readLocalStorage('nursing-coins-v1'),
      todos: readLocalStorage('nursetrack-todos'),
      calendarNotes: readLocalStorage('nursetrack-calendar-notes'),
      tickerPrefs: readLocalStorage('nursetrack-ticker-prefs'),
      clockMode: readLocalStorage('nursetrack-clock-mode'),
      dbSessions: readLocalStorage('nursing-dbsessions-v1'),
      calendarSync: readLocalStorage('nursetrack-calendar-sync') ?? localStorage.getItem('nursetrack-calendar-sync'),
      excludedSubjects: readLocalStorage('nursetrack-excluded-subjects'),
      chatHistory: readLocalStorage('nursetrack-chat-history'),
      installDismissed: !!localStorage.getItem('nursetrack-install-dismissed'),
      onboarded: !!readLocalStorage('nursetrack-onboarded-v7') || !!localStorage.getItem('nursetrack-onboarded-v7'),
      userProfile: user ? { name: user.name, email: user.email, avatar: user.avatar, coverGradient: user.coverGradient } : null,

      // ── Filter & UI State ──
      activeTab: (() => { try { return sessionStorage.getItem('active-tab') || 'dashboard'; } catch { return 'dashboard'; } })(),
      filterState: {
        diffFilter: readLocalStorage('nursetrack-diff-filter') ?? 'all',
        timeFilter: readLocalStorage('nursetrack-time-filter') ?? 'all',
        subjectFilter: readLocalStorage('nursetrack-subject-filter') ?? 'all',
        customFrom: readLocalStorage('nursetrack-custom-from') ?? '',
        customTo: readLocalStorage('nursetrack-custom-to') ?? '',
      },

      // ── Complete Topic-Level Flat List (for easy spreadsheet import) ──
      allTopicsFlat: allTopicsList.map(t => ({
        id: t.id, name: t.name, subjectName: t.subjectName, subjectShortName: t.subjectShortName,
        unitName: t.unitName, completed: t.completed, status: t.status,
        completedDate: t.completedDate || null, completedTime: t.completedTime || null,
        difficulty: t.difficulty, important: t.important,
        timeSpentMinutes: t.timeSpent, notes: t.notes,
        notesArr: t.notesArr || [],
        notesCount: t.notesArr?.length || 0,
        // ✅ Include full MCQ data (not just count)
        mcqs: t.mcqs || [],
        mcqCount: t.mcqs?.length || 0,
        // ✅ Include full attachments & resources
        attachments: t.attachments || [],
        attachmentCount: t.attachments?.length || 0,
        resourceLinks: t.resourceLinks || [],
        resourceCount: t.resourceLinks?.length || 0,
        tags: t.tags || [],
        norcetRelevance: t.norcetRelevance || null,
        srsLevel: t.srsLevel || 0,
        srsDueDate: t.srsDueDate || null,
        lastReviewedDate: t.lastReviewedDate || null,
        timeEntries: t.timeEntries || [],
      })),
    };

  return { data: fullBackup, topics: allTopicsList.length, mcqs: totalMcqs, subjects: allSubjects.length };
}
