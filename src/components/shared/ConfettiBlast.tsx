import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  active: boolean;
  onDone?: () => void;
}

const COLORS = ['#00D4FF', '#10F090', '#FFB830', '#FF4D6D', '#A855F7', '#F59E0B'];

export default function ConfettiBlast({ active, onDone }: Props) {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string; rot: number; scale: number }[]>([]);

  useEffect(() => {
    if (!active) return;
    const ps = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 400,
      y: -(Math.random() * 300 + 100),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * 720 - 360,
      scale: Math.random() * 0.6 + 0.4,
    }));
    setParticles(ps);
    const t = setTimeout(() => { setParticles([]); onDone?.(); }, 2000);
    return () => clearTimeout(t);
  }, [active, onDone]);

  return (
    <AnimatePresence>
      {particles.length > 0 && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden">
          {particles.map(p => (
            <motion.div key={p.id}
              initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: p.scale }}
              animate={{ x: p.x, y: p.y, rotate: p.rot, opacity: 0 }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="absolute w-3 h-3 rounded-sm"
              style={{ backgroundColor: p.color }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
