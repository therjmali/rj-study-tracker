import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { useNotifications, type AppNotification } from '../../contexts/NotificationContext';
import { X } from 'lucide-react';

function SwipeNotification({ notification, onDismiss }: { notification: AppNotification; onDismiss: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [exitDir, setExitDir] = useState<'left' | 'right' | 'up' | null>(null);
  const scrollingRef = useRef(false);
  const startY = useRef(0);

  // Prevent accidental dismissal while scrolling the page
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    startY.current = e.clientY;
    scrollingRef.current = false;
  }, []);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback((_: unknown, info: PanInfo) => {
    setIsDragging(false);
    const { offset, velocity } = info;

    // Horizontal swipe
    if (Math.abs(offset.x) > 80 || Math.abs(velocity.x) > 400) {
      setExitDir(offset.x > 0 ? 'right' : 'left');
      setTimeout(onDismiss, 250);
      return;
    }
    // Upward swipe
    if (offset.y < -60 || velocity.y < -400) {
      setExitDir('up');
      setTimeout(onDismiss, 250);
      return;
    }
  }, [onDismiss]);

  const exitX = exitDir === 'left' ? -300 : exitDir === 'right' ? 300 : 0;
  const exitY = exitDir === 'up' ? -120 : (notification.position === 'bottom' ? 60 : -60);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: notification.position === 'bottom' ? 60 : -60, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
      exit={{
        opacity: 0,
        scale: 0.85,
        x: exitX,
        y: exitY,
        transition: { duration: 0.25, ease: 'easeOut' },
      }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.35}
      onPointerDown={handlePointerDown}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`relative flex items-center gap-3 pl-5 pr-2 py-3.5 rounded-2xl border border-primary/20 select-none touch-pan-y max-w-[92vw] w-auto ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      style={{
        background: 'hsl(var(--card) / 0.92)',
        boxShadow: '0 8px 32px hsl(var(--primary) / 0.12), 0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <motion.span
        className="text-2xl select-none shrink-0"
        animate={{ scale: [1, 1.2, 1], rotate: [0, 8, -8, 0] }}
        transition={{ duration: 0.6, repeat: 2 }}
      >
        {notification.emoji}
      </motion.span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground leading-tight">{notification.title}</p>
        {notification.subtitle && (
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{notification.subtitle}</p>
        )}
      </div>
      {notification.action && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={(e) => { e.stopPropagation(); notification.action!.onClick(); onDismiss(); }}
          className="shrink-0 text-[10px] font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-xl border border-primary/20 hover:bg-primary/20 transition-colors"
        >
          {notification.action.label}
        </motion.button>
      )}
      {/* Close button — min 44×44 dp touch target for accessibility */}
      <motion.button
        whileTap={{ scale: 0.7 }}
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="shrink-0 w-[44px] h-[44px] rounded-full flex items-center justify-center hover:bg-muted/40 active:bg-muted/60 transition-colors -mr-1"
        aria-label="Dismiss notification"
      >
        <div className="w-6 h-6 rounded-full bg-muted/30 flex items-center justify-center">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </motion.button>
    </motion.div>
  );
}

export default function NotificationContainer() {
  const { notifications, dismiss } = useNotifications();

  const topNotifs = notifications.filter(n => n.position !== 'bottom');
  const bottomNotifs = notifications.filter(n => n.position === 'bottom');

  return (
    <>
      {/* Top notifications — stacked queue */}
      <div className="fixed top-14 left-0 right-0 z-[95] flex flex-col items-center gap-2 pointer-events-none px-4">
        <AnimatePresence mode="sync">
          {topNotifs.map(n => (
            <div key={n.id} className="pointer-events-auto">
              <SwipeNotification notification={n} onDismiss={() => dismiss(n.id)} />
            </div>
          ))}
        </AnimatePresence>
      </div>
      {/* Bottom notifications — stacked queue */}
      <div className="fixed bottom-24 left-0 right-0 z-[95] flex flex-col items-center gap-2 pointer-events-none px-4">
        <AnimatePresence mode="sync">
          {bottomNotifs.map(n => (
            <div key={n.id} className="pointer-events-auto">
              <SwipeNotification notification={n} onDismiss={() => dismiss(n.id)} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
