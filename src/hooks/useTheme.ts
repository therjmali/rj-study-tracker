import { useEffect, useState } from 'react';
import type { GlassTone, ThemeId, ThemeMode } from '../types';

/* ── Neutral vars controlled by MODE (parchment / ink) ── */
interface ModeVars {
  '--background': string;
  '--foreground': string;
  '--card': string;
  '--card-foreground': string;
  '--popover': string;
  '--popover-foreground': string;
  '--muted': string;
  '--muted-foreground': string;
  '--border': string;
  '--input': string;
}

interface ModePreset {
  id: ThemeMode;
  name: string;
  emoji: string;
  vars: ModeVars;
}

export const MODES: ModePreset[] = [
  {
    id: 'light', name: 'Parchment', emoji: '☀️',
    vars: {
      '--background': '38 35% 95%',
      '--foreground': '20 25% 13%',
      '--card': '38 28% 98%',
      '--card-foreground': '20 25% 13%',
      '--popover': '38 28% 98%',
      '--popover-foreground': '20 25% 13%',
      '--muted': '35 22% 90%',
      '--muted-foreground': '20 12% 36%',
      '--border': '35 20% 85%',
      '--input': '35 20% 85%',
    },
  },
  {
    id: 'amoled', name: 'Ink', emoji: '🌙',
    vars: {
      '--background': '280 15% 4%',
      '--foreground': '40 20% 92%',
      '--card': '280 12% 7%',
      '--card-foreground': '40 20% 92%',
      '--popover': '280 12% 7%',
      '--popover-foreground': '40 20% 92%',
      '--muted': '280 10% 10%',
      '--muted-foreground': '280 8% 48%',
      '--border': '280 8% 14%',
      '--input': '280 8% 14%',
    },
  },
  {
    id: 'ancient', name: 'Papyrus', emoji: '🏺',
    vars: {
      '--background': '36 38% 92%',
      '--foreground': '22 30% 16%',
      '--card': '36 32% 96%',
      '--card-foreground': '22 30% 16%',
      '--popover': '36 32% 96%',
      '--popover-foreground': '22 30% 16%',
      '--muted': '34 24% 86%',
      '--muted-foreground': '26 16% 34%',
      '--border': '32 22% 80%',
      '--input': '32 22% 80%',
    },
  },
  {
    // Liquid Glass — light tone (the dark tone is GLASS_DARK_VARS). Cards are translucent glass over an aurora; see index.css.
    id: 'glass', name: 'Liquid Glass', emoji: '🫧',
    vars: {
      '--background': '216 45% 94%',
      '--foreground': '224 36% 13%',
      '--card': '0 0% 100%',
      '--card-foreground': '224 36% 13%',
      '--popover': '216 40% 97%',
      '--popover-foreground': '224 36% 13%',
      '--muted': '216 32% 89%',
      '--muted-foreground': '222 14% 36%',
      '--border': '216 30% 78%',
      '--input': '216 30% 82%',
    },
  },
  {
    // Vyxel — light. Palette ported from Vyxel Apps (AGPL-3.0, © Nikhil): cool violet-tinted surfaces, soft containers.
    id: 'vyxel', name: 'Vyxel', emoji: '💜',
    vars: {
      '--background': '300 100% 99%',
      '--foreground': '240 10% 12%',
      '--card': '0 0% 100%',
      '--card-foreground': '240 10% 12%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '240 10% 12%',
      '--muted': '273 29% 94%',
      '--muted-foreground': '260 6% 29%',
      '--border': '278 11% 86%',
      '--input': '270 24% 90%',
    },
  },
  {
    // Vyxel — dark (deep graphite surfaces with the same violet / teal / amber accents).
    id: 'vyxeldark', name: 'Vyxel Dark', emoji: '🌌',
    vars: {
      '--background': '230 16% 7%',
      '--foreground': '263 15% 90%',
      '--card': '231 11% 12%',
      '--card-foreground': '263 15% 90%',
      '--popover': '232 11% 15%',
      '--popover-foreground': '263 15% 90%',
      '--muted': '232 11% 15%',
      '--muted-foreground': '273 10% 79%',
      '--border': '232 7% 22%',
      '--input': '232 7% 22%',
    },
  },
];

const GLASS_DARK_VARS: ModeVars = {
  '--background': '226 42% 7%',
  '--foreground': '214 32% 94%',
  '--card': '226 30% 16%',
  '--card-foreground': '214 32% 94%',
  '--popover': '226 34% 12%',
  '--popover-foreground': '214 32% 94%',
  '--muted': '226 26% 18%',
  '--muted-foreground': '218 16% 70%',
  '--border': '226 22% 28%',
  '--input': '226 22% 24%',
};

/** Does this mode (and glass tone) give a dark canvas? */
export function isDarkCanvas(mode: ThemeMode, glassTone: GlassTone = 'auto'): boolean {
  if (mode === 'amoled' || mode === 'vyxeldark') return true;
  if (mode !== 'glass') return false;
  if (glassTone === 'dark') return true;
  if (glassTone === 'light') return false;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}

/** Raise an "H S% L%" colour's lightness to at least `min` (keeps hue and saturation). */
function liftLightness(value: string, min: number): { value: string; lifted: boolean } {
  const m = value.match(/(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  if (!m) return { value, lifted: false };
  const l = Number(m[3]);
  if (l >= min) return { value, lifted: false };
  return { value: `${m[1]} ${Math.min(Number(m[2]) + 8, 85)}% ${min}%`, lifted: true };
}

/** Readable accent-coloured TEXT for the current canvas (accent hue, forced to a safe lightness). */
function accentInk(accent: string, dark: boolean): string {
  const m = accent.match(/(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  const h = m ? Number(m[1]) : 32;
  const s = Math.min(m ? Number(m[2]) : 55, 80);
  if (dark) return `${h} ${Math.max(s, 45)}% 74%`;
  const warm = h >= 25 && h <= 75; // yellows / oranges need to go darker to stay readable
  return `${h} ${s}% ${warm ? 27 : 34}%`;
}

/* ── Color / accent vars controlled by THEME ── */
interface AccentVars {
  '--primary': string;
  '--primary-foreground': string;
  '--secondary': string;
  '--secondary-foreground': string;
  '--accent': string;
  '--accent-foreground': string;
  '--destructive': string;
  '--destructive-foreground': string;
  '--ring': string;
  '--chart-1': string;
  '--chart-2': string;
  '--chart-3': string;
  '--chart-4': string;
  '--chart-5': string;
}

export interface ThemePreset {
  id: ThemeId;
  name: string;
  emoji: string;
  preview: string;
  vars: AccentVars;
  /** Exact accent set for dark canvases (skips the automatic lightness lift). */
  darkVars?: AccentVars;
}

export const THEMES: ThemePreset[] = [
  {
    id: 'default', name: 'Scholar', emoji: '📚', preview: '#2D1B33',
    vars: {
      '--primary': '285 32% 22%',
      '--primary-foreground': '40 30% 96%',
      '--secondary': '18 65% 50%',
      '--secondary-foreground': '0 0% 100%',
      '--accent': '38 72% 52%',
      '--accent-foreground': '20 25% 13%',
      '--destructive': '0 72% 51%',
      '--destructive-foreground': '0 0% 100%',
      '--ring': '285 32% 22%',
      '--chart-1': '285 32% 32%',
      '--chart-2': '18 65% 50%',
      '--chart-3': '38 72% 52%',
      '--chart-4': '155 45% 40%',
      '--chart-5': '345 55% 47%',
    },
  },
  {
    id: 'ocean', name: 'Ocean', emoji: '🌊', preview: '#2D6A8F',
    vars: {
      '--primary': '199 55% 37%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '172 45% 42%',
      '--secondary-foreground': '0 0% 100%',
      '--accent': '217 50% 50%',
      '--accent-foreground': '0 0% 100%',
      '--destructive': '0 72% 51%',
      '--destructive-foreground': '0 0% 100%',
      '--ring': '199 55% 37%',
      '--chart-1': '199 55% 37%',
      '--chart-2': '172 45% 42%',
      '--chart-3': '217 50% 50%',
      '--chart-4': '47 65% 50%',
      '--chart-5': '285 32% 32%',
    },
  },
  {
    id: 'emerald', name: 'Sage', emoji: '🍃', preview: '#3D7A5C',
    vars: {
      '--primary': '150 35% 36%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '168 40% 38%',
      '--secondary-foreground': '0 0% 100%',
      '--accent': '38 60% 50%',
      '--accent-foreground': '20 25% 13%',
      '--destructive': '0 72% 51%',
      '--destructive-foreground': '0 0% 100%',
      '--ring': '150 35% 36%',
      '--chart-1': '150 35% 36%',
      '--chart-2': '168 40% 38%',
      '--chart-3': '38 60% 50%',
      '--chart-4': '285 32% 32%',
      '--chart-5': '18 65% 50%',
    },
  },
  {
    id: 'sunset', name: 'Terracotta', emoji: '🏺', preview: '#A0522D',
    vars: {
      '--primary': '18 60% 40%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '30 55% 45%',
      '--secondary-foreground': '0 0% 100%',
      '--accent': '45 65% 50%',
      '--accent-foreground': '20 25% 13%',
      '--destructive': '0 72% 51%',
      '--destructive-foreground': '0 0% 100%',
      '--ring': '18 60% 40%',
      '--chart-1': '18 60% 40%',
      '--chart-2': '30 55% 45%',
      '--chart-3': '45 65% 50%',
      '--chart-4': '155 45% 40%',
      '--chart-5': '285 32% 32%',
    },
  },
  {
    id: 'rose', name: 'Wine', emoji: '🍷', preview: '#722F37',
    vars: {
      '--primary': '355 45% 32%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '330 40% 40%',
      '--secondary-foreground': '0 0% 100%',
      '--accent': '38 72% 52%',
      '--accent-foreground': '20 25% 13%',
      '--destructive': '36 80% 50%',
      '--destructive-foreground': '0 0% 100%',
      '--ring': '355 45% 32%',
      '--chart-1': '355 45% 32%',
      '--chart-2': '330 40% 40%',
      '--chart-3': '38 72% 52%',
      '--chart-4': '155 45% 40%',
      '--chart-5': '18 65% 50%',
    },
  },
  {
    id: 'purple', name: 'Plum', emoji: '🍇', preview: '#5B3256',
    vars: {
      '--primary': '305 30% 28%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '285 32% 35%',
      '--secondary-foreground': '0 0% 100%',
      '--accent': '18 65% 50%',
      '--accent-foreground': '0 0% 100%',
      '--destructive': '0 72% 51%',
      '--destructive-foreground': '0 0% 100%',
      '--ring': '305 30% 28%',
      '--chart-1': '305 30% 28%',
      '--chart-2': '285 32% 35%',
      '--chart-3': '18 65% 50%',
      '--chart-4': '38 72% 52%',
      '--chart-5': '155 45% 40%',
    },
  },
  {
    id: 'ancient', name: 'Ancient', emoji: '⚱️', preview: '#D4A843',
    vars: {
      '--primary': '42 78% 55%',
      '--primary-foreground': '15 20% 8%',
      '--secondary': '150 82% 48%',
      '--secondary-foreground': '150 30% 8%',
      '--accent': '35 75% 58%',
      '--accent-foreground': '15 20% 8%',
      '--destructive': '8 75% 58%',
      '--destructive-foreground': '0 0% 100%',
      '--ring': '42 78% 50%',
      '--chart-1': '42 78% 55%',
      '--chart-2': '150 82% 48%',
      '--chart-3': '8 75% 58%',
      '--chart-4': '35 75% 58%',
      '--chart-5': '195 70% 50%',
    },
  },
  {
    // Vyxel — violet primary, teal secondary, amber tertiary (tonal values from Vyxel Apps' Material 3 palette).
    id: 'vyxel', name: 'Vyxel', emoji: '💜', preview: '#6242E0',
    vars: {
      '--primary': '252 72% 57%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '178 100% 21%',
      '--secondary-foreground': '0 0% 100%',
      '--accent': '35 100% 27%',
      '--accent-foreground': '0 0% 100%',
      '--destructive': '0 75% 42%',
      '--destructive-foreground': '0 0% 100%',
      '--ring': '252 72% 57%',
      '--chart-1': '252 72% 57%',
      '--chart-2': '177 100% 26%',
      '--chart-3': '37 100% 38%',
      '--chart-4': '218 70% 52%',
      '--chart-5': '0 75% 42%',
    },
    darkVars: {
      '--primary': '252 100% 87%',
      '--primary-foreground': '262 100% 28%',
      '--secondary': '177 66% 58%',
      '--secondary-foreground': '178 100% 11%',
      '--accent': '31 100% 71%',
      '--accent-foreground': '32 100% 15%',
      '--destructive': '6 100% 84%',
      '--destructive-foreground': '357 100% 21%',
      '--ring': '252 100% 87%',
      '--chart-1': '252 100% 87%',
      '--chart-2': '177 66% 58%',
      '--chart-3': '31 100% 71%',
      '--chart-4': '217 100% 75%',
      '--chart-5': '6 100% 84%',
    },
  },
];

export function useTheme(themeId: ThemeId, mode: ThemeMode = 'light', glassTone: GlassTone = 'auto') {
  const [systemDark, setSystemDark] = useState(() => isDarkCanvas('glass', 'auto'));
  useEffect(() => {
    if (mode !== 'glass' || glassTone !== 'auto') return;
    let mq: MediaQueryList;
    try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return; }
    const on = () => setSystemDark(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [mode, glassTone]);

  useEffect(() => {
    const glassDark = mode === 'glass' && (glassTone === 'dark' || (glassTone === 'auto' && systemDark));
    const dark = mode === 'amoled' || mode === 'vyxeldark' || glassDark;
    const modePreset = MODES.find(m => m.id === mode) ?? MODES[0];
    const accentPreset = THEMES.find(t => t.id === themeId) ?? THEMES[0];
    const root = document.documentElement;

    const modeVars = glassDark ? GLASS_DARK_VARS : modePreset.vars;
    Object.entries(modeVars).forEach(([k, v]) => root.style.setProperty(k, v));
    const accentVars: Record<string, string> = { ...(dark && accentPreset.darkVars ? accentPreset.darkVars : accentPreset.vars) };
    if (dark && !accentPreset.darkVars) {
      // Accent colours are tuned for light parchment; on a dark canvas they must be lifted or every
      // `text-primary` label / tab / badge becomes unreadable (measured: 1.2:1 on black).
      const lift = (key: string, fgKey: string | null, min: number) => {
        const r = liftLightness(accentVars[key], min);
        if (r.lifted) { accentVars[key] = r.value; if (fgKey) accentVars[fgKey] = '0 0% 7%'; }
      };
      lift('--primary', '--primary-foreground', 68);
      lift('--secondary', '--secondary-foreground', 64);
      lift('--accent', '--accent-foreground', 62);
      lift('--destructive', '--destructive-foreground', 64);
      ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'].forEach(k => lift(k, null, 62));
    }
    Object.entries(accentVars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.style.setProperty('--accent-ink', accentInk((dark && accentPreset.darkVars ? accentPreset.darkVars : accentPreset.vars)['--accent'], dark));

    if (mode === 'light') {
      root.style.setProperty('--sidebar-background', '285 28% 16%');
      root.style.setProperty('--sidebar-foreground', '40 25% 92%');
      root.style.setProperty('--sidebar-border', '285 20% 22%');
    } else if (mode === 'vyxel') {
      root.style.setProperty('--sidebar-background', '240 6% 20%');
      root.style.setProperty('--sidebar-foreground', '262 33% 95%');
      root.style.setProperty('--sidebar-border', '260 6% 29%');
    } else if (mode === 'ancient') {
      root.style.setProperty('--sidebar-background', '22 25% 12%');
      root.style.setProperty('--sidebar-foreground', '36 35% 90%');
      root.style.setProperty('--sidebar-border', '22 20% 18%');
      root.style.setProperty('--sidebar-primary', '42 72% 50%');
      root.style.setProperty('--sidebar-primary-foreground', '22 25% 12%');
      root.style.setProperty('--sidebar-accent', '150 55% 38%');
      root.style.setProperty('--sidebar-accent-foreground', '0 0% 100%');
      root.style.setProperty('--sidebar-ring', '42 72% 42%');
    } else {
      root.style.setProperty('--sidebar-background', modeVars['--background']);
      root.style.setProperty('--sidebar-foreground', modeVars['--foreground']);
      root.style.setProperty('--sidebar-border', modeVars['--border']);
    }

    root.classList.toggle('light-mode', mode === 'light' || mode === 'vyxel');
    root.classList.toggle('amoled-mode', mode === 'amoled' || mode === 'vyxeldark');
    root.classList.toggle('vyxel-mode', mode === 'vyxel' || mode === 'vyxeldark');
    root.classList.toggle('ancient-mode', mode === 'ancient');
    root.classList.toggle('glass-mode', mode === 'glass');
    root.classList.toggle('glass-dark', glassDark);
    root.classList.toggle('glass-light', mode === 'glass' && !glassDark);
    root.style.colorScheme = dark ? 'dark' : 'light';

    // Only add transition class on subsequent theme changes (not initial mount)
    // This prevents the initial render from being slowed by transitions on every element
    const isInitial = !root.dataset.themeApplied;
    if (isInitial) {
      root.dataset.themeApplied = 'true';
    } else {
      root.classList.add('theme-transitioning');
      const timer = setTimeout(() => root.classList.remove('theme-transitioning'), 350);
      return () => clearTimeout(timer);
    }
  }, [themeId, mode, glassTone, systemDark]);
}
