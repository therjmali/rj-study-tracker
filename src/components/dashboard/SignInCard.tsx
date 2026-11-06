/**
 * Dashboard invitation for guests: sign in (or create an account) to sync across devices.
 * Opens the sign-in window; never blocks anything. "Dismiss" hides it for a week.
 */
import { useState } from 'react';
import { CloudUpload, X } from 'lucide-react';
import { isCloudConfigured } from '../../platform/cloud/config';
import { useCloudAuth } from '../../platform/cloud/authStore';

export const SIGNIN_CARD_KEY = 'rj_signin_card_dismissed';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function readDismissed(): number {
  try { return Number(localStorage.getItem(SIGNIN_CARD_KEY) || 0); } catch { return 0; }
}

export function shouldShowSignInCard(dismissedAt: number): boolean {
  return Date.now() - dismissedAt > ONE_WEEK_MS;
}

export default function SignInCard() {
  const auth = useCloudAuth();
  const [dismissedAt, setDismissedAt] = useState(readDismissed);

  if (!isCloudConfigured() || auth.status === 'loading' || auth.status === 'signed-in' || !shouldShowSignInCard(dismissedAt)) {
    return null;
  }

  const dismiss = () => {
    const now = Date.now();
    try { localStorage.setItem(SIGNIN_CARD_KEY, String(now)); } catch { /* ignore */ }
    setDismissedAt(now);
  };

  const openAuth = (mode: 'signin' | 'signup') => {
    window.dispatchEvent(new CustomEvent('rj:open-auth', { detail: { mode } }));
  };

  return (
    <section aria-label="Sign in to sync" className="relative flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] px-4 py-3 mb-3 animate-slide-up">
      <span className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
        <CloudUpload className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0 pr-5">
        <p className="text-sm font-black text-foreground leading-tight">Sign in to sync your progress</p>
        <p className="text-[11px] text-foreground/50 mt-0.5 leading-snug">
          Keep your study logs, topics and flashcards in sync across all your devices. Works fully offline either way.
        </p>
        <div className="flex flex-wrap gap-2 mt-2.5">
          <button
            type="button"
            onClick={() => openAuth('signin')}
            className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-bold active:scale-95 transition-all shadow-sm"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => openAuth('signup')}
            className="h-8 px-4 rounded-lg border border-border bg-foreground/[0.04] text-foreground/75 text-xs font-bold hover:bg-foreground/[0.08] active:scale-95 transition-all"
          >
            Create account
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide for a week"
        className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-foreground/35 hover:text-foreground/70 hover:bg-foreground/[0.06] transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </section>
  );
}
