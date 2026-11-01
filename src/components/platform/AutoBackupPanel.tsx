import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderOpen, Loader2, Plus, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import {
  BACKUP_FOLDER, backupNow, canPickFolder, getAutoBackupSettings, pickBackupFolder, resetBackupFolder,
  saveAutoBackupSettings, useAutoBackupSettings,
} from '@/platform/autoBackup';
import { isNative } from '@/platform/native';

const KEEP = [7, 14, 30, 60, 120];
const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export default function AutoBackupPanel() {
  const s = useAutoBackupSettings();
  const [time, setTime] = useState('23:30');
  const [busy, setBusy] = useState(false);

  const update = (p: Partial<typeof s>) => saveAutoBackupSettings({ ...getAutoBackupSettings(), ...p });

  const addTime = () => {
    if (!time) return;
    if (s.times.includes(time)) { toast.info('That time is already scheduled'); return; }
    update({ times: [...s.times, time].sort() });
  };

  const run = async () => {
    setBusy(true);
    try { await backupNow('Manual'); } finally { setBusy(false); }
  };

  const where = s.folderUri ? s.folderName : isNative ? `Downloads / ${BACKUP_FOLDER}` : 'Your browser’s Downloads';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/20 bg-card/30 p-4 flex items-center gap-3">
        <UploadCloud className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-foreground">Automatic backups</p>
          <p className="text-[11px] text-muted-foreground leading-snug">Saves a full A–Z backup file by itself and tells you with a notification.</p>
        </div>
        <Toggle on={s.enabled} onChange={v => update({ enabled: v })} label="Automatic backups" />
      </div>

      <div className={s.enabled ? 'space-y-4' : 'space-y-4 opacity-50 pointer-events-none'}>
        <div className="rounded-2xl border border-border/20 bg-card/30 p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-foreground">First open of every day</p>
            <p className="text-[11px] text-muted-foreground leading-snug">The first time you open the app after midnight, yesterday’s work is saved automatically.</p>
          </div>
          <Toggle on={s.onFirstOpen} onChange={v => update({ onFirstOpen: v })} label="Back up on first open each day" />
        </div>

        <div className="space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 px-1">Extra backup times</p>
          <div className="flex flex-wrap gap-2">
            {s.times.length === 0 && <p className="text-[11px] text-muted-foreground px-1">None — add as many as you like.</p>}
            {s.times.map(t => (
              <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 pl-3 pr-1.5 py-1 text-[12px] font-bold font-mono text-foreground">
                {t}
                <button aria-label={`Remove ${t}`} onClick={() => update({ times: s.times.filter(x => x !== t) })} className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="flex-1 h-10 rounded-xl bg-card/50 border-border/30 font-mono" aria-label="Backup time" />
            <Button onClick={addTime} className="h-10 rounded-xl font-bold gap-1"><Plus className="w-4 h-4" /> Add time</Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border/20 bg-card/30 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <FolderOpen className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-foreground">Save to</p>
              <p className="text-[12px] text-foreground/80 break-words">{where}</p>
              {!s.folderUri && isNative && <p className="text-[11px] text-muted-foreground mt-0.5">Open the Files app → Downloads → {BACKUP_FOLDER}</p>}
            </div>
          </div>
          {canPickFolder() && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={async () => { if (await pickBackupFolder()) toast.success('Backup folder selected'); }} className="flex-1 h-10 rounded-xl font-bold">Choose a folder</Button>
              {s.folderUri && <Button variant="outline" onClick={resetBackupFolder} className="h-10 rounded-xl font-bold">Use default</Button>}
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1.5">Keep the newest</p>
            <div className="flex gap-1.5 flex-wrap">
              {KEEP.map(k => (
                <button key={k} onClick={() => update({ keep: k })} aria-pressed={s.keep === k}
                  className={`rounded-lg border px-3 py-1.5 text-[12px] font-bold ${s.keep === k ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border/25 text-muted-foreground'}`}>{k} files</button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">Older backups made by the app are deleted automatically.</p>
          </div>
        </div>
      </div>

      <Button onClick={run} disabled={busy} className="w-full h-11 rounded-xl font-bold gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />} Back up now
      </Button>

      {s.history.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 px-1">Recent backups</p>
          <ul className="space-y-1.5">
            {s.history.slice(0, 6).map(h => (
              <li key={h.at} className="flex items-start gap-2.5 rounded-xl border border-border/15 bg-card/25 px-3 py-2">
                {h.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-foreground">{new Date(h.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}{h.ok ? ` · ${fmtSize(h.bytes)}` : ''}</p>
                  <p className="text-[10px] text-muted-foreground break-words">{h.reason} — {h.where}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
        A web app can only read its data while it is running. Backups at the times above run automatically when the app is open or the next time you open it — and a notification at each time reminds you. Restore any file with Settings → Backup &amp; Restore → Import All.
      </p>
    </div>
  );
}
