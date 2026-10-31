import { useRef, useEffect, useState } from 'react';

/**
 * High-performance CSS-only collapse/expand.
 * Uses `grid-template-rows: 0fr → 1fr` for GPU-accelerated animation
 * instead of framer-motion's `height: 'auto'` which causes layout thrashing.
 */
interface CollapseProps {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  /** Duration in ms, default 200 */
  duration?: number;
}

export default function Collapse({ open, children, className = '', duration = 200 }: CollapseProps) {
  // Track whether the component has ever been open to avoid initial mount animation
  const [hasRendered, setHasRendered] = useState(open);

  useEffect(() => {
    if (open) setHasRendered(true);
  }, [open]);

  // Don't render children at all until first open (saves DOM nodes for collapsed units)
  if (!hasRendered) return null;

  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        transition: `grid-template-rows ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${duration * 0.6}ms ease`,
      }}
    >
      <div style={{ overflow: 'hidden', minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}
