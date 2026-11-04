/**
 * Live timer notification with quick actions.
 *
 * Android: a rich, custom-designed notification (live system chronometer that keeps counting with
 * the screen off, subject chip, session details, Pause / Stop & Save / Notes buttons and report /
 * history / settings shortcuts) plus an exact alarm that announces the end of a countdown even if the
 * web view is asleep or the app was closed.
 * Browser: a standard notification with action buttons (no live ticking is possible).
 */
import { getNotifySettings, getPermission, requestPermission } from './notify';
import { isNative } from './native';

/** Everything the native notification needs; times are epoch milliseconds. */
export interface TimerNotifyPayload {
  v: 2;
  mode: 'countdown' | 'stopwatch';
  running: boolean;
  /** Chronometer direction. */
  countDown: boolean;
  /** Running: stopwatch start / countdown end. */
  anchorMs: number;
  /** Paused: elapsed (stopwatch) or remaining (countdown). */
  valueMs: number;
  totalMs: number;
  startedAtMs: number;
  modeLabel: string;
  headlineRunning: string;
  headlinePaused: string;
  activity: string;
  subject: string;
  unit: string;
  topic: string;
  /** Ids so a tap on the card can open the running topic's window. */
  subjectId: string;
  unitId: string;
  topicId: string;
  /** Subject colour (#rrggbb) used as the notification accent. */
  color: string;
  sessions: number;
  stopLabel: string;
  /** End-of-session alarm (countdown modes only). */
  endTitle: string;
  endBody: string;
  nextId: string;
  nextLabel: string;
}

interface Bridge {
  timerUpdate?: (json: string) => void;
  timerShow?: (title: string, text: string, whenMs: number, countDown: boolean, running: boolean, actions: string) => void;
  timerAlarm?: (atMs: number, title: string, body: string, next: string, nextLabel: string) => void;
  timerClear?: () => void;
  timerCancelAlarm?: () => void;
  timerDone?: (title: string, body: string, next: string, nextLabel: string) => void;
  timerSaved?: (title: string, body: string) => void;
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
      badge: `${import.meta.env.BASE_URL}icons/favicon-32.png`,
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

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const hms = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

/** Publish (or refresh) the running / paused timer notification. */
export async function timerPublish(p: TimerNotifyPayload): Promise<void> {
  if (!(await allowed())) return;
  const b = bridge();
  if (isNative && b?.timerUpdate) {
    try { b.timerUpdate(JSON.stringify(p)); } catch { /* best-effort */ }
    return;
  }
  const headline = p.running ? p.headlineRunning : p.headlinePaused;
  const detail = p.running
    ? (p.countDown ? `Ends at ${clock(p.anchorMs)}` : `Started at ${clock(p.startedAtMs || p.anchorMs)}`)
    : `${hms(p.valueMs)} ${p.countDown ? 'left' : 'recorded'}`;
  const actions: TimerAction[] = [{ id: 'timer-toggle', label: p.running ? 'Pause' : 'Resume' }, { id: 'timer-stop', label: p.stopLabel }];
  if (isNative && b?.timerShow) {
    b.timerShow(headline, detail, p.running ? p.anchorMs : 0, p.countDown, p.running, actions.map(a => `${a.id}:${a.label}`).join(','));
    if (p.running && p.countDown) b.timerAlarm?.(p.anchorMs + 1500, p.endTitle, p.endBody, p.nextId, p.nextLabel);
    else b.timerCancelAlarm?.();
    return;
  }
  await webNotify(`⏱️ ${headline}`, detail, actions, true);
}

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

/** Quiet "session saved" receipt, shown when a session is saved while the app is in the background. */
export async function timerSaved(title: string, body: string): Promise<void> {
  if (!(await allowed())) return;
  const b = bridge();
  if (isNative && b?.timerSaved) b.timerSaved(title, body);
  else await webNotify(title, body, [], false, 'rj-timer-saved');
}
