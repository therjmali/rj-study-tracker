import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Lock } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import type { StoreState, StoreItem, StoreItemCategory } from '../../types';
import { STORE_CATALOG } from '../../types';
import { LEVELS, getLevel, getUnlockedItems } from '../../lib/gamification';
import GlowCard from '../shared/GlowCard';

interface Props {
  store: StoreState;
  onUpdateStore: (s: StoreState) => void;
  xp: number;
  syllabusProgress?: number;
}

const CATEGORIES: { id: StoreItemCategory | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '🛒' },
  { id: 'theme', label: 'Themes', icon: '🎨' },
  { id: 'border', label: 'Borders', icon: '💠' },
  { id: 'confetti', label: 'Effects', icon: '🎊' },
];

export default function LevelStore({ store, onUpdateStore, xp, syllabusProgress = 0 }: Props) {
  const [category, setCategory] = useState<StoreItemCategory | 'all'>('all');
  const level = useMemo(() => getLevel(xp, syllabusProgress), [xp, syllabusProgress]);
  const unlockedIds = useMemo(() => new Set(getUnlockedItems(xp, syllabusProgress)), [xp, syllabusProgress]);

  const filtered = useMemo(() =>
    category === 'all' ? STORE_CATALOG : STORE_CATALOG.filter(i => i.category === category),
    [category]
  );

  const getUnlockLevel = useCallback((itemId: string): number => {
    for (const l of LEVELS) {
      if (l.unlocks?.includes(itemId)) return l.level;
    }
    return 99;
  }, []);

  const isEquipped = useCallback((item: StoreItem) => {
    if (item.category === 'theme') return store.equippedTheme === item.id;
    if (item.category === 'border') return store.equippedBorder === item.id;
    if (item.category === 'confetti') return store.equippedConfetti === item.id;
    return false;
  }, [store]);

  const equipItem = useCallback((item: StoreItem) => {
    const patch: Partial<StoreState> = {};
    if (item.category === 'theme') patch.equippedTheme = store.equippedTheme === item.id ? undefined : item.id;
    if (item.category === 'border') patch.equippedBorder = store.equippedBorder === item.id ? undefined : item.id;
    if (item.category === 'confetti') patch.equippedConfetti = store.equippedConfetti === item.id ? undefined : item.id;
    onUpdateStore({ ...store, ...patch });
    toast.success(isEquipped(item) ? 'Unequipped' : `Equipped ${item.name}`);
  }, [store, onUpdateStore, isEquipped]);

  return (
    <div className="space-y-4">
      {/* Level info */}
      <GlowCard glow="cyan" className="p-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{level.icon}</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-foreground">Level {level.level} — {level.title}</p>
            <p className="text-[10px] text-muted-foreground">🎁 Items unlock automatically as you level up by studying!</p>
          </div>
          <span className="text-sm font-black font-mono text-primary">{xp} XP</span>
        </div>
      </GlowCard>

      {/* Category Filter */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border
              ${category === c.id ? 'bg-primary/15 text-primary border-primary/25' : 'bg-card/30 text-muted-foreground border-border/15 hover:bg-card/50'}`}>
            <span>{c.icon}</span> {c.label}
          </button>
        ))}
      </div>

      {/* Items Grid */}
      <div className="grid grid-cols-2 gap-3">
        <AnimatePresence mode="sync">
          {filtered.map(item => {
            const unlocked = unlockedIds.has(item.id);
            const equipped = isEquipped(item);
            const unlockLvl = getUnlockLevel(item.id);
            return (
              <motion.div key={item.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={`glass-card p-4 flex flex-col items-center text-center gap-2 transition-all
                  ${equipped ? 'ring-2 ring-primary shadow-md shadow-primary/15' : ''}
                  ${unlocked ? 'opacity-100' : 'opacity-60'}`}>
                <span className="text-3xl">{item.icon}</span>
                <div>
                  <p className="text-xs font-bold text-foreground">{item.name}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{item.description}</p>
                </div>
                {unlocked ? (
                  <Button size="sm" variant={equipped ? 'default' : 'outline'}
                    onClick={() => equipItem(item)}
                    className="w-full text-[10px] h-7 gap-1">
                    {equipped ? <><Check className="w-3 h-3" /> Equipped</> : 'Equip'}
                  </Button>
                ) : (
                  <div className="w-full text-center">
                    <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground font-bold">
                      <Lock className="w-3 h-3" /> Level {unlockLvl}
                    </div>
                    <p className="text-[8px] text-muted-foreground/60 mt-0.5">
                      {unlockLvl - level.level} level{unlockLvl - level.level !== 1 ? 's' : ''} away
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
