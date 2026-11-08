import { useEffect } from 'react';
import { AlertTriangle, ArrowUpCircle, CheckCircle2, Download, ExternalLink, Loader2, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import {
  applyWebUpdate, checkForUpdate, checkWebUpdate, installDownloadedUpdate, isNativeUpdater, openInstallPermission,
  startNativeUpdate, useUpdateState,
} from '@/platform/updater';
import { formatAgo } from '@/platform/connectivityLogic.mjs';
import { compareVersions, formatBytes as bytes } from '@/lib/updaterLogic.mjs';
import { useConnectivity } from '@/platform/connectivity';

/** "Check for updates → download → verify → install" — all inside the app. */
export default function UpdatePanel() {
  const u = useUpdateState();
  const conn = useConnectivity();
  const native = isNativeUpdater();
  const busy = u.phase === 'checking' || u.phase === 'downloading' || u.phase === 'verifying' || u.phase === 'installing';
  const pct = Math.round(u.progress * 100);

  useEffect(() => {
    if (u.phase === 'idle' && !u.release) void checkForUpdate({ silent: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const check = async () => {
    if (native) await checkForUpdate();
    else {
      await checkForUpdate();
      await checkWebUpdate();
    }
  };

  const rel = u.release;
  const newer = !!rel && compareVersions(rel.version, u.current) > 0;
  const headline =
    u.phase === 'checking' ? 'Checking for updates…'
    : u.phase === 'uptodate' ? "You're up to date"
    : u.phase === 'downloading' ? 'Downloading update…'
    : u.phase === 'verifying' ? 'Verifying the download…'
    : u.phase === 'ready' || u.phase === 'installing' ? 'Ready to install'
    : u.phase === 'needs-permission' ? 'One permission needed'
    : u.phase === 'available' ? `Version ${rel?.version} is available`
    : u.phase === 'error' ? 'Update problem'
    : 'App updates';

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-[26px] border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-secondary/10 p-4">
        <div className="flex items-start gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${u.phase === 'uptodate' ? 'bg-emerald-500/15 text-emerald-500' : u.phase === 'error' ? 'bg-red-500/15 text-red-500' : 'bg-primary/15 text-primary'}`}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : u.phase === 'uptodate' ? <CheckCircle2 className="h-5 w-5" /> : u.phase === 'error' ? <AlertTriangle className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-black leading-tight text-foreground">{headline}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Installed · <b className="text-foreground">v{u.current}</b>
              {u.checkedAt ? <> · checked {formatAgo(u.checkedAt, Date.now())}</> : null}
            </p>
          </div>
        </div>

        {u.phase === 'downloading' && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-muted/60" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 flex justify-between text-[10px] font-semibold text-muted-foreground">
              <span>{pct}%</span><span>{bytes(u.doneBytes)}{u.totalBytes ? ` / ${bytes(u.totalBytes)}` : ''}</span>
            </p>
          </div>
        )}
        {u.error && <p className="mt-3 rounded-xl bg-red-500/10 p-2.5 text-[11px] leading-snug text-red-600 dark:text-red-300">{u.error}</p>}
      </div>

      {rel && newer && (
        <div className="rounded-[26px] border border-border/30 bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-extrabold text-foreground">What's new in v{rel.version}</p>
            {rel.apk?.size ? <span className="rounded-full bg-muted/50 px-2 py-1 text-[10px] font-bold text-muted-foreground">{bytes(rel.apk.size)}</span> : null}
          </div>
          {rel.notes ? <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-muted-foreground">{rel.notes}</pre> : <p className="mt-2 text-[11px] text-muted-foreground">See the release page for details.</p>}
        </div>
      )}

      {u.phase === 'needs-permission' && (
        <div className="rounded-[26px] border border-amber-500/35 bg-amber-500/10 p-4 text-[12px] leading-relaxed text-foreground">
          Android needs your OK to install updates from this app. Tap <b>Open settings</b>, switch on <b>Allow from this source</b>, come back and tap <b>Install now</b>.
          <div className="mt-3 flex gap-2">
            <button onClick={openInstallPermission} className="h-10 flex-1 rounded-2xl bg-amber-500 text-[12px] font-black text-black active:scale-[0.98]">Open settings</button>
            <button onClick={installDownloadedUpdate} className="h-10 flex-1 rounded-2xl bg-primary text-[12px] font-black text-primary-foreground active:scale-[0.98]">Install now</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {u.phase === 'available' && native && rel?.apk && (
          <button onClick={startNativeUpdate} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-[13px] font-black text-primary-foreground active:scale-[0.98]">
            <Download className="h-4 w-4" /> Download &amp; install
          </button>
        )}
        {(u.phase === 'ready') && (
          <button onClick={installDownloadedUpdate} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-[13px] font-black text-primary-foreground active:scale-[0.98]">
            <Smartphone className="h-4 w-4" /> Install now
          </button>
        )}
        {!native && u.webUpdateReady && (
          <button onClick={() => void applyWebUpdate()} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-[13px] font-black text-primary-foreground active:scale-[0.98]">
            <RefreshCw className="h-4 w-4" /> Update &amp; reload
          </button>
        )}
        {!busy && (
          <button onClick={() => void check()} disabled={conn.status === 'offline'} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-border/40 bg-card text-[13px] font-black text-foreground active:scale-[0.98] disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> Check for updates
          </button>
        )}
        {rel && (u.phase === 'available' || u.phase === 'error') && (
          <a href={rel.pageUrl} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-border/40 px-4 text-[12px] font-bold text-muted-foreground">
            Release page <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {conn.status === 'offline' && <p className="text-[11px] text-amber-600 dark:text-amber-300">You're offline — updates need the internet.</p>}

      <div className="flex items-start gap-2 rounded-2xl border border-border/20 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <span>
          {native
            ? 'Updates come only from this project’s official GitHub releases. Before installing, the app checks the file’s SHA-256 fingerprint, package name, version and signing key — your data stays on the device.'
            : 'On the web and installed app, new versions download in the background and apply when you tap Update & reload.'}
        </span>
      </div>
    </div>
  );
}
