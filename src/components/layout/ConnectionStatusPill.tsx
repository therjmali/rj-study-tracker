import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Cloud, CloudOff, HardDrive, Loader2, PauseCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useConnectivity } from '@/platform/connectivity';
import { useCloudAuth } from '@/platform/cloud/authStore';
import { useSyncState } from '@/platform/cloud/syncEngine';
import { RECONNECTED_FLASH_MS, derivePill, type PillKind, type PillTone } from '@/platform/connectivityLogic.mjs';

const TONE: Record<PillTone, string> = {
  neutral: 'border-border/60 bg-card/40 text-muted-foreground',
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  info: 'border-primary/25 bg-primary/10 text-primary',
  warn: 'border-amber-500/35 bg-amber-500/15 text-amber-600 dark:text-amber-300',
  danger: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300',
};

const DOT: Record<PillTone, string> = {
  neutral: 'bg-muted-foreground/60', ok: 'bg-emerald-500', info: 'bg-primary', warn: 'bg-amber-500', danger: 'bg-red-500',
};

function KindIcon({ kind, busy }: { kind: PillKind; busy: boolean }) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  if (busy && kind === 'syncing') return <Loader2 className={`${cls} motion-safe:animate-spin`} />;
  switch (kind) {
    case 'offline': return <WifiOff className={cls} />;
    case 'reconnected': return <Wifi className={cls} />;
    case 'degraded': return <RefreshCw className={`${cls} motion-safe:animate-spin`} style={{ animationDuration: '2.4s' }} />;
    case 'error': return <AlertTriangle className={cls} />;
    case 'paused': return <PauseCircle className={cls} />;
    case 'synced': return <Check className={cls} />;
    case 'local': return <HardDrive className={cls} />;
    case 'pending': return <CloudOff className={cls} />;
    default: return <Cloud className={cls} />;
  }
}

/**
 * One premium status pill for the header: connection + cloud state at a glance.
 * Offline → "Offline · saved on this device", unreachable cloud → "Cloud unreachable · retrying",
 * recovering → "Back online", then "Syncing" → "Synced · 2 min ago". Tap opens Cloud sync.
 */
export default function ConnectionStatusPill({ onClick }: { onClick?: () => void }) {
  const conn = useConnectivity();
  const auth = useCloudAuth();
  const sync = useSyncState();
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState('');
  const lastKind = useRef<PillKind | null>(null);

  // Keep "2 min ago" fresh (only while visible) and end the "Back online" flash on time.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, []);
  useEffect(() => {
    if (!conn.reconnectedAt) return;
    const left = conn.reconnectedAt + RECONNECTED_FLASH_MS - Date.now();
    setNow(Date.now());
    if (left <= 0) return;
    const id = window.setTimeout(() => setNow(Date.now()), left + 50);
    return () => window.clearTimeout(id);
  }, [conn.reconnectedAt]);

  const signedIn = auth.status === 'signed-in';
  const lastSyncAtMs = sync.lastSyncAt ? Date.parse(sync.lastSyncAt) : null;
  const pill = derivePill({
    signedIn,
    status: conn.status,
    phase: sync.phase,
    pendingCount: sync.pendingKeys.length,
    lastSyncAtMs: Number.isFinite(lastSyncAtMs) ? lastSyncAtMs : null,
    nowMs: now,
    reconnectedAtMs: conn.reconnectedAt,
  });

  // Screen readers hear changes of state, not the ticking "min ago".
  useEffect(() => {
    if (lastKind.current !== null && lastKind.current !== pill.kind) setAnnouncement(`${pill.label}. ${pill.detail}`);
    lastKind.current = pill.kind;
  }, [pill.kind, pill.label, pill.detail]);

  const attention = pill.tone === 'warn' || pill.kind === 'reconnected';
  // Calm states are an icon-only circle on phones so the app name keeps its space; states that need
  // attention (offline, unreachable, error, syncing, back online) show a short label everywhere.
  const labelAlways = ['offline', 'degraded', 'error', 'reconnected', 'syncing'].includes(pill.kind);
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        data-status={pill.kind}
        className={`flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-full border ${labelAlways ? 'px-2.5' : 'px-0 sm:px-2.5'} shadow-[0_8px_18px_-12px_rgba(0,0,0,0.7)] transition-[background-color,border-color,color,transform] duration-300 active:scale-95 ${TONE[pill.tone]}`}
        title={`${pill.label} — ${pill.detail}`}
        aria-label={`${pill.label}. ${pill.detail}. Open cloud sync`}
      >
        <span className="relative flex h-3.5 w-3.5 items-center justify-center">
          {attention && <span className={`absolute inline-flex h-full w-full rounded-full opacity-40 motion-safe:animate-ping ${DOT[pill.tone]}`} />}
          <KindIcon kind={pill.kind} busy={pill.busy} />
        </span>
        <span className={`${labelAlways ? 'flex' : 'hidden sm:flex'} min-w-0 flex-col items-start leading-none`}>
          <span className={`${labelAlways ? 'max-w-[84px] sm:max-w-none' : ''} truncate text-[10px] font-black uppercase tracking-[0.14em]`}>{pill.label}</span>
          <span className="mt-0.5 hidden max-w-[170px] truncate text-[9px] font-medium normal-case tracking-normal opacity-75 sm:block">{pill.detail}</span>
        </span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
    </>
  );
}
