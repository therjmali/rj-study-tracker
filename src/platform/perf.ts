/**
 * Performance mode — keeps scrolling and taps smooth on any phone, with any amount of data.
 *  • Smooth: drops the GPU-expensive effects (backdrop blur, big shadows, looping pulse animations).
 *  • Full: all effects.   • Auto (default): Smooth on weak devices, and switches itself on if scrolling is measured to stutter.
 * Device-local setting (never synced).
 */
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { liteReason, shouldUseLite, windowIsJanky, type PerfInput, type PerfMode } from './perfLogic.mjs';

const MODE_KEY = 'rj-perf-mode-v1';
const AUTO_KEY = 'rj-perf-auto-lite-v1';
const EVENT = 'rj:perf-changed';

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function getPerfMode(): PerfMode {
  const m = read(MODE_KEY);
  return m === 'smooth' || m === 'full' ? m : 'auto';
}

function signals(): PerfInput {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return {
    mode: getPerfMode(),
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    saveData: !!nav.connection?.saveData,
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    autoLite: read(AUTO_KEY) === '1',
  };
}

export interface PerfState { mode: PerfMode; lite: boolean; reason: string | null }
let state: PerfState = { mode: 'auto', lite: false, reason: null };

function apply(): void {
  const s = signals();
  const next: PerfState = { mode: s.mode ?? 'auto', lite: shouldUseLite(s), reason: liteReason(s) };
  if (next.mode !== state.mode || next.lite !== state.lite || next.reason !== state.reason) {
    state = next;
    window.dispatchEvent(new Event(EVENT));
  }
  document.documentElement.classList.toggle('perf-lite', state.lite);
}

export function setPerfMode(mode: PerfMode): void {
  write(MODE_KEY, mode);
  if (mode !== 'auto') { try { localStorage.removeItem(AUTO_KEY); } catch { /* ignore */ } }
  apply();
  startJankWatch();
}
export const getPerfState = (): PerfState => state;
export const subscribePerf = (cb: () => void) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); };
export const usePerf = (): PerfState => useSyncExternalStore(subscribePerf, getPerfState, getPerfState);

/* ── Auto mode: measure real scrolling; two stuttering windows in a row switch Smooth on ── */
let watching = false;
let windows = 0;
let janky = 0;

function sampleWindow(done: () => void): void {
  const deltas: number[] = [];
  let last = performance.now();
  const end = last + 1800;
  const tick = (t: number) => {
    if (document.visibilityState === 'visible') deltas.push(t - last);
    last = t;
    if (t < end) { requestAnimationFrame(tick); return; }
    windows += 1;
    janky = windowIsJanky(deltas) ? janky + 1 : 0;
    if (janky >= 2) {
      write(AUTO_KEY, '1');
      apply();
      toast.info('Smooth mode turned on', { description: 'Scrolling was stuttering, so heavy effects are off. Change it in Settings → Performance.', duration: 8000 });
      return;
    }
    done();
  };
  requestAnimationFrame(tick);
}

function startJankWatch(): void {
  if (watching || getPerfMode() !== 'auto' || state.lite || windows >= 8) return;
  watching = true;
  let armed = true;
  const onScroll = () => {
    if (!armed) return;
    armed = false;
    sampleWindow(() => {
      if (windows >= 8 || state.lite || getPerfMode() !== 'auto') { watching = false; document.removeEventListener('scroll', onScroll, true); return; }
      window.setTimeout(() => { armed = true; }, 2500); // next window only after another scroll, no earlier than 2.5 s
    });
  };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
}

export function initPerformance(): void {
  apply();
  startJankWatch();
}
