/**
 * Notifications.
 *
 * Android APK  → native local notifications (scheduled daily reminders keep firing with the app closed).
 * Browser/PWA  → Notification API through the service worker (reminders only fire while the app is open;
 *                browsers cannot schedule notifications for a closed web page).
 */
import { useSyncExternalStore } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './native';
import { buildReport, fmtMinutes, loadStoredInput } from '../lib/progressReport';

export interface ReminderTime { id: string; time: string; label: string; enabled: boolean }
export interface NightlySettings { enabled: boolean; time: string }
export interface NotifySettings { timerAlerts: boolean; reminders: ReminderTime[]; nightly: NightlySettings }
export type Permission = 'granted' | 'denied' | 'prompt';

const KEY = 'rj-notify-v1';
const EVENT = 'rj:notify-settings';
const REMINDER_BASE = 7000;
export const BACKUP_REMINDER_BASE = 8000;
const NIGHTLY_BASE = 6900;
const NIGHTLY_DAYS = 14;
export const NIGHTLY_DEFAULT_TIME = '23:00';
const CH = { reminders: 'rj_reminders', general: 'rj_general', backup: 'rj_backup', progress: 'rj_progress' };

/* ───────────────────────────── settings ───────────────────────────── */

const DEFAULTS: NotifySettings = { timerAlerts: true, reminders: [], nightly: { enabled: true, time: NIGHTLY_DEFAULT_TIME } };
let cached: NotifySettings | null = null;
let raw: string | null = null;

export function getNotifySettings(): NotifySettings {
  let now: string | null = null;
  try { now = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (cached && now === raw) return cached;
  raw = now;
  try {
    const p = now ? JSON.parse(now) : null;
    cached = {
      timerAlerts: p?.timerAlerts !== false,
      reminders: Array.isArray(p?.reminders)
        ? p.reminders.filter((r: any) => r && /^\d{2}:\d{2}$/.test(r.time)).map((r: any) => ({ id: String(r.id), time: r.time, label: String(r.label ?? ''), enabled: r.enabled !== false }))
        : [],
      nightly: {
        enabled: p?.nightly?.enabled !== false, // on by default
        time: typeof p?.nightly?.time === 'string' && /^\d{2}:\d{2}$/.test(p.nightly.time) ? p.nightly.time : NIGHTLY_DEFAULT_TIME,
      },
    };
  } catch { cached = { ...DEFAULTS, nightly: { ...DEFAULTS.nightly } }; }
  return cached!;
}

export function saveNotifySettings(next: NotifySettings): void {
  cached = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); raw = localStorage.getItem(KEY); } catch { /* keep in memory */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useNotifySettings(): NotifySettings {
  return useSyncExternalStore(
    cb => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); },
    getNotifySettings, getNotifySettings,
  );
}

/* ───────────────────────────── permission ───────────────────────────── */

export async function getPermission(): Promise<Permission> {
  try {
    if (isNative) {
      const r = await LocalNotifications.checkPermissions();
      return r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'prompt';
    }
    if (typeof Notification === 'undefined') return 'denied';
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  } catch { return 'denied'; }
}

export async function requestPermission(): Promise<Permission> {
  try {
    if (isNative) {
      const r = await LocalNotifications.requestPermissions();
      return r.display === 'granted' ? 'granted' : 'denied';
    }
    if (typeof Notification === 'undefined') return 'denied';
    const p = await Notification.requestPermission();
    return p === 'default' ? 'prompt' : p;
  } catch { return 'denied'; }
}

/* ───────────────────────────── posting ───────────────────────────── */

async function webShow(title: string, body: string, tag?: string, actions?: { action: string; title: string }[]) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts: NotificationOptions & { actions?: unknown } = {
      body, tag, icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, badge: `${import.meta.env.BASE_URL}icons/favicon-32.png`,
      actions,
    };
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
  } catch { /* best-effort */ }
}

let nextId = 9000;

/** Show a notification right now. */
export async function postNotice(title: string, body: string, opts: { channel?: 'reminders' | 'general' | 'backup'; actionTypeId?: string } = {}): Promise<void> {
  if ((await getPermission()) !== 'granted') return;
  if (!isNative) { await webShow(title, body); return; }
  try {
    nextId = nextId >= 9999 ? 9000 : nextId + 1;
    await LocalNotifications.schedule({
      notifications: [{
        id: nextId, title, body,
        channelId: CH[opts.channel ?? 'general'],
        actionTypeId: opts.actionTypeId,
        schedule: { at: new Date(Date.now() + 400), allowWhileIdle: true },
      }],
    });
  } catch { /* best-effort */ }
}

/* ───────────────────────────── scheduled reminders ───────────────────────────── */

const STUDY_LINES = [
  'A focused session now keeps tomorrow lighter.',
  'Small, steady steps win exams. Open your tracker.',
  'Revise what is due before learning something new.',
  'Even 25 focused minutes moves your syllabus forward.',
];

function dueTopicCount(): number {
  try {
    const st = JSON.parse(localStorage.getItem('nursing-tracker-v6') ?? '{}');
    const today = new Date().toISOString().slice(0, 10);
    let n = 0;
    for (const s of st.subjects ?? []) for (const u of s.units ?? []) for (const t of u.subTopics ?? []) {
      if (t.completed && t.srsDueDate && String(t.srsDueDate).slice(0, 10) <= today) n++;
    }
    return n;
  } catch { return 0; }
}

function reminderBody(label: string): string {
  const due = dueTopicCount();
  const line = STUDY_LINES[new Date().getDate() % STUDY_LINES.length];
  return `${label ? `${label} — ` : ''}${due > 0 ? `${due} topic${due > 1 ? 's' : ''} due for review. ` : ''}${line}`;
}

async function cancelRange(base: number, count = 200) {
  const ids = Array.from({ length: count }, (_, i) => ({ id: base + i }));
  try { await LocalNotifications.cancel({ notifications: ids }); } catch { /* ignore */ }
}

/** (Re)schedule the daily study reminders. Safe to call often. */
export async function syncReminders(): Promise<void> {
  if (!isNative) return;
  const s = getNotifySettings();
  await cancelRange(REMINDER_BASE);
  if ((await getPermission()) !== 'granted') return;
  const items = s.reminders.filter(r => r.enabled).slice(0, 50);
  if (!items.length) return;
  try {
    await LocalNotifications.schedule({
      notifications: items.map((r, i) => {
        const [hour, minute] = r.time.split(':').map(Number);
        return {
          id: REMINDER_BASE + i,
          title: '📚 Time to study',
          body: reminderBody(r.label),
          channelId: CH.reminders,
          actionTypeId: 'REMINDER',
          schedule: { on: { hour, minute }, allowWhileIdle: true },
        };
      }),
    });
  } catch { /* best-effort */ }
}

/* ───────────────────────────── nightly progress card ───────────────────────────── */

const bar = (pct: number, n = 10) => { const f = Math.round((Math.max(0, Math.min(100, pct)) / 100) * n); return '█'.repeat(f) + '░'.repeat(n - f); };

/** Today's numbers as notification text (computed from what is stored on this device). */
export function nightlyContent(): { title: string; body: string; large: string } {
  const input = loadStoredInput();
  if (!input) return { title: '🌙 How did today go?', body: 'Tap to see your progress card.', large: 'Tap to see your progress card.' };
  const r = buildReport(input, 'today');
  if (!r.hasData) {
    return {
      title: '🌙 Today at a glance',
      body: 'Nothing logged today — a quick topic keeps your streak alive.',
      large: `Nothing logged today yet.\n${r.streak > 0 ? `🔥 ${r.streak}-day streak to protect.\n` : ''}Tap to open your progress card.`,
    };
  }
  const top = r.subjects[0];
  const lines = [
    `⏱  ${fmtMinutes(r.minutes)} studied   ·   ✅ ${r.topics} topic${r.topics === 1 ? '' : 's'}`,
    `🎯  ${bar(r.score)}  ${r.score}% of today's goal`,
    top ? `📚  Most time: ${top.name} (${fmtMinutes(top.minutes)})` : '',
    r.streak > 0 ? `🔥  ${r.streak}-day streak` : '',
    r.prev && r.prev.minutes > 0 ? `📈  ${r.minutes >= r.prev.minutes ? 'Up' : 'Down'} ${Math.abs(Math.round(((r.minutes - r.prev.minutes) / r.prev.minutes) * 100))}% vs yesterday` : '',
  ].filter(Boolean);
  return { title: `🌙 Today's progress · ${r.score}%`, body: `${fmtMinutes(r.minutes)} studied · ${r.topics} topic${r.topics === 1 ? '' : 's'}${r.streak > 0 ? ` · 🔥 ${r.streak}d` : ''}`, large: lines.join('\n') };
}

let lastNightlySig = '';

/**
 * (Re)schedule the nightly card. Tonight's notification carries today's real numbers (refreshed whenever the
 * app is used); the following nights are scheduled too, with a generic line, so it still arrives if the app
 * is not opened for a while.
 */
export async function syncNightly(force = false): Promise<void> {
  const s = getNotifySettings().nightly;
  if (!isNative) return;
  const content = nightlyContent();
  const sig = `${s.enabled}|${s.time}|${content.title}|${content.large}|${new Date().toDateString()}`;
  if (!force && sig === lastNightlySig) return;
  lastNightlySig = sig;
  await cancelRange(NIGHTLY_BASE, 40);
  if (!s.enabled || (await getPermission()) !== 'granted') return;
  const [hour, minute] = s.time.split(':').map(Number);
  const first = new Date(); first.setHours(hour, minute, 0, 0);
  if (first.getTime() <= Date.now() + 30_000) first.setDate(first.getDate() + 1);
  try {
    await LocalNotifications.schedule({
      notifications: Array.from({ length: NIGHTLY_DAYS }, (_, i) => {
        const at = new Date(first); at.setDate(first.getDate() + i);
        const tonight = i === 0;
        return {
          id: NIGHTLY_BASE + i,
          title: tonight ? content.title : '🌙 How did today go?',
          body: tonight ? content.body : 'Tap to see today’s progress card.',
          largeBody: tonight ? content.large : 'Open RJ Tracker to see how today went — hours, topics and your streak.',
          summaryText: 'RJ Tracker · Daily progress',
          channelId: CH.progress,
          actionTypeId: 'NIGHTLY',
          schedule: { at, allowWhileIdle: true },
        };
      }),
    });
  } catch { /* best-effort */ }
}

/** Daily "your backup is due" prompts at the auto-backup times (used by autoBackup.ts). */
export async function syncBackupReminders(times: string[], enabled: boolean): Promise<void> {
  if (!isNative) return;
  await cancelRange(BACKUP_REMINDER_BASE, 50);
  if (!enabled || !times.length || (await getPermission()) !== 'granted') return;
  try {
    await LocalNotifications.schedule({
      notifications: times.slice(0, 20).map((t, i) => {
        const [hour, minute] = t.split(':').map(Number);
        return {
          id: BACKUP_REMINDER_BASE + i,
          title: '💾 Scheduled backup',
          body: 'Tap to open RJ Tracker — your backup runs automatically.',
          channelId: CH.backup,
          actionTypeId: 'BACKUP',
          schedule: { on: { hour, minute }, allowWhileIdle: true },
        };
      }),
    });
  } catch { /* best-effort */ }
}

/* ───────────────────────────── runtime ───────────────────────────── */

function emit(id: string) {
  const w = window as unknown as { __rjPending?: string[] };
  (w.__rjPending = w.__rjPending ?? []).push(id);
  window.dispatchEvent(new CustomEvent('rj:native-action', { detail: { id } }));
}

let started = false;

export async function initNotifications(): Promise<void> {
  if (started) return;
  started = true;

  if (isNative) {
    try {
      await LocalNotifications.createChannel({ id: CH.reminders, name: 'Study reminders', description: 'Daily study reminders', importance: 4, vibration: true });
      await LocalNotifications.createChannel({ id: CH.general, name: 'General', description: 'Backups and app notices', importance: 3 });
      await LocalNotifications.createChannel({ id: CH.backup, name: 'Backups', description: 'Scheduled backup prompts and results', importance: 3 });
      await LocalNotifications.createChannel({ id: CH.progress, name: 'Nightly progress', description: 'A nightly card with how your study day went', importance: 3, vibration: false });
      await LocalNotifications.registerActionTypes({
        types: [
          { id: 'REMINDER', actions: [{ id: 'focus', title: 'Start focus' }, { id: 'snooze', title: 'Snooze 10 min' }] },
          { id: 'BACKUP', actions: [{ id: 'backup-now', title: 'Back up now' }] },
          { id: 'NIGHTLY', actions: [{ id: 'open-progress', title: 'View card' }] },
        ],
      });
      await LocalNotifications.addListener('localNotificationActionPerformed', async (e) => {
        if (e.actionId === 'snooze') {
          await postDelayed('📚 Study reminder', 'Snoozed reminder — ready when you are.', 10 * 60 * 1000);
        } else if (e.actionId === 'focus') emit('start-focus');
        else if (e.actionId === 'backup-now') emit('backup-now');
        else if (e.notification?.actionTypeId === 'BACKUP') emit('backup-now');
        else if (e.actionId === 'open-progress' || e.notification?.actionTypeId === 'NIGHTLY') emit('open-progress');
      });
    } catch { /* plugin unavailable */ }
    await syncReminders();
    await syncNightly(true);
  } else {
    startWebReminderLoop();
  }

  // Deliver actions that arrived before the page was ready.
  const w = window as unknown as { __rjPending?: string[] };
  const queued = (w.__rjPending ?? []).slice();
  w.__rjPending = [];
  queued.forEach(id => window.dispatchEvent(new CustomEvent('rj:native-action', { detail: { id, replay: true } })));

  window.addEventListener('rj:notify-settings', () => { void syncReminders(); void syncNightly(true); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncReminders();
    // leaving the app: lock in tonight's numbers; returning: refresh them
    void syncNightly(document.visibilityState === 'hidden');
  });
  // while the app is open keep tonight's numbers fresh (cheap: only reschedules when the text changed)
  if (isNative) window.setInterval(() => { void syncNightly(); }, 5 * 60 * 1000);
}

async function postDelayed(title: string, body: string, ms: number) {
  try {
    nextId = nextId >= 9999 ? 9000 : nextId + 1;
    await LocalNotifications.schedule({
      notifications: [{ id: nextId, title, body, channelId: CH.reminders, actionTypeId: 'REMINDER', schedule: { at: new Date(Date.now() + ms), allowWhileIdle: true } }],
    });
  } catch { /* ignore */ }
}

/* Web: fire reminders while the page is open. */
function startWebReminderLoop() {
  const fired = new Set<string>();
  setInterval(() => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const day = now.toISOString().slice(0, 10);
    for (const r of getNotifySettings().reminders) {
      const k = `${day}|${r.id}|${r.time}`;
      if (r.enabled && r.time === hhmm && !fired.has(k)) {
        fired.add(k);
        void webShow('📚 Time to study', reminderBody(r.label), `rj-reminder-${r.id}`);
      }
    }
    const n = getNotifySettings().nightly;
    const nk = `${day}|nightly|${n.time}`;
    if (n.enabled && n.time === hhmm && !fired.has(nk)) {
      fired.add(nk);
      const c = nightlyContent();
      void webShow(c.title, c.body, 'rj-nightly');
    }
  }, 20_000);

  // Quick actions tapped on a web notification (service worker → page).
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.type === 'rj-notif-action' && typeof e.data.id === 'string') emit(e.data.id);
  });
}
