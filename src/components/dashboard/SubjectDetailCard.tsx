import { useMemo } from 'react';
import { readableInk } from '../../lib/utils';
import { Star } from 'lucide-react';
import type { Subject } from '../../types';

interface Props {
  subject: Subject;
  onStarClick?: () => void;
}

export default function SubjectDetailCard({ subject, onStarClick }: Props) {
  const { total, done, pct, impTotal, impDone } = useMemo(() => {
    let total = 0, done = 0, impTotal = 0, impDone = 0;
    subject.units.forEach(u => u.subTopics.forEach(t => {
      total++; if (t.completed) done++;
      if (t.important) { impTotal++; if (t.completed) impDone++; }
    }));
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0, impTotal, impDone };
  }, [subject]);

  const daysLeft = Math.max(0, Math.ceil((new Date(subject.examDate).getTime() - Date.now()) / 86400000));
  const urgent = daysLeft <= 15;

  return (
    <div className="glass-card space-y-3 relative overflow-hidden">
      {/* Subject Cover Image */}
      {subject.image ? (
        <div className="relative h-20 w-full overflow-hidden rounded-t-2xl">
          <img src={subject.image} alt={subject.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/30 to-transparent" />
        </div>
      ) : (
        <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${subject.color}, ${subject.color}88, transparent)` }} />
      )}

      <div className={`px-4 pb-4 space-y-3 ${subject.image ? 'pt-1' : 'pt-4'}`}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="w-3.5 h-3.5 rounded-full shrink-0 shadow-lg" style={{ backgroundColor: subject.color, boxShadow: `0 0 12px ${subject.color}40` }} />
        <span className="text-sm font-bold text-foreground flex-1 min-w-0 truncate">{subject.name}</span>
        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${urgent ? 'bg-destructive/15 text-destructive border-destructive/25 animate-pulse' : 'bg-muted/40 text-muted-foreground border-border/25'}`}>
          {daysLeft}d left
        </span>
      </div>

      {/* Unit squares — compact rows */}
      <div className="space-y-1.5">
        {subject.units.map(u => {
          const uDone = u.subTopics.filter(t => t.completed).length;
          const uInProcess = u.subTopics.filter(t => t.status === 'in_process').length;
          return (
            <div key={u.id} className="flex items-center gap-2">
              <span className="text-[8px] text-muted-foreground w-20 truncate" title={u.name}>
                {u.name}
              </span>
              <div className="flex gap-[3px] flex-wrap flex-1">
                {u.subTopics.map(t => (
                  <div key={t.id} className="w-3 h-3 rounded-[3px] transition-all duration-300"
                    title={`${t.name} — ${t.completed ? 'Complete' : t.status === 'in_process' ? 'In Process' : 'Incomplete'}`}
                    style={{
                      backgroundColor: t.completed
                        ? subject.color
                        : t.status === 'in_process'
                          ? `${subject.color}60`
                          : 'hsl(var(--muted) / 0.5)',
                      boxShadow: t.completed ? `0 0 4px ${subject.color}30` : 'none',
                    }} />
                ))}
              </div>
              <span className="text-[8px] text-muted-foreground font-mono shrink-0 font-semibold">{uDone}/{u.subTopics.length}</span>
            </div>
          );
        })}
      </div>

      {/* Progress bar with shortname */}
      <div className="flex items-center gap-2.5">
        <span className="text-xs font-black font-mono px-1.5 py-0.5 rounded" style={{ color: readableInk(subject.color), backgroundColor: `${subject.color}15` }}>
          {subject.shortName}
        </span>
        <div className="flex-1 h-2.5 rounded-full bg-muted/30 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: subject.color, boxShadow: `0 0 8px ${subject.color}40` }} />
        </div>
        <span className="text-[10px] font-mono text-muted-foreground font-semibold">{done}/{total} · {pct}%</span>
      </div>

      {/* Star count */}
      {impTotal > 0 && (
        <button onClick={onStarClick} className="flex items-center gap-1.5 text-[10px] hover:underline transition-colors group">
          <Star className="w-3.5 h-3.5 fill-chart-4 text-chart-4 group-hover:scale-110 transition-transform" />
          <span className="text-chart-4 font-semibold">{impDone}/{impTotal} important</span>
        </button>
      )}
      </div>
    </div>
  );
}
