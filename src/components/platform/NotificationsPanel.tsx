import { useCallback, useEffect, useState } from 'react';
import { Bell, BellRing, Plus, Send, Trash2, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import {
  getNotifySettings, getPermission, postNotice, requestPermission, saveNotifySettings, useNotifySettings,
  type Permission, type ReminderTime,
} from '@/platform/notify';
import { isNative } from '@/platform/native';

const SUGGESTED = [
  { time: '06:30', label: 'Morning revision' },
  { time: '14:00', label: 'Afternoon session' },
  { time: '21:00', label: 'Night recap' },
];

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-primary' : 'bg-muted-foreground/30'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export default function NotificationsPanel() {
  const settings = useNotifySettings();
  const [perm, setPerm] = useState<Permission>('prompt');
  const [time, setTime] = useState('07:00');
  const [label, setLabel] = useState('');

  const refresh = useCallback(async () => setPerm(await getPermission()), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const update = (patch: Partial<typeof settings>) => saveNotifySettings({ ...getNotifySettings(), ...patch });

  const enable = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === 'granted') toast.success('Notifications enabled');
    else toast.error('Notifications are blocked — allow them in your phone’s app settings.');
  };

  const addReminder = (t: string, l: string) => {
    if (settings.reminders.some(r => r.time === t)) { toast.info('You already have a reminder at that time'); return; }
    const r: ReminderTime = { id: `r${Date.now().toString(36)}`, time: t, label: l.trim(), enabled: true };
    update({ reminders: [...settings.reminders, r].sort((a, b) => a.time.localeCompare(b.time)) });
    if (perm !== 'granted') void enable();
  };

  const patchReminder = (id: string, p: Partial<ReminderTime>) =>
    update({ reminders: settings.reminders.map(r => (r.id === id ? { ...r, ...p } : r)) });

  const test = async () => {
    if (perm !== 'granted') { await enable(); return; }
    await postNotice('🔔 RJ Tracker', 'Notifications are working.', { channel: 'general' });
    toast.success('Test notification sent');
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 flex items-center gap-3 ${perm === 'granted' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
        {perm === 'granted' ? <BellRing className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" /> : <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-foreground">{perm === 'granted' ? 'Notifications are on' : perm === 'denied' ? 'Notifications are blocked' : 'Notifications are off'}</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {perm === 'denied' ? 'Allow notifications for RJ Tracker in your phone’s app settings.' : 'Needed for reminders, the live timer and backup alerts.'}
          </p>
        </div>
        {perm !== 'granted' && <Button size="sm" onClick={enable} className="rounded-xl font-bold shrink-0">Enable</Button>}
      </div>

      <div className="rounded-2xl border border-border/20 bg-card/30 p-4 flex items-center gap-3">
        <Timer className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-foreground">Timer &amp; stopwatch notification</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Live countdown with Pause / Resume / Stop buttons{isNative ? ', and an alert when a session ends — even with the screen off' : ' (the countdown is static in a browser)'}.
          </p>
        </div>
        <Toggle on={settings.timerAlerts} onChange={v => update({ timerAlerts: v })} label="Timer notifications" />
      </div>

      <div className="space-y-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 px-1">Daily study reminders</p>

        {settings.reminders.length === 0 && (
          <p className="text-[11px] text-muted-foreground px-1">No reminders yet. Add a time below, or tap a suggestion.</p>
        )}

        <ul className="space-y-2">
          {settings.reminders.map(r => (
            <li key={r.id} className="flex items-center gap-2.5 rounded-2xl border border-border/20 bg-card/30 px-3 py-2.5">
              <Input
                type="time" value={r.time} onChange={e => e.target.value && patchReminder(r.id, { time: e.target.value })}
                className="w-[104px] h-9 rounded-lg bg-card/50 border-border/30 font-mono text-[13px] px-2" aria-label="Reminder time"
              />
              <Input
                value={r.label} onChange={e => patchReminder(r.id, { label: e.target.value })} placeholder="Label (optional)"
                className="flex-1 min-w-0 h-9 rounded-lg bg-transparent border-transparent text-[12px] px-1" aria-label="Reminder label"
              />
              <Toggle on={r.enabled} onChange={v => patchReminder(r.id, { enabled: v })} label="Enable reminder" />
              <button aria-label="Delete reminder" onClick={() => update({ reminders: settings.reminders.filter(x => x.id !== r.id) })} className="w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive flex items-center justify-center">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-[116px] h-10 rounded-xl bg-card/50 border-border/30 font-mono" aria-label="New reminder time" />
          <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional)" className="flex-1 h-10 rounded-xl bg-card/50 border-border/30 text-[13px]" aria-label="New reminder label" />
          <Button onClick={() => { if (time) { addReminder(time, label); setLabel(''); } }} className="h-10 rounded-xl font-bold gap-1"><Plus className="w-4 h-4" /> Add</Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED.filter(s => !settings.reminders.some(r => r.time === s.time)).map(s => (
            <button key={s.time} onClick={() => addReminder(s.time, s.label)} className="rounded-full border border-border/30 bg-card/30 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
              + {s.time} · {s.label}
            </button>
          ))}
        </div>
      </div>

      <Button variant="outline" onClick={test} className="w-full h-10 rounded-xl font-bold gap-2"><Send className="w-4 h-4" /> Send a test notification</Button>

      <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
        {isNative
          ? 'Reminders are scheduled on your phone and arrive even when the app is closed. Each one has “Start focus” and “Snooze 10 min” buttons. If your phone stops them, set RJ Tracker to “Unrestricted” battery use.'
          : 'In a browser, reminders can only appear while RJ Tracker is open. Install the Android app for reminders that arrive with the app closed.'}
      </p>
    </div>
  );
}
