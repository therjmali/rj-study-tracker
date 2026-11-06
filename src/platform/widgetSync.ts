/**
 * Android Home Screen Widget Synchronization & Pinning Bridge.
 *
 * Keeps Android AppWidgets (Study Progress & Focus Timer) updated with
 * live stats (today's study time, completed topics, streak, syllabus progress)
 * and enables native one-tap widget pinning to the Android home screen launcher.
 */

export interface WidgetStats {
  todayMinutes: number;
  todayTopics: number;
  targetTopics: number;
  streakDays: number;
  syllabusPercent: number;
  activeTimer: boolean;
  timerDisplay?: string;
}

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

/** Request pinning a widget to the Android Home Screen ('study' or 'focus') */
export function requestPinWidget(widgetType: 'study' | 'focus'): boolean {
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
