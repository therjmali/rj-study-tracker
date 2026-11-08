/**
 * Pure connectivity + status-pill logic (no DOM, no React) so it can be unit-tested with `node --test`.
 * connectivity.ts owns the browser side effects; ConnectionStatusPill.tsx only renders what derivePill() says.
 */

/** Re-check delays while the cloud is unreachable (ms): quick first retry, then back off to save battery. */
export const BACKOFF_MS = [3000, 6000, 12000, 24000, 30000];
/** While online and signed in, re-verify that the cloud really answers this often (ms). */
export const ONLINE_RECHECK_MS = 45000;
/** One failed probe is a blip; two in a row means "cloud unreachable". */
export const DEGRADED_AFTER_FAILURES = 2;
/** How long the green "Back online" confirmation stays on the pill (ms). */
export const RECONNECTED_FLASH_MS = 3000;

export function retryDelay(attempt) {
  const i = Math.max(0, Math.min(BACKOFF_MS.length - 1, Math.floor(Number(attempt) || 0)));
  return BACKOFF_MS[i];
}

/**
 * online   – the device has a network and (when we check) the cloud answers
 * degraded – the device says it is online but the cloud does not answer (captive portal, outage, paused project)
 * offline  – the device has no network
 * probeOk: true/false when the cloud was probed, null when no probe applies (guest / not configured).
 */
export function resolveStatus({ navigatorOnline, probeOk, failures }) {
  if (navigatorOnline === false) return 'offline';
  if (probeOk === false && failures >= DEGRADED_AFTER_FAILURES) return 'degraded';
  return 'online';
}

export function formatAgo(thenMs, nowMs) {
  if (!thenMs || !Number.isFinite(thenMs)) return '';
  const s = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Decides what the header status pill shows. Priority (first match wins):
 * back-online flash → offline → local (no account) → cloud unreachable → error → syncing → paused → pending → synced → ready
 *
 * input: { signedIn, status, phase, pendingCount, lastSyncAtMs, nowMs, reconnectedAtMs }
 * returns: { kind, tone: 'neutral'|'ok'|'info'|'warn'|'danger', label, detail, busy }
 */
export function derivePill(input) {
  const {
    signedIn = false, status = 'online', phase = 'idle', pendingCount = 0,
    lastSyncAtMs = null, nowMs = Date.now(), reconnectedAtMs = null,
  } = input || {};

  if (status === 'online' && reconnectedAtMs && nowMs - reconnectedAtMs >= 0 && nowMs - reconnectedAtMs < RECONNECTED_FLASH_MS) {
    return { kind: 'reconnected', tone: 'ok', label: 'Back online', detail: signedIn ? 'Syncing your changes…' : 'Connected', busy: false };
  }
  if (status === 'offline') {
    const detail = signedIn && pendingCount > 0
      ? `${plural(pendingCount, 'change')} will sync when you're back`
      : 'Everything is saved on this device';
    return { kind: 'offline', tone: 'warn', label: 'Offline', detail, busy: false };
  }
  if (!signedIn) {
    return { kind: 'local', tone: 'neutral', label: 'Local', detail: 'Saved on this device', busy: false };
  }
  if (status === 'degraded') {
    const detail = pendingCount > 0 ? `${plural(pendingCount, 'change')} saved locally · retrying` : 'Saved locally · retrying';
    return { kind: 'degraded', tone: 'warn', label: 'Cloud unreachable', detail, busy: true };
  }
  if (phase === 'error') return { kind: 'error', tone: 'danger', label: 'Needs attention', detail: 'Tap to review sync', busy: false };
  if (phase === 'syncing') {
    return { kind: 'syncing', tone: 'info', label: 'Syncing', detail: pendingCount > 0 ? plural(pendingCount, 'change') : 'Updating your cloud copy', busy: true };
  }
  if (phase === 'paused') return { kind: 'paused', tone: 'neutral', label: 'Auto-sync off', detail: 'Tap to sync manually', busy: false };
  if (phase === 'pending' || pendingCount > 0) {
    return { kind: 'pending', tone: 'info', label: pendingCount > 0 ? `${pendingCount} to sync` : 'Pending', detail: 'Saved on this device', busy: false };
  }
  if (lastSyncAtMs) return { kind: 'synced', tone: 'ok', label: 'Synced', detail: formatAgo(lastSyncAtMs, nowMs), busy: false };
  return { kind: 'ready', tone: 'neutral', label: 'Ready', detail: 'Cloud sync is on', busy: false };
}
