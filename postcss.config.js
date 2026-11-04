import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

/**
 * Viewport units and the app-wide Zoom setting.
 *
 * `zoom` on <html> multiplies every length — including `100vh` and `100vw` — so a full-height
 * screen would be taller than the display. This plugin rewrites every viewport unit in the final CSS
 * (Tailwind utilities, arbitrary values and index.css) to `calc(N * var(--rj-vh))`, where
 * `--rj-vh` is `1vh / zoom` (defined in index.css). At 100 % zoom nothing changes.
 */
const UNIT = /(-?(?:\d+\.?\d*|\.\d+))(dvh|svh|lvh|vh|dvw|svw|lvw|vw)\b/g;

const rjViewportUnits = () => ({
  postcssPlugin: 'rj-viewport-units',
  Declaration(decl) {
    if (decl.prop.startsWith('--rj-') || !UNIT.test(decl.value)) { UNIT.lastIndex = 0; return; }
    UNIT.lastIndex = 0;
    const next = decl.value.replace(UNIT, (_m, n, u) => `calc(${n} * var(--rj-${u}))`);
    if (next !== decl.value) decl.value = next;
  },
});
rjViewportUnits.postcss = true;

export default {
  plugins: [tailwindcss(), rjViewportUnits(), autoprefixer()],
};
