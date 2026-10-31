import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { TrashItem } from '../../types';

export default function TrashTab({ trash, onRestore, onDelete, onEmpty }: {
  trash: TrashItem[]; onRestore: (id: string) => void; onDelete: (id: string) => void; onEmpty: () => void;
}) {
  const [emptyOpen, setEmptyOpen] = useState(false);

  if (trash.length === 0) {
    return (
      <div className="glass-card p-6 text-center">
        <span className="text-3xl">🗑️</span>
        <p className="text-sm text-muted-foreground mt-2">Trash is empty</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">{trash.length} item(s) in trash</p>
        <Button variant="outline" size="sm" onClick={() => setEmptyOpen(true)} className="text-xs text-destructive border-destructive/20">
          Empty Trash
        </Button>
      </div>

      {trash.map(item => (
        <div key={item.id} className="glass-card p-3 flex items-center gap-3">
          <div className="w-2 h-8 rounded-full" style={{ backgroundColor: item.data.color }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{item.data.name}</p>
            <p className="text-[10px] text-muted-foreground">Deleted {new Date(item.deletedAt).toLocaleDateString('en-GB')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => onRestore(item.id)} className="text-xs gap-1">
            <RotateCcw className="w-3 h-3" /> Restore
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDelete(item.id)} className="text-xs text-destructive border-destructive/20">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ))}

      <AlertDialog open={emptyOpen} onOpenChange={setEmptyOpen}>
        <AlertDialogContent className="glass-card bg-card/90 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Empty Trash?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete all {trash.length} items.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onEmpty(); setEmptyOpen(false); toast.success('Trash emptied'); }}>Empty</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
