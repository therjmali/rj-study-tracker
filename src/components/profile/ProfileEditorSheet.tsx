import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Check, Eye, EyeOff, Loader2, LogOut, Mail, ShieldCheck, Trash2, X } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';
import { fileToAvatarDataUrl, isImageAvatar } from '@/lib/avatar';
import type { User } from '../../types';
import { changePassword, deleteCloudAccount, useCloudAuth } from '../../platform/cloud/authStore';

export const COVER_GRADIENTS = [
  'from-primary/30 via-accent/20 to-secondary/30',
  'from-destructive/30 via-primary/20 to-accent/30',
  'from-secondary/30 via-primary/20 to-destructive/30',
  'from-accent/30 via-secondary/20 to-primary/30',
  'from-primary/40 via-primary/10 to-accent/30',
  'from-secondary/40 via-accent/15 to-primary/25',
];

const EMOJI_AVATARS = ['🎓', '🩺', '💉', '📚', '🧠', '⭐', '🔥', '🌿'];
const NAME_MIN = 2;
const NAME_MAX = 40;

interface Props {
  open: boolean;
  user: User;
  onClose: () => void;
  onSave: (user: User) => void;
  onLogout: () => void;
}

function nameError(name: string): string | null {
  const v = name.trim();
  if (v.length < NAME_MIN) return `Enter at least ${NAME_MIN} characters.`;
  if (v.length > NAME_MAX) return `Keep it under ${NAME_MAX} characters.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v)) return 'Remove special control characters.';
  return null;
}

function passwordProblems(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Mix letters and numbers.';
  return null;
}

export default function ProfileEditorSheet({ open, user, onClose, onSave, onLogout }: Props) {
  const cloud = useCloudAuth();
  const isCloud = cloud.status === 'signed-in' && !!cloud.user;
  const isGuest = user.email === 'guest@demo.local';

  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState(user.avatar);
  const [cover, setCover] = useState(user.coverGradient ?? '0');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Re-seed the form every time the sheet opens
  useEffect(() => {
    if (!open) return;
    setName(user.name); setAvatar(user.avatar); setCover(user.coverGradient ?? '0');
    setPwOpen(false); setCurPw(''); setNewPw(''); setNewPw2(''); setDeletePw('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dirty = useMemo(
    () => (!isGuest && name.trim() !== user.name) || avatar !== user.avatar || cover !== (user.coverGradient ?? '0'),
    [name, avatar, cover, user, isGuest],
  );
  const nameErr = isGuest ? null : nameError(name);
  const isPhoto = isImageAvatar(avatar);

  const requestClose = () => { if (dirty) setConfirmDiscard(true); else onClose(); };

  const save = () => {
    if (!isGuest && nameErr) { toast.error(nameErr); return; }
    onSave({ ...user, name: isGuest ? user.name : name.trim(), avatar, coverGradient: cover });
    toast.success('Profile saved');
    onClose();
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { setAvatar(await fileToAvatarDataUrl(file)); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Could not use that photo'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const submitPassword = async () => {
    const problem = passwordProblems(newPw);
    if (!curPw) { toast.error('Enter your current password.'); return; }
    if (problem) { toast.error(problem); return; }
    if (newPw !== newPw2) { toast.error('The new passwords do not match.'); return; }
    setPwBusy(true);
    try {
      await changePassword({ currentPassword: curPw, newPassword: newPw });
      toast.success('Password changed. Other devices will ask you to sign in again.');
      setPwOpen(false); setCurPw(''); setNewPw(''); setNewPw2('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the password');
    } finally { setPwBusy(false); }
  };

  const removeAccount = async () => {
    if (!deletePw) { toast.error('Enter your password to confirm.'); return; }
    setDeleteBusy(true);
    try {
      await deleteCloudAccount(deletePw);
      toast.success('Account deleted. Your data on this device is untouched.');
      setConfirmDelete(false);
      onClose();
      onLogout();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the account');
    } finally { setDeleteBusy(false); }
  };

  const strength = (() => {
    let s = 0;
    if (newPw.length >= 8) s++;
    if (/[A-Za-z]/.test(newPw) && /\d/.test(newPw)) s++;
    if (newPw.length >= 12 || /[^A-Za-z0-9]/.test(newPw)) s++;
    return s;
  })();

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={requestClose} />
            <motion.div role="dialog" aria-modal="true" aria-label="Edit profile"
              initial={{ y: 40, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 340 }}
              className="relative w-full sm:max-w-md max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-background border border-border/30 shadow-2xl overflow-hidden">
              {/* cover */}
              <div className={`h-20 shrink-0 bg-gradient-to-br ${COVER_GRADIENTS[parseInt(cover) % COVER_GRADIENTS.length] ?? COVER_GRADIENTS[0]} relative`}>
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-foreground/25 sm:hidden" />
                <button onClick={requestClose} aria-label="Close" className="absolute top-3 right-3 w-8 h-8 rounded-full bg-background/60 border border-border/20 flex items-center justify-center active:scale-90 transition-transform">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto px-4 pb-4 -mt-9">
                {/* avatar */}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
                <div className="flex items-end gap-3 mb-4">
                  <div className="relative">
                    <div className="w-[72px] h-[72px] rounded-2xl bg-primary/15 border-4 border-background flex items-center justify-center text-3xl shadow-lg overflow-hidden">
                      {uploading ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : isPhoto ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <span>{avatar}</span>}
                    </div>
                    <button onClick={() => fileRef.current?.click()} aria-label="Upload photo"
                      className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md border-2 border-background active:scale-90 transition-transform">
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="pb-1 min-w-0">
                    <p className="text-base font-black text-foreground truncate">{isGuest ? 'Guest User' : (name.trim() || 'Your name')}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{isGuest ? 'Guest mode' : user.email}</p>
                  </div>
                </div>

                {/* photo + emoji */}
                <section className="rounded-2xl border border-border/20 bg-card/30 p-3 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2">Photo</p>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {EMOJI_AVATARS.map(e => (
                      <button key={e} onClick={() => setAvatar(e)} aria-label={`Use ${e}`}
                        className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center border transition-all active:scale-90 ${avatar === e ? 'border-primary bg-primary/15' : 'border-border/25 bg-background/50'}`}>{e}</button>
                    ))}
                    <Button type="button" size="sm" variant="outline" className="h-9 text-xs" onClick={() => fileRef.current?.click()}>Upload photo</Button>
                    {isPhoto && <Button type="button" size="sm" variant="ghost" className="h-9 text-xs text-destructive" onClick={() => setAvatar('🎓')}>Remove</Button>}
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mt-3 mb-2">Cover colour</p>
                  <div className="flex gap-2">
                    {COVER_GRADIENTS.map((g, i) => (
                      <button key={i} onClick={() => setCover(String(i))} aria-label={`Cover ${i + 1}`}
                        className={`w-8 h-8 rounded-full bg-gradient-to-br ${g} border-2 transition-transform active:scale-90 ${parseInt(cover) % COVER_GRADIENTS.length === i ? 'border-foreground scale-110' : 'border-transparent'}`} />
                    ))}
                  </div>
                </section>

                {/* personal info */}
                <section className="rounded-2xl border border-border/20 bg-card/30 p-3 mb-3 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Personal information</p>
                  <div>
                    <label htmlFor="pe-name" className="text-[11px] font-semibold text-foreground">Display name</label>
                    <Input id="pe-name" value={isGuest ? 'Guest User' : name} onChange={e => setName(e.target.value)} maxLength={NAME_MAX + 10} autoComplete="name" disabled={isGuest}
                      className={`mt-1 h-10 ${nameErr ? 'border-destructive/60' : ''}`} />
                    <div className="flex justify-between mt-1">
                      <span className={`text-[10px] ${nameErr ? 'text-destructive' : 'text-muted-foreground'}`}>{isGuest ? 'Create a free account to set your name.' : (nameErr ?? 'Shown on your profile and on every device.')}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{name.trim().length}/{NAME_MAX}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5"><Mail className="w-3 h-3" /> Email</label>
                    <div className="mt-1 h-10 rounded-md border border-border/25 bg-muted/20 px-3 flex items-center justify-between gap-2">
                      <span className="text-sm text-foreground/80 truncate">{isGuest ? 'Guest mode — saved on this device only' : user.email}</span>
                      {isCloud && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center gap-1 shrink-0"><ShieldCheck className="w-3 h-3" /> ACCOUNT</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">The sign-in email can’t be edited here. To use another email, create a new account.</p>
                  </div>
                </section>

                {/* security */}
                {isCloud && (
                  <section className="rounded-2xl border border-border/20 bg-card/30 p-3 mb-3">
                    <button onClick={() => setPwOpen(o => !o)} aria-expanded={pwOpen} className="w-full flex items-center justify-between text-left">
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Password & security</span>
                      <span className="text-xs font-semibold text-primary">{pwOpen ? 'Hide' : 'Change password'}</span>
                    </button>
                    {pwOpen && (
                      <div className="mt-3 space-y-2.5">
                        <div className="relative">
                          <Input type={showPw ? 'text' : 'password'} placeholder="Current password" value={curPw} onChange={e => setCurPw(e.target.value)} autoComplete="current-password" className="h-10 pr-10" />
                          <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide passwords' : 'Show passwords'} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <Input type={showPw ? 'text' : 'password'} placeholder="New password (8+ characters, letters & numbers)" value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" className="h-10" />
                        <div className="flex gap-1" aria-hidden>
                          {[0, 1, 2].map(i => <span key={i} className={`h-1 flex-1 rounded-full ${i < strength ? (strength === 1 ? 'bg-destructive' : strength === 2 ? 'bg-amber-500' : 'bg-secondary') : 'bg-muted/50'}`} />)}
                        </div>
                        <Input type={showPw ? 'text' : 'password'} placeholder="Repeat new password" value={newPw2} onChange={e => setNewPw2(e.target.value)} autoComplete="new-password" className="h-10" />
                        <Button size="sm" onClick={submitPassword} disabled={pwBusy} className="w-full">{pwBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update password'}</Button>
                      </div>
                    )}
                  </section>
                )}

                {/* session */}
                <section className="rounded-2xl border border-border/20 bg-card/30 p-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Session</p>
                  <Button variant="outline" className="w-full h-11 text-destructive border-destructive/25 hover:bg-destructive/10" onClick={() => setConfirmLogout(true)}>
                    <LogOut className="w-4 h-4" /> {isGuest ? 'Exit guest mode' : 'Log out'}
                  </Button>
                  {isCloud && (
                    <button onClick={() => { setDeletePw(''); setConfirmDelete(true); }} className="w-full text-center text-[11px] font-semibold text-muted-foreground hover:text-destructive py-1.5 flex items-center justify-center gap-1.5 transition-colors">
                      <Trash2 className="w-3 h-3" /> Delete my account…
                    </button>
                  )}
                </section>
              </div>

              {/* footer */}
              <div className="shrink-0 border-t border-border/20 bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                <span className={`text-[11px] font-semibold flex-1 ${dirty ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>{dirty ? '● Unsaved changes' : 'All changes saved'}</span>
                <Button variant="ghost" onClick={requestClose}>{dirty ? 'Cancel' : 'Close'}</Button>
                <Button onClick={save} disabled={!dirty || !!nameErr}><Check className="w-4 h-4" /> Save</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Discard your changes?</AlertDialogTitle><AlertDialogDescription>Your edits to the profile haven’t been saved.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button variant="destructive" onClick={() => { setConfirmDiscard(false); onClose(); }}>Discard</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of RJ Tracker?</AlertDialogTitle>
            <AlertDialogDescription>
              {isCloud ? 'Your data stays safe in the cloud and on this device. Sign in again any time to continue syncing.' : 'Your data stays on this device.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <Button variant="destructive" onClick={() => { setConfirmLogout(false); onClose(); onLogout(); }}>Log out</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes your account and your cloud copy. Data already on this device is not touched. Enter your password to confirm.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input type="password" placeholder="Password" value={deletePw} onChange={e => setDeletePw(e.target.value)} autoComplete="current-password" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleteBusy} onClick={removeAccount}>{deleteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete account'}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
