/**
 * Shared search engine helpers.
 *
 * Every search box in the app (syllabus, global search, settings) goes through
 * these helpers so they behave the same way:
 *  - case + accent insensitive ("café" finds "cafe")
 *  - multi-word queries are AND-ed ("anc care" finds "Antenatal Care (ANC)")
 *  - results are ranked (starts-with > word-start > contains)
 *  - optional typo tolerance (one edit) for small corpora and as a fallback
 */

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NON_SEARCH_CHARS = /[^\p{L}\p{N}\s#.+\-/]/gu;
const MULTI_SPACE = /\s+/g;

const normCache = new Map<string, string>();
const NORM_CACHE_LIMIT = 4000;

/** Lower-case, strip accents / odd punctuation, collapse whitespace. */
export function normalizeText(input: unknown): string {
  if (input == null) return '';
  const raw = typeof input === 'string' ? input : String(input);
  if (!raw) return '';
  const hit = normCache.get(raw);
  if (hit !== undefined) return hit;
  let out: string;
  try {
    out = raw.normalize('NFKD').replace(COMBINING_MARKS, '').toLowerCase().replace(NON_SEARCH_CHARS, ' ').replace(MULTI_SPACE, ' ').trim();
  } catch {
    out = raw.toLowerCase().trim();
  }
  if (normCache.size >= NORM_CACHE_LIMIT) normCache.clear();
  normCache.set(raw, out);
  return out;
}

const tokenCache = { query: '', tokens: [] as string[] };

/** Split a query into normalised unique tokens (max 8). Memoised for the last query. */
export function tokenizeQuery(query: string): string[] {
  if (query === tokenCache.query) return tokenCache.tokens;
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const t of normalizeText(query).split(' ')) {
    if (t && !seen.has(t)) { seen.add(t); tokens.push(t); if (tokens.length >= 8) break; }
  }
  tokenCache.query = query;
  tokenCache.tokens = tokens;
  return tokens;
}

/** True when every token is a substring of the (already normalised) haystack. */
export function includesAllTokens(haystack: string, tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) if (!haystack.includes(tokens[i])) return false;
  return true;
}

/** Levenshtein distance with an early exit once it exceeds `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[lb];
}

/**
 * Typo-tolerant token check: the token matches if it is a substring, or if any
 * word of the haystack is within one edit (two for long tokens).
 */
export function fuzzyIncludesToken(haystack: string, token: string): boolean {
  if (haystack.includes(token)) return true;
  if (token.length < 4) return false;
  const max = token.length >= 8 ? 2 : 1;
  const words = haystack.split(' ');
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;
    if (Math.abs(w.length - token.length) <= max && editDistance(w, token, max) <= max) return true;
    // prefix typo ("antenatl" vs "antenatal care")
    if (w.length > token.length && editDistance(w.slice(0, token.length), token, max) <= max) return true;
  }
  return false;
}

export function fuzzyIncludesAll(haystack: string, tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) if (!fuzzyIncludesToken(haystack, tokens[i])) return false;
  return true;
}

/**
 * Relevance score for a title (higher is better, 0 = no match).
 * Exact > starts-with > word-start > contains, plus a small bonus for shorter titles.
 */
export function scoreTitle(title: string, tokens: string[]): number {
  const t = normalizeText(title);
  if (!t || tokens.length === 0) return 0;
  const joined = tokens.join(' ');
  if (t === joined) return 1000;
  let score = 0;
  if (t.startsWith(joined)) score += 400;
  else if (t.includes(' ' + joined)) score += 300;
  else if (t.includes(joined)) score += 200;
  for (const tok of tokens) {
    if (t.startsWith(tok)) score += 60;
    else if (t.includes(' ' + tok)) score += 45;
    else if (t.includes(tok)) score += 25;
    else return score > 0 ? score : 0;
  }
  return score + Math.max(0, 20 - Math.floor(t.length / 8));
}

/** Escape a string for use in a RegExp. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split `text` into alternating plain / highlighted parts for the given tokens
 * (case-insensitive, multi-token).
 */
export function splitForHighlight(text: string, tokens: string[]): { text: string; hit: boolean }[] {
  const safe = String(text ?? '');
  if (!safe || tokens.length === 0) return [{ text: safe, hit: false }];
  const usable = tokens.filter(t => t.length > 0).sort((a, b) => b.length - a.length);
  if (usable.length === 0) return [{ text: safe, hit: false }];
  let re: RegExp;
  try { re = new RegExp(`(${usable.map(escapeRegExp).join('|')})`, 'gi'); } catch { return [{ text: safe, hit: false }]; }
  const parts: { text: string; hit: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    if (m.index > last) parts.push({ text: safe.slice(last, m.index), hit: false });
    parts.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < safe.length) parts.push({ text: safe.slice(last), hit: false });
  return parts.length ? parts : [{ text: safe, hit: false }];
}

/**
 * Convenience matcher for simple lists: every word of `query` must appear in at least one of `fields`.
 * Fields are normalised here, so callers can pass raw strings (or undefined).
 */
export function matchesFields(query: string, fields: (unknown)[]): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return true;
  const norm = fields.map(f => normalizeText(f));
  return tokens.every(t => norm.some(f => f.includes(t)));
}
