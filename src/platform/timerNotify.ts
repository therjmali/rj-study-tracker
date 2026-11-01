/**
 * Live timer notification with quick actions.
 *
 * Android: a native ongoing notification with a *system-driven* chronometer (keeps counting with
 * the screen off) plus an exact alarm that announces the end of a session even if the web view is asleep.
 * Browser: a static notification with action buttons (no live countdown is possible).
 */
import { getNotifySettings, getPermission, requestPermission } from './notify';
import { isNative } from './native';

interface Bridge {
  timerShow?: (title: string, text: string, whenMs: number, countDown: boolean, running: boolean, actions: string) => void;
  timerAlarm?: (atMs: number, title: string, body: string, next: string, nextLabel: string) => void;
  timerClear?: () => void;
  timerCancelAlarm?: () => void;
  timerDone?: (title: string, body: string, next: string, nextLabel: string) => void;
}
const bridge = (): Bridge | undefined => (window as unknown as { RJNative?: Bridge }).RJNative;

export interface TimerAction { id: string; label: string }

let askedOnce = false;
async function allowed(): Promise<boolean> {
  if (!getNotifySettings().timerAlerts) return false;
  let p = await getPermission();
  if (p === 'prompt' && !askedOnce) { askedOnce = true; p = await requestPermission(); }
  return p === 'granted';
}

async function webNotify(title: string, body: string, actions: TimerAction[], persistent: boolean, tag = 'rj-timer') {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) return;
    await reg.showNotification(title, {
      body, tag, silent: persistent, requireInteraction: persistent,
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      actions: actions.map(a => ({ action: a.id, title: a.label })),
    } as NotificationOptions);
  } catch { /* best-effort */ }
}

async function webClear() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    (await reg?.getNotifications({ tag: 'rj-timer' }))?.forEach(n => n.close());
  } catch { /* ignore */ }
}

export async function timerShow(o: { title: string; text: string; whenMs: number; countDown: boolean; running: boolean; actions: TimerAction[] }): Promise<void> {
  if (!(await allowed())) return;
  const b = bridge();
  if (isNative && b?.timerShow) {
    b.timerShow(o.title, o.text, o.whenMs, o.countDown, o.running, o.actions.map(a => `${a.id}:${a.label}`).join(','));
  } else {
    await webNotify(o.title, o.text, o.actions, true);
  }
}

/** Exact alarm that announces the end of the session even when the page is asleep. */
export async function timerAlarm(atMs: number, title: string, body: string, next?: TimerAction): Promise<void> {
  if (!(await allowed())) return;
  bridge()?.timerAlarm?.(atMs, title, body, next?.id ?? '', next?.label ?? '');
}

export function timerCancelAlarm(): void { bridge()?.timerCancelAlarm?.(); }

export function timerClear(): void {
  const b = bridge();
  if (isNative && b?.timerClear) b.timerClear(); else void webClear();
}

export async function timerDone(title: string, body: string, next?: TimerAction): Promise<void> {
  if (!(await allowed())) return;
  const b = bridge();
  if (isNative && b?.timerDone) b.timerDone(title, body, next?.id ?? '', next?.label ?? '');
  else { await webClear(); await webNotify(title, body, next ? [next] : [], false, 'rj-timer-done'); }
}
