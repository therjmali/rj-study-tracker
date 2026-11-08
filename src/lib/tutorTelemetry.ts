import type { Subject, DailyLog, ExamConfig, DbStudySession } from '../types';
import { buildTelemetry, localDateStr, type Telemetry } from './tutorTelemetryLogic.mjs';
import { getEffectiveDayMinutes } from './utils';
import { getMcqStats } from '@/platform/mcqStats';

/** Collects the app's real offline data into the numbers the AI Tutor's analytical engine receives. */
export function collectTutorTelemetry(
  subjects: Subject[], dailyLogs: DailyLog[], exams: ExamConfig[] | undefined, dbSessions: DbStudySession[] | undefined,
): Telemetry {
  const now = new Date();
  const dayMinutes: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = localDateStr(d);
    try { dayMinutes[key] = getEffectiveDayMinutes(subjects as never, dailyLogs, key, dbSessions); } catch { dayMinutes[key] = 0; }
  }
  const mcq = getMcqStats();
  return buildTelemetry({
    subjects: subjects as never, dayMinutes, dailyLogs, exams: (exams ?? []) as never,
    mcq: { total: mcq.total, correct: mcq.correct }, now,
  });
}
