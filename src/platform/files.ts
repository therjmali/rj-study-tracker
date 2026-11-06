/**
 * Virtual file store for uploads (topic attachments, subject images, avatars, …).
 *
 * Files are saved as Blobs in IndexedDB and addressed by a stable, origin-relative
 * URL (`<base>__files/<id>`). The service worker serves those URLs, so `<img>`,
 * `<a href>`, `window.open()` and embedded PDFs all keep working — without
 * inflating localStorage with base64 data.
 */
import { STORE, idbGet, idbGetAll, idbPut, idbPutMany } from './idb';

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
export const FILE_PREFIX = `${BASE}__files/`;

interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export interface FileDump { id: string; name: string; type: string; dataUrl: string }

const MAX_FALLBACK_BYTES = 6 * 1024 * 1024;

function newId(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `f_${rnd}`;
}

export function isVirtualFileUrl(url: unknown): url is string {
  return typeof url === 'string' && url.includes('__files/');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body = ''] = dataUrl.split(',');
  const rawMime = /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream';
  // Neutralize dangerous MIME types (html, x-javascript, etc.) to octet-stream
  const mime = /^(image\/(jpeg|png|webp|gif)|application\/pdf|text\/plain)$/i.test(rawMime) ? rawMime : 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Down-scale big raster images so photos of handwritten notes stay light. */
async function optimiseImage(file: File): Promise<Blob> {
  const compressible = /^image\/(jpeg|png|webp)$/.test(file.type);
  if (!compressible || file.size < 350 * 1024) return file;
  if (file.type === 'image/png' && file.size < 1.5 * 1024 * 1024) return file; // screenshots / icons

  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1920;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const out = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

function swReady(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
}

/** Persist a file and return a URL that can be rendered or opened. */
export async function saveFile(file: File): Promise<{ id: string; url: string; name: string; size: number; type: string }> {
  const blob = await optimiseImage(file);
  const type = blob.type || file.type || 'application/octet-stream';

  // Without an active service worker (first visit, dev server, private mode)
  // there is nothing to serve /__files/ URLs, so fall back to a data URL.
  if (!swReady()) {
    if (blob.size > MAX_FALLBACK_BYTES) {
      throw new Error('This file is large — reload the app once so offline storage is ready, then try again.');
    }
    return { id: '', url: await blobToDataUrl(blob), name: file.name, size: blob.size, type };
  }

  const id = newId();
  const rec: StoredFile = { id, name: file.name, type, size: blob.size, blob, createdAt: Date.now() };
  await idbPut(STORE.files, rec);
  return { id, url: `${FILE_PREFIX}${id}`, name: file.name, size: blob.size, type };
}

export async function getFile(id: string): Promise<StoredFile | undefined> {
  return idbGet<StoredFile>(STORE.files, id);
}

/** Serialise every stored file into the backup JSON (as data URLs). */
export async function exportAllFiles(): Promise<FileDump[]> {
  const rows = await idbGetAll<StoredFile>(STORE.files);
  const out: FileDump[] = [];
  for (const r of rows) {
    try { out.push({ id: r.id, name: r.name, type: r.type, dataUrl: await blobToDataUrl(r.blob) }); } catch { /* skip unreadable */ }
  }
  return out;
}

/** Restore files from a backup; returns how many were written. */
export async function importFiles(dumps: FileDump[] | undefined | null): Promise<number> {
  if (!Array.isArray(dumps) || !dumps.length) return 0;
  const rows: StoredFile[] = [];
  for (const d of dumps) {
    if (!d?.id || typeof d.dataUrl !== 'string') continue;
    try {
      const blob = dataUrlToBlob(d.dataUrl);
      rows.push({ id: d.id, name: d.name || d.id, type: d.type || blob.type, size: blob.size, blob, createdAt: Date.now() });
    } catch { /* skip corrupt entry */ }
  }
  await idbPutMany(STORE.files, rows);
  return rows.length;
}

/**
 * Re-point every virtual file URL in a backup (which may come from another
 * origin or repo name) at this deployment's file prefix.
 */
export function rewriteVirtualUrls(text: string): string {
  return text.replace(/(?:https?:\/\/[^"'\s\\]*?)?\/(?:[^"'\s\\]*?\/)?__files\/(f_[A-Za-z0-9]+)/g, (_m, id) => `${FILE_PREFIX}${id}`);
}
