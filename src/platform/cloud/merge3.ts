/**
 * Generic three-way merge for JSON documents.
 *
 * Used by the sync engine on the app's localStorage sections: the *base* is the
 * last value that both this device and the cloud agreed on, *local* is what this
 * device has now and *remote* is what the server holds. That lets two phones add
 * different topics in the same hour and both keep their work — a plain
 * last-write-wins upload would silently delete one of them.
 *
 * Rules
 * -----
 *  • Only one side changed a value → take that side.
 *  • Both changed it to the same thing → fine.
 *  • Both changed differently → objects merge per key, arrays of objects with a
 *    stable id (`id`, else `date`, else `key`) merge per element, everything
 *    else resolves to the local value **and is recorded as a conflict** so the
 *    UI can show exactly what happened and offer the cloud copy.
 *  • Deletions are respected: an element present in the base but missing on one
 *    side is treated as deleted when the other side did not touch it.
 */

export interface MergeConflict {
  path: string;
  base: unknown;
  local: unknown;
  remote: unknown;
  resolution: 'local' | 'remote';
}

export interface MergeResult<T = unknown> {
  value: T;
  conflicts: MergeConflict[];
  /** Number of leaf values that both sides changed differently. */
  conflictCount: number;
}

const MAX_DEPTH = 40;

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return stableStringify(a) === stableStringify(b);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** The stable identity of a list item: id → date → key. */
function identityOf(item: unknown): string | null {
  if (!isPlainObject(item)) return null;
  for (const field of ['id', 'date', 'key', 'topicId', 'subjectId']) {
    const value = item[field];
    if (typeof value === 'string' && value) return `${field}:${value}`;
    if (typeof value === 'number' && Number.isFinite(value)) return `${field}:${value}`;
  }
  return null;
}

function arrayIdentityMap(items: unknown): Map<string, unknown> | null {
  if (!Array.isArray(items)) return null;
  const map = new Map<string, unknown>();
  for (const item of items) {
    const id = identityOf(item);
    if (!id || map.has(id)) return null; // not a keyed collection → treat as a value
    map.set(id, item);
  }
  return map;
}

interface Ctx {
  conflicts: MergeConflict[];
  depth: number;
}

function mergeValue(base: unknown, local: unknown, remote: unknown, path: string, ctx: Ctx): unknown {
  if (deepEqual(local, remote)) return local;

  const hasBase = base !== undefined;
  if (hasBase && deepEqual(base, local)) return remote;
  if (hasBase && deepEqual(base, remote)) return local;

  if (ctx.depth >= MAX_DEPTH) {
    ctx.conflicts.push({ path, base, local, remote, resolution: 'local' });
    return local;
  }
  ctx.depth++;

  try {
    // Objects: merge key by key.
    if (isPlainObject(local) && isPlainObject(remote)) {
      const baseObj = isPlainObject(base) ? base : {};
      const out: Record<string, unknown> = {};
      const keys = new Set([...Object.keys(baseObj), ...Object.keys(local), ...Object.keys(remote)]);
      for (const key of keys) {
        const childPath = path ? `${path}.${key}` : key;
        const b = baseObj[key];
        const l = local[key];
        const r = remote[key];
        if (l === undefined && r === undefined) continue;
        // Deletion on one side, untouched on the other → deletion wins.
        if (l === undefined) {
          if (b !== undefined && deepEqual(b, r)) continue;
          out[key] = r;
          if (b !== undefined) ctx.conflicts.push({ path: childPath, base: b, local: undefined, remote: r, resolution: 'remote' });
          continue;
        }
        if (r === undefined) {
          if (b !== undefined && deepEqual(b, l)) continue;
          out[key] = l;
          if (b !== undefined) ctx.conflicts.push({ path: childPath, base: b, local: l, remote: undefined, resolution: 'local' });
          continue;
        }
        out[key] = mergeValue(b, l, r, childPath, ctx);
      }
      return out;
    }

    // Keyed arrays: merge element by element, keeping the local order and
    // appending anything the other device added.
    if (Array.isArray(local) && Array.isArray(remote)) {
      const baseMap = arrayIdentityMap(base) ?? new Map<string, unknown>();
      const localMap = arrayIdentityMap(local);
      const remoteMap = arrayIdentityMap(remote);
      if (localMap && remoteMap) {
        const merged: unknown[] = [];
        const seen = new Set<string>();
        for (const [id, localItem] of localMap) {
          seen.add(id);
          if (!remoteMap.has(id)) {
            const b = baseMap.get(id);
            if (b !== undefined && deepEqual(localItem, b)) continue; // deleted remotely
            if (b !== undefined) {
              ctx.conflicts.push({ path: `${path}[${id}]`, base: b, local: localItem, remote: undefined, resolution: 'local' });
            }
            merged.push(localItem);
            continue;
          }
          merged.push(mergeValue(baseMap.get(id), localItem, remoteMap.get(id), `${path}[${id}]`, ctx));
        }
        for (const [id, remoteItem] of remoteMap) {
          if (seen.has(id)) continue;
          const b = baseMap.get(id);
          if (b !== undefined && deepEqual(remoteItem, b)) continue; // deleted locally
          if (b !== undefined) {
            ctx.conflicts.push({ path: `${path}[${id}]`, base: b, local: undefined, remote: remoteItem, resolution: 'remote' });
          }
          merged.push(remoteItem);
        }
        return merged;
      }
    }

    // Real disagreement on a scalar (or an unkeyed array): keep this device's
    // value, and tell the user precisely what the other device had.
    ctx.conflicts.push({ path, base, local, remote, resolution: 'local' });
    return local;
  } finally {
    ctx.depth--;
  }
}

export function mergeThreeWay<T = unknown>(base: unknown, local: unknown, remote: unknown, rootPath = ''): MergeResult<T> {
  const ctx: Ctx = { conflicts: [], depth: 0 };
  const value = mergeValue(base, local, remote, rootPath, ctx);
  return {
    value: value as T,
    conflicts: ctx.conflicts,
    conflictCount: ctx.conflicts.length,
  };
}

/** Human-readable one-liner used by the Sync Center conflict list. */
export function describeConflict(conflict: MergeConflict): string {
  const fmt = (v: unknown) => {
    if (v === undefined) return 'removed';
    if (v === null) return 'empty';
    if (typeof v === 'string') return v.length > 48 ? `${v.slice(0, 45)}…` : v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
    if (isPlainObject(v)) {
      const name = (v as Record<string, unknown>).name;
      if (typeof name === 'string') return name;
      return `${Object.keys(v).length} fields`;
    }
    return String(v);
  };
  return `${fmt(conflict.remote)} on the other device · kept ${fmt(conflict.local)} here`;
}
