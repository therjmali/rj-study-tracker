/**
 * Some reasoning models (Qwen3, DeepSeek-R1 …) put their thinking inside <think>…</think> in the answer text.
 * The student must never see it. Pure functions — unit tested.
 */

/** Remove every <think>…</think> block (and an unmatched leading "… </think>"). */
export function stripThinking(text) {
  return String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '');
}

/** Streaming version: drops <think>…</think> even when a tag is split across chunks. */
export class ThinkFilter {
  constructor() { this.buf = ''; this.inside = false; }

  push(chunk) {
    this.buf += chunk;
    let out = '';
    for (;;) {
      if (this.inside) {
        const end = this.buf.search(/<\/think>/i);
        if (end < 0) { this.buf = this.buf.slice(Math.max(0, this.buf.length - 8)); return out; } // keep a possible partial closing tag
        this.buf = this.buf.slice(end + 8);
        this.inside = false;
      } else {
        const start = this.buf.search(/<think>/i);
        if (start >= 0) { out += this.buf.slice(0, start); this.buf = this.buf.slice(start + 7); this.inside = true; continue; }
        // hold back a trailing fragment that could be the beginning of "<think>"
        const lt = this.buf.lastIndexOf('<');
        if (lt >= 0 && '<think>'.startsWith(this.buf.slice(lt).toLowerCase())) { out += this.buf.slice(0, lt); this.buf = this.buf.slice(lt); }
        else { out += this.buf; this.buf = ''; }
        return out;
      }
    }
  }

  flush() { const r = this.inside ? '' : this.buf; this.buf = ''; this.inside = false; return r; }
}
