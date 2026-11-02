/**
 * Cloud endpoint resolution.
 *
 * Priority:
 *   1. A runtime override saved on this device (Settings → Cloud → Server URL).
 *      This is what makes a single APK work against any self-hosted server.
 *   2. The build-time `VITE_CLOUD_URL`.
 *   3. `/api` — correct for the web app when a reverse proxy maps it to the
 *      sync server (the Vite dev server does this automatically).
 *
 * A relative endpoint can never work inside the Android APK (the origin is
 * `https://localhost`), so `isCloudConfigured()` reports that honestly instead
 * of failing with a confusing network error.
 */
import { Capacitor } from '@capacitor/core';

const ENDPOINT_KEY = 'rj-cloud-endpoint-v1';
const PROBE_TIMEOUT_MS = 8000;

export class CloudConfigError extends Error {
  code = 'not_configured';
  constructor(message: string) {
    super(message);
    this.name = 'CloudConfigError';
  }
}

export function isNativePlatform(): boolean {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

function envEndpoint(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return String(env?.VITE_CLOUD_URL ?? '').trim();
  } catch { return ''; }
}

export function normalizeEndpoint(raw: string): string {
  let value = String(raw ?? '').trim();
  if (!value) return '';
  if (value.startsWith('/')) return value.replace(/\/+$/, '') || '/api';
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    // Allow a bare origin or a path prefix (e.g. https://sync.example.com/api).
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '';
  }
}

export function getStoredEndpoint(): string {
  try { return localStorage.getItem(ENDPOINT_KEY) ?? ''; } catch { return ''; }
}

export function setCloudEndpoint(raw: string | null): void {
  try {
    if (!raw) localStorage.removeItem(ENDPOINT_KEY);
    else localStorage.setItem(ENDPOINT_KEY, normalizeEndpoint(raw));
  } catch { /* ignore */ }
  window.dispatchEvent(new Event('rj:cloud-endpoint-changed'));
}

export function getCloudEndpoint(): string {
  const stored = getStoredEndpoint();
  if (stored) return stored;
  const env = envEndpoint();
  if (env) return normalizeEndpoint(env) || '/api';
  return '/api';
}

/** True when the endpoint is a real URL for this platform. */
export function isCloudConfigured(): boolean {
  const endpoint = getCloudEndpoint();
  if (!endpoint) return false;
  if (endpoint.startsWith('/')) return !isNativePlatform();
  return true;
}

export function absoluteUrl(path: string): string {
  const endpoint = getCloudEndpoint();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  if (/^https?:\/\//i.test(endpoint)) return `${endpoint}${suffix}`;
  return `${endpoint}${suffix}`;
}

export interface ServerProbe {
  ok: boolean;
  service?: string;
  accounts?: number;
  version?: number;
  error?: string;
}

/** Lightweight connectivity + identity check used by the sign-in screen. */
export async function probeServer(endpointOverride?: string): Promise<ServerProbe> {
  const endpoint = normalizeEndpoint(endpointOverride ?? getCloudEndpoint());
  if (!endpoint) return { ok: false, error: 'No sync server address.' };
  if (endpoint.startsWith('/') && isNativePlatform()) {
    return { ok: false, error: 'The app needs a full https:// address for your sync server.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${endpoint}/healthz`, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return { ok: false, error: `Server answered ${res.status}.` };
    const data = await res.json();
    if (!data || data.service !== 'rj-sync') {
      return { ok: false, error: 'That address is not an RJ Tracker sync server.' };
    }
    return { ok: true, service: data.service, accounts: data.accounts, version: data.version };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: /abort/i.test(message) ? 'Server did not respond in time.' : 'Could not reach the server.' };
  } finally {
    clearTimeout(timer);
  }
}

export const ENDPOINT_STORAGE_KEY = ENDPOINT_KEY;
