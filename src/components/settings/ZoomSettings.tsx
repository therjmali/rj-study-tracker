import { useEffect, useState } from 'react';
import { Minus, Plus, ZoomIn } from 'lucide-react';
import { toast } from 'sonner';
import { Slider } from '@project/components/ui/slider';
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_PRESETS, ZOOM_STEP, clampZoom, setZoom, useZoom } from '../../platform/zoom';
import { InfoNote, ResetButton, Segmented } from './SettingsControls';

/** A miniature of the real screens, drawn at the zoom level being previewed. */
function Preview({ percent, applied }: { percent: number; applied: number }) {
  // The preview sits inside the already-zoomed page, so it only needs the *relative* factor.
  const rel = percent / applied;
  return (
    <div className="rounded-2xl border border-border/25 bg-background overflow-hidden" aria-label={`Preview at ${percent}%`}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/15 bg-card/40">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">Preview</span>
        <span className="text-[11px] font-black font-mono text-primary">{percent}%</span>
      </div>
      <div className="h-[210px] overflow-hidden relative">
        <div className="origin-top-left p-3 space-y-2.5" style={{ zoom: rel, width: `${100 / rel}%` }}>
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm">🩺</span>
            <span className="text-sm font-black text-foreground">NurseTrack</span>
            <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">Lv.7</span>
          </div>
          <div className="rounded-xl border border-border/20 bg-card/50 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-foreground">Today’s progress</span>
              <span className="text-[11px] font-mono font-bold text-muted-foreground">3 / 5</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/40 mt-1.5 overflow-hidden"><div className="h-full w-3/5 rounded-full bg-primary" /></div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 px-2.5 py-2">
            <span className="w-4 h-4 rounded border-2 border-primary bg-primary/15" />
            <span className="text-[12px] font-semibold text-foreground">Hand hygiene — #224</span>
          </div>
          <button type="button" tabIndex={-1} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-[12px] font-bold">Start studying</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Zoom — scale the whole app in or out. Move the slider to preview a level without touching the real
 * screen (so the slider never jumps under your finger), then tap Apply. Apply can be undone for a few
 * seconds in case the new size does not suit this screen.
 */
export default function ZoomSettings() {
  const applied = useZoom();
  const [draft, setDraft] = useState(applied);
  useEffect(() => { setDraft(applied); }, [applied]);

  const dirty = draft !== applied;
  const step = (d: number) => setDraft(v => clampZoom(v + d * ZOOM_STEP));

  const apply = (value = draft) => {
    const previous = applied;
    const next = setZoom(value);
    if (next === previous) return;
    toast.success(`Zoom set to ${next}%`, {
      duration: 8000,
      action: { label: 'Undo', onClick: () => { setZoom(previous); } },
    });
  };

  const presetValue = ZOOM_PRESETS.some(p => p.value === draft) ? String(draft) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/15 bg-card/20 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
          <div className="flex items-center gap-2 min-w-0 flex-1 basis-40">
            <span className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0"><ZoomIn className="w-4 h-4 text-primary" /></span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Zoom level</p>
              <p className="text-[10px] text-muted-foreground">Currently {applied}%{dirty ? ` · previewing ${draft}%` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 mx-auto">
            <button type="button" onClick={() => step(-1)} disabled={draft <= ZOOM_MIN} aria-label="Zoom out"
              className="w-9 h-9 rounded-xl border border-border/25 bg-card/40 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"><Minus className="w-4 h-4" /></button>
            <span className="w-14 text-center text-base font-black font-mono text-primary tabular-nums">{draft}%</span>
            <button type="button" onClick={() => step(1)} disabled={draft >= ZOOM_MAX} aria-label="Zoom in"
              className="w-9 h-9 rounded-xl border border-border/25 bg-card/40 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"><Plus className="w-4 h-4" /></button>
          </div>
        </div>

        <Slider value={[draft]} min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} onValueChange={v => setDraft(clampZoom(v[0]))} aria-label="Zoom level" />
        <div className="flex justify-between text-[10px] font-semibold text-muted-foreground/70 -mt-2"><span>{ZOOM_MIN}% · fits more</span><span>{ZOOM_MAX}% · bigger</span></div>

        <Segmented<string> columns={5} value={presetValue} onChange={v => setDraft(Number(v))}
          options={ZOOM_PRESETS.map(p => ({ id: String(p.value), label: `${p.value}%` }))} />
        <p className="text-[10px] text-center text-muted-foreground -mt-1">{ZOOM_PRESETS.map(p => `${p.value}% ${p.label}`).join(' · ')}</p>
      </div>

      <Preview percent={draft} applied={applied} />

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button type="button" onClick={() => apply()} disabled={!dirty}
          className="h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold active:scale-[0.99] transition-[transform,opacity] disabled:opacity-40">
          {dirty ? `Apply ${draft}%` : 'Applied'}
        </button>
        <ResetButton label="Reset to 100%" onClick={() => { setDraft(ZOOM_DEFAULT); if (applied !== ZOOM_DEFAULT) apply(ZOOM_DEFAULT); }} />
      </div>

      <InfoNote emoji="🔍">
        Zoom scales the whole app — text, buttons, dialogs and previews. It is saved on <strong>this device only</strong>, so your phone and tablet can each use the size that suits them.
      </InfoNote>
    </div>
  );
}
