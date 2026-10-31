import { useMemo } from 'react';
import { Star } from 'lucide-react';
import type { Subject } from '../../types';
import CircularProgress from '../shared/CircularProgress';

interface Props { subjects: Subject[]; }

export default function SubjectCompletion({ subjects }: Props) {
  const items = useMemo(() =>
    subjects.map(s => {
      const all = s.units.flatMap(u => u.subTopics);
      const done = all.filter(t => t.completed).length;
      const imp = all.filter(t => t.important).length;
      const impDone = all.filter(t => t.important && t.completed).length;
      return { id: s.id, name: s.shortName, color: s.color, done, total: all.length, imp, impDone, pct: all.length > 0 ? Math.round((done / all.length) * 100) : 0 };
    }),
    [subjects]
  );

  return (
    <div className="glass-card p-4 relative overflow-hidden">
      <div className="absolute bottom-0 right-0 w-32 h-32 rounded-full bg-accent/5 blur-3xl -mr-10 -mb-10 pointer-events-none" />

      <div className="flex items-center justify-between mb-4 relative z-10">
        <h3 className="text-sm font-bold text-foreground">Subject-wise Completion</h3>
        <span className="text-[9px] px-2.5 py-1 rounded-full bg-primary/15 text-primary font-bold border border-primary/20">
          All {subjects.length} subjects
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 relative z-10">
        {items.map(s => (
          <div key={s.id} className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-card/40 transition-colors">
            <CircularProgress value={s.done} max={s.total} size={56} strokeWidth={5} color={s.color} />
            <span className="text-[10px] font-black" style={{ color: s.color }}>{s.name}</span>
            <span className="text-[8px] text-muted-foreground font-mono font-semibold">{s.done}/{s.total}</span>
            {s.imp > 0 && (
              <span className="flex items-center gap-0.5 text-[8px] font-bold">
                <Star className="w-2.5 h-2.5 fill-chart-4 text-chart-4" />
                <span className="text-chart-4">{s.impDone}/{s.imp}</span>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
