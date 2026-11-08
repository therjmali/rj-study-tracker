import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PROVIDER_IDS, PROVIDER_META, AI_HOSTS, buildRequest, readChunk, buildModelsRequest, parseModelList,
  shouldFallback, maskKey, looksLikeKey,
} from '../src/platform/aiProviders.mjs';
import { buildCsp } from '../scripts/csp.mjs';

const base = { key: 'K'.repeat(24), model: 'm-1', system: 'SYS', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'q' }], maxTokens: 500 };

test('exactly the five partners', () => {
  assert.deepEqual([...PROVIDER_IDS].sort(), ['anthropic', 'cohere', 'gemini', 'groq', 'openai']);
  for (const id of PROVIDER_IDS) {
    const m = PROVIDER_META[id];
    assert.ok(m.label && m.keyUrl.startsWith('https://') && m.defaultMain && m.defaultFast && m.host.startsWith('https://'), id);
  }
  assert.match(PROVIDER_META.groq.keyUrl, /console\.groq\.com/);
});

test('every AI host is allowed by the Content-Security-Policy', () => {
  const csp = buildCsp({ supabaseUrl: 'https://x.supabase.co' });
  for (const host of AI_HOSTS) assert.ok(csp.includes(host), `${host} missing from connect-src`);
});

test('openai + groq use the OpenAI chat format on their own hosts', () => {
  const o = buildRequest('openai', base);
  assert.equal(o.url, 'https://api.openai.com/v1/chat/completions');
  const g = buildRequest('groq', { ...base, json: true, stream: true });
  assert.equal(g.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(g.init.headers.authorization, `Bearer ${base.key}`);
  const body = JSON.parse(g.init.body);
  assert.equal(body.stream, true);
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[0].content, 'SYS');
  assert.equal(body.messages.length, 4);
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.max_completion_tokens, 500);
});

test('cohere uses v2/chat with bearer auth and system message first', () => {
  const c = buildRequest('cohere', { ...base, stream: true });
  assert.equal(c.url, 'https://api.cohere.com/v2/chat');
  assert.equal(c.init.headers.authorization, `Bearer ${base.key}`);
  assert.equal(c.init.headers.accept, 'text/event-stream');
  const body = JSON.parse(c.init.body);
  assert.equal(body.messages[0].content, 'SYS');
  assert.equal(body.max_tokens, 500);
  assert.equal(buildRequest('cohere', base).init.headers.accept, 'application/json');
});

test('anthropic keeps system separate and sends the browser-access header', () => {
  const a = buildRequest('anthropic', base);
  assert.equal(a.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(a.init.headers['x-api-key'], base.key);
  assert.equal(a.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  const body = JSON.parse(a.init.body);
  assert.equal(body.system, 'SYS');
  assert.equal(body.messages.length, 3);
});

test('gemini maps roles and streams over SSE', () => {
  const g = buildRequest('gemini', { ...base, model: 'gemini-2.5-flash', stream: true });
  assert.match(g.url, /models\/gemini-2\.5-flash:streamGenerateContent\?alt=sse&key=/);
  const body = JSON.parse(g.init.body);
  assert.equal(body.contents[1].role, 'model');
  assert.equal(body.systemInstruction.parts[0].text, 'SYS');
});

test('readChunk understands every provider (stream and non-stream)', () => {
  assert.equal(readChunk('openai', { choices: [{ delta: { content: 'a' } }] }, true), 'a');
  assert.equal(readChunk('groq', { choices: [{ message: { content: 'b' } }] }, false), 'b');
  assert.equal(readChunk('anthropic', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'c' } }, true), 'c');
  assert.equal(readChunk('anthropic', { content: [{ type: 'text', text: 'd' }, { type: 'tool_use' }] }, false), 'd');
  assert.equal(readChunk('cohere', { type: 'content-delta', delta: { message: { content: { text: 'e' } } } }, true), 'e');
  assert.equal(readChunk('cohere', { type: 'message-start' }, true), '');
  assert.equal(readChunk('cohere', { message: { content: [{ type: 'text', text: 'f' }] } }, false), 'f');
  assert.equal(readChunk('gemini', { candidates: [{ content: { parts: [{ text: 'g' }, { text: 'h' }] } }] }, true), 'gh');
  for (const p of PROVIDER_IDS) assert.equal(readChunk(p, undefined, true), '');
});

test('model list requests and parsing', () => {
  assert.equal(buildModelsRequest('groq', 'k').url, 'https://api.groq.com/openai/v1/models');
  assert.match(buildModelsRequest('cohere', 'k').url, /api\.cohere\.com\/v1\/models/);
  assert.match(buildModelsRequest('gemini', 'a b').url, /key=a%20b/);
  assert.deepEqual(parseModelList('groq', { data: [{ id: 'whisper-large-v3' }, { id: 'llama-3.3-70b-versatile' }, { id: 'llama-guard-4' }, { id: 'llama-3.1-8b-instant' }] }),
    ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']);
  assert.deepEqual(parseModelList('openai', { data: [{ id: 'text-embedding-3-small' }, { id: 'gpt-4.1' }, { id: 'whisper-1' }, { id: 'o3-mini' }, { id: 'dall-e-3' }] }), ['gpt-4.1', 'o3-mini']);
  assert.deepEqual(parseModelList('gemini', { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] }] }), ['gemini-2.5-flash']);
  assert.deepEqual(parseModelList('cohere', { models: [{ name: 'command-a-03-2025', endpoints: ['chat'] }, { name: 'embed-v4.0', endpoints: ['embed'] }] }), ['command-a-03-2025']);
  assert.deepEqual(parseModelList('anthropic', { data: [{ id: 'claude-sonnet-5-5' }] }), ['claude-sonnet-5-5']);
  assert.deepEqual(parseModelList('groq', null), []);
});

test('fallback only for provider-side problems, never for a dead connection', () => {
  for (const c of ['RATE_LIMITED', 'BAD_API_KEY', 'BAD_MODEL', 'AI_ERROR', 'EMPTY']) assert.equal(shouldFallback(c), true, c);
  for (const c of ['NETWORK', 'NO_API_KEY', undefined]) assert.equal(shouldFallback(c), false, String(c));
});

test('maskKey never reveals the middle of a key', () => {
  assert.equal(maskKey(''), '');
  assert.equal(maskKey('short'), '••••••••');
  const m = maskKey('gsk_abcdefghijklmnopqrstuvwxyz1234');
  assert.ok(m.startsWith('gsk_') && m.endsWith('1234') && !m.includes('abcdefgh'));
});

test('looksLikeKey: blocks only the obviously wrong, warns on prefix mismatch', () => {
  assert.equal(looksLikeKey('groq', '').ok, false);
  assert.equal(looksLikeKey('groq', 'has space inside the key 1234567').ok, false);
  assert.equal(looksLikeKey('groq', 'tooShort').ok, false);
  const warn = looksLikeKey('groq', 'AIza' + 'x'.repeat(30));
  assert.equal(warn.ok, true); assert.match(warn.hint, /Groq/);
  assert.deepEqual(looksLikeKey('groq', 'gsk_' + 'x'.repeat(30)), { ok: true, hint: '' });
  assert.deepEqual(looksLikeKey('cohere', 'x'.repeat(40)), { ok: true, hint: '' });
});
