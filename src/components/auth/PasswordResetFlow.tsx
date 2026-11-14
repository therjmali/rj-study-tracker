/**
 * Forgot-password screen.
 *
 *   request  → enter the account e-mail
 *   code     → type the 6-digit code from the e-mail (or just tap the link in it)
 *   password → choose a new password; we sign in with it straight away
 *   link-error / confirm-signout → the two ways a reset link can need a decision
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Check, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, Mail, MailCheck, RotateCw, TriangleAlert, X,
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { toast } from 'sonner';
import { useAuth } from '../../platform/auth';
import { getSession, setEphemeralSession } from '../../platform/cloud/session';
import {
  cancelRecovery, finishPasswordReset, getResendRemainingMs, holdRecovery, requestPasswordReset,
  revokeOtherSessions, verifyResetCode, type ParsedRecovery,
} from '../../platform/cloud/passwordReset';
import {
  isCodeComplete, isValidEmail, normalizeCode, passwordProblems, passwordScore,
} from '../../platform/cloud/recoveryLogic.mjs';

type Step = 'confirm-signout' | 'request' | 'code' | 'password' | 'link-error';

interface Props {
  seed: { email?: string; incoming?: ParsedRecovery };
  onClose: () => void;
}

const LABEL = 'block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1.5';
const FIELD = 'h-11 rounded-xl bg-card/40 border-border/25';
const TONES = ['bg-destructive', 'bg-destructive', 'bg-chart-4', 'bg-chart-4', 'bg-secondary', 'bg-secondary'];

const TITLES: Record<Step, { title: string; copy: string }> = {
  'confirm-signout': { title: 'Switch accounts?', copy: 'This device is signed in. Resetting a password signs it out first.' },
  request: { title: 'Forgot your password?', copy: 'Enter your account e-mail and we will send a 6-digit code and a reset link.' },
  code: { title: 'Check your e-mail', copy: 'Type the 6-digit code from the message — or tap the link inside it.' },
  password: { title: 'Choose a new password', copy: 'You will be signed in on this device and signed out everywhere else.' },
  'link-error': { title: 'Link not usable', copy: 'Reset links work once and expire after an hour.' },
};

export default function PasswordResetFlow({ seed, onClose }: Props) {
  const { signIn, logout } = useAuth();
  const incoming = seed.incoming;
  const hasLinkPayload = incoming?.kind === 'tokens' || incoming?.kind === 'token_hash';

  const [step, setStep] = useState<Step>(() => {
    if (incoming?.kind === 'error') return 'link-error';
    if (hasLinkPayload) return getSession() ? 'confirm-signout' : 'password';
    return 'request';
  });
  const [error, setError] = useState<string | null>(() => (incoming?.kind === 'error' ? incoming.message : null));
  const [email, setEmail] = useState(seed.email?.trim() ?? '');
  const [code, setCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(() => Math.ceil(getResendRemainingMs(seed.email ?? '') / 1000));
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // A reset link's payload is held in memory only; nothing is verified or stored until a password is submitted.
  useEffect(() => { if (incoming) holdRecovery(incoming); }, [incoming]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    setError(step === 'link-error' ? (incoming?.kind === 'error' ? incoming.message : null) : null);
    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [step, incoming]);

  const close = async () => {
    if (busy) return;
    await cancelRecovery();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') void close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const score = useMemo(() => passwordScore(newPw), [newPw]);
  const rules = [
    { ok: newPw.length >= 8, label: '8+ characters' },
    { ok: /[A-Za-z]/.test(newPw) && /\d/.test(newPw), label: 'Letters and a number' },
    { ok: newPw.length > 0 && newPw === confirmPw, label: 'Both match' },
  ];

  const run = async (task: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try { await task(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };

  const sendEmail = () => run(async () => {
    await requestPasswordReset(email);
    setCooldown(Math.ceil(getResendRemainingMs(email) / 1000));
    setCode('');
    setStep('code');
    toast.success('If that e-mail has an account, a reset message is on its way.');
  });

  const verifyCode = () => run(async () => {
    await verifyResetCode(email, code);
    setStep('password');
  });

  const setPassword = () => run(async () => {
    const problem = passwordProblems(newPw);
    if (problem) throw new Error(problem);
    if (newPw !== confirmPw) throw new Error('Those passwords do not match.');
    if (getSession()) await logout();          // never let a reset silently switch a signed-in account
    const { email: account } = await finishPasswordReset(newPw);
    setEphemeralSession(false);
    try {
      await signIn({ email: account, password: newPw });
    } catch {
      await cancelRecovery();
      toast.success('Password updated. Sign in with your new password.');
      onClose();
      return;
    }
    await revokeOtherSessions();
    toast.success('Password updated — you are signed in. Other devices will ask you to sign in again.');
    onClose();
  });

  const continueSignOut = () => run(async () => {
    await logout();
    setStep('password');
  });

  const heading = TITLES[step];
  const canSend = isValidEmail(email) && cooldown <= 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (step === 'request') { if (canSend) void sendEmail(); else if (cooldown > 0) setStep('code'); }
    else if (step === 'code') { if (isCodeComplete(code)) void verifyCode(); }
    else if (step === 'password') void setPassword();
    else if (step === 'confirm-signout') void continueSignOut();
  };

  return (
    <div className="fixed inset-0 z-[600] overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-labelledby="pw-reset-title">
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="glass-card overflow-hidden shadow-[0_24px_60px_-30px_hsl(var(--shadow-rgb)/0.45)]"
        >
          <div className="flex items-center gap-3 border-b border-border/10 bg-muted/15 px-5 py-3.5">
            {(step === 'code' || step === 'link-error') && (
              <button
                type="button"
                onClick={() => setStep('request')}
                aria-label="Back"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/30"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/15 bg-primary/10">
              {step === 'code' ? <MailCheck className="h-4 w-4 text-primary" />
                : step === 'link-error' ? <TriangleAlert className="h-4 w-4 text-destructive" />
                  : <KeyRound className="h-4 w-4 text-primary" />}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Account recovery</span>
            <button
              type="button"
              onClick={() => void close()}
              aria-label="Close"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4 p-5 sm:p-6" noValidate>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
                className="space-y-1"
              >
                <h2 id="pw-reset-title" className="font-heading text-lg text-foreground">{heading.title}</h2>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">{heading.copy}</p>
              </motion.div>
            </AnimatePresence>

            {step === 'request' && (
              <>
                <label className="block">
                  <span className={LABEL}>Email</span>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      ref={firstFieldRef}
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      inputMode="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      className={`${FIELD} pl-9`}
                    />
                  </div>
                </label>
                {cooldown > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    A message was sent a moment ago. You can request another in {cooldown} s —
                    {' '}<button type="button" onClick={() => setStep('code')} className="font-semibold text-primary hover:underline">enter the code you received</button>.
                  </p>
                )}
              </>
            )}

            {step === 'code' && (
              <>
                <p className="rounded-xl border border-border/20 bg-card/30 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
                  If <strong className="break-all text-foreground">{email.trim()}</strong> has an account, a message is on its way. It can take a minute — check Spam or Promotions too.
                </p>
                <label className="block">
                  <span className={LABEL}>6-digit code</span>
                  <Input
                    ref={firstFieldRef}
                    value={code}
                    onChange={e => setCode(normalizeCode(e.target.value))}
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={10}
                    aria-label="Reset code"
                    className={`${FIELD} text-center font-mono text-xl tracking-[0.4em]`}
                  />
                </label>
                <div className="flex items-center justify-between text-[11px] font-semibold">
                  <button type="button" onClick={() => setStep('request')} className="text-muted-foreground transition-colors hover:text-foreground">
                    Wrong e-mail?
                  </button>
                  <button
                    type="button"
                    disabled={busy || cooldown > 0}
                    onClick={() => void sendEmail()}
                    className="flex items-center gap-1.5 text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                  >
                    <RotateCw className="h-3 w-3" />
                    {cooldown > 0 ? `Resend in ${cooldown} s` : 'Resend e-mail'}
                  </button>
                </div>
              </>
            )}

            {step === 'password' && (
              <>
                <label className="block">
                  <span className={LABEL}>New password</span>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      ref={firstFieldRef}
                      type={show ? 'text' : 'password'}
                      value={newPw}
                      onChange={e => setNewPw(e.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      className={`${FIELD} pl-9 pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShow(v => !v)}
                      aria-label={show ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/30"
                    >
                      {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {newPw.length > 0 && (
                    <div className="mt-1.5">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4].map(i => (
                          <span key={i} className={`h-1 flex-1 rounded-full ${i < score.score ? TONES[Math.min(score.score, 5)] : 'bg-muted/40'}`} />
                        ))}
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">Strength: <strong className="text-foreground">{score.label}</strong></p>
                    </div>
                  )}
                </label>
                <label className="block">
                  <span className={LABEL}>Confirm password</span>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      type={show ? 'text' : 'password'}
                      value={confirmPw}
                      onChange={e => setConfirmPw(e.target.value)}
                      placeholder="Type it again"
                      autoComplete="new-password"
                      className={`${FIELD} pl-9`}
                    />
                  </div>
                </label>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {rules.map(rule => (
                    <li key={rule.label} className={`flex items-center gap-1.5 text-[10.5px] font-semibold ${rule.ok ? 'text-secondary' : 'text-muted-foreground'}`}>
                      <Check className={`h-3 w-3 ${rule.ok ? 'opacity-100' : 'opacity-30'}`} />
                      {rule.label}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {step === 'confirm-signout' && (
              <p className="rounded-xl border border-border/20 bg-card/30 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
                Your data stays on this device. After the reset you will be signed in with the account whose password you reset.
              </p>
            )}

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-[11.5px] font-semibold text-destructive">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0">{error}</span>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {step === 'link-error' ? (
              <Button type="button" onClick={() => setStep('request')} className="h-11 w-full gap-2 rounded-xl text-[13px] font-bold">
                <Mail className="h-4 w-4" /> Request a new e-mail
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={
                  busy
                  || (step === 'request' && !canSend && cooldown <= 0)
                  || (step === 'code' && !isCodeComplete(code))
                  || (step === 'password' && (!newPw || !confirmPw))
                }
                className="h-11 w-full gap-2 rounded-xl text-[13px] font-bold shadow-md shadow-primary/15"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {step === 'request' && (cooldown > 0 ? 'I already have a code' : 'Send reset code')}
                {step === 'code' && 'Verify code'}
                {step === 'password' && 'Set new password & sign in'}
                {step === 'confirm-signout' && 'Sign out and continue'}
              </Button>
            )}

            {(step === 'request' || step === 'confirm-signout') && (
              <button
                type="button"
                onClick={() => void close()}
                className="w-full text-center text-[11.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                {step === 'request' ? 'Back to sign in' : 'Cancel'}
              </button>
            )}
          </form>
        </motion.div>
      </div>
    </div>
  );
}
