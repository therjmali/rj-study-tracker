export type ProviderId = 'gemini' | 'groq' | 'openai' | 'anthropic' | 'cohere';
export interface ProviderMeta {
  label: string; short: string; color: string; keyUrl: string; keyHint: string; keyPrefix: RegExp | null;
  defaultMain: string; defaultFast: string; note: string; host: string;
}
export const PROVIDER_IDS: ProviderId[];
export const PROVIDER_META: Record<ProviderId, ProviderMeta>;
export const AI_HOSTS: string[];
export interface ChatMsg { role: 'user' | 'assistant'; content: string }
export interface RequestParams { key: string; model: string; system: string; messages: ChatMsg[]; maxTokens: number; json?: boolean; stream?: boolean }
export interface BuiltRequest { url: string; init: { method: string; headers?: Record<string, string>; body?: string } }
export function buildRequest(provider: ProviderId, p: RequestParams): BuiltRequest;
export function readChunk(provider: ProviderId, data: any, stream: boolean): string;
export function buildModelsRequest(provider: ProviderId, key: string): BuiltRequest;
export function parseModelList(provider: ProviderId, json: any): string[];
export function shouldFallback(code: string | undefined): boolean;
export function maskKey(key: string | undefined): string;
export function looksLikeKey(provider: ProviderId, key: string | undefined): { ok: boolean; hint: string };
