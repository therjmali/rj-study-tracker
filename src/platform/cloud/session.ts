/**
 * Session storage for the cloud account.
 *
 * Tokens live in localStorage (the same durable, IndexedDB-mirrored engine the
 * rest of the app uses) and are *scoped to the endpoint that issued them* — if
 * the user points the app at a different server, the old session is discarded
 * instead of being silently replayed.
 */
export interface CloudUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  coverGradient?: string;
  createdAt?: string;
}

export interface CloudSession {
  user: CloudUser;
  token: string;
  refreshToken: string;
  /** Epoch ms when the access token stops working. */
  tokenExpiresAt: number;
  deviceId: string;
  endpoint: string;
  signedInAt: string;
}

const KEY = 'rj-cloud-session-v1';
const CHANGE = 'rj:cloud-session-changed';

let snapshot: CloudSession | null | undefined;
let lastRaw: string | null | undefined;

export function getSession(): CloudSession | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (snapshot !== undefined && raw === lastRaw) return snapshot;
  lastRaw = raw;
  if (!raw) { snapshot = null; return snapshot; }
  try {
    const parsed = JSON.parse(raw) as CloudSession;
    if (!parsed || typeof parsed.token !== 'string' || !parsed.user?.id) { snapshot = null; return snapshot; }
    snapshot = {
      user: parsed.user,
      token: parsed.token,
      refreshToken: String(parsed.refreshToken ?? ''),
      tokenExpiresAt: Number(parsed.tokenExpiresAt) || 0,
      deviceId: String(parsed.deviceId ?? ''),
      endpoint: String(parsed.endpoint ?? ''),
      signedInAt: String(parsed.signedInAt ?? new Date().toISOString()),
    };
    return snapshot;
  } catch {
    snapshot = null;
    return snapshot;
  }
}

export function setSession(session: CloudSession | null): void {
  try {
    if (!session) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(session));
  } catch { /* ignore */ }
  snapshot = undefined;
  lastRaw = undefined;
  window.dispatchEvent(new Event(CHANGE));
}

export function patchSession(patch: Partial<CloudSession>): CloudSession | null {
  const current = getSession();
  if (!current) return null;
  const next = { ...current, ...patch };
  setSession(next);
  return next;
}

export function getAccessToken(): string | null {
  return getSession()?.token ?? null;
}

export function isSessionExpiringSoon(skewMs = 60_000): boolean {
  const session = getSession();
  if (!session) return true;
  return session.tokenExpiresAt - skewMs <= Date.now();
}

export function subscribeSession(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(CHANGE, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE, handler);
    window.removeEventListener('storage', handler);
  };
}

export const SESSION_STORAGE_KEY = KEY;
export const SESSION_CHANGE_EVENT = CHANGE;
