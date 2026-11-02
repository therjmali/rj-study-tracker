/* RJ Tracker Pro — service worker.
 *
 *  1. Precaches the app shell so the tracker opens instantly and fully offline.
 *  2. Serves uploaded files (`<base>__files/<id>`) straight from IndexedDB.
 *
 * __BUILD_ID__ and __PRECACHE_MANIFEST__ are filled in by the build (vite.config.ts).
 * The IndexedDB schema below must match src/platform/idb.ts.
 */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = __PRECACHE_MANIFEST__;
const CACHE = 'rj-static-' + BUILD_ID;
const SCOPE = self.registration.scope; // absolute URL, ends with "/"
const FILE_PREFIX = new URL('__files/', SCOPE).pathname;
const SHELL = new URL('index.html', SCOPE).href;

const DB_NAME = 'rj-tracker';
const DB_VERSION = 1;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Fetch with cache:'reload' so we never precache a stale HTTP-cached copy.
    await Promise.all(PRECACHE.map(async (path) => {
      const url = new URL(path, SCOPE).href;
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error('Precache failed: ' + url);
      await cache.put(url, res);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('rj-static-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Quick-action buttons on notifications (timer Pause / Stop, reminders…) → forward to the open app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.action || '';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const target = all.find((c) => c.url.startsWith(SCOPE)) || all[0];
    if (target) {
      if (id) target.postMessage({ type: 'rj-notif-action', id });
      await target.focus();
    } else {
      await self.clients.openWindow(SCOPE);
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // AI providers, etc. go straight to the network
  // Cloud sync API: always live, never cached (a stale pull would look like data loss).
  if (/\/api(\/|$)/.test(url.pathname)) return;

  if (url.pathname.startsWith(FILE_PREFIX)) {
    event.respondWith(serveFile(req, url.pathname.slice(FILE_PREFIX.length)));
    return;
  }
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match(SHELL);
      if (cached) return cached;
      try { return await fetch(req); } catch (e) { return new Response('Offline', { status: 503, statusText: 'Offline' }); }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (e) {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});

/* ───────────── uploaded files ───────────── */

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('mirror')) db.createObjectStore('mirror');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('logs')) db.createObjectStore('logs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function readFile(id) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const q = db.transaction('files', 'readonly').objectStore('files').get(id);
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
  } finally {
    db.close();
  }
}

const ACTIVE_TYPES = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml)/i;

async function serveFile(req, rawId) {
  const id = decodeURIComponent(rawId.split('/')[0] || '');
  let rec;
  try { rec = id ? await readFile(id) : null; } catch (e) { rec = null; }
  if (!rec || !rec.blob) return new Response('File not found', { status: 404 });

  const blob = rec.blob;
  const type = rec.type || blob.type || 'application/octet-stream';
  const headers = new Headers({
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline; filename*=UTF-8\'\'' + encodeURIComponent(rec.name || id),
  });
  // Never let an uploaded HTML/SVG run scripts inside the app's origin.
  if (ACTIVE_TYPES.test(type)) headers.set('Content-Security-Policy', "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'");

  const range = req.headers.get('range');
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m && (m[1] !== '' || m[2] !== '')) {
    const size = blob.size;
    let start = m[1] === '' ? Math.max(0, size - parseInt(m[2], 10)) : parseInt(m[1], 10);
    let end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
    if (start >= size || start > end) {
      headers.set('Content-Range', 'bytes */' + size);
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(req.method === 'HEAD' ? null : blob.slice(start, end + 1, type), { status: 206, headers });
  }
  headers.set('Content-Length', String(blob.size));
  return new Response(req.method === 'HEAD' ? null : blob, { status: 200, headers });
}
