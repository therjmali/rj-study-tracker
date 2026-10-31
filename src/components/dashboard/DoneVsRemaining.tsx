import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Subject } from '../../types';
import type { DifficultyFilter } from '../../lib/studySuggestion';

const TT = { contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 11, color: 'hsl(var(--foreground))' } };

interface Props { subjects: Subject[]; difficultyFilter?: DifficultyFilter; }

export default function DoneVsRemaining({ subjects, difficultyFilter = 'all' }: Props) {
  const data = useMemo(() =>
    subjects.map(s => {
      const all = s.units.flatMap(u => u.subTopics).filter(t => difficultyFilter === 'all' || t.difficulty === difficultyFilter);
      const done = all.filter(t => t.completed).length;
      return { name: s.shortName, Done: done, Remaining: all.length - done };
    }),
    [subjects, difficultyFilter]
  );

  return (
    <div className="glass-card p-4 relative overflow-hidden">
      <h3 className="text-sm font-bold text-foreground mb-3">✅ Done vs Remaining{difficultyFilter !== 'all' ? ` (${difficultyFilter})` : ''}</h3>
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-secondary/5 blur-2xl -mr-6 -mt-6 pointer-events-none" />
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barSize={20}>
          <XAxis dataKey="name" tick={{ fill: 'hsl(var(--foreground))', fontSize: 12, fontWeight: 600 }} />
          <YAxis tick={{ fill: 'hsl(var(--foreground))', fontSize: 11, fontWeight: 600 }} />
          <Tooltip {...TT} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--foreground))' }} />
          <Bar dataKey="Done" stackId="a" fill="hsl(var(--secondary))" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Remaining" stackId="a" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
