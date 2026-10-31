import type { ExamConfig } from '../types';

/**
 * Get the target Date for an exam using its date + optional time.
 * If no time is set, defaults to 00:00 local time on the exam date.
 */
export function getExamTarget(exam: ExamConfig): Date {
  const time = exam.time || '00:00';
  const [h, m] = time.split(':').map(Number);
  const [y, mo, d] = exam.date.split('-').map(Number);
  const target = new Date(y, mo - 1, d, h || 0, m || 0, 0, 0);
  return target;
}

/**
 * Calculate countdown breakdown from `now` to an exam target.
 * Returns days, hours, minutes, seconds, total diff in ms,
 * whether it's past, and urgency status.
 */
export function getExamCountdown(exam: ExamConfig, now: Date) {
  const target = getExamTarget(exam);
  const diff = Math.max(0, target.getTime() - now.getTime());
  const isPast = diff === 0;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);
  const isCritical = days <= 15 && !isPast;
  const isUrgent = days <= 30 && days > 15;

  return { target, diff, isPast, days, hours, minutes, seconds, isCritical, isUrgent };
}

/**
 * Format an exam's target date+time for display.
 * e.g. "02 Sep 2026, 09:00"
 */
export function formatExamTarget(exam: ExamConfig): string {
  const target = getExamTarget(exam);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = String(target.getDate()).padStart(2, '0');
  const mon = months[target.getMonth()];
  const y = target.getFullYear();
  const h = String(target.getHours()).padStart(2, '0');
  const m = String(target.getMinutes()).padStart(2, '0');
  return `${d} ${mon} ${y}, ${h}:${m}`;
}
