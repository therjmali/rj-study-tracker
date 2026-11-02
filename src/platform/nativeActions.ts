/**
 * Notification buttons → app.
 *
 * Every tap on a notification button (Pause, Stop & Save, Notes, View Report …) is written by the
 * Android layer to a small durable queue together with the moment it was tapped. The web side pulls
 * that queue here — on launch, whenever the app comes back to the foreground and whenever the native
 * layer says "wake up" — and re-emits each entry as `rj:native-action` with `{ id, at }`.
 *
 * Because the queue lives natively, a button tapped while the app was closed (or the web view was
 * being rebuilt) is never lost.
 */
import { isNative } from './native';

interface Bridge { takePendingActions?: () => string }
const bridge = (): Bridge | undefined => (window as unknown as { RJNative?: Bridge }).RJNative;

export interface NativeAction { id: string; at: number; subjectId?: string; unitId?: string; topicId?: string }

export function drainNativeActions(): void {
  const b = bridge();
  if (!b?.takePendingActions) return;
  let list: NativeAction[] = [];
  try {
    const parsed = JSON.parse(b.takePendingActions() || '[]');
    if (Array.isArray(parsed)) list = parsed;
  } catch { return; }
  for (const a of list) {
    if (!a || typeof a.id !== 'string' || !a.id) continue;
    const at = Number(a.at) > 0 ? Number(a.at) : Date.now();
    window.dispatchEvent(new CustomEvent('rj:native-action', {
      detail: { id: a.id, at, subjectId: a.subjectId, unitId: a.unitId, topicId: a.topicId },
    }));
  }
}

let installed = false;
export function installNativeActionDrain(): void {
  if (!isNative || installed) return;
  installed = true;
  window.addEventListener('rj:native-wake', drainNativeActions);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') drainNativeActions(); });
  // Cold start: wait until React has registered its listeners, then check twice.
  setTimeout(drainNativeActions, 700);
  setTimeout(drainNativeActions, 2500);
}
