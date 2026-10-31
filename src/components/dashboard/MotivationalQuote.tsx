import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quote, RefreshCw, Sparkles } from 'lucide-react';
import type { CustomQuote } from '../../types';
import { getAllActiveQuotes } from '../../lib/quotes';

interface Props {
  customQuotes?: CustomQuote[];
  hiddenBuiltInQuotes?: string[];
  builtInQuoteOverrides?: Record<number, Partial<CustomQuote> & { hidden?: boolean }>;
}

export default function MotivationalQuote({ customQuotes = [], hiddenBuiltInQuotes = [], builtInQuoteOverrides }: Props) {
  const allQuotes = useMemo(() =>
    getAllActiveQuotes(customQuotes, hiddenBuiltInQuotes, builtInQuoteOverrides),
  [customQuotes, hiddenBuiltInQuotes, builtInQuoteOverrides]);

  const [index, setIndex] = useState(() => {
    const today = new Date();
    return (today.getFullYear() * 366 + today.getMonth() * 31 + today.getDate()) % Math.max(1, allQuotes.length);
  });

  const quote = allQuotes[index % Math.max(1, allQuotes.length)];

  const shuffle = () => {
    setIndex(prev => (prev + 1) % Math.max(1, allQuotes.length));
  };

  if (!quote) return null;

  const hasBg = !!quote.backgroundUrl;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative glass-card overflow-hidden"
      style={hasBg ? { background: 'none' } : undefined}
    >
      {hasBg && (
        <>
          <img src={quote.backgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />
        </>
      )}
      {!hasBg && (
        <div className="absolute top-2 left-3 opacity-[0.06]">
          <Quote className="w-12 h-12 text-primary" />
        </div>
      )}

      <div className={`px-5 py-4 relative flex items-start gap-3 ${hasBg ? 'text-white' : ''}`}>
        {quote.imageUrl && (
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/20 shrink-0 mt-0.5">
            <img src={quote.imageUrl} alt={quote.author} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              <p className={`text-[13px] leading-relaxed font-medium italic ${hasBg ? 'text-white/95' : 'text-foreground'}`}>
                &ldquo;{quote.text}&rdquo;
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <p className={`text-[10px] font-semibold ${hasBg ? 'text-white/70' : 'text-muted-foreground'}`}>
                  — {quote.author}
                </p>
                {quote.isCustom && (
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-chart-4/15 text-chart-4 font-bold border border-chart-4/20 flex items-center gap-0.5">
                    <Sparkles className="w-2 h-2" /> yours
                  </span>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          onClick={shuffle}
          className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-colors active:scale-90 ${hasBg ? 'bg-white/20 hover:bg-white/30' : 'bg-muted/40 hover:bg-muted/60'}`}
          aria-label="New quote"
        >
          <RefreshCw className={`w-3 h-3 ${hasBg ? 'text-white/70' : 'text-muted-foreground'}`} />
        </button>
      </div>
    </motion.div>
  );
}
