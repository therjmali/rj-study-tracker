import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { Subject } from '../../types';

const TT = { contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 11, color: 'hsl(var(--foreground))' } };

interface Props { subjects: Subject[]; }

export default function TopicDistribution({ subjects }: Props) {
  const data = useMemo(() =>
    subjects.map(s => {
      const total = s.units.reduce((a, u) => a + u.subTopics.length, 0);
      return { name: s.shortName, value: total, color: s.color };
    }).filter(d => d.value > 0),
    [subjects]
  );

  const grandTotal = data.reduce((a, d) => a + d.value, 0);

  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-bold text-foreground mb-3">📊 Topic Distribution</h3>
      <div className="flex items-center gap-4">
        <div className="w-[130px] h-[130px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={2} strokeWidth={0}>
                {data.map(d => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip {...TT} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1.5 min-w-0">
          {data.map(d => (
            <div key={d.name} className="flex items-center gap-2 text-[10px]">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-foreground truncate flex-1">{d.name}</span>
              <span className="font-mono text-muted-foreground">{d.value}</span>
              <span className="font-mono text-muted-foreground w-8 text-right">{grandTotal > 0 ? Math.round((d.value / grandTotal) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
