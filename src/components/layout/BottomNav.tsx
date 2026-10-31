import { useRef, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import type { AppTab } from '../../types';

type NavId = AppTab | 'profile';
const TABS: { id: NavId; label: string; icon: string; activeIcon: string }[] = [
  { id: 'dashboard', label: 'Home', icon: '🏠', activeIcon: '🏡' },
  { id: 'syllabus', label: 'Syllabus', icon: '📚', activeIcon: '📖' },
  { id: 'charts', label: 'Stats', icon: '📊', activeIcon: '📈' },
  { id: 'revision', label: 'Review', icon: '🧠', activeIcon: '🧠' },
  { id: 'profile', label: 'Profile', icon: '👤', activeIcon: '🧑‍🎓' },
];

// Swipe order keeps the AI tutor reachable (it also lives in Profile → AI Tutor).
const TAB_ORDER: AppTab[] = ['dashboard', 'syllabus', 'charts', 'revision', 'gamification'];

interface Props {
  activeTab: AppTab;
  onTabChange: (tab: AppTab, direction?: 'left' | 'right') => void;
  srsDueCount?: number;
  onOpenProfile?: () => void;
  profileOpen?: boolean;
}

function BottomNavInner({ activeTab, onTabChange, srsDueCount = 0, onOpenProfile, profileOpen = false }: Props) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const currentIndex = TAB_ORDER.indexOf(activeTab);

  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    const nextIdx = direction === 'left'
      ? Math.min(currentIndex + 1, TAB_ORDER.length - 1)
      : Math.max(currentIndex - 1, 0);
    if (nextIdx !== currentIndex) {
      if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
      onTabChange(TAB_ORDER[nextIdx], direction);
    }
  }, [currentIndex, onTabChange]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dt = Date.now() - touchStartTime.current;
    const velocity = Math.abs(dx) / dt; // px/ms

    // Require minimum distance OR high velocity, and primarily horizontal
    const isHorizontal = Math.abs(dx) > Math.abs(dy) * 1.5;
    const hasDistance = Math.abs(dx) > 40;
    const hasFastSwipe = velocity > 0.4 && Math.abs(dx) > 20;

    if (isHorizontal && (hasDistance || hasFastSwipe)) {
      handleSwipe(dx < 0 ? 'left' : 'right');
    }
  }, [handleSwipe]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden px-3 pt-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0.5rem))' }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="glass-nav relative rounded-[20px] mx-auto max-w-lg overflow-hidden shadow-lg">
        <div className="flex items-center h-[60px] px-1">
          {TABS.map(tab => {
            const isProfile = tab.id === 'profile';
            const isActive = isProfile ? profileOpen : activeTab === tab.id && !profileOpen;
            return (
              <button key={tab.id} onClick={() => (isProfile ? onOpenProfile?.() : onTabChange(tab.id as AppTab))}
                className="relative flex flex-col items-center justify-center gap-[3px] flex-1 py-2 active:scale-90 transition-transform duration-100"
                aria-label={tab.label}>
                {isActive && (
                  <motion.div layoutId="navActiveBg"
                    className="absolute inset-x-1.5 inset-y-1.5 rounded-2xl bg-primary/10 border border-primary/10"
                    transition={{ type: 'spring', stiffness: 500, damping: 38, mass: 0.6 }} />
                )}
                <motion.span
                  animate={isActive ? { scale: 1.15, y: -1 } : { scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  className={`text-[18px] leading-none relative z-10 ${isActive ? '' : 'opacity-35 grayscale'}`}
                >
                  {isActive ? tab.activeIcon : tab.icon}
                </motion.span>
                <span className={`text-[9px] font-bold tracking-wide relative z-10 transition-colors duration-150 ${isActive ? 'text-primary' : 'text-muted-foreground/40'}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <motion.div layoutId="bottomNavDot"
                    className="absolute -bottom-0 w-5 h-[2.5px] rounded-full bg-primary"
                    style={{ boxShadow: '0 0 8px hsl(var(--primary) / 0.35)' }}
                    transition={{ type: 'spring', stiffness: 550, damping: 38, mass: 0.5 }} />
                )}
                {tab.id === 'revision' && srsDueCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-0.5 rounded-full bg-destructive text-[8px] font-bold text-destructive-foreground flex items-center justify-center shadow-sm shadow-destructive/30 border border-background/50">
                    {srsDueCount > 9 ? '9+' : srsDueCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

const BottomNav = memo(BottomNavInner);
export default BottomNav;
