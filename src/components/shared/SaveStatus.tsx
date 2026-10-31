import { motion, AnimatePresence } from 'framer-motion';
import { CheckCheck, Loader2, AlertTriangle } from 'lucide-react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  status: SaveState;
  className?: string;
}

export default function SaveStatus({ status, className = '' }: Props) {
  return (
    <AnimatePresence mode="wait">
      {status === 'saving' && (
        <motion.span
          key="saving"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className={`inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground shrink-0 ${className}`}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Saving…</span>
        </motion.span>
      )}
      {status === 'saved' && (
        <motion.span
          key="saved"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className={`inline-flex items-center gap-1 text-[10px] font-bold text-secondary shrink-0 ${className}`}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>Saved</span>
        </motion.span>
      )}
      {status === 'error' && (
        <motion.span
          key="error"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className={`inline-flex items-center gap-1 text-[10px] font-bold text-destructive shrink-0 ${className}`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Save failed</span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}
