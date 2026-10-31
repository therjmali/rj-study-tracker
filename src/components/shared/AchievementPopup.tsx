import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications } from '../../contexts/NotificationContext';
import ConfettiBlast from './ConfettiBlast';

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

interface Props {
  achievement: Achievement | null;
  onDismiss: () => void;
}

const RARITY_CONFIG: Record<string, { gradient: string; label: string; glow: string }> = {
  common: { gradient: 'from-slate-400 to-slate-600', label: 'Common', glow: '0 0 40px rgba(100,116,139,0.3)' },
  rare: { gradient: 'from-blue-400 to-blue-600', label: 'Rare', glow: '0 0 40px rgba(59,130,246,0.4)' },
  epic: { gradient: 'from-purple-400 to-purple-600', label: 'Epic', glow: '0 0 50px rgba(168,85,247,0.4)' },
  legendary: { gradient: 'from-amber-400 to-orange-500', label: 'Legendary', glow: '0 0 60px rgba(245,158,11,0.5)' },
};

export default function AchievementPopup({ achievement, onDismiss }: Props) {
  const [showConfetti, setShowConfetti] = useState(false);
  const { push } = useNotifications();

  useEffect(() => {
    if (achievement) {
      setShowConfetti(true);
      // Also push a swipeable notification so the user can dismiss it via swipe
      push({
        emoji: achievement.icon,
        title: `🏆 ${achievement.title}`,
        subtitle: `${achievement.description} · +${achievement.xp} XP`,
        position: 'top',
        duration: 5000,
      });
      const t = setTimeout(onDismiss, 5000);
      return () => clearTimeout(t);
    }
  }, [achievement, onDismiss, push]);

  if (!achievement) return null;

  const rc = RARITY_CONFIG[achievement.rarity] || RARITY_CONFIG.common;

  return (
    <>
      <ConfettiBlast active={showConfetti} onDone={() => setShowConfetti(false)} />
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.3, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            onClick={e => e.stopPropagation()}
            className="w-72 rounded-3xl overflow-hidden border border-border/20"
            style={{ boxShadow: rc.glow }}
          >
            <div className={`bg-gradient-to-br ${rc.gradient} p-6 text-center text-white`}>
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="text-5xl mb-2"
              >
                {achievement.icon}
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 mb-1"
              >
                🏆 Achievement Unlocked!
              </motion.p>
              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-lg font-black"
              >
                {achievement.title}
              </motion.h3>
            </div>

            <div className="bg-card p-5 text-center space-y-3">
              <p className="text-xs text-muted-foreground">{achievement.description}</p>
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <p className="text-lg font-black text-primary">+{achievement.xp}</p>
                  <p className="text-[9px] text-muted-foreground font-bold">XP Earned</p>
                </div>
                <div className="w-px h-8 bg-border/30" />
                <div className="text-center">
                  <p className={`text-xs font-black bg-gradient-to-r ${rc.gradient} bg-clip-text text-transparent`}>
                    {rc.label}
                  </p>
                  <p className="text-[9px] text-muted-foreground font-bold">Rarity</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/50 italic">Swipe notification or tap to dismiss</p>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
