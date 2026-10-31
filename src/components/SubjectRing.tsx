import type { Subject } from '../types';

export default function SubjectRing({ subject }: { subject: Subject }) {
  const all = subject.units.flatMap(u => u.subTopics);
  const done = all.filter(t => t.completed).length;
  const pct = all.length > 0 ? Math.round((done / all.length) * 100) : 0;
  const circumference = 2 * Math.PI * 15.9;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2 p-3">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--muted))" strokeWidth="2.5" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={subject.color} strokeWidth="2.5"
            strokeDasharray={`${circumference}`} strokeDashoffset={offset}
            strokeLinecap="round" className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-foreground font-mono">{pct}%</span>
        </div>
      </div>
      <span className="text-xs font-medium text-muted-foreground">{subject.shortName}</span>
      <span className="text-[10px] text-muted-foreground">{done}/{all.length}</span>
    </div>
  );
}
