import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, ClipboardPaste, ExternalLink, Eye, EyeOff, KeyRound, Loader2, RefreshCw, ShieldCheck, Trash2, WifiOff, Zap } from 'lucide-react';
import { toast } from 'sonner';
import {
  PROVIDER_ORDER, PROVIDERS, getAiSettings, getLastAiRun, removeProviderKey, setActiveProvider, setFallbackEnabled,
  setProviderKey, setProviderModel, subscribeAiRun, subscribeAiSettings, testProviderKey, configuredProviders,
  type AiProvider, type KeyStatus,
} from '@/platform/ai';
import { looksLikeKey, maskKey } from '@/platform/aiProviders.mjs';
import { useConnectivity } from '@/platform/connectivity';
import { formatAgo } from '@/platform/connectivityLogic.mjs';

const useSettings = () => useSyncExternalStore(subscribeAiSettings, getAiSettings, getAiSettings);
const useRun = () => useSyncExternalStore(subscribeAiRun, getLastAiRun, getLastAiRun);

type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger';
const TONE: Record<Tone, string> = {
  neutral: 'bg-muted/50 text-muted-foreground border-border/40',
  info: 'bg-primary/10 text-primary border-primary/25',
  ok: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
  warn: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/35',
  danger: 'bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/30',
};

function chip(have: boolean, st?: KeyStatus): { tone: Tone; text: string } {
  if (!have) return { tone: 'neutral', text: 'No key' };
  if (!st) return { tone: 'info', text: 'Saved · not tested' };
  if (st.ok) return { tone: 'ok', text: `Verified${st.ms ? ` · ${st.ms} ms` : ''}` };
  if (st.code === 'BAD_API_KEY') return { tone: 'danger', text: 'Key rejected' };
  if (st.code === 'RATE_LIMITED') return { tone: 'warn', text: 'Rate-limited' };
  return { tone: 'warn', text: 'Check failed' };
}

/** Manage the five AI partners: keys, status, models and automatic switching. Everything stays on this device. */
export default function AiKeyManager() {
  const s = useSettings();
  const run = useRun();
  const conn = useConnectivity();
  const [open, setOpen] = useState<AiProvider | null>(() => {
    const st = getAiSettings();
    return configuredProviders(st).length ? null : st.provider;
  });
  const ready = configuredProviders(s);
  const activeMeta = PROVIDERS[s.provider];
  const activeModel = (s.models[s.provider]?.main || activeMeta.defaultMain);

  return (
    <div className="space-y-3">
      {/* Status banner */}
      <div className="relative overflow-hidden rounded-[26px] border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-secondary/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">AI partners</p>
            <p className="mt-0.5 text-lg font-black leading-tight text-foreground">{ready.length} of {PROVIDER_ORDER.length} ready</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {ready.length ? <>Active · <b className="text-foreground">{activeMeta.short}</b> · {activeModel}</> : 'Add one free key to unlock the AI Tutor.'}
            </p>
          </div>
          <span className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${conn.status === 'online' ? TONE.ok : TONE.warn}`}>
            {conn.status === 'online' ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> : <WifiOff className="h-3 w-3" />}
            {conn.status === 'online' ? 'Online' : conn.status === 'offline' ? 'Offline' : 'Unreachable'}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-1.5" aria-hidden>
          {PROVIDER_ORDER.map(p => {
            const have = !!s.keys[p]?.trim(); const st = s.status?.[p];
            return <span key={p} title={PROVIDERS[p].label} className="h-1.5 flex-1 rounded-full" style={{ background: !have ? 'hsl(var(--muted))' : st && !st.ok ? '#f59e0b' : PROVIDERS[p].color }} />;
          })}
        </div>
        {run && (
          <p className="mt-2.5 text-[10px] text-muted-foreground">
            Last answer · <b className="text-foreground">{PROVIDERS[run.provider].short}</b> · {run.model} · {formatAgo(run.at, Date.now())}
            {run.fellBackFrom && <span className="text-amber-600 dark:text-amber-300"> · switched from {PROVIDERS[run.fellBackFrom].short}</span>}
          </p>
        )}
        {conn.status !== 'online' && <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-300">AI needs the internet — everything else keeps working offline.</p>}
      </div>

      {/* Auto-switch */}
      <button
        type="button" role="switch" aria-checked={s.fallback !== false}
        onClick={() => setFallbackEnabled(s.fallback === false)}
        className="flex w-full items-center gap-3 rounded-[22px] border border-border/30 bg-card p-3.5 text-left transition-all active:scale-[0.99]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-secondary/15 text-secondary"><Zap className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-foreground">Auto-switch provider</span>
          <span className="block text-[11px] leading-snug text-muted-foreground">If the active one is rate-limited, rejects its key or is down, the next ready partner answers instead.</span>
        </span>
        <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${s.fallback !== false ? 'bg-primary' : 'bg-muted'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${s.fallback !== false ? 'left-[22px]' : 'left-0.5'}`} />
        </span>
      </button>

      {/* Provider cards */}
      {PROVIDER_ORDER.map(p => (
        <ProviderCard key={p} id={p} expanded={open === p} onToggle={() => setOpen(o => (o === p ? null : p))} offline={conn.status === 'offline'} />
      ))}

      <div className="flex items-start gap-2 rounded-2xl border border-border/20 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <span>Keys stay on this phone. They are never synced to the cloud, never included in a backup unless you opt in, and are only sent to the provider you chose.</span>
      </div>
    </div>
  );
}

function ProviderCard({ id, expanded, onToggle, offline }: { id: AiProvider; expanded: boolean; onToggle: () => void; offline: boolean }) {
  const s = useSettings();
  const meta = PROVIDERS[id];
  const saved = (s.keys[id] ?? '').trim();
  const have = !!saved;
  const st = s.status?.[id];
  const c = chip(have, st);
  const isActive = s.provider === id && have;

  const [draft, setDraft] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const delTimer = useRef<number | null>(null);
  useEffect(() => () => { if (delTimer.current) window.clearTimeout(delTimer.current); }, []);
  useEffect(() => { setDraft(''); setReveal(false); }, [saved]);

  const key = (draft || saved).trim();
  const dirty = !!draft.trim() && draft.trim() !== saved;
  const listId = `models-${id}`;
  const models = st?.models ?? [];

  const test = async (value?: string) => {
    if (offline) { toast.error('You are offline — connect to the internet to test the key.'); return; }
    setBusy(true);
    try {
      const r = await testProviderKey(id, value ?? key);
      if (r.ok) toast.success(`${meta.short} key works · ${r.ms} ms · ${r.models?.length ?? 0} models`);
      else toast.error(r.code === 'BAD_API_KEY' ? `${meta.short} rejected this key.` : r.error || `${meta.short} check failed.`);
    } catch (e) { toast.error((e as Error).message || 'Could not test the key.'); }
    finally { setBusy(false); }
  };

  const save = async () => {
    const v = draft.trim();
    const f = looksLikeKey(id, v);
    if (!f.ok) { toast.error(f.hint); return; }
    if (f.hint) toast.warning(f.hint);
    setProviderKey(id, v);
    if (!offline) await test(v); else toast.success('Key saved. Test it when you are online.');
  };

  const paste = async () => {
    try { const t = await navigator.clipboard.readText(); if (t.trim()) setDraft(t.trim()); else toast.info('The clipboard is empty.'); }
    catch { toast.error('Paste is blocked here — long-press the box and choose Paste.'); }
  };

  const remove = () => {
    if (!confirmDel) { setConfirmDel(true); delTimer.current = window.setTimeout(() => setConfirmDel(false), 3000); return; }
    removeProviderKey(id); setConfirmDel(false); toast.success(`${meta.short} key removed.`);
  };

  return (
    <div className={`overflow-hidden rounded-[26px] border bg-card transition-colors ${isActive ? 'border-primary/40 shadow-[0_8px_24px_-16px_hsl(var(--primary)/0.6)]' : 'border-border/30'}`}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-3 p-3.5 text-left active:bg-muted/30">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black" style={{ background: `${meta.color}22`, color: meta.color }}>{meta.short.slice(0, 1)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-extrabold text-foreground">{meta.label}</span>
            {isActive && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-primary-foreground">Active</span>}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">{have ? maskKey(saved) : meta.note}</span>
        </span>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${TONE[c.tone]}`}>{c.text}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border/20 p-3.5 pt-3">
          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-muted-foreground" htmlFor={`key-${id}`}>
              <span className="flex items-center gap-1"><KeyRound className="h-3 w-3" /> API key</span>
              <a href={meta.keyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 normal-case tracking-normal text-primary">
                Get a key <ExternalLink className="h-3 w-3" />
              </a>
            </label>
            <div className="flex items-center gap-1.5">
              <div className="relative min-w-0 flex-1">
                <input
                  id={`key-${id}`} type={reveal ? 'text' : 'password'} value={draft} onChange={e => setDraft(e.target.value)}
                  placeholder={have ? `Saved · ${maskKey(saved)} — paste to replace` : meta.keyHint}
                  autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  className="h-11 w-full rounded-2xl border border-border/40 bg-background px-3 pr-10 font-mono text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button type="button" onClick={() => setReveal(r => !r)} aria-label={reveal ? 'Hide key' : 'Show key'} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted-foreground">
                  {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button type="button" onClick={paste} aria-label="Paste from clipboard" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/40 bg-background text-muted-foreground active:scale-95">
                <ClipboardPaste className="h-4 w-4" />
              </button>
            </div>
            {draft.trim() && !looksLikeKey(id, draft).ok
              ? <p className="text-[10px] text-red-500">{looksLikeKey(id, draft).hint}</p>
              : draft.trim() && looksLikeKey(id, draft).hint ? <p className="text-[10px] text-amber-600 dark:text-amber-300">{looksLikeKey(id, draft).hint}</p> : null}
            {st && !st.ok && st.error && !dirty && <p className="text-[10px] text-red-500">{st.error}</p>}
            {st?.ok && <p className="text-[10px] text-muted-foreground">Last checked {formatAgo(st.at, Date.now())} · {st.models?.length ?? 0} models available</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <ModelField label="Main model" listId={listId} value={s.models[id]?.main ?? ''} placeholder={meta.defaultMain} onCommit={v => setProviderModel(id, 'main', v)} />
            <ModelField label="Fast model" listId={listId} value={s.models[id]?.fast ?? ''} placeholder={meta.defaultFast} onCommit={v => setProviderModel(id, 'fast', v)} />
            <datalist id={listId}>{models.map(m => <option key={m} value={m} />)}</datalist>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {dirty ? (
              <button type="button" onClick={save} disabled={busy} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 text-[12px] font-black text-primary-foreground active:scale-[0.98] disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save &amp; test
              </button>
            ) : (
              <button type="button" onClick={() => void test()} disabled={busy || !have} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border/40 bg-background px-4 text-[12px] font-black text-foreground active:scale-[0.98] disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Test key
              </button>
            )}
            {have && !isActive && (
              <button type="button" onClick={() => { setActiveProvider(id); toast.success(`${meta.short} is now your main AI.`); }} className="h-10 rounded-2xl bg-primary/10 px-4 text-[12px] font-black text-primary active:scale-[0.98]">Use this</button>
            )}
            {have && (
              <button type="button" onClick={remove} className={`flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-[12px] font-black active:scale-[0.98] ${confirmDel ? 'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-300' : 'border-border/40 text-muted-foreground'}`}>
                <Trash2 className="h-4 w-4" /> {confirmDel ? 'Tap to confirm' : 'Remove'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelField({ label, value, placeholder, listId, onCommit }: { label: string; value: string; placeholder: string; listId: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        list={listId} value={v} onChange={e => setV(e.target.value)} onBlur={() => v.trim() !== value && onCommit(v)}
        placeholder={placeholder} autoCapitalize="off" autoCorrect="off" spellCheck={false}
        className="h-10 w-full rounded-xl border border-border/40 bg-background px-2.5 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  );
}
