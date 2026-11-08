export const NA: 'NOT_AVAILABLE';
export function localDateStr(d: Date): string;
export interface TelemetryInput {
  subjects: any[]; dayMinutes?: Record<string, number>; dailyLogs?: any[]; exams?: any[];
  mcq?: { total: number; correct: number }; now?: Date;
}
export interface Telemetry {
  currentUnit: string; currentTopic: string; completionRate: number | string; examDate: string; daysRemaining: number | string;
  recentLogs: { date: string; minutes: number; topics_completed: number }[]; recentLogsJson: string;
  totalMcqs: number; accuracyRate: number | string;
  derived: {
    totalTopics: number; completedTopics: number; remainingTopics: number; remainingInActiveUnit: number | string;
    requiredPace: number | string; observedPace: number; avgMinutesPerDay7d: number; studyDays7d: number; paceVerdict: string;
  };
}
export function buildTelemetry(input: TelemetryInput): Telemetry;
export const ENGINE_TEMPLATE: string;
export function renderEnginePrompt(t: Telemetry): string;
