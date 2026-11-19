/**
 * Horizontal-scroll affordance for the whole app.
 *
 * Every row that scrolls sideways (filter chips, toolbars, tab strips, subject chips…) gets a soft fade on the side
 * that has more content, so a half-visible chip reads as "swipe me" instead of "cut off". It is applied
 * automatically to anything using `overflow-x-auto` / `overflow-x-scroll` (or `data-hscroll`), and only updates a
 * `data-hs` attribute ("l", "r" or "lr") — the visual lives in CSS (`[data-hs]` in index.css).
 * Opt out with `data-no-hs`.
 */
const SEL = '.overflow-x-auto, .overflow-x-scroll, [data-hscroll]';
const seen = new WeakSet<Element>();
let ro: ResizeObserver | null = null;
let io: IntersectionObserver | null = null;

function update(el: HTMLElement) {
  if (el.hasAttribute('data-no-hs')) { if (el.dataset.hs) delete el.dataset.hs; return; }
  const max = el.scrollWidth - el.clientWidth;
  let v = '';
  if (max > 4) {
    // RTL-safe: scrollLeft is negative in RTL in modern browsers
    const pos = Math.abs(el.scrollLeft);
    if (pos > 3) v += 'l';
    if (pos < max - 3) v += 'r';
  }
  if (v) { if (el.dataset.hs !== v) el.dataset.hs = v; } else if (el.dataset.hs) delete el.dataset.hs;
}

function adopt(el: Element) {
  if (seen.has(el) || !(el instanceof HTMLElement)) return;
  seen.add(el);
  ro?.observe(el);
  io?.observe(el);
  el.addEventListener('scroll', () => update(el), { passive: true });
  update(el);
}

function scan(root: ParentNode) {
  if (root instanceof Element && root.matches(SEL)) adopt(root);
  root.querySelectorAll?.(SEL).forEach(adopt);
}

export function installHScroll(): void {
  if (typeof window === 'undefined' || (window as any).__hscrollInstalled) return;
  (window as any).__hscrollInstalled = true;
  ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(entries => entries.forEach(e => update(e.target as HTMLElement))) : null;
  // content can change without the box changing size — re-check whenever a scroller comes into view
  io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) update(e.target as HTMLElement); })) : null;

  scan(document);

  let queued: Node[] = [];
  let raf = 0;
  const flush = () => { raf = 0; const nodes = queued; queued = []; nodes.forEach(n => { if (n.nodeType === 1) scan(n as Element); }); };
  new MutationObserver(muts => {
    for (const m of muts) m.addedNodes.forEach(n => { if (n.nodeType === 1) queued.push(n); });
    if (queued.length && !raf) raf = requestAnimationFrame(flush);
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', () => document.querySelectorAll<HTMLElement>('[data-hs],' + SEL).forEach(update), { passive: true });
}
