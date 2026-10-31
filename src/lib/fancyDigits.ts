// Premium styled digit formatter (uses regular ASCII digits - renders on all devices)
// Styling is applied via CSS in components

/** Pad a number with leading zero for display: 1 → "01", 12 → "12" */
export function formatUnitNumber(n: number): string {
  return String(n).padStart(2, '0');
}
