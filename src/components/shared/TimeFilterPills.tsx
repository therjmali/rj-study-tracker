import { useState, useMemo, useCallback } from 'react';
import { Infinity, CalendarDays, CalendarRange, Calendar, FileText, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverAnchor } from '@project/components/ui/popover';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addMonths, addWeeks, subWeeks, isAfter, isSameWeek, isSameMonth } from 'date-fns';
import { getLocalDateStr } from '../../lib/utils';

export type TimeFilter = 'all' | 'today' | 'weekly' | 'monthly' | 'custom';

interface TimeFilterPillsProps {
  timeFilter: TimeFilter;
  onTimeFilterChange: (t: TimeFilter) => void;
  customFrom?: string;
  customTo?: string;
  onCustomFromChange?: (v: string) => void;
  onCustomToChange?: (v: string) => void;
  dataStartDate?: string;
}

function getWeekRange() {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 });
  const end = endOfWeek(now, { weekStartsOn: 1 });
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
}

function getMonthOptions(dataStartDate?: string) {
  const now = new Date();
  const options: { label: string; short: string; from: string; to: string; isCurrent: boolean }[] = [];

  let startMonth: Date;
  if (dataStartDate) {
    startMonth = startOfMonth(new Date(dataStartDate + 'T12:00:00'));
  } else {
    startMonth = startOfMonth(addMonths(now, -6));
  }

  const endMonth = addMonths(now, 3);

  let d = new Date(startMonth);
  while (!isAfter(d, endMonth)) {
    options.push({
      label: format(d, 'MMMM yyyy'),
      short: format(d, 'MMM yyyy'),
      from: getLocalDateStr(startOfMonth(d)),
      to: getLocalDateStr(endOfMonth(d)),
      isCurrent: isSameMonth(d, now),
    });
    d = addMonths(d, 1);
  }
  return options;
}

function getWeekOptions(dataStartDate?: string) {
  const now = new Date();
  const options: { label: string; from: string; to: string; isCurrent: boolean; isLastWeek: boolean }[] = [];

  let startWeekDate: Date;
  if (dataStartDate) {
    startWeekDate = startOfWeek(new Date(dataStartDate + 'T12:00:00'), { weekStartsOn: 1 });
  } else {
    startWeekDate = startOfWeek(subWeeks(now, 8), { weekStartsOn: 1 });
  }

  // End: current + 3 weeks ahead (not just +1)
  const endWeekDate = endOfWeek(addWeeks(now, 3), { weekStartsOn: 1 });

  let d = new Date(startWeekDate);
  while (!isAfter(d, endWeekDate)) {
    const ws = startOfWeek(d, { weekStartsOn: 1 });
    const we = endOfWeek(d, { weekStartsOn: 1 });
    const current = isSameWeek(d, now, { weekStartsOn: 1 });
    const lastWeekDate = subWeeks(now, 1);
    const isLW = isSameWeek(d, lastWeekDate, { weekStartsOn: 1 });
    options.push({
      label: `${format(ws, 'MMM d')} – ${format(we, 'MMM d')}`,
      from: getLocalDateStr(ws),
      to: getLocalDateStr(we),
      isCurrent: current,
      isLastWeek: isLW && !current,
    });
    d = addWeeks(d, 1);
  }
  return options;
}

/** One cell of the segmented control: icon, label and a live sub-label (date / range) — no hidden back face, nothing to flip. */
function Pill({ icon, label, sub, active, onClick, onDropdown, dropdownOpen }: {
  icon: React.ReactNode; label: string; sub: string; active: boolean; onClick: () => void;
  onDropdown?: () => void; dropdownOpen?: boolean;
}) {
  return (
    <div className="relative min-w-0">
      <button
        type="button" onClick={onClick} aria-pressed={active}
        className={`flex h-full w-full min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 transition-colors duration-150 active:scale-[0.97] ${
          active ? 'border-primary/40 bg-primary/12 text-foreground' : 'border-border/25 bg-card/40 text-muted-foreground'
        }`}
      >
        <span className={active ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
        <span className="max-w-full truncate text-[10px] font-extrabold leading-none">{label}</span>
        <span className={`max-w-full truncate text-[8px] font-semibold leading-none ${active ? 'text-primary/80' : 'text-muted-foreground/70'}`}>{sub}</span>
      </button>
      {onDropdown && (
        <button
          type="button" aria-label={`Choose ${label.toLowerCase()}`} aria-expanded={dropdownOpen}
          onClick={e => { e.stopPropagation(); onDropdown(); }}
          className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground active:bg-muted/40"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}

const compact = (from: Date, to: Date) =>
  from.getMonth() === to.getMonth() ? `${format(from, 'd')}–${format(to, 'd MMM')}` : `${format(from, 'd MMM')}–${format(to, 'd MMM')}`;

export default function TimeFilterPills({
  timeFilter,
  onTimeFilterChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  dataStartDate,
}: TimeFilterPillsProps) {
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [selectedMonthFrom, setSelectedMonthFrom] = useState<string>('');
  const [selectedWeekFrom, setSelectedWeekFrom] = useState<string>('');

  const now = new Date();
  const monthOptions = useMemo(() => getMonthOptions(dataStartDate), [dataStartDate]);
  const weekOptions = useMemo(() => getWeekOptions(dataStartDate), [dataStartDate]);

  // A picked week / month is applied as a custom range — keep the matching pill highlighted instead of "Custom".
  const weekActive = timeFilter === 'weekly' || (timeFilter === 'custom' && !!selectedWeekFrom && customFrom === selectedWeekFrom);
  const monthActive = timeFilter === 'monthly' || (timeFilter === 'custom' && !!selectedMonthFrom && customFrom === selectedMonthFrom);
  const customActive = timeFilter === 'custom' && !weekActive && !monthActive;

  const weekSub = useMemo(() => {
    const sel = selectedWeekFrom ? weekOptions.find(o => o.from === selectedWeekFrom) : undefined;
    if (sel) return compact(new Date(sel.from + 'T12:00:00'), new Date(sel.to + 'T12:00:00'));
    return compact(startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeekFrom, weekOptions]);
  const monthSub = useMemo(() => {
    const sel = selectedMonthFrom ? monthOptions.find(o => o.from === selectedMonthFrom) : undefined;
    return sel ? sel.short : format(now, 'MMM yyyy');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonthFrom, monthOptions]);
  const customSub = useMemo(() => {
    if (!customFrom) return 'Pick dates';
    try { return compact(new Date(customFrom + 'T12:00:00'), new Date((customTo || customFrom) + 'T12:00:00')); } catch { return '—'; }
  }, [customFrom, customTo]);

  const handleMonthSelect = useCallback((opt: { from: string; to: string }) => {
    onCustomFromChange?.(opt.from);
    onCustomToChange?.(opt.to);
    onTimeFilterChange('custom');
    setSelectedMonthFrom(opt.from);
    setSelectedWeekFrom('');
    setMonthPickerOpen(false);
  }, [onTimeFilterChange, onCustomFromChange, onCustomToChange]);

  const handleWeekSelect = useCallback((opt: { from: string; to: string }) => {
    onCustomFromChange?.(opt.from);
    onCustomToChange?.(opt.to);
    onTimeFilterChange('custom');
    setSelectedWeekFrom(opt.from);
    setSelectedMonthFrom('');
    setWeekPickerOpen(false);
  }, [onTimeFilterChange, onCustomFromChange, onCustomToChange]);

  const select = (id: TimeFilter) => {
    if (id !== 'custom') { setSelectedWeekFrom(''); setSelectedMonthFrom(''); }
    onTimeFilterChange(id);
  };

  return (
    // Five equal columns: always fits (no sideways scrolling, nothing cut off) from small phones to tablets.
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="group" aria-label="Time range">
      <Pill icon={<Infinity className="h-4 w-4" />} label="All Time" sub="Everything" active={timeFilter === 'all'} onClick={() => select('all')} />
      <Pill icon={<CalendarDays className="h-4 w-4" />} label="Today" sub={format(now, 'MMM d')} active={timeFilter === 'today'} onClick={() => select('today')} />

      <Popover open={weekPickerOpen} onOpenChange={setWeekPickerOpen}>
        <PopoverAnchor asChild>
          <div className="min-w-0">
            <Pill icon={<CalendarRange className="h-4 w-4" />} label="Weekly" sub={weekSub} active={weekActive}
              onClick={() => select('weekly')} onDropdown={() => setWeekPickerOpen(p => !p)} dropdownOpen={weekPickerOpen} />
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-64 rounded-xl p-2" align="center" sideOffset={6}>
          <p className="px-2 py-1.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">Select Week</p>
          <div className="mb-1.5 space-y-1">
            {weekOptions.filter(o => o.isCurrent || o.isLastWeek).sort((a) => (a.isCurrent ? -1 : 1)).map(opt => {
              const isSelected = selectedWeekFrom === opt.from;
              return (
                <button key={opt.from} onClick={() => handleWeekSelect(opt)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isSelected ? 'border-primary/30 bg-primary/15' : opt.isCurrent ? 'border-primary/15 bg-primary/8' : 'border-accent/15 bg-accent/8'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-foreground">{opt.label}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${opt.isCurrent ? 'bg-primary/15 text-primary' : 'bg-accent/15 text-accent'}`}>
                      ● {opt.isCurrent ? 'this week' : 'last week'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mx-2 mb-1.5 h-px bg-border/15" />
          <div className="max-h-44 space-y-0.5 overflow-y-auto">
            {weekOptions.filter(o => !o.isCurrent && !o.isLastWeek).map(opt => {
              const isSelected = selectedWeekFrom === opt.from;
              return (
                <button key={opt.from} onClick={() => handleWeekSelect(opt)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-[11px] font-semibold transition-colors ${isSelected ? 'bg-primary/15 font-bold text-primary ring-1 ring-primary/30' : 'text-foreground hover:bg-muted/20'}`}>
                  {opt.label}
                  {isSelected && <span className="ml-1 text-[8px] text-primary/60">● selected</span>}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
        <PopoverAnchor asChild>
          <div className="min-w-0">
            <Pill icon={<Calendar className="h-4 w-4" />} label="Monthly" sub={monthSub} active={monthActive}
              onClick={() => select('monthly')} onDropdown={() => setMonthPickerOpen(p => !p)} dropdownOpen={monthPickerOpen} />
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-52 rounded-xl p-2" align="center" sideOffset={6}>
          <p className="px-2 py-1.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">Select Month</p>
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {monthOptions.map(opt => {
              const isSelected = selectedMonthFrom === opt.from;
              return (
                <button key={opt.label} onClick={() => handleMonthSelect(opt)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-[11px] font-semibold transition-colors ${
                    isSelected ? 'bg-primary/15 font-bold text-primary ring-1 ring-primary/30' : opt.isCurrent ? 'bg-primary/8 font-bold text-primary' : 'text-foreground hover:bg-muted/20'
                  }`}>
                  {opt.label}
                  {opt.isCurrent && <span className="ml-1 text-[8px] text-primary/60">● current</span>}
                  {isSelected && !opt.isCurrent && <span className="ml-1 text-[8px] text-primary/60">● selected</span>}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Pill icon={<FileText className="h-4 w-4" />} label="Custom" sub={customSub} active={customActive} onClick={() => select('custom')} />
    </div>
  );
}
