/**
 * Connectivity monitor — knows whether the device is online AND whether the cloud really answers.
 *
 * `navigator.onLine` alone lies (captive portals, dead Wi-Fi, a paused free-tier project), so while a
 * cloud account is signed in we also probe the cloud's health endpoint:
 *  • instantly on app launch / return from background / network change (so the status is right the moment you look),
 *  • every 45 s while the app is visible and online,
 *  • with a gentle back-off (3 s → 30 s) while offline or unreachable, so recovery is noticed within seconds.
 * Nothing runs while the app is in the background, and guests (no account) generate no network traffic at all.
 */
import { useSyncExternalStore } from 'react';
import { isCloudConfigured, probeServer } from './cloud/config';
import { getSession, subscribeSession } from './cloud/session';
import {
  ONLINE_RECHECK_MS, resolveStatus, retryDelay,
  type NetStatus,
} from './connectivityLogic.mjs';

export type { NetStatus };

export interface Connectivity {
  status: NetStatus;
  checking: boolean;
  /** When the current status began (ms). */
  since: number;
  lastCheckedAt: number | null;
  /** Set when the device recovers from offline/unreachable — drives the "Back online" flash. */
  reconnectedAt: number | null;
  effectiveType: string | null;
  saveData: boolean;
}

type NetworkInformationLike = EventTarget & { effectiveType?: string; saveData?: boolean };
const connection = (): NetworkInformationLike | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as unknown as { connection?: NetworkInformationLike }).connection;

const navigatorOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

let state: Connectivity = {
  status: navigatorOnline() ? 'online' : 'offline',
  checking: false,
  since: Date.now(),
  lastCheckedAt: null,
  reconnectedAt: null,
  effectiveType: connection()?.effectiveType ?? null,
  saveData: !!connection()?.saveData,
};

const listeners = new Set<() => void>();
let started = false;
let inflight: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let attempt = 0;

function emit(): void {
  for (const l of listeners) { try { l(); } catch { /* ignore */ } }
}

function patch(next: Partial<Connectivity>): void {
  state = { ...state, ...next };
  emit();
}

export function getConnectivity(): Connectivity { return state; }

export function subscribeConnectivity(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useConnectivity(): Connectivity {
  return useSyncExternalStore(subscribeConnectivity, getConnectivity, getConnectivity);
}

/** A cloud probe only makes sense for a configured build with a signed-in account. */
const probeWanted = (): boolean => isCloudConfigured() && !!getSession();

function applyStatus(status: NetStatus): void {
  if (status === state.status) return;
  const recovered = state.status !== 'online' && status === 'online';
  patch({ status, since: Date.now(), reconnectedAt: recovered ? Date.now() : state.reconnectedAt });
  if (recovered) {
    try { window.dispatchEvent(new CustomEvent('rj:back-online')); } catch { /* ignore */ }
  }
}

function schedule(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return; // nothing runs in the background
  let delay: number | null;
  if (state.status === 'online') {
    attempt = 0;
    delay = probeWanted() ? ONLINE_RECHECK_MS : null; // guests / unconfigured builds: rely on browser events only
  } else {
    delay = retryDelay(attempt++);
  }
  if (delay != null) timer = setTimeout(() => { void verify(); }, delay);
}

/** Checks the real connection now. Safe to call often: overlapping calls share one probe. */
export function verify(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const online = navigatorOnline();
    let probeOk: boolean | null = null;
    if (online && probeWanted()) {
      patch({ checking: true });
      probeOk = (await probeServer()).ok;
      failures = probeOk ? 0 : failures + 1;
    } else if (!online) {
      failures = 0;
    } else {
      failures = 0;
    }
    applyStatus(resolveStatus({ navigatorOnline: online, probeOk, failures }));
  })()
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
      patch({ checking: false, lastCheckedAt: Date.now() });
      schedule();
    });
  return inflight;
}

export const recheckConnectivity = verify;

export function startConnectivity(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  window.addEventListener('online', () => { attempt = 0; void verify(); });
  window.addEventListener('offline', () => { attempt = 0; failures = 0; applyStatus('offline'); schedule(); });
  window.addEventListener('pageshow', e => { if ((e as PageTransitionEvent).persisted) void verify(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { attempt = 0; void verify(); }
    else if (timer) { clearTimeout(timer); timer = null; }
  });
  connection()?.addEventListener?.('change', () => {
    patch({ effectiveType: connection()?.effectiveType ?? null, saveData: !!connection()?.saveData });
    void verify();
  });
  // Signing in / out changes whether the cloud needs probing.
  subscribeSession(() => { attempt = 0; void verify(); });

  void verify();
}
