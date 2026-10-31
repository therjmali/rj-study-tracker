import type { ExamConfig, Subject } from '../types';
import { useClock } from '../hooks/useClock';
import { getExamCountdown } from '../lib/examUtils';

export default function ExamPill({ exam, subjects }: { exam: ExamConfig; subjects: Subject[] }) {
  const now = useClock();
  const cd = getExamCountdown(exam, now);

  const linked = subjects.filter(s => exam.subjects.includes(s.id));
  const total = linked.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
  const done = linked.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const dd = String(cd.days).padStart(2, '0');
  const hh = String(cd.hours).padStart(2, '0');
  const mm = String(cd.minutes).padStart(2, '0');

  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border bg-card text-sm ${cd.isCritical ? 'border-destructive/50' : 'border-border'}`}>
      <span className="text-lg">{exam.emoji}</span>
      <div className="min-w-0">
        <p className="font-medium text-foreground text-xs truncate">{exam.label}</p>
        <p className={`text-xs font-mono ${cd.isCritical ? 'text-destructive' : 'text-muted-foreground'}`}>
          {cd.isPast ? '✅ Done' : `${dd}:${hh}:${mm}`}
        </p>
      </div>
      <div className="ml-auto text-right">
        <p className="text-xs text-muted-foreground">{pct}%</p>
        <div className="w-12 h-1 bg-muted rounded-full mt-1">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
