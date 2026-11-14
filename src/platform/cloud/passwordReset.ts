/**
 * Password reset (forgot password) on Supabase Auth.
 *
 *   request → e-mail with a 6-digit code AND a link → verify → choose a new password → signed in.
 *
 * Works the same in the browser/PWA and in the Android APK. The APK is served from https://localhost, which can
 * never be an e-mail link target, so the link always points at the public web app and the typed code is the
 * in-app path. Nothing here reveals whether an e-mail address has an account.
 */
import type { Session } from '@supabase/supabase-js';
import { CloudError, toCloudError } from './http';
import { isCloudConfigured, isNativePlatform } from './config';
import { getSession, setEphemeralSession } from './session';
import { clearSupabaseSession, getSupabase } from './supabase';
import {
  isCodeComplete, isValidEmail, mapResetError, normalizeCode, parseRecoveryUrl, passwordProblems,
  resendRemainingMs, stripRecoveryParams, type ParsedRecovery, type ResetStep,
} from './recoveryLogic.mjs';

export type { ParsedRecovery };

export const OPEN_PASSWORD_RESET_EVENT = 'rj:open-password-reset';
export const RECOVERY_INCOMING_EVENT = 'rj:recovery-incoming';

const LAST_SENT_KEY = 'rj-reset-last-sent-v1';
const DEFAULT_PUBLIC_URL = 'https://therjmali.github.io/rj-study-tracker/';

function envPublicUrl(): string {
  try {
    const e = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return String(e?.VITE_PUBLIC_APP_URL ?? '').trim();
  } catch { return ''; }
}

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Where the e-mailed link brings the student back to. It must be listed under Supabase →
 * Authentication → URL Configuration → Redirect URLs (see SUPABASE_SETUP.md).
 */
export function getResetRedirectUrl(): string {
  const configured = envPublicUrl();
  if (configured) return withTrailingSlash(configured);
  if (isNativePlatform()) return DEFAULT_PUBLIC_URL;
  try { return withTrailingSlash(`${window.location.origin}${import.meta.env.BASE_URL}`); } catch { return DEFAULT_PUBLIC_URL; }
}

function toResetError(err: unknown, step: ResetStep): CloudError {
  const base = toCloudError(err);
  if (base.code === 'offline' || base.code === 'timeout') return base;
  const e = (err ?? {}) as { status?: number };
  const mapped = mapResetError(err as Parameters<typeof mapResetError>[0], step);
  return new CloudError(mapped.message, mapped.code, e.status ?? 0);
}

/* ── incoming reset links ────────────────────────────────────────────── */

let incoming: ParsedRecovery | null = null;

/**
 * Called once, before React mounts. If the address carries a reset link (or a dead-link error) it is stashed in memory and
 * removed from the address bar immediately, so tokens never linger in history or the router.
 */
export function captureRecoveryFromLocation(): void {
  try {
    const parsed = parseRecoveryUrl(window.location.href);
    if (parsed.kind === 'none') return;
    incoming = parsed;
    window.history.replaceState(window.history.state, '', stripRecoveryParams(window.location.href));
    window.dispatchEvent(new Event(RECOVERY_INCOMING_EVENT));
  } catch { /* never block the app from starting */ }
}

export function consumeIncomingRecovery(): ParsedRecovery | null {
  const value = incoming;
  incoming = null;
  return value;
}

/** Any screen can open the reset flow (e.g. the sign-in screen's "Forgot password?"). */
export function openPasswordReset(options: { email?: string } = {}): void {
  window.dispatchEvent(new CustomEvent(OPEN_PASSWORD_RESET_EVENT, { detail: options }));
}

/* ── the reset itself ────────────────────────────────────────────────── */

type Pending =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'token_hash'; tokenHash: string }
  | { kind: 'session' }
  | null;

let pending: Pending = null;

/** Remember a link payload until the student has typed a new password (nothing is verified or stored before that). */
export function holdRecovery(payload: ParsedRecovery): void {
  if (payload.kind === 'tokens') pending = { kind: 'tokens', accessToken: payload.accessToken, refreshToken: payload.refreshToken };
  else if (payload.kind === 'token_hash') pending = { kind: 'token_hash', tokenHash: payload.tokenHash };
}

function readLastSent(): { email: string; at: number } | null {
  try {
    const raw = localStorage.getItem(LAST_SENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string; at?: number };
    return parsed && typeof parsed.email === 'string' ? { email: parsed.email, at: Number(parsed.at) || 0 } : null;
  } catch { return null; }
}

/** Milliseconds before another e-mail may be requested for this address (survives closing the app). */
export function getResendRemainingMs(email: string): number {
  const last = readLastSent();
  if (!last || last.email !== email.trim().toLowerCase()) return 0;
  return resendRemainingMs(last.at, Date.now());
}

function markSent(email: string): void {
  try { localStorage.setItem(LAST_SENT_KEY, JSON.stringify({ email: email.trim().toLowerCase(), at: Date.now() })); } catch { /* ignore */ }
}

/** Step 1 — ask Supabase to e-mail a code and a link. Succeeds the same way for unknown addresses. */
export async function requestPasswordReset(email: string): Promise<void> {
  const clean = email.trim();
  if (!isCloudConfigured()) throw new CloudError('Cloud accounts are not set up in this build.', 'not_configured', 0);
  if (!isValidEmail(clean)) throw new CloudError('Enter a valid email address.', 'invalid_email', 400);
  const wait = getResendRemainingMs(clean);
  if (wait > 0) {
    throw new CloudError(`Please wait ${Math.ceil(wait / 1000)} s before requesting another e-mail.`, 'cooldown', 429);
  }
  try {
    const { error } = await getSupabase().auth.resetPasswordForEmail(clean, { redirectTo: getResetRedirectUrl() });
    if (error) throw error;
  } catch (err) {
    throw toResetError(err, 'request');
  }
  markSent(clean);
}

/** Step 2 (code path) — check the typed code right away so a typo is caught before choosing a password. */
export async function verifyResetCode(email: string, code: string): Promise<void> {
  const token = normalizeCode(code);
  if (!isCodeComplete(token)) throw new CloudError('Enter the code from the e-mail.', 'invalid_code', 400);
  if (!isValidEmail(email)) throw new CloudError('Enter a valid email address.', 'invalid_email', 400);
  setEphemeralSession(false);
  try {
    const { data, error } = await getSupabase().auth.verifyOtp({ email: email.trim(), token, type: 'recovery' });
    if (error || !data.session) throw error ?? new Error('invalid otp');
  } catch (err) {
    throw toResetError(err, 'verify');
  }
  pending = { kind: 'session' };
}

/**
 * Step 3 — open the reset session (link paths verify here, only now) and store the new password.
 * Returns the account e-mail so the caller can sign in with the new password and prove it works.
 */
export async function finishPasswordReset(newPassword: string): Promise<{ email: string }> {
  const problem = passwordProblems(newPassword);
  if (problem) throw new CloudError(problem, 'weak_password', 422);
  const current = pending;
  if (!current) throw new CloudError('Your reset session expired. Request a new code and try again.', 'session_expired', 401);

  const sb = getSupabase();
  setEphemeralSession(false);
  let session: Session | null = null;
  try {
    if (current.kind === 'tokens') {
      const { data, error } = await sb.auth.setSession({ access_token: current.accessToken, refresh_token: current.refreshToken });
      if (error) throw error;
      session = data.session;
    } else if (current.kind === 'token_hash') {
      const { data, error } = await sb.auth.verifyOtp({ token_hash: current.tokenHash, type: 'recovery' });
      if (error) throw error;
      session = data.session;
    } else {
      session = (await sb.auth.getSession()).data.session;
    }
  } catch (err) {
    pending = null;
    throw toResetError(err, 'link');
  }
  const email = session?.user?.email;
  if (!session || !email) {
    pending = null;
    throw new CloudError('Your reset session expired. Request a new code and try again.', 'session_expired', 401);
  }
  pending = { kind: 'session' };       // a link can only be used once — a retry (e.g. "same password") reuses this session

  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw toResetError(error, 'update');
  pending = null;
  return { email };
}

/** After the new password works: end every other session (the old password may have been compromised). */
export async function revokeOtherSessions(): Promise<void> {
  try { await getSupabase().auth.signOut({ scope: 'others' }); } catch { /* best effort */ }
}

/** Abandon a reset: forget any link payload and, if the student never finished, drop the temporary reset session. */
export async function cancelRecovery(): Promise<void> {
  const was = pending;
  pending = null;
  if (was?.kind === 'session' && !getSession()) {
    try { await getSupabase().auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
    clearSupabaseSession();
  }
}
