import { useEffect, useState } from 'react';
import { Download, RotateCcw, Trash2 } from 'lucide-react';
import type { AppState, HistoryEntry, Subject, TrashItem, User, UserSettings } from '../../types';
import DataCenter from './DataCenter';
import BackupTab from '../profile/BackupTab';
import TrashTab from '../profile/TrashTab';

export type DataHubTab = 'download' | 'restore' | 'trash';

interface Props {
  appState: AppState;
  subjects: Subject[];
  settings: UserSettings;
  history: HistoryEntry[];
  trash: TrashItem[];
  user: User;
  onUpdateUser: (u: User) => void;
  onImport: (s: AppState) => void;
  onReset: () => void;
  onClearHistory: () => void;
  onRestoreTrash: (id: string) => void;
  onDeleteTrash: (id: string) => void;
  onEmptyTrash: () => void;
  /** Open on this tab (e.g. when a search for "trash" lands here). Change `nonce` to re-apply. */
  initialTab?: DataHubTab;
  nonce?: number;
}

const TABS: { id: DataHubTab; icon: React.ReactNode; label: string; hint: string }[] = [
  { id: 'download', icon: <Download className="w-4 h-4" />, label: 'Download', hint: 'Back up, verify and compare everything' },
  { id: 'restore', icon: <RotateCcw className="w-4 h-4" />, label: 'Restore', hint: 'Import a backup, merge data, clear history or reset' },
  { id: 'trash', icon: <Trash2 className="w-4 h-4" />, label: 'Trash', hint: 'Recover or permanently delete removed subjects' },
];

/**
 * One home for everything about your data: download & verify, restore & reset, and the trash —
 * a single settings item with three tabs instead of three separate ones.
 */
export default function DataHub(p: Props) {
  const [tab, setTab] = useState<DataHubTab>(p.initialTab ?? 'download');
  useEffect(() => { if (p.initialTab) setTab(p.initialTab); /* eslint-disable-next-line */ }, [p.initialTab, p.nonce]);

  const active = TABS.find(t => t.id === tab) ?? TABS[0];

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Backup, data and trash" className="grid grid-cols-3 gap-1 rounded-2xl border border-border/20 bg-card/40 p-1">
        {TABS.map(t => {
          const on = tab === t.id;
          const count = t.id === 'trash' ? p.trash.length : 0;
          return (
            <button key={t.id} role="tab" aria-selected={on} onClick={() => setTab(t.id)}
              className={`relative flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold transition-all active:scale-[0.97] ${on ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {t.icon}
              <span>{t.label}</span>
              {count > 0 && (
                <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black flex items-center justify-center ${on ? 'bg-primary-foreground text-primary' : 'bg-destructive text-destructive-foreground'}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground px-1">{active.hint}</p>

      <div role="tabpanel">
        {tab === 'download' && (
          <DataCenter appState={p.appState} subjects={p.subjects} settings={p.settings} history={p.history} trash={p.trash} user={p.user} />
        )}
        {tab === 'restore' && (
          <BackupTab appState={p.appState} onImport={p.onImport} onReset={p.onReset} onClearHistory={p.onClearHistory}
            subjects={p.subjects} settings={p.settings} history={p.history} trash={p.trash} user={p.user} onUpdateUser={p.onUpdateUser} />
        )}
        {tab === 'trash' && (
          <TrashTab trash={p.trash} onRestore={p.onRestoreTrash} onDelete={p.onDeleteTrash} onEmpty={p.onEmptyTrash} />
        )}
      </div>
    </div>
  );
}
