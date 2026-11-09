export const PERF_MODES: ['auto', 'smooth', 'full'];
export type PerfMode = 'auto' | 'smooth' | 'full';
export interface PerfInput { mode?: PerfMode; deviceMemory?: number | null; cores?: number | null; saveData?: boolean; reducedMotion?: boolean; autoLite?: boolean }
export function jankRatio(deltas: number[], thresholdMs?: number): number;
export function windowIsJanky(deltas: number[], minFrames?: number, ratio?: number): boolean;
export function shouldUseLite(input?: PerfInput): boolean;
export function liteReason(input?: PerfInput): string | null;
