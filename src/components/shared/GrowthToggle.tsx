import { useGrowthVisible } from '../../lib/growthVisibility';

/** ⚖️ button: shows / hides every growth-comparison card in the app (off by default, remembered). */
export default function GrowthToggle({ className = '' }: { className?: string }) {
  const { visible, toggle } = useGrowthVisible();
  return (
    <button type="button" onClick={e => { e.stopPropagation(); navigator.vibrate?.(8); toggle(); }}
      aria-pressed={visible} aria-label={visible ? 'Hide growth comparison' : 'Show growth comparison'}
      title={visible ? 'Hide growth comparison' : 'Show growth comparison'}
      className={`relative w-11 h-11 shrink-0 rounded-full border flex items-center justify-center text-[18px] leading-none transition-all active:scale-90 ${
        visible ? 'bg-primary/15 border-primary/40 shadow-sm' : 'bg-muted/20 border-border/20 opacity-80 hover:opacity-100'
      } ${className}`}>
      <span aria-hidden>⚖️</span>
      {visible && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-card" />}
    </button>
  );
}
