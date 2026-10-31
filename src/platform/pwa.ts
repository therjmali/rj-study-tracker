import { toast } from 'sonner';

/** Registers the service worker (production only) and surfaces update prompts. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then(reg => {
        const promptUpdate = (worker: ServiceWorker) => {
          toast('A new version of RJ Tracker is ready', {
            id: 'sw-update',
            duration: Infinity,
            action: { label: 'Update', onClick: () => worker.postMessage('SKIP_WAITING') },
          });
        };

        if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(worker);
          });
        });

        // Check for a new deployment whenever the app returns to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
        });
      })
      .catch(() => undefined);
  });

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    // Only reload for an in-place update, not the very first install.
    if (sessionStorage.getItem('rj-sw-had-controller') === '1') window.location.reload();
  });
  if (navigator.serviceWorker.controller) sessionStorage.setItem('rj-sw-had-controller', '1');
}
