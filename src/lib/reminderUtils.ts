import type { Reminder } from '../types';

/** Get today's date string in YYYY-MM-DD */
export function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Get current time as HH:mm string */
function getNowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Check if a reminder is active (date matches) */
function isDateActive(r: Reminder, today: string): boolean {
  switch (r.dateMode) {
    case 'every_day': return true;
    case 'single': return r.dateFrom === today;
    case 'range': return !!(r.dateFrom && r.dateTo && today >= r.dateFrom && today <= r.dateTo);
    case 'specific_dates': return r.specificDates?.includes(today) ?? false;
    default: return false;
  }
}

/** Check if a reminder is within its time window */
function isTimeActive(r: Reminder): boolean {
  if (r.timeMode === 'on_app_open' || r.timeMode === 'full_day') return true;
  if (r.timeMode === 'custom_window' && r.timeFrom && r.timeTo) {
    const now = getNowTime();
    return now >= r.timeFrom && now <= r.timeTo;
  }
  return true;
}

/** Check if reminder is snoozed */
function isSnoozed(r: Reminder): boolean {
  if (!r.snoozedUntil) return false;
  return new Date().getTime() < new Date(r.snoozedUntil).getTime();
}

/** Check if reminder was already dismissed today */
function isDismissedToday(r: Reminder, today: string): boolean {
  return r.dismissedDates.includes(today);
}

/** Get all reminders that should be shown right now.
 *  @param includeNextAppOpen — when false, skip reminders with nextAppOpen: true
 *         (used by interval checks to avoid re-showing them during the same session).
 */
export function getDueReminders(reminders: Reminder[], includeNextAppOpen = true): Reminder[] {
  const today = getTodayStr();
  return reminders.filter(r => {
    if (!r.enabled) return false;
    if (r.completedAt) return false;
    if (isSnoozed(r)) return false;
    // "Next App Open" reminders always show on initial load (they were deferred from last session)
    if (r.nextAppOpen) return includeNextAppOpen;
    if (isDismissedToday(r, today) && !r.pinned) return false;
    if (!isDateActive(r, today)) return false;
    if (!isTimeActive(r)) return false;
    return true;
  });
}

/** Get a human-readable schedule summary */
export function getScheduleSummary(r: Reminder): string {
  let date = '';
  switch (r.dateMode) {
    case 'every_day': date = 'Every day'; break;
    case 'single': date = r.dateFrom || 'No date'; break;
    case 'range': date = `${r.dateFrom || '?'} → ${r.dateTo || '?'}`; break;
    case 'specific_dates': date = `${r.specificDates?.length || 0} dates`; break;
  }
  let time = '';
  switch (r.timeMode) {
    case 'on_app_open': time = 'On app open'; break;
    case 'full_day': time = 'Full day'; break;
    case 'custom_window': time = `${r.timeFrom || '?'} – ${r.timeTo || '?'}`; break;
  }
  return `${date} · ${time}`;
}
