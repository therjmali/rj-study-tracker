import { useClock } from '../hooks/useClock';

function Digit({ value, color = 'text-foreground' }: { value: string; color?: string }) {
  return (
    <span className={`clock-digit inline-flex items-center justify-center w-[20px] h-[24px] sm:w-[22px] sm:h-[26px] rounded-md text-[13px] sm:text-[15px] ${color}`}>
      {value}
    </span>
  );
}

export default function HeaderClock() {
  const now = useClock();
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const hStr = String(h12).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');

  const dayName = now.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNum = now.getDate();
  const monthName = now.toLocaleDateString('en-US', { month: 'short' });

  return (
    <div className="flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3 py-1.5 rounded-xl border border-border/30 bg-card/60 backdrop-blur-sm">
      {/* Date badge */}
      <div className="flex flex-col items-center leading-none -space-y-0.5">
        <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-widest text-muted-foreground">{dayName}</span>
        <span className="font-display-digit text-[16px] sm:text-[18px] text-primary leading-none">{dayNum}</span>
        <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider text-secondary">{monthName}</span>
      </div>

      {/* Separator */}
      <div className="w-px h-6 sm:h-7 bg-border/30" />

      {/* Flip-clock digits */}
      <div className="flex items-center gap-[2px] sm:gap-[3px]">
        <Digit value={hStr[0]} color="text-primary" />
        <Digit value={hStr[1]} color="text-primary" />
        <span className="text-[12px] sm:text-[14px] font-display-digit text-muted-foreground animate-colon-blink mx-px leading-none">:</span>
        <Digit value={mStr[0]} color="text-foreground" />
        <Digit value={mStr[1]} color="text-foreground" />
        <span className="text-[12px] sm:text-[14px] font-display-digit text-muted-foreground animate-colon-blink mx-px leading-none">:</span>
        <Digit value={sStr[0]} color="text-secondary" />
        <Digit value={sStr[1]} color="text-secondary" />
      </div>

      {/* AM/PM */}
      <span className="text-[8px] sm:text-[9px] font-bold tracking-wider text-muted-foreground">{ampm}</span>
    </div>
  );
}
