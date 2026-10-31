import type { CustomQuote } from '../types';

export const BUILT_IN_QUOTES: { text: string; author: string }[] = [
  { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
  { text: "Nursing is not just a profession, it's a calling.", author: "Unknown" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "The beautiful thing about learning is nobody can take it away from you.", author: "B.B. King" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Where there is a will, there is a nursing way.", author: "Florence Nightingale" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Your future self will thank you for studying today.", author: "RJ TRACKER Pro" },
  { text: "Every topic you complete brings you one step closer to your dream.", author: "RJ TRACKER Pro" },
  { text: "Knowledge is the best investment you can make.", author: "Benjamin Franklin" },
  { text: "A nurse is compassion in scrubs.", author: "Lexie Saige" },
  { text: "Study hard, stay focused, and the results will follow.", author: "RJ TRACKER Pro" },
  { text: "Difficult roads often lead to beautiful destinations.", author: "Unknown" },
  { text: "Believe in yourself and all that you are.", author: "Christian D. Larson" },
  { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
  { text: "Every patient you will care for is counting on you right now.", author: "Unknown" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "Consistency is what transforms average into excellence.", author: "Unknown" },
  { text: "A nurse will always give us hope, an angel with a stethoscope.", author: "Carrie Latet" },
  { text: "One topic at a time. One day at a time. You've got this.", author: "RJ TRACKER" },
  { text: "The pain you feel today will be the strength you feel tomorrow.", author: "Unknown" },
  { text: "Study hard, stay focused, and make your future self proud.", author: "Unknown" },
];

/** Get the effective built-in quote at an index, merging any user overrides */
export function getEffectiveBuiltInQuote(
  index: number,
  overrides?: Record<number, Partial<CustomQuote> & { hidden?: boolean }>,
): { text: string; author: string; imageUrl?: string; backgroundUrl?: string; hidden: boolean; overridden: boolean } {
  const base = BUILT_IN_QUOTES[index];
  if (!base) return { text: '', author: '', hidden: true, overridden: false };
  const ov = overrides?.[index];
  if (!ov) return { ...base, hidden: false, overridden: false };
  return {
    text: ov.text ?? base.text,
    author: ov.author ?? base.author,
    imageUrl: ov.imageUrl,
    backgroundUrl: ov.backgroundUrl,
    hidden: ov.hidden ?? false,
    overridden: true,
  };
}

/** Build the full list of active quotes (custom + visible built-in with overrides) */
export function getAllActiveQuotes(
  customQuotes: CustomQuote[] = [],
  hiddenBuiltInQuotes: string[] = [],
  overrides?: Record<number, Partial<CustomQuote> & { hidden?: boolean }>,
): { text: string; author: string; imageUrl?: string; backgroundUrl?: string; isCustom: boolean; builtInIndex?: number }[] {
  const hiddenSet = new Set(hiddenBuiltInQuotes);
  const custom = customQuotes.map(q => ({
    text: q.text, author: q.author, imageUrl: q.imageUrl, backgroundUrl: q.backgroundUrl, isCustom: true,
  }));
  const builtIn = BUILT_IN_QUOTES.map((q, i) => {
    const eff = getEffectiveBuiltInQuote(i, overrides);
    if (eff.hidden || hiddenSet.has(q.text)) return null;
    return { text: eff.text, author: eff.author, imageUrl: eff.imageUrl, backgroundUrl: eff.backgroundUrl, isCustom: false, builtInIndex: i };
  }).filter(Boolean) as { text: string; author: string; imageUrl?: string; backgroundUrl?: string; isCustom: boolean; builtInIndex: number }[];
  return [...custom, ...builtIn];
}

export function getRotatingQuote(): { text: string; author: string } {
  const all = getAllActiveQuotes();
  if (all.length === 0) return BUILT_IN_QUOTES[0];
  const slot = Math.floor(Date.now() / (1000 * 60 * 30));
  return all[slot % all.length];
}

export function getQuoteOfTheDay(
  customQuotes?: CustomQuote[],
  hiddenBuiltInQuotes?: string[],
  overrides?: Record<number, Partial<CustomQuote> & { hidden?: boolean }>,
): { text: string; author: string } {
  const all = getAllActiveQuotes(customQuotes, hiddenBuiltInQuotes, overrides);
  if (all.length === 0) return BUILT_IN_QUOTES[0];
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return all[dayOfYear % all.length];
}
