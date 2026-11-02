/**
 * Compact cloud card for Settings → Cloud & sync.
 * The full experience lives in the Sync Center; this is the doorway.
 */
import { Cloud, LogOut, RefreshCw, ShieldCheck, Smartphone, Sparkles, WifiOff } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '../../platform/auth';
import { syncNow, useSyncState } from '../../platform/cloud/syncEngine';

export function openSyncCenter(): void {
  window.dispatchEvent(new Event('rj:open-sync-center'));
}

export function openAccountScreen(): void {
  window.dispatchEvent(new CustomEvent('rj:open-auth', { detail: { mode: 'signup' } }));
}

export default function CloudSettingsPanel() {
  const { user, logout } = useAuth();
  const sync = useSyncState();

  if (!user) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-2xl border border-chart-4/25 bg-chart-4/6 p-3.5">
          <WifiOff className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />
          <div>
            <p className="text-[12px] font-bold text-foreground">Offline mode</p>
            <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-relaxed">
              This device is not signed in. Everything is saved locally — create an account to keep
              the same data on your phone, tablet and laptop.
            </p>
          </div>
        </div>
        <Button className="w-full h-10 rounded-xl text-[12px] font-bold gap-2" onClick={openAccountScreen}>
          <Sparkles className="w-4 h-4" /> Create an account & sync
        </Button>
      </div>
    );
  }

  const status = sync.phase === 'syncing' ? 'Syncing…'
    : sync.phase === 'synced' ? 'Everything is saved'
      : sync.phase === 'pending' ? `${sync.pendingKeys.length} change${sync.pendingKeys.length === 1 ? '' : 's'} waiting`
        : sync.phase === 'offline' ? 'Offline — saved on this device'
          : sync.phase === 'error' ? 'Needs attention'
            : 'Ready';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-2xl border border-border/20 bg-card/30 p-3.5">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center overflow-hidden">
          {user.image && user.image.startsWith('data:image') ? (
            <img src={user.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-black text-primary">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-bold text-foreground truncate">{user.name}</p>
          <p className="text-[10.5px] text-muted-foreground truncate">{user.email}</p>
          <p className={`text-[10px] font-semibold mt-0.5 ${sync.phase === 'error' ? 'text-destructive' : sync.phase === 'synced' ? 'text-secondary' : 'text-muted-foreground'}`}>
            {status}{sync.lastSyncAt ? ` · ${new Date(sync.lastSyncAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
        </div>
        <ShieldCheck className="w-4 h-4 text-secondary shrink-0" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-9 rounded-xl text-[11px] font-bold gap-1.5" onClick={() => { void syncNow('manual').then(r => { if (!r.ok && r.error) toast.error(r.error); else toast.success('☁️ Synced'); }); }}>
          <RefreshCw className={`w-3.5 h-3.5 ${sync.phase === 'syncing' ? 'animate-spin' : ''}`} /> Sync now
        </Button>
        <Button variant="outline" className="h-9 rounded-xl text-[11px] font-bold gap-1.5" onClick={openSyncCenter}>
          <Cloud className="w-3.5 h-3.5" /> Cloud center
        </Button>
      </div>

      <button onClick={openSyncCenter} className="w-full flex items-center gap-2.5 rounded-xl border border-border/20 bg-card/25 px-3 py-2.5 text-left hover:border-primary/30 transition-colors">
        <Smartphone className="w-4 h-4 text-primary shrink-0" />
        <span className="flex-1 text-[11px] font-semibold text-foreground">Devices, restore points & conflicts</span>
        <span className="text-[10px] font-bold text-primary">Open ›</span>
      </button>

      <Button
        variant="outline"
        onClick={() => { void logout().then(() => window.location.reload()); }}
        className="w-full h-9 rounded-xl text-[11px] font-bold text-destructive border-destructive/25 hover:bg-destructive/8 gap-1.5"
      >
        <LogOut className="w-3.5 h-3.5" /> Sign out of this device
      </Button>
    </div>
  );
}
