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
  const settings = useAiSettings();
  const provider = settings.provider;
  const meta = PROVIDERS[provider];
  const savedKey = settings.keys[provider] ?? '';

  const [draftKey, setDraftKey] = useState(savedKey);
  const [reveal, setReveal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { setDraftKey(savedKey); setResult(null); }, [provider, savedKey]);

  const models = settings.models[provider] ?? {};

  const update = useCallback((patch: Partial<AiSettings>) => saveAiSettings({ ...getAiSettings(), ...patch }), []);

  const save = () => {
    const key = draftKey.trim();
    update({ keys: { ...settings.keys, [provider]: key || undefined } });
    toast.success(key ? 'API key saved on this device' : 'API key removed');
  };

  const setModel = (tier: 'main' | 'fast', value: string) => {
    update({ models: { ...settings.models, [provider]: { ...models, [tier]: value.trim() || undefined } } });
  };

  const test = async () => {
    // Save first so the test uses what is on screen.
    if (draftKey.trim() !== savedKey) save();
    setTesting(true);
    setResult(null);
    try {
      const reply = await testAiConnection();
      setResult({ ok: true, text: `Connected — model replied “${reply}”` });
    } catch (e) {
      setResult({ ok: false, text: (e as Error)?.message || 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const configured = isAiConfigured(settings);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-[12px] leading-relaxed text-foreground/80">
          The AI tutor, MCQ, flashcard and study-plan generators run <b>directly from your phone to the AI provider</b> using
          your own key. The key is stored only on this device and is never included in backups.
        </p>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 mb-2 px-1">Provider</p>
        <div className="grid grid-cols-3 gap-2">
          {ORDER.map(p => {
            const active = p === provider;
            const has = !!settings.keys[p]?.trim();
            return (
              <button
                key={p} onClick={() => update({ provider: p })} aria-pressed={active}
                className={`relative rounded-2xl border px-2 py-2.5 text-center transition-all active:scale-[0.97] ${
                  active ? 'border-primary/50 bg-primary/10 shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]' : 'border-border/25 bg-card/30 hover:bg-card/60'
                }`}
              >
                <span className="block text-[12px] font-bold text-foreground leading-tight">{PROVIDERS[p].label.replace('Google ', '').replace('Anthropic ', '')}</span>
                {has && <Check className="absolute top-1.5 right-1.5 w-3 h-3 text-primary" />}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 px-1">{meta.note}</p>
      </div>

      <div>
        <label htmlFor="ai-key" className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 mb-2 px-1 flex items-center gap-1.5">
          <KeyRound className="w-3 h-3" /> {meta.label} API key
        </label>
        <div className="relative">
          <Input
            id="ai-key" type={reveal ? 'text' : 'password'} value={draftKey} onChange={e => setDraftKey(e.target.value)}
            placeholder={meta.keyHint} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            className="h-11 pr-11 rounded-xl bg-card/40 border-border/30 font-mono text-[13px]"
          />
          <button
            type="button" onClick={() => setReveal(v => !v)} aria-label={reveal ? 'Hide key' : 'Show key'}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <a
          href={meta.keyUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary mt-2 px-1 hover:underline"
        >
          Get a {meta.label} key <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={draftKey.trim() === savedKey} className="flex-1 h-10 rounded-xl font-bold">Save key</Button>
        <Button onClick={test} variant="outline" disabled={testing || !draftKey.trim()} className="flex-1 h-10 rounded-xl font-bold gap-1.5">
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Test
        </Button>
        {savedKey && (
          <Button
            variant="outline" size="icon" aria-label="Remove key" className="h-10 w-10 rounded-xl text-destructive border-destructive/25 hover:bg-destructive/10"
            onClick={() => { update({ keys: { ...settings.keys, [provider]: undefined } }); setDraftKey(''); toast.success('API key removed'); }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {result && (
        <div className={`rounded-xl border px-3 py-2.5 text-[12px] leading-snug ${result.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
          {result.text}
        </div>
      )}

      <details className="group rounded-2xl border border-border/20 bg-card/25">
        <summary className="cursor-pointer list-none px-3.5 py-3 text-[12px] font-bold text-foreground flex items-center justify-between">
          Advanced — model names
          <span className="text-muted-foreground text-[10px] font-semibold group-open:hidden">edit</span>
        </summary>
        <div className="px-3.5 pb-3.5 space-y-3">
          {(['main', 'fast'] as const).map(tier => (
            <div key={tier}>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {tier === 'main' ? 'Chat & MCQ model' : 'Fast model (flashcards, plans, tips)'}
              </label>
              <Input
                defaultValue={models[tier] ?? ''} key={`${provider}-${tier}`}
                onBlur={e => setModel(tier, e.target.value)}
                placeholder={tier === 'main' ? meta.defaultMain : meta.defaultFast}
                autoComplete="off" autoCapitalize="off" spellCheck={false}
                className="h-10 mt-1 rounded-xl bg-card/40 border-border/30 font-mono text-[12px]"
              />
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground leading-snug">
            Leave blank to use the defaults shown. If your account uses a different model name, enter it here.
          </p>
        </div>
      </details>

      <p className={`text-[11px] font-semibold px-1 ${configured ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
        {configured ? `✓ AI tutor is ready (${meta.label}).` : 'AI features stay locked until a key is added. Everything else works without one.'}
      </p>
    </div>
  );
}

/* ───────────────────────────── Device tab ───────────────────────────── */

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
