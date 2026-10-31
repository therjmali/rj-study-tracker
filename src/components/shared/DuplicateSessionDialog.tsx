import { motion } from 'framer-motion';
import { AlertTriangle, Edit2, Merge, Copy, X, Clock } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import type { DbStudySession } from '../../types';
import { formatStudyTime } from '../../lib/utils';

interface Props {
  open: boolean;
  existingSession: DbStudySession;
  newMinutes: number;
  topicName: string;
  onEdit: () => void;
  onMerge: () => void;
  onCreateSeparate: () => void;
  onCancel: () => void;
}

function formatTime12h(t: string | undefined): string {
  if (!t) return '';
  const [hRaw, mRaw] = t.replace(/\./g, ':').split(':').map(Number);
  const h = isNaN(hRaw) ? 0 : hRaw;
  const m = isNaN(mRaw) ? 0 : mRaw;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export default function DuplicateSessionDialog({
  open, existingSession, newMinutes, topicName,
  onEdit, onMerge, onCreateSeparate, onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 400 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl bg-card border border-border/30 shadow-2xl overflow-hidden"
      >
        {/* Warning header */}
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-chart-4/15 border border-chart-4/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-chart-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Existing Session Found</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              You already have a session for this topic today
            </p>
          </div>
        </div>

        {/* Existing session info */}
        <div className="mx-5 mb-4 px-3 py-2.5 rounded-xl bg-muted/10 border border-border/15">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-foreground">{topicName}</p>
              <div className="flex items-center gap-2 mt-1">
                {existingSession.startTime && (
                  <span className="text-[9px] font-mono text-muted-foreground flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {formatTime12h(existingSession.startTime)}
                  </span>
                )}
              </div>
            </div>
            <span className="text-sm font-black font-mono text-secondary">
              {formatStudyTime(existingSession.minutes || 0)}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-5 pb-5 space-y-2">
          <button
            onClick={onEdit}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/20 bg-card/60 hover:bg-primary/5 hover:border-primary/20 transition-all active:scale-[0.98]"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Edit2 className="w-4 h-4 text-primary" />
            </div>
            <div className="text-left flex-1">
              <p className="text-xs font-bold text-foreground">Edit Existing</p>
              <p className="text-[9px] text-muted-foreground">Modify the existing session</p>
            </div>
          </button>

          <button
            onClick={onMerge}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/20 bg-card/60 hover:bg-secondary/5 hover:border-secondary/20 transition-all active:scale-[0.98]"
          >
            <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
              <Merge className="w-4 h-4 text-secondary" />
            </div>
            <div className="text-left flex-1">
              <p className="text-xs font-bold text-foreground">Merge Time</p>
              <p className="text-[9px] text-muted-foreground">
                Add {formatStudyTime(newMinutes)} → {formatStudyTime((existingSession.minutes || 0) + newMinutes)} total
              </p>
            </div>
          </button>

          <button
            onClick={onCreateSeparate}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/20 bg-card/60 hover:bg-accent/5 hover:border-accent/20 transition-all active:scale-[0.98]"
          >
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Copy className="w-4 h-4 text-accent" />
            </div>
            <div className="text-left flex-1">
              <p className="text-xs font-bold text-foreground">Create Separate Session</p>
              <p className="text-[9px] text-muted-foreground">Keep both sessions independently</p>
            </div>
          </button>

          <Button variant="ghost" onClick={onCancel} className="w-full h-9 text-xs text-muted-foreground gap-1.5 rounded-xl">
            <X className="w-3 h-3" /> Cancel
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
