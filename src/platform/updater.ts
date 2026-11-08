/**
 * In-app updates.
 *  • Android APK: checks this project's GitHub releases, downloads the new APK inside the app (progress bar),
 *    verifies SHA-256 + package + signing certificate natively, then hands it to Android's installer.
 *  • Web / installed PWA: checks for a new service-worker build and reloads into it.
 * Only public release information is fetched — no account, no token.
 */
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import {
  compareVersions, isTrustedDownloadUrl, pickApkAsset, shouldAutoCheck, summarizeNotes,
} from '../lib/updaterLogic.mjs';
import { isNative } from './native';
import { getConnectivity } from './connectivity';

export const REPO_OWNER = 'therjmali';
export const REPO_NAME = 'rj-study-tracker';
const API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const CHECK_KEY = 'rj-update-check-v1';
export const OPEN_UPDATES_EVENT = 'rj:open-updates';

export type UpdatePhase =
  | 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'verifying'
  | 'ready' | 'needs-permission' | 'installing' | 'error';

export interface ReleaseInfo {
  tag: string; version: string; name: string; notes: string; publishedAt: string; pageUrl: string;
  apk: { name: string; url: string; size: number | null; sha256: string | null } | null;
}

export interface UpdateState {
  phase: UpdatePhase;
  current: string;
  release: ReleaseInfo | null;
  /** 0..1 while downloading. */
  progress: number;
  doneBytes: number;
  totalBytes: number;
  error: string | null;
  checkedAt: number | null;
  /** A new web build is waiting (PWA). */
  webUpdateReady: boolean;
}

interface NativeUpdater {
  canInstallPackages?: () => boolean;
  openInstallPermission?: () => void;
  downloadUpdate?: (url: string, sha256: string) => void;
  installUpdate?: () => void;
}
const nativeBridge = (): NativeUpdater | undefined => (window as unknown as { RJNative?: NativeUpdater }).RJNative;

/** The monitor's verdict, or the browser's own flag if the monitor has not caught up yet. */
const isOffline = (): boolean => getConnectivity().status === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false);

const CURRENT = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
let state: UpdateState = {
  phase: 'idle', current: CURRENT, release: null, progress: 0, doneBytes: 0, totalBytes: 0,
  error: null, checkedAt: readCheckedAt(), webUpdateReady: false,
};
const listeners = new Set<() => void>();
function set(patch: Partial<UpdateState>) { state = { ...state, ...patch }; listeners.forEach(l => l()); }
function readCheckedAt(): number | null {
  try { const n = Number(localStorage.getItem(CHECK_KEY)); return Number.isFinite(n) && n > 0 ? n : null; } catch { return null; }
}
export const getUpdateState = () => state;
export const subscribeUpdate = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const useUpdateState = (): UpdateState => useSyncExternalStore(subscribeUpdate, getUpdateState, getUpdateState);
export const isNativeUpdater = (): boolean => isNative && typeof nativeBridge()?.downloadUpdate === 'function';

/* ───────────────────────────── check ───────────────────────────── */

export async function fetchLatestRelease(signal?: AbortSignal): Promise<ReleaseInfo> {
  const res = await fetch(API, { headers: { accept: 'application/vnd.github+json' }, signal, cache: 'no-store' });
  if (res.status === 403 || res.status === 429) throw new Error('GitHub is limiting requests right now. Try again in a few minutes.');
  if (res.status === 404) throw new Error('No release has been published yet.');
  if (!res.ok) throw new Error(`Could not read the latest release (${res.status}).`);
  const j = await res.json();
  return {
    tag: String(j.tag_name ?? ''),
    version: String(j.tag_name ?? '').replace(/^v/i, ''),
    name: String(j.name ?? j.tag_name ?? ''),
    notes: summarizeNotes(j.body),
    publishedAt: String(j.published_at ?? ''),
    pageUrl: String(j.html_url ?? `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`),
    apk: pickApkAsset(j.assets),
  };
}

export async function checkForUpdate(opts: { silent?: boolean } = {}): Promise<UpdateState> {
  if (state.phase === 'downloading' || state.phase === 'verifying' || state.phase === 'installing') return state;
  if (isOffline()) {
    if (!opts.silent) set({ phase: 'error', error: 'You are offline. Connect to the internet to check for updates.' });
    return state;
  }
  set({ phase: 'checking', error: null });
  try {
    const release = await fetchLatestRelease();
    const now = Date.now();
    try { localStorage.setItem(CHECK_KEY, String(now)); } catch { /* ignore */ }
    const newer = compareVersions(release.version, CURRENT) > 0;
    set({ release, checkedAt: now, phase: newer ? 'available' : 'uptodate' });
  } catch (err) {
    const e = err as Error;
    const network = e?.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(e?.message ?? '');
    set({
      phase: opts.silent ? 'idle' : 'error',
      error: opts.silent ? null : network ? 'Could not reach GitHub. Check your internet connection and try again.' : e?.message || 'Could not check for updates.',
    });
  }
  return state;
}

/** Quiet background check at most every 6 h; tells the student once if a newer version exists. */
export function scheduleUpdateCheck(): void {
  if (!shouldAutoCheck(state.checkedAt)) return;
  window.setTimeout(async () => {
    const before = state.release?.version;
    const s = await checkForUpdate({ silent: true });
    if (s.phase === 'available' && s.release && s.release.version !== before) {
      toast.info(`Update available — v${s.release.version}`, {
        id: 'app-update', duration: 12000, description: 'Open Settings → App updates to install it.',
        action: { label: 'View', onClick: () => window.dispatchEvent(new Event(OPEN_UPDATES_EVENT)) },
      });
    }
  }, 6000);
}

/* ───────────────────────────── Android install ───────────────────────────── */

/** Called by the native layer: { state, done, total, error }. */
function onNative(msg: { state?: string; done?: number; total?: number; error?: string }) {
  const total = Number(msg.total) || state.totalBytes;
  const done = Number(msg.done) || 0;
  switch (msg.state) {
    case 'downloading': set({ phase: 'downloading', doneBytes: done, totalBytes: total, progress: total > 0 ? Math.min(1, done / total) : 0 }); break;
    case 'verifying': set({ phase: 'verifying', progress: 1 }); break;
    case 'ready': set({ phase: 'ready', progress: 1 }); break;
    case 'needs_permission': set({ phase: 'needs-permission' }); break;
    case 'installing': set({ phase: 'installing' }); break;
    case 'error': set({ phase: 'error', error: msg.error || 'The update could not be installed.' }); break;
  }
}
(window as unknown as { __rjUpdate?: typeof onNative }).__rjUpdate = onNative;

export function startNativeUpdate(): void {
  const rel = state.release;
  const b = nativeBridge();
  if (!rel?.apk || !b?.downloadUpdate) { set({ phase: 'error', error: 'This version cannot be updated inside the app. Open the release page instead.' }); return; }
  if (!isTrustedDownloadUrl(rel.apk.url, REPO_OWNER, REPO_NAME)) { set({ phase: 'error', error: 'The update link is not from the official release page, so it was blocked.' }); return; }
  if (isOffline()) { set({ phase: 'error', error: 'You are offline. Connect to the internet to download the update.' }); return; }
  set({ phase: 'downloading', progress: 0, doneBytes: 0, totalBytes: rel.apk.size ?? 0, error: null });
  try { b.downloadUpdate(rel.apk.url, rel.apk.sha256 ?? ''); } catch (e) { set({ phase: 'error', error: (e as Error)?.message || 'Could not start the download.' }); }
}
export function installDownloadedUpdate(): void { try { nativeBridge()?.installUpdate?.(); } catch { /* ignore */ } }
export function openInstallPermission(): void { try { nativeBridge()?.openInstallPermission?.(); } catch { /* ignore */ } }

/* ───────────────────────────── web / PWA ───────────────────────────── */

export async function checkWebUpdate(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) return false;
    await reg.update();
    const waiting = !!reg.waiting;
    set({ webUpdateReady: waiting });
    return waiting;
  } catch { return false; }
}
export async function applyWebUpdate(): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg?.waiting) { reg.waiting.postMessage('SKIP_WAITING'); return; } // the app reloads on controllerchange
  location.reload();
}
