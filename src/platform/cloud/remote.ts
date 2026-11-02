/**
 * Remote data access for the sync engine — every call is a Postgres function
 * (see supabase/schema.sql) that works only on the signed-in user's own rows.
 * Same contract the old Node server had: pull (incremental), push with a base
 * version (conflict → 409 → merge → retry), restore points, wipe.
 */
import { CloudError, toCloudError } from './http';
import { getSupabase } from './supabase';
import { getDeviceIdentity } from './device';

export interface RemoteSectionMeta { hash: string; updatedAt: string; deviceId?: string | null }
export interface RemoteDoc {
  version: number;
  updatedAt: string;
  sections: Record<string, RemoteSectionMeta>;
  data: Record<string, unknown>;
  changedKeys?: string[];
  bytes?: number;
}
export interface PushResult {
  version: number;
  updatedAt: string;
  sections: Record<string, RemoteSectionMeta>;
  applied: string[];
  rejected?: Array<{ key: string; reason: string }>;
  unchanged?: boolean;
}
export interface RevisionRow { version: number; at: string; deviceId: string | null; keys: string[]; bytes: number }

const TIMEOUT_MS = 25_000;

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await getSupabase().rpc(fn, args).abortSignal(controller.signal);
    if (error) throw toCloudError(error);
    return data as T;
  } catch (err) {
    throw toCloudError(err);
  } finally {
    clearTimeout(timer);
  }
}

/** "key:hash,key:hash" (the engine's format) → { key: hash } */
function parseHave(have: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const part of have.split(',')) {
    const i = part.lastIndexOf(':');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return Object.keys(out).length ? out : null;
}

export function pullDoc(have: string): Promise<RemoteDoc> {
  return rpc<RemoteDoc>('sync_pull', { p_have: have ? parseHave(have) : null });
}

export async function pushDoc(body: {
  baseVersion: number;
  sections: Record<string, { value: unknown; updatedAt: string }>;
  deletions: string[];
}): Promise<PushResult> {
  const res = await rpc<PushResult & { conflict?: boolean }>('sync_push', {
    p_base_version: body.baseVersion,
    p_sections: body.sections,
    p_deletions: body.deletions,
    p_device_id: getDeviceIdentity().id,
  });
  if (res.conflict) {
    throw new CloudError('Another device saved changes first. Merging…', 'version_conflict', 409, res as unknown as Record<string, unknown>);
  }
  return res;
}

export async function listRevisions(): Promise<RevisionRow[]> {
  const res = await rpc<{ revisions: RevisionRow[] }>('sync_revisions_list', {});
  return res.revisions ?? [];
}

export function restoreRevisionRemote(version: number): Promise<RemoteDoc> {
  return rpc<RemoteDoc>('sync_restore', { p_version: version, p_device_id: getDeviceIdentity().id });
}

export async function wipeRemote(): Promise<void> {
  await rpc('sync_wipe', { p_device_id: getDeviceIdentity().id });
}
