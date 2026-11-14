/**
 * Pure helpers for the password-reset flow — no DOM, no Supabase — so they can be unit-tested with `node --test`.
 *
 * Supabase can hand a reset back to the app in three ways, and all three are understood:
 *   1. the default e-mail link → verify → redirect with `#access_token=…&refresh_token=…&type=recovery`
 *   2. our e-mail template's link → `?token_hash=…&type=recovery` (verified only when the student submits,
 *      so a mail scanner that "pre-clicks" links can never burn it)
 *   3. a 6-digit code typed into the app (no link, works on any device)
 */

export const CODE_MIN = 6;
export const CODE_MAX = 10;
export const RESEND_COOLDOWN_MS = 60_000;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt (used by Supabase Auth) ignores anything beyond 72 bytes and rejects longer input

const AUTH_KEYS = [
  'access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'provider_token',
  'provider_refresh_token', 'type', 'token_hash', 'token', 'code', 'error', 'error_code', 'error_description',
];

function toUrl(href) {
  try { return new URL(String(href ?? ''), 'https://app.invalid'); } catch { return null; }
}

function fragmentParams(url) {
  // Supabase appends `#a=b&c=d`; tolerate `#/?a=b` and `#?a=b` too.
  return new URLSearchParams(url.hash.replace(/^#\/?\??/, ''));
}

/** Friendly wording for the error Supabase puts in the address bar when a link is dead. */
function linkErrorMessage(code, description) {
  const c = String(code || '').toLowerCase();
  if (c === 'otp_expired' || /expired|invalid/i.test(description || '')) {
    return 'This reset link has expired or was already used. Some e-mail apps open links automatically, which uses them up. Request a new one — or type the 6-digit code from the e-mail instead.';
  }
  return String(description || '').trim() || 'This reset link could not be used. Request a new one.';
}

/**
 * Looks at a URL and says whether it carries a password-reset payload.
 * @returns {{kind:'none'}|{kind:'tokens',accessToken:string,refreshToken:string}|{kind:'token_hash',tokenHash:string}|{kind:'error',code:string,message:string}}
 */
export function parseRecoveryUrl(href) {
  const url = toUrl(href);
  if (!url) return { kind: 'none' };
  const hash = fragmentParams(url);
  const get = key => hash.get(key) ?? url.searchParams.get(key);

  const error = get('error');
  if (error && (get('error_code') || get('error_description'))) {
    const code = get('error_code') || error;
    return { kind: 'error', code, message: linkErrorMessage(code, get('error_description')) };
  }
  if (get('type') !== 'recovery') return { kind: 'none' };

  const accessToken = get('access_token');
  const refreshToken = get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };

  const tokenHash = get('token_hash');
  if (tokenHash) return { kind: 'token_hash', tokenHash };
  return { kind: 'none' };
}

/**
 * The same URL without any credential or error parameters, as a relative `path?search#hash`
 * (so the tokens never stay in the address bar, history or a shared screenshot).
 * Unrelated query parameters (e.g. GitHub Pages' `__p`) are kept.
 */
export function stripRecoveryParams(href) {
  const url = toUrl(href);
  if (!url) return '/';
  for (const key of AUTH_KEYS) url.searchParams.delete(key);
  const hash = fragmentParams(url);
  const hasAuthInHash = AUTH_KEYS.some(key => hash.has(key));
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ''}${hasAuthInHash ? '' : url.hash}`;
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? '').trim());
}

/** Keeps digits only (so "123 456", "123-456" and pasted text with newlines all work). */
export function normalizeCode(input) {
  return String(input ?? '').replace(/\D/g, '').slice(0, CODE_MAX);
}

export function isCodeComplete(code) {
  return normalizeCode(code).length >= CODE_MIN;
}

/** `null` when the password is acceptable, otherwise a sentence telling the student what to fix. */
export function passwordProblems(password) {
  const p = String(password ?? '');
  if (p.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (p.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Include at least one letter and one number.';
  return null;
}

export function passwordScore(password) {
  const p = String(password ?? '');
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  return { score, label: labels[Math.min(score, 5)] };
}

/** Milliseconds until another e-mail may be requested (0 = now). Tolerates a clock that moved backwards. */
export function resendRemainingMs(lastSentAtMs, nowMs, cooldownMs = RESEND_COOLDOWN_MS) {
  const last = Number(lastSentAtMs);
  if (!Number.isFinite(last) || last <= 0) return 0;
  const elapsed = Math.max(0, nowMs - last);
  return Math.max(0, Math.min(cooldownMs, cooldownMs - elapsed));
}

/**
 * Turns a Supabase Auth failure into a sentence a student can act on.
 * @param {{message?:string, code?:string, error_code?:string, status?:number}|null|undefined} err
 * @param {'request'|'verify'|'link'|'update'} step which call failed
 * @returns {{code:string, message:string}}
 */
export function mapResetError(err, step = 'request') {
  const e = err || {};
  const code = String(e.code || e.error_code || '');
  const status = Number(e.status) || 0;
  const text = `${code} ${String(e.message || '')}`.toLowerCase();

  if (status === 429 || /rate.?limit|too many|over_email_send_rate_limit|over_request_rate_limit/.test(text)) {
    return {
      code: 'rate_limited',
      message: step === 'request'
        ? 'Too many reset e-mails were requested. Wait a few minutes, then try again.'
        : 'Too many attempts. Wait a minute, then try again.',
    };
  }
  if (/email_address_not_authorized|email address not authorized/.test(text)) {
    return {
      code: 'email_not_authorized',
      message: 'Supabase\'s free built-in mailer only sends to the project team. Add a custom SMTP sender (Supabase → Authentication → SMTP Settings) so every account can receive reset e-mails.',
    };
  }
  if (/same_password|different from the old/.test(text)) {
    return { code: 'same_password', message: 'Your new password must be different from the old one.' };
  }
  if (/weak_password|weak|pwned|leaked|compromised|easy to guess/.test(text)) {
    return { code: 'weak_password', message: 'That password is too easy to guess or appears in a known data leak. Choose a different one.' };
  }
  if (step === 'update' && (status === 401 || status === 403 || /session|jwt|not.?authenticated|missing sub/.test(text))) {
    return { code: 'session_expired', message: 'Your reset session expired. Request a new code and try again.' };
  }
  if (step === 'link' && (status >= 400 || /expired|invalid|otp|token/.test(text))) {
    return { code: 'link_expired', message: 'This reset link has expired or was already used. Request a new one, or use the 6-digit code from the e-mail.' };
  }
  if (step === 'verify' && (status >= 400 || /expired|invalid|otp|token/.test(text))) {
    return { code: 'invalid_code', message: 'That code is wrong or has expired. Check the newest e-mail, or request a new code.' };
  }
  if (/signup|not allowed|user not found/.test(text) && step === 'request') {
    // Never reveal whether an address has an account.
    return { code: 'generic', message: 'We could not send the e-mail right now. Try again in a minute.' };
  }
  return { code: code || 'reset_failed', message: String(e.message || '').trim() || 'Something went wrong. Please try again.' };
}
