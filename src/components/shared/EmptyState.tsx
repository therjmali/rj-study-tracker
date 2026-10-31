import { motion } from 'framer-motion';
import { Button } from '@project/components/ui/button';

interface Props {
  emoji: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export default function EmptyState({ emoji, title, description, actionLabel, onAction, secondaryLabel, onSecondary }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        className="text-6xl mb-4"
      >
        {emoji}
      </motion.div>
      <div className="w-16 h-1 rounded-full bg-gradient-to-r from-primary/30 via-accent/40 to-secondary/30 mb-4" />
      <h3 className="text-lg font-bold text-foreground mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{description}</p>
      <div className="flex items-center gap-2 mt-5">
        {actionLabel && onAction && (
          <Button onClick={onAction} className="gap-2 shadow-md shadow-primary/15">
            {actionLabel}
          </Button>
        )}
        {secondaryLabel && onSecondary && (
          <Button variant="outline" onClick={onSecondary}>{secondaryLabel}</Button>
        )}
      </div>
    </motion.div>
  );
}
