/**
 * Cloud Sync Center — the single place that answers:
 *   "Is my data in the cloud right now, and which devices have it?"
 *
 * Sections
 *   Overview   → account, live status, auto-sync, manual actions, privacy
 *   Devices    → every signed-in device, last seen, remote sign-out
 *   Recovery   → restore points (server revisions) + merge conflicts
 *   This device→ per-category local data (export / clear)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, ArrowLeft, ArrowUpFromLine, Check, ChevronRight, CircleDot, Cloud,
  CloudOff, Download, HardDrive, History, Loader2, Lock, Laptop, LogOut, Pencil,
  RefreshCw, RotateCcw, ShieldCheck, Smartphone, Trash2, Wifi, WifiOff, X,
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Switch } from '@project/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { AppState, DbStudySession, DailyLog, HistoryEntry, Reminder, Subject, TrashItem, UserSettings } from '../../types';
import { formatStudyTime, getUnifiedTotalMinutes } from '../../lib/utils';
import {
  CloudDevice, changePassword, deleteCloudAccount, listDevices, refreshAccount,
  revokeDevice, revokeOtherDevices, useCloudAuth,
} from '../../platform/cloud/authStore';
import { getCloudEndpoint } from '../../platform/cloud/config';
import { getDeviceIdentity, renameDevice } from '../../platform/cloud/device';
import {
  clearConflicts, fetchRevisions, pullCloudOverDevice, pushDeviceOverCloud,
  requestFullPull, resolveFirstSync, restoreRevision, Revision, setAutoSync,
  syncNow, useSyncState, wipeCloudCopy,
} from '../../platform/cloud/syncEngine';
import { DEVICE_ONLY_KEYS, totalLocalBytes } from '../../platform/cloud/sections';
import { useAuth } from '../../platform/auth';
import CloudDataManager from './CloudDataManager';
import GlowCard from '../shared/GlowCard';

interface Props {
  appState: AppState;
  settings: UserSettings;
  history: HistoryEntry[];
  trash: TrashItem[];
  reminders: Reminder[];
  dbSessions?: DbStudySession[];
  dailyLogs?: DailyLog[];
  onClose: () => void;
}

type Tab = 'overview' | 'devices' | 'recovery' | 'device-data';

const TABS: Array<{ id: Tab; label: string; icon: typeof Cloud }> = [
  { id: 'overview', label: 'Overview', icon: Cloud },
  { id: 'devices', label: 'Devices', icon: Smartphone },
  { id: 'recovery', label: 'Recovery', icon: History },
  { id: 'device-data', label: 'On device', icon: HardDrive },
];

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const diff = Date.now() - then;
  if (diff < 0) return 'just now';
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function bytesLabel(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function platformIcon(platform: string) {
  const p = (platform || '').toLowerCase();
  if (p.includes('android') || p.includes('ios')) return Smartphone;
  return Laptop;
}

export default function SyncCenter({ appState, settings, history, trash, reminders, dbSessions, dailyLogs, onClose }: Props) {
  const { user, logout } = useAuth();
  const cloud = useCloudAuth();
  const sync = useSyncState();

  const [tab, setTab] = useState<Tab>('overview');
  const [devices, setDevices] = useState<CloudDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    | { kind: 'pull-cloud' }
    | { kind: 'push-device' }
    | { kind: 'wipe-cloud' }
    | { kind: 'delete-account' }
    | { kind: 'revoke-device'; device: CloudDevice }
    | { kind: 'revoke-others' }
    | { kind: 'restore'; revision: Revision }
    | null
  >(null);
  const [password, setPassword] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [deviceName, setDeviceName] = useState(getDeviceIdentity().name);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const subjects = appState.subjects;
  const totalTopics = useMemo(() => subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0), [subjects]);
  const doneTopics = useMemo(() => subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0), [subjects]);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try { setDevices(await listDevices()); } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load devices');
    } finally { setDevicesLoading(false); }
  }, []);

  const loadRevisions = useCallback(async () => {
    setRevisionsLoading(true);
    try { setRevisions(await fetchRevisions()); } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load restore points');
    } finally { setRevisionsLoading(false); }
  }, []);

  useEffect(() => {
    if (!cloud.user) return;
    if (tab === 'devices') void loadDevices();
    if (tab === 'recovery') void loadRevisions();
  }, [tab, cloud.user, loadDevices, loadRevisions]);

  const statusCopy = useMemo(() => {
    if (sync.needsChoice) return { label: 'Needs a decision', tone: 'text-chart-4', dot: 'bg-chart-4' };
    switch (sync.phase) {
      case 'syncing': return { label: 'Syncing now', tone: 'text-primary', dot: 'bg-primary' };
      case 'synced': return { label: 'Everything is saved', tone: 'text-secondary', dot: 'bg-secondary' };
      case 'pending': return { label: `${sync.pendingKeys.length} change${sync.pendingKeys.length === 1 ? '' : 's'} waiting`, tone: 'text-chart-4', dot: 'bg-chart-4' };
      case 'offline': return { label: 'Offline — safe on device', tone: 'text-chart-4', dot: 'bg-chart-4' };
      case 'needs-choice': return { label: 'Choose how to merge', tone: 'text-chart-4', dot: 'bg-chart-4' };
      case 'paused': return { label: 'Auto-sync paused', tone: 'text-muted-foreground', dot: 'bg-muted-foreground' };
      case 'error': return { label: 'Sync needs attention', tone: 'text-destructive', dot: 'bg-destructive' };
      case 'disabled': return { label: 'Not signed in', tone: 'text-muted-foreground', dot: 'bg-muted-foreground' };
      default: return { label: 'Ready', tone: 'text-muted-foreground', dot: 'bg-muted-foreground' };
    }
  }, [sync.phase, sync.pendingKeys.length, sync.needsChoice]);

  const run = async (label: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(label);
    try {
      await fn();
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That did not work');
    } finally {
      setBusy(null);
    }
  };

  const handleSyncNow = () => run('sync', async () => {
    const result = await syncNow('manual');
    if (!result.ok && result.error) throw new Error(result.error);
  }, '☁️ Synced');

  const handleConfirm = async () => {
    if (!confirm) return;
    switch (confirm.kind) {
      case 'pull-cloud':
        setBusy('pull-cloud');
        try {
          const result = await pullCloudOverDevice();
          toast.success(result.ok ? 'Cloud copy downloaded' : 'Nothing to download');
          setTimeout(() => window.location.reload(), 400);
        } catch (err) { toast.error(err instanceof Error ? err.message : 'Download failed'); }
        finally { setBusy(null); }
        break;
      case 'push-device':
        setBusy('push-device');
        try {
          const result = await pushDeviceOverCloud();
          if (!result.ok && result.error) throw new Error(result.error);
          toast.success('This device is now the cloud copy');
        } catch (err) { toast.error(err instanceof Error ? err.message : 'Upload failed'); }
        finally { setBusy(null); }
        break;
      case 'wipe-cloud':
        setBusy('wipe-cloud');
        try { await wipeCloudCopy(); toast.success('Cloud copy cleared — this device is untouched'); }
        catch (err) { toast.error(err instanceof Error ? err.message : 'Could not clear the cloud copy'); }
        finally { setBusy(null); }
        break;
      case 'delete-account':
        setBusy('delete-account');
        try { await deleteCloudAccount(password); toast.success('Cloud account deleted'); setTimeout(() => window.location.reload(), 500); }
        catch (err) { toast.error(err instanceof Error ? err.message : 'Could not delete the account'); }
        finally { setBusy(null); }
        break;
      case 'revoke-device':
        setBusy('revoke');
        try {
          const next = await revokeDevice(confirm.device.id);
          setDevices(next);
          toast.success(`${confirm.device.name} signed out`);
        } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not sign that device out'); }
        finally { setBusy(null); }
        break;
      case 'revoke-others':
        setBusy('revoke-others');
        try { await revokeOtherDevices(); await loadDevices(); toast.success('All other devices signed out'); }
        catch (err) { toast.error(err instanceof Error ? err.message : 'Could not sign out other devices'); }
        finally { setBusy(null); }
        break;
      case 'restore':
        setBusy('restore');
        try {
          await restoreRevision(confirm.revision.version);
          toast.success('Restore point applied — reloading');
          setTimeout(() => window.location.reload(), 700);
        } catch (err) { toast.error(err instanceof Error ? err.message : 'Restore failed'); }
        finally { setBusy(null); }
        break;
    }
    setConfirm(null);
    setPassword('');
  };

  const handleSignOut = async () => {
    await logout();
    onClose();
    setTimeout(() => window.location.reload(), 200);
  };

  const handleChangePassword = async () => {
    setPwError(null);
    if (pwNew.length < 8) { setPwError('Use at least 8 characters.'); return; }
    if (!/[a-zA-Z]/.test(pwNew) || !/\d/.test(pwNew)) { setPwError('Include at least one letter and one number.'); return; }
    if (pwNew !== pwConfirm) { setPwError('The new passwords do not match.'); return; }
    setPwBusy(true);
    try {
      await changePassword({ currentPassword: pwCurrent, newPassword: pwNew });
      setPasswordOpen(false);
      toast.success('Password changed — every other device was signed out');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not change the password');
    } finally {
      setPwBusy(false);
    }
  };

  const handleRename = async () => {
    const name = deviceName.trim();
    if (!name) return;
    renameDevice(name);
    setRenameOpen(false);
    toast.success('Device renamed');
    void refreshAccount();
    if (tab === 'devices') void loadDevices();
  };

  if (!cloud.user) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] bg-background overflow-y-auto">
        <div className="sticky top-0 z-10 glass-header border-b border-border/20">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-14 max-w-3xl mx-auto">
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted/20 flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
            <h1 className="text-sm font-bold">Cloud sync</h1>
          </div>
        </div>
        <div className="max-w-md mx-auto px-5 py-16 text-center space-y-4">
          <span className="text-4xl">☁️</span>
          <h2 className="font-heading text-xl">You are working offline</h2>
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            Everything is saved on this device. Create an account to keep the same data on your
            phone, tablet and laptop — your existing topics are uploaded automatically.
          </p>
          <Button className="w-full h-11 rounded-xl font-bold" onClick={() => { window.dispatchEvent(new CustomEvent('rj:open-auth', { detail: { mode: 'signup' } })); onClose(); }}>
            Create an account
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className="fixed inset-0 z-[100] bg-background overflow-y-auto">

      {/* Header */}
      <div className="sticky top-0 z-10 glass-header border-b border-border/20">
        <div className="flex items-center gap-3 px-4 sm:px-6 h-14 max-w-3xl mx-auto">
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted/20 flex items-center justify-center hover:bg-muted/30 transition-colors" aria-label="Back">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Cloud className="w-4 h-4 text-primary" /> Cloud sync
            </h1>
            <p className={`text-[9.5px] font-semibold ${statusCopy.tone}`}>{statusCopy.label}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold border ${
            sync.phase === 'synced' ? 'bg-secondary/10 border-secondary/20 text-secondary'
              : sync.phase === 'error' ? 'bg-destructive/10 border-destructive/20 text-destructive'
                : sync.phase === 'syncing' ? 'bg-primary/10 border-primary/20 text-primary'
                  : 'bg-muted/20 border-border/20 text-muted-foreground'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusCopy.dot} ${sync.phase === 'syncing' ? 'animate-pulse' : ''}`} />
            {sync.online ? 'Online' : 'Offline'}
          </span>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted/20 flex items-center justify-center hover:bg-muted/30 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-2 flex gap-1 overflow-x-auto scrollbar-none">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                {t.id === 'recovery' && sync.conflictCount > 0 && (
                  <span className="min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[8px] font-black flex items-center justify-center">
                    {sync.conflictCount}
                  </span>
                )}
                {active && <motion.span layoutId="sync-tab" className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 pb-14 space-y-4">
        <AnimatePresence mode="wait">
          {/* ── OVERVIEW ─────────────────────────────────────────── */}
          {tab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
              {/* Account */}
              <GlowCard className="p-4" paper>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-lg font-black text-primary-foreground shadow-md shadow-primary/20 overflow-hidden">
                    {user?.image && user.image.startsWith('data:image') ? (
                      <img src={user.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (user?.name || user?.email || '?').slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[14px] font-bold text-foreground truncate">{user?.name || 'Student'}</p>
                      <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-black tracking-[0.12em] border border-primary/15 shrink-0">PRO</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-secondary"><ShieldCheck className="w-3 h-3" /> Personal cloud</span>
                      <span className="text-[9px] text-muted-foreground">·</span>
                      <button onClick={() => { setTab('devices'); }} className="text-[9px] font-bold text-primary hover:underline">
                        {devices.length > 0 ? `${devices.length} device${devices.length === 1 ? '' : 's'}` : 'Devices'}
                      </button>
                    </div>
                  </div>
                  <button onClick={handleSignOut} className="w-9 h-9 rounded-xl bg-muted/20 flex items-center justify-center hover:bg-destructive/10 group transition-colors" title="Sign out" aria-label="Sign out">
                    <LogOut className="w-4 h-4 text-muted-foreground group-hover:text-destructive" />
                  </button>
                </div>
              </GlowCard>

              {/* Live status */}
              <GlowCard className="overflow-hidden" paper>
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                      sync.phase === 'synced' ? 'bg-secondary/10 border-secondary/20'
                        : sync.phase === 'error' ? 'bg-destructive/10 border-destructive/20'
                          : 'bg-primary/10 border-primary/20'
                    }`}>
                      {sync.phase === 'syncing' ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        : sync.phase === 'error' ? <CloudOff className="w-5 h-5 text-destructive" />
                          : sync.phase === 'offline' ? <WifiOff className="w-5 h-5 text-chart-4" />
                            : <Cloud className="w-5 h-5 text-secondary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-foreground">{statusCopy.label}</p>
                      <p className="text-[10.5px] text-muted-foreground mt-0.5">
                        Last sync {relativeTime(sync.lastSyncAt)} · cloud version {sync.version} · {bytesLabel(totalLocalBytes())} on this device
                      </p>
                      {sync.error && <p className="text-[10.5px] text-destructive font-semibold mt-1">{sync.error}</p>}
                      {cloud.offlineNotice && !sync.error && <p className="text-[10.5px] text-chart-4 font-semibold mt-1">{cloud.offlineNotice}</p>}
                    </div>
                    <Button
                      size="sm" variant="outline" onClick={handleSyncNow} disabled={busy === 'sync' || sync.phase === 'syncing'}
                      className="h-9 rounded-xl text-[11px] font-bold gap-1.5 shrink-0"
                    >
                      {(busy === 'sync' || sync.phase === 'syncing') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Sync now
                    </Button>
                  </div>

                  {sync.pendingKeys.length > 0 && (
                    <div className="mt-3 rounded-xl border border-chart-4/25 bg-chart-4/8 px-3 py-2">
                      <p className="text-[10.5px] font-bold text-chart-4">Waiting to upload</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{sync.pendingKeys.length} section{sync.pendingKeys.length === 1 ? '' : 's'} changed on this device. They upload automatically within seconds.</p>
                    </div>
                  )}

                  {sync.needsChoice && (
                    <div className="mt-3 rounded-xl border border-primary/25 bg-primary/6 p-3">
                      <p className="text-[11px] font-bold text-foreground">This account already has data</p>
                      <p className="text-[10.5px] text-muted-foreground mt-1 leading-relaxed">
                        {sync.needsChoice.remoteSections} synced section{sync.needsChoice.remoteSections === 1 ? '' : 's'} (version {sync.needsChoice.remoteVersion}) and {sync.needsChoice.localSections} on this device.
                        Merging keeps both — nothing is deleted.
                      </p>
                      <div className="flex gap-2 mt-2.5">
                        <Button size="sm" className="h-8 rounded-lg text-[10.5px] font-bold flex-1" onClick={() => run('merge', () => resolveFirstSync('merge'), 'Merged both — nothing lost')}>Merge both</Button>
                        <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10.5px] font-bold flex-1" onClick={() => setConfirm({ kind: 'pull-cloud' })}>Use cloud</Button>
                        <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10.5px] font-bold flex-1" onClick={() => setConfirm({ kind: 'push-device' })}>Use device</Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-border/10 grid grid-cols-3 divide-x divide-border/10">
                  {[
                    { label: 'Subjects', value: subjects.length },
                    { label: 'Topics done', value: `${doneTopics}/${totalTopics}` },
                    { label: 'Studied', value: formatStudyTime(getUnifiedTotalMinutes(subjects, dbSessions, dailyLogs)) },
                  ].map(item => (
                    <div key={item.label} className="px-3 py-2.5 text-center">
                      <p className="text-[12px] font-black font-mono text-foreground truncate">{item.value}</p>
                      <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                    </div>
                  ))}
                </div>
              </GlowCard>

              {/* Auto-sync */}
              <div className="rounded-2xl border border-border/15 bg-card/25 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/8 border border-primary/12 flex items-center justify-center">
                    <RefreshCw className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-bold text-foreground">Automatic sync</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Push changes after you stop typing, pull updates every 45 seconds and whenever the app comes back to the foreground.</p>
                  </div>
                  <Switch checked={sync.autoSync} onCheckedChange={v => { setAutoSync(v); toast.success(v ? 'Automatic sync on' : 'Automatic sync paused'); }} aria-label="Automatic sync" />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <button
                    onClick={handleSyncNow}
                    className="flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border/20 bg-card/40 text-[10.5px] font-bold text-foreground hover:border-primary/35 hover:bg-primary/5 transition-colors"
                  >
                    {sync.phase === 'syncing' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sync now
                  </button>
                  <button
                    onClick={() => run('full', async () => { const r = await requestFullPull(); if (!r.ok && r.error) throw new Error(r.error); }, 'Full refresh complete')}
                    className="flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border/20 bg-card/40 text-[10.5px] font-bold text-foreground hover:border-primary/35 hover:bg-primary/5 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Full refresh
                  </button>
                  <button
                    onClick={() => setConfirm({ kind: 'push-device' })}
                    className="flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border/20 bg-card/40 text-[10.5px] font-bold text-foreground hover:border-primary/35 hover:bg-primary/5 transition-colors"
                  >
                    <ArrowUpFromLine className="w-3 h-3" /> Upload this device
                  </button>
                </div>
              </div>

              {/* Connection details */}
              <div className="rounded-2xl border border-border/15 bg-card/25 overflow-hidden">
                <div className="px-4 py-3 border-b border-border/10">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Connection</p>
                </div>
                <div className="divide-y divide-border/10">
                  <Row label="Server" value={getCloudEndpoint()} mono />
                  <Row label="This device" value={`${getDeviceIdentity().name} · ${getDeviceIdentity().platform}`} onEdit={() => { setDeviceName(getDeviceIdentity().name); setRenameOpen(true); }} />
                  <Row label="Signed in" value={cloud.session ? new Date(cloud.session.signedInAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'} />
                  <Row label="Security" value="HTTPS · password hashed with scrypt · rotating refresh tokens" />
                </div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  <Button variant="outline" size="sm" onClick={() => { setPwError(null); setPwCurrent(''); setPwNew(''); setPwConfirm(''); setPasswordOpen(true); }} className="h-8 rounded-lg text-[10.5px] font-bold gap-1.5">
                    <Lock className="w-3 h-3" /> Change password
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleSignOut} className="h-8 rounded-lg text-[10.5px] font-bold gap-1.5 text-destructive border-destructive/25 hover:bg-destructive/8">
                    <LogOut className="w-3 h-3" /> Sign out
                  </Button>
                </div>
              </div>

              {/* Privacy */}
              <div className="rounded-2xl border border-border/15 bg-card/25 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-3.5 h-3.5 text-secondary" />
                  <p className="text-[11px] font-bold text-foreground">Kept on this device only</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DEVICE_ONLY_KEYS.map(key => (
                    <span key={key} className="text-[9.5px] font-semibold px-2 py-0.5 rounded-full bg-muted/25 text-muted-foreground border border-border/15">{key}</span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                  Cloud sync stores your study data on the server you configured. There are no ads,
                  no analytics and no third-party services involved.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── DEVICES ──────────────────────────────────────────── */}
          {tab === 'devices' && (
            <motion.div key="devices" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Signed in on {devices.length || 1} device{(devices.length || 1) === 1 ? '' : 's'}
                </p>
                <button onClick={loadDevices} className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
                  {devicesLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
                </button>
              </div>

              {devicesLoading && devices.length === 0 && (
                <div className="rounded-2xl border border-border/15 bg-card/20 p-6 text-center">
                  <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
                </div>
              )}

              {devices.map(device => {
                const Icon = platformIcon(device.platform);
                return (
                  <div key={device.id} className={`rounded-2xl border p-3.5 flex items-center gap-3 ${device.current ? 'border-primary/30 bg-primary/5' : 'border-border/15 bg-card/25'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${device.current ? 'bg-primary/10 border-primary/20' : 'bg-muted/20 border-border/15'}`}>
                      <Icon className={`w-4 h-4 ${device.current ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-bold text-foreground truncate flex items-center gap-1.5">
                        {device.name}
                        {device.current && <span className="text-[8px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-black uppercase tracking-wider">This device</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {device.platform} · active {relativeTime(device.lastSeenAt)} · added {relativeTime(device.createdAt)}
                      </p>
                    </div>
                    {device.current ? (
                      <button onClick={() => { setDeviceName(getDeviceIdentity().name); setRenameOpen(true); }} className="w-8 h-8 rounded-lg bg-muted/20 flex items-center justify-center hover:bg-muted/40" title="Rename" aria-label="Rename device">
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    ) : (
                      <button onClick={() => setConfirm({ kind: 'revoke-device', device })} className="w-8 h-8 rounded-lg bg-muted/20 flex items-center justify-center hover:bg-destructive/10 group" title="Sign out this device" aria-label={`Sign out ${device.name}`}>
                        <LogOut className="w-3.5 h-3.5 text-muted-foreground group-hover:text-destructive" />
                      </button>
                    )}
                  </div>
                );
              })}

              <Button
                variant="outline"
                onClick={() => setConfirm({ kind: 'revoke-others' })}
                className="w-full h-10 rounded-xl text-[11.5px] font-bold text-destructive border-destructive/25 hover:bg-destructive/8"
              >
                <LogOut className="w-3.5 h-3.5 mr-1.5" /> Sign out every other device
              </Button>

              <p className="text-[10px] text-muted-foreground leading-relaxed px-1">
                Signing a device out removes its refresh token immediately. Its already-issued access
                token stops working within 30 minutes; change your password to end every session at once.
              </p>

              <div className="rounded-2xl border border-border/15 bg-card/25 p-4 space-y-3">
                <p className="text-[11px] font-bold text-foreground">Transfer this device&apos;s data</p>
                <div className="grid gap-2">
                  <button onClick={() => setConfirm({ kind: 'pull-cloud' })} className="flex items-center gap-3 rounded-xl border border-border/20 bg-card/40 px-3 py-2.5 text-left hover:border-primary/30 transition-colors">
                    <Download className="w-4 h-4 text-primary shrink-0" />
                    <span className="flex-1">
                      <span className="block text-[11.5px] font-bold text-foreground">Download the cloud copy</span>
                      <span className="block text-[10px] text-muted-foreground">Replace everything here with what the server has.</span>
                    </span>
                  </button>
                  <button onClick={() => setConfirm({ kind: 'push-device' })} className="flex items-center gap-3 rounded-xl border border-border/20 bg-card/40 px-3 py-2.5 text-left hover:border-primary/30 transition-colors">
                    <ArrowUpFromLine className="w-4 h-4 text-primary shrink-0" />
                    <span className="flex-1">
                      <span className="block text-[11.5px] font-bold text-foreground">Upload this device</span>
                      <span className="block text-[10px] text-muted-foreground">Make this device the source of truth for every other device.</span>
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── RECOVERY ─────────────────────────────────────────── */}
          {tab === 'recovery' && (
            <motion.div key="recovery" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
              <div className="rounded-2xl border border-secondary/20 bg-secondary/5 p-3.5 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                <p className="text-[10.5px] text-muted-foreground leading-relaxed">
                  Every accepted sync is stored as a restore point on your server. If something ever
                  looks wrong, roll the cloud copy back — this device follows.
                </p>
              </div>

              {sync.conflictCount > 0 && (
                <div className="rounded-2xl border border-chart-4/25 bg-chart-4/6 overflow-hidden">
                  <div className="flex items-center gap-2 px-3.5 py-3 border-b border-chart-4/15">
                    <AlertTriangle className="w-4 h-4 text-chart-4" />
                    <p className="flex-1 text-[11.5px] font-bold text-foreground">{sync.conflictCount} field{sync.conflictCount === 1 ? '' : 's'} changed on two devices</p>
                    <button onClick={() => { clearConflicts(); toast.success('Conflict log cleared'); }} className="text-[10px] font-bold text-muted-foreground hover:text-foreground">Clear log</button>
                  </div>
                  <div className="divide-y divide-border/10 max-h-80 overflow-y-auto">
                    {sync.conflicts.map(conflict => (
                      <div key={conflict.id} className="px-3.5 py-2.5">
                        <p className="text-[10px] font-bold text-foreground">{conflict.label} · <span className="font-mono text-[9.5px] text-muted-foreground">{conflict.path}</span></p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Kept <strong className="text-foreground">{conflict.localPreview}</strong> from this device; the other device had <strong className="text-foreground">{conflict.remotePreview}</strong>.
                        </p>
                        <p className="text-[9px] text-muted-foreground/70 mt-0.5">{relativeTime(conflict.at)}</p>
                      </div>
                    ))}
                  </div>
                  <p className="px-3.5 py-2 text-[9.5px] text-muted-foreground border-t border-chart-4/15">
                    Nothing was thrown away: the losing value is listed here and the previous cloud
                    state is available as a restore point below.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Restore points</p>
                <button onClick={loadRevisions} className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
                  {revisionsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
                </button>
              </div>

              {revisions.length === 0 && !revisionsLoading && (
                <div className="rounded-2xl border border-border/15 bg-card/20 p-6 text-center">
                  <p className="text-[11.5px] font-semibold text-foreground">No restore points yet</p>
                  <p className="text-[10.5px] text-muted-foreground mt-1">They appear after your first successful sync.</p>
                </div>
              )}

              {revisions.map(rev => (
                <div key={rev.version} className="rounded-2xl border border-border/15 bg-card/25 p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-muted/20 border border-border/15 flex items-center justify-center">
                    <History className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11.5px] font-bold text-foreground">Version {rev.version}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(rev.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {bytesLabel(rev.bytes)} · {rev.keys.length} section{rev.keys.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold" onClick={() => setConfirm({ kind: 'restore', revision: rev })}>
                    Restore
                  </Button>
                </div>
              ))}

              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 space-y-2.5 mt-2">
                <p className="text-[11px] font-bold text-destructive">Danger zone</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Deleting the cloud copy stops sync and removes the server data. This device keeps
                  its own copy; other devices lose theirs on their next sync.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: 'wipe-cloud' })} className="h-8 rounded-lg text-[10px] font-bold border-destructive/25 text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-3 h-3 mr-1" /> Clear cloud copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: 'delete-account' })} className="h-8 rounded-lg text-[10px] font-bold border-destructive/25 text-destructive hover:bg-destructive/10">
                    <X className="w-3 h-3 mr-1" /> Delete account
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── ON DEVICE ────────────────────────────────────────── */}
          {tab === 'device-data' && (
            <motion.div key="device-data" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <CloudDataManager
                embedded
                appState={appState}
                settings={settings}
                history={history}
                trash={trash}
                reminders={reminders}
                dbSessions={dbSessions}
                syncStatus={sync.phase === 'syncing' ? 'syncing' : sync.phase === 'error' ? 'error' : sync.phase === 'synced' ? 'saved' : 'idle'}
                onClose={onClose}
                onTriggerSync={handleSyncNow}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Rename device */}
      <AlertDialog open={renameOpen} onOpenChange={setRenameOpen}>
        <AlertDialogContent className="glass-card bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Rename this device</AlertDialogTitle>
            <AlertDialogDescription>The name other devices see in their device list.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="e.g. Riya&apos;s phone" className="h-10 rounded-xl" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRename}>Save name</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change password */}
      <AlertDialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <AlertDialogContent className="glass-card bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Change your password</AlertDialogTitle>
            <AlertDialogDescription>
              Your other devices will be signed out and must use the new password. Study data is
              untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2.5">
            <Input type="password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder="Current password" autoComplete="current-password" className="h-10 rounded-xl" />
            <Input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="New password (8+ characters)" autoComplete="new-password" className="h-10 rounded-xl" />
            <Input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" className="h-10 rounded-xl" />
            {pwError && <p role="alert" className="text-[11px] font-semibold text-destructive">{pwError}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleChangePassword} disabled={pwBusy || !pwCurrent || !pwNew}>
              {pwBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Update password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation dialogs */}
      <AlertDialog open={!!confirm} onOpenChange={() => { setConfirm(null); setPassword(''); }}>
        <AlertDialogContent className="glass-card bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'pull-cloud' && 'Replace this device with the cloud copy?'}
              {confirm?.kind === 'push-device' && 'Upload this device to the cloud?'}
              {confirm?.kind === 'wipe-cloud' && 'Clear the cloud copy?'}
              {confirm?.kind === 'delete-account' && 'Delete your cloud account?'}
              {confirm?.kind === 'revoke-device' && `Sign out ${confirm.device.name}?`}
              {confirm?.kind === 'revoke-others' && 'Sign out every other device?'}
              {confirm?.kind === 'restore' && `Restore cloud version ${confirm.revision.version}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'pull-cloud' && 'Everything currently on this device for the synced sections will be replaced. The server keeps its restore points, so this is reversible from the other device.'}
              {confirm?.kind === 'push-device' && 'Every other signed-in device will receive this device\'s data on its next sync. Their unsynced edits still merge in.'}
              {confirm?.kind === 'wipe-cloud' && 'The server copy is deleted. This device keeps its data; other devices are not changed until they sync, and will not upload to an empty server automatically.'}
              {confirm?.kind === 'delete-account' && 'Your account, devices, cloud data and restore points are deleted permanently. This device keeps its local copy.'}
              {confirm?.kind === 'revoke-device' && 'That device will need your password to sign in again. Its local data is untouched.'}
              {confirm?.kind === 'revoke-others' && 'Only this device stays signed in. All other devices must sign in again.'}
              {confirm?.kind === 'restore' && 'The cloud copy will be replaced by this restore point and this device will reload. The current version stays available as its own restore point.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirm?.kind === 'delete-account' && (
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" className="h-10 rounded-xl" autoFocus />
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={busy !== null || (confirm?.kind === 'delete-account' && password.length < 1)}
              className={['pull-cloud', 'push-device', 'wipe-cloud', 'delete-account', 'revoke-device', 'revoke-others', 'restore'].includes(confirm?.kind ?? '') &&
                ['wipe-cloud', 'delete-account', 'revoke-device', 'revoke-others'].includes(confirm?.kind ?? '')
                ? 'bg-destructive text-destructive-foreground' : ''}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {confirm?.kind === 'restore' ? 'Restore' : confirm?.kind === 'pull-cloud' ? 'Download' : confirm?.kind === 'push-device' ? 'Upload' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

function Row({ label, value, mono, onEdit }: { label: string; value: string; mono?: boolean; onEdit?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-24 shrink-0">{label}</span>
      <span className={`flex-1 min-w-0 text-[11px] text-foreground truncate ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</span>
      {onEdit && (
        <button onClick={onEdit} className="w-7 h-7 rounded-lg bg-muted/20 flex items-center justify-center hover:bg-muted/40" aria-label={`Edit ${label}`}>
          <Pencil className="w-3 h-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
