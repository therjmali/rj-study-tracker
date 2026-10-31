import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Download, RefreshCw, GitMerge, FileText, ArrowRight, AlertTriangle } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel } from '@project/components/ui/alert-dialog';

export interface FileStats {
  subjects: number;
  units: number;
  topics: number;
  completed: number;
  dailyLogs: number;
  history: number;
  sessions: number;
  mcqs: number;
  folders: number;
  reminders: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  fileName: string;
  fileStats: FileStats;
  currentStats: FileStats;
  onImportAsIs: () => void;
  onFreshStart: () => void;
  onMerge: () => void;
}

function CompareRow({ icon, label, current, incoming }: { icon: string; label: string; current: number; incoming: number }) {
  const diff = incoming - current;
  const color = diff > 0 ? 'text-secondary' : diff < 0 ? 'text-destructive' : 'text-muted-foreground';
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-card/30 border border-border/10">
      <span className="text-sm">{icon}</span>
      <span className="text-[11px] font-semibold text-foreground/70 flex-1">{label}</span>
      <span className="text-[11px] font-mono font-bold text-muted-foreground w-10 text-right">{current}</span>
      <ArrowRight className="w-3 h-3 text-muted-foreground/30" />
      <span className="text-[11px] font-mono font-bold text-foreground w-10 text-right">{incoming}</span>
      {diff !== 0 && (
        <span className={`text-[9px] font-mono font-bold ${color} w-10 text-right`}>
          {diff > 0 ? '+' : ''}{diff}
        </span>
      )}
    </div>
  );
}

export default function ImportPreviewDialog({ open, onClose, fileName, fileStats, currentStats, onImportAsIs, onFreshStart, onMerge }: Props) {
  const rows = useMemo(() => [
    { icon: '📚', label: 'Subjects', current: currentStats.subjects, incoming: fileStats.subjects },
    { icon: '📦', label: 'Units', current: currentStats.units, incoming: fileStats.units },
    { icon: '📝', label: 'Topics', current: currentStats.topics, incoming: fileStats.topics },
    { icon: '✅', label: 'Completed', current: currentStats.completed, incoming: fileStats.completed },
    { icon: '📅', label: 'Daily Logs', current: currentStats.dailyLogs, incoming: fileStats.dailyLogs },
    { icon: '📜', label: 'History', current: currentStats.history, incoming: fileStats.history },
    { icon: '⏱️', label: 'Sessions', current: currentStats.sessions, incoming: fileStats.sessions },
    { icon: '❓', label: 'MCQs', current: currentStats.mcqs, incoming: fileStats.mcqs },
    { icon: '📂', label: 'Folders', current: currentStats.folders, incoming: fileStats.folders },
  ], [fileStats, currentStats]);

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-border/20 max-w-md max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <FileText className="w-5 h-5 text-primary" />
            Import Preview
          </AlertDialogTitle>
        </AlertDialogHeader>

        {/* File Name */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
          <span className="text-sm">📄</span>
          <span className="text-[11px] font-bold text-foreground truncate flex-1">{fileName}</span>
        </div>

        {/* Comparison Table */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 px-3 py-1">
            <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest flex-1">Data</span>
            <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest w-10 text-right">Now</span>
            <span className="w-3" />
            <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest w-10 text-right">File</span>
            <span className="w-10" />
          </div>
          {rows.map(r => <CompareRow key={r.label} {...r} />)}
        </div>

        {/* 3 Import Mode Buttons */}
        <div className="space-y-2 pt-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Choose Import Mode</p>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onImportAsIs}
            className="w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 border-primary/25 bg-primary/5 hover:bg-primary/10 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Download className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Import As-Is</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                Replace your current data with the backup file. Your existing progress will be overwritten.
              </p>
            </div>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onFreshStart}
            className="w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0">
              <RefreshCw className="w-5 h-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Fresh Start</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                Wipe all existing data first, then import. Clean slate with backup data only.
              </p>
              <div className="flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3 text-destructive/60" />
                <span className="text-[9px] text-destructive/70 font-semibold">All current data will be permanently deleted</span>
              </div>
            </div>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onMerge}
            className="w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 border-secondary/25 bg-secondary/5 hover:bg-secondary/10 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center shrink-0">
              <GitMerge className="w-5 h-5 text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Merge</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                Smart merge — keeps your existing data and adds new subjects, units & topics from the file without duplicating.
              </p>
            </div>
          </motion.button>
        </div>

        <AlertDialogFooter className="pt-2">
          <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
