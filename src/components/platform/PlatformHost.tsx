import { useEffect, useState, type FormEvent } from 'react';
import { GraduationCap, Lock } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import BottomSheet from '../shared/BottomSheet';
import AiDevicePanel from './AiDevicePanel';
import PlatformRuntime from './PlatformRuntime';
import { OPEN_SETTINGS_EVENT } from '@/platform/ai';
import { OPEN_PROFILE_SETUP_EVENT, getStoredProfile, saveProfile } from '@/platform/auth';

/**
 * Mounted once at the app root. Owns the two platform-level dialogs that replace
 * the hosted sign-in and the hosted AI quota: profile setup and AI / device settings.
 */
export default function PlatformHost() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'ai' | 'device'>('ai');
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const onSettings = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: 'ai' | 'device' }>).detail?.tab;
      setSettingsTab(tab === 'device' ? 'device' : 'ai');
      setSettingsOpen(true);
    };
    const onProfile = () => setProfileOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, onSettings);
    window.addEventListener(OPEN_PROFILE_SETUP_EVENT, onProfile);
    return () => {
      window.removeEventListener(OPEN_SETTINGS_EVENT, onSettings);
      window.removeEventListener(OPEN_PROFILE_SETUP_EVENT, onProfile);
    };
  }, []);

  return (
    <>
      <BottomSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="AI & device" zIndex={120}>
        <div className="px-4 pb-6 pt-1">
          <AiDevicePanel initialTab={settingsTab} />
        </div>
      </BottomSheet>
      <ProfileSetup open={profileOpen} onClose={() => setProfileOpen(false)} />
      <PlatformRuntime />
    </>
  );
}

function ProfileSetup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const p = getStoredProfile();
    setFirst(p?.firstName ?? '');
    setLast(p?.lastName ?? '');
    setEmail(p?.email ?? '');
    setError('');
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!first.trim()) { setError('Please enter your first name'); return; }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) { setError('That email does not look right'); return; }
    saveProfile({ firstName: first, lastName: last, email });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Welcome" zIndex={130}>
      <form onSubmit={submit} className="px-5 pb-7 pt-1 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-md">
            <GraduationCap className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-heading text-xl text-foreground leading-tight">Set up your profile</h2>
            <p className="text-[12px] text-muted-foreground">Shown on your reports. Saved to your account (and this device) so every device agrees.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Input
            autoFocus value={first} onChange={e => setFirst(e.target.value)} placeholder="First name" autoComplete="given-name"
            className="h-11 rounded-xl bg-card/50 border-border/30" aria-label="First name"
          />
          <Input
            value={last} onChange={e => setLast(e.target.value)} placeholder="Last name (optional)" autoComplete="family-name"
            className="h-11 rounded-xl bg-card/50 border-border/30" aria-label="Last name"
          />
        </div>
        <Input
          type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional, shown on your reports)" autoComplete="email"
          className="h-11 rounded-xl bg-card/50 border-border/30" aria-label="Email"
        />
        {error && <p role="alert" className="text-[12px] font-semibold text-destructive">{error}</p>}

        <Button type="submit" className="w-full h-12 rounded-2xl text-sm font-bold">Start studying</Button>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="w-3 h-3" /> Private by design — your data stays on this device.
        </p>
      </form>
    </BottomSheet>
  );
}
