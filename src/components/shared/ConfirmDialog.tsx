import { useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { Input } from '@project/components/ui/input';
import { AlertTriangle, Trash2, CheckCircle2, XCircle } from 'lucide-react';

type Severity = 'warning' | 'danger' | 'info';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  /** Extra detail lines shown below description */
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: Severity;
  /** If set, user must type this phrase to confirm */
  typeToConfirm?: string;
  /** Number of items affected — shown as a badge */
  itemCount?: number;
}

const severityConfig: Record<Severity, { icon: typeof AlertTriangle; iconColor: string; btnClass: string }> = {
  warning: { icon: AlertTriangle, iconColor: 'text-amber-500', btnClass: 'bg-amber-600 hover:bg-amber-700 text-white' },
  danger: { icon: Trash2, iconColor: 'text-destructive', btnClass: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' },
  info: { icon: CheckCircle2, iconColor: 'text-primary', btnClass: '' },
};

export default function ConfirmDialog({
  open, onClose, onConfirm, title, description, details, confirmLabel = 'Confirm',
  cancelLabel = 'Cancel', severity = 'warning', typeToConfirm, itemCount,
}: Props) {
  const [typed, setTyped] = useState('');
  const config = severityConfig[severity];
  const Icon = config.icon;
  const canConfirm = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm.toUpperCase();

  const handleConfirm = () => {
    if (!canConfirm) return;
    setTyped('');
    onConfirm();
  };

  const handleClose = () => {
    setTyped('');
    onClose();
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <AlertDialogContent className="max-w-sm" onKeyDown={e => { if (e.key === 'Enter' && canConfirm) { e.preventDefault(); handleConfirm(); } }}>
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              severity === 'danger' ? 'bg-destructive/10' : severity === 'warning' ? 'bg-amber-500/10' : 'bg-primary/10'
            }`}>
              <Icon className={`w-5 h-5 ${config.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <AlertDialogTitle className="text-base font-bold flex items-center gap-2">
                {title}
                {itemCount !== undefined && itemCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-muted text-[11px] font-bold font-mono text-muted-foreground px-1.5">
                    {itemCount}
                  </span>
                )}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm mt-1">
                {description}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {details && details.length > 0 && (
          <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1">
            {details.map((d, i) => (
              <p key={i} className="text-xs text-muted-foreground font-medium">{d}</p>
            ))}
          </div>
        )}

        {typeToConfirm && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">
              Type <span className="font-mono text-destructive font-bold">{typeToConfirm}</span> to confirm:
            </p>
            <Input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={typeToConfirm}
              className="font-mono text-sm"
              autoFocus
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={severity !== 'info' ? config.btnClass : ''}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
