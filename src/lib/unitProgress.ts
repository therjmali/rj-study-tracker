/**
 * Canonical unit-progress calculation — single source of truth.
 *
 * Both the Home dashboard (SubjectProgressRows / UnifiedReadiness)
 * and the Syllabus screen (SubjectOverview) MUST use these helpers
 * so that status, percentages, and filter results are always consistent.
 */

export type UnitStatus = 'complete' | 'partial' | 'incomplete' | 'empty';

export interface UnitProgress {
  completed: number;
  total: number;
  percentage: number;
  status: UnitStatus;
}

/**
 * Derive a unit's progress from its topic counts.
 *
 * Rules (all independent of the parent subject's numbers):
 *   total = 0                        → 'empty'   (➖)
 *   completed = 0  && total > 0      → 'incomplete' (❌)
 *   completed > 0  && completed < total → 'partial'   (🔄)
 *   completed = total && total > 0   → 'complete'   (✅)
 */
export function getUnitProgress(completed: number, total: number): UnitProgress {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  let status: UnitStatus;
  if (total === 0) {
    status = 'empty';
  } else if (completed === 0) {
    status = 'incomplete';
  } else if (completed < total) {
    status = 'partial';
  } else {
    status = 'complete';
  }

  return { completed, total, percentage, status };
}

/** Map a UnitStatus to its display emoji. */
export function unitStatusEmoji(status: UnitStatus): string {
  switch (status) {
    case 'complete': return '✅';
    case 'partial': return '🔄';
    case 'incomplete': return '❌';
    case 'empty': return '➖';
  }
}

/**
 * Return true when a unit matches the given filter.
 *
 * Filter vocabulary (matches the pill IDs used in the UI):
 *   'all'        → every unit
 *   'complete'   → ✅  done === total && total > 0
 *   'partial'    → 🔄  done > 0 && done < total
 *   'incomplete' → ❌  done === 0 && total > 0
 */
export function unitMatchesFilter(
  progress: UnitProgress,
  filter: 'all' | 'complete' | 'partial' | 'incomplete',
): boolean {
  if (filter === 'all') return true;
  return progress.status === filter;
}
