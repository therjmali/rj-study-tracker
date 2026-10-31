import { motion } from 'framer-motion';
import { cn } from '@project/components/lib/utils';

interface Props {
  children: React.ReactNode;
  className?: string;
  glow?: 'cyan' | 'green' | 'amber' | 'red' | 'purple' | 'none';
  paper?: boolean;
  tint?: 'primary' | 'accent' | 'none';
  animate?: boolean;
}

const GLOW_MAP: Record<string, string> = {
  cyan: 'shadow-md shadow-accent/12',
  green: 'shadow-md shadow-secondary/12',
  amber: 'shadow-md shadow-chart-4/12',
  red: 'shadow-md shadow-destructive/12',
  purple: 'shadow-md shadow-accent/12',
  none: '',
};

const TINT_MAP: Record<string, string> = {
  primary: 'glass-tint-primary',
  accent: 'glass-tint-accent',
  none: '',
};

export default function GlowCard({ children, className, glow = 'none', paper = false, tint = 'none', animate = false }: Props) {
  const Component = animate ? motion.div : 'div';
  const animateProps = animate ? {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  } : {};

  return (
    <Component
      {...animateProps}
      className={cn(
        'glass-card glass-hover relative overflow-hidden',
        paper && 'paper-texture',
        GLOW_MAP[glow],
        TINT_MAP[tint],
        className
      )}
    >
      {children}
    </Component>
  );
}
