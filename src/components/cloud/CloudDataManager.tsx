import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X, Cloud, Download, Trash2, RefreshCw, ChevronDown, ChevronRight, Database, HardDrive, Shield } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { Subject, DailyLog, AppState, UserSettings, HistoryEntry, TrashItem, Reminder, DbStudySession } from '../../types';
import { formatStudyTime, getUnifiedTotalMinutes } from '../../lib/utils';
import GlowCard from '../shared/GlowCard';
import { flushAllLocalStorage } from '../../hooks/useLocalStorage';

interface Props {
  appState: AppState;
  settings: UserSettings;
  history: HistoryEntry[];
  trash: TrashItem[];
  reminders: Reminder[];
  syncStatus: 'idle' | 'syncing' | 'saved' | 'error';
  onClose: () => void;
  onTriggerSync: () => void;
  dbSessions?: DbStudySession[];
}

interface DataCategory {
  id: string;
  icon: string;
  title: string;
  lsKey: string;
  getCount: () => number;
  getDetail: () => string;
}

function estimateSize(key: string): string {
  try {
    const v = localStorage.getItem(key);
    if (!v) return '0 B';
    const bytes = new Blob([v]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } catch { return '—'; }
}

function getLastModified(): string {
  try {
    flushAllLocalStorage(); // make sure pending debounced writes are on disk before reading
    const state = JSON.parse(localStorage.getItem('nursing-tracker-v6') || '{}');
    if (state.lastUpdated) {
      const d = new Date(state.lastUpdated);
      return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    }
  } catch {}
  return 'Unknown';
}

export default function CloudDataManager({ appState, settings, history, trash, reminders, syncStatus, onClose, onTriggerSync, dbSessions }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; lsKey: string } | null>(null);

  const subjects = appState.subjects;
  const dailyLogs = appState.dailyLogs;
  const totalTopics = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
  const doneTopics = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);

  const categories: DataCategory[] = useMemo(() => [
    { id: 'subjects', icon: '📚', title: 'Subjects & Topics', lsKey: 'nursing-tracker-v6',
      getCount: () => subjects.length,
      getDetail: () => `${subjects.length} subjects · ${totalTopics} topics (${doneTopics} done) · ${formatStudyTime(getUnifiedTotalMinutes(subjects, dbSessions, dailyLogs))} tracked` },
    { id: 'logs', icon: '📅', title: 'Daily Logs', lsKey: 'nursing-tracker-v6',
      getCount: () => dailyLogs.filter(l => l.hoursStudied > 0 || l.topicsCompleted > 0).length,
      getDetail: () => `${dailyLogs.length} total entries · ${dailyLogs.filter(l => l.hoursStudied > 0 || l.topicsCompleted > 0).length} active days` },
    { id: 'settings', icon: '⚙️', title: 'App Settings', lsKey: 'nursing-settings-v2',
      getCount: () => 1,
      getDetail: () => `Theme: ${settings.themeMode || 'light'} · Goals: ${settings.studyGoals?.dailyTopics || 0}/day` },
    { id: 'history', icon: '📜', title: 'Activity History', lsKey: 'nursing-history-v1',
      getCount: () => history.length,
      getDetail: () => `${history.length} entries` },
    { id: 'trash', icon: '🗑️', title: 'Trash', lsKey: 'nursing-trash-v1',
      getCount: () => trash.length,
      getDetail: () => `${trash.length} items` },
    { id: 'reminders', icon: '⏰', title: 'Reminders', lsKey: 'nursing-reminders-v1',
      getCount: () => reminders.length,
      getDetail: () => `${reminders.length} reminders · ${reminders.filter(r => r.enabled).length} active` },
    { id: 'todos', icon: '✅', title: 'To-Do Lists', lsKey: 'nursetrack-todos',
      getCount: () => { try { return JSON.parse(localStorage.getItem('nursetrack-todos') || '[]').length; } catch { return 0; } },
      getDetail: () => { try { const t = JSON.parse(localStorage.getItem('nursetrack-todos') || '[]'); return `${t.length} tasks · ${t.filter((x: any) => x.completed).length} completed`; } catch { return '0 tasks'; } } },
    { id: 'gamification', icon: '🏆', title: 'Achievements & XP', lsKey: 'nursing-gamification-v2',
      getCount: () => { try { const g = JSON.parse(localStorage.getItem('nursing-gamification-v2') || '{}'); return Object.keys(g.unlocked || {}).length; } catch { return 0; } },
      getDetail: () => { try { const g = JSON.parse(localStorage.getItem('nursing-gamification-v2') || '{}'); return `${Object.keys(g.unlocked || {}).length} achievements unlocked`; } catch { return 'No data'; } } },
    { id: 'store', icon: '🪙', title: 'Store & Coins', lsKey: 'nursing-store-v1',
      getCount: () => { try { const s = JSON.parse(localStorage.getItem('nursing-store-v1') || '{}'); return (s.unlockedItems || []).length; } catch { return 0; } },
      getDetail: () => { try { const c = JSON.parse(localStorage.getItem('nursing-coins-v1') || '{}'); const s = JSON.parse(localStorage.getItem('nursing-store-v1') || '{}'); return `${c.coins || 0} coins · ${(s.unlockedItems || []).length} items`; } catch { return 'No data'; } } },
    { id: 'calendar', icon: '📝', title: 'Calendar Notes', lsKey: 'nursetrack-calendar-notes',
      getCount: () => { try { return Object.keys(JSON.parse(localStorage.getItem('nursetrack-calendar-notes') || '{}')).length; } catch { return 0; } },
      getDetail: () => { try { const n = Object.keys(JSON.parse(localStorage.getItem('nursetrack-calendar-notes') || '{}')); return `${n.length} date notes`; } catch { return '0 notes'; } } },
  ], [subjects, dailyLogs, settings, history, trash, reminders, totalTopics, doneTopics]);

  const totalSize = useMemo(() => {
    const keys = ['nursing-tracker-v6', 'nursing-settings-v2', 'nursing-history-v1', 'nursing-trash-v1', 'nursing-reminders-v1', 'nursetrack-todos', 'nursing-gamification-v2', 'nursing-store-v1', 'nursing-coins-v1', 'nursetrack-calendar-notes', 'nursetrack-ticker-prefs'];
    let total = 0;
    keys.forEach(k => { try { const v = localStorage.getItem(k); if (v) total += new Blob([v]).size; } catch {} });
    if (total < 1024) return `${total} B`;
    if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
    return `${(total / (1024 * 1024)).toFixed(2)} MB`;
  }, []);

  const exportCategory = (cat: DataCategory) => {
    try {
      const data = localStorage.getItem(cat.lsKey);
      if (!data) { toast.error('No data found'); return; }
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${cat.id}-backup-${new Date().toISOString().split('T')[0]}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`📦 ${cat.title} exported!`);
    } catch { toast.error('Export failed'); }
  };

  const handleDeleteCategory = () => {
    if (!deleteTarget) return;
    try {
      localStorage.removeItem(deleteTarget.lsKey);
      toast.success(`🗑️ ${deleteTarget.title} data cleared`);
    } catch { toast.error('Failed to clear'); }
    setDeleteTarget(null);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className="fixed inset-0 z-[100] bg-background overflow-y-auto">

      {/* Header */}
      <div className="sticky top-0 z-10 glass-header border-b border-border/20">
        <div className="flex items-center gap-3 px-4 sm:px-6 h-14 max-w-3xl mx-auto">
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted/20 flex items-center justify-center hover:bg-muted/30 transition-colors">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Cloud className="w-4 h-4 text-primary" /> Device Data Manager
            </h1>
            <p className="text-[9px] text-muted-foreground">Manage your app's stored data</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold border ${
              syncStatus === 'saved' ? 'bg-secondary/10 border-secondary/20 text-secondary' :
              syncStatus === 'syncing' ? 'bg-primary/10 border-primary/20 text-primary' :
              syncStatus === 'error' ? 'bg-destructive/10 border-destructive/20 text-destructive' :
              'bg-muted/20 border-border/20 text-muted-foreground'
            }`}>
              {syncStatus === 'syncing' && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
              {syncStatus === 'saved' ? '☁️ Synced' : syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? '⚠️ Error' : '💤 Idle'}
            </span>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted/20 flex items-center justify-center hover:bg-muted/30 transition-colors">
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 pb-10 space-y-4">
        {/* Overview Card */}
        <GlowCard className="p-4" paper>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground">Data Overview</h3>
              <p className="text-[10px] text-muted-foreground">Last modified: {getLastModified()}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onTriggerSync} className="gap-1.5 text-[10px] h-8 rounded-xl">
              <RefreshCw className="w-3 h-3" /> Sync Now
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-primary/8 border border-primary/15 p-2.5 text-center">
              <HardDrive className="w-3.5 h-3.5 text-primary mx-auto mb-1" />
              <p className="text-sm font-black font-mono text-primary">{totalSize}</p>
              <p className="text-[8px] text-muted-foreground font-bold">TOTAL SIZE</p>
            </div>
            <div className="rounded-xl bg-secondary/8 border border-secondary/15 p-2.5 text-center">
              <Database className="w-3.5 h-3.5 text-secondary mx-auto mb-1" />
              <p className="text-sm font-black font-mono text-secondary">{categories.reduce((a, c) => a + c.getCount(), 0)}</p>
              <p className="text-[8px] text-muted-foreground font-bold">TOTAL RECORDS</p>
            </div>
            <div className="rounded-xl bg-accent/8 border border-accent/15 p-2.5 text-center">
              <Shield className="w-3.5 h-3.5 text-accent mx-auto mb-1" />
              <p className="text-sm font-black font-mono text-foreground">{categories.length}</p>
              <p className="text-[8px] text-muted-foreground font-bold">CATEGORIES</p>
            </div>
          </div>
        </GlowCard>

        {/* Data Categories */}
        <div className="space-y-2">
          {categories.map(cat => {
            const isExpanded = expandedId === cat.id;
            const count = cat.getCount();
            const size = estimateSize(cat.lsKey);
            return (
              <div key={cat.id} className="rounded-2xl border border-border/15 bg-card/20 overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : cat.id)}
                  className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-muted/5 transition-colors active:scale-[0.998]">
                  <span className="text-lg">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-foreground">{cat.title}</h3>
                      {count > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary/10 text-[9px] text-primary font-bold flex items-center justify-center">{count}</span>
                      )}
                    </div>
                    <p className="text-[9px] text-muted-foreground font-medium truncate">{cat.getDetail()}</p>
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground/60 shrink-0">{size}</span>
                  <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 350 }} className="overflow-hidden">
                      <div className="px-3.5 pb-3.5 pt-1 border-t border-border/10">
                        <div className="rounded-xl bg-muted/8 border border-border/10 p-3 mb-3">
                          <p className="text-[10px] text-foreground font-semibold mb-1">📋 Details</p>
                          <p className="text-[10px] text-muted-foreground leading-relaxed">{cat.getDetail()}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-[9px] text-muted-foreground">Storage: <strong className="text-foreground">{size}</strong></span>
                            <span className="text-[9px] text-muted-foreground">Records: <strong className="text-foreground">{count}</strong></span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => exportCategory(cat)} className="flex-1 gap-1.5 text-[10px] h-8 rounded-xl">
                            <Download className="w-3 h-3" /> Export
                          </Button>
                          {cat.id !== 'subjects' && cat.id !== 'logs' && (
                            <Button variant="outline" size="sm"
                              onClick={() => setDeleteTarget({ id: cat.id, title: cat.title, lsKey: cat.lsKey })}
                              className="gap-1.5 text-[10px] h-8 rounded-xl text-destructive border-destructive/20 hover:bg-destructive/10">
                              <Trash2 className="w-3 h-3" /> Clear
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="glass-card bg-card/90 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear {deleteTarget?.title}?</AlertDialogTitle>
            <AlertDialogDescription>This will remove all {deleteTarget?.title?.toLowerCase()} data from local storage. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCategory} className="bg-destructive text-destructive-foreground">Clear Data</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
