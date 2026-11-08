/**
 * Cloud account store.
 *
 * One external store (read through `useSyncExternalStore`) so the header, the
 * profile page, the AI gate and the sync engine all see the same account state.
 */
import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getCloudEndpoint, isCloudConfigured, probeServer } from './config';
import { CloudError, toCloudError } from './http';
import { getDeviceIdentity, renameDevice } from './device';
import { clearSupabaseSession, getSupabase } from './supabase';
import {
  CloudSession, CloudUser, getSession, setSession, subscribeSession, patchSession,
} from './session';

export interface CloudDevice {
  id: string;
  name: string;
  platform: string;
  createdAt: string;
  lastSeenAt: string;
  current?: boolean;
}

export interface CloudAuthState {
  status: 'loading' | 'signed-in' | 'signed-out';
  user: CloudUser | null;
  session: CloudSession | null;
  configured: boolean;
  endpoint: string;
  busy: boolean;
  error: string | null;
  verifiedAt: string | null;
  offlineNotice: string | null;
}

let state: CloudAuthState = {
  status: 'loading',
  user: null,
  session: null,
  configured: isCloudConfigured(),
  endpoint: getCloudEndpoint(),
  busy: false,
  error: null,
  verifiedAt: null,
  offlineNotice: null,
};

const listeners = new Set<() => void>();
const CHANGE = 'rj:cloud-auth-changed';

function emit(): void {
  for (const listener of listeners) {
    try { listener(); } catch { /* ignore */ }
  }
  window.dispatchEvent(new Event(CHANGE));
}

function set(patch: Partial<CloudAuthState>): void {
  state = { ...state, ...patch };
  emit();
}

export function getCloudAuthState(): CloudAuthState {
  return state;
}

export function subscribeCloudAuth(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCloudAuth(): CloudAuthState {
  return useSyncExternalStore(subscribeCloudAuth, getCloudAuthState, getCloudAuthState);
}

let booted = false;
let eventsWired = false;
let lastTouch = 0;
const REGISTERED_KEY = 'rj-device-registered-v1';

function wasRegistered(userId: string): boolean {
  try { return localStorage.getItem(REGISTERED_KEY) === userId; } catch { return false; }
}

/* ── helpers ─────────────────────────────────────────────────────────── */

async function loadProfile(userId: string, fallback: Partial<CloudUser> & { name: string }): Promise<Partial<CloudUser>> {
  try {
    const { data, error } = await getSupabase()
      .from('profiles').select('name, avatar, cover_gradient').eq('user_id', userId).maybeSingle();
    if (error || !data) return fallback;
    return {
      name: data.name || fallback.name,
      avatar: data.avatar ?? fallback.avatar,
      coverGradient: data.cover_gradient ?? fallback.coverGradient,
    };
  } catch {
    return fallback;
  }
}

async function toCloudUser(session: Session): Promise<CloudUser> {
  const u = session.user;
  const metaName = String((u.user_metadata as { name?: string } | null)?.name ?? '') || (u.email ?? '').split('@')[0];
  // If the profile can't be fetched (offline, error) keep what this device already knows instead of reverting.
  const cached = getSession()?.user;
  const known = cached && cached.id === u.id ? cached : null;
  const profile = await loadProfile(u.id, { name: known?.name || metaName, avatar: known?.avatar, coverGradient: known?.coverGradient });
  return {
    id: u.id,                       // ← the Supabase uid; every row in the database is keyed by it
    email: u.email ?? '',
    name: profile.name || metaName,
    avatar: profile.avatar,
    coverGradient: profile.coverGradient,
    createdAt: u.created_at,
  };
}

function mirrorSession(sb: Session, user: CloudUser): CloudSession {
  const device = getDeviceIdentity();
  const session: CloudSession = {
    user,
    token: sb.access_token,
    refreshToken: sb.refresh_token,
    tokenExpiresAt: (sb.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
    deviceId: device.id,
    endpoint: getCloudEndpoint(),
    signedInAt: getSession()?.signedInAt ?? new Date().toISOString(),
  };
  setSession(session);
  return session;
}

/** Register / refresh this device in the user's device list (throttled). */
export async function touchDevice(force = false): Promise<void> {
  const session = getSession();
  if (!session || (!force && Date.now() - lastTouch < 5 * 60_000)) return;
  lastTouch = Date.now();
  const device = getDeviceIdentity();
  try {
    const { error } = await getSupabase().from('devices').upsert(
      { user_id: session.user.id, device_id: device.id, name: device.name, platform: device.platform, last_seen_at: new Date().toISOString() },
      { onConflict: 'user_id,device_id' },
    );
    if (!error) { try { localStorage.setItem(REGISTERED_KEY, session.user.id); } catch { /* ignore */ } }
  } catch { /* best effort */ }
}

function friendlyAuthError(err: unknown, fallback: string): CloudError {
  const e = (err ?? {}) as { message?: string; status?: number; code?: string };
  const m = String(e.message ?? '');
  if (/invalid login credentials/i.test(m)) return new CloudError('Wrong email or password.', 'invalid_credentials', 400);
  if (/already registered|already been registered/i.test(m)) return new CloudError('An account with this email already exists. Sign in instead.', 'email_taken', 422);
  if (/email not confirmed/i.test(m)) return new CloudError('Confirm your email first (check your inbox), then sign in.', 'email_not_confirmed', 400);
  if (/signups? (are )?not allowed|signup.*disabled/i.test(m)) return new CloudError('New sign-ups are switched off for this app.', 'signup_disabled', 422);
  if (/password.*(weak|short|least)/i.test(m)) return new CloudError('Choose a stronger password (8+ characters, letters and numbers).', 'weak_password', 422);
  if (e.status === 429 || /rate limit/i.test(m)) return new CloudError('Too many attempts. Wait a minute and try again.', 'rate_limited', 429);
  const mapped = toCloudError(err);
  return mapped.code === 'request_failed' ? new CloudError(m || fallback, 'auth_failed', e.status ?? 400) : mapped;
}

function wireAuthEvents(): void {
  if (eventsWired) return;
  eventsWired = true;
  // Connection recovered: clear the "using your saved account" notice by re-verifying in the background.
  window.addEventListener('rj:back-online', () => { if (getSession() && state.offlineNotice) void verifySession(); });
  getSupabase().auth.onAuthStateChange((event, sbSession) => {
    if (event === 'TOKEN_REFRESHED' && sbSession) {
      patchSession({
        token: sbSession.access_token,
        refreshToken: sbSession.refresh_token,
        tokenExpiresAt: (sbSession.expires_at ?? 0) * 1000,
      });
    } else if (event === 'SIGNED_OUT' && getSession()) {
      // Refresh token revoked/expired (e.g. “sign out other devices”).
      setSession(null);
      set({ status: 'signed-out', user: null, session: null, error: 'Your session ended. Please sign in again.' });
    }
  });
}

/* ── lifecycle ───────────────────────────────────────────────────────── */

/**
 * Instant start: put the cached account on screen synchronously (no network), so the first paint never
 * waits on a token refresh. initializeCloudAuth() then verifies it in the background.
 */
export function seedCloudAuthFromCache(): void {
  if (booted || state.status !== 'loading') return;
  const endpoint = getCloudEndpoint();
  const configured = isCloudConfigured();
  const kept = getSession();
  if (!configured) {
    state = { ...state, status: 'signed-out', user: null, session: null, endpoint, configured };
    emit();
    return;
  }
  if (kept && kept.endpoint === endpoint) {
    state = { ...state, status: 'signed-in', user: kept.user, session: kept, endpoint, configured };
    emit();
  }
}

/** Safety net: if the first check has not settled after a few seconds, never leave the app on a loading screen. */
export function resolveAuthIfStuck(): void {
  if (state.status !== 'loading') return;
  state = { ...state, status: getSession() ? 'signed-in' : 'signed-out', user: getSession()?.user ?? null, session: getSession() };
  emit();
}

/** Restore the saved session (works offline), then verify it in the background. */
export async function initializeCloudAuth(): Promise<void> {
  if (booted) return;
  booted = true;

  const endpoint = getCloudEndpoint();
  const configured = isCloudConfigured();
  const existing = getSession();

  // A session minted by the old self-hosted server (or another project) is never replayed.
  if (existing && existing.endpoint !== endpoint) {
    setSession(null);
  }
  if (!configured) {
    state = { ...state, status: 'signed-out', user: null, session: null, endpoint, configured };
    emit();
    return;
  }

  wireAuthEvents();
  const kept = getSession();
  let lastError: unknown = null;
  try {
    const { data, error } = await getSupabase().auth.getSession();
    lastError = error;
    if (data.session) {
      const user = kept?.user ?? await toCloudUser(data.session);
      const session = mirrorSession(data.session, user);
      state = { ...state, status: 'signed-in', user, session, endpoint, configured, busy: false };
      emit();
      void verifySession();
      return;
    }
    // Offline with an expired access token: stay signed in on the cached account.
    if (kept && error && toCloudError(error).code === 'offline') {
      state = { ...state, status: 'signed-in', user: kept.user, session: kept, endpoint, configured, offlineNotice: 'Offline — using your saved account.' };
      emit();
      return;
    }
  } catch (err) { lastError = err; /* fall through to signed-out unless we have a cached account */ }

  // A flaky network (offline, captive portal, timeout, 5xx) must never sign the student out:
  // keep the saved account and let the background re-check settle it. Only a definitive
  // rejection from the server (expired/revoked session) ends the session.
  const transient = !!lastError && (() => { const c = toCloudError(lastError); return c.code === 'offline' || c.code === 'timeout' || c.status >= 500; })();
  if (kept && ((typeof navigator !== 'undefined' && navigator.onLine === false) || transient)) {
    state = { ...state, status: 'signed-in', user: kept.user, session: kept, endpoint, configured, offlineNotice: transient && navigator.onLine !== false ? 'Cloud unreachable — using your saved account.' : 'Offline — using your saved account.' };
    emit();
    return;
  }
  setSession(null);
  state = { ...state, status: 'signed-out', user: null, session: null, endpoint, configured };
  emit();
}

export async function refreshAccount(): Promise<boolean> {
  return verifySession();
}

async function verifySession(): Promise<boolean> {
  if (!getSession()) return false;
  try {
    const sb = getSupabase();
    const { data, error } = await sb.auth.getUser();           // validates the token with the server
    if (error || !data.user) throw error ?? new Error('no user');
    const { data: sbSession } = await sb.auth.getSession();
    if (!sbSession.session) throw new CloudError('Session ended.', 'session_expired', 401);
    const user = await toCloudUser(sbSession.session);

    // Removed from another device's list → sign this device out.
    const device = getDeviceIdentity();
    const { data: row } = await sb.from('devices').select('device_id').eq('user_id', user.id).eq('device_id', device.id).maybeSingle();
    const { count } = await sb.from('devices').select('device_id', { count: 'exact', head: true }).eq('user_id', user.id);
    if (!row && (count ?? 0) > 0 && wasRegistered(user.id)) {
      await signOut({ silent: false });
      return false;
    }

    const session = mirrorSession(sbSession.session, user);
    void touchDevice(true);
    set({ status: 'signed-in', user, session, verifiedAt: new Date().toISOString(), offlineNotice: null, error: null });
    return true;
  } catch (err) {
    const mapped = toCloudError(err);
    if (mapped.status === 401 || mapped.status === 403 || mapped.code === 'session_expired') {
      setSession(null);
      set({ status: 'signed-out', user: null, session: null, error: 'Your session ended. Please sign in again.' });
      return false;
    }
    // Offline / unreachable: keep the cached session so the app stays fully usable.
    set({
      status: 'signed-in',
      user: getSession()?.user ?? state.user,
      session: getSession(),
      offlineNotice: mapped.message || 'Cloud is unreachable right now.',
    });
    return true;
  }
}

async function finishSignIn(sbSession: Session): Promise<CloudUser> {
  const user = await toCloudUser(sbSession);
  const session = mirrorSession(sbSession, user);
  set({
    status: 'signed-in', user, session, busy: false, error: null,
    verifiedAt: new Date().toISOString(), offlineNotice: null,
    endpoint: getCloudEndpoint(), configured: true,
  });
  void touchDevice(true);
  return user;
}

export async function signIn(input: { email: string; password: string }): Promise<CloudUser> {
  set({ busy: true, error: null });
  try {
    wireAuthEvents();
    const { data, error } = await getSupabase().auth.signInWithPassword({ email: input.email.trim(), password: input.password });
    if (error || !data.session) throw friendlyAuthError(error, 'Could not sign in.');
    return await finishSignIn(data.session);
  } catch (err) {
    set({ busy: false, error: err instanceof Error ? err.message : 'Could not sign in.' });
    throw err;
  }
}

export async function signUp(input: { email: string; password: string; name: string }): Promise<CloudUser> {
  set({ busy: true, error: null });
  try {
    wireAuthEvents();
    const { data, error } = await getSupabase().auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: { data: { name: input.name.trim() } },
    });
    if (error) throw friendlyAuthError(error, 'Could not create the account.');
    if (!data.session) {
      // Supabase has “Confirm email” switched on → no session until the link is clicked.
      throw new CloudError('Account created. Confirm your email (check your inbox), then sign in. (Tip: turn off “Confirm email” in Supabase → Authentication → Providers → Email for a private app.)', 'email_confirmation_required', 200);
    }
    // The signup trigger already created the profile row; make sure the chosen name is stored.
    await getSupabase().from('profiles').upsert({ user_id: data.session.user.id, name: input.name.trim() }, { onConflict: 'user_id' });
    return await finishSignIn(data.session);
  } catch (err) {
    set({ busy: false, error: err instanceof Error ? err.message : 'Could not create the account.' });
    throw err;
  }
}

export async function signOut(options: { silent?: boolean } = {}): Promise<void> {
  try { await getSupabase().auth.signOut({ scope: 'local' }); } catch { /* signing out locally is what matters */ }
  clearSupabaseSession();     // guarantees a reload can never sign the user back in
  setSession(null);
  set({ status: 'signed-out', user: null, session: null, error: null, busy: false, offlineNotice: null });
  if (!options.silent) window.dispatchEvent(new Event('rj:cloud-signed-out'));
}

export async function updateAccountProfile(patch: { name?: string; avatar?: string; coverGradient?: string }): Promise<CloudUser> {
  const session = getSession();
  if (!session) throw new CloudError('Please sign in again.', 'unauthorized', 401);
  const row: Record<string, unknown> = { user_id: session.user.id, updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.avatar !== undefined) row.avatar = patch.avatar;
  if (patch.coverGradient !== undefined) row.cover_gradient = patch.coverGradient;
  const { error } = await getSupabase().from('profiles').upsert(row, { onConflict: 'user_id' });
  if (error) throw toCloudError(error);
  const user: CloudUser = { ...session.user, ...patch };
  patchSession({ user });
  set({ user, session: getSession() });
  return user;
}

async function verifyPassword(password: string): Promise<void> {
  const email = getSession()?.user.email;
  if (!email) throw new CloudError('Please sign in again.', 'unauthorized', 401);
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw friendlyAuthError(error, 'That password is not correct.');
}

export async function changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
  await verifyPassword(input.currentPassword);
  const { error } = await getSupabase().auth.updateUser({ password: input.newPassword });
  if (error) throw friendlyAuthError(error, 'Could not change the password.');
  await getSupabase().auth.signOut({ scope: 'others' });       // old password → other devices must sign in again
}

/* ── devices ─────────────────────────────────────────────────────────── */

export async function listDevices(): Promise<CloudDevice[]> {
  const { data, error } = await getSupabase().from('devices')
    .select('device_id, name, platform, created_at, last_seen_at').order('last_seen_at', { ascending: false });
  if (error) throw toCloudError(error);
  const current = getDeviceIdentity().id;
  return (data ?? []).map(d => ({
    id: d.device_id, name: d.name, platform: d.platform,
    createdAt: d.created_at, lastSeenAt: d.last_seen_at, current: d.device_id === current,
  }));
}

/**
 * Removes a device from the list. That device signs itself out the next time it
 * checks its account (app start / opening Cloud sync). For a LOST device use
 * “Sign out every other device”, which revokes its token immediately.
 */
export async function revokeDevice(deviceId: string): Promise<CloudDevice[]> {
  if (deviceId === getDeviceIdentity().id) {
    await signOut();
    return [];
  }
  const { error } = await getSupabase().from('devices').delete().eq('device_id', deviceId);
  if (error) throw toCloudError(error);
  return listDevices();
}

export async function revokeOtherDevices(): Promise<void> {
  const { error } = await getSupabase().auth.signOut({ scope: 'others' });
  if (error) throw toCloudError(error);
  const { error: delError } = await getSupabase().from('devices').delete().neq('device_id', getDeviceIdentity().id);
  if (delError) throw toCloudError(delError);
}

export async function deleteCloudAccount(password: string): Promise<void> {
  await verifyPassword(password);
  const { error } = await getSupabase().rpc('delete_my_account');
  if (error) throw toCloudError(error);
  try { await getSupabase().auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
  clearSupabaseSession();
  setSession(null);
  set({ status: 'signed-out', user: null, session: null, busy: false });
}

export async function renameCurrentDevice(name: string): Promise<void> {
  renameDevice(name);
  await touchDevice(true);
  await verifySession();
}

export async function testConnection(): Promise<boolean> {
  const probe = await probeServer();
  set({ configured: isCloudConfigured() });
  if (!probe.ok) set({ error: probe.error ?? 'Could not reach the cloud.' });
  return probe.ok;
}

// Keep the store in sync if another tab signs in or out.
subscribeSession(() => {
  if (state.status === 'loading') return;
  const session = getSession();
  if (!session && state.status !== 'signed-out') {
    set({ status: 'signed-out', user: null, session: null });
  } else if (session && session.user.id !== state.user?.id) {
    set({ status: 'signed-in', user: session.user, session });
  }
});
