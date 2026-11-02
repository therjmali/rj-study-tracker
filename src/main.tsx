import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './fonts.css';
import './index.css';
import App from './App';
import PlatformHost from './components/platform/PlatformHost';
import { bootStorage } from './platform/storage';
import { registerServiceWorker } from './platform/pwa';
import { applyAppIcon, syncNativeIconOnBoot } from './platform/appIcon';
import { installNativeActionDrain } from './platform/nativeActions';
import { installFocusLog } from './platform/focusLog';
import { installNativeBridge } from './platform/native';
import { scheduleDailySnapshot } from './platform/snapshots';
import { initializeCloudAuth } from './platform/cloud/authStore';

const queryClient = new QueryClient();

function RuntimeErrorFallback({ error }: { error: Error }) {
  return (
    <div className="fixed inset-0 grid place-items-center p-4">
      <div className="w-full max-w-xl rounded border-t-4 border-t-red-500 bg-white p-4 shadow-lg">
        <h3 className="mb-2 font-medium">Something went wrong</h3>
        <p className="mb-4 text-sm text-gray-600">
          Your data is safe on this device. Reload to try again.
        </p>
        <pre className="overflow-auto rounded border-l-4 border-red-500 bg-red-50 p-4 font-mono text-sm text-red-900">{error.message}</pre>
        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-4 rounded border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

// Hydrate durable storage first so the app boots with all of the student's data,
// then restore the cloud session (a cached session means instant offline start).
bootStorage()
  .catch(() => undefined)
  .then(() => initializeCloudAuth().catch(() => undefined))
  .finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary fallbackRender={p => <RuntimeErrorFallback error={p.error} />}>
        <QueryClientProvider client={queryClient}>
          <App />
          <PlatformHost />
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
  requestAnimationFrame(() => requestAnimationFrame(() => (window as unknown as { __rjHideSplash?: () => void }).__rjHideSplash?.()));
  applyAppIcon();
  syncNativeIconOnBoot();
  installFocusLog();
  installNativeBridge();
  installNativeActionDrain();
  registerServiceWorker();
  scheduleDailySnapshot();
});
