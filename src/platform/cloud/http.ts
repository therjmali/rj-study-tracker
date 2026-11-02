/**
 * Typed cloud errors + translation of Supabase/PostgREST failures.
 * (The old hand-rolled fetch/refresh layer is gone: supabase-js does that now.)
 */
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

interface SupabaseLikeError {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

const OFFLINE_MESSAGE = 'You appear to be offline — your data is safe on this device.';

export function toCloudError(err: unknown): CloudError {
  if (err instanceof CloudError) return err;
  const e = (err ?? {}) as SupabaseLikeError;
  const message = String(e.message ?? '');
  const offline = (typeof navigator !== 'undefined' && navigator.onLine === false)
    || /failed to fetch|networkerror|network request failed|load failed|fetch failed|retryable/i.test(`${e.name ?? ''} ${message}`)
    || e.status === 0;
  if (offline) return new CloudError(OFFLINE_MESSAGE, 'offline', 0);
  if (/abort|timed? ?out/i.test(`${e.name ?? ''} ${message}`)) return new CloudError('The server took too long to answer.', 'timeout', 0);
  if (e.status === 401 || e.status === 403 || e.code === '28000' || e.code === 'PGRST301' || /not_authenticated|jwt/i.test(message)) {
    return new CloudError('Your session expired. Please sign in again.', 'session_expired', 401);
  }
  if (e.code === 'P0002' || /revision_not_found/.test(message)) {
    return new CloudError('That restore point is no longer available.', 'revision_not_found', 404);
  }
  if (e.status === 429) return new CloudError('Too many attempts. Wait a minute and try again.', 'rate_limited', 429);
  return new CloudError(message || 'Request failed.', e.code || 'request_failed', e.status ?? 500);
}
