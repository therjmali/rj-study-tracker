import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Coins, ShoppingBag, Check, Lock } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import type { CoinsState, StoreState, StoreItem, StoreItemCategory } from '../../types';
import { STORE_CATALOG } from '../../types';
import GlowCard from '../shared/GlowCard';

interface Props {
  coins: CoinsState;
  store: StoreState;
  onUpdateCoins: (c: CoinsState) => void;
  onUpdateStore: (s: StoreState) => void;
  onBack: () => void;
}

const CATEGORIES: { id: StoreItemCategory | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '🛒' },
  { id: 'theme', label: 'Themes', icon: '🎨' },
  { id: 'border', label: 'Borders', icon: '💠' },
  { id: 'confetti', label: 'Effects', icon: '🎊' },
];

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };

export default function CoinStore({ coins, store, onUpdateCoins, onUpdateStore, onBack }: Props) {
  const [category, setCategory] = useState<StoreItemCategory | 'all'>('all');

  const filtered = useMemo(() =>
    category === 'all' ? STORE_CATALOG : STORE_CATALOG.filter(i => i.category === category),
    [category]
  );

  const isUnlocked = useCallback((id: string) => store.unlockedItems.includes(id), [store]);

  const isEquipped = useCallback((item: StoreItem) => {
    if (item.category === 'theme') return store.equippedTheme === item.id;
    if (item.category === 'border') return store.equippedBorder === item.id;
    if (item.category === 'confetti') return store.equippedConfetti === item.id;
    return false;
  }, [store]);

  const purchaseItem = useCallback((item: StoreItem) => {
    if (coins.balance < item.price) {
      toast.error(`Not enough coins! Need ${item.price - coins.balance} more.`);
      return;
    }
    onUpdateCoins({
      balance: coins.balance - item.price,
      transactions: [
        { id: `txn-${Date.now()}`, amount: -item.price, reason: `Purchased ${item.name}`, timestamp: new Date().toISOString() },
        ...coins.transactions,
      ].slice(0, 100),
    });
    onUpdateStore({
      ...store,
      unlockedItems: [...store.unlockedItems, item.id],
    });
    toast.success(`🎉 Unlocked ${item.name}!`);
  }, [coins, store, onUpdateCoins, onUpdateStore]);

  const equipItem = useCallback((item: StoreItem) => {
    const patch: Partial<StoreState> = {};
    if (item.category === 'theme') patch.equippedTheme = store.equippedTheme === item.id ? undefined : item.id;
    if (item.category === 'border') patch.equippedBorder = store.equippedBorder === item.id ? undefined : item.id;
    if (item.category === 'confetti') patch.equippedConfetti = store.equippedConfetti === item.id ? undefined : item.id;
    onUpdateStore({ ...store, ...patch });
    toast.success(isEquipped(item) ? 'Unequipped' : `Equipped ${item.name}`);
  }, [store, onUpdateStore, isEquipped]);

  return (
    <motion.div className="space-y-4" variants={stagger} initial="hidden" animate="show">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Go back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-black text-foreground flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" /> Coin Store
          </h2>
          <p className="text-[10px] text-muted-foreground">Spend your hard-earned study coins</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/20">
          <Coins className="w-4 h-4 text-primary" />
          <span className="text-sm font-black font-mono text-primary">{coins.balance}</span>
        </div>
      </motion.div>

      {/* Earn Info */}
      <motion.div variants={fadeUp}>
        <GlowCard glow="cyan" className="p-3">
          <p className="text-[11px] text-foreground">
            💡 <strong>Earn coins</strong> by studying! You get <span className="text-primary font-bold">1 coin per 30 minutes</span> of study time logged.
          </p>
        </GlowCard>
      </motion.div>

      {/* Category Filter */}
      <motion.div variants={fadeUp} className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border
              ${category === c.id ? 'bg-primary/15 text-primary border-primary/25' : 'bg-card/30 text-muted-foreground border-border/15 hover:bg-card/50'}`}>
            <span>{c.icon}</span> {c.label}
          </button>
        ))}
      </motion.div>

      {/* Items Grid */}
      <motion.div variants={stagger} className="grid grid-cols-2 gap-3">
        <AnimatePresence mode="sync">
          {filtered.map(item => {
            const unlocked = isUnlocked(item.id);
            const equipped = isEquipped(item);
            return (
              <motion.div key={item.id} variants={fadeUp}
                className={`glass-card p-4 flex flex-col items-center text-center gap-2 transition-all
                  ${equipped ? 'ring-2 ring-primary shadow-md shadow-primary/15' : ''}
                  ${unlocked ? 'opacity-100' : 'opacity-90'}`}>
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
                  <Button size="sm" onClick={() => purchaseItem(item)}
                    disabled={coins.balance < item.price}
                    className="w-full text-[10px] h-7 gap-1">
                    {coins.balance < item.price ? <Lock className="w-3 h-3" /> : <Coins className="w-3 h-3" />}
                    {item.price} coins
                  </Button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {/* Transaction History */}
      {coins.transactions.length > 0 && (
        <motion.div variants={fadeUp}>
          <GlowCard className="p-4" paper>
            <h3 className="text-xs font-bold text-foreground mb-3">📜 Recent Transactions</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {coins.transactions.slice(0, 10).map(t => (
                <div key={t.id} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground truncate flex-1">{t.reason}</span>
                  <span className={`font-mono font-bold ml-2 ${t.amount >= 0 ? 'text-secondary' : 'text-destructive'}`}>
                    {t.amount >= 0 ? '+' : ''}{t.amount}
                  </span>
                </div>
              ))}
            </div>
          </GlowCard>
        </motion.div>
      )}
    </motion.div>
  );
}
