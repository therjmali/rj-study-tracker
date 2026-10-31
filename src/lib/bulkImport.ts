/**
 * Bulk subject import / export.
 *
 * Accepts any mix of .json and .zip files (zips may hold many JSON files, one level of
 * nested zips is also opened). Understands: a single subject, an array of subjects,
 * `{ subjects: [...] }`, and full app backups (`{ appState: { subjects } }`).
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import type { Subject } from '../types';

export interface ParsedSource {
  /** Display path, e.g. "pack.zip › OBG/unit1.json" */
  path: string;
  subjects: Subject[];
  error?: string;
}

export interface Candidate {
  key: string;
  source: string;
  subject: Subject;
  units: number;
  topics: number;
  /** Existing subject with the same name (case-insensitive), if any. */
  existingId?: string;
  /** Another candidate earlier in this batch has the same name. */
  duplicateInBatch: boolean;
}

export type DuplicateMode = 'keep-both' | 'skip' | 'replace';

const MAX_ENTRIES = 3000;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const PALETTE = ['#3B82F6', '#8B5CF6', '#10B981', '#F97316', '#EC4899', '#06B6D4', '#EF4444', '#84CC16', '#F59E0B', '#14B8A6'];

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

function newId(prefix: string): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${Date.now().toString(36)}-${r}`;
}

/* ───────────────────────────── reading ───────────────────────────── */

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);
}

export function extractSubjects(data: unknown): Subject[] {
  const asSubject = (s: unknown): Subject | null =>
    isObj(s) && typeof s.name === 'string' && s.name.trim() && (Array.isArray(s.units) || Array.isArray(s.topics) || Array.isArray(s.subTopics))
      ? (s as unknown as Subject)
      : null;

  if (Array.isArray(data)) return data.map(asSubject).filter((s): s is Subject => !!s);
  if (!isObj(data)) return [];
  if (Array.isArray(data.subjects)) return extractSubjects(data.subjects);
  if (isObj(data.appState) && Array.isArray(data.appState.subjects)) return extractSubjects(data.appState.subjects);
  if (isObj(data.data) && Array.isArray(data.data.subjects)) return extractSubjects(data.data.subjects);
  const single = asSubject(data);
  return single ? [single] : [];
}

function parseJsonText(path: string, text: string): ParsedSource {
  try {
    const subjects = extractSubjects(JSON.parse(text.replace(/^\uFEFF/, '')));
    return subjects.length ? { path, subjects } : { path, subjects: [], error: 'No subjects found in this file' };
  } catch {
    return { path, subjects: [], error: 'Not valid JSON' };
  }
}

function readZip(path: string, bytes: Uint8Array, depth: number, budget: { entries: number; bytes: number }): ParsedSource[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: f => {
        if (f.name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(f.name)) return false;
        if (!/\.(json|txt|zip)$/i.test(f.name)) return false;
        budget.entries += 1;
        budget.bytes += f.originalSize;
        return budget.entries <= MAX_ENTRIES && budget.bytes <= MAX_TOTAL_BYTES;
      },
    });
  } catch {
    return [{ path, subjects: [], error: 'Could not open this ZIP file' }];
  }
  if (budget.entries > MAX_ENTRIES || budget.bytes > MAX_TOTAL_BYTES) {
    return [{ path, subjects: [], error: 'ZIP is too large or has too many files' }];
  }
  const out: ParsedSource[] = [];
  for (const name of Object.keys(files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const full = `${path} › ${name}`;
    const content = files[name];
    if (/\.zip$/i.test(name)) {
      if (depth < 1) out.push(...readZip(full, content, depth + 1, budget));
      continue;
    }
    out.push(parseJsonText(full, strFromU8(content)));
  }
  if (!out.length) out.push({ path, subjects: [], error: 'No .json files inside this ZIP' });
  return out;
}

export async function readSources(files: File[]): Promise<ParsedSource[]> {
  const out: ParsedSource[] = [];
  const budget = { entries: 0, bytes: 0 };
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (looksLikeZip(bytes) || /\.zip$/i.test(file.name)) out.push(...readZip(file.name, bytes, 0, budget));
      else out.push(parseJsonText(file.name, strFromU8(bytes)));
    } catch {
      out.push({ path: file.name, subjects: [], error: 'Could not read this file' });
    }
  }
  return out;
}

/* ───────────────────────────── normalising ───────────────────────────── */

const countTopics = (s: Subject) => (s.units || []).reduce((a, u) => a + (u.subTopics?.length || 0), 0);

export function buildCandidates(sources: ParsedSource[], existing: Subject[]): Candidate[] {
  const existingByName = new Map(existing.map(s => [s.name.trim().toLowerCase(), s.id]));
  const seen = new Set<string>();
  const out: Candidate[] = [];
  let i = 0;
  for (const src of sources) {
    for (const raw of src.subjects) {
      const subject = normaliseSubject(raw, i);
      const nameKey = subject.name.trim().toLowerCase();
      out.push({
        key: `${i++}`,
        source: src.path,
        subject,
        units: subject.units.length,
        topics: countTopics(subject),
        existingId: existingByName.get(nameKey),
        duplicateInBatch: seen.has(nameKey),
      });
      seen.add(nameKey);
    }
  }
  return out;
}

/** Fill every field the UI relies on, without discarding extra fields. */
export function normaliseSubject(raw: any, index = 0): Subject {
  const name = String(raw.name ?? '').trim() || 'Untitled subject';
  const unitsIn: any[] = Array.isArray(raw.units) ? raw.units : Array.isArray(raw.topics) || Array.isArray(raw.subTopics)
    ? [{ name: 'General', subTopics: raw.topics ?? raw.subTopics }] : [];
  const units = unitsIn.filter(u => u && (typeof u === 'object')).map((u, ui) => {
    const topicsIn: any[] = Array.isArray(u.subTopics) ? u.subTopics : Array.isArray(u.topics) ? u.topics : [];
    return {
      ...u,
      id: String(u.id || newId('unit')),
      name: String(u.name ?? `Unit ${ui + 1}`),
      timeSpent: typeof u.timeSpent === 'number' ? u.timeSpent : 0,
      timeEntries: Array.isArray(u.timeEntries) ? u.timeEntries : [],
      subTopics: topicsIn
        .map(t => (typeof t === 'string' ? { name: t } : t))
        .filter(t => t && typeof t === 'object' && String(t.name ?? '').trim())
        .map(t => ({
          ...t,
          id: String(t.id || newId('topic')),
          name: String(t.name),
          completed: !!t.completed,
          status: typeof t.status === 'string' ? t.status : (t.completed ? 'complete' : 'incomplete'),
          difficulty: ['Easy', 'Medium', 'Hard'].includes(t.difficulty) ? t.difficulty : 'Medium',
          notes: typeof t.notes === 'string' ? t.notes : '',
        })),
    };
  });
  return {
    ...raw,
    id: String(raw.id || newId('subj')),
    name,
    shortName: String(raw.shortName || name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).map((w: string) => w[0]).join('').slice(0, 5).toUpperCase() || name.slice(0, 4).toUpperCase()),
    color: typeof raw.color === 'string' && raw.color ? raw.color : PALETTE[index % PALETTE.length],
    examDate: typeof raw.examDate === 'string' ? raw.examDate : '',
    units,
  } as Subject;
}

function reId(s: Subject): Subject {
  return {
    ...s,
    id: newId('subj'),
    units: s.units.map(u => ({
      ...u,
      id: newId('unit'),
      subTopics: u.subTopics.map(t => ({ ...t, id: newId('topic') })),
    })),
  };
}

function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  let n = 2;
  while (taken.has(`${name} (${n})`.toLowerCase())) n++;
  return `${name} (${n})`;
}

export interface ApplyResult { subjects: Subject[]; added: number; replaced: number; skipped: number }

/** Merge the selected candidates into the existing list. Pure; returns the new full list. */
export function applyImport(existing: Subject[], picked: Candidate[], mode: DuplicateMode): ApplyResult {
  let list = [...existing];
  const usedIds = new Set<string>();
  const collectIds = (s: Subject) => { usedIds.add(s.id); s.units.forEach(u => { usedIds.add(u.id); u.subTopics.forEach(t => usedIds.add(t.id)); }); };
  list.forEach(collectIds);
  const names = new Set(list.map(s => s.name.trim().toLowerCase()));
  let added = 0, replaced = 0, skipped = 0;

  for (const c of picked) {
    let s = c.subject;
    const clash = names.has(s.name.trim().toLowerCase());

    if (clash && mode === 'skip') { skipped++; continue; }

    if (clash && mode === 'replace') {
      const idx = list.findIndex(x => x.name.trim().toLowerCase() === s.name.trim().toLowerCase());
      if (idx >= 0) {
        // Keep the original ids when they were from the same subject, so sessions stay linked.
        const keepIds = s.id === list[idx].id;
        const next = keepIds ? s : { ...reId(s), id: list[idx].id, folderId: list[idx].folderId, order: list[idx].order };
        list[idx] = { ...next, folderId: list[idx].folderId ?? next.folderId };
        collectIds(list[idx]);
        replaced++;
        continue;
      }
    }

    if (clash) s = { ...s, name: uniqueName(s.name, names) };
    const anyIdClash = usedIds.has(s.id) || s.units.some(u => usedIds.has(u.id) || u.subTopics.some(t => usedIds.has(t.id)));
    if (anyIdClash) s = { ...reId(s), name: s.name };
    list.push(s);
    names.add(s.name.trim().toLowerCase());
    collectIds(s);
    added++;
  }
  return { subjects: list, added, replaced, skipped };
}

/* ───────────────────────────── export ───────────────────────────── */

const safeFile = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60) || 'subject';

/** One JSON per subject plus a manifest — re-importable by `readSources`. */
export function buildSubjectsZip(subjects: Subject[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  const pad = String(subjects.length).length;
  subjects.forEach((s, i) => {
    entries[`${String(i + 1).padStart(Math.max(2, pad), '0')}-${safeFile(s.name)}.json`] = strToU8(JSON.stringify(s, null, 2));
  });
  entries['manifest.json'] = strToU8(JSON.stringify({
    app: 'RJ Tracker Pro', exportedAt: new Date().toISOString(), subjects: subjects.length,
    topics: subjects.reduce((a, s) => a + countTopics(s), 0),
  }, null, 2));
  return zipSync(entries, { level: 6 });
}
