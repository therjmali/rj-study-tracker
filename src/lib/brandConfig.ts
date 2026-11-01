import type { StudentMode } from '../types';

export interface BrandConfig {
  appName: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  heroDesc: string;
  footerText: string;
  eyebrow: string;
  ctaText: string;
  features: { icon: string; title: string; desc: string }[];
  stats: { value: string; label: string }[];
}

const NURSING_BRAND: BrandConfig = {
  appName: 'NurseTrack',
  tagline: 'study · practice · master',
  heroTitle: 'Ace your <em>nursing exams</em> with AI.',
  heroSubtitle: 'NurseTrack Pro',
  heroDesc: 'The all-in-one study companion that tracks your syllabus, generates MCQs, schedules reviews, and keeps you motivated — so you focus on learning, not planning.',
  footerText: '© 2026 NurseTrack Pro · AI-powered study companion',
  eyebrow: 'features · what you get',
  ctaText: 'join us · get started',
  features: [
    { icon: '📚', title: 'Smart Syllabus', desc: 'Track every topic across all subjects with 3-state progress' },
    { icon: '🤖', title: 'AI Tutor', desc: 'Claude-powered study chat, explanations & concept breakdowns' },
    { icon: '📝', title: 'MCQ Practice', desc: 'AI-generated practice questions for each topic' },
    { icon: '🧠', title: 'Spaced Repetition', desc: 'SRS algorithm schedules reviews at optimal intervals' },
    { icon: '⏱️', title: 'Focus Timer', desc: 'Pomodoro, Countdown and Stopwatch linked to topics, with live notifications' },
    { icon: '📊', title: 'Visual Analytics', desc: 'Charts, heatmaps & velocity tracking across weeks' },
    { icon: '🏆', title: 'Gamification', desc: 'XP, levels, achievements & coin store to stay motivated' },
    { icon: '🔒', title: 'Private & Offline', desc: 'Works without internet — your data stays on your device' },
  ],
  stats: [
    { value: '100%', label: 'private' },
    { value: 'Offline', label: 'ready' },
    { value: '0', label: 'sign-ups' },
  ],
};

const AGRICULTURE_BRAND: BrandConfig = {
  appName: 'SP AGRO',
  tagline: 'learn · grow · succeed',
  heroTitle: 'Master your <em>agriculture exams</em> with AI.',
  heroSubtitle: 'SP AGRO Pro',
  heroDesc: 'The ultimate study companion for agriculture students — track your syllabus, practice MCQs, and ace ICAR, JRF, SRF & competitive exams with smart AI-powered tools.',
  footerText: '© 2026 SP AGRO Pro · AI-powered study companion',
  eyebrow: 'features · built for agri students',
  ctaText: 'join us · start growing',
  features: [
    { icon: '🌾', title: 'Crop Science Tracker', desc: 'Track every topic across agronomy, horticulture & soil science' },
    { icon: '🤖', title: 'Agri AI Assistant', desc: 'Claude-powered explanations for agriculture concepts & formulas' },
    { icon: '📝', title: 'Agriculture MCQs', desc: 'AI-generated practice questions for ICAR, JRF & competitive exams' },
    { icon: '🧠', title: 'Spaced Repetition', desc: 'SRS algorithm schedules reviews at optimal intervals' },
    { icon: '⏱️', title: 'Focus Timer', desc: 'Pomodoro, Countdown and Stopwatch linked to topics, with live notifications' },
    { icon: '📊', title: 'Visual Analytics', desc: 'Charts, heatmaps & velocity tracking across weeks' },
    { icon: '🏆', title: 'Gamification', desc: 'XP, levels, achievements & study streaks to stay motivated' },
    { icon: '🔒', title: 'Private & Offline', desc: 'Works without internet — your data stays on your device' },
  ],
  stats: [
    { value: '100%', label: 'private' },
    { value: 'Offline', label: 'ready' },
    { value: '0', label: 'sign-ups' },
  ],
};

const GENERIC_BRAND: BrandConfig = {
  appName: 'RJ TRACKER',
  tagline: 'track · learn · achieve',
  heroTitle: 'Ace your <em>exams</em> with AI.',
  heroSubtitle: 'RJ TRACKER Pro',
  heroDesc: 'The all-in-one AI study companion for serious students — track syllabus, generate MCQs, schedule reviews, and stay motivated with gamification. Built for nursing & agriculture students.',
  footerText: '© 2026 RJ TRACKER Pro · AI-powered study companion',
  eyebrow: 'features · everything you need',
  ctaText: 'join us · get started',
  features: [
    { icon: '📚', title: 'Smart Syllabus', desc: 'Track every topic across all subjects with 3-state progress' },
    { icon: '🤖', title: 'AI Tutor', desc: 'Claude-powered study chat, explanations & concept breakdowns' },
    { icon: '📝', title: 'MCQ Practice', desc: 'AI-generated practice questions for each topic' },
    { icon: '🧠', title: 'Spaced Repetition', desc: 'SRS algorithm schedules reviews at optimal intervals' },
    { icon: '⏱️', title: 'Focus Timer', desc: 'Pomodoro, Countdown and Stopwatch linked to topics, with live notifications' },
    { icon: '📊', title: 'Visual Analytics', desc: 'Charts, heatmaps & velocity tracking across weeks' },
    { icon: '🏆', title: 'Gamification', desc: 'XP, levels, achievements & coin store to stay motivated' },
    { icon: '🔒', title: 'Private & Offline', desc: 'Works without internet — your data stays on your device' },
  ],
  stats: [
    { value: '100%', label: 'private' },
    { value: 'Offline', label: 'ready' },
    { value: '0', label: 'sign-ups' },
  ],
};

export function getBrandConfig(mode?: StudentMode | null): BrandConfig {
  if (mode === 'agriculture') return AGRICULTURE_BRAND;
  if (mode === 'nursing') return NURSING_BRAND;
  return GENERIC_BRAND;
}

export function getAppName(mode?: StudentMode | null): string {
  if (mode === 'agriculture') return 'SP AGRO';
  if (mode === 'nursing') return 'NurseTrack';
  return 'RJ TRACKER';
}
