/**
 * Custom app icon.
 *
 * The student can upload their own picture (JPG / PNG / WebP, max 2 MB). It is cropped to a
 * square, stored on-device and used for: the header logo, the browser tab / bookmark icon,
 * the installed-app (PWA) icon manifest and — inside the Android APK — a pinned home-screen
 * shortcut with the custom icon.
 */
import { useSyncExternalStore } from 'react';

export const MAX_ICON_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_ICON_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const KEY = 'rj-app-icon-v1';
const EVENT = 'rj:app-icon-changed';

export interface AppIconData { dataUrl: string; updatedAt: number }
export interface CropState { zoom: number; x: number; y: number }

export class IconError extends Error {}

/* ───────────────────────────── store ───────────────────────────── */

let cached: AppIconData | null | undefined;
let raw: string | null = null;

export function getAppIcon(): AppIconData | null {
  let now: string | null = null;
  try { now = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (cached !== undefined && now === raw) return cached ?? null;
  raw = now;
  try {
    const p = now ? JSON.parse(now) : null;
    cached = p && typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:image/') ? p : null;
  } catch { cached = null; }
  return cached ?? null;
}

export function useAppIcon(): AppIconData | null {
  return useSyncExternalStore(
    cb => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); },
    getAppIcon,
    () => null,
  );
}

export function saveAppIcon(dataUrl: string): void {
  localStorage.setItem(KEY, JSON.stringify({ dataUrl, updatedAt: Date.now() } satisfies AppIconData));
  window.dispatchEvent(new Event(EVENT));
  applyAppIcon();
}

export function resetAppIcon(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
  applyAppIcon();
}

/* ───────────────────────────── image processing ───────────────────────────── */

export function validateIconFile(file: File): void {
  if (!ACCEPTED_ICON_TYPES.includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    throw new IconError('Please choose a JPG, PNG or WebP image.');
  }
  if (file.size > MAX_ICON_BYTES) {
    throw new IconError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the maximum is 2 MB.`);
  }
  if (file.size === 0) throw new IconError('That file is empty.');
}

export async function loadBitmap(file: File): Promise<ImageBitmap> {
  validateIconFile(file);
  try {
    const bmp = await createImageBitmap(file);
    if (Math.min(bmp.width, bmp.height) < 96) {
      bmp.close?.();
      throw new IconError('The image is too small — use at least 96 × 96 pixels.');
    }
    return bmp;
  } catch (e) {
    if (e instanceof IconError) throw e;
    throw new IconError('This image could not be read. Try a different file.');
  }
}

/** Draw the cropped square into a canvas of `size`. `rounded` adds a launcher-style mask. */
export function renderIcon(bmp: ImageBitmap, crop: CropState, size: number, shape: 'square' | 'rounded' = 'square'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new IconError('Your browser cannot process images.');

  const side = Math.min(bmp.width, bmp.height) / Math.max(1, crop.zoom);
  const maxX = (bmp.width - side) / 2;
  const maxY = (bmp.height - side) / 2;
  const sx = bmp.width / 2 - side / 2 + Math.max(-1, Math.min(1, crop.x)) * maxX;
  const sy = bmp.height / 2 - side / 2 + Math.max(-1, Math.min(1, crop.y)) * maxY;

  if (shape === 'rounded') {
    const r = size * 0.22;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, r);
    ctx.clip();
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, size, size);
  return canvas;
}

/* ───────────────────────────── applying it ───────────────────────────── */

const BASE = import.meta.env.BASE_URL;
let manifestUrl: string | null = null;

function setLink(rel: string, href: string, extra: Record<string, string> = {}) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]${extra.sizes ? `[sizes="${extra.sizes}"]` : ''}`);
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
  Object.entries(extra).forEach(([k, v]) => el!.setAttribute(k, v));
  el.href = href;
  if (extra.type === undefined) el.removeAttribute('type');
}

/** Update favicon, touch icon and the web-app manifest to match the current icon. */
export function applyAppIcon(): void {
  const icon = getAppIcon();
  if (!icon) {
    setLink('icon', `${BASE}icons/icon.svg`, { type: 'image/svg+xml' });
    setLink('apple-touch-icon', `${BASE}icons/apple-touch-icon.png`);
    const m = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (m) m.href = `${BASE}manifest.webmanifest`;
    if (manifestUrl) { URL.revokeObjectURL(manifestUrl); manifestUrl = null; }
    return;
  }
  setLink('icon', icon.dataUrl, { type: 'image/png' });
  setLink('apple-touch-icon', icon.dataUrl);

  const origin = window.location.origin;
  const manifest = {
    name: 'RJ Tracker Pro', short_name: 'RJ Tracker', description: 'Private, offline-first study tracker.',
    start_url: `${origin}${BASE}`, scope: `${origin}${BASE}`, id: `${origin}${BASE}`,
    display: 'standalone', orientation: 'portrait', background_color: '#ecdfc8', theme_color: '#b4452b',
    icons: [
      { src: icon.dataUrl, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon.dataUrl, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  if (manifestUrl) URL.revokeObjectURL(manifestUrl);
  manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
  const link = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link) link.href = manifestUrl;
}

interface IconBridge {
  pinShortcut?: (b64: string, label: string) => boolean;
  setCustomIcon?: (b64: string, label: string) => string;
  clearCustomIcon?: () => string;
}
const iconBridge = (): IconBridge | undefined => (window as unknown as { RJNative?: IconBridge }).RJNative;

/** Ask Android to pin a home-screen shortcut that uses the custom icon. Returns false outside the APK. */
export function pinIconShortcut(pngDataUrl: string, label = 'RJ Tracker'): boolean {
  const bridge = iconBridge();
  if (!bridge?.pinShortcut) return false;
  try { return !!bridge.pinShortcut(pngDataUrl.split(',')[1] ?? '', label); } catch { return false; }
}

/** Launcher-style rounded 192 px PNG (what Android shortcuts and notifications use). */
export function buildLauncherIcon(srcDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 192;
      const ctx = c.getContext('2d');
      if (!ctx) { reject(new Error('canvas unavailable')); return; }
      ctx.beginPath();
      ctx.roundRect(0, 0, 192, 192, 42);
      ctx.clip();
      ctx.drawImage(img, 0, 0, 192, 192);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('icon unreadable'));
    img.src = srcDataUrl;
  });
}

export type NativeIconResult = 'unsupported' | 'updated' | 'needs-pin' | 'cleared' | 'error';

/**
 * Push the custom icon to the Android layer. Android never lets an app swap the launcher icon of an
 * installed app with an arbitrary picture, so the native side does everything the platform allows:
 * it updates the pinned home-screen shortcut IN PLACE (same shortcut id), the recent-apps icon and
 * the icon shown inside the timer notification. When no shortcut is pinned yet the result is
 * 'needs-pin' and the caller offers to pin one automatically.
 */
export async function syncNativeIcon(dataUrl: string | null): Promise<NativeIconResult> {
  const b = iconBridge();
  if (!b?.setCustomIcon) return 'unsupported';
  try {
    if (!dataUrl) return (b.clearCustomIcon?.() as NativeIconResult | undefined) ?? 'cleared';
    const png = await buildLauncherIcon(dataUrl);
    return (b.setCustomIcon(png.split(',')[1] ?? '', 'RJ Tracker') as NativeIconResult) || 'error';
  } catch {
    return 'error';
  }
}

/** Boot-time sync so the native layer always has the current icon (even one saved before this feature). */
export function syncNativeIconOnBoot(): void {
  const icon = getAppIcon();
  if (icon) void syncNativeIcon(icon.dataUrl);
}
