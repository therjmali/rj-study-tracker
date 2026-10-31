import { useRef } from 'react';
import { useClock } from './useClock';
import { getLocalDateStr } from '../lib/utils';

/**
 * Returns the current local date string (YYYY-MM-DD).
 *
 * Derives from the shared `useClock()` (ticks every second + on tab
 * refocus).  The returned string only changes when the local calendar
 * date actually changes (midnight rollover, timezone shift, DST, or
 * app resume after sleeping through midnight), so downstream memos
 * keyed on `today` won't recompute every second.
 */
export function useToday(): string {
  const now = useClock();
  const ref = useRef(getLocalDateStr(now));

  const next = getLocalDateStr(now);
  if (next !== ref.current) {
    ref.current = next;
  }

  return ref.current;
}
