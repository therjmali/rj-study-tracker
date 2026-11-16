import { HOME_SECTIONS, PRESETS, setHiddenSections, toggleSection, useHiddenSections } from '../../lib/homeLayout';

/** Choose which Home sections to show — presets on top, one switch per section below. */
export default function HomeLayoutPanel() {
  const hidden = useHiddenSections();
  const active = PRESETS.find(p => p.hidden.length === hidden.length && p.hidden.every(h => hidden.includes(h)))?.id;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Home presets">
        {PRESETS.map(p => (
          <button key={p.id} type="button" role="radio" aria-checked={active === p.id} onClick={() => setHiddenSections(p.hidden)}
            className={`min-h-[56px] rounded-xl border px-3 py-2 text-left transition active:scale-[0.98] ${active === p.id ? 'bg-primary/12 border-primary/40' : 'bg-muted/15 border-border/20'}`}>
            <span className="block text-[12px] font-extrabold text-foreground">{p.label}</span>
            <span className="block text-[10px] text-muted-foreground leading-tight">{p.hint}</span>
          </button>
        ))}
      </div>
      <ul className="space-y-1.5">
        {HOME_SECTIONS.map(s => {
          const on = !hidden.includes(s.id);
          return (
            <li key={s.id}>
              <button type="button" role="switch" aria-checked={on} onClick={() => toggleSection(s.id)}
                className="w-full min-h-[52px] flex items-center gap-3 rounded-xl border border-border/15 bg-card/50 px-3 text-left active:scale-[0.99] transition">
                <span className="text-lg w-7 text-center shrink-0">{s.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-bold text-foreground">{s.label}</span>
                  <span className="block text-[10px] text-muted-foreground leading-tight truncate">{s.hint}</span>
                </span>
                <span className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${on ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                  <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] text-muted-foreground">Hidden sections are not loaded at all, so a lighter Home is also a faster one.</p>
    </div>
  );
}
