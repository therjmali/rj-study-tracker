import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  open: boolean;
  children: ReactNode;
  zIndex?: number;
}

/** Full-screen page (not a sheet): fills the viewport, respects safe areas, locks background scroll. */
export default function FullPageSheet({ open, children, zIndex = 95 }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = prev; };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="full-page"
          role="dialog" aria-modal="true"
          initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 28 }}
          transition={{ type: 'spring', damping: 34, stiffness: 420, mass: 0.7 }}
          className="fixed inset-0 bg-background flex flex-col"
          style={{ zIndex, paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex-1 min-h-0 flex flex-col w-full max-w-3xl mx-auto px-3 pt-3 pb-2">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
