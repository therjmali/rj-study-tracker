import { useEffect, useState } from 'react';
import { averageHash, isSameImage } from './imageSimilarityLogic.mjs';

const cache = new Map<string, string | null>();

/** 8×8 average hash of an image URL / data URL (null if it cannot be read, e.g. cross-origin without CORS). */
export function hashImage(src: string): Promise<string | null> {
  if (cache.has(src)) return Promise.resolve(cache.get(src) ?? null);
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 8; c.height = 8;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('no canvas');
        ctx.drawImage(img, 0, 0, 8, 8);
        const px = ctx.getImageData(0, 0, 8, 8).data;
        const gray: number[] = [];
        for (let i = 0; i < 64; i++) gray.push(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
        const h = averageHash(gray);
        cache.set(src, h);
        resolve(h);
      } catch { cache.set(src, null); resolve(null); }
    };
    img.onerror = () => { cache.set(src, null); resolve(null); };
    img.src = src;
  });
}

/** True when both pictures exist and show (essentially) the same image — used to avoid showing the same face twice in the header. */
export function useSameImage(a: string | null | undefined, b: string | null | undefined): boolean {
  const [same, setSame] = useState(false);
  useEffect(() => {
    let live = true;
    if (!a || !b) { setSame(false); return; }
    if (a === b) { setSame(true); return; }
    Promise.all([hashImage(a), hashImage(b)]).then(([x, y]) => { if (live) setSame(isSameImage(x, y)); });
    return () => { live = false; };
  }, [a, b]);
  return same;
}
