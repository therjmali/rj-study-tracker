/**
 * Account facade.
 *
 * The app talks to `useAuth()` and gets a `LocalUser`; underneath that there is
 * now a real cloud account (email + password, hosted on the student's own sync
 * server) instead of a name stored on one device. Guest mode is unchanged: the
 * app stays fully usable offline with no account at all.
 */
import { useCallback } from 'react';
import {
  CloudUser, getSession, setSession,
} from './cloud/session';
import {
  getCloudAuthState, refreshAccount as refreshAccountRemote, signIn as cloudSignIn,
  signOut as cloudSignOut, signUp as cloudSignUp, updateAccountProfile, useCloudAuth,
} from './cloud/authStore';
import { detachCloudAccount } from './cloud/syncEngine';

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

/** Open the premium sign-in / sign-up screen from anywhere in the app. */
export const OPEN_AUTH_EVENT = 'rj:open-auth';
/** Kept for the legacy display-name sheet. */
export const OPEN_PROFILE_SETUP_EVENT = 'rj:open-profile-setup';

export type AuthMode = 'signin' | 'signup';

export function openAuth(mode: AuthMode = 'signin'): void {
  window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT, { detail: { mode } }));
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function toLocalUser(user: CloudUser): LocalUser {
  const { firstName, lastName } = splitName(user.name || user.email.split('@')[0]);
  return {
    id: user.id,
    email: user.email,
    name: user.name || `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    image: user.avatar || undefined,
    coverGradient: user.coverGradient,
  };
}

/** Legacy local profile, used to prefill the display-name sheet and reports. */
export function getStoredProfile(): StoredProfile | null {
  const session = getSession();
  if (session?.user) {
    const { firstName, lastName } = splitName(session.user.name || '');
    return {
      firstName,
      lastName,
      email: session.user.email,
      createdAt: session.signedInAt,
      signedIn: true,
    };
  }
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

/**
 * Save the display name. When signed in this also updates the account (so the
 * new name reaches every device); offline it is queued on this device only.
 */
export function saveProfile(input: { firstName: string; lastName?: string; email?: string }): void {
  const prev = getStoredProfile();
  const next: StoredProfile = {
    firstName: input.firstName.trim(),
    lastName: (input.lastName ?? '').trim(),
    email: (input.email ?? '').trim(),
    createdAt: prev?.createdAt ?? new Date().toISOString(),
    signedIn: true,
  };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }

  const session = getSession();
  if (session) {
    const fullName = `${next.firstName} ${next.lastName}`.trim();
    if (fullName && fullName !== session.user.name) {
      setSession({ ...session, user: { ...session.user, name: fullName } });
      void updateAccountProfile({ name: fullName }).catch(() => { /* retried on next profile edit */ });
    }
  }
  window.dispatchEvent(new Event(CHANGE));
}

export interface AuthApi {
  user: LocalUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  cloud: ReturnType<typeof useCloudAuth>;
  loginWithRedirect: (opts?: { mode?: AuthMode; redirectUrl?: string }) => void;
  logout: () => Promise<void>;
  signIn: (input: { email: string; password: string }) => Promise<CloudUser>;
  signUp: (input: { email: string; password: string; name: string }) => Promise<CloudUser>;
  refreshAccount: () => Promise<void>;
}

export function useAuth(): AuthApi {
  const cloud = useCloudAuth();
  const user = cloud.user ? toLocalUser(cloud.user) : null;

  const loginWithRedirect = useCallback((opts?: { mode?: AuthMode; redirectUrl?: string }) => {
    openAuth(opts?.mode ?? 'signin');
  }, []);

  const logout = useCallback(async () => {
    await detachCloudAccount();
    await cloudSignOut();
    try { localStorage.removeItem('nursetrack-was-authenticated'); } catch { /* ignore */ }
  }, []);

  const signIn = useCallback(async (input: { email: string; password: string }) => {
    const user = await cloudSignIn(input);
    try { localStorage.setItem('nursetrack-was-authenticated', 'true'); } catch { /* ignore */ }
    return user;
  }, []);

  const signUp = useCallback(async (input: { email: string; password: string; name: string }) => {
    const user = await cloudSignUp(input);
    try { localStorage.setItem('nursetrack-was-authenticated', 'true'); } catch { /* ignore */ }
    return user;
  }, []);

  return {
    user,
    isLoading: cloud.status === 'loading',
    isAuthenticated: !!user,
    isGuest: !user,
    cloud,
    loginWithRedirect,
    logout,
    signIn,
    signUp,
    refreshAccount: async () => { await refreshAccountRemote(); },
  };
}

export { getCloudAuthState };
