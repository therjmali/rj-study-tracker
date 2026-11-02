/**
 * Password hashing with scrypt (built into Node) — no native modules, no bcrypt
 * compile step. Parameters are stored *inside* the hash string so they can be
 * raised later without invalidating existing accounts.
 */
import crypto from 'node:crypto';
import { timingSafeEqualStr } from './util.mjs';

const N = 1 << 15; // 32768 — ~120 ms on a small VPS, far too slow to brute-force at scale
const r = 8;
const p = 1;
const KEYLEN = 64;
// scrypt needs ~128·N·r bytes (≈33 MB here); Node's default cap is 32 MB.
const MAXMEM = 128 * 1024 * 1024;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, { N, r, p, maxmem: MAXMEM });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, rr, pp, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(String(password), salt, expected.length, {
      N: Number(n), r: Number(rr), p: Number(pp), maxmem: MAXMEM,
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** A believable password policy, enforced on the server (the client mirrors it). */
export function passwordProblem(password) {
  const pw = String(password ?? '');
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 200) return 'Password is too long.';
  if (!/[a-zA-Z]/.test(pw)) return 'Password must contain at least one letter.';
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one number.';
  return null;
}

export function newRefreshToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export { timingSafeEqualStr };
