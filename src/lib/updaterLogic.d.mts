export function parseVersion(input: unknown): { nums: [number, number, number]; pre: string } | null;
export function compareVersions(a: string, b: string): -1 | 0 | 1;
export function normalizeDigest(d: unknown): string | null;
export function pickApkAsset(assets: unknown): { name: string; url: string; size: number | null; sha256: string | null } | null;
export function isTrustedDownloadUrl(url: string, owner: string, repo: string): boolean;
export function formatBytes(n: number | null | undefined): string;
export const AUTO_CHECK_INTERVAL_MS: number;
export function shouldAutoCheck(lastCheckedAt: number | null | undefined, now?: number, interval?: number): boolean;
export function summarizeNotes(body: string | null | undefined, maxLines?: number): string;
