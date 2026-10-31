/**
 * Local profile — replaces hosted sign-in.
 *
 * There are no accounts and no passwords: the "profile" is just a display name
 * (and optional email) kept on this device. Signing out hides the profile but never
 * deletes study data.
 */
import { useCallback, useSyncExternalStore } from 'react';

export interface LocalUser {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  image?: string;
  coverGradient?: string;
}

interface StoredProfile {
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  signedIn: boolean;
}

const KEY = 'rj-local-profile-v1';
const CHANGE = 'rj:profile-changed';
export const OPEN_PROFILE_SETUP_EVENT = 'rj:open-profile-setup';

let snapshot: LocalUser | null | undefined;
let lastRaw: string | null = null;

function read(): StoredProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return null;
    return {
      firstName: String(p.firstName ?? ''),
      lastName: String(p.lastName ?? ''),
      email: String(p.email ?? ''),
      createdAt: String(p.createdAt ?? new Date().toISOString()),
      signedIn: p.signedIn !== false,
    };
  } catch {
    return null;
  }
}

function toUser(p: StoredProfile): LocalUser {
  const name = `${p.firstName} ${p.lastName}`.trim() || 'Student';
  return {
    id: 'local-user',
    email: p.email || 'student@this.device',
    name,
    firstName: p.firstName || 'Student',
    lastName: p.lastName,
  };
}

function getSnapshot(): LocalUser | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (snapshot !== undefined && raw === lastRaw) return snapshot;
  lastRaw = raw;
  const p = read();
  snapshot = p && p.signedIn ? toUser(p) : null;
  return snapshot;
}

function emit() {
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE, cb);
  return () => window.removeEventListener(CHANGE, cb);
}

export function getStoredProfile(): StoredProfile | null {
  return read();
}

export function saveProfile(input: { firstName: string; lastName?: string; email?: string }) {
  const prev = read();
  const next: StoredProfile = {
    firstName: input.firstName.trim(),
    lastName: (input.lastName ?? '').trim(),
    email: (input.email ?? '').trim(),
    createdAt: prev?.createdAt ?? new Date().toISOString(),
    signedIn: true,
  };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  emit();
}

export function useAuth() {
  const user = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const loginWithRedirect = useCallback((_opts?: { redirectUrl?: string }) => {
    const p = read();
    if (p && (p.firstName || p.email)) {
      // Returning student on this device: one tap, no form.
      try { localStorage.setItem(KEY, JSON.stringify({ ...p, signedIn: true })); } catch { /* ignore */ }
      emit();
      return;
    }
    window.dispatchEvent(new Event(OPEN_PROFILE_SETUP_EVENT));
  }, []);

  const logout = useCallback(async () => {
    const p = read();
    if (p) {
      try { localStorage.setItem(KEY, JSON.stringify({ ...p, signedIn: false })); } catch { /* ignore */ }
    }
    emit();
  }, []);

  return { user, isLoading: false, isAuthenticated: !!user, loginWithRedirect, logout };
}
