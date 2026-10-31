import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Stethoscope, Wheat, Sparkles, Volume2, VolumeX, HelpCircle } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { toast } from 'sonner';
import { THEMES, MODES } from '../../hooks/useTheme';
import type { UserSettings, SRSConfig, StudentMode } from '../../types';
import { DEFAULT_SRS_CONFIG } from '../../types';
import { GroupLabel, InfoNote, ResetButton, SliderField, ToggleRow } from './SettingsControls';

type Props = { settings: UserSettings; onUpdate: (s: UserSettings) => void };

/* ═════════════ Appearance ═════════════ */

const MODE_DESC: Record<string, string> = { light: 'Warm parchment', amoled: 'Deep ink', ancient: 'Dark sepia' };

export function DisplayModeSettings({ settings, onUpdate }: Props) {
  const current = settings.themeMode ?? 'light';
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {MODES.map(mode => {
        const active = current === mode.id;
        return (
          <button key={mode.id} onClick={() => onUpdate({ ...settings, themeMode: mode.id })} aria-pressed={active}
            className={`relative flex flex-col items-center gap-1.5 py-4 px-2 rounded-2xl border-2 transition-[transform,background-color,border-color,box-shadow] duration-150 active:scale-[0.97] ${
              active ? 'border-primary bg-primary/10 shadow-md shadow-primary/10' : 'border-border/25 bg-card/30 hover:bg-card/60 hover:border-border/50'
            }`}>
            <span className="text-2xl leading-none">{mode.emoji}</span>
            <span className={`text-xs font-bold ${active ? 'text-primary' : 'text-foreground'}`}>{mode.name}</span>
            <span className="text-[9px] text-muted-foreground">{MODE_DESC[mode.id]}</span>
            {active && (
              <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-md">
                <Check className="w-3.5 h-3.5 text-primary-foreground" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AccentColorSettings({ settings, onUpdate }: Props) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2.5">
      {THEMES.map(theme => {
        const active = settings.theme === theme.id;
        return (
          <button key={theme.id} onClick={() => onUpdate({ ...settings, theme: theme.id })} aria-pressed={active} title={theme.name}
            className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-[transform,background-color,border-color] duration-150 active:scale-95 ${
              active ? 'border-primary/60 bg-primary/8' : 'border-border/20 bg-card/25 hover:border-border/45'
            }`}>
            <span className="w-9 h-9 rounded-full flex items-center justify-center border-2"
              style={{ backgroundColor: theme.preview, borderColor: active ? 'hsl(var(--foreground))' : 'transparent', boxShadow: active ? `0 0 14px ${theme.preview}66` : 'none' }}>
              {active && <Check className="w-4 h-4 text-white" />}
            </span>
            <span className={`text-[10px] font-semibold truncate max-w-full ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{theme.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ═════════════ Study setup ═════════════ */

export function StudentModeSettings({ settings, onUpdate }: { settings: UserSettings; onUpdate: (s: UserSettings) => void }) {
  const current = settings.studentMode || 'nursing';
  const [editingExamLabel, setEditingExamLabel] = useState(false);
  const nursingLabel = settings.examLabelNursing || 'NORCET';
  const agriLabel = settings.examLabelAgriculture || 'AAO';

  const modes: { id: StudentMode; name: string; subtitle: string; desc: string; icon: React.ReactNode; emoji: string; examLabel: string }[] = [
    {
      id: 'nursing', name: 'Nursing Students', subtitle: 'NurseTrack Pro',
      desc: `${nursingLabel}, AIIMS, nursing competitive exam prep with clinical topics & anatomy`,
      icon: <Stethoscope className="w-6 h-6" />, emoji: '🏥', examLabel: nursingLabel,
    },
    {
      id: 'agriculture', name: 'Agriculture Students', subtitle: 'SP AGRO Pro',
      desc: `ICAR, JRF, SRF & agriculture competitive exam prep with crop science topics`,
      icon: <Wheat className="w-6 h-6" />, emoji: '🌾', examLabel: agriLabel,
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-muted-foreground">Choose your study mode. This customizes the app branding, landing page, and splash screen for your field.</p>
      <div className="grid gap-3">
        {modes.map(m => {
          const active = current === m.id;
          return (
            <button key={m.id} onClick={() => onUpdate({ ...settings, studentMode: m.id })}
              className={`relative flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                active
                  ? 'border-primary bg-primary/8 shadow-md shadow-primary/10'
                  : 'border-border/30 bg-card/40 hover:bg-card/60 hover:border-border/50'
              }`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                active ? 'bg-primary/15 text-primary' : 'bg-muted/20 text-muted-foreground'
              }`}>
                {m.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-foreground">{m.emoji} {m.name}</span>
                </div>
                <p className={`text-[11px] font-semibold ${active ? 'text-primary' : 'text-muted-foreground'}`}>{m.subtitle}</p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{m.desc}</p>
                {active && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-black border border-primary/20">
                      Exam: {m.examLabel}
                    </span>
                  </div>
                )}
              </div>
              {active && (
                <motion.div layoutId="studentModeCheck" className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-md"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
                  <Check className="w-3.5 h-3.5 text-primary-foreground" />
                </motion.div>
              )}
            </button>
          );
        })}
      </div>

      {/* Exam Label Customization */}
      <div className="rounded-xl bg-card/50 border border-border/20 p-3.5 space-y-3">
        <button onClick={() => setEditingExamLabel(p => !p)} className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-chart-4" />
            <span className="text-[11px] font-bold text-foreground">Customize Exam Labels</span>
          </div>
          <span className="text-[9px] text-muted-foreground font-semibold">{editingExamLabel ? 'Hide' : 'Edit'}</span>
        </button>
        <AnimatePresence>
          {editingExamLabel && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-2.5 pt-1">
                <p className="text-[9px] text-muted-foreground">Set custom exam names shown in topic details & relevance filters.</p>
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-3.5 h-3.5 text-primary shrink-0" />
                  <Input value={nursingLabel} onChange={e => onUpdate({ ...settings, examLabelNursing: e.target.value || 'NORCET' })}
                    className="h-7 text-[11px] font-bold flex-1" placeholder="e.g. NORCET" />
                </div>
                <div className="flex items-center gap-2">
                  <Wheat className="w-3.5 h-3.5 text-secondary shrink-0" />
                  <Input value={agriLabel} onChange={e => onUpdate({ ...settings, examLabelAgriculture: e.target.value || 'AAO' })}
                    className="h-7 text-[11px] font-bold flex-1" placeholder="e.g. AAO" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}


export function StudyGoalsSettings({ settings, onUpdate }: Props) {
  const goals = settings.studyGoals;
  const update = (patch: Partial<typeof goals>) => onUpdate({ ...settings, studyGoals: { ...goals, ...patch } });

  const groups: { title: string; icon: string; fields: { label: string; value: number; key: keyof typeof goals; min: number; max: number; step: number; unit: string }[] }[] = [
    { title: 'Daily', icon: '📅', fields: [
      { label: 'Study hours', value: goals.dailyHours, key: 'dailyHours', min: 1, max: 12, step: 0.5, unit: 'h' },
      { label: 'Topics to finish', value: goals.dailyTopics, key: 'dailyTopics', min: 1, max: 30, step: 1, unit: '' },
    ] },
    { title: 'Weekly', icon: '📆', fields: [
      { label: 'Study hours', value: goals.weeklyHours ?? 30, key: 'weeklyHours', min: 5, max: 80, step: 1, unit: 'h' },
      { label: 'Topics to finish', value: goals.weeklyTopics, key: 'weeklyTopics', min: 10, max: 200, step: 5, unit: '' },
    ] },
    { title: 'Monthly', icon: '🗓️', fields: [
      { label: 'Study hours', value: goals.monthlyHours ?? 120, key: 'monthlyHours', min: 20, max: 300, step: 5, unit: 'h' },
      { label: 'Topics to finish', value: goals.monthlyTopics, key: 'monthlyTopics', min: 30, max: 600, step: 10, unit: '' },
    ] },
  ];

  return (
    <div className="space-y-4">
      {groups.map(g => (
        <div key={g.title} className="rounded-2xl border border-border/15 bg-card/20 p-4 space-y-4">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5"><span>{g.icon}</span> {g.title} targets</p>
          {g.fields.map(f => (
            <SliderField key={f.key} label={f.label} value={f.value} min={f.min} max={f.max} step={f.step} unit={f.unit}
              onChange={v => update({ [f.key]: v } as Partial<typeof goals>)} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SRSSettings({ settings, onUpdate }: Props) {
  const config = settings.srsConfig || DEFAULT_SRS_CONFIG;
  const [drafts, setDrafts] = useState<Partial<Record<keyof SRSConfig, string>>>({});
  const commit = (diff: keyof SRSConfig, raw: string) => {
    const nums = raw.split(',').map(x => parseInt(x.trim())).filter(n => !isNaN(n) && n > 0);
    if (nums.length > 0) onUpdate({ ...settings, srsConfig: { ...config, [diff]: nums } });
    setDrafts(d => { const n = { ...d }; delete n[diff]; return n; });
  };
  const labels: Record<'easy' | 'medium' | 'hard', { emoji: string; hint: string }> = {
    easy: { emoji: '🟢', hint: 'Topics you find easy' },
    medium: { emoji: '🟡', hint: 'Topics of average difficulty' },
    hard: { emoji: '🔴', hint: 'Topics you find hard' },
  };
  return (
    <div className="space-y-4">
      <InfoNote emoji="🧠">Set how many <strong className="text-foreground">days</strong> pass between each revision, separated by commas. Harder topics usually need shorter gaps.</InfoNote>
      {(['easy', 'medium', 'hard'] as const).map(diff => (
        <div key={diff}>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-foreground">{labels[diff].emoji} <span className="capitalize">{diff}</span> <span className="text-[10px] font-normal text-muted-foreground">· {labels[diff].hint}</span></p>
            <span className="text-[10px] font-mono text-muted-foreground">{config[diff].length} rounds</span>
          </div>
          <Input value={drafts[diff] ?? config[diff].join(', ')}
            onChange={e => setDrafts(d => ({ ...d, [diff]: e.target.value }))}
            onBlur={e => commit(diff, e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="h-9 text-xs font-mono" placeholder="1, 3, 7, 14, 30" />
        </div>
      ))}
      <div className="flex justify-end">
        <ResetButton label="Reset intervals" onClick={() => { onUpdate({ ...settings, srsConfig: DEFAULT_SRS_CONFIG }); setDrafts({}); toast.success('Revision intervals reset'); }} />
      </div>
    </div>
  );
}

/* ═════════════ Focus ═════════════ */

export function PomodoroSettingsPanel({ settings, onUpdate }: Props) {
  const pomo = settings.pomodoroSettings;
  const update = (patch: Partial<typeof pomo>) => onUpdate({ ...settings, pomodoroSettings: { ...pomo, ...patch } });
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/15 bg-card/20 p-4 space-y-5">
        <SliderField label="Focus session" icon={<span>🎯</span>} value={pomo.focusMin} min={15} max={60} step={5} unit="min" onChange={v => update({ focusMin: v })} />
        <SliderField label="Short break" icon={<span>☕</span>} value={pomo.shortBreakMin} min={3} max={15} step={1} unit="min" onChange={v => update({ shortBreakMin: v })} />
        <SliderField label="Long break" icon={<span>🌿</span>} value={pomo.longBreakMin} min={10} max={30} step={5} unit="min" onChange={v => update({ longBreakMin: v })} />
      </div>
      <div className="space-y-2.5">
        <ToggleRow title="Auto-start breaks" description="Begin the break as soon as focus time ends" icon={<span className="text-base">⏭️</span>}
          checked={pomo.autoStartBreaks} onChange={v => update({ autoStartBreaks: v })} />
        <ToggleRow title="Sound notifications" description="Play a beep when a session ends"
          icon={pomo.soundEnabled ? <Volume2 className="w-4 h-4 text-primary" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
          checked={pomo.soundEnabled} onChange={v => update({ soundEnabled: v })} />
      </div>
    </div>
  );
}

/* ═════════════ Help ═════════════ */

export function HelpGuideSettings({ onOpenHelp }: { onOpenHelp: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">New here, or want a tour of every feature?</p>
      <Button onClick={onOpenHelp} variant="outline" className="w-full h-10 text-xs font-bold gap-2"><HelpCircle className="w-4 h-4" /> Open Help &amp; Onboarding Guide</Button>
    </div>
  );
}

export function KeyboardShortcutsSettings() {
  const shortcuts = [
    { keys: ['Ctrl', 'K'], action: 'Open global search' },
    { keys: ['Ctrl', 'Z'], action: 'Undo last action' },
    { keys: ['Ctrl', 'Y'], action: 'Redo last action' },
    { keys: ['Ctrl', 'Shift', 'Z'], action: 'Redo last action (alt)' },
    { keys: ['Esc'], action: 'Close dialogs / search' },
  ];

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground mb-3">Available keyboard shortcuts throughout the app.</p>
      {shortcuts.map((s, i) => (
        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-card/30 border border-border/10">
          <span className="text-xs text-foreground">{s.action}</span>
          <div className="flex items-center gap-1">
            {s.keys.map((k, j) => (
              <span key={j}>
                {j > 0 && <span className="text-[9px] text-muted-foreground mx-0.5">+</span>}
                <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/20 text-[10px] font-mono text-foreground">{k}</kbd>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

