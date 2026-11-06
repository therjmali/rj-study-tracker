/**
 * App-wide zoom (Settings → Appearance & Display → Zoom).
 *
 * Scales the whole interface — text, icons, spacing, dialogs, sheets and previews — like a browser's
 * page zoom, but remembered per device (a phone and a tablet want different levels). It is applied
 * with CSS `zoom` on <html>, so scrolling, fixed bars and pop-ups keep working natively.
 *
 * Viewport units (vh / vw …) are multiplied by `zoom` too, so the build rewrites them to
 * `var(--rj-vh)` etc. (see postcss.config.js); those variables divide the zoom back out, which keeps
 * full-height screens exactly the size of the display at every zoom level.
 */
import { useSyncExternalStore } from 'react';

export const ZOOM_KEY = 'rj-ui-zoom-v1';
export const ZOOM_MIN = 70;
export const ZOOM_MAX = 150;
export const ZOOM_STEP = 5;
export const ZOOM_DEFAULT = 100;

export const ZOOM_PRESETS: { value: number; label: string; hint: string }[] = [
  { value: 85, label: 'Compact', hint: 'Fit more' },
  { value: 100, label: 'Default', hint: 'Standard' },
  { value: 115, label: 'Comfortable', hint: 'Easier' },
  { value: 130, label: 'Large', hint: 'Bigger' },
  { value: 150, label: 'Extra large', hint: 'Biggest' },
];

export const clampZoom = (n: number): number => {
  if (!Number.isFinite(n)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n / ZOOM_STEP) * ZOOM_STEP));
};

function readStored(): number {
  try {
    const raw = localStorage.getItem(ZOOM_KEY);
    if (raw === null || raw === '' || raw === 'undefined' || raw === 'null') return ZOOM_DEFAULT;
    const n = Number(raw);
    return Number.isFinite(n) && n >= ZOOM_MIN && n <= ZOOM_MAX ? clampZoom(n) : ZOOM_DEFAULT;
  } catch { return ZOOM_DEFAULT; }
}

let current = ZOOM_DEFAULT;
const listeners = new Set<() => void>();

function paint(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--rj-zoom', String(current / 100));
  if (current === ZOOM_DEFAULT) root.style.removeProperty('zoom');
  else root.style.setProperty('zoom', String(current / 100));
  root.classList.toggle('rj-zoomed', current !== ZOOM_DEFAULT);
}

const notify = () => listeners.forEach(l => l());

/** Read the saved level and apply it. Call once at start-up, and again after storage is restored. */
export function applyZoom(): void {
  current = readStored();
  paint();
  notify();
}

export const getZoom = (): number => current;
/** 1 = 100 %. For code that converts pointer movement (px on screen) into layout lengths. */
export const getZoomFactor = (): number => current / 100;

/** Change the zoom (clamped to 70–150 %, in 5 % steps) and remember it on this device. */
export function setZoom(percent: number): number {
  current = clampZoom(percent);
  try { localStorage.setItem(ZOOM_KEY, String(current)); } catch { /* storage full / blocked */ }
  paint();
  notify();
  return current;
}

export function useZoom(): number {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getZoom,
    () => ZOOM_DEFAULT,
  );
}

/**
 * dnd-kit modifier: pointer movement is measured in screen pixels but the dragged element's
 * transform is applied inside the zoomed page, so divide it back (no-op at 100 %).
 */
export const zoomModifier = ({ transform }: { transform: { x: number; y: number; scaleX: number; scaleY: number } }) => {
  const z = getZoomFactor();
  return z === 1 ? transform : { ...transform, x: transform.x / z, y: transform.y / z };
};

/** framer-motion `transformPagePoint`: same correction for drag gestures. */
export const zoomPagePoint = (point: { x: number; y: number }) => {
  const z = getZoomFactor();
  return z === 1 ? point : { x: point.x / z, y: point.y / z };
};

// Apply as early as possible (before React renders) so there is no flash at the wrong size.
applyZoom();
