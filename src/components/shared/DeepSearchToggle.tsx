import { motion } from 'framer-motion';

interface Props {
  enabled: boolean;
  onToggle: () => void;
}

export default function DeepSearchToggle({ enabled, onToggle }: Props) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle(); }}
      className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold border transition-all active:scale-95 whitespace-nowrap ${
        enabled
          ? 'bg-primary/15 border-primary/30 text-primary shadow-sm'
          : 'bg-muted/30 border-border/20 text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50'
      }`}
      title={enabled ? 'Deep search ON — searching notes, resources, files' : 'Deep search OFF — only names'}
    >
      <motion.span
        animate={{ scale: enabled ? [1, 1.2, 1] : 1 }}
        transition={{ duration: 0.3 }}
        className="text-[10px]"
      >
        {enabled ? '🔬' : '🔍'}
      </motion.span>
      Deep
    </button>
  );
}
