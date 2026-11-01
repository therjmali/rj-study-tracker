/**
 * Automatic backups.
 *
 *  • first time the app is opened each calendar day (captures yesterday's work after midnight),
 *  • and/or at any number of times the student chooses (catch-up if the phone was off).
 *
 * Android: written silently to Downloads/RJ Tracker Backups, or to a folder picked with the system
 * folder chooser, with a notification when finished and automatic clean-up of old files.
 * Browser: falls back to a normal download.
 *
 * Limitation (platform, not app): a web app can only read its data while it is running, so a backup
 * "at 02:00" with the app closed happens the next time the app opens; a daily notification at that
 * time reminds the student, and the catch-up runs automatically.
 */
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { BackupContext } from '../lib/backupBuilder';
import { buildFullBackup } from '../lib/backupBuilder';
import { isNative } from './native';
import { postNotice, syncBackupReminders } from './notify';

export interface BackupRecord { at: string; name: string; bytes: number; ok: boolean; where: string; reason: string }
export interface AutoBackupSettings {
  enabled: boolean;
  onFirstOpen: boolean;
  times: string[];
  keep: number;
  folderUri: string;
  folderName: string;
  lastOpenDate: string;
  done: Record<string, string[]>;
  history: BackupRecord[];
}

export const BACKUP_FOLDER = 'RJ Tracker Backups';
const PREFIX = 'RJ-Tracker-Backup-';
const KEY = 'rj-autobackup-v1';
const EVENT = 'rj:autobackup-settings';

const DEFAULTS: AutoBackupSettings = {
  enabled: true, onFirstOpen: true, times: [], keep: 14, folderUri: '', folderName: '', lastOpenDate: '', done: {}, history: [],
};

/* ───────────────────────────── settings store ───────────────────────────── */

let cached: AutoBackupSettings | null = null;
let raw: string | null = null;

export function getAutoBackupSettings(): AutoBackupSettings {
  let now: string | null = null;
  try { now = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (cached && now === raw) return cached;
  raw = now;
  try {
    const p = now ? JSON.parse(now) : {};
    cached = {
      enabled: p.enabled !== false,
      onFirstOpen: p.onFirstOpen !== false,
      times: Array.isArray(p.times) ? p.times.filter((t: unknown) => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t)).sort() : [],
      keep: Number.isFinite(p.keep) ? Math.min(365, Math.max(1, p.keep)) : 14,
      folderUri: typeof p.folderUri === 'string' ? p.folderUri : '',
      folderName: typeof p.folderName === 'string' ? p.folderName : '',
      lastOpenDate: typeof p.lastOpenDate === 'string' ? p.lastOpenDate : '',
      done: p.done && typeof p.done === 'object' ? p.done : {},
      history: Array.isArray(p.history) ? p.history.slice(0, 30) : [],
    };
  } catch { cached = { ...DEFAULTS }; }
  return cached!;
}

export function saveAutoBackupSettings(next: AutoBackupSettings): void {
  cached = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); raw = localStorage.getItem(KEY); } catch { /* keep in memory */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useAutoBackupSettings(): AutoBackupSettings {
  return useSyncExternalStore(
    cb => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); },
    getAutoBackupSettings, getAutoBackupSettings,
  );
}

const patch = (p: Partial<AutoBackupSettings>) => saveAutoBackupSettings({ ...getAutoBackupSettings(), ...p });

/* ───────────────────────────── native bridge ───────────────────────────── */

interface Bridge {
  pickFolder?: () => void;
  saveFile?: (name: string, mime: string, b64: string, treeUri: string, subFolder: string) => string;
  pruneBackups?: (treeUri: string, subFolder: string, prefix: string, keep: number) => number;
}
const bridge = (): Bridge | undefined => (window as unknown as { RJNative?: Bridge }).RJNative;
export const canPickFolder = () => isNative && !!bridge()?.pickFolder;

/** Opens the Android folder chooser; resolves once the student picked (or cancelled). */
export function pickBackupFolder(): Promise<boolean> {
  return new Promise(resolve => {
    const b = bridge();
    if (!b?.pickFolder) { resolve(false); return; }
    const onPick = (e: Event) => {
      window.removeEventListener('rj:folder-picked', onPick);
      const d = (e as CustomEvent<{ uri?: string; name?: string; cancelled?: boolean }>).detail;
      if (d?.uri) { patch({ folderUri: d.uri, folderName: d.name ?? 'Selected folder' }); resolve(true); } else resolve(false);
    };
    window.addEventListener('rj:folder-picked', onPick);
    b.pickFolder();
  });
}

export const resetBackupFolder = () => patch({ folderUri: '', folderName: '' });

/* ───────────────────────────── running a backup ───────────────────────────── */

let provider: (() => BackupContext | null) | null = null;
export function registerBackupContext(fn: () => BackupContext | null) { provider = fn; }

const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

let busy = false;

export async function runBackup(reason: string, opts: { silent?: boolean } = {}): Promise<BackupRecord | null> {
  if (busy) return null;
  busy = true;
  const now = new Date();
  const name = `${PREFIX}${localDate(now)}_${pad(now.getHours())}-${pad(now.getMinutes())}.json`;
  try {
    const ctx = provider?.();
    if (!ctx) {
      if (opts.silent) return null;
      throw new Error('The app is still loading — try again in a moment.');
    }
    if (!(ctx.subjects ?? []).length && !opts.silent) throw new Error('There is nothing to back up yet.');
    if (!(ctx.subjects ?? []).length) return null;

    const built = await buildFullBackup(ctx);
    const bytes = new TextEncoder().encode(JSON.stringify(built.data));
    const s = getAutoBackupSettings();
    let where = 'Browser downloads';

    const b = bridge();
    if (isNative && b?.saveFile) {
      const res = JSON.parse(b.saveFile(name, 'application/json', toBase64(bytes), s.folderUri, BACKUP_FOLDER) || '{}');
      if (!res.ok) throw new Error(res.error || 'Could not save the backup file.');
      where = res.where;
      try { b.pruneBackups?.(s.folderUri, BACKUP_FOLDER, PREFIX, s.keep); } catch { /* retention is best-effort */ }
    } else {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }

    const rec: BackupRecord = { at: now.toISOString(), name, bytes: bytes.length, ok: true, where, reason };
    patch({ history: [rec, ...getAutoBackupSettings().history].slice(0, 30) });
    toast.success(`💾 Backup saved — ${fmtSize(bytes.length)}`);
    void postNotice('✅ Backup saved', `${built.subjects} subjects · ${built.topics} topics · ${fmtSize(bytes.length)}\n${where}`, { channel: 'backup' });
    return rec;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Backup failed';
    const rec: BackupRecord = { at: now.toISOString(), name, bytes: 0, ok: false, where: msg, reason };
    patch({ history: [rec, ...getAutoBackupSettings().history].slice(0, 30) });
    if (!opts.silent) toast.error(msg);
    void postNotice('⚠️ Backup failed', msg, { channel: 'backup' });
    return rec;
  } finally {
    busy = false;
  }
}

/* ───────────────────────────── scheduler ───────────────────────────── */

let lastAttempt = 0;

export async function checkBackupDue() {
  const s = getAutoBackupSettings();
  if (!s.enabled || busy) return;
  const today = localDate();
  const nowHM = localTime();
  const doneToday = s.done[today] ?? [];
  const duePast = s.times.filter(t => t <= nowHM && !doneToday.includes(t));
  const firstOpenDue = s.onFirstOpen && s.lastOpenDate !== today;
  if (!firstOpenDue && !duePast.length) return;

  // Back off 15 minutes after a failed attempt.
  if (Date.now() - lastAttempt < 15 * 60_000 && lastAttempt !== 0) return;
  lastAttempt = Date.now();

  const reason = firstOpenDue ? 'First open of the day' : `Scheduled ${duePast[duePast.length - 1]}`;
  const rec = await runBackup(reason, { silent: true });
  if (rec === null) return; // busy or nothing to back up yet

  if (rec.ok) {
    lastAttempt = 0;
    const cur = getAutoBackupSettings();
    saveAutoBackupSettings({
      ...cur,
      lastOpenDate: today,
      done: { [today]: Array.from(new Set([...(cur.done[today] ?? []), ...duePast])) }, // also prunes older days
    });
  }
}

let started = false;
export function startAutoBackup() {
  if (started) return;
  started = true;
  setTimeout(() => void checkBackupDue(), 6000);
  setInterval(() => void checkBackupDue(), 30_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkBackupDue(); });
  window.addEventListener('rj:autobackup-settings', () => {
    const s = getAutoBackupSettings();
    void syncBackupReminders(s.times, s.enabled);
  });
  const s = getAutoBackupSettings();
  void syncBackupReminders(s.times, s.enabled);
}

/** Called for "Back up now" notification buttons and the Settings button. */
export function backupNow(reason = 'Manual') { return runBackup(reason); }
