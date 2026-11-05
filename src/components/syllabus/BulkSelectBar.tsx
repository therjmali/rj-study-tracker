import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Star, Trash2, X, FolderPlus, ArrowRightLeft, Copy, CheckSquare } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import ConfirmDialog from '../shared/ConfirmDialog';

interface Props {
  count: number;
  totalVisible: number;
  onMarkComplete: () => void;
  onMarkIncomplete: () => void;
  onToggleStar: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onCreateUnit?: () => void;
  onMoveTopics?: () => void;
  onCopyTopics?: () => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  subjectSummary?: string;
}

type PendingAction = 'complete' | 'incomplete' | 'delete' | null;

export default function BulkSelectBar({ count, totalVisible, onMarkComplete, onMarkIncomplete, onToggleStar, onDelete, onCancel, onCreateUnit, onMoveTopics, onCopyTopics, onSelectAll, onDeselectAll, subjectSummary }: Props) {
  const allSelected = count >= totalVisible && totalVisible > 0;
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const handleConfirm = () => {
    if (pendingAction === 'complete') onMarkComplete();
    else if (pendingAction === 'incomplete') onMarkIncomplete();
    else if (pendingAction === 'delete') onDelete();
    setPendingAction(null);
  };

  const getDialogProps = () => {
    switch (pendingAction) {
      case 'complete':
        return {
          title: 'Mark Topics Complete',
          description: `This will mark ${count} topic${count !== 1 ? 's' : ''} as completed with today's date.`,
          confirmLabel: `Mark ${count} Complete`,
          severity: 'info' as const,
          details: subjectSummary ? [`Affected: ${subjectSummary}`] : undefined,
        };
      case 'incomplete':
        return {
          title: 'Mark Topics Incomplete',
          description: `This will mark ${count} topic${count !== 1 ? 's' : ''} as incomplete, removing their completion dates.`,
          confirmLabel: `Mark ${count} Incomplete`,
          severity: 'warning' as const,
          details: [
            'Study time and notes will be preserved.',
            subjectSummary ? `Affected: ${subjectSummary}` : '',
          ].filter(Boolean),
        };
      case 'delete':
        return {
          title: 'Delete Topics',
          description: `This will permanently delete ${count} topic${count !== 1 ? 's' : ''} and all associated data.`,
          confirmLabel: 'Delete All',
          severity: 'danger' as const,
          typeToConfirm: count >= 10 ? 'DELETE' : undefined,
          details: [
            'This action cannot be undone.',
            'All study time, notes, and progress will be lost.',
            subjectSummary ? `Affected: ${subjectSummary}` : '',
          ].filter(Boolean),
        };
      default:
        return { title: '', description: '', confirmLabel: 'Confirm', severity: 'info' as const };
    }
  };

  return (
    <>
      <motion.div
        initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }}
        className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-2xl border-b border-border/20 px-4 py-3.5 space-y-2"
        style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.03), 0 8px 32px rgba(0,0,0,0.2)' }}
      >
        {/* Clipboard indicator */}
        {subjectSummary && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold">
              📋 {count}
            </span>
            <span className="truncate">{subjectSummary}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-bold text-foreground">{count} of {totalVisible}</span>
            <Button size="sm" variant="ghost" onClick={allSelected ? onDeselectAll : onSelectAll} className="text-xs gap-1 h-7 px-2 font-bold text-primary">
              <CheckSquare className="w-3 h-3" /> {allSelected ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            <Button size="sm" variant="outline" onClick={() => setPendingAction('complete')} className="text-sm gap-1.5 h-9 shrink-0 font-bold">
              <CheckCircle2 className="w-4 h-4" /> Done
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPendingAction('incomplete')} className="text-sm gap-1.5 h-9 shrink-0 font-bold">
              <XCircle className="w-4 h-4" /> Undo
            </Button>
            <Button size="sm" variant="outline" onClick={onToggleStar} className="text-sm gap-1.5 h-9 shrink-0 font-bold">
              <Star className="w-4 h-4" /> Star
            </Button>
            {onCopyTopics && (
              <Button size="sm" variant="outline" onClick={onCopyTopics} className="text-sm gap-1.5 h-9 shrink-0 font-bold text-secondary border-secondary/30">
                <Copy className="w-4 h-4" /> Copy
              </Button>
            )}
            {onCreateUnit && (
              <Button size="sm" variant="outline" onClick={onCreateUnit} className="text-sm gap-1.5 h-9 shrink-0 font-bold text-primary border-primary/30">
                <FolderPlus className="w-4 h-4" /> New Unit
              </Button>
            )}
            {onMoveTopics && (
              <Button size="sm" variant="outline" onClick={onMoveTopics} className="text-sm gap-1.5 h-9 shrink-0 font-bold text-accent-ink border-accent/30">
                <ArrowRightLeft className="w-4 h-4" /> Move
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={() => setPendingAction('delete')} className="text-sm gap-1.5 h-9 shrink-0 font-bold">
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} className="text-sm gap-1.5 h-9 shrink-0 font-bold">
              <X className="w-4 h-4" /> Cancel
            </Button>
          </div>
        </div>
      </motion.div>

      <ConfirmDialog
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={handleConfirm}
        itemCount={count}
        {...getDialogProps()}
      />
    </>
  );
}
