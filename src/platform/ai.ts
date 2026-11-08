/**
 * AI layer — runs entirely in the browser with the student's *own* API keys.
 *
 * Five partners: Google Gemini · Groq · OpenAI GPT · Anthropic Claude · Cohere.
 * Keys never leave the device except in the request to the chosen provider, are never synced, and are
 * excluded from backups unless the student opts in. If the active provider is rate-limited, rejects
 * its key or has an outage, the next provider that has a key is used automatically (can be turned off).
 */
import { LocalApiError } from './localDb';
import {
  PROVIDER_IDS, PROVIDER_META, buildRequest, buildModelsRequest, parseModelList, readChunk, shouldFallback,
  type ProviderId, type ProviderMeta,
} from './aiProviders.mjs';
import { renderEnginePrompt, type Telemetry } from '../lib/tutorTelemetryLogic.mjs';

export type AiProvider = ProviderId;
export const PROVIDER_ORDER: AiProvider[] = PROVIDER_IDS;

/** Result of the last "Test key" (never contains the key itself). */
export interface KeyStatus { ok: boolean; at: number; ms?: number; code?: string; error?: string; models?: string[] }

export interface AiSettings {
  provider: AiProvider;
  keys: Partial<Record<AiProvider, string>>;
  models: Partial<Record<AiProvider, { main?: string; fast?: string }>>;
  /** Switch to the next provider that has a key when the active one fails (default on). */
  fallback?: boolean;
  status?: Partial<Record<AiProvider, KeyStatus>>;
}

export const PROVIDERS: Record<AiProvider, ProviderMeta> = PROVIDER_META;

const SETTINGS_KEY = 'rj-ai-settings-v1';
const CHANGE_EVENT = 'rj:ai-settings-changed';
const RUN_EVENT = 'rj:ai-run';
export const OPEN_SETTINGS_EVENT = 'rj:open-platform-settings';

/* ───────────────────────────── settings store ───────────────────────────── */

const DEFAULTS: AiSettings = { provider: 'gemini', keys: {}, models: {}, fallback: true, status: {} };
let cached: AiSettings | null = null;

export function getAiSettings(): AiSettings {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cached = {
      provider: parsed?.provider && PROVIDERS[parsed.provider as AiProvider] ? parsed.provider : DEFAULTS.provider,
      keys: parsed?.keys && typeof parsed.keys === 'object' ? parsed.keys : {},
      models: parsed?.models && typeof parsed.models === 'object' ? parsed.models : {},
      fallback: parsed?.fallback !== false,
      status: parsed?.status && typeof parsed.status === 'object' ? parsed.status : {},
    };
  } catch {
    cached = { ...DEFAULTS, keys: {}, models: {}, status: {} };
  }
  return cached;
}

export function saveAiSettings(next: AiSettings): void {
  cached = next;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* keep in memory */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeAiSettings(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

/** Providers that currently have a key, in display order. */
export function configuredProviders(s: AiSettings = getAiSettings()): AiProvider[] {
  return PROVIDER_ORDER.filter(p => !!s.keys[p]?.trim());
}

export function isAiConfigured(s: AiSettings = getAiSettings()): boolean {
  return configuredProviders(s).length > 0;
}

/** The order providers are tried in: the active one first, then (if enabled) every other provider with a key. */
export function aiCandidates(s: AiSettings = getAiSettings()): AiProvider[] {
  const have = configuredProviders(s);
  if (!have.length) return [];
  const activeHasKey = have.includes(s.provider);
  if (!activeHasKey && s.fallback === false) return [];
  const first = activeHasKey ? s.provider : have[0];
  return [first, ...(s.fallback === false ? [] : have.filter(p => p !== first))];
}

export function setProviderKey(provider: AiProvider, key: string): void {
  const s = getAiSettings();
  const keys = { ...s.keys, [provider]: key.trim() };
  const status = { ...(s.status ?? {}) }; delete status[provider];
  saveAiSettings({ ...s, keys, status, provider: s.keys[s.provider]?.trim() ? s.provider : provider });
}
export function removeProviderKey(provider: AiProvider): void {
  const s = getAiSettings();
  const keys = { ...s.keys }; delete keys[provider];
  const status = { ...(s.status ?? {}) }; delete status[provider];
  const left = PROVIDER_ORDER.filter(p => keys[p]?.trim());
  saveAiSettings({ ...s, keys, status, provider: s.provider === provider ? (left[0] ?? s.provider) : s.provider });
}
export function setActiveProvider(provider: AiProvider): void { saveAiSettings({ ...getAiSettings(), provider }); }
export function setFallbackEnabled(on: boolean): void { saveAiSettings({ ...getAiSettings(), fallback: on }); }
export function setProviderModel(provider: AiProvider, tier: 'main' | 'fast', model: string): void {
  const s = getAiSettings();
  saveAiSettings({ ...s, models: { ...s.models, [provider]: { ...s.models[provider], [tier]: model.trim() || undefined } } });
}
function recordStatus(provider: AiProvider, st: KeyStatus): void {
  const s = getAiSettings();
  saveAiSettings({ ...s, status: { ...(s.status ?? {}), [provider]: { ...st, models: st.models?.slice(0, 80) } } });
}

export function openAiSettings(): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { tab: 'ai' } }));
}

/** Show a helpful message for any AI failure; opens the settings sheet when no key is set. */
export function reportAiError(err: unknown, toast: { error: (m: string) => unknown; info: (m: string) => unknown }, fallback = 'AI request failed. Please try again.') {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'NO_API_KEY') {
    toast.info('Add a free AI key to unlock this feature.');
    openAiSettings();
    return;
  }
  toast.error(e?.message || fallback);
}

/* ───────────────────────────── last-run tracker (for the status chip) ───────────────────────────── */

export interface AiRun { provider: AiProvider; model: string; at: number; fellBackFrom?: AiProvider }
let lastRun: AiRun | null = null;
export function getLastAiRun(): AiRun | null { return lastRun; }
export function subscribeAiRun(cb: () => void): () => void {
  window.addEventListener(RUN_EVENT, cb);
  return () => window.removeEventListener(RUN_EVENT, cb);
}
function noteRun(provider: AiProvider, model: string, firstTried: AiProvider): void {
  lastRun = { provider, model, at: Date.now(), ...(provider !== firstTried ? { fellBackFrom: firstTried } : {}) };
  window.dispatchEvent(new Event(RUN_EVENT));
}

/* ───────────────────────────── provider plumbing ───────────────────────────── */

interface Msg { role: 'user' | 'assistant'; content: string }
type Tier = 'main' | 'fast';

interface CallOptions {
  system: string;
  messages: Msg[];
  maxTokens: number;
  tier: Tier;
  json?: boolean;
  signal?: AbortSignal;
}

function modelFor(provider: AiProvider, tier: Tier): string {
  const s = getAiSettings();
  const meta = PROVIDERS[provider];
  return (s.models[provider]?.[tier] || (tier === 'main' ? meta.defaultMain : meta.defaultFast)).trim();
}

function candidatesOrThrow(): AiProvider[] {
  const list = aiCandidates();
  if (!list.length) {
    const s = getAiSettings();
    const label = PROVIDERS[s.provider]?.label ?? 'AI';
    throw new LocalApiError('NO_API_KEY', isAiConfigured(s)
      ? `No API key for ${label}. Add one in AI settings, or turn on automatic provider switching.`
      : 'AI is not set up yet. Add an API key in AI settings.');
  }
  return list;
}

async function failFromResponse(res: Response): Promise<never> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.message || (typeof body?.error === 'string' ? body.error : '') || '';
  } catch { /* ignore */ }
  if (res.status === 401 || res.status === 403) {
    throw new LocalApiError('BAD_API_KEY', 'The AI provider rejected your API key. Check it in AI settings.');
  }
  if (res.status === 429) {
    throw new LocalApiError('RATE_LIMITED', 'AI rate limit or quota reached. Wait a minute, or check your provider plan.');
  }
  if (res.status === 404) {
    throw new LocalApiError('BAD_MODEL', `Model not found. ${detail || 'Check the model name in AI settings.'}`);
  }
  throw new LocalApiError('AI_ERROR', detail ? `AI error: ${detail}` : `AI request failed (${res.status}).`);
}

async function request(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new LocalApiError('NETWORK', 'Could not reach the AI provider. Check your internet connection.');
  }
  if (!res.ok) await failFromResponse(res);
  return res;
}

function build(opts: CallOptions, stream: boolean, provider: AiProvider) {
  const key = (getAiSettings().keys[provider] ?? '').trim();
  const model = modelFor(provider, opts.tier);
  const { url, init } = buildRequest(provider, {
    key, model, system: opts.system, messages: opts.messages, maxTokens: opts.maxTokens, json: opts.json, stream,
  });
  return { url, init: { ...init, signal: opts.signal } as RequestInit, read: (d: unknown) => readChunk(provider, d, stream), model };
}

async function complete(opts: CallOptions): Promise<string> {
  const list = candidatesOrThrow();
  let lastErr: unknown;
  for (let i = 0; i < list.length; i++) {
    const provider = list[i];
    try {
      const { url, init, read, model } = build(opts, false, provider);
      const res = await request(url, init);
      const text = read(await res.json()).trim();
      if (!text) throw new LocalApiError('EMPTY', 'The AI returned an empty answer. Please try again.');
      noteRun(provider, model, list[0]);
      return text;
    } catch (err) {
      lastErr = err;
      if ((err as Error)?.name === 'AbortError' || !shouldFallback((err as { code?: string })?.code) || i === list.length - 1) throw err;
    }
  }
  throw lastErr;
}

async function* streamOne(opts: CallOptions, provider: AiProvider): AsyncGenerator<string> {
  const { url, init, read } = build(opts, true, provider);
  const res = await request(url, init);
  if (!res.body) {
    const text = read(await res.json());
    if (text) yield text;
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const handle = (line: string): string => {
    if (!line.startsWith('data:')) return '';
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return '';
    try { return read(JSON.parse(payload)); } catch { return ''; }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      const chunk = handle(line);
      if (chunk) yield chunk;
    }
  }
  const tail = handle(buf.replace(/\r$/, ''));
  if (tail) yield tail;
}

/** Streams from the active provider; if it fails BEFORE the first word, the next provider with a key takes over. */
async function* streamText(opts: CallOptions): AsyncGenerator<string> {
  const list = candidatesOrThrow();
  for (let i = 0; i < list.length; i++) {
    const provider = list[i];
    let started = false;
    try {
      for await (const chunk of streamOne(opts, provider)) {
        if (!started) { started = true; noteRun(provider, modelFor(provider, opts.tier), list[0]); }
        yield chunk;
      }
      if (!started) throw new LocalApiError('EMPTY', 'The AI returned an empty answer. Please try again.');
      return;
    } catch (err) {
      if (started || (err as Error)?.name === 'AbortError' || !shouldFallback((err as { code?: string })?.code) || i === list.length - 1) throw err;
    }
  }
}

/** Free, instant "is this key alive?" check: lists the models the key can use and measures the round trip. */
export async function testProviderKey(provider: AiProvider, keyOverride?: string): Promise<KeyStatus> {
  const key = (keyOverride ?? getAiSettings().keys[provider] ?? '').trim();
  if (!key) throw new LocalApiError('NO_API_KEY', 'Paste your API key first.');
  const { url, init } = buildModelsRequest(provider, key);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  const t0 = performance.now();
  let status: KeyStatus;
  try {
    const res = await request(url, { ...init, signal: ctrl.signal });
    const models = parseModelList(provider, await res.json().catch(() => null));
    status = { ok: true, at: Date.now(), ms: Math.round(performance.now() - t0), models };
  } catch (err) {
    const e = err as { name?: string; code?: string; message?: string };
    if (e?.name === 'AbortError') throw new LocalApiError('NETWORK', 'The provider took too long to answer. Try again.');
    if (e?.code === 'NETWORK') throw err; // offline / blocked: says nothing about the key, so do not mark it bad
    status = { ok: false, at: Date.now(), code: e?.code, error: e?.message };
  } finally {
    clearTimeout(timer);
  }
  if ((getAiSettings().keys[provider] ?? '').trim() === key) recordStatus(provider, status);
  return status;
}

function extractJson<T>(text: string, kind: 'array' | 'object'): T {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const [open, close] = kind === 'array' ? ['[', ']'] : ['{', '}'];
  const start = cleaned.indexOf(open);
  const end = cleaned.lastIndexOf(close);
  if (start < 0 || end <= start) throw new LocalApiError('BAD_AI_RESPONSE', 'The AI answer could not be read. Please try again.');
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    throw new LocalApiError('BAD_AI_RESPONSE', 'The AI answer could not be read. Please try again.');
  }
}

/** Light connectivity check used by the settings sheet. */
export async function testAiConnection(): Promise<string> {
  const text = await complete({
    system: 'You are a connectivity test. Reply with the single word: ready',
    messages: [{ role: 'user', content: 'ping' }],
    maxTokens: 16,
    tier: 'fast',
  });
  return text.slice(0, 60);
}

/* ───────────────────────────── prompts (ported verbatim) ───────────────────────────── */

const BASE_SYSTEM_PROMPT = `You are NurseBot 🩺, an expert nursing tutor and personal study coach specializing in B.Sc. Nursing, NORCET, NCLEX, and nursing licensure exam preparation.

Your expertise covers:
- Obstetrics & Gynecology (OBG/Midwifery)
- Child Health Nursing (Pediatrics)
- Mental Health Nursing (Psychiatry)
- Nursing Management & Leadership
- Medical-Surgical Nursing
- Community Health Nursing
- Anatomy & Physiology
- Pharmacology & Drug Calculations

Response Guidelines:
1. Give clear, concise, exam-focused answers with bullet points and numbered lists
2. Use mnemonics when helpful (e.g., "APGAR" for newborn assessment)
3. Highlight exam-important points with 💡
4. For conditions: Definition → Causes → Signs/Symptoms → Management → Nursing Care
5. For drugs: class, dose, route, side effects, nursing considerations
6. Use simple language suitable for nursing students
7. If unsure, say so rather than guessing
8. Reference current Indian nursing guidelines (INC, NMC) when applicable
9. Add "🎯 Exam Tip" callouts for frequently asked questions
10. When explaining complex topics, use analogies and real-world examples`;

const PERSONALIZATION_RULES = `

CRITICAL PERSONALIZATION RULES — you MUST follow these in EVERY response:

1. **Address the student personally.** Use their name if available, or refer to them by their level title (e.g., "Hey Clinical Scholar!" or "Great question, Care Provider!"). Never give generic responses.

2. **Reference their ACTUAL data.** When you have student profile data above, cite specific numbers:
   - Their exact progress percentage, streak, XP, and level
   - Specific subjects they're strong/weak in (by name)
   - Their best day, first topic, and milestones
   - Today's specific activity count

3. **"What to study" questions → use their data:**
   - Recommend from Weak Spots first (Hard/Important uncompleted topics)
   - Then suggest least-completed subjects
   - If exams are approaching, prioritize exam-relevant subjects
   - Calculate topics/day needed to meet their goals
   - Consider their learning velocity and adjust recommendations

4. **"Quiz me" questions → personalize:**
   - Pick topics from their pending Hard/Important list
   - Focus on subjects with lowest completion %
   - If NORCET data exists, prioritize High-relevance topics
   - Reference which subject/unit the question comes from

5. **Progress questions → cite specifics:**
   - Mention exact numbers: "You've done 45/120 topics (37.5%)"
   - Compare to their goals: "You're 3 topics short of your daily target"
   - Reference their streak: "Amazing 12-day streak! Keep it up!"
   - Mention velocity trends: "You're averaging 5.2 topics/day"

6. **Emotional intelligence:**
   - If mood data shows stress/tiredness → be extra encouraging, suggest lighter topics or breaks
   - If streak is high → celebrate and motivate to maintain
   - If streak is 0 or low → be encouraging, not judgmental ("Let's get back on track!")
   - If they're behind on goals → realistic but hopeful advice

7. **Exam awareness:**
   - If exams are < 30 days away → increase urgency in study suggestions
   - Reference specific exam names and days remaining
   - Calculate if their pace is sufficient to cover remaining topics
   - Suggest high-yield topics for last-minute preparation

8. **SRS awareness:**
   - If topics are due for SRS review, remind them
   - Suggest reviewing due topics before studying new ones

9. **Never be generic.** Instead of "Keep studying!", say "You've covered 67% of Pediatrics — let's tackle those 5 remaining Hard topics in Child Growth & Development today!"

10. **Use emojis and formatting** to make responses engaging, scannable, and motivating.`;

/* ───────────────────────────── feature functions ───────────────────────────── */

export async function* studyChat(input: {
  messages: Msg[]; topicContext?: string; telemetry?: Telemetry;
}): AsyncGenerator<string> {
  let system: string;
  if (input.telemetry) {
    // Analytical-engine mode: real, app-computed telemetry + strict zero-hallucination rules.
    system = renderEnginePrompt(input.telemetry);
    if (input.topicContext) {
      system += `\n\n[SUPPLEMENTARY STUDENT PROFILE — secondary context. The telemetry above is authoritative; the same zero-hallucination rule applies.]\n${input.topicContext}`;
    }
  } else {
    system = BASE_SYSTEM_PROMPT;
    if (input.topicContext) {
      system += `\n\n--- STUDENT DATA (CONFIDENTIAL — use to personalize) ---\n${input.topicContext}`;
      system += PERSONALIZATION_RULES;
    }
  }
  yield* streamText({ system, messages: input.messages, maxTokens: 2048, tier: 'main' });
}

export interface McqQuestion { id: string; question: string; options: string[]; correctIndex: number; explanation: string }

export async function generateMCQ(input: {
  topicName: string; subjectName: string; difficulty?: 'Easy' | 'Medium' | 'Hard'; count?: number;
}): Promise<{ questions: McqQuestion[] }> {
  const count = input.count || 5;
  const difficulty = input.difficulty || 'Medium';
  const text = await complete({
    tier: 'main',
    json: false,
    maxTokens: 4096,
    system: 'You are an expert nursing exam question generator specializing in NORCET, NCLEX, and B.Sc. Nursing exams. Generate high-quality, exam-style MCQs.',
    messages: [{
      role: 'user',
      content: `Generate ${count} ${difficulty}-difficulty MCQs for the topic "${input.topicName}" in ${input.subjectName}.

Return ONLY a JSON array with this exact format (no markdown, no explanation):
[
  {
    "question": "...",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correctIndex": 0,
    "explanation": "..."
  }
]

Rules:
- Make questions exam-realistic (NORCET/NCLEX style)
- Include clinical scenario-based questions
- Explanations should be concise but educational
- Options should be plausible (no obvious wrong answers)
- Cover different aspects of the topic`,
    }],
  });
  const parsed = extractJson<any[]>(text, 'array');
  const stamp = Date.now();
  return {
    questions: parsed.map((q, i) => ({
      id: `mcq-${stamp}-${i}`,
      question: q.question || '',
      options: Array.isArray(q.options) ? q.options : [],
      correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0,
      explanation: q.explanation || '',
    })),
  };
}

export interface Flashcard { id: string; front: string; back: string; mnemonic?: string }

export async function generateFlashcards(input: {
  topicName: string; subjectName: string; count?: number;
}): Promise<{ flashcards: Flashcard[] }> {
  const count = input.count || 8;
  const text = await complete({
    tier: 'fast',
    maxTokens: 3000,
    system: 'You are an expert nursing educator. Generate concise, exam-focused flashcards for NORCET/NCLEX preparation.',
    messages: [{
      role: 'user',
      content: `Generate ${count} flashcards for the topic "${input.topicName}" in ${input.subjectName}.

Return ONLY a JSON array (no markdown):
[
  {
    "front": "Question or concept (keep concise)",
    "back": "Answer (clear, concise, exam-relevant)",
    "mnemonic": "Optional mnemonic or memory aid"
  }
]

Rules:
- Cover key facts, definitions, nursing interventions, drug info
- Front should be a clear question or "What is...?" prompt
- Back should be concise but complete
- Include mnemonics where helpful (APGAR, ABCDE, etc.)
- Focus on NORCET/NCLEX high-yield content`,
    }],
  });
  const parsed = extractJson<any[]>(text, 'array');
  const stamp = Date.now();
  return {
    flashcards: parsed.map((f, i) => ({
      id: `fc-${stamp}-${i}`,
      front: f.front || '',
      back: f.back || '',
      mnemonic: f.mnemonic || undefined,
    })),
  };
}

export interface StudyPlanBlock { timeBlock: string; duration: string; subject: string; topics: string[]; type: string; tip: string }

export async function generateStudyPlan(input: {
  progressSummary: string; dailyHoursGoal: number; daysUntilExam: number; focusAreas?: string[];
}): Promise<{ plan: StudyPlanBlock[]; motivationalNote: string }> {
  const text = await complete({
    tier: 'fast',
    json: true,
    maxTokens: 2048,
    system: 'You are a study planning expert for B.Sc. Nursing students preparing for NORCET exams. Create structured, realistic daily study plans.',
    messages: [{
      role: 'user',
      content: `Create a daily study plan based on this progress:

${input.progressSummary}

Daily study goal: ${input.dailyHoursGoal} hours
Days until exam: ${input.daysUntilExam}
${input.focusAreas?.length ? `Focus areas: ${input.focusAreas.join(', ')}` : ''}

Return ONLY a JSON object (no markdown) with this format:
{
  "plan": [
    {
      "timeBlock": "Morning (6:00-8:00 AM)",
      "duration": "2 hours",
      "subject": "Subject name",
      "topics": ["Topic 1", "Topic 2"],
      "type": "new_learning|revision|practice|srs_review",
      "tip": "Brief study tip"
    }
  ],
  "motivationalNote": "Brief motivational message"
}

Rules:
- Create 3-5 study blocks fitting the daily hours goal
- Prioritize hard/important/NORCET-relevant incomplete topics
- Include at least one revision/SRS review block
- Include breaks between blocks
- Make tips specific and actionable`,
    }],
  });
  const parsed = extractJson<any>(text, 'object');
  return {
    plan: (parsed.plan || []).map((b: any) => ({
      timeBlock: b.timeBlock || '',
      duration: b.duration || '',
      subject: b.subject || '',
      topics: Array.isArray(b.topics) ? b.topics : [],
      type: b.type || 'new_learning',
      tip: b.tip || '',
    })),
    motivationalNote: parsed.motivationalNote || 'Keep going! Every topic you study brings you closer to success. 💪',
  };
}

export async function studyAdvice(input: {
  subjectName: string; totalTopics: number; doneTopics: number; daysUntilExam: number;
  easyCount: number; mediumCount: number; hardCount: number;
}): Promise<{ advice: string }> {
  const remaining = input.totalTopics - input.doneTopics;
  const pct = input.totalTopics > 0 ? Math.round((input.doneTopics / input.totalTopics) * 100) : 0;
  const pace = input.daysUntilExam > 0 ? Math.ceil(remaining / input.daysUntilExam) : remaining;
  const advice = await complete({
    tier: 'fast',
    maxTokens: 120,
    system: 'You are a concise study coach. Give exactly 1-2 short motivational/strategic sentences. No bullet points, no markdown. Be specific to their numbers. Keep it under 30 words.',
    messages: [{
      role: 'user',
      content: `Subject: ${input.subjectName}. Progress: ${input.doneTopics}/${input.totalTopics} (${pct}%). ${remaining} remaining. ${input.daysUntilExam} days until exam (need ${pace}/day). Difficulty: ${input.easyCount} easy, ${input.mediumCount} medium, ${input.hardCount} hard topics remaining.`,
    }],
  });
  return { advice };
}
