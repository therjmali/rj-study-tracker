/**
 * The A–Z inventory of everything RJ Tracker stores for a student.
 *
 * One list, three consumers: the cloud sync (scope "cloud"), the backup / restore engine and the
 * Data Center screen. Anything not listed here is deliberately NOT exported or restored (live
 * timer state, UI filters, auth tokens, sync bookkeeping …), so a backup file can never overwrite
 * security-relevant or transient keys.
 *
 *  cloud   — follows the account to every device and is included in every backup
 *  device  — belongs to this phone/browser (paths, icon, chat); backed up, never uploaded
 *  secret  — credentials (AI keys); backed up ONLY when the student explicitly opts in, never uploaded
 */
import { SYNC_SECTIONS, type SectionGroup } from './cloud/sections';

export type DataScope = 'cloud' | 'device' | 'secret';
export type CatalogGroup = SectionGroup | 'device';

export interface CatalogEntry {
  key: string;
  label: string;
  group: CatalogGroup;
  type: 'json' | 'string';
  scope: DataScope;
}

const DEVICE_ENTRIES: CatalogEntry[] = [
  { key: 'rj-autobackup-v1', label: 'Auto-backup schedule & history', group: 'device', type: 'json', scope: 'device' },
  { key: 'rj-app-icon-v1', label: 'Custom app icon', group: 'device', type: 'json', scope: 'device' },
  { key: 'nursetrack-chat-history', label: 'AI tutor chat history', group: 'device', type: 'json', scope: 'device' },
  { key: 'rj-local-profile-v1', label: 'Guest profile on this device', group: 'device', type: 'json', scope: 'device' },
  { key: 'nursetrack-install-dismissed', label: 'Install prompt dismissed', group: 'device', type: 'string', scope: 'device' },
  { key: 'rj-ai-settings-v1', label: 'AI provider keys & model', group: 'device', type: 'json', scope: 'secret' },
];

export const DATA_CATALOG: CatalogEntry[] = [
  ...SYNC_SECTIONS.map(def => ({ key: def.key, label: def.label, group: def.group, type: def.type, scope: 'cloud' as const })),
  ...DEVICE_ENTRIES,
];

export const CATALOG_MAP: Record<string, CatalogEntry> = Object.fromEntries(DATA_CATALOG.map(e => [e.key, e]));

export const GROUP_LABELS: Record<CatalogGroup, { icon: string; title: string }> = {
  study: { icon: '📚', title: 'Study data' },
  progress: { icon: '🏆', title: 'Progress & rewards' },
  content: { icon: '🗂️', title: 'History & trash' },
  preferences: { icon: '⚙️', title: 'Settings & profile' },
  device: { icon: '📱', title: 'This device only' },
};

export function readRaw(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Entries that go into a backup file. Secrets only when the student opted in. */
export function backupEntries(includeSecrets: boolean): CatalogEntry[] {
  return DATA_CATALOG.filter(e => e.scope !== 'secret' || includeSecrets);
}

/** Stringify a decoded value exactly the way the app stores it in localStorage. */
export function toRaw(entry: Pick<CatalogEntry, 'type'>, value: unknown): string {
  return entry.type === 'string' ? String(value ?? '') : JSON.stringify(value);
}
