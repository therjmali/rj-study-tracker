import { useState, useEffect, useRef } from 'react';

export function useCountUp(target: number, duration: number = 800, delay: number = 0): number {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = prevTarget.current;
    const diff = target - start;
    if (diff === 0) return;

    let startTime: number | null = null;
    const timeout = setTimeout(() => {
      const animate = (ts: number) => {
        if (!startTime) startTime = ts;
        const elapsed = ts - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = start + diff * eased;
        setValue(Math.round(current));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          prevTarget.current = target;
        }
      };
      rafRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay]);

  return value;
}
