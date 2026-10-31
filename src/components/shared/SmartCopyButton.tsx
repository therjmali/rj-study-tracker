import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { getCleanName } from '../../lib/utils';

type CopyStep = 1 | 2;

interface Props {
  /** Text copied on first tap */
  textStep1: string;
  /** Text copied on second tap. If same as step1 or empty, second tap is disabled */
  textStep2?: string;
  /** Toast label for step 1 */
  label1?: string;
  /** Toast label for step 2 */
  label2?: string;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional class */
  className?: string;
}

export default function SmartCopyButton({
  textStep1,
  textStep2,
  label1 = 'Name copied',
  label2 = 'Full content copied',
  size = 'sm',
  className = '',
}: Props) {
  const [step, setStep] = useState<CopyStep>(1);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const hasStep2 = textStep2 && textStep2 !== textStep1;

  useEffect(() => {
    if (step === 2) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setStep(1), 4000);
    }
    return () => clearTimeout(timer.current);
  }, [step]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.vibrate?.(25);

    if (step === 1) {
      navigator.clipboard.writeText(getCleanName(textStep1));
      if (hasStep2) {
        toast(label1, { icon: '📋', description: 'Tap ② for full content', duration: 2500 });
        setStep(2);
      } else {
        toast(label1, { icon: '📋', duration: 1500 });
        // No step 2, pulse then reset
      }
    } else {
      navigator.clipboard.writeText(textStep2 || textStep1);
      toast(label2, { icon: '✨', duration: 2000 });
      setStep(1);
    }
  };

  const dim = size === 'md' ? 'w-8 h-8' : 'w-6 h-6';
  const iconSize = size === 'md' ? 'text-sm' : 'text-xs';

  return (
    <motion.button
      onClick={handleClick}
      whileTap={{ scale: 0.8 }}
      className={`${dim} rounded-lg flex items-center justify-center shrink-0 transition-all relative overflow-hidden ${className}`}
      style={{
        background: step === 1
          ? 'hsl(var(--muted) / 0.15)'
          : 'linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(var(--accent) / 0.15))',
        border: step === 1
          ? '1px solid hsl(var(--border) / 0.2)'
          : '1.5px solid hsl(var(--primary) / 0.4)',
        boxShadow: step === 2
          ? '0 0 12px hsl(var(--primary) / 0.2), inset 0 1px 0 rgba(255,255,255,0.08)'
          : 'none',
      }}
      title={step === 1 ? '① Copy name' : '② Copy full content'}
    >
      {/* Shimmer on step 2 */}
      <AnimatePresence>
        {step === 2 && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-y-0 w-1/2"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }}
              animate={{ x: ['-100%', '300%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.span
          key={step}
          initial={{ scale: 0.5, opacity: 0, rotate: -30 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.5, opacity: 0, rotate: 30 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
          className={`${iconSize} leading-none select-none relative z-10`}
        >
          {step === 1 ? '📋' : '📑'}
        </motion.span>
      </AnimatePresence>

      {/* Step indicator dot */}
      {hasStep2 && (
        <div className="absolute -bottom-0 left-1/2 -translate-x-1/2 flex gap-0.5">
          <div className={`w-1 h-0.5 rounded-full transition-all ${step === 1 ? 'bg-foreground/30' : 'bg-foreground/10'}`} />
          <div className={`w-1 h-0.5 rounded-full transition-all ${step === 2 ? 'bg-primary' : 'bg-foreground/10'}`} />
        </div>
      )}
    </motion.button>
  );
}
