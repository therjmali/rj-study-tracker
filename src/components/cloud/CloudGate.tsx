/**
 * App-level cloud guardrails.
 *
 *  1. First contact with an account that already has data → ask before mixing.
 *  2. Data changed by another device → toast, then reload so every screen (and
 *     every hook's in-memory state) reflects the merged result. Writes are
 *     paused in the moment between the merge and the reload.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftRight, Cloud, Loader2, RefreshCw, Smartphone, Sparkles } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import { resolveFirstSync, useSyncState } from '../../platform/cloud/syncEngine';
import { setSyncWriteGuard } from '../../platform/cloud/changeBus';

const RELOAD_LOG_KEY = 'rj-cloud-reload-log-v1';
const RELOAD_WINDOW_MS = 30_000;
const RELOAD_MAX = 2;

/** Records an automatic reload; returns false when we are reloading too often (a loop). */
function allowAutoReload(): boolean {
  try {
    const now = Date.now();
    const recent = (JSON.parse(sessionStorage.getItem(RELOAD_LOG_KEY) || '[]') as number[]).filter(t => now - t < RELOAD_WINDOW_MS);
    if (recent.length >= RELOAD_MAX) { sessionStorage.setItem(RELOAD_LOG_KEY, JSON.stringify(recent)); return false; }
    sessionStorage.setItem(RELOAD_LOG_KEY, JSON.stringify([...recent, now]));
  } catch { /* sessionStorage unavailable → allow */ }
  return true;
}

export default function CloudGate() {
  const sync = useSyncState();
  const [busy, setBusy] = useState<'merge' | 'cloud' | 'device' | null>(null);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const onApplied = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail;
      if (detail?.reason === 'restore') return; // the Sync Center reloads itself
      if (!allowAutoReload()) {
        // Safety net: never trap the user in a refresh loop. Let normal saving resume and ask for a manual refresh.
        setSyncWriteGuard(false);
        toast.info('☁️ Cloud changes are ready', {
          description: 'Pull down or tap Refresh when convenient.',
          duration: 10_000,
          action: { label: 'Refresh', onClick: () => window.location.reload() },
        });
        return;
      }
      setReloading(true);
      toast.info('☁️ Changes from another device were applied', {
        description: 'Refreshing so everything is up to date.',
        duration: 2000,
      });
      window.setTimeout(() => window.location.reload(), 1100);
    };
    window.addEventListener('rj:cloud-data-applied', onApplied);
    return () => window.removeEventListener('rj:cloud-data-applied', onApplied);
  }, []);

  const choose = async (choice: 'merge' | 'cloud' | 'device') => {
    setBusy(choice);
    try {
      const result = await resolveFirstSync(choice);
      if (result.ok) {
        toast.success(choice === 'merge' ? 'Merged — nothing was lost' : choice === 'cloud' ? 'Cloud copy downloaded' : 'This device uploaded');
        window.setTimeout(() => window.location.reload(), 600);
      } else {
        toast.error(result.error || 'Sync did not finish. You can retry from Cloud sync.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <AnimatePresence>
        {sync.needsChoice && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6"
          >
            <motion.div
              initial={{ y: 30, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="w-full max-w-md rounded-3xl border border-border/25 bg-card shadow-2xl overflow-hidden"
            >
              <div className="p-5 pb-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Cloud className="w-5 h-5 text-primary" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">First sync</p>
                    <h2 className="font-heading text-lg text-foreground leading-tight">This account already has data</h2>
                  </div>
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  The cloud holds <strong className="text-foreground">{sync.needsChoice.remoteSections} synced sections</strong> (version {sync.needsChoice.remoteVersion}),
                  and this device has <strong className="text-foreground">{sync.needsChoice.localSections}</strong>.
                  Merging keeps both — subjects, topics, sessions and notes are combined and you can review every conflict afterwards.
                </p>
              </div>

              <div className="px-4 pb-4 space-y-2">
                <button
                  onClick={() => choose('merge')}
                  disabled={busy !== null}
                  className="w-full flex items-center gap-3 rounded-2xl border-2 border-primary/40 bg-primary/8 px-4 py-3 text-left active:scale-[0.99] transition-transform disabled:opacity-60"
                >
                  <span className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                    {busy === 'merge' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">Merge both <Sparkles className="w-3 h-3 text-primary" /></span>
                    <span className="block text-[10.5px] text-muted-foreground mt-0.5">Recommended. Nothing is deleted; conflicts are listed.</span>
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => choose('cloud')}
                    disabled={busy !== null}
                    className="rounded-2xl border border-border/25 bg-card/40 px-3 py-2.5 text-left active:scale-[0.99] transition-transform disabled:opacity-60"
                  >
                    <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-foreground">
                      {busy === 'cloud' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5 text-primary" />} Use cloud
                    </span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">Replace this device with the server copy.</span>
                  </button>
                  <button
                    onClick={() => choose('device')}
                    disabled={busy !== null}
                    className="rounded-2xl border border-border/25 bg-card/40 px-3 py-2.5 text-left active:scale-[0.99] transition-transform disabled:opacity-60"
                  >
                    <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-foreground">
                      {busy === 'device' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5 text-primary" />} Use device
                    </span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">Make this device the cloud copy.</span>
                  </button>
                </div>

                <Button variant="ghost" size="sm" onClick={() => setBusy(null)} className="w-full h-8 text-[10.5px] text-muted-foreground">
                  Decide later
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reloading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[290] flex items-center gap-2 rounded-full border border-border/25 bg-card/95 px-4 py-2 shadow-lg backdrop-blur"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
            <span className="text-[11px] font-bold text-foreground">Applying cloud changes…</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
