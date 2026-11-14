/**
 * Mounted once at the app root (src/main.tsx). Opens the password-reset screen when
 *   • the sign-in screen's "Forgot password?" asks for it, or
 *   • the app was opened from a reset link in an e-mail (captured before React mounted).
 * The flow itself is lazy-loaded, so it costs nothing until it is needed.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import {
  OPEN_PASSWORD_RESET_EVENT, RECOVERY_INCOMING_EVENT, consumeIncomingRecovery, type ParsedRecovery,
} from '../../platform/cloud/passwordReset';

const PasswordResetFlow = lazy(() => import('./PasswordResetFlow'));

interface Seed { email?: string; incoming?: ParsedRecovery }

export default function PasswordResetHost() {
  const [seed, setSeed] = useState<Seed | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const email = (event as CustomEvent<{ email?: string }>).detail?.email;
      setSeed({ email });
    };
    const onIncoming = () => {
      const incoming = consumeIncomingRecovery();
      if (incoming) setSeed({ incoming });
    };
    window.addEventListener(OPEN_PASSWORD_RESET_EVENT, onOpen);
    window.addEventListener(RECOVERY_INCOMING_EVENT, onIncoming);
    onIncoming(); // the link was already captured before this component mounted
    return () => {
      window.removeEventListener(OPEN_PASSWORD_RESET_EVENT, onOpen);
      window.removeEventListener(RECOVERY_INCOMING_EVENT, onIncoming);
    };
  }, []);

  if (!seed) return null;
  return (
    <Suspense fallback={null}>
      <PasswordResetFlow seed={seed} onClose={() => setSeed(null)} />
    </Suspense>
  );
}
