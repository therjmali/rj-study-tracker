import { useRef, useState, useEffect, useCallback } from 'react';

export type SortMode = 'custom' | 'name' | 'newest' | 'oldest' | 'high' | 'low';

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'high', label: '↕ High %' },
  { id: 'low', label: '↕ Low %' },
  { id: 'custom', label: '⋮⋮ Custom' },
];

interface Props {
  active: SortMode;
  onChange: (s: SortMode) => void;
  itemCount?: number;
}

export default function SortBar({ active, onChange, itemCount }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, [checkScroll]);

  return (
    <div className="flex items-center gap-2 min-w-0 overflow-hidden">
      {itemCount !== undefined && (
        <span className="text-[10px] text-muted-foreground font-semibold shrink-0">{itemCount} items</span>
      )}
      <div className="relative flex-1 min-w-0">
        {/* Left fade */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-background/80 to-transparent z-10 pointer-events-none rounded-l-full" />
        )}
        {/* Right fade */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background/80 to-transparent z-10 pointer-events-none rounded-r-full" />
        )}
        <div
          ref={scrollRef}
          className="flex gap-1.5 overflow-x-auto scrollbar-hide py-0.5 px-0.5"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {SORTS.map(s => {
            const isActive = active === s.id;
            return (
              <button key={s.id} onClick={() => onChange(s.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border shrink-0 active:scale-95 ${
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20'
                    : 'bg-card/30 text-muted-foreground border-border/20 hover:bg-card/50 hover:text-foreground'
                }`}>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
