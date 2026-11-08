/**
 * Content-Security-Policy for the built app (shared by vite.config.ts and scripts/check-csp.mjs).
 *
 * Why it looks the way it does:
 *  • connect-src is an ALLOW-LIST: even if some script ever ran in the page, it could not send the
 *    sign-in session or the AI keys to an unknown server. Only Supabase and the three AI providers
 *    (plus same-origin / blob / data for attachments and report previews) are reachable.
 *  • script-src still allows 'unsafe-inline' on purpose: the PDF/print page is a blob: document that
 *    inherits this policy and ships an inline "Save as PDF" button + auto-print script, and Capacitor
 *    may inject its bridge as an inline script on older WebViews. It does block remote script hosts and eval.
 *  • No `default-src`: images, fonts, media and styles stay unrestricted so user content
 *    (remote subject icons, Google Fonts inside printed reports) keeps working.
 */
export const AI_HOSTS = [
  'https://api.anthropic.com',
  'https://api.openai.com',
  'https://generativelanguage.googleapis.com',
];

export function buildCsp({ supabaseUrl = '' } = {}) {
  const connect = ["'self'", 'blob:', 'data:', ...AI_HOSTS];
  try {
    const u = new URL(String(supabaseUrl).trim());
    if (u.protocol === 'https:') connect.push(u.origin, `wss://${u.host}`);
  } catch { /* guest-only build: no cloud origin */ }
  return [
    "script-src 'self' 'unsafe-inline'",
    `connect-src ${connect.join(' ')}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
