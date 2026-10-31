import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, Circle, SkipForward } from 'lucide-react';
import type { TopicStatus } from '../../types';

interface Props {
  status?: TopicStatus;
  completed?: boolean;
  /** 'dot' = tiny dot only, 'sm' = small pill, 'md' = medium pill */
  size?: 'dot' | 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const CONFIG: Record<string, {
  label: string;
  emoji: string;
  dotClass: string;
  pillBg: string;
  pillText: string;
  glowClass: string;
  Icon: typeof CheckCircle2;
}> = {
  complete: {
    label: 'Done',
    emoji: '✅',
    dotClass: 'bg-secondary',
    pillBg: 'bg-secondary/12 border-secondary/25',
    pillText: 'text-secondary',
    glowClass: 'shadow-[0_0_8px_hsl(var(--secondary)/0.35)]',
    Icon: CheckCircle2,
  },
  in_process: {
    label: 'Active',
    emoji: '🔄',
    dotClass: 'bg-chart-4',
    pillBg: 'bg-chart-4/12 border-chart-4/25',
    pillText: 'text-chart-4',
    glowClass: 'shadow-[0_0_8px_hsl(var(--chart-4)/0.3)]',
    Icon: Loader2,
  },
  incomplete: {
    label: 'Pending',
    emoji: '',
    dotClass: 'bg-muted-foreground/30',
    pillBg: 'bg-muted/30 border-border/20',
    pillText: 'text-muted-foreground',
    glowClass: '',
    Icon: Circle,
  },
  skipped: {
    label: 'Skipped',
    emoji: '⏭',
    dotClass: 'bg-destructive/60',
    pillBg: 'bg-destructive/10 border-destructive/20',
    pillText: 'text-destructive',
    glowClass: '',
    Icon: SkipForward,
  },
};

/**
 * Ultra-premium topic status indicator — dot, small pill, or medium pill.
 */
export default function TopicStatusBadge({ status, completed, size = 'sm', showLabel = true, className = '' }: Props) {
  const effectiveStatus: string = status || (completed ? 'complete' : 'incomplete');
  const cfg = CONFIG[effectiveStatus] || CONFIG.incomplete;

  // Dot-only mode — tiny status indicator
  if (size === 'dot') {
    return (
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass} ${cfg.glowClass} ${className}`}
        title={cfg.label}
      />
    );
  }

  const iconSize = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';
  const textSize = size === 'md' ? 'text-[9px]' : 'text-[8px]';
  const px = size === 'md' ? 'px-2 py-1' : 'px-1.5 py-0.5';

  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
      className={`inline-flex items-center gap-1 ${px} rounded-full border ${cfg.pillBg} ${cfg.glowClass} ${className}`}
    >
      {effectiveStatus === 'complete' && (
        <span className="relative">
          <cfg.Icon className={`${iconSize} ${cfg.pillText}`} />
          <span className="absolute -top-0.5 -right-0.5 w-1 h-1 rounded-full bg-secondary animate-dot-blip" />
        </span>
      )}
      {effectiveStatus === 'in_process' && (
        <span className="inline-flex animate-spin-slow">
          <cfg.Icon className={`${iconSize} ${cfg.pillText}`} />
        </span>
      )}
      {effectiveStatus === 'incomplete' && (
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
      )}
      {effectiveStatus === 'skipped' && (
        <cfg.Icon className={`${iconSize} ${cfg.pillText}`} />
      )}
      {showLabel && (
        <span className={`${textSize} font-bold ${cfg.pillText} uppercase tracking-wider leading-none`}>
          {cfg.label}
        </span>
      )}
    </motion.span>
  );
}
