import { useEffect } from 'react';
import type { ThemeId, ThemeMode } from '../types';

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
      '--muted-foreground': '20 12% 45%',
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
      '--muted-foreground': '26 16% 44%',
      '--border': '32 22% 80%',
      '--input': '32 22% 80%',
    },
  },
];

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
];

export function useTheme(themeId: ThemeId, mode: ThemeMode = 'light') {
  useEffect(() => {
    const modePreset = MODES.find(m => m.id === mode) ?? MODES[0];
    const accentPreset = THEMES.find(t => t.id === themeId) ?? THEMES[0];
    const root = document.documentElement;

    Object.entries(modePreset.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    Object.entries(accentPreset.vars).forEach(([k, v]) => root.style.setProperty(k, v));

    if (mode === 'light') {
      root.style.setProperty('--sidebar-background', '285 28% 16%');
      root.style.setProperty('--sidebar-foreground', '40 25% 92%');
      root.style.setProperty('--sidebar-border', '285 20% 22%');
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
      root.style.setProperty('--sidebar-background', modePreset.vars['--background']);
      root.style.setProperty('--sidebar-foreground', modePreset.vars['--foreground']);
      root.style.setProperty('--sidebar-border', modePreset.vars['--border']);
    }

    root.classList.toggle('light-mode', mode === 'light');
    root.classList.toggle('amoled-mode', mode === 'amoled');
    root.classList.toggle('ancient-mode', mode === 'ancient');

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
  }, [themeId, mode]);
}
