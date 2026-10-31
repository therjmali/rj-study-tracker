/**
 * Tiny promise-based IndexedDB helper.
 *
 * One database ("rj-tracker") is shared by the storage mirror, the local data
 * service and the virtual file store. The service worker (public/sw.js) opens the
 * same database to serve uploaded files, so DB_NAME / DB_VERSION / store names must
 * stay in sync with it.
 */
export const DB_NAME = 'rj-tracker';
export const DB_VERSION = 1;

export const STORE = {
  /** localStorage write-through mirror (out-of-line string keys). */
  mirror: 'mirror',
  /** Misc key/value documents (subjects tree, settings, profile, …). */
  kv: 'kv',
  /** Study sessions (keyPath: id). */
  sessions: 'sessions',
  /** Daily logs (keyPath: id). */
  logs: 'logs',
  /** Uploaded files / attachments (keyPath: id). */
  files: 'files',
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

let dbPromise: Promise<IDBDatabase> | null = null;

export function idbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!idbAvailable()) {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE.mirror)) db.createObjectStore(STORE.mirror);
      if (!db.objectStoreNames.contains(STORE.kv)) db.createObjectStore(STORE.kv);
      if (!db.objectStoreNames.contains(STORE.sessions)) db.createObjectStore(STORE.sessions, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE.logs)) db.createObjectStore(STORE.logs, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE.files)) db.createObjectStore(STORE.files, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // If another tab upgrades the schema, close so we never block it.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error ?? new Error('IndexedDB open failed')); };
    req.onblocked = () => { /* wait for the other tab to release the old version */ };
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export async function idbGet<T = unknown>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return wrap<T | undefined>(db.transaction(store, 'readonly').objectStore(store).get(key));
}

export async function idbGetAll<T = unknown>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return wrap<T[]>(db.transaction(store, 'readonly').objectStore(store).getAll());
}

export async function idbGetAllEntries(store: StoreName): Promise<Array<[IDBValidKey, unknown]>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out: Array<[IDBValidKey, unknown]> = [];
    const req = db.transaction(store, 'readonly').objectStore(store).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { out.push([cur.key, cur.value]); cur.continue(); } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Put into a store. Pass `key` only for stores without a keyPath (mirror, kv). */
export async function idbPut(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  if (key === undefined) tx.objectStore(store).put(value); else tx.objectStore(store).put(value, key);
  await txDone(tx);
}

export async function idbPutMany(store: StoreName, values: unknown[]): Promise<void> {
  if (!values.length) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  await txDone(tx);
}

export async function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

export async function idbDeleteMany(store: StoreName, keys: IDBValidKey[]): Promise<void> {
  if (!keys.length) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const k of keys) os.delete(k);
  await txDone(tx);
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await txDone(tx);
}

/** Apply a mixed batch (puts and deletes) to a key/value store in one transaction. */
export async function idbApplyBatch(store: StoreName, batch: Array<[string, string | null]>): Promise<void> {
  if (!batch.length) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const [k, v] of batch) {
    if (v === null) os.delete(k); else os.put(v, k);
  }
  await txDone(tx);
}
