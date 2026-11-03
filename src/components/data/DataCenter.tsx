import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, CloudDownload, Download, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Switch } from '@project/components/ui/switch';
import { toast } from 'sonner';
import type { AppState, HistoryEntry, Subject, TrashItem, User, UserSettings } from '../../types';
import { buildFullBackup } from '../../lib/backupBuilder';
import { verifyBackupDocument } from '../../platform/backupFormat';
import { CATALOG_MAP, DATA_CATALOG, GROUP_LABELS, readRaw, type CatalogGroup } from '../../platform/dataCatalog';
import { recordBackup, useAutoBackupSettings } from '../../platform/autoBackup';
import { buildCloudBackup, compareDeviceWithCloud, type SectionRow, type SectionState } from '../../platform/cloud/cloudExport';
import { syncNow, useSyncState } from '../../platform/cloud/syncEngine';
import { useCloudAuth } from '../../platform/cloud/authStore';
import { byteLength } from '../../lib/hash';
import { timeAgo } from './StatusStrip';

interface Props { appState: AppState; subjects?: Subject[]; settings?: UserSettings; history?: HistoryEntry[]; trash?: TrashItem[]; user?: User }

const fmt = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);
const stamp = () => { const d = new Date(); return `${d.toISOString().slice(0, 10)}-${d.toTimeString().slice(0, 5).replace(':', '')}`; };

function download(name: string, doc: unknown): number {
  const text = JSON.stringify(doc, null, 1);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return byteLength(text);
}

const STATE_UI: Record<SectionState, { label: string; cls: string }> = {
  synced: { label: 'In sync', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  'device-ahead': { label: 'Uploading next', cls: 'bg-primary/15 text-primary' },
  'cloud-ahead': { label: 'Cloud is newer', cls: 'bg-primary/15 text-primary' },
  diverged: { label: 'Will merge', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  'device-only': { label: 'Only on device', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  'cloud-only': { label: 'Only in cloud', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  empty: { label: 'Empty', cls: 'bg-muted/40 text-muted-foreground' },
};

export default function DataCenter(props: Props) {
  const cloud = useCloudAuth();
  const sync = useSyncState();
  const auto = useAutoBackupSettings();
  const signedIn = cloud.status === 'signed-in';

  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [busy, setBusy] = useState<null | 'device' | 'cloud' | 'test' | 'compare'>(null);
  const [testResult, setTestResult] = useState<null | { ok: boolean; text: string }>(null);
  const [compare, setCompare] = useState<null | { rows: SectionRow[]; version: number; updatedAt: string }>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  const inventory = useMemo(() => {
    void tick;
    const groups = new Map<CatalogGroup, Array<{ key: string; label: string; scope: string; bytes: number; present: boolean }>>();
    for (const e of DATA_CATALOG) {
      const raw = readRaw(e.key);
      const list = groups.get(e.group) ?? [];
      list.push({ key: e.key, label: e.label, scope: e.scope, bytes: raw ? byteLength(raw) : 0, present: raw !== null });
      groups.set(e.group, list);
    }
    const all = [...groups.values()].flat();
    return { groups, count: all.filter(i => i.present).length, total: all.length, bytes: all.reduce((a, i) => a + i.bytes, 0) };
  }, [tick]);

  const lastBackup = auto.history.find(h => h.ok);

  const exportDevice = async () => {
    setBusy('device');
    try {
      const { data } = await buildFullBackup({ ...props, includeSecrets });
      const report = await verifyBackupDocument(data);
      if (report.level !== 'verified') throw new Error(`Self-check failed: ${report.problems[0]}`);
      const name = `RJ-TRACKER-FULL-AZ-Backup-${stamp()}.json`;
      const bytes = download(name, data);
      recordBackup({ at: new Date().toISOString(), name, bytes, ok: true, where: 'Downloads', reason: 'Manual download' });
      toast.success(`📦 Backup saved — ${report.checked} sections verified · ${fmt(bytes)}`, { duration: 7000 });
      setTick(t => t + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup failed');
    } finally { setBusy(null); }
  };

  const exportCloud = async () => {
    setBusy('cloud');
    try {
      const { data, snapshot } = await buildCloudBackup(cloud.user ? { name: cloud.user.name, email: cloud.user.email, avatar: cloud.user.avatar, coverGradient: cloud.user.coverGradient } : undefined);
      const report = await verifyBackupDocument(data);
      if (report.level !== 'verified') throw new Error(`Self-check failed: ${report.problems[0]}`);
      const name = `RJ-TRACKER-CLOUD-Copy-${stamp()}.json`;
      const bytes = download(name, data);
      toast.success(`☁️ Cloud copy saved — version ${snapshot.version} · ${report.checked} sections · ${fmt(bytes)}`, { duration: 7000 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download the cloud copy');
    } finally { setBusy(null); }
  };

  const selfTest = async () => {
    setBusy('test'); setTestResult(null);
    try {
      const { data } = await buildFullBackup({ ...props, includeSecrets });
      const integrity = await verifyBackupDocument(data);
      const diffs: string[] = [];
      for (const [k, v] of Object.entries<string>(data.raw)) if (readRaw(k) !== v) diffs.push(k);
      for (const e of DATA_CATALOG) {
        if (e.scope === 'secret' && !includeSecrets) continue;
        if (readRaw(e.key) !== null && !(e.key in data.raw)) diffs.push(e.key);
      }
      const ok = integrity.level === 'verified' && diffs.length === 0;
      setTestResult({
        ok,
        text: ok
          ? `All ${integrity.checked} stored items are in the backup exactly as saved on this device. Checksum ${String(data._manifest.checksum).slice(0, 12)}…`
          : `Problem found: ${[...integrity.problems, ...diffs.map(k => `${CATALOG_MAP[k]?.label ?? k} differs`)].slice(0, 3).join('; ')}`,
      });
    } catch (err) {
      setTestResult({ ok: false, text: err instanceof Error ? err.message : 'Self-test failed' });
    } finally { setBusy(null); }
  };

  const runCompare = async () => {
    setBusy('compare');
    try { setCompare(await compareDeviceWithCloud()); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Could not reach the cloud'); }
    finally { setBusy(null); }
  };

  const unsynced = compare ? compare.rows.filter(r => r.state !== 'synced' && r.state !== 'empty').length : 0;

  return (
    <div className="space-y-4">
      {/* headline numbers */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { k: 'Stored items', v: `${inventory.count}/${inventory.total}` },
          { k: 'Total size', v: fmt(inventory.bytes) },
          { k: 'Last backup', v: lastBackup ? timeAgo(lastBackup.at) : 'never' },
        ].map(s => (
          <div key={s.k} className="rounded-xl border border-border/20 bg-card/30 p-2.5 text-center">
            <p className="text-sm font-black font-mono text-foreground">{s.v}</p>
            <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground mt-0.5">{s.k}</p>
          </div>
        ))}
      </div>

      {/* downloads */}
      <section className="rounded-2xl border border-border/20 bg-card/30 p-3.5 space-y-3">
        <div>
          <h4 className="text-[13px] font-bold text-foreground">Download everything</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">One file with all your study data, progress, history, trash, reminders and every setting — plus attachments. Each item is checksummed so a restore is exact.</p>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border/15 bg-background/40 px-3 py-2">
          <span><span className="block text-xs font-semibold text-foreground">Include my AI key</span><span className="block text-[10px] text-muted-foreground">Stored in plain text in the file — keep it private. Off by default.</span></span>
          <Switch checked={includeSecrets} onCheckedChange={setIncludeSecrets} aria-label="Include AI key" />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={exportDevice} disabled={busy !== null} className="h-11">{busy === 'device' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} This device</Button>
          <Button onClick={exportCloud} disabled={busy !== null || !signedIn} variant="outline" className="h-11" title={signedIn ? '' : 'Sign in to download your cloud copy'}>
            {busy === 'cloud' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />} Cloud copy
          </Button>
        </div>
        {!signedIn && <p className="text-[10px] text-muted-foreground">Sign in to download the copy stored in your account.</p>}
      </section>

      {/* verification */}
      <section className="rounded-2xl border border-border/20 bg-card/30 p-3.5 space-y-3">
        <div>
          <h4 className="text-[13px] font-bold text-foreground">Verify it’s all there</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">Self-test builds a backup in memory and proves every item matches what’s on this device.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={selfTest} disabled={busy !== null} variant="outline" className="h-10">{busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Run backup self-test</Button>
          <Button onClick={runCompare} disabled={busy !== null || !signedIn} variant="outline" className="h-10">{busy === 'compare' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Compare with cloud</Button>
        </div>
        {testResult && (
          <p className={`text-[11px] rounded-lg border px-3 py-2 ${testResult.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-destructive/35 bg-destructive/10 text-destructive'}`}>
            {testResult.ok ? '✅ ' : '⚠️ '}{testResult.text}
          </p>
        )}
        {compare && (
          <div className="space-y-2">
            <p className={`text-[11px] font-semibold ${unsynced ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {unsynced ? `${unsynced} section${unsynced > 1 ? 's' : ''} not identical yet` : '✅ Every section is identical on this device and in the cloud'} · cloud version {compare.version}
            </p>
            <div className="rounded-xl border border-border/15 overflow-hidden divide-y divide-border/10">
              {compare.rows.map(r => (
                <div key={r.key} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                  <span className="flex-1 min-w-0 truncate text-foreground">{r.label}</span>
                  <span className="font-mono text-muted-foreground shrink-0">{fmt(Math.max(r.deviceBytes, r.cloudBytes))}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${STATE_UI[r.state].cls}`}>{STATE_UI[r.state].label}</span>
                </div>
              ))}
            </div>
            {unsynced > 0 && (
              <Button size="sm" variant="outline" disabled={sync.phase === 'syncing'} onClick={async () => { await syncNow('data-center'); await runCompare(); }}>
                <RefreshCw className="w-3.5 h-3.5" /> Sync now and re-check
              </Button>
            )}
          </div>
        )}
      </section>

      {/* A–Z inventory */}
      <section className="rounded-2xl border border-border/20 bg-card/30 p-3.5">
        <h4 className="text-[13px] font-bold text-foreground">A–Z inventory</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">Everything the app stores, where it lives, and what a backup includes.</p>
        <div className="space-y-2">
          {([...inventory.groups.entries()]).map(([group, items]) => {
            const open = openGroups.has(group);
            return (
              <div key={group} className="rounded-xl border border-border/15 bg-background/40 overflow-hidden">
                <button onClick={() => setOpenGroups(prev => { const n = new Set(prev); n.has(group) ? n.delete(group) : n.add(group); return n; })}
                  aria-expanded={open} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
                  <span className="text-base">{GROUP_LABELS[group].icon}</span>
                  <span className="flex-1 text-xs font-bold text-foreground">{GROUP_LABELS[group].title}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{items.filter(i => i.present).length}/{items.length}</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <div className="divide-y divide-border/10 border-t border-border/10">
                    {items.map(i => (
                      <div key={i.key} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                        <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${i.present ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/30'}`} />
                        <span className="flex-1 min-w-0 truncate text-foreground">{i.label}</span>
                        <span className="font-mono text-muted-foreground shrink-0">{i.present ? fmt(i.bytes) : '—'}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground shrink-0">
                          {i.scope === 'cloud' ? '☁️ synced' : i.scope === 'secret' ? '🔒 key' : '📱 device'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2.5">Temporary things — running timers, search filters and sign-in tokens — are intentionally not stored in backups.</p>
      </section>
    </div>
  );
}
