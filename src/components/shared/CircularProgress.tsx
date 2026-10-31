interface Props {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  sublabel?: string;
  unit?: string;
}

export default function CircularProgress({ value, max, size = 80, strokeWidth = 6, color = 'hsl(var(--primary))', label, sublabel, unit = '' }: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted) / 0.3)" strokeWidth={strokeWidth} />
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
            className="transition-all duration-700"
            style={{ filter: `drop-shadow(0 0 4px ${color}40)` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-black font-mono text-foreground">
            {typeof value === 'number' && value % 1 !== 0 ? value.toFixed(1) : value}{unit}
          </span>
        </div>
      </div>
      {label && <p className="text-xs text-muted-foreground font-bold">{label}</p>}
      {sublabel && <p className="text-xs text-muted-foreground font-semibold">{sublabel}</p>}
    </div>
  );
}
