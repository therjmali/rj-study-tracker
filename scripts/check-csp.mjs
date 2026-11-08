/**
 * Post-build guard: fails the build if dist/index.html lost its Content-Security-Policy, if it
 * allows eval, or if the Supabase origin of this build is missing from connect-src.
 * Run automatically by `npm run build`; set VITE_CSP=off to skip (documented escape hatch).
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildCsp } from './csp.mjs';

if ((process.env.VITE_CSP || '').toLowerCase() === 'off') {
  console.log('check-csp: skipped (VITE_CSP=off)');
  process.exit(0);
}
const file = path.resolve('dist/index.html');
if (!fs.existsSync(file)) { console.error('check-csp: dist/index.html not found — run the build first'); process.exit(1); }
const html = fs.readFileSync(file, 'utf8');
const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/i.exec(html);
const fail = (msg) => { console.error(`check-csp: ${msg}`); process.exit(1); };
if (!m) fail('no Content-Security-Policy meta tag in dist/index.html');
const expected = buildCsp({ supabaseUrl: process.env.VITE_SUPABASE_URL || '' });
if (m[1] !== expected) fail(`policy differs from scripts/csp.mjs\n  found:    ${m[1]}\n  expected: ${expected}`);
if (/unsafe-eval/.test(m[1])) fail("policy must never contain 'unsafe-eval'");
if (/<script[^>]+src=["']https?:\/\//i.test(html)) fail('index.html loads a script from another origin');
console.log('check-csp: OK');
