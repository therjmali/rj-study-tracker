import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

interface FlipPillProps {
  id: TimeFilter;
  frontIcon: React.ReactNode;
  frontLabel: string;
  backContent: React.ReactNode;
  isActive: boolean;
  flippedId: TimeFilter | null;
  onClick: () => void;
  className?: string;
  hasDropdown?: boolean;
  onDropdownClick?: (e: React.MouseEvent) => void;
}

function FlipPill({ id, frontIcon, frontLabel, backContent, isActive, flippedId, onClick, className, hasDropdown, onDropdownClick }: FlipPillProps) {
  const isFlipped = flippedId === id;

  return (
    <div className={`relative flex-shrink-0 ${className || ''}`} style={{ perspective: 600 }}>
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200, mass: 0.8 }}
        style={{ transformStyle: 'preserve-3d' }}
        className="relative"
      >
        {/* Front face */}
        <button
          onClick={onClick}
          style={{ backfaceVisibility: 'hidden' }}
          className={`relative flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-2xl border-2 transition-colors duration-200 min-w-[62px] min-h-[52px] ${
            isActive
              ? 'bg-primary/12 border-primary/30 shadow-lg shadow-primary/15'
              : 'bg-card/30 border-border/10 hover:bg-card/50 hover:border-border/20'
          }`}
        >
          {isActive && (
            <motion.div
              layoutId="active-time-bg"
              className="absolute inset-0 rounded-2xl bg-primary/8 border-2 border-primary/20"
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            />
          )}
          <span className="relative z-10">{frontIcon}</span>
          <span className={`relative z-10 text-[10px] font-bold whitespace-nowrap leading-none ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
            {frontLabel}
          </span>
          {hasDropdown && (
            <button
              onClick={(e) => { e.stopPropagation(); onDropdownClick?.(e); }}
              className={`relative z-20 p-0.5 -mb-0.5 rounded-full transition-colors ${
                isActive ? 'hover:bg-primary/20' : 'hover:bg-muted/30'
              }`}
            >
              <ChevronDown className={`w-2.5 h-2.5 ${isActive ? 'text-primary/60' : 'text-muted-foreground/40'}`} />
            </button>
          )}
        </button>

        {/* Back face (flipped) */}
        <div
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          className={`flex flex-col items-center justify-center rounded-2xl border-2 px-2 py-1.5 ${
            isActive
              ? 'bg-primary/15 border-primary/35 shadow-lg shadow-primary/20'
              : 'bg-accent/10 border-accent/25 shadow-md shadow-accent/10'
          }`}
        >
          {backContent}
        </div>
      </motion.div>
    </div>
  );
}

export default function TimeFilterPills({
  timeFilter,
  onTimeFilterChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  dataStartDate,
}: TimeFilterPillsProps) {
  const [flippedId, setFlippedId] = useState<TimeFilter | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [selectedMonthFrom, setSelectedMonthFrom] = useState<string>('');
  const [selectedWeekFrom, setSelectedWeekFrom] = useState<string>('');
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const now = new Date();
  const todayShort = format(now, 'MMM d');
  const weekLabel = useMemo(getWeekRange, []);
  const currentMonthShort = format(now, 'MMM yyyy');
  const monthOptions = useMemo(() => getMonthOptions(dataStartDate), [dataStartDate]);
  const weekOptions = useMemo(() => getWeekOptions(dataStartDate), [dataStartDate]);

  const activeWeekInfo = useMemo(() => {
    if (selectedWeekFrom) {
      const opt = weekOptions.find(o => o.from === selectedWeekFrom);
      if (opt) return { label: opt.label, badge: opt.isCurrent ? 'This Week' : opt.isLastWeek ? 'Last Week' : 'Selected' };
    }
    return { label: weekLabel, badge: 'This Week' };
  }, [selectedWeekFrom, weekOptions, weekLabel]);

  const customLabel = useMemo(() => {
    if (!customFrom) return '—';
    const to = customTo || customFrom;
    try {
      return `${format(new Date(customFrom + 'T12:00:00'), 'MMM d')} – ${format(new Date(to + 'T12:00:00'), 'MMM d')}`;
    } catch { return '—'; }
  }, [customFrom, customTo]);

  const triggerFlip = useCallback((id: TimeFilter) => {
    if (flipTimer.current) clearTimeout(flipTimer.current);
    onTimeFilterChange(id);
    // Don't open dropdowns on pill click — just select the filter
    if (id === 'all') { setFlippedId(null); return; }
    setFlippedId(id);
    flipTimer.current = setTimeout(() => setFlippedId(null), 2500);
  }, [onTimeFilterChange]);

  useEffect(() => {
    return () => { if (flipTimer.current) clearTimeout(flipTimer.current); };
  }, []);

  const handleMonthSelect = useCallback((opt: { from: string; to: string }) => {
    onCustomFromChange?.(opt.from);
    onCustomToChange?.(opt.to);
    onTimeFilterChange('custom');
    setSelectedMonthFrom(opt.from);
    setMonthPickerOpen(false);
    if (flipTimer.current) clearTimeout(flipTimer.current);
    setFlippedId('monthly');
    flipTimer.current = setTimeout(() => setFlippedId(null), 2500);
  }, [onTimeFilterChange, onCustomFromChange, onCustomToChange]);

  const handleWeekSelect = useCallback((opt: { from: string; to: string }) => {
    onCustomFromChange?.(opt.from);
    onCustomToChange?.(opt.to);
    onTimeFilterChange('custom');
    setSelectedWeekFrom(opt.from);
    setWeekPickerOpen(false);
    if (flipTimer.current) clearTimeout(flipTimer.current);
    setFlippedId('weekly');
    flipTimer.current = setTimeout(() => setFlippedId(null), 2500);
  }, [onTimeFilterChange, onCustomFromChange, onCustomToChange]);

  const iconClass = (id: TimeFilter) =>
    `w-4 h-4 ${timeFilter === id ? 'text-primary' : 'text-muted-foreground'}`;

  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
      {/* ∞ All Time */}
      <FlipPill
        id="all"
        isActive={timeFilter === 'all'}
        flippedId={flippedId}
        frontIcon={<Infinity className={iconClass('all')} />}
        frontLabel="All Time"
        backContent={
          <span className="text-[9px] font-bold text-primary whitespace-nowrap">∞ Everything</span>
        }
        onClick={() => triggerFlip('all')}
      />

      {/* 📅 Today */}
      <FlipPill
        id="today"
        isActive={timeFilter === 'today'}
        flippedId={flippedId}
        frontIcon={<CalendarDays className={iconClass('today')} />}
        frontLabel="Today"
        backContent={
          <div className="flex flex-col items-center gap-0.5">
            <CalendarDays className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-black text-foreground whitespace-nowrap">{todayShort}</span>
            <span className="text-[7px] font-bold text-primary/70 uppercase">{format(now, 'EEEE')}</span>
          </div>
        }
        onClick={() => triggerFlip('today')}
      />

      {/* 📆 Weekly — with dropdown on chevron only */}
      <Popover open={weekPickerOpen} onOpenChange={setWeekPickerOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <FlipPill
              id="weekly"
              isActive={timeFilter === 'weekly'}
              flippedId={flippedId}
              frontIcon={<CalendarRange className={iconClass('weekly')} />}
              frontLabel="Weekly"
              backContent={
                <div className="flex flex-col items-center gap-0.5">
                  <CalendarRange className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[8px] font-black text-foreground whitespace-nowrap leading-tight">{activeWeekInfo.label}</span>
                  <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase ${
                    activeWeekInfo.badge === 'This Week' ? 'bg-primary/15 text-primary' :
                    activeWeekInfo.badge === 'Last Week' ? 'bg-accent/15 text-accent' :
                    'bg-muted/20 text-muted-foreground'
                  }`}>{activeWeekInfo.badge}</span>
                </div>
              }
              onClick={() => triggerFlip('weekly')}
              hasDropdown
              onDropdownClick={() => setWeekPickerOpen(p => !p)}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-64 p-2 rounded-xl" align="center" sideOffset={6}>
          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider px-2 py-1.5">Select Week</p>
          {/* Pinned: This Week & Last Week */}
          <div className="space-y-1 mb-1.5">
            {weekOptions.filter(o => o.isCurrent || o.isLastWeek).sort((a) => (a.isCurrent ? -1 : 1)).map(opt => {
              const isSelected = selectedWeekFrom === opt.from;
              return (
                <button key={opt.from} onClick={() => handleWeekSelect(opt)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all border ${
                    isSelected ? 'bg-primary/15 border-primary/30 shadow-md' :
                    opt.isCurrent ? 'bg-primary/8 border-primary/15 hover:bg-primary/12' :
                    'bg-accent/8 border-accent/15 hover:bg-accent/12'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-foreground">{opt.label}</span>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ${
                      opt.isCurrent ? 'bg-primary/15 text-primary' : 'bg-accent/15 text-accent'
                    }`}>
                      ● {opt.isCurrent ? 'this week' : 'last week'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="h-px bg-border/15 mx-2 mb-1.5" />
          <div className="space-y-0.5 max-h-44 overflow-y-auto">
            {weekOptions.filter(o => !o.isCurrent && !o.isLastWeek).map(opt => {
              const isSelected = selectedWeekFrom === opt.from;
              return (
                <button key={opt.from} onClick={() => handleWeekSelect(opt)}
                  className={`w-full text-left text-[11px] font-semibold px-3 py-2 rounded-lg transition-all ${
                    isSelected ? 'bg-primary/15 text-primary font-bold ring-1 ring-primary/30' : 'text-foreground hover:bg-muted/20'
                  }`}>
                  {opt.label}
                  {isSelected && <span className="ml-1 text-[8px] text-primary/60">● selected</span>}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* 🗓️ Monthly — dropdown on chevron only */}
      <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <FlipPill
              id="monthly"
              isActive={timeFilter === 'monthly'}
              flippedId={flippedId}
              frontIcon={<Calendar className={iconClass('monthly')} />}
              frontLabel="Monthly"
              backContent={
                <div className="flex flex-col items-center gap-0.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[9px] font-black text-foreground whitespace-nowrap">{currentMonthShort}</span>
                  <span className="text-[7px] font-bold text-primary/70 uppercase">Current Month</span>
                </div>
              }
              onClick={() => triggerFlip('monthly')}
              hasDropdown
              onDropdownClick={() => setMonthPickerOpen(p => !p)}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-52 p-2 rounded-xl" align="center" sideOffset={6}>
          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider px-2 py-1.5">Select Month</p>
          <div className="space-y-0.5 max-h-56 overflow-y-auto">
            {monthOptions.map(opt => {
              const isSelected = selectedMonthFrom === opt.from;
              return (
                <button key={opt.label} onClick={() => handleMonthSelect(opt)}
                  className={`w-full text-left text-[11px] font-semibold px-3 py-2 rounded-lg transition-all ${
                    isSelected ? 'bg-primary/15 text-primary font-bold ring-1 ring-primary/30' :
                    opt.isCurrent ? 'bg-primary/8 text-primary font-bold' : 'text-foreground hover:bg-muted/20'
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

      {/* 📋 Custom */}
      <FlipPill
        id="custom"
        isActive={timeFilter === 'custom'}
        flippedId={flippedId}
        frontIcon={<FileText className={iconClass('custom')} />}
        frontLabel="Custom"
        backContent={
          <div className="flex flex-col items-center gap-0.5">
            <FileText className="w-3.5 h-3.5 text-primary" />
            <span className="text-[8px] font-black text-foreground whitespace-nowrap leading-tight">{customLabel}</span>
            <span className="text-[7px] font-bold text-primary/70 uppercase">Range</span>
          </div>
        }
        onClick={() => triggerFlip('custom')}
      />
    </div>
  );
}
