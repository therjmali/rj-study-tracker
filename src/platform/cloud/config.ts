/**
 * Cloud configuration (Supabase).
 *
 * The project URL and the *anon (public)* key are baked in at build time from
 * `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. The anon key is designed to be
 * public — it grants nothing by itself; Row-Level Security in `supabase/schema.sql`
 * is what keeps each user's rows private. NEVER put the `service_role` key here.
 */
import { Capacitor } from '@capacitor/core';

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

function env(name: string): string {
  try {
    const e = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return String(e?.[name] ?? '').trim();
  } catch { return ''; }
}

export function getSupabaseUrl(): string {
  return env('VITE_SUPABASE_URL').replace(/\/+$/, '');
}

export function getSupabaseAnonKey(): string {
  return env('VITE_SUPABASE_ANON_KEY');
}

/** Kept for callers that show "which server am I on?" — now the Supabase project URL. */
export function getCloudEndpoint(): string {
  return getSupabaseUrl();
}

export function isCloudConfigured(): boolean {
  return /^https:\/\//i.test(getSupabaseUrl()) && getSupabaseAnonKey().length > 20;
}

export interface ServerProbe {
  ok: boolean;
  error?: string;
}

/** Lightweight reachability check (also detects a paused free-tier project). */
export async function probeServer(): Promise<ServerProbe> {
  if (!isCloudConfigured()) return { ok: false, error: 'This build has no Supabase project configured.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${getSupabaseUrl()}/auth/v1/health`, {
      signal: controller.signal,
      headers: { apikey: getSupabaseAnonKey() },
    });
    return res.ok ? { ok: true } : { ok: false, error: `Cloud answered ${res.status}.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: /abort/i.test(message) ? 'Cloud did not respond in time.' : 'Could not reach the cloud.' };
  } finally {
    clearTimeout(timer);
  }
}
