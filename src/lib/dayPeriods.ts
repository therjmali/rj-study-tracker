/**
 * Unified Day Period Definitions — Single Source of Truth
 *
 * Morning:   4:00 AM – 11:59 AM  (hour >= 4 && hour < 12)
 * Afternoon: 12:00 PM – 4:59 PM  (hour >= 12 && hour < 17)
 * Evening:   5:00 PM – 7:59 PM   (hour >= 17 && hour < 20)
 * Night:     8:00 PM – 3:59 AM   (hour >= 20 || hour < 4)
 */

export type DayPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

export interface DayPeriodInfo {
  key: DayPeriod;
  label: string;
  emoji: string;
  timeRange: string;
}

export const DAY_PERIOD_LABELS: DayPeriodInfo[] = [
  { key: 'morning',   label: 'Morning',   emoji: '🌅', timeRange: '4am–12pm' },
  { key: 'afternoon', label: 'Afternoon', emoji: '☀️', timeRange: '12–5pm' },
  { key: 'evening',   label: 'Evening',   emoji: '🌆', timeRange: '5–8pm' },
  { key: 'night',     label: 'Night',     emoji: '🌙', timeRange: '8pm–4am' },
];

/** Get the day period for a given hour (0-23). */
export function getDayPeriod(hour: number): DayPeriod {
  if (hour >= 4 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'night'; // hour >= 20 || hour < 4
}

/** Classify an hour into a bucket object. */
export function classifyIntoBuckets(hours: number[]): Record<DayPeriod, number> {
  const b: Record<DayPeriod, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  hours.forEach(h => { b[getDayPeriod(h)]++; });
  return b;
}

/** Get a greeting based on the current hour. */
export function getGreeting(hour: number): { text: string; emoji: string; sub: string } {
  if (hour >= 0 && hour < 4)   return { text: 'Burning midnight oil?', emoji: '🌙', sub: 'Night sessions build resilience' };
  if (hour >= 4 && hour < 12)  return { text: 'Good Morning!', emoji: '☀️', sub: 'Fresh mind, fresh start' };
  if (hour >= 12 && hour < 17) return { text: 'Good Afternoon!', emoji: '🌤️', sub: 'Keep the momentum going' };
  if (hour >= 17 && hour < 20) return { text: 'Good Evening!', emoji: '🌆', sub: 'Wind down with a quick review' };
  return { text: 'Night owl mode!', emoji: '🦉', sub: 'Deep focus in the quiet hours' };
}

/** Sanitize a string for use as a filename segment. */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s\-_.]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
