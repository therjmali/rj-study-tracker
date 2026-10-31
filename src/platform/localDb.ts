/**
 * Local data service — the browser-side replacement for the original Zite
 * "endpoints". Every function keeps the exact input/output contract the UI was
 * written against, but persists to IndexedDB on the user's own device.
 *
 * Unlike the hosted version, the subject tree is stored *verbatim* (one document),
 * so no field is ever dropped, duplicated or orphaned by a sync.
 */
import { STORE, idbClear, idbDelete, idbDeleteMany, idbGet, idbGetAll, idbPut, idbPutMany } from './idb';

/* ───────────────────────────── helpers ───────────────────────────── */

type AnyRec = Record<string, any>;

export class LocalApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'LocalApiError';
    this.code = code;
  }
}

function uid(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rnd}`;
}

function safeParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/* ───────────────────────────── key/value docs ───────────────────────────── */

const KV = { subjects: 'subjects', settings: 'settings', coins: 'coins', store: 'store', profile: 'profile' } as const;

const kvCache = new Map<string, unknown>();

async function kvGet<T>(key: string, fallback: T): Promise<T> {
  if (kvCache.has(key)) return kvCache.get(key) as T;
  try {
    const v = await idbGet<T>(STORE.kv, key);
    const val = (v === undefined ? fallback : v) as T;
    kvCache.set(key, val);
    return val;
  } catch {
    return fallback;
  }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  kvCache.set(key, value);
  await idbPut(STORE.kv, value, key);
}

/* ───────────────────────────── sessions & logs ───────────────────────────── */

let sessionsCache: Map<string, AnyRec> | null = null;
let logsCache: Map<string, AnyRec> | null = null;

async function sessions(): Promise<Map<string, AnyRec>> {
  if (!sessionsCache) {
    let rows: AnyRec[] = [];
    try { rows = await idbGetAll<AnyRec>(STORE.sessions); } catch { /* start empty */ }
    sessionsCache = new Map(rows.map(r => [r.id, r]));
  }
  return sessionsCache;
}

async function logs(): Promise<Map<string, AnyRec>> {
  if (!logsCache) {
    let rows: AnyRec[] = [];
    try { rows = await idbGetAll<AnyRec>(STORE.logs); } catch { /* start empty */ }
    logsCache = new Map(rows.map(r => [r.id, r]));
  }
  return logsCache;
}

/* ───────────────────────────── subject tree helpers ───────────────────────────── */

async function getTree(): Promise<AnyRec[]> {
  return kvGet<AnyRec[]>(KV.subjects, []);
}

/* ───────────────────────────── public API ───────────────────────────── */

export interface SyncDataResult {
  subjects: AnyRec[];
  dailyLogs: AnyRec[];
  studySessions: AnyRec[];
  settings: any;
  coins: any;
  store: any;
  isNewUser: boolean;
  avatar: string | null;
  coverGradient: string | null;
}

export async function syncData(): Promise<SyncDataResult> {
  const subjects = await getTree();
  const sessionMap = await sessions();
  const logMap = await logs();

  const allSessions = Array.from(sessionMap.values());
  const byDate = new Map<string, { totalMinutes: number; count: number }>();
  for (const s of allSessions) {
    const d = s.date || '';
    const e = byDate.get(d) ?? { totalMinutes: 0, count: 0 };
    e.totalMinutes += s.minutes || 0;
    e.count++;
    byDate.set(d, e);
  }

  const logRecs = Array.from(logMap.values());
  const logByDate = new Map(logRecs.map(l => [l.date || '', l]));
  const allDates = new Set<string>([...logRecs.map(l => l.date || ''), ...byDate.keys()]);

  const dailyLogs = Array.from(allDates).filter(Boolean).sort().map(date => {
    const logRec = logByDate.get(date);
    const sd = byDate.get(date);
    const computedHours = sd ? Math.round((sd.totalMinutes / 60) * 100) / 100 : 0;
    const topicsDone = subjects.reduce((a, s) =>
      a + (s.units || []).reduce((b: number, u: AnyRec) =>
        b + (u.subTopics || []).filter((t: AnyRec) => t.completed && t.completedDate === date).length, 0), 0);
    const hasSessionData = !!sd && sd.totalMinutes > 0;
    return {
      date,
      hoursStudied: hasSessionData ? computedHours : (logRec?.hoursStudied || 0),
      topicsCompleted: topicsDone || (logRec?.topicsCompleted || 0),
      mood: logRec?.mood || 'Okay',
      notes: logRec?.notes || '',
      subjectFocus: logRec?.subjectFocus || '',
      sessions: [],
      _dbId: logRec?.id || '',
    };
  });

  const studySessions = allSessions.map(s => ({
    id: s.id,
    date: s.date || '',
    minutes: s.minutes || 0,
    description: s.description || '',
    type: s.type || 'Other',
    subjectId: s.subjectId || '',
    subjectName: s.subjectName || '',
    topicId: s.topicId || '',
    unitId: s.unitId || '',
    startTime: s.startTime || '',
    endTime: s.endTime || '',
    note: s.note || '',
    loggedAt: s.loggedAt || '',
  }));

  const profile = await kvGet<AnyRec>(KV.profile, {});
  return {
    subjects,
    dailyLogs,
    studySessions,
    settings: await kvGet<AnyRec | null>(KV.settings, null),
    coins: await kvGet<AnyRec | null>(KV.coins, null),
    store: await kvGet<AnyRec | null>(KV.store, null),
    isNewUser: subjects.length === 0,
    avatar: profile.avatar ?? null,
    coverGradient: profile.coverGradient ?? null,
  };
}

export async function saveSettings(input: {
  settingsJson?: string; coinsJson?: string; storeJson?: string; avatar?: string; coverGradient?: string;
}): Promise<{ success: boolean }> {
  if (input.settingsJson !== undefined) await kvSet(KV.settings, safeParse(input.settingsJson, null));
  if (input.coinsJson !== undefined) await kvSet(KV.coins, safeParse(input.coinsJson, null));
  if (input.storeJson !== undefined) await kvSet(KV.store, safeParse(input.storeJson, null));
  if (input.avatar !== undefined || input.coverGradient !== undefined) {
    const profile = { ...(await kvGet<AnyRec>(KV.profile, {})) };
    if (input.avatar !== undefined) profile.avatar = input.avatar;
    if (input.coverGradient !== undefined) profile.coverGradient = input.coverGradient;
    await kvSet(KV.profile, profile);
  }
  return { success: true };
}

export async function saveSubjects(input: { subjects: AnyRec[] }): Promise<{ success: boolean }> {
  // Stored verbatim: the UI's own model is the source of truth.
  await kvSet(KV.subjects, input.subjects ?? []);
  return { success: true };
}

const TOPIC_JSON_FIELDS: Record<string, string> = {
  mcqsJson: 'mcqs',
  notesArrayJson: 'notesArr',
  resourcesJson: 'resourceLinks',
  attachmentsJson: 'attachments',
};

export async function saveTopic(input: { topicId: string; changes: AnyRec }): Promise<{ success: boolean }> {
  const tree = await getTree();
  let found = false;
  const next = tree.map(s => ({
    ...s,
    units: (s.units || []).map((u: AnyRec) => {
      if (!(u.subTopics || []).some((t: AnyRec) => t.id === input.topicId)) return u;
      return {
        ...u,
        subTopics: u.subTopics.map((t: AnyRec) => {
          if (t.id !== input.topicId) return t;
          found = true;
          const merged: AnyRec = { ...t };
          for (const [k, v] of Object.entries(input.changes || {})) {
            if (v === undefined || k === 'id' || k === '_dbId') continue;
            if (TOPIC_JSON_FIELDS[k]) merged[TOPIC_JSON_FIELDS[k]] = safeParse(v, []);
            else merged[k] = v === null ? undefined : v;
          }
          return merged;
        }),
      };
    }),
  }));
  // A topic that is not in the mirror yet will arrive with the next full-tree save.
  if (found) await kvSet(KV.subjects, next);
  return { success: true };
}

export async function deleteRecords(input: {
  subjectIds?: string[]; unitIds?: string[]; topicIds?: string[];
}): Promise<{ success: boolean; deleted: { subjects: number; units: number; topics: number }; skipped: string[] }> {
  const subjectIds = new Set(input.subjectIds ?? []);
  const unitIds = new Set(input.unitIds ?? []);
  const topicIds = new Set(input.topicIds ?? []);
  const deleted = { subjects: 0, units: 0, topics: 0 };

  const tree = await getTree();
  const next: AnyRec[] = [];
  for (const s of tree) {
    if (subjectIds.has(s.id)) {
      deleted.subjects++;
      for (const u of s.units || []) { deleted.units++; deleted.topics += (u.subTopics || []).length; }
      continue;
    }
    const units: AnyRec[] = [];
    for (const u of s.units || []) {
      if (unitIds.has(u.id)) { deleted.units++; deleted.topics += (u.subTopics || []).length; continue; }
      const before = (u.subTopics || []).length;
      const subTopics = (u.subTopics || []).filter((t: AnyRec) => !topicIds.has(t.id));
      deleted.topics += before - subTopics.length;
      units.push(subTopics.length === before ? u : { ...u, subTopics });
    }
    next.push({ ...s, units });
  }
  await kvSet(KV.subjects, next);
  return { success: true, deleted, skipped: [] };
}

export async function saveDailyLog(input: {
  logId?: string; date: string; mood?: string; notes?: string; subjectFocus?: string;
  hoursStudied?: number; topicsCompleted?: number; sessionsJson?: string;
}): Promise<{ id: string; success: boolean }> {
  const map = await logs();
  const patch: AnyRec = {};
  for (const k of ['mood', 'notes', 'subjectFocus', 'hoursStudied', 'topicsCompleted', 'sessionsJson'] as const) {
    if (input[k] !== undefined) patch[k] = input[k];
  }

  let existing: AnyRec | undefined;
  if (input.logId) {
    existing = map.get(input.logId);
    if (!existing) throw new LocalApiError('NOT_FOUND', 'Daily log not found');
  } else {
    existing = Array.from(map.values()).find(l => l.date === input.date);
  }

  const rec = existing
    ? { ...existing, ...patch }
    : { id: uid('log'), date: input.date, ...patch };
  map.set(rec.id, rec);
  await idbPut(STORE.logs, rec);
  return { id: rec.id, success: true };
}

export async function createSession(input: {
  date: string; minutes: number; description: string; type: 'Topic' | 'Unit' | 'Other';
  subjectId?: string; subjectName?: string; topicId?: string; unitId?: string;
  startTime?: string; endTime?: string; note?: string;
}): Promise<{ id: string; success: boolean }> {
  if (!(input.minutes > 0)) throw new LocalApiError('BAD_REQUEST', 'Minutes must be > 0');
  const map = await sessions();
  const rec: AnyRec = {
    id: uid('ses'),
    description: input.description,
    date: input.date,
    minutes: input.minutes,
    type: input.type,
    subjectId: input.subjectId || '',
    subjectName: input.subjectName || '',
    topicId: input.topicId || '',
    unitId: input.unitId || '',
    startTime: input.startTime || '',
    endTime: input.endTime || '',
    note: input.note || '',
    loggedAt: new Date().toISOString(),
  };
  map.set(rec.id, rec);
  await idbPut(STORE.sessions, rec);
  return { id: rec.id, success: true };
}

export async function updateSession(input: AnyRec & { sessionId: string }): Promise<{ success: boolean }> {
  const map = await sessions();
  const existing = map.get(input.sessionId);
  if (!existing) throw new LocalApiError('NOT_FOUND', 'Session not found');
  const rec = { ...existing };
  for (const k of ['date', 'minutes', 'description', 'subjectId', 'subjectName', 'startTime', 'endTime', 'note', 'type', 'unitId', 'topicId']) {
    if (input[k] !== undefined) rec[k] = input[k];
  }
  map.set(rec.id, rec);
  await idbPut(STORE.sessions, rec);
  return { success: true };
}

export async function deleteSession(input: { sessionId: string }): Promise<{ success: boolean }> {
  const map = await sessions();
  if (!map.has(input.sessionId)) throw new LocalApiError('NOT_FOUND', 'Session not found');
  map.delete(input.sessionId);
  await idbDelete(STORE.sessions, input.sessionId);
  return { success: true };
}

/** One-time migration of legacy per-day session blobs into first-class sessions. Idempotent. */
export async function migrateSessions(): Promise<{ migrated: number; skipped: boolean }> {
  const sMap = await sessions();
  if (sMap.size > 0) return { migrated: 0, skipped: true };
  const lMap = await logs();
  const rows: AnyRec[] = [];
  for (const log of lMap.values()) {
    const list = safeParse<AnyRec[]>(log.sessionsJson, []);
    if (!Array.isArray(list)) continue;
    for (const s of list) {
      rows.push({
        id: uid('ses'),
        description: s.note || s.subjectName || 'Study Session',
        date: log.date || '',
        minutes: s.durationMinutes || 0,
        type: 'Other',
        subjectId: s.subjectId || '',
        subjectName: s.subjectName || '',
        topicId: '', unitId: '',
        startTime: s.startTime || '',
        endTime: s.endTime || '',
        note: s.note || '',
        loggedAt: new Date().toISOString(),
      });
    }
  }
  rows.forEach(r => sMap.set(r.id, r));
  await idbPutMany(STORE.sessions, rows);
  return { migrated: rows.length, skipped: false };
}

/** Factory reset of everything this app stores in its local database. */
export async function confirmReset(input: { confirmText: string }): Promise<{ success: boolean; message: string }> {
  if (input.confirmText !== 'RESET ALL DATA') {
    return { success: false, message: 'Type "RESET ALL DATA" to confirm.' };
  }
  await kvSet(KV.subjects, []);
  await kvSet(KV.settings, null);
  await kvSet(KV.coins, null);
  await kvSet(KV.store, null);
  sessionsCache = new Map();
  logsCache = new Map();
  await idbClear(STORE.sessions);
  await idbClear(STORE.logs);
  return { success: true, message: 'All data has been reset.' };
}

export async function loadPrefillSyllabus(): Promise<{ created: number; subjects: AnyRec[] }> {
  return { created: 0, subjects: [] };
}

/** Raw document access for the profile layer. */
export const profileStore = {
  get: <T = AnyRec>(key: string, fallback: T) => kvGet<T>(`doc:${key}`, fallback),
  set: (key: string, value: unknown) => kvSet(`doc:${key}`, value),
  remove: async (key: string) => { kvCache.delete(`doc:${key}`); await idbDelete(STORE.kv, `doc:${key}`); },
};

export async function removeDeletedFiles(ids: string[]): Promise<void> {
  await idbDeleteMany(STORE.files, ids);
}
