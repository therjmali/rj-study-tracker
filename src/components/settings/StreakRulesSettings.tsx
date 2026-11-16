import { useStreakRules, setStreakRules } from '../../lib/streakRules';

const DAYS = [
  { d: 1, label: 'Mon' }, { d: 2, label: 'Tue' }, { d: 3, label: 'Wed' }, { d: 4, label: 'Thu' },
  { d: 5, label: 'Fri' }, { d: 6, label: 'Sat' }, { d: 0, label: 'Sun' },
];
const MINUTES = [1, 10, 20, 30, 60];

/** Streak safety: a minimum length for a counted day, and weekdays that never break the streak. */
export default function StreakRulesSettings() {
  const rules = useStreakRules();
  const toggleDay = (d: number) => {
    const has = rules.restDays.includes(d);
    // keep at least one counted weekday so the streak can still grow
    if (!has && rules.restDays.length >= 6) return;
    setStreakRules({ restDays: has ? rules.restDays.filter(x => x !== d) : [...rules.restDays, d] });
  };
  return (
    <div className="space-y-4 pt-1">
      <div>
        <p className="text-[11px] font-bold text-foreground">A day counts when you study at least</p>
        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Minimum minutes for a streak day">
          {MINUTES.map(m => (
            <button key={m} type="button" role="radio" aria-checked={rules.minMinutes === m} onClick={() => setStreakRules({ minMinutes: m })}
              className={`min-h-[40px] px-3.5 rounded-full border text-[12px] font-bold transition active:scale-95 ${rules.minMinutes === m ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-muted/15 border-border/20 text-muted-foreground'}`}>
              {m === 1 ? 'Any study' : `${m} min`}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">Short, focused days still keep the flame alive — pick the bar that suits you.</p>
      </div>
      <div>
        <p className="text-[11px] font-bold text-foreground">Rest days <span className="font-medium text-muted-foreground">(never break your streak)</span></p>
        <div className="mt-2 grid grid-cols-7 gap-1.5" role="group" aria-label="Rest days">
          {DAYS.map(({ d, label }) => {
            const on = rules.restDays.includes(d);
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => toggleDay(d)}
                className={`min-h-[44px] rounded-xl border text-[11px] font-bold transition active:scale-95 ${on ? 'bg-secondary/15 border-secondary/40 text-secondary' : 'bg-muted/15 border-border/20 text-muted-foreground'}`}>
                {label}
                <span className="block text-[8px] font-semibold opacity-70">{on ? 'rest' : 'study'}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">A rest day neither adds to the streak nor breaks it. The deadline planner skips rest days too.</p>
      </div>
    </div>
  );
}
