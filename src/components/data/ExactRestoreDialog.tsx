import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';
import { verifyBackupDocument, type IntegrityReport } from '../../platform/backupFormat';
import { restoreExact, summariseBackup } from '../../platform/backupRestore';
import { useCloudAuth } from '../../platform/cloud/authStore';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

export default function ExactRestoreDialog({ doc, fileName, onClose }: { doc: any | null; fileName: string; onClose: () => void }) {
  const cloud = useCloudAuth();
  const signedIn = cloud.status === 'signed-in';
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [mode, setMode] = useState<'overwrite' | 'replace'>('replace');
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [replaceCloud, setReplaceCloud] = useState(true);
  const [busy, setBusy] = useState(false);

  const summary = doc ? summariseBackup(doc) : null;

  useEffect(() => {
    setIntegrity(null); setMode('replace'); setIncludeSecrets(false); setReplaceCloud(true); setBusy(false);
    if (doc) void verifyBackupDocument(doc).then(setIntegrity);
  }, [doc]);

  const run = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const report = await restoreExact(doc, { mode, includeSecrets, replaceCloud: replaceCloud && signedIn });
      if (!report.ok) {
        toast.error(`Restore finished with ${report.mismatches.length} problem(s): ${report.mismatches.slice(0, 3).join(', ')}`, { duration: 12000 });
        setBusy(false);
        return;
      }
      const cloudNote = report.cloudUpdated === true ? ' Cloud copy updated.' : report.cloudUpdated === false ? ' Cloud copy could not be updated — it will sync later.' : '';
      toast.success(`Restored ${report.restored.length} sections exactly.${cloudNote} Reloading…`, { duration: 6000 });
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed — nothing was changed');
      setBusy(false);
    }
  };

  const failed = integrity?.level === 'failed';

  return (
    <AlertDialog open={!!doc} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <AlertDialogContent className="max-h-[88dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
          <AlertDialogDescription>{fileName}</AlertDialogDescription>
        </AlertDialogHeader>

        {summary && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Created', summary.createdAt ? new Date(summary.createdAt).toLocaleString() : 'unknown'],
                ['Source', summary.source === 'cloud' ? '☁️ Cloud copy' : '📱 Device backup'],
                ['Sections', String(summary.entries)],
                ['Size', fmtBytes(summary.bytes)],
                ['Subjects', String(summary.subjects)],
                ['Topics', String(summary.topics)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border/20 bg-card/30 px-2.5 py-1.5">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">{k}</p>
                  <p className="text-xs font-semibold text-foreground truncate">{v}</p>
                </div>
              ))}
            </div>

            <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${failed ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
              {integrity === null ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : failed ? <ShieldAlert className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span>
                {integrity === null ? 'Checking the file…'
                  : failed ? `Integrity check failed — ${integrity.problems[0]}. This file can’t be restored.`
                  : `Integrity verified — ${integrity.checked} sections match their checksums.`}
              </span>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-[11px] font-bold text-foreground mb-1">How should it be restored?</legend>
              {([
                ['replace', 'Replace everything', 'This device becomes exactly the backup. Items not in the file are cleared.'],
                ['overwrite', 'Overwrite matching items', 'Only the items in the file are replaced; everything else stays as it is.'],
              ] as const).map(([id, title, desc]) => (
                <label key={id} className={`flex gap-2.5 rounded-xl border p-2.5 cursor-pointer ${mode === id ? 'border-primary/50 bg-primary/5' : 'border-border/20'}`}>
                  <input type="radio" name="restore-mode" checked={mode === id} onChange={() => setMode(id)} className="mt-0.5 accent-primary" />
                  <span><span className="block text-xs font-bold text-foreground">{title}</span><span className="block text-[11px] text-muted-foreground">{desc}</span></span>
                </label>
              ))}
            </fieldset>

            {summary.hasSecrets && (
              <label className="flex gap-2.5 rounded-xl border border-amber-500/35 bg-amber-500/5 p-2.5 cursor-pointer">
                <input type="checkbox" checked={includeSecrets} onChange={e => setIncludeSecrets(e.target.checked)} className="mt-0.5" />
                <span className="text-[11px] text-foreground"><b>Also restore my AI key.</b> This file contains it in plain text.</span>
              </label>
            )}
            {signedIn && (
              <label className="flex gap-2.5 rounded-xl border border-border/20 p-2.5 cursor-pointer">
                <input type="checkbox" checked={replaceCloud} onChange={e => setReplaceCloud(e.target.checked)} className="mt-0.5" />
                <span className="text-[11px] text-foreground"><b>Also replace my cloud copy</b> so every device matches this backup (recommended). The previous cloud version stays available as a restore point.</span>
              </label>
            )}
            <p className="text-[11px] text-muted-foreground flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" /> A safety snapshot of today’s data is saved first (Settings → AI & Device → Snapshots).</p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button onClick={run} disabled={busy || failed || integrity === null}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Restore now'}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
