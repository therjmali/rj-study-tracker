import { useEffect, useRef } from 'react';

/**
 * Global back-button interception stack.
 * 
 * Each `useBackGuard(active=true)` call pushes a phantom history entry (same URL).
 * When the phone's back button fires popstate WITHOUT changing the URL,
 * we pop the top handler instead of letting the browser navigate away.
 * 
 * If the URL DID change (react-router navigation), we skip — letting
 * react-router handle it normally. This prevents conflicts with the
 * existing tab/overlay URL routing.
 */

type Handler = () => void;
const stack: Handler[] = [];
let initialized = false;
let lastUrl = '';

function init() {
  if (initialized) return;
  initialized = true;
  lastUrl = window.location.href;

  // Patch pushState/replaceState to track URL changes from ALL sources
  // (react-router, our guards, etc.) so popstate can detect same-URL pops.
  const origPush = window.history.pushState.bind(window.history);
  window.history.pushState = function (
    state: any,
    title: string,
    url?: string | URL | null
  ) {
    origPush(state, title, url);
    lastUrl = window.location.href;
  };

  const origReplace = window.history.replaceState.bind(window.history);
  window.history.replaceState = function (
    state: any,
    title: string,
    url?: string | URL | null
  ) {
    origReplace(state, title, url);
    lastUrl = window.location.href;
  };

  window.addEventListener('popstate', () => {
    const currentUrl = window.location.href;
    const urlChanged = currentUrl !== lastUrl;
    lastUrl = currentUrl;

    // URL changed → real navigation (react-router tabs/overlays). Don't intercept.
    if (urlChanged || stack.length === 0) return;

    // Same URL → our phantom entry was consumed. Fire the top handler.
    const handler = stack.pop();
    if (handler) handler();
  });
}

/**
 * When `active` becomes true, pushes a phantom browser history entry.
 * Pressing the phone back button (or browser back) calls `onBack`
 * instead of navigating away from the app.
 *
 * When `active` becomes false (whether from back-press or programmatic
 * close), the guard is cleaned up. Programmatic closes leave a harmless
 * no-op phantom that is consumed on the next back press.
 */
export function useBackGuard(active: boolean, onBack: () => void) {
  const cbRef = useRef(onBack);
  cbRef.current = onBack;

  useEffect(() => {
    if (!active) return;

    init();

    const handler: Handler = () => cbRef.current();
    stack.push(handler);
    window.history.pushState({ __bk: 1 }, '');

    return () => {
      // Replace with no-op so the phantom entry is consumed harmlessly
      // if the view was closed programmatically (not via back button).
      const idx = stack.lastIndexOf(handler);
      if (idx >= 0) stack[idx] = () => {};
    };
  }, [active]);
}
