import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRecoveryUrl, stripRecoveryParams, normalizeCode, isCodeComplete, passwordProblems, passwordScore,
  resendRemainingMs, mapResetError, isValidEmail, RESEND_COOLDOWN_MS,
} from '../src/platform/cloud/recoveryLogic.mjs';

const BASE = 'https://therjmali.github.io/rj-study-tracker/';

test('implicit-flow link: tokens in the fragment are recognised', () => {
  const r = parseRecoveryUrl(`${BASE}#access_token=AAA.BBB.CCC&expires_at=1&expires_in=3600&refresh_token=rrr&token_type=bearer&type=recovery`);
  assert.deepEqual(r, { kind: 'tokens', accessToken: 'AAA.BBB.CCC', refreshToken: 'rrr' });
});

test('template link: token_hash in the query is recognised', () => {
  assert.deepEqual(parseRecoveryUrl(`${BASE}?token_hash=abc123&type=recovery`), { kind: 'token_hash', tokenHash: 'abc123' });
});

test('only recovery payloads are claimed — other auth types and plain URLs are left alone', () => {
  assert.equal(parseRecoveryUrl(`${BASE}#access_token=a&refresh_token=b&type=signup`).kind, 'none');
  assert.equal(parseRecoveryUrl(`${BASE}?token_hash=abc&type=magiclink`).kind, 'none');
  assert.equal(parseRecoveryUrl(`${BASE}?tab=settings`).kind, 'none');
  assert.equal(parseRecoveryUrl(BASE).kind, 'none');
  assert.equal(parseRecoveryUrl('not a url at all').kind, 'none');
  assert.equal(parseRecoveryUrl(undefined).kind, 'none');
  assert.equal(parseRecoveryUrl(`${BASE}#access_token=a&type=recovery`).kind, 'none'); // refresh token missing
});

test('expired / used link: friendly error, whichever place Supabase put it', () => {
  const hash = parseRecoveryUrl(`${BASE}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  assert.equal(hash.kind, 'error');
  assert.equal(hash.code, 'otp_expired');
  assert.match(hash.message, /expired or was already used/);
  const query = parseRecoveryUrl(`${BASE}?error=access_denied&error_code=otp_expired&error_description=x`);
  assert.equal(query.kind, 'error');
  assert.equal(parseRecoveryUrl(`${BASE}?error=boom`).kind, 'none'); // an unrelated "error" param is not ours
});

test('stripRecoveryParams removes every credential but keeps unrelated parameters', () => {
  assert.equal(stripRecoveryParams(`${BASE}#access_token=a&refresh_token=b&type=recovery`), '/rj-study-tracker/');
  assert.equal(stripRecoveryParams(`${BASE}?token_hash=abc&type=recovery`), '/rj-study-tracker/');
  assert.equal(stripRecoveryParams(`${BASE}?__p=foo&token_hash=abc&type=recovery`), '/rj-study-tracker/?__p=foo');
  assert.equal(stripRecoveryParams(`${BASE}?x=1#section`), '/rj-study-tracker/?x=1#section');
  assert.equal(stripRecoveryParams(`${BASE}#error=access_denied&error_code=otp_expired`), '/rj-study-tracker/');
  assert.equal(stripRecoveryParams(''), '/');
});

test('code input: digits only, capped, complete from 6 digits', () => {
  assert.equal(normalizeCode(' 123 456\n'), '123456');
  assert.equal(normalizeCode('12-34-56'), '123456');
  assert.equal(normalizeCode('abc'), '');
  assert.equal(normalizeCode('12345678901234'), '1234567890');
  assert.equal(normalizeCode(null), '');
  assert.equal(isCodeComplete('12345'), false);
  assert.equal(isCodeComplete('123 456'), true);
  assert.equal(isCodeComplete('12345678'), true);
});

test('password rules match the sign-up rules and bcrypt\'s 72-byte limit', () => {
  assert.match(passwordProblems('short1'), /at least 8/);
  assert.match(passwordProblems('onlyletters'), /letter and one number/);
  assert.match(passwordProblems('12345678'), /letter and one number/);
  assert.equal(passwordProblems('Valid1234'), null);
  assert.match(passwordProblems(`a1${'x'.repeat(80)}`), /at most 72/);
  assert.equal(passwordScore('').score, 0);
  assert.equal(passwordScore('Abcdefg1!xyz').label, 'Excellent');
});

test('resend cooldown counts down, never exceeds the cooldown, ignores garbage and clock skew', () => {
  const now = 1_800_000_000_000;
  assert.equal(resendRemainingMs(0, now), 0);
  assert.equal(resendRemainingMs(NaN, now), 0);
  assert.equal(resendRemainingMs(now - 10_000, now), RESEND_COOLDOWN_MS - 10_000);
  assert.equal(resendRemainingMs(now - RESEND_COOLDOWN_MS, now), 0);
  assert.equal(resendRemainingMs(now + 5 * 60_000, now), RESEND_COOLDOWN_MS); // clock moved backwards: wait one cooldown, not 5 minutes
});

test('email validation', () => {
  assert.equal(isValidEmail('rana@example.com'), true);
  assert.equal(isValidEmail(' rana@example.com '), true);
  assert.equal(isValidEmail('rana@example'), false);
  assert.equal(isValidEmail(''), false);
});

test('error mapping: every failure becomes an actionable sentence', () => {
  assert.equal(mapResetError({ status: 429, message: 'email rate limit exceeded' }, 'request').code, 'rate_limited');
  assert.match(mapResetError({ code: 'over_email_send_rate_limit' }, 'request').message, /few minutes/);
  assert.match(mapResetError({ code: 'over_request_rate_limit', status: 429 }, 'verify').message, /Wait a minute/);
  assert.equal(mapResetError({ code: 'email_address_not_authorized', message: 'Email address not authorized' }, 'request').code, 'email_not_authorized');
  assert.match(mapResetError({ code: 'email_address_not_authorized' }, 'request').message, /SMTP/);
  assert.equal(mapResetError({ code: 'same_password', status: 422, message: 'New password should be different from the old password.' }, 'update').code, 'same_password');
  assert.equal(mapResetError({ code: 'weak_password', message: 'Password is known to be weak and easy to guess' }, 'update').code, 'weak_password');
  assert.equal(mapResetError({ status: 401, message: 'Auth session missing!' }, 'update').code, 'session_expired');
  assert.equal(mapResetError({ status: 403, code: 'otp_expired', message: 'Email link is invalid or has expired' }, 'link').code, 'link_expired');
  assert.equal(mapResetError({ status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' }, 'verify').code, 'invalid_code');
  assert.equal(mapResetError(null, 'request').message, 'Something went wrong. Please try again.');
  assert.equal(mapResetError({ message: 'Weird server text' }, 'update').message, 'Weird server text');
});
