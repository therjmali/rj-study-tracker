/**
 * File-backed account store.
 *
 * One JSON document per account (easy to inspect, copy or delete by hand), RAM
 * cache for reads, serialised atomic writes for updates (tmp file + rename) so a
 * crash or a full disk can never leave a half-written account behind.
 *
 * This is intentional: RJ Tracker's sync target is *your own* server, so the
 * data must remain portable and readable without special tooling.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { nowIso } from './util.mjs';

const WRITE_DEBOUNCE_MS = 120;

export class StoreError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.status = status;
  }
}

export class UserStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.usersDir = path.join(dataDir, 'users');
    this.indexPath = path.join(dataDir, 'index.json');
    this.secretPath = path.join(dataDir, 'secret.key');
    this.users = new Map(); // id -> user
    this.emailIndex = new Map(); // lowercased email -> id
    this.pendingWrites = new Map(); // id -> { user, timer, promise, resolve }
    this.flushChain = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.usersDir, { recursive: true });
    let files = [];
    try { files = await fs.readdir(this.usersDir); } catch { files = []; }
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(this.usersDir, file), 'utf8');
        const user = JSON.parse(raw);
        if (user && typeof user.id === 'string') {
          this.users.set(user.id, user);
          if (user.email) this.emailIndex.set(String(user.email).toLowerCase(), user.id);
        }
      } catch (err) {
        // Never lose a file because it failed to parse: park it for inspection.
        try { await fs.rename(path.join(this.usersDir, file), path.join(this.usersDir, `${file}.corrupt`)); } catch { /* ignore */ }
        console.error(`[store] could not load ${file}:`, err?.message ?? err);
      }
    }
    await this.#persistIndex();
  }

  /** HMAC secret for access tokens — generated once, then reused. */
  async getSecret() {
    if (process.env.CLOUD_SECRET) return process.env.CLOUD_SECRET;
    try {
      const existing = (await fs.readFile(this.secretPath, 'utf8')).trim();
      if (existing.length >= 32) return existing;
    } catch { /* create it */ }
    const secret = crypto.randomBytes(48).toString('base64url');
    try {
      await fs.writeFile(this.secretPath, secret, { mode: 0o600 });
    } catch (err) {
      console.warn('[store] could not persist the token secret:', err?.message ?? err);
    }
    return secret;
  }

  listUsers() {
    return [...this.users.values()];
  }

  getUser(id) {
    return this.users.get(String(id)) ?? null;
  }

  getUserByEmail(email) {
    const id = this.emailIndex.get(String(email).toLowerCase());
    return id ? this.getUser(id) ?? null : null;
  }

  requireUser(id) {
    const user = this.getUser(id);
    if (!user) throw new StoreError('account_not_found', 'This account no longer exists.', 401);
    return user;
  }

  async createUser(user) {
    const email = String(user.email).toLowerCase();
    if (this.emailIndex.has(email)) {
      throw new StoreError('email_taken', 'An account with this email already exists.', 409);
    }
    this.users.set(user.id, user);
    this.emailIndex.set(email, user.id);
    await this.saveUser(user, { immediate: true });
    await this.#persistIndex();
    return user;
  }

  /** Queue a write; multiple edits in the same moment collapse into one disk write. */
  saveUser(user, { immediate = false } = {}) {
    return new Promise((resolve, reject) => {
      const existing = this.pendingWrites.get(user.id);
      if (existing) {
        clearTimeout(existing.timer);
        existing.user = user;
        existing.resolve = resolve;
        existing.reject = reject;
        existing.timer = setTimeout(() => this.#flushUser(user.id), immediate ? 0 : WRITE_DEBOUNCE_MS);
        if (immediate) void this.#flushUser(user.id);
        return;
      }
      const entry = {
        user, resolve, reject,
        timer: setTimeout(() => this.#flushUser(user.id), immediate ? 0 : WRITE_DEBOUNCE_MS),
      };
      this.pendingWrites.set(user.id, entry);
    });
  }

  async #flushUser(id) {
    const entry = this.pendingWrites.get(id);
    if (!entry) return;
    this.pendingWrites.delete(id);
    clearTimeout(entry.timer);
    const { user, resolve, reject } = entry;
    this.flushChain = this.flushChain.catch(() => undefined).then(async () => {
      try {
        await this.#writeAtomic(path.join(this.usersDir, `${id}.json`), JSON.stringify(user));
        resolve?.();
      } catch (err) {
        reject?.(err);
        throw err;
      }
    });
    return this.flushChain;
  }

  /** Wait for every queued write (used by tests and by graceful shutdown). */
  async flush() {
    while (this.pendingWrites.size) {
      const ids = [...this.pendingWrites.keys()];
      await Promise.all(ids.map(id => this.#flushUser(id).catch(() => undefined)));
      await this.flushChain.catch(() => undefined);
    }
    await this.flushChain.catch(() => undefined);
  }

  async deleteUser(user) {
    const entry = this.pendingWrites.get(user.id);
    if (entry) clearTimeout(entry.timer);
    this.pendingWrites.delete(user.id);
    this.users.delete(user.id);
    this.emailIndex.delete(String(user.email).toLowerCase());
    try { await fs.unlink(path.join(this.usersDir, `${user.id}.json`)); } catch { /* already gone */ }
    await this.#persistIndex();
  }

  async #writeAtomic(file, contents) {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const handle = await fs.open(tmp, 'w', 0o600);
    try {
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, file);
  }

  async #persistIndex() {
    const index = {};
    for (const [email, id] of this.emailIndex) index[email] = id;
    try {
      await this.#writeAtomic(this.indexPath, JSON.stringify({ updatedAt: nowIso(), emails: index }));
    } catch (err) {
      console.warn('[store] could not write index:', err?.message ?? err);
    }
  }

  /** Aggregate stats for the health endpoint (never exposes user content). */
  stats() {
    let accounts = 0;
    let bytes = 0;
    let version = 0;
    for (const user of this.users.values()) {
      accounts++;
      const doc = user.doc;
      if (doc) {
        version = Math.max(version, doc.version ?? 0);
        for (const section of Object.values(doc.sections ?? {})) {
          try { bytes += Buffer.byteLength(JSON.stringify(section?.value ?? null)); } catch { /* ignore */ }
        }
      }
    }
    return { accounts, cloudBytes: bytes, maxVersion: version };
  }
}
