import { useState, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { Input } from '@project/components/ui/input';
import type { Subject } from '../../types';
import { matchesFields } from '../../lib/searchUtils';

interface Props {
  currentSubject: Subject;
  allSubjects: Subject[];
  onSwitch: (subjectId: string) => void;
}

export default function SubjectSwitcher({ currentSubject, allSubjects, onSwitch }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return allSubjects;
    return allSubjects.filter(s => matchesFields(search, [s.name, s.shortName]));
  }, [allSubjects, search]);

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setSearch(''); }}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-card/60 border border-transparent hover:border-border/15 transition-all active:scale-95 min-w-0 group">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/10 shadow-sm" style={{ backgroundColor: currentSubject.color, boxShadow: `0 0 8px ${currentSubject.color}40` }} />
          <span className="text-sm font-bold text-foreground break-words max-w-[140px] sm:max-w-[200px]">{currentSubject.shortName}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" sideOffset={8} className="w-72 p-0 bg-card/98 backdrop-blur-xl border-border/20 shadow-2xl rounded-2xl overflow-hidden">
        {/* Search header */}
        <div className="p-2.5 border-b border-border/10 bg-muted/5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search subjects..."
              className="h-8 pl-8 text-xs bg-card/60 border-border/15 rounded-lg focus-visible:ring-1 focus-visible:ring-primary/30"
              autoFocus
            />
          </div>
          <p className="text-[9px] font-bold text-muted-foreground mt-1.5 px-1">{allSubjects.length} SUBJECTS</p>
        </div>

        {/* Subject list */}
        <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5 scrollbar-hide">
          {filtered.map(s => {
            const isActive = s.id === currentSubject.id;
            const totalTopics = s.units.reduce((a, u) => a + u.subTopics.length, 0);
            const doneTopics = s.units.reduce((a, u) => a + u.subTopics.filter(t => t.completed).length, 0);
            const pct = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0;
            const r = 12;
            const circ = 2 * Math.PI * r;

            return (
              <button
                key={s.id}
                onClick={() => { onSwitch(s.id); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all text-left ${
                  isActive
                    ? 'bg-primary/8 border border-primary/20 shadow-sm'
                    : 'hover:bg-muted/15 border border-transparent'
                }`}
              >
                {/* Mini progress ring */}
                <div className="relative w-8 h-8 shrink-0">
                  <svg viewBox="0 0 28 28" className="w-full h-full -rotate-90">
                    <circle cx="14" cy="14" r={r} fill="none" stroke="hsl(var(--muted) / 0.15)" strokeWidth="2.5" />
                    <circle cx="14" cy="14" r={r} fill="none" stroke={pct >= 100 ? 'hsl(var(--secondary))' : s.color} strokeWidth="2.5" strokeLinecap="round"
                      strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
                      style={{ transition: 'stroke-dashoffset 0.4s ease-out' }} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black font-mono"
                    style={{ color: pct >= 100 ? 'hsl(var(--secondary))' : s.color }}>{pct}</span>
                </div>

                {/* Subject info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold break-words ${isActive ? 'text-primary' : 'text-foreground'}`}>{s.shortName}</p>
                  <p className="text-[10px] text-muted-foreground break-words">{s.name}</p>
                </div>

                {/* Stats */}
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-mono font-bold text-muted-foreground">{doneTopics}/{totalTopics}</p>
                  <p className="text-[9px] text-muted-foreground">{s.units.length} units</p>
                </div>

                {/* Active indicator bar */}
                {isActive && (
                  <div className="w-1 h-6 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-6">
              <span className="text-2xl">🔍</span>
              <p className="text-xs text-muted-foreground mt-1">No subjects found</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
