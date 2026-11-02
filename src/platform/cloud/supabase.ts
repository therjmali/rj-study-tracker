/**
 * The single Supabase client.
 *
 * supabase-js stores the session, refreshes the access token before it expires
 * and attaches it to every request. We only customise *where* the session is kept
 * so the existing “Keep me signed in” switch (sessionStorage vs localStorage) still works.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CloudConfigError, getSupabaseAnonKey, getSupabaseUrl, isCloudConfigured } from './config';
import { isEphemeral } from './session';

const authStorage = {
  getItem(key: string): string | null {
    try { return sessionStorage.getItem(key) ?? localStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string): void {
    try {
      if (isEphemeral()) { localStorage.removeItem(key); sessionStorage.setItem(key, value); }
      else { sessionStorage.removeItem(key); localStorage.setItem(key, value); }
    } catch { /* storage full / blocked — the in-memory session still works */ }
  },
  removeItem(key: string): void {
    try { sessionStorage.removeItem(key); localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!isCloudConfigured()) throw new CloudConfigError('Cloud sync is not set up in this build.');
  client = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'rj-supabase-auth-v1',
      storage: authStorage,
    },
  });
  return client;
}
