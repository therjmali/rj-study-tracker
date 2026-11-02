/**
 * Device identity for multi-device sync.
 *
 * A stable random id per installation (not per browser profile) lets the user
 * see "Riya's phone · last active 2 minutes ago" and sign a lost device out.
 */
import { isNativePlatform } from './config';

const KEY = 'rj-cloud-device-v1';

export interface DeviceIdentity {
  id: string;
  name: string;
  platform: string;
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `dev_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  } catch { /* ignore */ }
  return `dev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function detectPlatform(): string {
  if (isNativePlatform()) return 'android';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/android/i.test(ua)) return 'android-web';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios-web';
  if (/macintosh|mac os x/i.test(ua)) return 'macos';
  if (/windows/i.test(ua)) return 'windows';
  if (/linux/i.test(ua)) return 'linux';
  return 'web';
}

function detectName(): string {
  const platform = detectPlatform();
  const base = platform === 'android' ? 'Android device'
    : platform === 'android-web' ? 'Android browser'
      : platform === 'ios-web' ? 'iPhone / iPad'
        : platform === 'macos' ? 'Mac'
          : platform === 'windows' ? 'Windows PC'
            : platform === 'linux' ? 'Linux device'
              : 'This device';
  let browser = '';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return browser ? `${base} · ${browser}` : base;
}

let cached: DeviceIdentity | null = null;

export function getDeviceIdentity(): DeviceIdentity {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.id === 'string' && parsed.id) {
        cached = {
          id: parsed.id,
          name: String(parsed.name || detectName()),
          platform: String(parsed.platform || detectPlatform()),
        };
        return cached;
      }
    }
  } catch { /* create a new identity */ }
  cached = { id: randomId(), name: detectName(), platform: detectPlatform() };
  try { localStorage.setItem(KEY, JSON.stringify(cached)); } catch { /* ignore */ }
  return cached;
}

export function renameDevice(name: string): DeviceIdentity {
  const current = getDeviceIdentity();
  cached = { ...current, name: name.trim().slice(0, 60) || detectName() };
  try { localStorage.setItem(KEY, JSON.stringify(cached)); } catch { /* ignore */ }
  window.dispatchEvent(new Event('rj:device-renamed'));
  return cached;
}
