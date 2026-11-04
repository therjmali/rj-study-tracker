import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, HardDrive, Loader2, RefreshCw, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
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

const TONES: Record<Tone, { ring: string; chip: string; dot: string; label: string }> = {
  good: { ring: 'border-emerald-500/25', chip: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', label: 'Good' },
  warn: { ring: 'border-amber-500/30', chip: 'bg-amber-500/12 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', label: 'Attention' },
  bad: { ring: 'border-destructive/35', chip: 'bg-destructive/12 text-destructive', dot: 'bg-destructive', label: 'Problem' },
  info: { ring: 'border-border/25', chip: 'bg-muted/40 text-muted-foreground', dot: 'bg-muted-foreground/60', label: 'Info' },
  busy: { ring: 'border-primary/30', chip: 'bg-primary/12 text-primary', dot: 'bg-primary', label: 'Working' },
};

interface Tile { id: string; tone: Tone; icon: React.ReactNode; label: string; title: string; detail: string; jump: string; pulse?: boolean }

/**
 * Live health of sync, backups and storage as one premium card: an overall verdict on top and four
 * equal tiles below (no sideways scrolling). Each tile jumps to the setting that explains or fixes it.
 */
export default function StatusStrip({ onJump }: { onJump: (itemId: string) => void }) {
  const cloud = useCloudAuth();
  const sync = useSyncState();
  const auto = useAutoBackupSettings();
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [, tick] = useState(0);

  useEffect(() => { void getStorageHealth().then(setHealth).catch(() => undefined); }, []);
  useEffect(() => { const id = window.setInterval(() => tick(n => n + 1), 30_000); return () => window.clearInterval(id); }, []);

  const tiles: Tile[] = [];
  const ic = 'w-4 h-4';

  // ── Cloud ──
  const C = 'Cloud';
  if (cloud.status !== 'signed-in') {
    tiles.push({ id: 'cloud', tone: 'info', icon: <UserRound className={ic} />, label: C, title: 'Guest mode', detail: 'Saved on this device', jump: 'cloudSync' });
  } else if (sync.phase === 'syncing') {
    tiles.push({ id: 'cloud', tone: 'busy', icon: <Loader2 className={`${ic} animate-spin`} />, label: C, title: 'Syncing…', detail: 'Updating your devices', jump: 'cloudSync', pulse: true });
  } else if (sync.phase === 'error') {
    tiles.push({ id: 'cloud', tone: 'bad', icon: <AlertTriangle className={ic} />, label: C, title: 'Sync problem', detail: sync.error?.slice(0, 40) || 'Tap for details', jump: 'cloudSync' });
  } else if (!sync.online) {
    tiles.push({ id: 'cloud', tone: 'warn', icon: <CloudOff className={ic} />, label: C, title: 'Offline', detail: sync.pendingKeys.length ? `${sync.pendingKeys.length} change${sync.pendingKeys.length > 1 ? 's' : ''} waiting` : 'Saved on this device', jump: 'cloudSync' });
  } else if (sync.phase === 'paused') {
    tiles.push({ id: 'cloud', tone: 'warn', icon: <RefreshCw className={ic} />, label: C, title: 'Auto-sync paused', detail: 'Tap to resume', jump: 'cloudSync' });
  } else if (sync.pendingKeys.length > 0) {
    tiles.push({ id: 'cloud', tone: 'busy', icon: <RefreshCw className={ic} />, label: C, title: `${sync.pendingKeys.length} to upload`, detail: 'Uploads automatically', jump: 'cloudSync', pulse: true });
  } else {
    tiles.push({ id: 'cloud', tone: 'good', icon: <Cloud className={ic} />, label: C, title: 'Synced', detail: timeAgo(sync.lastSyncAt), jump: 'cloudSync' });
  }

  // ── Backup ──
  const last = auto.history.find(h => h.ok);
  const ageDays = last ? (Date.now() - Date.parse(last.at)) / 86_400_000 : Infinity;
  tiles.push(last
    ? { id: 'backup', tone: ageDays > 7 ? 'warn' : 'good', icon: <HardDrive className={ic} />, label: 'Backup', title: ageDays > 7 ? 'Backup is old' : 'Backed up', detail: timeAgo(last.at), jump: 'dataHub' }
    : { id: 'backup', tone: 'warn', icon: <HardDrive className={ic} />, label: 'Backup', title: 'No backup yet', detail: 'Tap to download one', jump: 'dataHub' });

  // ── Storage ──
  if (health) {
    const ok = health.mirrorHealthy;
    tiles.push({
      id: 'storage', tone: !ok ? 'bad' : health.persistent ? 'good' : 'warn', icon: <ShieldCheck className={ic} />, label: 'Storage',
      title: !ok ? 'Storage issue' : health.persistent ? 'Protected' : 'Not locked',
      detail: !ok ? 'Back up now' : health.persistent ? 'Safe from auto-cleanup' : 'Tap to protect it', jump: 'aiDevice',
    });
  } else {
    tiles.push({ id: 'storage', tone: 'info', icon: <Loader2 className={`${ic} animate-spin`} />, label: 'Storage', title: 'Checking…', detail: 'Reading device storage', jump: 'aiDevice' });
  }

  // ── App ──
  tiles.push({ id: 'version', tone: 'info', icon: <Sparkles className={ic} />, label: 'App', title: APP_VERSION, detail: 'Latest version', jump: 'help' });

  const rank = (t: Tone) => (t === 'bad' ? 3 : t === 'warn' ? 2 : t === 'busy' ? 1 : 0);
  const worst = tiles.reduce<Tone>((w, t) => (rank(t.tone) > rank(w) ? t.tone : w), 'good');
  const verdict = worst === 'bad'
    ? { tone: 'bad' as Tone, icon: <AlertTriangle className="w-4 h-4" />, title: 'Needs attention', sub: 'Something needs a quick look — tap the highlighted tile.' }
    : worst === 'warn'
      ? { tone: 'warn' as Tone, icon: <AlertTriangle className="w-4 h-4" />, title: 'Almost there', sub: 'A small step will make everything safe.' }
      : worst === 'busy'
        ? { tone: 'busy' as Tone, icon: <Loader2 className="w-4 h-4 animate-spin" />, title: 'Working…', sub: 'Your data is being updated.' }
        : { tone: 'good' as Tone, icon: <CheckCircle2 className="w-4 h-4" />, title: 'All systems healthy', sub: 'Your data is saved, backed up and protected.' };
  const V = TONES[verdict.tone];

  return (
    <section aria-label="System status" className={`mb-3 rounded-3xl border ${V.ring} bg-card/30 overflow-hidden`}>
      <div className={`h-[3px] w-full ${V.dot} opacity-70`} aria-hidden />
      <div className="flex items-center gap-3 px-4 pt-3 pb-2.5">
        <span className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${V.chip}`}>{verdict.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black text-foreground leading-tight">{verdict.title}</p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{verdict.sub}</p>
        </div>
        <span className="relative flex w-2.5 h-2.5 shrink-0" aria-hidden>
          {(verdict.tone === 'busy' || verdict.tone === 'good') && <span className={`absolute inline-flex h-full w-full rounded-full ${V.dot} opacity-50 animate-ping`} />}
          <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${V.dot}`} />
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 pb-3" role="list">
        {tiles.map(t => {
          const T = TONES[t.tone];
          return (
            <button key={t.id} role="listitem" onClick={() => onJump(t.jump)}
              className={`group relative min-w-0 text-left rounded-2xl border ${T.ring} bg-background/50 px-3 py-2.5 active:scale-[0.97] hover:bg-background/80 transition-[transform,background-color]`}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">{t.label}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${T.dot} ${t.pulse ? 'animate-pulse' : ''}`} aria-hidden />
              </span>
              <span className="flex items-center gap-2 mt-1.5">
                <span className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${T.chip}`}>{t.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-bold text-foreground leading-tight truncate">{t.title}</span>
                  <span className="block text-[10px] text-muted-foreground leading-tight truncate mt-0.5">{t.detail}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
