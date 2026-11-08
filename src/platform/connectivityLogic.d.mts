export type NetStatus = 'online' | 'offline' | 'degraded';
export type PillTone = 'neutral' | 'ok' | 'info' | 'warn' | 'danger';
export type PillKind = 'reconnected' | 'offline' | 'local' | 'degraded' | 'error' | 'syncing' | 'paused' | 'pending' | 'synced' | 'ready';
export interface PillInput {
  signedIn?: boolean; status?: NetStatus; phase?: string; pendingCount?: number;
  lastSyncAtMs?: number | null; nowMs?: number; reconnectedAtMs?: number | null;
}
export interface PillModel { kind: PillKind; tone: PillTone; label: string; detail: string; busy: boolean }
export const BACKOFF_MS: number[];
export const ONLINE_RECHECK_MS: number;
export const DEGRADED_AFTER_FAILURES: number;
export const RECONNECTED_FLASH_MS: number;
export function retryDelay(attempt: number): number;
export function resolveStatus(input: { navigatorOnline: boolean; probeOk: boolean | null; failures: number }): NetStatus;
export function formatAgo(thenMs: number | null | undefined, nowMs: number): string;
export function derivePill(input: PillInput): PillModel;
