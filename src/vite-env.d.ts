/// <reference types="vite/client" />

interface Window {
  /** Set by the install prompt hook; see hooks/usePwa.ts */
  __rjDeferredInstall?: unknown;
}

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
