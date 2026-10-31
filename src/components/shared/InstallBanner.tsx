import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { useIsPwaMode, useInstallPrompt } from '../../hooks/usePwa';

export default function InstallBanner() {
  const isPwa = useIsPwaMode();
  const { canInstall, triggerInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('nursetrack-install-dismissed') === 'true'; } catch { return false; }
  });

  if (isPwa || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('nursetrack-install-dismissed', 'true'); } catch {}
  };

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        className="fixed bottom-20 left-3 right-3 lg:bottom-4 lg:left-auto lg:right-4 lg:w-80 z-40
          rounded-xl border border-border/30 bg-card/90 backdrop-blur-xl p-3.5 shadow-lg shadow-foreground/5"
      >
        <button onClick={dismiss} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center" aria-label="Dismiss">
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground">Install RJ TRACKER</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {isIOS
                ? 'Tap the Share button, then "Add to Home Screen"'
                : 'Install for offline access and a native app experience'}
            </p>
            <div className="flex gap-2 mt-2">
              {canInstall && (
                <Button size="sm" onClick={triggerInstall} className="gap-1 text-[10px] h-7">
                  <Download className="w-3 h-3" /> Install
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={dismiss} className="text-[10px] h-7">
                Not now
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
