/**
 * Android (Capacitor) bridge.
 *
 * Inside the APK, WebViews cannot "download" blobs or open blob: tabs, so this module
 * intercepts those two patterns once, globally, and routes them to the native share
 * sheet (Save to Files / Drive / WhatsApp …). In a normal browser it does nothing.
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { toast } from 'sonner';

export const isNative = Capacitor.isNativePlatform();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function saveAndShare(filename: string, blob: Blob): Promise<void> {
  const safe = filename.replace(/[\\/:*?"<>|]+/g, '_') || 'file';
  const written = await Filesystem.writeFile({ path: safe, data: await blobToBase64(blob), directory: Directory.Cache });
  await Share.share({ title: safe, url: written.uri, dialogTitle: 'Save or share' });
}

/** Keep the Android status / navigation bars in step with the app's current theme colour. */
function syncSystemBars() {
  const bridge = (window as unknown as { RJNative?: { setBars: (hex: string, darkIcons: boolean) => void } }).RJNative;
  if (!bridge) return;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(getComputedStyle(document.body).backgroundColor);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  try { bridge.setBars(hex, luminance > 0.5); } catch { /* ignore */ }
}

export function installNativeBridge(): void {
  if (!isNative) return;

  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(syncSystemBars); };
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', schedule);
  window.addEventListener('load', schedule);
  schedule();

  // <a download href="blob:…"> clicks (backups, ZIP/JSON exports, text summaries).
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[download]') as HTMLAnchorElement | null;
    if (!a || !a.href.startsWith('blob:')) return;
    e.preventDefault();
    e.stopPropagation();
    const name = a.getAttribute('download') || 'download';
    fetch(a.href)
      .then(r => r.blob())
      .then(b => saveAndShare(name, b))
      .catch(() => toast.error('Could not save the file'));
  }, true);

  // window.open(blob:…) is used for report/PDF previews: hand the HTML file to the share sheet.
  const nativeOpen = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    if (typeof url === 'string' && url.startsWith('blob:')) {
      fetch(url)
        .then(r => r.blob())
        .then(b => saveAndShare(`RJ-Tracker-report-${new Date().toISOString().slice(0, 10)}.html`, b))
        .then(() => toast.info('Open the saved report in your browser and use Print → Save as PDF'))
        .catch(() => toast.error('Could not export the report'));
      return null;
    }
    return nativeOpen(url as string, target, features);
  }) as typeof window.open;
}
