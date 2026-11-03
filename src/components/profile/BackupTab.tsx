import { useState, useMemo, useRef } from 'react';
import { importFiles, rewriteVirtualUrls } from '@/platform/files';
import { buildFullBackup } from '../../lib/backupBuilder';
import { Download, Upload, Trash2, Lock, Shield, FileText, Code2, Globe } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel } from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useNotifications } from '../../contexts/NotificationContext';
import type { Subject, AppState, UserSettings, HistoryEntry, TrashItem, User } from '../../types';
import { APP_VERSION } from '../../types';
import { getUnifiedTotalMinutes } from '../../lib/utils';
import GlowCard from '../shared/GlowCard';
import ImportPreviewDialog, { type FileStats } from './ImportPreviewDialog';
import ExactRestoreDialog from '../data/ExactRestoreDialog';
import { isExactBackup } from '../../platform/backupRestore';
import { recordBackup } from '../../platform/autoBackup';

export default function BackupTab({ appState, onImport, onReset, onClearHistory, subjects, settings, history, trash, user, onUpdateUser }: {
  appState: AppState; onImport: (s: AppState) => void; onReset: () => void; onClearHistory: () => void; subjects?: Subject[];
  settings?: UserSettings; history?: HistoryEntry[]; trash?: TrashItem[]; user?: User; onUpdateUser?: (u: User) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPw, setResetPw] = useState('');
  const [resetErr, setResetErr] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFileName, setPreviewFileName] = useState('');
  const [parsedBackup, setParsedBackup] = useState<any>(null);
  const [exactDoc, setExactDoc] = useState<any>(null);
  const [exactName, setExactName] = useState('');
  const [previewFileStats, setPreviewFileStats] = useState<FileStats>({ subjects: 0, units: 0, topics: 0, completed: 0, dailyLogs: 0, history: 0, sessions: 0, mcqs: 0, folders: 0, reminders: 0 });
  const { push: pushNotif } = useNotifications();

  const totalTopics = (subjects || []).reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
  const doneTopics = (subjects || []).reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);

  const readLocalStorage = (key: string) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
  };

  const currentStats: FileStats = useMemo(() => {
    const allTopics = (subjects || []).flatMap(s => s.units.flatMap(u => u.subTopics));
    return {
      subjects: (subjects || []).length,
      units: (subjects || []).reduce((a, s) => a + s.units.length, 0),
      topics: allTopics.length,
      completed: allTopics.filter(t => t.completed).length,
      dailyLogs: appState.dailyLogs.length,
      history: (history || []).length,
      sessions: readLocalStorage('nursing-dbsessions-v1')?.length || 0,
      mcqs: allTopics.reduce((a, t) => a + (t.mcqs?.length || 0), 0),
      folders: (appState.folders || []).length,
      reminders: readLocalStorage('nursing-reminders-v1')?.length || 0,
    };
  }, [subjects, appState, history]);

  const exportData = async () => {
    const { data: fullBackup, topics: topicCount, mcqs: totalMcqs, subjects: subjectCount } = await buildFullBackup({ appState, subjects, settings, history, trash, user });
    const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().slice(0, 5).replace(':', '');
    const fileName = `RJ-TRACKER-FULL-AZ-Backup-${dateStr}-${timeStr}.json`;
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
    recordBackup({ at: new Date().toISOString(), name: fileName, bytes: blob.size, ok: true, where: 'Downloads', reason: 'Manual download' });
    toast.success(`📦 Full A-Z backup exported! (${topicCount} topics, ${totalMcqs} MCQs, ${subjectCount} subjects, filters & UI state)`);
  };

  const computeFileStats = (data: any): FileStats => {
    const subs = data.appState?.subjects || [];
    const allTopics = subs.flatMap((s: any) => (s.units || []).flatMap((u: any) => u.subTopics || []));
    return {
      subjects: subs.length,
      units: subs.reduce((a: number, s: any) => a + (s.units?.length || 0), 0),
      topics: allTopics.length,
      completed: allTopics.filter((t: any) => t.completed).length,
      dailyLogs: data.appState?.dailyLogs?.length || 0,
      history: data.history?.length || 0,
      sessions: data.dbSessions?.length || 0,
      mcqs: allTopics.reduce((a: number, t: any) => a + (t.mcqs?.length || 0), 0),
      folders: data.appState?.folders?.length || 0,
      reminders: data.reminders?.length || 0,
    };
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const probe = JSON.parse(text);
        if (isExactBackup(probe)) {
          // v8: exact restore with integrity check — parsed untouched so the checksums still match.
          setExactDoc(probe);
          setExactName(file.name);
          return;
        }
        const data = JSON.parse(rewriteVirtualUrls(text));
        void importFiles(data.files);
        if (data.appState?.subjects && data.appState?.dailyLogs) {
          setParsedBackup(data);
          setPreviewFileName(file.name);
          setPreviewFileStats(computeFileStats(data));
          setPreviewOpen(true);
        } else {
          toast.error('Invalid backup file');
        }
      } catch (_e) { toast.error('Failed to parse backup'); }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const performImport = (data: any, mode: 'as-is' | 'fresh' | 'merge') => {
    if (!data?.appState) return;
    if (mode === 'fresh') {
      const keys = ['nursing-settings-v2','nursing-coins-v1','nursing-store-v1','nursing-history-v1','nursing-trash-v1','nursing-reminders-v1','nursing-gamification-v2','nursetrack-todos','nursetrack-calendar-notes','nursetrack-ticker-prefs','nursetrack-clock-mode','nursing-dbsessions-v1','nursetrack-calendar-sync','nursetrack-excluded-subjects','nursetrack-chat-history','nursetrack-install-dismissed','nursetrack-onboarded-v7','nursetrack-diff-filter','nursetrack-time-filter','nursetrack-subject-filter','nursetrack-custom-from','nursetrack-custom-to'];
      keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
    }
    if (mode === 'merge') {
      const existingSubjects = appState.subjects || [];
      const existingIds = new Set(existingSubjects.map((s: any) => s.id));
      const existingNames = new Set(existingSubjects.map((s: any) => s.name.toLowerCase()));
      const incomingSubjects = data.appState.subjects || [];
      const newSubjects = incomingSubjects.filter((s: any) => !existingIds.has(s.id) && !existingNames.has(s.name.toLowerCase()));
      const mergedSubjects = [...existingSubjects, ...newSubjects];
      const existingLogDates = new Set(appState.dailyLogs.map((l: any) => l.date));
      const newLogs = (data.appState.dailyLogs || []).filter((l: any) => !existingLogDates.has(l.date));
      const mergedLogs = [...appState.dailyLogs, ...newLogs];
      const mergedFolders = [...(appState.folders || []), ...(data.appState.folders || []).filter((f: any) => !(appState.folders || []).some((ef: any) => ef.id === f.id))];
      const mergedState = { ...appState, subjects: mergedSubjects, dailyLogs: mergedLogs, folders: mergedFolders };
      onImport(mergedState);
      toast.success(`✅ Merged: ${newSubjects.length} new subjects, ${newLogs.length} new daily logs added`);
      setPreviewOpen(false);
      setParsedBackup(null);
      return;
    }
    // as-is or fresh: use the existing full import logic
    const importAsIs = () => {
      try {
      if (data.appState?.subjects && data.appState?.dailyLogs) {
          // ✅ Merge MCQ/attachment/resource data from allTopicsFlat back into appState subjects
          // This handles cases where the main appState tree lost these fields during serialization
          let restoredAppState = data.appState;
          let mcqsRestored = 0;
          if (data.allTopicsFlat && Array.isArray(data.allTopicsFlat)) {
            const topicDataMap = new Map<string, any>();
            data.allTopicsFlat.forEach((t: any) => {
              if (t.id) topicDataMap.set(t.id, t);
            });
            restoredAppState = {
              ...data.appState,
              subjects: data.appState.subjects.map((s: any) => ({
                ...s,
                units: s.units.map((u: any) => ({
                  ...u,
                  subTopics: u.subTopics.map((t: any) => {
                    const flatData = topicDataMap.get(t.id);
                    if (!flatData) return t;
                    // Merge: prefer existing data, fill missing from flat backup
                    const mcqs = (t.mcqs && t.mcqs.length > 0) ? t.mcqs : (flatData.mcqs || []);
                    if (mcqs.length > 0) mcqsRestored += mcqs.length;
                    return {
                      ...t,
                      mcqs,
                      notesArr: (t.notesArr && t.notesArr.length > 0) ? t.notesArr : (flatData.notesArr || t.notesArr || []),
                      attachments: (t.attachments && t.attachments.length > 0) ? t.attachments : (flatData.attachments || t.attachments || []),
                      resourceLinks: (t.resourceLinks && t.resourceLinks.length > 0) ? t.resourceLinks : (flatData.resourceLinks || t.resourceLinks || []),
                      timeEntries: (t.timeEntries && t.timeEntries.length > 0) ? t.timeEntries : (flatData.timeEntries || t.timeEntries || []),
                    };
                  }),
                })),
              })),
            };
          }
          onImport(restoredAppState);
          let restored: string[] = ['subjects', 'dailyLogs'];
          if (data.settings) { try { localStorage.setItem('nursing-settings-v2', JSON.stringify(data.settings)); restored.push('settings'); } catch {} }
          if (data.coins) { try { localStorage.setItem('nursing-coins-v1', JSON.stringify(data.coins)); restored.push('coins'); } catch {} }
          if (data.store) { try { localStorage.setItem('nursing-store-v1', JSON.stringify(data.store)); restored.push('store'); } catch {} }
          if (data.history && Array.isArray(data.history)) { try { localStorage.setItem('nursing-history-v1', JSON.stringify(data.history)); restored.push('history'); } catch {} }
          if (data.trash && Array.isArray(data.trash)) { try { localStorage.setItem('nursing-trash-v1', JSON.stringify(data.trash)); restored.push('trash'); } catch {} }
          if (data.reminders && Array.isArray(data.reminders)) { try { localStorage.setItem('nursing-reminders-v1', JSON.stringify(data.reminders)); restored.push('reminders'); } catch {} }
          if (data.gamification) { try { localStorage.setItem('nursing-gamification-v2', JSON.stringify(data.gamification)); restored.push('gamification'); } catch {} }
          if (data.todos) { try { localStorage.setItem('nursetrack-todos', JSON.stringify(data.todos)); restored.push('todos'); } catch {} }
          if (data.calendarNotes) { try { localStorage.setItem('nursetrack-calendar-notes', JSON.stringify(data.calendarNotes)); restored.push('calendar notes'); } catch {} }
          if (data.tickerPrefs) { try { localStorage.setItem('nursetrack-ticker-prefs', JSON.stringify(data.tickerPrefs)); restored.push('ticker prefs'); } catch {} }
          if (data.clockMode) { try { localStorage.setItem('nursetrack-clock-mode', typeof data.clockMode === 'string' ? data.clockMode : JSON.stringify(data.clockMode)); restored.push('clock mode'); } catch {} }
          if (data.calendarSync != null) { try { localStorage.setItem('nursetrack-calendar-sync', typeof data.calendarSync === 'string' ? data.calendarSync : String(data.calendarSync)); restored.push('calendar sync'); } catch {} }
          if (data.excludedSubjects) { try { localStorage.setItem('nursetrack-excluded-subjects', JSON.stringify(data.excludedSubjects)); restored.push('excluded subjects'); } catch {} }
          if (data.chatHistory) { try { localStorage.setItem('nursetrack-chat-history', JSON.stringify(data.chatHistory)); restored.push('chat history'); } catch {} }
          if (data.dbSessions && Array.isArray(data.dbSessions)) { try { localStorage.setItem('nursing-dbsessions-v1', JSON.stringify(data.dbSessions)); restored.push('sessions'); } catch {} }
          if (data.installDismissed) { try { localStorage.setItem('nursetrack-install-dismissed', 'true'); restored.push('install prefs'); } catch {} }
          if (data.onboarded) { try { localStorage.setItem('nursetrack-onboarded-v7', 'true'); restored.push('onboarding'); } catch {} }
          if (data.activeTab) { try { sessionStorage.setItem('active-tab', data.activeTab); restored.push('active tab'); } catch {} }
          if (data.filterState) {
            try {
              const fs = data.filterState;
              if (fs.diffFilter) localStorage.setItem('nursetrack-diff-filter', JSON.stringify(fs.diffFilter));
              if (fs.timeFilter) localStorage.setItem('nursetrack-time-filter', JSON.stringify(fs.timeFilter));
              if (fs.subjectFilter) localStorage.setItem('nursetrack-subject-filter', JSON.stringify(fs.subjectFilter));
              if (fs.customFrom) localStorage.setItem('nursetrack-custom-from', JSON.stringify(fs.customFrom));
              if (fs.customTo) localStorage.setItem('nursetrack-custom-to', JSON.stringify(fs.customTo));
              restored.push('filters');
            } catch {}
          }
          // ── Restore user profile (name, avatar, coverGradient) ──
          if (data.userProfile && onUpdateUser && user) {
            const up = data.userProfile;
            onUpdateUser({
              ...user,
              name: up.name || user.name,
              avatar: up.avatar || user.avatar,
              coverGradient: up.coverGradient ?? user.coverGradient,
            });
            restored.push('profile');
          }
          const mcqMsg = mcqsRestored > 0 ? ` (${mcqsRestored} MCQs restored)` : '';
          toast.success(`✅ Restored: ${restored.join(', ')}${mcqMsg}`, {
            duration: 8000,
            dismissible: true,
            closeButton: true,
          });
          // Prompt reload via swipeable notification
          setTimeout(() => {
            pushNotif({
              emoji: '🔄',
              title: 'Reload recommended for full effect',
              subtitle: 'Swipe to dismiss or reload now',
              position: 'bottom',
              duration: 15000,
              action: { label: 'Reload Now', onClick: () => window.location.reload() },
            });
          }, 1500);
        } else toast.error('Invalid backup file');
      } catch (_e) { toast.error('Failed to parse backup'); }
    };
    importAsIs();
    setPreviewOpen(false);
    setParsedBackup(null);
  };

  return (
    <div className="space-y-4">
      <GlowCard className="p-4" paper>
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">📊 Backup Summary</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: '📚', label: 'Subjects', value: String((subjects || []).length) },
            { icon: '📝', label: 'Topics', value: `${doneTopics}/${totalTopics}` },
            { icon: '📅', label: 'Daily Logs', value: String(appState.dailyLogs.length) },
            { icon: '📂', label: 'Folders', value: String((appState.folders || []).length) },
            { icon: '⚙️', label: 'Settings', value: settings ? '✅' : '—' },
            { icon: '📜', label: 'History', value: `${(history || []).length}` },
            { icon: '🗑️', label: 'Trash', value: `${(trash || []).length}` },
            { icon: '⏰', label: 'Reminders', value: String(readLocalStorage('nursing-reminders-v1')?.length || 0) },
            { icon: '✅', label: 'Todos', value: String(readLocalStorage('nursetrack-todos')?.length || 0) },
            { icon: '🏆', label: 'Achievements', value: readLocalStorage('nursing-gamification-v2') ? '✅' : '—' },
            { icon: '🔗', label: 'Cal Sync', value: localStorage.getItem('nursetrack-calendar-sync') === 'true' ? '✅' : '—' },
            { icon: '⏱️', label: 'Sessions', value: String(readLocalStorage('nursing-dbsessions-v1')?.length || 0) },
            { icon: '💬', label: 'Chat History', value: readLocalStorage('nursetrack-chat-history') ? '✅' : '—' },
            { icon: '🎛️', label: 'Filters', value: readLocalStorage('nursetrack-diff-filter') ? '✅' : '—' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/30 border border-border/15">
              <span className="text-sm">{s.icon}</span>
              <span className="text-[10px] text-muted-foreground font-semibold flex-1">{s.label}</span>
              <span className="text-xs font-bold font-mono text-foreground">{s.value}</span>
            </div>
          ))}
        </div>
      </GlowCard>

      <GlowCard className="p-4" paper>
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent" /> Full A-Z Backup & Restore
        </h3>
        <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
          Export includes <span className="font-bold text-foreground">everything A-Z</span>: subjects, units, topics (with notes, MCQs, attachments, resources, tags, SRS data), daily logs (with sessions), folders, settings, store, achievements, history, trash, reminders, todos, calendar notes, ticker prefs, clock mode, profile & a full analytics summary.
        </p>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={exportData} className="gap-2 h-10 text-xs font-bold"><Download className="w-4 h-4" /> Export All</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2 h-10 text-xs font-bold"><Upload className="w-4 h-4" /> Import All</Button>
          <Button variant="outline" onClick={() => { onClearHistory(); toast.success('History cleared'); }} className="gap-2 h-10 text-xs">Clear History</Button>
          <Button variant="outline" onClick={() => { setResetOpen(true); setResetPw(''); setResetErr(''); }} className="gap-2 h-10 text-xs border-destructive/30 hover:bg-destructive/10">
            <Trash2 className="w-4 h-4 text-destructive" /> <span className="text-destructive">Reset All</span>
          </Button>
        </div>
      </GlowCard>

      <DownloadSection appState={appState} subjects={subjects || []} />

      <ExactRestoreDialog doc={exactDoc} fileName={exactName} onClose={() => setExactDoc(null)} />
      <ImportPreviewDialog
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setParsedBackup(null); }}
        fileName={previewFileName}
        fileStats={previewFileStats}
        currentStats={currentStats}
        onImportAsIs={() => performImport(parsedBackup, 'as-is')}
        onFreshStart={() => performImport(parsedBackup, 'fresh')}
        onMerge={() => performImport(parsedBackup, 'merge')}
      />

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent className="glass-card bg-card/90 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Lock className="w-5 h-5 text-destructive" /> Reset All Progress</AlertDialogTitle>
            <AlertDialogDescription>Type <strong>RESET ALL DATA</strong> to confirm.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={resetPw} onChange={e => { setResetPw(e.target.value); setResetErr(''); }} placeholder='Type "RESET ALL DATA"' />
          {resetErr && <p className="text-xs text-destructive">{resetErr}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" size="sm" disabled={resetLoading} onClick={async () => {
              if (resetPw !== 'RESET ALL DATA') { setResetErr('Type "RESET ALL DATA" to confirm'); return; }
              setResetLoading(true);
              try {
                const { confirmReset } = await import('@/platform/api');
                const result = await confirmReset({ confirmText: 'RESET ALL DATA' });
                if (result.success) { onReset(); setResetOpen(false); toast.success('All data reset'); }
                else setResetErr(result.message);
              } catch { onReset(); setResetOpen(false); toast.success('Local data reset'); }
              setResetLoading(false);
            }}>{resetLoading ? 'Resetting...' : 'Reset'}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DownloadSection({ appState, subjects }: { appState: AppState; subjects: Subject[] }) {
  const downloadDocumentation = () => {
    const totalTopics = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
    const doneTopics = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);
    const doc = `# 🩺 NurseTrack Pro — Documentation\nGenerated: ${new Date().toLocaleString()}\n\nSubjects: ${subjects.length}\nTopics: ${doneTopics}/${totalTopics}\nDaily Logs: ${appState.dailyLogs.length}\n`;
    const blob = new Blob([doc], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `NurseTrack-Pro-Doc-${new Date().toISOString().split('T')[0]}.md`; a.click();
    URL.revokeObjectURL(url);
    toast.success('📄 Documentation downloaded!');
  };

  return (
    <GlowCard className="p-4" paper>
      <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
        <Code2 className="w-4 h-4 text-primary" /> Export & Documentation
      </h3>
      <p className="text-xs text-muted-foreground mb-3">Download app documentation and source manifest.</p>
      <div className="grid grid-cols-1 gap-2">
        <Button variant="outline" onClick={downloadDocumentation} className="gap-2 h-11 text-xs justify-start">
          <FileText className="w-4 h-4 text-primary" />
          <div className="text-left">
            <p className="font-bold">App Documentation</p>
            <p className="text-[10px] text-muted-foreground font-normal">Quick summary • Markdown</p>
          </div>
        </Button>
        <Button variant="outline" onClick={() => {
          import('../../lib/docGenerator').then(({ generateDocHTML }) => {
            const html = generateDocHTML(appState, subjects);
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'NurseTrack-Pro-Visual-Docs-' + new Date().toISOString().split('T')[0] + '.html'; a.click();
            URL.revokeObjectURL(url);
            toast.success('🌐 Visual documentation downloaded!');
          });
        }} className="gap-2 h-11 text-xs justify-start">
          <Globe className="w-4 h-4 text-accent" />
          <div className="text-left">
            <p className="font-bold">Visual Documentation (HTML)</p>
            <p className="text-[10px] text-muted-foreground font-normal">Screen previews • Self-contained</p>
          </div>
        </Button>
      </div>
    </GlowCard>
  );
}
