import { Home, Plus } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import BottomSheet from '../shared/BottomSheet';
import type { Folder, Subject } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  folders: Folder[];
  subjects: Subject[];
  currentFolderId?: string | null;
  onMove: (folderId: string | null) => void;
  onCreateFolder: () => void;
  itemName?: string;
}

export default function MoveToSheet({ open, onClose, folders, subjects, currentFolderId, onMove, onCreateFolder, itemName }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} title={`📦 Move "${itemName || 'Subject'}"`}>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-semibold mb-3">Choose destination folder:</p>

        <button onClick={() => { onMove(null); onClose(); }}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
            !currentFolderId ? 'border-primary/30 bg-primary/10' : 'border-border/15 bg-card/30 hover:bg-card/50'
          }`}>
          <Home className="w-5 h-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">Root (No Folder)</p>
            <p className="text-[10px] text-muted-foreground">{subjects.filter(s => !s.folderId).length} subjects</p>
          </div>
          {!currentFolderId && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">Current</span>}
        </button>

        {folders.map(f => {
          const count = subjects.filter(s => s.folderId === f.id).length;
          const isCurrent = currentFolderId === f.id;
          return (
            <button key={f.id}
              onClick={() => { if (!isCurrent) { onMove(f.id); onClose(); } }}
              disabled={isCurrent}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                isCurrent ? 'border-primary/30 bg-primary/10 opacity-60' : 'border-border/15 bg-card/30 hover:bg-card/50'
              }`}>
              <span className="text-xl">{f.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">{f.name}</p>
                <p className="text-[10px] text-muted-foreground">{count} subject{count !== 1 ? 's' : ''}</p>
              </div>
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
              {isCurrent && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">Current</span>}
            </button>
          );
        })}

        <Button variant="outline" className="w-full h-10 text-sm font-semibold gap-2 mt-2"
          onClick={() => { onClose(); setTimeout(() => onCreateFolder(), 200); }}>
          <Plus className="w-4 h-4" /> Create New Folder
        </Button>
      </div>
    </BottomSheet>
  );
}
