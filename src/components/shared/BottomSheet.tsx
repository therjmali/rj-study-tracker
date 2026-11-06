import { useEffect, useRef, useCallback, useId } from 'react';
import { motion, AnimatePresence, useMotionValue, PanInfo } from 'framer-motion';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  zIndex?: number;
}

const CLOSE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 500;

// ── Set-based body scroll lock ──
const openSheets = new Set<string>();

function lockBodyScroll(id: string) {
  openSheets.add(id);
  if (openSheets.size === 1) {
    document.documentElement.style.overflow = 'hidden';
  }
}

function unlockBodyScroll(id: string) {
  openSheets.delete(id);
  if (openSheets.size === 0) {
    document.documentElement.style.overflow = '';
  }
}

/** Safety: force-reset if no sheets open or on tab/route changes */
export function forceResetScrollLock() {
  openSheets.clear();
  if (typeof document !== 'undefined') {
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.overflow = '';
  }
}

export default function BottomSheet({ open, onClose, title, children, zIndex = 80 }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const instanceId = useId();
  const isLocked = useRef(false);

  useEffect(() => {
    if (open && !isLocked.current) {
      isLocked.current = true;
      lockBodyScroll(instanceId);
    }
    if (!open && isLocked.current) {
      isLocked.current = false;
      unlockBodyScroll(instanceId);
    }
    return () => {
      if (isLocked.current) {
        isLocked.current = false;
        unlockBodyScroll(instanceId);
      }
    };
  }, [open, instanceId]);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    if (info.offset.y > CLOSE_THRESHOLD || info.velocity.y > VELOCITY_THRESHOLD) {
      onClose();
    }
  }, [onClose]);

  const content = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 bg-black/50"
            style={{ zIndex }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 400, mass: 0.7 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            style={{ y, zIndex: zIndex + 1 }}
            className="fixed bottom-0 left-0 right-0 rounded-t-3xl material-thick border-t border-border/10 max-h-[88vh] flex flex-col"
          >
            <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing shrink-0 touch-none">
              <div className="w-9 h-[4px] rounded-full bg-muted-foreground/25" />
            </div>
            {title && (
              <h3 className="text-base font-bold text-foreground px-5 pb-3 tracking-tight shrink-0">{title}</h3>
            )}
            <div
              className="px-5 pb-8 overflow-y-auto overscroll-contain [&_[data-radix-popper-content-wrapper]]:!z-[200]"
              style={{ WebkitOverflowScrolling: 'touch' }}
              onPointerDownCapture={(e) => {
                const el = e.currentTarget;
                if (el.scrollHeight > el.clientHeight) {
                  e.stopPropagation();
                }
              }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
