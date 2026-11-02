/**
 * Premium sign-in / create-account screen.
 *
 * Replaces the old "no account" landing flow. Three ways in:
 *   1. Sign in to an existing account on any device.
 *   2. Create an account (data already on this device is uploaded on first sync).
 *   3. Continue offline as a guest — nothing is lost, nothing is uploaded.
 *
 * The server address lives behind "Sync server" so a normal student never has
 * to think about infrastructure, but a self-hosted install can be pointed at
 * any URL without rebuilding the APK.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight, Check, Cloud, CloudOff, Eye, EyeOff, Loader2,
  LockKeyhole, Mail, Server, ShieldCheck, Sparkles, Stethoscope, User, Wifi,
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { toast } from 'sonner';
import { getAppName } from '../../lib/brandConfig';
import { isCloudConfigured } from '../../platform/cloud/config';
import { useCloudAuth } from '../../platform/cloud/authStore';
import { useAuth, type AuthMode } from '../../platform/auth';
import { setEphemeralSession } from '../../platform/cloud/session';

interface Props {
  mode?: AuthMode;
  onClose?: () => void;
  onContinueOffline: () => void;
}

const TRUST_POINTS = [
  { icon: Cloud, title: 'Every device, same data', copy: 'Phone, tablet, laptop — one account, one syllabus.' },
  { icon: ShieldCheck, title: 'Your own server', copy: 'Nothing is sold, mined or shared. Host it yourself.' },
  { icon: Wifi, title: 'Offline is still first', copy: 'Study on a train; changes sync when you reconnect.' },
];

function passwordScore(password: string): { score: number; label: string; tone: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  const tones = ['bg-destructive', 'bg-destructive', 'bg-chart-4', 'bg-chart-4', 'bg-secondary', 'bg-secondary'];
  return { score, label: labels[Math.min(score, 5)], tone: tones[Math.min(score, 5)] };
}

export default function AuthScreen({ mode: initialMode = 'signin', onContinueOffline, onClose }: Props) {
  const { signIn, signUp } = useAuth();
  const cloud = useCloudAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);

  const emailRef = useRef<HTMLInputElement>(null);
  const score = useMemo(() => passwordScore(password), [password]);
  const isSignup = mode === 'signup';

  useEffect(() => {
    setError(null);
    if (mode === 'signup') setTimeout(() => emailRef.current?.focus(), 60);
  }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) { setError('Enter a valid email address.'); return; }
    if (isSignup && !name.trim()) { setError('What should we call you?'); return; }
    if (isSignup) {
      if (password.length < 8) { setError('Use at least 8 characters for your password.'); return; }
      if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) { setError('Include at least one letter and one number.'); return; }
      if (password !== confirm) { setError('Those passwords do not match.'); return; }
    }
    if (!password) { setError('Enter your password.'); return; }
    if (!cloud.configured) {
      setError('Cloud sign-in is not set up in this build yet. You can keep studying offline as a guest.');
      return;
    }

    setBusy(true);
    try {
      // Decide storage before the session is written (localStorage vs this tab only).
      setEphemeralSession(!remember);
      if (isSignup) {
        await signUp({ email: cleanEmail, password, name: name.trim() });
        toast.success('🎉 Account created — your device data is being uploaded');
      } else {
        await signIn({ email: cleanEmail, password });
        toast.success('Welcome back');
      }
      onClose?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden z-[200]">
      {/* Editorial background */}
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-24 w-[55vw] h-[55vw] max-w-[560px] max-h-[560px] rounded-full bg-primary/8 blur-[130px]" />
        <div className="absolute -bottom-40 -right-24 w-[50vw] h-[50vw] max-w-[520px] max-h-[520px] rounded-full bg-secondary/8 blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-8 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:py-10">

        {/* ── Brand / story ─────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8 lg:mb-0"
        >
          <div className="flex items-center gap-2.5 mb-7">
            <div className="w-10 h-10 rounded-[13px] bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Stethoscope className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-[17px] text-foreground">{getAppName(null)}</span>
              <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-black tracking-[0.12em] border border-primary/15">PRO</span>
            </div>
            {onClose && (
              <button onClick={onClose} className="ml-auto text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
                Close
              </button>
            )}
          </div>

          <p className="sec-eyebrow mb-3">Sync that respects your privacy</p>
          <h1 className="text-[30px] sm:text-[38px] leading-[1.06] text-foreground mb-3">
            One syllabus.<br />
            <em>Every device.</em>
          </h1>
          <p className="text-[13px] sm:text-sm text-muted-foreground leading-relaxed max-w-md mb-6">
            Sign in once and your subjects, sessions, revision rounds and streaks follow you —
            phone, tablet or laptop. Everything is still saved on each device first, so studying
            never waits for a network.
          </p>

          <div className="hidden sm:grid gap-2.5 max-w-md">
            {TRUST_POINTS.map((point, i) => (
              <motion.div
                key={point.title}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.07, duration: 0.4 }}
                className="flex items-start gap-3 rounded-2xl border border-border/15 bg-card/25 px-3.5 py-3"
              >
                <span className="w-8 h-8 rounded-xl bg-primary/8 border border-primary/12 flex items-center justify-center shrink-0">
                  <point.icon className="w-3.5 h-3.5 text-primary" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-bold text-foreground">{point.title}</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">{point.copy}</span>
                </span>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ── Auth card ─────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 22, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md mx-auto lg:mx-0"
        >
          <div className="glass-card overflow-hidden shadow-[0_24px_60px_-30px_hsl(var(--shadow-rgb)/0.45)]">
            {/* Mode tabs */}
            <div className="flex p-1.5 gap-1.5 bg-muted/15 border-b border-border/10">
              {(['signin', 'signup'] as AuthMode[]).map(tab => {
                const active = mode === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMode(tab)}
                    className={`relative flex-1 h-9 rounded-xl text-[12px] font-bold transition-colors ${active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {active && (
                      <motion.span
                        layoutId="auth-tab"
                        className="absolute inset-0 rounded-xl bg-primary shadow-sm shadow-primary/25"
                        transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                      />
                    )}
                    <span className="relative">{tab === 'signin' ? 'Sign in' : 'Create account'}</span>
                  </button>
                );
              })}
            </div>

            {!cloud.configured && (
              <div className="mx-5 mt-5 flex items-start gap-2.5 rounded-xl border border-chart-4/30 bg-chart-4/8 px-3.5 py-3">
                <Server className="w-3.5 h-3.5 mt-0.5 shrink-0 text-chart-4" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-bold text-foreground">Cloud sign-in is not set up in this build</p>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
                    You can keep studying offline as a guest. Add the Supabase URL and key at build time to enable accounts.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={submit} className="p-5 sm:p-6 space-y-3.5" noValidate>
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-1"
                >
                  <h2 className="font-heading text-lg text-foreground">
                    {isSignup ? 'Create your account' : 'Welcome back'}
                  </h2>
                  <p className="text-[11.5px] text-muted-foreground">
                    {isSignup
                      ? 'Anything already on this device is uploaded once and kept in sync.'
                      : 'Your plans, progress and streaks are waiting.'}
                  </p>
                </motion.div>
              </AnimatePresence>

              {isSignup && (
                <label className="block">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Your name</span>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                    <Input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Riya Sharma"
                      autoComplete="name"
                      className="h-11 pl-9 rounded-xl bg-card/40 border-border/25"
                    />
                  </div>
                </label>
              )}

              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Email</span>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                  <Input
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="h-11 pl-9 rounded-xl bg-card/40 border-border/25"
                  />
                </div>
              </label>

              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Password</span>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={isSignup ? 'At least 8 characters' : 'Your password'}
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    className="h-11 pl-9 pr-10 rounded-xl bg-card/40 border-border/25"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/30 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {isSignup && password.length > 0 && (
                  <div className="mt-1.5">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4].map(i => (
                        <span key={i} className={`h-1 flex-1 rounded-full ${i < score.score ? score.tone : 'bg-muted/40'}`} />
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Password strength: <strong className="text-foreground">{score.label}</strong></p>
                  </div>
                )}
              </label>

              {isSignup && (
                <label className="block">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Confirm password</span>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Type it again"
                      autoComplete="new-password"
                      className="h-11 pl-9 rounded-xl bg-card/40 border-border/25"
                    />
                    {confirm.length > 0 && confirm === password && (
                      <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
                    )}
                  </div>
                </label>
              )}

              <div className="flex items-center justify-between pt-0.5">
                <button
                  type="button"
                  onClick={() => setRemember(v => !v)}
                  className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  aria-pressed={remember}
                >
                  <span className={`w-4 h-4 rounded-[5px] border flex items-center justify-center ${remember ? 'bg-primary border-primary' : 'border-border/50 bg-card/40'}`}>
                    {remember && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </span>
                  Keep me signed in
                </button>
                {!isSignup && (
                  <button
                    type="button"
                    onClick={() => toast.info('Ask your sync-server admin to reset it with: node server/reset-password.mjs <email>')}
                    className="text-[11px] font-semibold text-primary hover:underline underline-offset-2"
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              <AnimatePresence>
                {(error || cloud.error) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-[11.5px] font-semibold text-destructive">
                      <CloudOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {error || cloud.error}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                type="submit"
                disabled={busy || cloud.busy}
                className="w-full h-11 rounded-xl text-[13px] font-bold gap-2 shadow-md shadow-primary/15 hover:shadow-lg hover:shadow-primary/20 transition-all"
              >
                {(busy || cloud.busy) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isSignup ? 'Create account & sync' : 'Sign in'}
                {!(busy || cloud.busy) && <ArrowRight className="w-4 h-4 ml-0.5" />}
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-x-0 top-1/2 h-px bg-border/25" />
                <span className="relative block w-fit mx-auto px-2 bg-card text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70" style={{ backgroundColor: 'hsl(var(--glass-bg))' }}>
                  or
                </span>
              </div>

              <button
                type="button"
                onClick={onContinueOffline}
                className="w-full h-11 rounded-xl border border-border/30 bg-card/30 text-[12px] font-semibold text-foreground hover:bg-card/60 hover:border-border/50 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
              >
                <CloudOff className="w-4 h-4 text-muted-foreground" />
                Continue offline on this device
              </button>

              <p className="text-center text-[10px] leading-relaxed text-muted-foreground/80 pt-0.5">
                Guest mode keeps everything on this device. You can create an account later and
                upload it without losing a single topic.
              </p>
            </form>

          </div>

          <p className="mt-4 text-center text-[10px] text-muted-foreground/60 leading-relaxed">
            Encrypted in transit (HTTPS) · No analytics · No third-party trackers
          </p>
        </motion.section>
      </div>
    </div>
  );
}
