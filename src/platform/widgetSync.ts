/**
 * Android Home Screen Widget Synchronization & Pinning Bridge.
 *
 * Keeps Android AppWidgets (Study Progress, Subject Mastery, Exam Countdown, Quick Focus)
 * updated with live stats and enables native one-tap widget pinning to the Android launcher.
 */

export interface ActiveSubjectWidgetData {
  id: string;
  name: string;
  shortName: string;
  icon?: string;
  color?: string;
  percent: number;
  completedTopics: number;
  totalTopics: number;
  activeUnitId?: string;
  activeUnitName?: string;
  activeUnitPercent?: number;
}

export interface ExamWidgetData {
  title: string;
  date: string;
  daysRemaining: number;
  targetPace?: string;
}

export interface WidgetStats {
  todayMinutes: number;
  todayTopics: number;
  targetTopics: number;
  streakDays: number;
  syllabusPercent: number;
  activeTimer: boolean;
  timerDisplay?: string;
  activeSubject?: ActiveSubjectWidgetData;
  examTarget?: ExamWidgetData;
}

export type WidgetType = 'study' | 'focus' | 'subject' | 'exam';

interface NativeWidgetBridge {
  updateWidgetData?: (json: string) => void;
  isPinWidgetSupported?: () => boolean;
  requestPinWidget?: (widgetType: string) => boolean;
}

const getBridge = (): NativeWidgetBridge | undefined =>
  (window as unknown as { RJNative?: NativeWidgetBridge }).RJNative;

/** Check if the Android launcher supports pinning widgets programmatically (Android 8.0+ / API 26+) */
export function isPinWidgetSupported(): boolean {
  try {
    const bridge = getBridge();
    return bridge?.isPinWidgetSupported ? Boolean(bridge.isPinWidgetSupported()) : false;
  } catch {
    return false;
  }
}

/** Request pinning a widget to the Android Home Screen */
export function requestPinWidget(widgetType: WidgetType): boolean {
  try {
    const bridge = getBridge();
    if (bridge?.requestPinWidget) {
      return Boolean(bridge.requestPinWidget(widgetType));
    }
  } catch {
    // best-effort
  }
  return false;
}

/** Sync latest stats to the Android Native AppWidgets */
export function updateNativeWidgets(stats: WidgetStats): void {
  try {
    const bridge = getBridge();
    if (bridge?.updateWidgetData) {
      bridge.updateWidgetData(JSON.stringify({
        ...stats,
        updatedAt: Date.now(),
      }));
    }
  } catch {
    // best-effort
  }
}
