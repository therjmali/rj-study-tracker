import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudOff, HardDrive, Loader2, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { useCloudAuth } from '../../platform/cloud/authStore';
import { useSyncState } from '../../platform/cloud/syncEngine';
import { useAutoBackupSettings } from '../../platform/autoBackup';
import { getStorageHealth, type StorageHealth } from '../../platform/storage';
import { APP_VERSION } from '../../types';

type Tone = 'good' | 'warn' | 'bad' | 'info' | 'busy';

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'never';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

const TONES: Record<Tone, string> = {
  good: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400',
  warn: 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  bad: 'border-destructive/35 bg-destructive/10 text-destructive',
  info: 'border-border/30 bg-card/40 text-muted-foreground',
  busy: 'border-primary/30 bg-primary/8 text-primary',
};

interface Chip { id: string; tone: Tone; icon: React.ReactNode; title: string; detail: string; jump: string }

/** Live health of sync, backups and storage — each chip jumps to the setting that fixes or explains it. */
export default function StatusStrip({ onJump }: { onJump: (itemId: string) => void }) {
  const cloud = useCloudAuth();
  const sync = useSyncState();
  const auto = useAutoBackupSettings();
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [, tick] = useState(0);

  useEffect(() => { void getStorageHealth().then(setHealth).catch(() => undefined); }, []);
  useEffect(() => { const id = window.setInterval(() => tick(n => n + 1), 30_000); return () => window.clearInterval(id); }, []);

  const chips: Chip[] = [];

  // ── Cloud ──
  if (cloud.status !== 'signed-in') {
    chips.push({ id: 'cloud', tone: 'info', icon: <UserRound className="w-3.5 h-3.5" />, title: 'Guest mode', detail: 'Saved on this device · tap to sign in', jump: 'cloudSync' });
  } else if (sync.phase === 'syncing') {
    chips.push({ id: 'cloud', tone: 'busy', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, title: 'Syncing…', detail: 'Updating your devices', jump: 'cloudSync' });
  } else if (sync.phase === 'error') {
    chips.push({ id: 'cloud', tone: 'bad', icon: <AlertTriangle className="w-3.5 h-3.5" />, title: 'Sync problem', detail: sync.error?.slice(0, 40) || 'Tap for details', jump: 'cloudSync' });
  } else if (!sync.online) {
    chips.push({ id: 'cloud', tone: 'warn', icon: <CloudOff className="w-3.5 h-3.5" />, title: 'Offline', detail: sync.pendingKeys.length ? `${sync.pendingKeys.length} change${sync.pendingKeys.length > 1 ? 's' : ''} waiting` : 'Saved on this device', jump: 'cloudSync' });
  } else if (sync.phase === 'paused') {
    chips.push({ id: 'cloud', tone: 'warn', icon: <RefreshCw className="w-3.5 h-3.5" />, title: 'Auto-sync paused', detail: 'Tap to resume', jump: 'cloudSync' });
  } else if (sync.pendingKeys.length > 0) {
    chips.push({ id: 'cloud', tone: 'busy', icon: <RefreshCw className="w-3.5 h-3.5" />, title: `${sync.pendingKeys.length} change${sync.pendingKeys.length > 1 ? 's' : ''} to upload`, detail: 'Uploads automatically', jump: 'cloudSync' });
  } else {
    chips.push({ id: 'cloud', tone: 'good', icon: <CheckCircle2 className="w-3.5 h-3.5" />, title: 'Cloud synced', detail: timeAgo(sync.lastSyncAt), jump: 'cloudSync' });
  }

  // ── Backup ──
  const last = auto.history.find(h => h.ok);
  const ageDays = last ? (Date.now() - Date.parse(last.at)) / 86_400_000 : Infinity;
  chips.push(last
    ? { id: 'backup', tone: ageDays > 7 ? 'warn' : 'good', icon: <HardDrive className="w-3.5 h-3.5" />, title: ageDays > 7 ? 'Backup is old' : 'Backed up', detail: timeAgo(last.at), jump: 'dataCenter' }
    : { id: 'backup', tone: 'warn', icon: <HardDrive className="w-3.5 h-3.5" />, title: 'No backup yet', detail: 'Tap to download one', jump: 'dataCenter' });

  // ── Storage ──
  if (health) {
    const ok = health.mirrorHealthy;
    chips.push({
      id: 'storage', tone: !ok ? 'bad' : health.persistent ? 'good' : 'warn', icon: <ShieldCheck className="w-3.5 h-3.5" />,
      title: !ok ? 'Storage issue' : health.persistent ? 'Storage protected' : 'Storage not locked',
      detail: !ok ? 'Back up now' : health.persistent ? 'Safe from auto-cleanup' : 'Tap to protect it', jump: 'aiDevice',
    });
  }

  chips.push({ id: 'version', tone: 'info', icon: <CheckCircle2 className="w-3.5 h-3.5" />, title: `RJ Tracker ${APP_VERSION}`, detail: 'Latest on this device', jump: 'help' });

  return (
    <div className="-mx-4 px-4 mb-3 overflow-x-auto scrollbar-none" role="list" aria-label="System status">
      <div className="flex gap-2 w-max pb-1">
        {chips.map(c => (
          <button key={c.id} role="listitem" onClick={() => onJump(c.jump)}
            className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-left active:scale-[0.97] transition-transform ${TONES[c.tone]}`}>
            <span className="shrink-0">{c.icon}</span>
            <span className="min-w-0">
              <span className="block text-[11px] font-bold leading-tight whitespace-nowrap">{c.title}</span>
              <span className="block text-[10px] leading-tight opacity-80 whitespace-nowrap">{c.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
