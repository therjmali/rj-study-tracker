/**
 * Cloud account store.
 *
 * One external store (read through `useSyncExternalStore`) so the header, the
 * profile page, the AI gate and the sync engine all see the same account state.
 */
import { useSyncExternalStore } from 'react';
import { getCloudEndpoint, isCloudConfigured, probeServer } from './config';
import { CloudError, request } from './http';
import { getDeviceIdentity, renameDevice } from './device';
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

/** Restore the saved session, then verify it against the server in the background. */
export async function initializeCloudAuth(): Promise<void> {
  if (booted) return;
  booted = true;

  const endpoint = getCloudEndpoint();
  const session = getSession();
  const configured = isCloudConfigured();

  if (session && session.endpoint && session.endpoint !== endpoint) {
    // The app was pointed at a different server: never replay a foreign token.
    setSession(null);
    state = { ...state, status: 'signed-out', user: null, session: null, endpoint, configured };
    emit();
    return;
  }

  if (session) {
    state = {
      ...state,
      status: 'signed-in',
      user: session.user,
      session,
      endpoint,
      configured,
      busy: false,
    };
    emit();
    void verifySession();
    return;
  }

  state = { ...state, status: 'signed-out', user: null, session: null, endpoint, configured };
  emit();
}

export async function refreshAccount(): Promise<boolean> {
  return verifySession();
}

async function verifySession(): Promise<boolean> {
  if (!getSession()) return false;
  try {
    const data = await request<{ user: CloudUser; devices: CloudDevice[] }>('/v1/me');
    const session = getSession();
    if (!session) return false;
    patchSession({ user: data.user });
    set({
      status: 'signed-in',
      user: data.user,
      session: getSession(),
      verifiedAt: new Date().toISOString(),
      offlineNotice: null,
      error: null,
    });
    return true;
  } catch (err) {
    if (err instanceof CloudError && (err.status === 401 || err.status === 403)) {
      setSession(null);
      set({ status: 'signed-out', user: null, session: null, error: 'Your session ended. Please sign in again.' });
      return false;
    }
    // Offline: keep the cached session so the app stays fully usable.
    set({
      status: 'signed-in',
      user: getSession()?.user ?? state.user,
      session: getSession(),
      offlineNotice: err instanceof Error ? err.message : 'Cloud is unreachable right now.',
    });
    return true;
  }
}

function applySessionPayload(data: { user: CloudUser; token: string; refreshToken: string; expiresIn?: number; deviceId?: string }, endpoint: string): void {
  const device = getDeviceIdentity();
  const session: CloudSession = {
    user: data.user,
    token: data.token,
    refreshToken: data.refreshToken,
    tokenExpiresAt: Date.now() + (Number(data.expiresIn) || 1800) * 1000,
    deviceId: data.deviceId || device.id,
    endpoint,
    signedInAt: new Date().toISOString(),
  };
  setSession(session);
  set({
    status: 'signed-in',
    user: data.user,
    session,
    busy: false,
    error: null,
    verifiedAt: new Date().toISOString(),
    offlineNotice: null,
    endpoint,
    configured: true,
  });
}

export async function signIn(input: { email: string; password: string }): Promise<CloudUser> {
  set({ busy: true, error: null });
  try {
    const endpoint = getCloudEndpoint();
    const device = getDeviceIdentity();
    const data = await request<{ user: CloudUser; token: string; refreshToken: string; expiresIn: number; deviceId: string }>('/v1/auth/login', {
      method: 'POST',
      auth: false,
      body: {
        email: input.email.trim(),
        password: input.password,
        deviceId: device.id,
        deviceName: device.name,
        devicePlatform: device.platform,
      },
      endpoint,
    });
    applySessionPayload(data, endpoint);
    return data.user;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not sign in.';
    set({ busy: false, error: message });
    throw err;
  }
}

export async function signUp(input: { email: string; password: string; name: string }): Promise<CloudUser> {
  set({ busy: true, error: null });
  try {
    const endpoint = getCloudEndpoint();
    const device = getDeviceIdentity();
    const data = await request<{ user: CloudUser; token: string; refreshToken: string; expiresIn: number; deviceId: string }>('/v1/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        email: input.email.trim(),
        password: input.password,
        name: input.name.trim(),
        deviceId: device.id,
        deviceName: device.name,
        devicePlatform: device.platform,
      },
      endpoint,
    });
    applySessionPayload(data, endpoint);
    return data.user;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create the account.';
    set({ busy: false, error: message });
    throw err;
  }
}

export async function signOut(options: { silent?: boolean } = {}): Promise<void> {
  const session = getSession();
  if (session?.refreshToken) {
    try {
      await request('/v1/auth/logout', {
        method: 'POST',
        auth: false,
        body: { refreshToken: session.refreshToken },
        timeoutMs: 6000,
      });
    } catch { /* signing out locally is what matters */ }
  }
  setSession(null);
  set({ status: 'signed-out', user: null, session: null, error: null, busy: false, offlineNotice: null });
  if (!options.silent) window.dispatchEvent(new Event('rj:cloud-signed-out'));
}

export async function updateAccountProfile(patch: { name?: string; avatar?: string; coverGradient?: string }): Promise<CloudUser> {
  const data = await request<{ user: CloudUser }>('/v1/me', { method: 'PATCH', body: patch });
  patchSession({ user: data.user });
  set({ user: data.user, session: getSession() });
  return data.user;
}

export async function changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
  const data = await request<{ user: CloudUser; token: string; refreshToken: string; expiresIn: number; deviceId: string }>('/v1/me/password', {
    method: 'POST',
    body: input,
  });
  applySessionPayload(data, getCloudEndpoint());
}

export async function listDevices(): Promise<CloudDevice[]> {
  const data = await request<{ devices: CloudDevice[] }>('/v1/devices');
  return data.devices;
}

export async function revokeDevice(deviceId: string): Promise<CloudDevice[]> {
  const data = await request<{ devices: CloudDevice[] }>(`/v1/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
  return data.devices;
}

export async function revokeOtherDevices(): Promise<void> {
  await request('/v1/devices/revoke-others', { method: 'POST', body: { keepCurrent: true } });
}

export async function deleteCloudAccount(password: string): Promise<void> {
  await request('/v1/account', { method: 'DELETE', body: { password } });
  setSession(null);
  set({ status: 'signed-out', user: null, session: null, busy: false });
}

export async function renameCurrentDevice(name: string): Promise<void> {
  renameDevice(name);
  await verifySession();
}

export async function testConnection(endpoint?: string): Promise<boolean> {
  const probe = await probeServer(endpoint);
  set({ configured: probe.ok || state.configured });
  if (!probe.ok) set({ error: probe.error ?? 'Could not reach the sync server.' });
  return probe.ok;
}

// Pointing the app at a different server must never replay the old server's token.
window.addEventListener('rj:cloud-endpoint-changed', () => {
  const session = getSession();
  const endpoint = getCloudEndpoint();
  if (session && session.endpoint && session.endpoint !== endpoint) {
    setSession(null);
    set({ status: 'signed-out', user: null, session: null, endpoint, error: 'Sync server changed — please sign in again.' });
  } else {
    set({ endpoint, configured: isCloudConfigured() });
  }
});

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
