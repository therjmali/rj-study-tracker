/**
 * Small shared helpers for the RJ Tracker sync server.
 *
 * Zero dependencies on purpose: the server must be deployable anywhere Node 20+
 * runs, including a tiny VPS, Render, Fly.io, Railway or a home Raspberry Pi.
 */
import crypto from 'node:crypto';

export const nowIso = () => new Date().toISOString();

/** Compact, URL-safe unique id. */
export function uid(prefix = '') {
  return `${prefix}${crypto.randomBytes(12).toString('hex')}`;
}

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(input) {
  const s = String(input).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s, 'base64').toString('utf8');
}

export function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Deterministic JSON — key order does not affect equality or hashes. */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

export function deepEqual(a, b) {
  if (a === b) return true;
  return canonical(a) === canonical(b);
}

/** Short stable content hash used to detect "this section changed". */
export function hashValue(value) {
  return sha256Hex(canonical(value)).slice(0, 24);
}

export function clampString(v, max) {
  const s = typeof v === 'string' ? v : '';
  return s.length > max ? s.slice(0, max) : s;
}

export function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Bearer-ish token signing: payload + HMAC-SHA256 → "payload.signature". */
export function signToken(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  if (!timingSafeEqualStr(sig, expected)) return null;
  try {
    const payload = JSON.parse(fromB64url(body));
    if (!payload || typeof payload !== 'object') return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
