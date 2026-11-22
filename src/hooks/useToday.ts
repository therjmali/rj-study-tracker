import { useClockSelector } from './useClock';
import { getLocalDateStr } from '../lib/utils';

/**
 * The current local date (YYYY-MM-DD).
 *
 * Subscribes to the shared clock through a selector, so a component using this re-renders ONLY when the
 * calendar date changes (midnight, timezone / DST shift, resume after sleeping through midnight) — not
 * every second. (It used to re-render the whole Home dashboard once per second.)
 */
export function useToday(): string {
  return useClockSelector(getLocalDateStr);
}
