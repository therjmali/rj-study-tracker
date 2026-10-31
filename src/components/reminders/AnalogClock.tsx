import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  value: string; // "HH:mm"
  onChange: (val: string) => void;
}

type Mode = 'hours' | 'minutes';

function pad(n: number) { return String(n).padStart(2, '0'); }

function polarToXY(angle: number, r: number, cx: number, cy: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export default function AnalogClock({ value, onChange }: Props) {
  const [h, m] = value.split(':').map(Number);
  const [hours, setHours] = useState(isNaN(h) ? 12 : h);
  const [minutes, setMinutes] = useState(isNaN(m) ? 0 : m);
  const [mode, setMode] = useState<Mode>('hours');
  const [isPM, setIsPM] = useState(hours >= 12);
  const [dragging, setDragging] = useState(false);
  const faceRef = useRef<SVGSVGElement>(null);

  // Sync external value
  useEffect(() => {
    const [hh, mm] = value.split(':').map(Number);
    if (!isNaN(hh)) { setHours(hh); setIsPM(hh >= 12); }
    if (!isNaN(mm)) setMinutes(mm);
  }, [value]);

  const emit = useCallback((newH: number, newM: number) => {
    onChange(`${pad(newH)}:${pad(newM)}`);
  }, [onChange]);

  const getAngleFromEvent = useCallback((clientX: number, clientY: number) => {
    const svg = faceRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    return angle;
  }, []);

  const handleInteraction = useCallback((clientX: number, clientY: number) => {
    const angle = getAngleFromEvent(clientX, clientY);
    if (mode === 'hours') {
      let hr = Math.round(angle / 30);
      if (hr === 0) hr = 12;
      const finalH = isPM ? (hr === 12 ? 12 : hr + 12) : (hr === 12 ? 0 : hr);
      setHours(finalH);
      emit(finalH, minutes);
    } else {
      let min = Math.round(angle / 6);
      if (min === 60) min = 0;
      setMinutes(min);
      emit(hours, min);
    }
  }, [mode, isPM, hours, minutes, emit, getAngleFromEvent]);

  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    handleInteraction(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    handleInteraction(e.clientX, e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (mode === 'hours') {
      setTimeout(() => setMode('minutes'), 250);
    }
  };

  const toggleAMPM = () => {
    const newPM = !isPM;
    setIsPM(newPM);
    const h12 = hours % 12;
    const newH = newPM ? h12 + 12 : h12;
    setHours(newH);
    emit(newH, minutes);
  };

  const display12 = hours % 12 || 12;
  const hourAngle = mode === 'hours'
    ? ((display12 % 12) / 12) * 360
    : ((display12 % 12) / 12) * 360 + (minutes / 60) * 30;
  const minuteAngle = (minutes / 60) * 360;

  const SIZE = 220;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const OUTER_R = 90;
  const INNER_R = 64;

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      {/* Digital display */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setMode('hours')}
          className={`text-3xl font-black font-mono transition-colors px-2 py-1 rounded-xl ${
            mode === 'hours' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {pad(display12)}
        </button>
        <span className="text-3xl font-black text-muted-foreground/50">:</span>
        <button
          onClick={() => setMode('minutes')}
          className={`text-3xl font-black font-mono transition-colors px-2 py-1 rounded-xl ${
            mode === 'minutes' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {pad(minutes)}
        </button>
        <button
          onClick={toggleAMPM}
          className="ml-2 text-sm font-black rounded-lg px-2.5 py-1.5 border transition-all bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
        >
          {isPM ? 'PM' : 'AM'}
        </button>
      </div>

      {/* Clock face */}
      <div className="relative">
        {/* Glow */}
        <div className="absolute inset-0 rounded-full bg-primary/5 blur-xl scale-110" />
        <svg
          ref={faceRef}
          width={SIZE}
          height={SIZE}
          className="relative cursor-pointer touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* Background */}
          <circle cx={CX} cy={CY} r={OUTER_R + 8} fill="hsl(var(--card))" stroke="hsl(var(--border) / 0.2)" strokeWidth="1" />
          <circle cx={CX} cy={CY} r={OUTER_R + 4} fill="none" stroke="hsl(var(--primary) / 0.06)" strokeWidth="6" />

          {/* Minute ticks */}
          {Array.from({ length: 60 }).map((_, i) => {
            const angle = i * 6;
            const isMajor = i % 5 === 0;
            const r1 = OUTER_R - (isMajor ? 8 : 4);
            const r2 = OUTER_R;
            const p1 = polarToXY(angle, r1, CX, CY);
            const p2 = polarToXY(angle, r2, CX, CY);
            return (
              <line
                key={i}
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke={isMajor ? 'hsl(var(--foreground) / 0.3)' : 'hsl(var(--muted-foreground) / 0.12)'}
                strokeWidth={isMajor ? 1.8 : 0.8}
                strokeLinecap="round"
              />
            );
          })}

          {/* Selection highlight (behind numbers) */}
          {(() => {
            const angle = mode === 'hours' ? hourAngle : minuteAngle;
            const tip = polarToXY(angle, INNER_R, CX, CY);
            return (
              <line
                x1={CX} y1={CY} x2={tip.x} y2={tip.y}
                stroke="hsl(var(--primary) / 0.12)" strokeWidth="36" strokeLinecap="round"
                style={{ transition: dragging ? 'none' : 'all 0.3s ease', pointerEvents: 'none' }}
              />
            );
          })()}

          {/* Hour/Minute numbers */}
          <AnimatePresence mode="wait">
            {mode === 'hours' ? (
              <motion.g key="hours" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.2 }}>
                {Array.from({ length: 12 }).map((_, i) => {
                  const num = i + 1;
                  const angle = num * 30;
                  const pos = polarToXY(angle, INNER_R, CX, CY);
                  const isSelected = display12 === num;
                  return (
                    <g key={num}>
                      {isSelected && (
                        <circle cx={pos.x} cy={pos.y} r={16} fill="hsl(var(--primary))" opacity={0.9} />
                      )}
                      <text
                        x={pos.x} y={pos.y}
                        textAnchor="middle" dominantBaseline="central"
                        fill={isSelected ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))'}
                        fontSize="13" fontWeight="700" fontFamily="var(--font-mono), monospace"
                      >
                        {num}
                      </text>
                    </g>
                  );
                })}
              </motion.g>
            ) : (
              <motion.g key="minutes" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.2 }}>
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((num) => {
                  const angle = (num / 60) * 360;
                  const pos = polarToXY(angle, INNER_R, CX, CY);
                  const isSelected = minutes === num;
                  return (
                    <g key={num}>
                      {isSelected && (
                        <circle cx={pos.x} cy={pos.y} r={16} fill="hsl(var(--primary))" opacity={0.9} />
                      )}
                      <text
                        x={pos.x} y={pos.y}
                        textAnchor="middle" dominantBaseline="central"
                        fill={isSelected ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))'}
                        fontSize="12" fontWeight="700" fontFamily="var(--font-mono), monospace"
                      >
                        {pad(num)}
                      </text>
                    </g>
                  );
                })}
              </motion.g>
            )}
          </AnimatePresence>

          {/* Hour hand */}
          {(() => {
            const tipH = polarToXY(hourAngle, 46, CX, CY);
            return (
              <line
                x1={CX} y1={CY} x2={tipH.x} y2={tipH.y}
                stroke="hsl(var(--foreground))" strokeWidth="3.5" strokeLinecap="round"
                style={{ transition: dragging ? 'none' : 'all 0.3s ease', pointerEvents: 'none' }}
              />
            );
          })()}

          {/* Minute hand */}
          {(() => {
            const tipM = polarToXY(minuteAngle, 68, CX, CY);
            return (
              <line
                x1={CX} y1={CY} x2={tipM.x} y2={tipM.y}
                stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round"
                style={{ transition: dragging ? 'none' : 'all 0.3s ease', pointerEvents: 'none' }}
              />
            );
          })()}

          {/* Center dot */}
          <circle cx={CX} cy={CY} r="5" fill="hsl(var(--primary))" />
          <circle cx={CX} cy={CY} r="2.5" fill="hsl(var(--primary-foreground))" />


        </svg>
      </div>

      {/* Mode indicator */}
      <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
        <span className={mode === 'hours' ? 'text-primary' : ''}>① Hour</span>
        <span>→</span>
        <span className={mode === 'minutes' ? 'text-primary' : ''}>② Minute</span>
      </div>
    </div>
  );
}
