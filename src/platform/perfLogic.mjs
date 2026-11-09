/** Pure performance-mode decisions (unit-tested). */

export const PERF_MODES = ['auto', 'smooth', 'full'];

/** Share of frames slower than `thresholdMs`. Long pauses (tab hidden, >500 ms) are ignored, they are not jank. */
export function jankRatio(deltas, thresholdMs = 26) {
  const d = (Array.isArray(deltas) ? deltas : []).filter(x => Number.isFinite(x) && x > 0 && x < 500);
  if (!d.length) return 0;
  return d.filter(x => x > thresholdMs).length / d.length;
}

/** Judge one scroll-sampling window. Too few frames = not enough evidence. */
export function windowIsJanky(deltas, minFrames = 30, ratio = 0.3) {
  const d = (Array.isArray(deltas) ? deltas : []).filter(x => Number.isFinite(x) && x > 0 && x < 500);
  return d.length >= minFrames && jankRatio(d) >= ratio;
}

/**
 * Should the lighter visual mode (no blur / shadows / looping animations) be on?
 * smooth → always, full → never, auto → weak device, data-saver, reduced-motion, or scrolling was measured to drop frames.
 */
export function shouldUseLite({ mode = 'auto', deviceMemory = null, cores = null, saveData = false, reducedMotion = false, autoLite = false } = {}) {
  if (mode === 'smooth') return true;
  if (mode === 'full') return false;
  if (autoLite || saveData || reducedMotion) return true;
  if (typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory <= 2) return true;
  if (typeof cores === 'number' && cores > 0 && cores <= 2) return true;
  return false;
}

/** Why lite is on (shown in Settings). */
export function liteReason(input) {
  const { mode = 'auto', deviceMemory = null, cores = null, saveData = false, reducedMotion = false, autoLite = false } = input || {};
  if (!shouldUseLite(input)) return null;
  if (mode === 'smooth') return 'You chose Smooth mode';
  if (autoLite) return 'Scrolling was dropping frames on this phone';
  if (saveData) return 'Data-saver is on';
  if (reducedMotion) return 'Your phone asks for reduced motion';
  if (deviceMemory != null && deviceMemory <= 2) return 'This phone has little memory';
  if (cores != null && cores <= 2) return 'This phone has few CPU cores';
  return 'Automatic';
}
