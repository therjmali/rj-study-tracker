/** Average-hash helpers (pure): used to notice when the app logo and the profile photo are the same picture. */

/** gray: 64 luminance values (8×8). Returns a 16-hex-digit hash. */
export function averageHash(gray) {
  if (!Array.isArray(gray) || gray.length !== 64) return null;
  const mean = gray.reduce((a, b) => a + b, 0) / 64;
  let out = '';
  for (let i = 0; i < 64; i += 4) {
    let nib = 0;
    for (let j = 0; j < 4; j++) nib = (nib << 1) | (gray[i + j] >= mean ? 1 : 0);
    out += nib.toString(16);
  }
  return out;
}

export function hammingHex(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

export const SAME_IMAGE_MAX_DISTANCE = 8;
export const isSameImage = (a, b, max = SAME_IMAGE_MAX_DISTANCE) => !!a && !!b && hammingHex(a, b) <= max;
