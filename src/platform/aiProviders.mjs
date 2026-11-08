/**
 * AI provider catalogue + request/response shapes (pure — no DOM, no React) so every provider can be unit-tested.
 * Five partners, all called straight from the device with the student's own key:
 *   Google Gemini · OpenAI GPT · Anthropic Claude · Cohere · Groq
 */

export const PROVIDER_IDS = ['gemini', 'groq', 'openai', 'anthropic', 'cohere'];

export const PROVIDER_META = {
  gemini: {
    label: 'Google Gemini', short: 'Gemini', color: '#4285F4',
    keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'AIza…', keyPrefix: /^AIza/,
    defaultMain: 'gemini-2.5-flash', defaultFast: 'gemini-2.5-flash-lite',
    note: 'Free tier available — easiest way to start.', host: 'https://generativelanguage.googleapis.com',
  },
  groq: {
    label: 'Groq', short: 'Groq', color: '#F55036',
    keyUrl: 'https://console.groq.com/keys', keyHint: 'gsk_…', keyPrefix: /^gsk_/,
    defaultMain: 'llama-3.3-70b-versatile', defaultFast: 'llama-3.1-8b-instant',
    note: 'Free tier and blazing fast answers.', host: 'https://api.groq.com',
  },
  openai: {
    label: 'OpenAI GPT', short: 'GPT', color: '#10A37F',
    keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'sk-…', keyPrefix: /^sk-/,
    defaultMain: 'gpt-4.1', defaultFast: 'gpt-4.1-mini',
    note: 'Pay-as-you-go.', host: 'https://api.openai.com',
  },
  anthropic: {
    label: 'Anthropic Claude', short: 'Claude', color: '#D97757',
    keyUrl: 'https://console.anthropic.com/settings/keys', keyHint: 'sk-ant-…', keyPrefix: /^sk-ant-/,
    defaultMain: 'claude-sonnet-5-5', defaultFast: 'claude-haiku-5-5',
    note: 'Pay-as-you-go. Best explanations for nursing topics.', host: 'https://api.anthropic.com',
  },
  cohere: {
    label: 'Cohere', short: 'Cohere', color: '#39594D',
    keyUrl: 'https://dashboard.cohere.com/api-keys', keyHint: '40-character key', keyPrefix: null,
    defaultMain: 'command-a-03-2025', defaultFast: 'command-r7b-12-2024',
    note: 'Free trial key (rate-limited) available.', host: 'https://api.cohere.com',
  },
};

/** Every host the app may contact for AI — keep in sync with scripts/csp.mjs (a test enforces it). */
export const AI_HOSTS = PROVIDER_IDS.map(id => PROVIDER_META[id].host);

/**
 * Build one chat request.
 * p: { key, model, system, messages:[{role,content}], maxTokens, json?, stream? }
 * returns { url, init:{method, headers, body} } (the caller adds the AbortSignal)
 */
export function buildRequest(provider, p) {
  const { key, model, system, messages, maxTokens, json = false, stream = false } = p;
  const host = PROVIDER_META[provider].host;

  if (provider === 'anthropic') {
    return {
      url: `${host}/v1/messages`,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, stream, messages }),
      },
    };
  }

  if (provider === 'openai' || provider === 'groq') {
    const path = provider === 'groq' ? '/openai/v1/chat/completions' : '/v1/chat/completions';
    return {
      url: `${host}${path}`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model, stream,
          max_completion_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      },
    };
  }

  if (provider === 'cohere') {
    return {
      url: `${host}/v2/chat`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, accept: stream ? 'text/event-stream' : 'application/json' },
        body: JSON.stringify({
          model, stream,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      },
    };
  }

  // Gemini
  const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  const sep = stream ? '&' : '?';
  return {
    url: `${host}/v1beta/models/${encodeURIComponent(model)}:${method}${sep}key=${encodeURIComponent(key)}`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: {
          maxOutputTokens: Math.max(maxTokens, 2048) * 2,
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    },
  };
}

/** Extract the text from one parsed response body / stream event. */
export function readChunk(provider, d, stream) {
  if (provider === 'anthropic') {
    return stream
      ? (d?.type === 'content_block_delta' && d?.delta?.type === 'text_delta' ? d.delta.text ?? '' : '')
      : (Array.isArray(d?.content) ? d.content.filter(b => b.type === 'text').map(b => b.text).join('') : '');
  }
  if (provider === 'openai' || provider === 'groq') {
    return stream ? (d?.choices?.[0]?.delta?.content ?? '') : (d?.choices?.[0]?.message?.content ?? '');
  }
  if (provider === 'cohere') {
    if (stream) return d?.type === 'content-delta' ? (d?.delta?.message?.content?.text ?? '') : '';
    const c = d?.message?.content;
    return Array.isArray(c) ? c.filter(b => b?.type === 'text' || typeof b?.text === 'string').map(b => b.text ?? '').join('') : '';
  }
  return Array.isArray(d?.candidates?.[0]?.content?.parts)
    ? d.candidates[0].content.parts.map(p => p.text ?? '').join('')
    : '';
}

/** Cheap, free "is this key alive?" request: list the models the key can use. */
export function buildModelsRequest(provider, key) {
  const host = PROVIDER_META[provider].host;
  if (provider === 'gemini') return { url: `${host}/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`, init: { method: 'GET' } };
  if (provider === 'anthropic') {
    return { url: `${host}/v1/models?limit=100`, init: { method: 'GET', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } } };
  }
  if (provider === 'cohere') return { url: `${host}/v1/models?page_size=100&endpoint=chat`, init: { method: 'GET', headers: { authorization: `Bearer ${key}` } } };
  if (provider === 'groq') return { url: `${host}/openai/v1/models`, init: { method: 'GET', headers: { authorization: `Bearer ${key}` } } };
  return { url: `${host}/v1/models`, init: { method: 'GET', headers: { authorization: `Bearer ${key}` } } };
}

const NOT_CHAT = /(embed|whisper|tts|transcri|audio|realtime|dall-e|image|moderation|guard|playai|rerank|speech|vision-preview|davinci|babbage)/i;

/** Turn a provider's model-list response into a clean, sorted list of chat-capable model ids. */
export function parseModelList(provider, json) {
  let ids = [];
  if (provider === 'gemini') {
    ids = (json?.models ?? [])
      .filter(m => (m?.supportedGenerationMethods ?? []).includes('generateContent'))
      .map(m => String(m?.name ?? '').replace(/^models\//, ''));
  } else if (provider === 'cohere') {
    ids = (json?.models ?? []).filter(m => !m?.endpoints || m.endpoints.includes('chat')).map(m => String(m?.name ?? ''));
  } else {
    ids = (json?.data ?? []).map(m => String(m?.id ?? ''));
    if (provider === 'openai') ids = ids.filter(id => /^(gpt|o\d|chatgpt)/i.test(id));
  }
  return [...new Set(ids.filter(id => id && !NOT_CHAT.test(id)))].sort((a, b) => a.localeCompare(b));
}

/** A provider hiccup that another configured provider could cover. A dead connection is not one of them. */
export function shouldFallback(code) {
  return ['RATE_LIMITED', 'BAD_API_KEY', 'BAD_MODEL', 'AI_ERROR', 'EMPTY'].includes(code);
}

export function maskKey(key) {
  const k = String(key ?? '').trim();
  if (!k) return '';
  if (k.length < 12) return '••••••••';
  return `${k.slice(0, 4)}••••••••${k.slice(-4)}`;
}

/** Soft format check (a wrong prefix is a warning, never a block — providers change their formats). */
export function looksLikeKey(provider, key) {
  const k = String(key ?? '').trim();
  if (!k) return { ok: false, hint: 'Paste your key first.' };
  if (/\s/.test(k)) return { ok: false, hint: 'A key never contains spaces — check for extra text.' };
  if (k.length < 16) return { ok: false, hint: 'That looks too short for an API key.' };
  const meta = PROVIDER_META[provider];
  if (meta.keyPrefix && !meta.keyPrefix.test(k)) return { ok: true, hint: `Usually starts with ${meta.keyHint} — double-check it's a ${meta.short} key.` };
  return { ok: true, hint: '' };
}
