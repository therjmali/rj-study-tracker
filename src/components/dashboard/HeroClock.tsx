import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClock } from '../../hooks/useClock';

function FlipDigit({ value, color = 'text-foreground' }: { value: string; color?: string }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 8, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={`inline-flex items-center justify-center text-[32px] sm:text-[42px] lg:text-[48px] leading-none font-display-digit tabular-nums ${color}`}
    >
      {value}
    </motion.span>
  );
}

/* ─── Ultra Premium Analog Watch Face ─── */
function AnalogWatch({ now }: { now: Date }) {
  // Hands are moved by writing the SVG transform attribute directly (no React re-render per frame)
  const hourRef = useRef<SVGGElement>(null);
  const minRef = useRef<SVGGElement>(null);
  const secRef = useRef<SVGGElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const paint = () => {
      const d = new Date();
      const h = d.getHours(), m = d.getMinutes(), sec = d.getSeconds(), ms = d.getMilliseconds();
      hourRef.current?.setAttribute('transform', `rotate(${(h % 12) * 30 + m * 0.5}, 100, 100)`);
      minRef.current?.setAttribute('transform', `rotate(${m * 6 + sec * 0.1}, 100, 100)`);
      secRef.current?.setAttribute('transform', `rotate(${(sec + ms / 1000) * 6}, 100, 100)`);
    };
    const loop = (ts: number) => {
      // ~30 fps is visually identical for a 6°/s sweep and halves the paint cost
      if (ts - last >= 33) { last = ts; paint(); }
      raf = requestAnimationFrame(loop);
    };
    paint();
    raf = requestAnimationFrame(loop);
    const onVis = () => { if (document.hidden) cancelAnimationFrame(raf); else { raf = requestAnimationFrame(loop); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const dayNum = now.getDate();
  const dayShort = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();

  // Roman numerals
  const romans = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

  return (
    <div className="relative w-full flex items-center justify-center py-3">
      <div className="relative w-[180px] h-[180px] sm:w-[220px] sm:h-[220px]">
      <div className="absolute inset-[4%] rounded-full pointer-events-none" style={{ boxShadow: '0 4px 20px hsl(var(--primary) / 0.15)' }} />
      <svg viewBox="0 0 200 200" className="relative w-full h-full">
        <defs>
          {/* Metallic bezel gradient */}
          <linearGradient id="bezel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--foreground) / 0.12)" />
            <stop offset="30%" stopColor="hsl(var(--foreground) / 0.25)" />
            <stop offset="50%" stopColor="hsl(var(--foreground) / 0.08)" />
            <stop offset="70%" stopColor="hsl(var(--foreground) / 0.22)" />
            <stop offset="100%" stopColor="hsl(var(--foreground) / 0.10)" />
          </linearGradient>
          {/* Dial gradient */}
          <radialGradient id="dial" cx="50%" cy="45%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--card) / 1)" />
            <stop offset="85%" stopColor="hsl(var(--card) / 0.95)" />
            <stop offset="100%" stopColor="hsl(var(--muted) / 0.7)" />
          </radialGradient>
          {/* Glass reflection */}
          <linearGradient id="glass" x1="0.3" y1="0" x2="0.7" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.12" />
            <stop offset="40%" stopColor="white" stopOpacity="0.03" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          {/* Ambient glow */}
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="transparent" />
            <stop offset="100%" stopColor="hsl(var(--primary) / 0.06)" />
          </radialGradient>
          {/* Hand shadow */}
          <filter id="handShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0.5" dy="0.5" stdDeviation="0.5" floodColor="black" floodOpacity="0.25" />
          </filter>
          <filter id="secShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0.3" dy="0.3" stdDeviation="0.3" floodColor="black" floodOpacity="0.2" />
          </filter>
        </defs>

        {/* Outer ambient glow */}
        <circle cx="100" cy="100" r="98" fill="url(#glow)" />

        {/* Outer bezel ring */}
        <circle cx="100" cy="100" r="96" fill="none" stroke="url(#bezel)" strokeWidth="4" />
        <circle cx="100" cy="100" r="94" fill="none" stroke="hsl(var(--border) / 0.3)" strokeWidth="0.5" />

        {/* Watch dial */}
        <circle cx="100" cy="100" r="91" fill="url(#dial)" />

        {/* Inner chapter ring */}
        <circle cx="100" cy="100" r="88" fill="none" stroke="hsl(var(--border) / 0.15)" strokeWidth="0.3" />

        {/* Minute ticks (60) */}
        {Array.from({ length: 60 }, (_, i) => {
          const angle = (i * 6 - 90) * (Math.PI / 180);
          const isHour = i % 5 === 0;
          const r1 = isHour ? 80 : 84;
          const r2 = 87;
          return (
            <line
              key={`tick-${i}`}
              x1={100 + r1 * Math.cos(angle)}
              y1={100 + r1 * Math.sin(angle)}
              x2={100 + r2 * Math.cos(angle)}
              y2={100 + r2 * Math.sin(angle)}
              stroke={isHour ? 'hsl(var(--foreground) / 0.7)' : 'hsl(var(--foreground) / 0.15)'}
              strokeWidth={isHour ? 1.8 : 0.5}
              strokeLinecap="round"
            />
          );
        })}

        {/* Roman numerals */}
        {romans.map((num, i) => {
          const angle = (i * 30 - 90) * (Math.PI / 180);
          const r = 72;
          const x = 100 + r * Math.cos(angle);
          const y = 100 + r * Math.sin(angle);
          return (
            <text
              key={`roman-${i}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="hsl(var(--foreground) / 0.75)"
              fontSize={i === 0 ? "9" : "7.5"}
              fontWeight={i === 0 || i === 3 || i === 6 || i === 9 ? "700" : "500"}
              fontFamily="Georgia, 'Times New Roman', serif"
              letterSpacing="0.5"
            >
              {num}
            </text>
          );
        })}

        {/* Brand text */}
        <text x="100" y="62" textAnchor="middle" fill="hsl(var(--primary) / 0.6)" fontSize="4.5" fontWeight="700" letterSpacing="2" fontFamily="system-ui, sans-serif">
          NURSETRACK
        </text>
        <text x="100" y="67" textAnchor="middle" fill="hsl(var(--muted-foreground) / 0.4)" fontSize="3" fontWeight="600" letterSpacing="1.5" fontFamily="system-ui, sans-serif">
          P R O
        </text>

        {/* Day/Date complication window */}
        <rect x="117" y="95" width="20" height="11" rx="2.5" fill="hsl(var(--card))" stroke="hsl(var(--border) / 0.3)" strokeWidth="0.5" />
        <text x="122" y="99" textAnchor="middle" fill="hsl(var(--primary) / 0.5)" fontSize="3.5" fontWeight="700" fontFamily="system-ui, sans-serif">
          {dayShort}
        </text>
        <line x1="127" y1="95.5" x2="127" y2="105.5" stroke="hsl(var(--border) / 0.2)" strokeWidth="0.3" />
        <text x="132" y="99" textAnchor="middle" fill="hsl(var(--foreground) / 0.7)" fontSize="4.5" fontWeight="800" fontFamily="system-ui, sans-serif">
          {dayNum}
        </text>

        {/* Hour hand */}
        <g ref={hourRef} transform="rotate(0, 100, 100)">
          <polygon
            points="98,60 100,42 102,60"
            fill="hsl(var(--foreground) / 0.8)"
          />
          <rect x="98.5" y="60" width="3" height="42" rx="1.5" fill="hsl(var(--foreground) / 0.8)" />
        </g>

        {/* Minute hand */}
        <g ref={minRef} transform="rotate(0, 100, 100)">
          <polygon
            points="98.8,50 100,28 101.2,50"
            fill="hsl(var(--foreground) / 0.7)"
          />
          <rect x="99" y="50" width="2" height="52" rx="1" fill="hsl(var(--foreground) / 0.7)" />
        </g>

        {/* Second hand — sweeping */}
        <g ref={secRef} transform="rotate(0, 100, 100)">
          <line x1="100" y1="115" x2="100" y2="24" stroke="hsl(var(--primary))" strokeWidth="0.8" strokeLinecap="round" />
          <circle cx="100" cy="115" r="2.5" fill="hsl(var(--primary))" />
        </g>

        {/* Center cap */}
        <circle cx="100" cy="100" r="4" fill="hsl(var(--foreground) / 0.7)" />
        <circle cx="100" cy="100" r="2" fill="hsl(var(--primary))" />

        {/* Glass reflection overlay */}
        <ellipse cx="85" cy="70" rx="45" ry="40" fill="url(#glass)" />
      </svg>
      </div>
    </div>
  );
}

/* ─── Digital Clock Face ─── */
function DigitalClock({ now }: { now: Date }) {
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const hStr = String(h12).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');

  const dayFull = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dayNum = now.getDate();
  const monthFull = now.toLocaleDateString('en-US', { month: 'long' });
  const year = now.getFullYear();

  return (
    <div className="relative z-10 flex flex-col items-center py-5 sm:py-6 px-4">
      <span className="text-[9px] sm:text-[10px] font-bold tracking-[0.35em] uppercase text-primary/80 mb-1">
        {dayFull}
      </span>
      <div className="flex items-baseline gap-0.5 sm:gap-1">
        <div className="flex items-baseline">
          <FlipDigit value={hStr[0]} color="text-primary" />
          <FlipDigit value={hStr[1]} color="text-primary" />
        </div>
        <span
          className="animate-colon-blink text-[28px] sm:text-[36px] lg:text-[42px] font-display-digit text-muted-foreground/60 mx-0.5 -translate-y-[2px]"
        >:</span>
        <div className="flex items-baseline">
          <FlipDigit value={mStr[0]} color="text-foreground" />
          <FlipDigit value={mStr[1]} color="text-foreground" />
        </div>
        <span
          style={{ animationDelay: '0.5s' }}
          className="animate-colon-blink text-[28px] sm:text-[36px] lg:text-[42px] font-display-digit text-muted-foreground/40 mx-0.5 -translate-y-[2px]"
        >:</span>
        <div className="flex items-baseline">
          <FlipDigit value={sStr[0]} color="text-secondary" />
          <FlipDigit value={sStr[1]} color="text-secondary" />
        </div>
        <span className="text-[10px] sm:text-xs font-black tracking-widest text-muted-foreground ml-1.5 self-center">
          {ampm}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <div className="h-px w-6 sm:w-10 bg-gradient-to-r from-transparent to-border/40" />
        <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground tracking-wide">
          {dayNum} {monthFull} {year}
        </span>
        <div className="h-px w-6 sm:w-10 bg-gradient-to-l from-transparent to-border/40" />
      </div>
    </div>
  );
}

const CLOCK_MODE_KEY = 'nursetrack-clock-mode';

export default function HeroClock() {
  const now = useClock();
  const [isAnalog, setIsAnalog] = useState(() => {
    try { return localStorage.getItem(CLOCK_MODE_KEY) === 'analog'; } catch { return false; }
  });
  const [isFlipping, setIsFlipping] = useState(false);


  useEffect(() => {
    try { localStorage.setItem(CLOCK_MODE_KEY, isAnalog ? 'analog' : 'digital'); } catch {}
  }, [isAnalog]);

  const handleFlip = () => {
    if (isFlipping) return;
    setIsFlipping(true);
    setTimeout(() => {
      setIsAnalog(p => !p);
      setTimeout(() => setIsFlipping(false), 400);
    }, 300);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full rounded-2xl overflow-hidden cursor-pointer select-none"
      onClick={handleFlip}
      style={{ perspective: 1000 }}
    >
      {/* Glassy background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/6 via-card/60 to-secondary/6" />
      <div className="absolute inset-0 border border-border/20 rounded-2xl" />

      {/* Static glow (gradient, no blur filter, no animation — blurred animated layers are very expensive) */}
      <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.10), transparent 70%)' }} />
      <div className="absolute -bottom-8 -right-8 w-36 h-36 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(var(--secondary) / 0.08), transparent 70%)' }} />

      {/* 3D Flip container */}
      <motion.div
        animate={{ rotateY: isFlipping ? 90 : 0 }}
        transition={{ duration: 0.3, ease: [0.45, 0, 0.55, 1] }}
        className="relative z-10"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <AnimatePresence mode="wait">
          {isAnalog ? (
            <motion.div key="analog" initial={{ rotateY: -90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: 90, opacity: 0 }} transition={{ duration: 0.3, ease: [0.45, 0, 0.55, 1] }}>
              <AnalogWatch now={now} />
            </motion.div>
          ) : (
            <motion.div key="digital" initial={{ rotateY: -90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: 90, opacity: 0 }} transition={{ duration: 0.3, ease: [0.45, 0, 0.55, 1] }}>
              <DigitalClock now={now} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Mode indicator */}
      <div className="absolute bottom-2 right-3 z-20">
        <span className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-widest">
          {isAnalog ? '⌚ analog' : '🔢 digital'} · tap to flip
        </span>
      </div>
    </motion.div>
  );
}
