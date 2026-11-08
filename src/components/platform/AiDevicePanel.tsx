import AiKeyManager from './AiKeyManager';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Check, ExternalLink, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Sparkles, Trash2, HardDrive, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import {
  PROVIDERS, getAiSettings, isAiConfigured, saveAiSettings, subscribeAiSettings, testAiConnection,
  type AiProvider, type AiSettings,
} from '@/platform/ai';
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot, type SnapshotMeta } from '@/platform/snapshots';
import { getStorageHealth, requestPersistence, type StorageHealth } from '@/platform/storage';

const ORDER: AiProvider[] = ['gemini', 'anthropic', 'openai'];

function fmtBytes(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function useAiSettings(): AiSettings {
  return useSyncExternalStore(subscribeAiSettings, getAiSettings, getAiSettings);
}

export default function AiDevicePanel({ initialTab = 'ai' }: { initialTab?: 'ai' | 'device' }) {
  const [tab, setTab] = useState<'ai' | 'device'>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  return (
    <div className="space-y-4">
      <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-muted/30 border border-border/20">
        {([['ai', 'AI tutor', Sparkles], ['device', 'This device', HardDrive]] as const).map(([id, label, Icon]) => (
          <button
            key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-bold transition-all active:scale-[0.98] ${
              tab === id ? 'bg-card text-foreground shadow-sm border border-border/30' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>
      {tab === 'ai' ? <AiTab /> : <DeviceTab />}
    </div>
  );
}

/* ───────────────────────────── AI tab ───────────────────────────── */

function AiTab() {
  return <AiKeyManager />;
}

function DeviceTab() {
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => setHealth(await getStorageHealth()), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const askPersist = async () => {
    setBusy(true);
    const ok = await requestPersistence();
    await refresh();
    setBusy(false);
    if (ok) toast.success('Protected — the browser will not clear your study data');
    else toast.info('The browser declined. Installing the app to your home screen usually fixes this.');
  };

  const pct = health && health.usageBytes != null && health.quotaBytes ? Math.min(100, (health.usageBytes / health.quotaBytes) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/20 bg-card/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-foreground">Storage on this device</span>
          <span className="text-[11px] font-mono text-muted-foreground">{fmtBytes(health?.usageBytes ?? null)} / {fmtBytes(health?.quotaBytes ?? null)}</span>
        </div>
        <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(pct, health ? 1.5 : 0)}%` }} />
        </div>

        <ul className="space-y-2 text-[12px]">
          <Row ok={!!health?.persistent} label="Protected from automatic clean-up" detail={health?.persistent ? 'Persistent storage granted' : 'Not yet granted'} />
          <Row ok={!!health?.mirrorHealthy} label="Safety copy (IndexedDB)" detail={health?.mirrorHealthy ? 'Every change is mirrored' : (health?.mirrorError ?? 'Unavailable')} />
          <Row ok label="Offline mode" detail={'serviceWorker' in navigator ? 'Works without internet after first load' : 'Not supported by this browser'} />
        </ul>

        {!health?.persistent && (
          <Button onClick={askPersist} disabled={busy} variant="outline" className="w-full h-10 rounded-xl font-bold gap-1.5">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Protect my data
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-border/20 bg-card/25 p-4 text-[12px] leading-relaxed text-foreground/80 space-y-2">
        <p><b>Your data never leaves this device.</b> There is no account and no server — study progress, notes and attachments live in your browser’s storage.</p>
        <p>Because of that, <b>export a backup regularly</b> (Settings → Backup &amp; Restore), and always before clearing browser data or changing phones. Restoring that file on any device brings everything back, including attachments.</p>
      </div>

      <Snapshots />

      <p className="text-[10px] text-center text-muted-foreground/60 font-mono">
        RJ Tracker Pro v{__APP_VERSION__} · build {__BUILD_DATE__}
      </p>
    </div>
  );
}

function Row({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${ok ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}>
        {ok ? <Check className="w-3 h-3" /> : <span className="text-[10px] font-black leading-none">!</span>}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-foreground leading-tight">{label}</span>
        <span className="block text-[11px] text-muted-foreground leading-snug">{detail}</span>
      </span>
    </li>
  );
}

function Snapshots() {
  const [list, setList] = useState<SnapshotMeta[] | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { try { setList(await listSnapshots()); } catch { setList([]); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const snapNow = async () => {
    setBusy(true);
    try { await createSnapshot(true); await refresh(); toast.success('Snapshot saved'); } finally { setBusy(false); }
  };
  const restore = async (s: SnapshotMeta) => {
    if (!window.confirm(`Restore the snapshot from ${new Date(s.createdAt).toLocaleString()}?\n\nYour current data is snapshotted first, so this can be undone.`)) return;
    if (await restoreSnapshot(s.id)) { toast.success('Restored — reloading…'); setTimeout(() => window.location.reload(), 700); }
  };

  return (
    <div className="rounded-2xl border border-border/20 bg-card/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-foreground">Safety snapshots</p>
          <p className="text-[11px] text-muted-foreground leading-snug">Saved automatically every day (last 7 kept).</p>
        </div>
        <Button size="sm" variant="outline" onClick={snapNow} disabled={busy} className="rounded-xl font-bold shrink-0">Snapshot now</Button>
      </div>
      {list && list.length === 0 && <p className="text-[11px] text-muted-foreground">No snapshots yet — the first one is taken after you add a subject.</p>}
      <ul className="space-y-1.5">
        {(list ?? []).map(s => (
          <li key={s.id} className="flex items-center gap-2 rounded-xl border border-border/15 bg-card/30 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-foreground">{new Date(s.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
              <p className="text-[10px] text-muted-foreground">{s.subjects} subjects · {s.topics} topics · {fmtBytes(s.bytes)}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => restore(s)} className="h-8 rounded-lg text-xs font-bold">Restore</Button>
            <button aria-label="Delete snapshot" onClick={async () => { await deleteSnapshot(s.id); await refresh(); }} className="w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
