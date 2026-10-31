import { FolderOpen, Check, Clock, Calendar, Star } from 'lucide-react';
import { toast } from 'sonner';
import type { UserSettings } from '../../types';
import { GroupLabel, InfoNote, ResetButton, Segmented, SliderField } from './SettingsControls';

/**
 * ONE place for everything about how syllabus text looks:
 *   quick size presets  →  fine-tune per level  →  layout density  →  live preview.
 * (Replaces the old "Text Sizes" + "Universal Text Sizes" pair, which fought each other.)
 */

export type Density = 'compact' | 'comfortable' | 'spacious';
type Level = 'unit' | 'module' | 'topic';
type Sizes = Record<Level, number>;

export const TEXT_DEFAULTS: Sizes = { unit: 24, module: 14, topic: 16 };

const PRESETS: { id: 'small' | 'normal' | 'large' | 'xlarge'; label: string; hint: string; sizes: Sizes }[] = [
  { id: 'small', label: 'Small', hint: 'More on screen', sizes: { unit: 18, module: 11, topic: 13 } },
  { id: 'normal', label: 'Normal', hint: 'Default', sizes: TEXT_DEFAULTS },
  { id: 'large', label: 'Large', hint: 'Easier to read', sizes: { unit: 28, module: 17, topic: 19 } },
  { id: 'xlarge', label: 'XL', hint: 'Maximum', sizes: { unit: 32, module: 20, topic: 22 } },
];

const RANGES: Record<Level, { min: number; max: number; label: string; icon: string; hint: string }> = {
  unit: { min: 12, max: 48, label: 'Unit title', icon: '📦', hint: 'Big headings at the top of each unit' },
  module: { min: 8, max: 32, label: 'Module / folder', icon: '📂', hint: 'Section headers inside a unit' },
  topic: { min: 8, max: 32, label: 'Topic name', icon: '📝', hint: 'Every individual topic line' },
};

const DENSITIES: { id: Density; label: string; hint: string; bars: number }[] = [
  { id: 'compact', label: 'Compact', hint: 'Tight, fits more', bars: 4 },
  { id: 'comfortable', label: 'Comfortable', hint: 'Balanced', bars: 3 },
  { id: 'spacious', label: 'Spacious', hint: 'Airy, easy taps', bars: 2 },
];

function readSizes(s: UserSettings['textSizes']): Sizes {
  return { unit: s?.unit ?? TEXT_DEFAULTS.unit, module: s?.module ?? TEXT_DEFAULTS.module, topic: s?.topic ?? TEXT_DEFAULTS.topic };
}

function DensityGlyph({ bars, active }: { bars: number; active: boolean }) {
  return (
    <span className="flex flex-col items-center justify-center h-6 gap-[3px]" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} className={`block h-[3px] w-7 rounded-full ${active ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
      ))}
    </span>
  );
}

export default function TextLayoutSettings({ settings, onUpdate }: { settings: UserSettings; onUpdate: (s: UserSettings) => void }) {
  const sizes = readSizes(settings.textSizes);
  const density: Density = settings.density || 'comfortable';

  const activePreset = PRESETS.find(p => p.sizes.unit === sizes.unit && p.sizes.module === sizes.module && p.sizes.topic === sizes.topic)?.id ?? null;
  const isDefault = sizes.unit === TEXT_DEFAULTS.unit && sizes.module === TEXT_DEFAULTS.module && sizes.topic === TEXT_DEFAULTS.topic && density === 'comfortable';

  const setSizes = (next: Sizes) => onUpdate({ ...settings, textSizes: next, universalFontSizes: undefined });
  const gap = density === 'compact' ? 'gap-1.5' : density === 'spacious' ? 'gap-4' : 'gap-3';
  const pad = density === 'compact' ? 'py-2' : density === 'spacious' ? 'py-4' : 'py-3';

  return (
    <div className="space-y-5">
      <InfoNote emoji="♾️">
        These sizes apply to <strong className="text-foreground">all subjects</strong>. To give one subject its own sizes, use <strong className="text-foreground">Edit Subject → Text Sizes</strong> — a subject's own setting always wins.
      </InfoNote>

      <div>
        <GroupLabel>Quick presets</GroupLabel>
        <Segmented
          options={PRESETS.map(p => ({ id: p.id, label: p.label, hint: p.hint }))}
          value={activePreset}
          onChange={id => setSizes(PRESETS.find(p => p.id === id)!.sizes)}
          columns={4}
        />
        {!activePreset && <p className="text-[10px] text-primary font-semibold mt-2">✏️ Custom sizes in use — fine-tuned below</p>}
      </div>

      <div>
        <GroupLabel>Fine-tune</GroupLabel>
        <div className="space-y-5 rounded-2xl border border-border/15 bg-card/20 p-4">
          {(['unit', 'module', 'topic'] as const).map(level => {
            const r = RANGES[level];
            return (
              <SliderField key={level} label={r.label} hint={r.hint} icon={<span>{r.icon}</span>}
                value={sizes[level]} min={r.min} max={r.max} unit="px"
                onChange={v => setSizes({ ...sizes, [level]: v })} />
            );
          })}
        </div>
      </div>

      <div>
        <GroupLabel>Layout density</GroupLabel>
        <Segmented
          options={DENSITIES.map(d => ({ id: d.id, label: d.label, hint: d.hint, glyph: <DensityGlyph bars={d.bars} active={density === d.id} /> }))}
          value={density}
          onChange={d => onUpdate({ ...settings, density: d })}
        />
      </div>

      <div>
        <GroupLabel>Live preview</GroupLabel>
        <div className={`rounded-2xl border border-border/20 bg-card/30 p-3.5 flex flex-col ${gap}`}>
          <div className={`rounded-[18px] border border-border/30 bg-card/50 px-4 ${pad}`}>
            <div className="flex items-center gap-2.5">
              <span className="text-[22px] font-black font-mono text-primary leading-none">1</span>
              <h3 style={{ fontSize: `${sizes.unit}px`, fontWeight: 700, letterSpacing: '-0.3px', lineHeight: 1.2 }} className="text-foreground">Sample Unit Title</h3>
            </div>
            <div className="flex items-center gap-3 mt-2 text-[12px] text-muted-foreground font-semibold">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3 opacity-50" /> 2h 30m</span>
              <span>✅ 8/12</span>
              <span className="ml-auto font-mono font-bold">67%</span>
            </div>
            <div className="mt-2 h-[4px] rounded-full bg-border/30 overflow-hidden"><div className="h-full rounded-full bg-primary/60 w-[67%]" /></div>
          </div>

          <div className="ml-3 pl-3 border-l-2 border-primary/15 flex items-center gap-2">
            <FolderOpen className="w-3.5 h-3.5 text-primary/70 shrink-0" />
            <span style={{ fontSize: `${sizes.module}px`, fontWeight: 700, letterSpacing: '0.2px' }} className="text-primary/80 uppercase">Sample Module</span>
            <span className="text-[11px] font-mono text-muted-foreground ml-auto">4/6</span>
          </div>

          <div className={`rounded-[18px] border border-border/30 bg-card/50 px-4 ${pad}`}>
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center mt-0.5 shrink-0"><Check className="w-3.5 h-3.5 text-white" strokeWidth={3} /></div>
              <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-md bg-muted/50 text-muted-foreground font-mono text-[10px] font-bold mt-0.5 shrink-0">1.1</span>
              <h3 style={{ fontSize: `${sizes.topic}px`, fontWeight: 600, lineHeight: 1.4, letterSpacing: '-0.15px' }} className="text-foreground flex-1">Sample Topic Name</h3>
              <span className="text-sm mt-0.5">🟢</span>
            </div>
            <div className="flex items-center mt-2 gap-3 text-[12px] text-muted-foreground font-medium">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3 opacity-50" /> 45m</span>
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3 opacity-50" /> 07/08/26</span>
              <span className="text-secondary font-semibold">✓ COMPLETED</span>
              <Star className="w-4 h-4 fill-current text-chart-4 ml-auto" />
            </div>
          </div>
        </div>
      </div>

      {!isDefault && (
        <div className="flex justify-end">
          <ResetButton label="Reset text & layout" onClick={() => {
            onUpdate({ ...settings, textSizes: { ...TEXT_DEFAULTS }, density: 'comfortable', universalFontSizes: undefined });
            toast.success('Text sizes and layout reset');
          }} />
        </div>
      )}
    </div>
  );
}
