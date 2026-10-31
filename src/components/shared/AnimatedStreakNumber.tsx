import { motion } from 'framer-motion';
import { useCountUp } from '../../hooks/useCountUp';
import type { StreakMilestone } from '../../hooks/useStreak';

interface Props {
  value: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showFire?: boolean;
  milestone?: StreakMilestone | null;
  showMilestoneBadge?: boolean;
}

const SIZES = {
  sm: { text: 'text-lg', sub: 'text-[7px]', fire: 'text-sm', glow: 4 },
  md: { text: 'text-2xl', sub: 'text-[8px]', fire: 'text-base', glow: 6 },
  lg: { text: 'text-3xl', sub: 'text-[9px]', fire: 'text-lg', glow: 8 },
  xl: { text: 'text-4xl', sub: 'text-[10px]', fire: 'text-xl', glow: 12 },
};

export default function AnimatedStreakNumber({ value, size = 'md', showFire = true, milestone, showMilestoneBadge = false }: Props) {
  const animated = useCountUp(value, 800, 100);
  const s = SIZES[size];
  const isHot = value >= 7;
  const isWarm = value >= 3;

  return (
    <div className="relative inline-flex flex-col items-center">
      {/* Fire particles for streak >= 3 */}
      {showFire && isWarm && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(isHot ? 5 : 3)].map((_, i) => (
            <motion.span
              key={i}
              className="absolute text-[8px]"
              initial={{ opacity: 0, y: 0, x: 0, scale: 0.5 }}
              animate={{
                opacity: [0, 0.9, 0],
                y: [0, -16 - i * 4],
                x: [0, (i % 2 === 0 ? 1 : -1) * (4 + i * 2)],
                scale: [0.4, 0.8, 0.3],
              }}
              transition={{
                duration: 1.5 + i * 0.3,
                repeat: Infinity,
                delay: i * 0.35,
                ease: 'easeOut',
              }}
              style={{ left: '50%', top: '10%' }}
            >
              🔥
            </motion.span>
          ))}
        </div>
      )}

      {/* The number */}
      <motion.span
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        className={`${s.text} font-black font-mono leading-none relative z-10 streak-number ${isHot ? 'streak-gold' : ''}`}
        style={isHot ? {
          background: 'linear-gradient(135deg, hsl(40 95% 55%), hsl(25 100% 50%), hsl(40 95% 55%))',
          backgroundSize: '200% 200%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: 'streak-shimmer 2s ease-in-out infinite',
          filter: `drop-shadow(0 0 ${s.glow}px hsla(35, 100%, 50%, 0.5))`,
        } : isWarm ? {
          color: 'hsl(var(--chart-4))',
          filter: `drop-shadow(0 0 ${s.glow * 0.6}px hsla(25, 100%, 50%, 0.3))`,
        } : {
          color: 'hsl(var(--foreground))',
        }}
      >
        {animated}
      </motion.span>

      {/* Milestone badge with pop animation */}
      {showMilestoneBadge && milestone && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.5 }}
          className="mt-0.5"
        >
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-chart-4/15 text-chart-4 border border-chart-4/25 font-bold whitespace-nowrap">
            {milestone.emoji} {milestone.label}
          </span>
        </motion.div>
      )}
    </div>
  );
}
