import { recordMcqAnswer } from '@/platform/mcqStats';
import { useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Loader2, RotateCcw, Brain, ChevronRight } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { toast } from 'sonner';
import { generateMCQ, GenerateMCQOutputType } from '@/platform/api';
import { reportAiError } from '@/platform/ai';

type MCQ = GenerateMCQOutputType['questions'][0];

interface Props {
  topicName?: string;
  subjectName?: string;
  onClose?: () => void;
}

export default function MCQPractice({ topicName, subjectName, onClose }: Props) {
  const [questions, setQuestions] = useState<MCQ[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [topic, setTopic] = useState(topicName || '');
  const [subject, setSubject] = useState(subjectName || '');

  const generate = useCallback(async () => {
    if (!topic.trim()) {
      toast.error('Please enter a topic name');
      return;
    }
    setLoading(true);
    try {
      const result = await generateMCQ({
        topicName: topic.trim(),
        subjectName: subject.trim() || 'Nursing',
        count: 5,
      });
      setQuestions(result.questions);
      setCurrentIdx(0);
      setSelectedAnswer(null);
      setShowExplanation(false);
      setScore(0);
      setFinished(false);
    } catch (err) {
      reportAiError(err, toast, 'Failed to generate MCQs. Try again.');
    } finally {
      setLoading(false);
    }
  }, [topic, subject]);

  const handleAnswer = (idx: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(idx);
    setShowExplanation(true);
    const right = idx === questions[currentIdx].correctIndex;
    recordMcqAnswer(right);
    if (right) {
      setScore(s => s + 1);
    }
  };

  const nextQuestion = () => {
    if (currentIdx >= questions.length - 1) {
      setFinished(true);
      return;
    }
    setCurrentIdx(i => i + 1);
    setSelectedAnswer(null);
    setShowExplanation(false);
  };

  const restart = () => {
    setQuestions([]);
    setCurrentIdx(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setScore(0);
    setFinished(false);
  };

  // No questions yet — show generate form
  if (questions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">AI MCQ Generator</h2>
            <p className="text-[10px] text-muted-foreground">Practice with AI-generated questions</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs font-bold text-foreground/70">Topic *</Label>
            <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g., Normal Labor, Schizophrenia..."
              className="mt-1 h-10 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-bold text-foreground/70">Subject</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g., OBG, Mental Health Nursing..."
              className="mt-1 h-10 text-sm" />
          </div>
          <Button onClick={generate} disabled={loading} className="w-full h-11 text-sm font-bold gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {loading ? 'Generating...' : 'Generate 5 MCQs'}
          </Button>
        </div>
      </div>
    );
  }

  // Finished
  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="text-center space-y-4 py-6">
        <div className={`text-6xl ${pct >= 80 ? '' : pct >= 60 ? '' : ''}`}>
          {pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '📖'}
        </div>
        <h3 className="text-xl font-bold">Quiz Complete!</h3>
        <p className="text-3xl font-black text-primary">{score}/{questions.length}</p>
        <p className="text-sm text-muted-foreground">{pct}% — {pct >= 80 ? 'Excellent!' : pct >= 60 ? 'Good job!' : 'Keep studying!'}</p>
        <div className="flex gap-2 justify-center pt-2">
          <Button variant="outline" onClick={restart} className="gap-1.5">
            <RotateCcw className="w-4 h-4" /> New Quiz
          </Button>
          {onClose && <Button onClick={onClose}>Done</Button>}
        </div>
      </div>
    );
  }

  // Show current question
  const q = questions[currentIdx];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">Question {currentIdx + 1}/{questions.length}</span>
        <span className="text-xs font-bold text-primary">Score: {score}</span>
      </div>

      <div className="bg-card border border-border/20 rounded-xl p-4">
        <p className="text-sm font-semibold leading-relaxed">{q.question}</p>
      </div>

      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const isSelected = selectedAnswer === i;
          const isCorrect = i === q.correctIndex;
          const showResult = selectedAnswer !== null;

          let borderClass = 'border-border/20 hover:border-primary/30';
          if (showResult && isCorrect) borderClass = 'border-diff-easy bg-diff-easy/5';
          else if (showResult && isSelected && !isCorrect) borderClass = 'border-diff-hard bg-diff-hard/5';

          return (
            <button key={i} onClick={() => handleAnswer(i)} disabled={selectedAnswer !== null}
              className={`w-full text-left p-3 rounded-xl border text-sm transition-all flex items-center gap-2.5 ${borderClass} ${!showResult ? 'bg-card active:scale-[0.98]' : ''}`}>
              {showResult && isCorrect && <CheckCircle2 className="w-4 h-4 text-diff-easy flex-shrink-0" />}
              {showResult && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-diff-hard flex-shrink-0" />}
              {!showResult && <span className="w-4 h-4 rounded-full border-2 border-border/50 flex-shrink-0" />}
              <span>{opt}</span>
            </button>
          );
        })}
      </div>

      {showExplanation && (
        <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 text-sm">
          <p className="font-bold text-primary text-xs mb-1">💡 Explanation</p>
          <p className="text-foreground/80 text-xs leading-relaxed">{q.explanation}</p>
        </div>
      )}

      {selectedAnswer !== null && (
        <Button onClick={nextQuestion} className="w-full h-10 text-sm gap-1.5">
          {currentIdx >= questions.length - 1 ? 'See Results' : 'Next Question'}
          <ChevronRight className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
