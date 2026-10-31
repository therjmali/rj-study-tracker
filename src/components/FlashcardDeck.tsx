import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, RotateCcw, Loader2, Brain, Lightbulb, Check, X } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { toast } from 'sonner';
import { generateFlashcards, type GenerateFlashcardsOutputType } from '@/platform/api';
import { reportAiError } from '@/platform/ai';

type Flashcard = GenerateFlashcardsOutputType['flashcards'][0];

interface Props {
  topicName?: string;
  subjectName?: string;
  onClose?: () => void;
}

export default function FlashcardDeck({ topicName, subjectName, onClose }: Props) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [topic, setTopic] = useState(topicName || '');
  const [subject, setSubject] = useState(subjectName || '');
  const [score, setScore] = useState({ got: 0, missed: 0 });

  const generate = useCallback(async () => {
    if (!topic.trim()) { toast.error('Enter a topic name'); return; }
    setLoading(true);
    try {
      const result = await generateFlashcards({ topicName: topic.trim(), subjectName: subject.trim() || 'Nursing', count: 10 });
      setCards(result.flashcards);
      setIdx(0);
      setFlipped(false);
      setScore({ got: 0, missed: 0 });
    } catch (err) {
      reportAiError(err, toast, 'Failed to generate flashcards');
    }
    setLoading(false);
  }, [topic, subject]);

  const handleResponse = (gotIt: boolean) => {
    setScore(s => gotIt ? { ...s, got: s.got + 1 } : { ...s, missed: s.missed + 1 });
    if (idx < cards.length - 1) {
      setIdx(i => i + 1);
      setFlipped(false);
    } else {
      setFlipped(false);
    }
  };

  // Generate form
  if (cards.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">AI Flashcards</h2>
            <p className="text-[10px] text-muted-foreground">Generate study flashcards for any topic</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-bold text-foreground/70">Topic *</Label>
            <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g., Normal Labor, Apgar Score..."
              className="mt-1 h-10 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-bold text-foreground/70">Subject</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g., OBG, Pediatrics..."
              className="mt-1 h-10 text-sm" />
          </div>
          <Button onClick={generate} disabled={loading} className="w-full h-11 text-sm font-bold gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {loading ? 'Generating...' : 'Generate Flashcards'}
          </Button>
        </div>
      </div>
    );
  }

  // Finished all cards
  const isFinished = idx >= cards.length - 1 && (score.got + score.missed >= cards.length);
  if (isFinished) {
    const pct = Math.round((score.got / cards.length) * 100);
    return (
      <div className="text-center space-y-4 py-6">
        <span className="text-5xl">{pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '📚'}</span>
        <h3 className="text-xl font-bold">Flashcards Complete!</h3>
        <div className="flex justify-center gap-6">
          <div className="text-center">
            <p className="text-2xl font-black text-diff-easy">{score.got}</p>
            <p className="text-[10px] text-muted-foreground font-semibold">Got It</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-destructive">{score.missed}</p>
            <p className="text-[10px] text-muted-foreground font-semibold">Needs Work</p>
          </div>
        </div>
        <div className="flex gap-2 justify-center pt-2">
          <Button variant="outline" onClick={() => { setCards([]); setScore({ got: 0, missed: 0 }); }} className="gap-1.5">
            <RotateCcw className="w-4 h-4" /> New Deck
          </Button>
          {onClose && <Button onClick={onClose}>Done</Button>}
        </div>
      </div>
    );
  }

  const card = cards[idx];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">Card {idx + 1}/{cards.length}</span>
        <div className="flex gap-3 text-xs">
          <span className="text-diff-easy font-bold">✓ {score.got}</span>
          <span className="text-destructive font-bold">✗ {score.missed}</span>
        </div>
      </div>

      {/* Flashcard */}
      <div className="flex justify-center" onClick={() => setFlipped(!flipped)}>
        <div className="w-full max-w-sm h-64 cursor-pointer">
          <AnimatePresence mode="wait">
            <motion.div key={flipped ? 'back' : 'front'}
              initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: -90, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={`w-full h-full rounded-2xl border p-5 flex flex-col ${flipped ? 'bg-primary/5 border-primary/20' : 'bg-card border-border/20'}`}>
              {!flipped ? (
                <>
                  <span className="text-[10px] font-bold text-primary mb-3">Question</span>
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-center text-foreground font-semibold text-sm leading-relaxed">{card.front}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">Tap to reveal answer</p>
                </>
              ) : (
                <>
                  <span className="text-[10px] font-bold text-primary mb-2">Answer</span>
                  <div className="flex-1 overflow-y-auto">
                    <p className="text-sm text-foreground leading-relaxed">{card.back}</p>
                    {card.mnemonic && (
                      <div className="mt-3 rounded-lg bg-chart-4/10 border border-chart-4/20 p-2.5 flex items-start gap-2">
                        <Lightbulb className="w-3.5 h-3.5 text-chart-4 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-chart-4 font-medium">{card.mnemonic}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">Tap to flip back</p>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="icon" disabled={idx === 0} onClick={() => { setIdx(i => i - 1); setFlipped(false); }}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" className="gap-1 text-destructive"
          onClick={() => handleResponse(false)}>
          <X className="w-3.5 h-3.5" /> Needs Work
        </Button>
        <Button variant="default" size="sm" className="gap-1"
          onClick={() => handleResponse(true)}>
          <Check className="w-3.5 h-3.5" /> Got It
        </Button>
        <Button variant="outline" size="icon" disabled={idx >= cards.length - 1} onClick={() => { setIdx(i => i + 1); setFlipped(false); }}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
