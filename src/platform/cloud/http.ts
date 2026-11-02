/**
 * Thin HTTP layer for the sync API.
 *
 * Responsibilities kept deliberately small:
 *  • attach the bearer token + device headers,
 *  • retry exactly once after refreshing an expired access token (single-flight,
 *    so ten parallel requests do not fire ten refreshes),
 *  • turn every failure into a typed `CloudError` the UI can explain,
 *  • time out instead of hanging the UI forever.
 */
import { getCloudEndpoint, CloudConfigError, isCloudConfigured } from './config';
import { getDeviceIdentity } from './device';
import { getSession, isSessionExpiringSoon, patchSession, setSession } from './session';

export class CloudError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  constructor(message: string, code = 'cloud_error', status = 0, details?: Record<string, unknown>) {
    super(message);
    this.name = 'CloudError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function endpointUrl(pathname: string, base?: string): string {
  const endpoint = base ?? getCloudEndpoint();
  if (!endpoint) throw new CloudConfigError('No sync server is configured.');
  return `${endpoint.replace(/\/+$/, '')}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const session = getSession();
  if (!session?.refreshToken) return false;
  if (refreshPromise) return refreshPromise;
  const device = getDeviceIdentity();
  refreshPromise = (async () => {
    try {
      const res = await fetch(endpointUrl('/v1/auth/refresh', session.endpoint), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken, deviceId: device.id, deviceName: device.name, devicePlatform: device.platform }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data?.token) return false;
      patchSession({
        user: data.user ?? session.user,
        token: data.token,
        refreshToken: data.refreshToken ?? session.refreshToken,
        tokenExpiresAt: Date.now() + (Number(data.expiresIn) || 1800) * 1000,
        deviceId: data.deviceId ?? device.id,
        endpoint: session.endpoint,
      });
      return true;
    } catch {
      return false;
    }
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
  /** Internal: prevents infinite refresh loops. */
  allowRefresh?: boolean;
  signal?: AbortSignal;
  endpoint?: string;
}

export async function request<T = unknown>(pathname: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = 25_000, allowRefresh = true, signal, endpoint } = options;
  if (!isCloudConfigured() && !endpoint) {
    throw new CloudConfigError('Cloud sync is not set up on this device yet.');
  }
  let session = getSession();
  if (auth) {
    if (!session?.token) throw new CloudError('Please sign in again.', 'unauthorized', 401);
    if (isSessionExpiringSoon() && allowRefresh) {
      const ok = await refreshSession();
      if (!ok) {
        setSession(null);
        throw new CloudError('Your session expired. Please sign in again.', 'session_expired', 401);
      }
      session = getSession();
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });

  const device = getDeviceIdentity();
  try {
    const res = await fetch(endpointUrl(pathname, endpoint), {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(auth && session ? { authorization: `Bearer ${session.token}` } : {}),
        'x-device-id': device.id,
        'x-device-name': device.name,
        'x-client': 'rj-tracker-app',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (res.status === 401 && auth && allowRefresh) {
      const ok = await refreshSession();
      if (ok) return request<T>(pathname, { ...options, allowRefresh: false });
      setSession(null);
      throw new CloudError('Your session expired. Please sign in again.', 'session_expired', 401);
    }

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
    }

    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
      if (res.status === 409) {
        throw new CloudError(err?.message || 'Version conflict.', 'version_conflict', 409, data as Record<string, unknown>);
      }
      const fallback = res.status === 404 || res.status === 405
        ? 'Cloud sync is not set up on this address yet. Add your sync server under “Sync server”.'
        : `Request failed (${res.status}).`;
      throw new CloudError(err?.message || fallback, err?.code || 'request_failed', res.status, (data as Record<string, unknown>) ?? undefined);
    }
    return data as T;
  } catch (err) {
    if (err instanceof CloudError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new CloudError('The server took too long to answer.', 'timeout', 0);
    }
    throw new CloudError('You appear to be offline — your data is safe on this device.', 'offline', 0);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}
