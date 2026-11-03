/**
 * Cloud copy tools: download the account's cloud data as a standard v8 backup file, and compare
 * every synced section on this device with the cloud (the A–Z "is everything really in sync?" check).
 */
import { APP_VERSION } from '../../types';
import { buildManifest, BACKUP_VERSION } from '../backupFormat';
import { CATALOG_MAP, toRaw, type CatalogGroup } from '../dataCatalog';
import { pullDoc } from './remote';
import { SYNC_SECTIONS, fingerprint, loadBase, readAllLocalSections } from './sections';
import { deepEqual } from './merge3';
import { listDevices } from './authStore';

export interface CloudSnapshot {
  version: number;
  updatedAt: string;
  raw: Record<string, string>;
  data: Record<string, unknown>;
  sections: Record<string, { hash: string; updatedAt: string; deviceId?: string | null }>;
}

export async function fetchCloudSnapshot(): Promise<CloudSnapshot> {
  const doc = await pullDoc('');
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(doc.data ?? {})) {
    const entry = CATALOG_MAP[key];
    if (entry && entry.scope === 'cloud') raw[key] = toRaw(entry, value);
  }
  return { version: doc.version, updatedAt: doc.updatedAt, raw, data: doc.data ?? {}, sections: doc.sections ?? {} };
}

const parse = (raw: Record<string, string>, key: string): any => { try { return raw[key] ? JSON.parse(raw[key]) : null; } catch { return null; } };

/** A complete backup file built from the CLOUD copy — same format as a device backup. */
export async function buildCloudBackup(profile?: { name?: string; email?: string; avatar?: string; coverGradient?: string }): Promise<{ data: Record<string, any>; snapshot: CloudSnapshot }> {
  const snapshot = await fetchCloudSnapshot();
  const { raw } = snapshot;
  const app = `RJ TRACKER Pro ${APP_VERSION}`;
  const manifest = await buildManifest(raw, { app, source: 'cloud', includesSecrets: false });
  const data = {
    _backupVersion: BACKUP_VERSION,
    _exportedAt: new Date().toISOString(),
    _app: app,
    _cloud: { version: snapshot.version, updatedAt: snapshot.updatedAt, account: profile?.email ?? null },
    // Readable mirrors (what older importers and spreadsheets expect)
    appState: parse(raw, 'nursing-tracker-v6'),
    settings: parse(raw, 'nursing-settings-v2'),
    store: parse(raw, 'nursing-store-v1'),
    history: parse(raw, 'nursing-history-v1'),
    trash: parse(raw, 'nursing-trash-v1'),
    reminders: parse(raw, 'nursing-reminders-v1'),
    gamification: parse(raw, 'nursing-gamification-v2'),
    coins: parse(raw, 'nursing-coins-v1'),
    todos: parse(raw, 'nursetrack-todos'),
    calendarNotes: parse(raw, 'nursetrack-calendar-notes'),
    tickerPrefs: parse(raw, 'nursetrack-ticker-prefs'),
    excludedSubjects: parse(raw, 'nursetrack-excluded-subjects'),
    dbSessions: parse(raw, 'nursing-dbsessions-v1'),
    clockMode: raw['nursetrack-clock-mode'] ?? null,
    calendarSync: raw['nursetrack-calendar-sync'] ?? null,
    userProfile: profile ? { name: profile.name, email: profile.email, avatar: raw['nursetrack-avatar'] ?? profile.avatar, coverGradient: raw['nursetrack-cover-gradient'] ?? profile.coverGradient } : null,
    raw,
    _manifest: manifest,
  };
  return { data, snapshot };
}

export type SectionState = 'synced' | 'device-ahead' | 'cloud-ahead' | 'diverged' | 'device-only' | 'cloud-only' | 'empty';

export interface SectionRow {
  key: string;
  label: string;
  group: CatalogGroup;
  state: SectionState;
  deviceBytes: number;
  cloudBytes: number;
  updatedAt: string | null;
  fromDevice: string | null;
}

const bytes = (value: unknown, type: 'json' | 'string'): number => (value === undefined ? 0 : new TextEncoder().encode(toRaw({ type }, value)).length);

export async function compareDeviceWithCloud(): Promise<{ rows: SectionRow[]; version: number; updatedAt: string }> {
  const [cloud, local, base, devices] = await Promise.all([
    fetchCloudSnapshot(),
    Promise.resolve(readAllLocalSections()),
    loadBase(),
    listDevices().catch(() => [] as Awaited<ReturnType<typeof listDevices>>),
  ]);
  const names = new Map<string, string>(devices.map(d => [d.id, d.name] as [string, string]));
  const rows: SectionRow[] = SYNC_SECTIONS.map(def => {
    const l = local[def.key];
    const r = cloud.data[def.key];
    const b = base[def.key];
    let state: SectionState;
    if (l === undefined && r === undefined) state = 'empty';
    else if (r === undefined) state = 'device-only';
    else if (l === undefined) state = 'cloud-only';
    else if (fingerprint(l) === fingerprint(r)) state = 'synced';
    else if (b !== undefined && deepEqual(b, r)) state = 'device-ahead';
    else if (b !== undefined && deepEqual(b, l)) state = 'cloud-ahead';
    else state = 'diverged';
    const meta = cloud.sections[def.key];
    return {
      key: def.key, label: def.label, group: def.group, state,
      deviceBytes: bytes(l, def.type), cloudBytes: bytes(r, def.type),
      updatedAt: meta?.updatedAt ?? null,
      fromDevice: meta?.deviceId ? (names.get(meta.deviceId) ?? 'Another device') : null,
    };
  });
  return { rows, version: cloud.version, updatedAt: cloud.updatedAt };
}
