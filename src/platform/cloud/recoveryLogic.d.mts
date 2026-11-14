export type ParsedRecovery =
  | { kind: 'none' }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'token_hash'; tokenHash: string }
  | { kind: 'error'; code: string; message: string };
export type ResetStep = 'request' | 'verify' | 'link' | 'update';
export const CODE_MIN: number;
export const CODE_MAX: number;
export const RESEND_COOLDOWN_MS: number;
export const PASSWORD_MIN: number;
export const PASSWORD_MAX: number;
export function parseRecoveryUrl(href: string): ParsedRecovery;
export function stripRecoveryParams(href: string): string;
export function isValidEmail(value: string): boolean;
export function normalizeCode(input: string): string;
export function isCodeComplete(code: string): boolean;
export function passwordProblems(password: string): string | null;
export function passwordScore(password: string): { score: number; label: string };
export function resendRemainingMs(lastSentAtMs: number, nowMs: number, cooldownMs?: number): number;
export function mapResetError(
  err: { message?: string; code?: string; error_code?: string; status?: number } | null | undefined,
  step?: ResetStep,
): { code: string; message: string };
