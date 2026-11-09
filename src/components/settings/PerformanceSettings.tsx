import { Gauge, Sparkles, Zap } from 'lucide-react';
import { getPerfMode, setPerfMode, usePerf } from '@/platform/perf';
import type { PerfMode } from '@/platform/perfLogic.mjs';

const OPTIONS: { id: PerfMode; icon: React.ReactNode; title: string; text: string }[] = [
  { id: 'auto', icon: <Gauge className="h-5 w-5" />, title: 'Auto (recommended)', text: 'Full effects, but the app switches to Smooth by itself on a weak phone or if scrolling starts to stutter.' },
  { id: 'smooth', icon: <Zap className="h-5 w-5" />, title: 'Smooth', text: 'No blur, light shadows and no looping animations — the fastest and most battery-friendly. Great with thousands of topics.' },
  { id: 'full', icon: <Sparkles className="h-5 w-5" />, title: 'Full effects', text: 'Glass blur, soft shadows and every animation. Best on a powerful phone or tablet.' },
];

/** Settings → Appearance → Performance. */
export default function PerformanceSettings() {
  const perf = usePerf();
  const mode = getPerfMode();
  return (
    <div className="space-y-3">
      <div className={`rounded-[22px] border p-3.5 text-[12px] leading-snug ${perf.lite ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border/30 bg-card text-muted-foreground'}`}>
        <b className="text-foreground">{perf.lite ? 'Smooth mode is on' : 'Full effects are on'}</b>
        {perf.reason ? <> — {perf.reason}.</> : <> — your phone handles every effect.</>}
      </div>
      {OPTIONS.map(o => (
        <button
          key={o.id} type="button" onClick={() => setPerfMode(o.id)} aria-pressed={mode === o.id}
          className={`flex w-full items-start gap-3 rounded-[22px] border p-3.5 text-left transition-colors active:scale-[0.99] ${mode === o.id ? 'border-primary/50 bg-primary/10' : 'border-border/30 bg-card'}`}
        >
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${mode === o.id ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground'}`}>{o.icon}</span>
          <span className="min-w-0">
            <span className="block text-[13px] font-extrabold text-foreground">{o.title}</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">{o.text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
