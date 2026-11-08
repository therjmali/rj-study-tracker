import { useState, useRef, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { Send, Bot, User, Trash2, Sparkles, Loader2, Brain, Zap, Lock, LogIn, KeyRound, WifiOff } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Markdown } from '@project/components/markdown';
import { toast } from 'sonner';
import { studyChat } from '@/platform/api';
import { PROVIDERS, getAiSettings, getLastAiRun, isAiConfigured, reportAiError, subscribeAiRun, subscribeAiSettings } from '@/platform/ai';
import { useConnectivity } from '@/platform/connectivity';
import BottomSheet from './shared/BottomSheet';
import AiKeyManager from './platform/AiKeyManager';
import { collectTutorTelemetry } from '../lib/tutorTelemetry';
import { NA } from '../lib/tutorTelemetryLogic.mjs';
import { useAuth } from '@/platform/auth';
import { motion } from 'framer-motion';
import type { Subject, DailyLog, UserSettings, ExamConfig, DbStudySession } from '../types';
import { buildChatContext } from '../lib/chatContext';
import { getLocalDateStr } from '../lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  subjects?: Subject[];
  dailyLogs?: DailyLog[];
  settings?: UserSettings;
  exams?: ExamConfig[];
  userName?: string;
  dbSessions?: DbStudySession[];
}

const SUGGESTED_QUESTIONS = [
  "Am I on pace to finish my syllabus before the exam?",
  "What should I study next and for how long today?",
  "Explain the stages of labor and nursing management",
  "What are the types of schizophrenia and their symptoms?",
  "Describe Apgar scoring system with mnemonics",
  "What is the nursing management of pre-eclampsia?",
  "Explain Maslow's hierarchy in nursing context",
  "What are the side effects of lithium therapy?",
];

function GuestLockScreen() {
  const { loginWithRedirect } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-14rem)] text-center px-6">
      {/* Animated glow background */}
      <div className="relative mb-6">
        <div className="absolute inset-0 w-24 h-24 rounded-3xl bg-primary/20 blur-2xl animate-pulse" />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 flex items-center justify-center backdrop-blur-sm"
        >
          <Lock className="w-8 h-8 text-primary" />
        </motion.div>
      </div>

      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="text-xl font-bold text-foreground mb-2">
          Unlock NurseBot AI
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mb-2">
          Get instant answers to nursing questions, AI-generated MCQs, personalized study advice, and exam tips — all powered by Claude AI.
        </p>
      </motion.div>

      {/* Feature pills */}
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap justify-center gap-2 mb-6"
      >
        {['🩺 Clinical Concepts', '💊 Drug Info', '🧠 Mnemonics', '📝 Exam Tips', '🤖 AI Tutor'].map(f => (
          <span key={f} className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-card border border-border/30 text-muted-foreground">
            {f}
          </span>
        ))}
      </motion.div>

      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="space-y-3 w-full max-w-xs"
      >
        <Button
          onClick={() => loginWithRedirect()}
          className="w-full h-12 text-sm font-bold rounded-xl gap-2 shadow-md"
        >
          <LogIn className="w-4 h-4" /> Create Free Account
        </Button>
        <Button
          variant="outline"
          onClick={() => loginWithRedirect()}
          className="w-full h-10 text-xs font-semibold rounded-xl"
        >
          Already have an account? Sign In
        </Button>
      </motion.div>

      <p className="text-[10px] text-muted-foreground/50 mt-6">
        Free • No credit card • Instant access
      </p>
    </div>
  );
}

export default function AIChat({ subjects = [], dailyLogs = [], settings, exams, userName, dbSessions }: Props) {
  const { user: authUser } = useAuth();
  const isGuest = !authUser;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [keysOpen, setKeysOpen] = useState(false);
  const conn = useConnectivity();
  const ai = useSyncExternalStore(subscribeAiSettings, getAiSettings, getAiSettings);
  const run = useSyncExternalStore(subscribeAiRun, getLastAiRun, getLastAiRun);
  const configured = isAiConfigured(ai);
  const activeMeta = PROVIDERS[ai.provider];
  const shownProvider = run && configured ? PROVIDERS[run.provider] : activeMeta;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const progressContext = useMemo(() => {
    return buildChatContext(subjects, dailyLogs, settings, exams, userName, dbSessions);
  }, [subjects, dailyLogs, settings, exams, userName, dbSessions]);

  // The exact numbers the AI receives — shown so the student can see what its answers are grounded in.
  const telemetry = useMemo(
    () => collectTutorTelemetry(subjects, dailyLogs, exams, dbSessions),
    [subjects, dailyLogs, exams, dbSessions, messages.length], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const dynamicSuggestions = useMemo(() => {
    const personalized: string[] = [];
    // Add weak topics (hard/important uncompleted)
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (!t.completed && t.difficulty === 'Hard' && (t.norcetRelevance === 'High' || t.important)) {
        personalized.push(`Explain "${t.name}" in ${s.shortName} with key points for NORCET`);
      }
    })));
    // Add lowest-completion subject suggestion
    const subjectPcts = subjects.map(s => {
      let d = 0, t = 0;
      s.units.forEach(u => u.subTopics.forEach(tp => { t++; if (tp.completed) d++; }));
      return { name: s.shortName, pct: t > 0 ? d / t : 1 };
    }).sort((a, b) => a.pct - b.pct);
    if (subjectPcts.length > 0 && subjectPcts[0].pct < 0.8) {
      personalized.push(`What are the most important topics I should cover in ${subjectPcts[0].name}?`);
    }
    // Add SRS review suggestion
    const todayStr = getLocalDateStr();
    let srsDue = 0;
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      if (t.completed && t.srsDueDate && t.srsDueDate <= todayStr) srsDue++;
    })));
    if (srsDue > 0) {
      personalized.push(`I have ${srsDue} topics due for SRS review. Help me revise them.`);
    }
    const shuffled = personalized.sort(() => Math.random() - 0.5).slice(0, 3);
    return [...shuffled, ...SUGGESTED_QUESTIONS].slice(0, 6);
  }, [subjects]);

  const handleSend = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isStreaming) return;

    if (!isAiConfigured()) {
      toast.info('Add an AI key to start chatting.');
      setKeysOpen(true);
      return;
    }
    const userMsg: ChatMessage = { role: 'user', content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');

    try {
      const stream = studyChat({
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        topicContext: progressContext,
        telemetry: collectTutorTelemetry(subjects, dailyLogs, exams, dbSessions),
      });

      let fullText = '';
      for await (const chunk of stream) {
        fullText += chunk;
        setStreamingText(fullText);
      }

      setMessages(prev => [...prev, { role: 'assistant', content: fullText }]);
      setStreamingText('');
    } catch (err) {
      reportAiError(err, toast, 'Failed to get response. Please try again.');
    } finally {
      setIsStreaming(false);
    }
  }, [input, messages, isStreaming, progressContext, subjects, dailyLogs, exams, dbSessions]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setStreamingText('');
  };

  // Guest mode — show lock screen
  if (isGuest) {
    return (
      <div className="flex flex-col h-[calc(100vh-10rem)] lg:h-[calc(100vh-6rem)]">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">NurseBot AI</h2>
            <p className="text-[10px] text-muted-foreground">Sign in required</p>
          </div>
        </div>
        <GuestLockScreen />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] lg:h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-black leading-tight">AI Tutor</h2>
            <button
              type="button" onClick={() => setKeysOpen(true)}
              className="flex max-w-full items-center gap-1.5 text-[10px] font-semibold text-muted-foreground"
              aria-label="Open AI settings"
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${!configured ? 'bg-red-500' : conn.status === 'online' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="truncate">
                {!configured ? 'No API key — tap to set up'
                  : conn.status !== 'online' ? 'Offline — AI needs internet'
                  : `${shownProvider.short}${run?.fellBackFrom ? ` (switched from ${PROVIDERS[run.fellBackFrom].short})` : ''} · analytical engine`}
              </span>
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat} className="h-9 gap-1 px-2 text-xs text-muted-foreground">
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
          <button
            type="button" onClick={() => setKeysOpen(true)} aria-label="AI keys and providers"
            className={`relative flex h-10 w-10 items-center justify-center rounded-2xl border transition-transform active:scale-95 ${configured ? 'border-border/40 bg-card text-foreground' : 'border-red-500/40 bg-red-500/10 text-red-500'}`}
          >
            <KeyRound className="h-[18px] w-[18px]" />
            {!configured && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-background bg-red-500" />}
          </button>
        </div>
      </div>

      {/* Live telemetry the engine is grounded in */}
      <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Data the AI uses">
        {[
          { k: 'unit', t: telemetry.currentUnit === NA ? 'Unit —' : telemetry.currentUnit },
          { k: 'pct', t: telemetry.completionRate === NA ? 'Syllabus —' : `${telemetry.completionRate}% done` },
          { k: 'exam', t: telemetry.daysRemaining === NA ? 'No exam set' : `${telemetry.daysRemaining} d to exam` },
          { k: 'pace', t: telemetry.derived.paceVerdict === NA ? 'Pace —' : telemetry.derived.paceVerdict.startsWith('BEHIND') ? 'Behind pace' : telemetry.derived.paceVerdict === 'ON_TRACK' ? 'On track' : telemetry.derived.paceVerdict.replace('_', ' ').toLowerCase() },
          { k: 'mcq', t: telemetry.totalMcqs === 0 ? 'MCQ log empty' : `MCQ ${telemetry.totalMcqs} · ${telemetry.accuracyRate}%` },
        ].map(c => (
          <span key={c.k} className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${c.k === 'pace' && c.t === 'Behind pace' ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300' : 'border-border/40 bg-card/70 text-muted-foreground'}`}>{c.t}</span>
        ))}
      </div>

      {!configured && messages.length === 0 && (
        <button type="button" onClick={() => setKeysOpen(true)} className="mb-2 flex items-center gap-3 rounded-[22px] border border-primary/30 bg-primary/10 p-3 text-left active:scale-[0.99]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><KeyRound className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-black text-foreground">Connect an AI partner</span>
            <span className="block text-[11px] text-muted-foreground">Gemini, Groq, GPT, Claude or Cohere — most have a free tier. Your key stays on this phone.</span>
          </span>
        </button>
      )}
      {configured && conn.status !== 'online' && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          <WifiOff className="h-3.5 w-3.5 shrink-0" /> You're offline. The AI needs internet — your notes and tracker still work.
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-2 min-h-0">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-bold mb-1">Ask NurseBot anything!</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Get instant answers to nursing questions, exam tips, drug info, and clinical concepts.
              {progressContext && ' NurseBot knows your current progress and will tailor advice accordingly.'}
            </p>

            <div className="flex flex-wrap justify-center gap-2 mb-4">
              <button onClick={() => handleSend('What should I study today based on my progress?')}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors font-semibold">
                <Zap className="w-3 h-3" /> What to study today?
              </button>
              <button onClick={() => handleSend('Quiz me on a random hard topic from my pending list')}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors font-semibold">
                <Brain className="w-3 h-3" /> Quiz me!
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {dynamicSuggestions.map((q, i) => (
                <button key={i} onClick={() => handleSend(q)}
                  className="text-left text-xs p-3 rounded-xl bg-card border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-colors">
                  <span className="text-primary mr-1">💡</span> {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {isStreaming && streamingText && (
          <MessageBubble message={{ role: 'assistant', content: streamingText }} isStreaming />
        )}

        {isStreaming && !streamingText && (
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-card border border-border/20 rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-border/20 pt-3 mt-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a nursing question..."
            rows={1}
            className="flex-1 resize-none bg-card border border-border/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 placeholder:text-muted-foreground/50 max-h-32"
            style={{ minHeight: 42 }}
          />
          <Button onClick={() => handleSend()} disabled={!input.trim() || isStreaming}
            size="icon" className="w-10 h-10 rounded-xl flex-shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <BottomSheet open={keysOpen} onClose={() => setKeysOpen(false)} title="AI partners & keys" zIndex={120}>
        <div className="px-4 pb-6 pt-1"><AiKeyManager /></div>
      </BottomSheet>
    </div>
  );
}

function MessageBubble({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-primary/10'}`}>
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5 text-primary" />}
      </div>
      <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${isUser ? 'bg-primary text-primary-foreground' : 'bg-card border border-border/20'}`}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-headings:my-2">
            <Markdown>{message.content}</Markdown>
          </div>
        )}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 rounded-sm" />
        )}
      </div>
    </div>
  );
}
