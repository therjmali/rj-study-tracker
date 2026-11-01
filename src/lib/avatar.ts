/**
 * Profile photo helpers.
 *
 * Why this exists: uploaded photos used to be stored under a relative URL (`/__files/<id>`) or a data
 * URL, but every screen only treated values starting with "http" as photos — so the picture was saved
 * and then drawn as raw text. Photos are now (a) recognised by one shared check and (b) stored as a
 * small, self-contained square image, independent of the service worker and the file store.
 */

/** True when the avatar value is an image (not an emoji / initials). */
export function isImageAvatar(v?: string | null): v is string {
  return !!v && (/^(https?:|data:image\/|blob:)/i.test(v) || v.includes('__files/'));
}

const MAX_INPUT_BYTES = 15 * 1024 * 1024;

function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => loadViaElement(file));
  }
  return loadViaElement(file);
}

function loadViaElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image format is not supported. Try a JPG or PNG photo.')); };
    img.src = url;
  });
}

/** Centre-crop to a square, scale to `size` px and return a compact data URL (~30–80 KB). */
export async function fileToAvatarDataUrl(file: File, size = 512): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That photo is too large (max 15 MB).');
  const img = await loadImage(file);
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
  if (!w || !h) throw new Error('Could not read that image.');

  const side = Math.min(w, h);
  const sx = Math.round((w - side) / 2);
  const sy = Math.round((h - side) / 2);
  const out = Math.min(size, side);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing is not available on this device.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out, out);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img as CanvasImageSource, sx, sy, side, side, 0, 0, out, out);
  if ('close' in img && typeof img.close === 'function') img.close();

  const webp = canvas.toDataURL('image/webp', 0.9);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.88);
}
