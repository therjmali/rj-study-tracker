import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Bell, BellOff } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { Reminder } from '../../types';
import BottomSheet from '../shared/BottomSheet';
import ReminderCard from './ReminderCard';
import ReminderForm from './ReminderForm';

interface Props {
  reminders: Reminder[];
  onUpdate: (reminders: Reminder[]) => void;
}

export default function ReminderManager({ reminders, onUpdate }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleToggle = (id: string) => {
    onUpdate(reminders.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const handleEdit = (r: Reminder) => {
    setEditing(r);
    setFormOpen(true);
  };

  const handleSave = (r: Reminder) => {
    if (editing) {
      onUpdate(reminders.map(x => x.id === r.id ? r : x));
      toast.success('Reminder updated');
    } else {
      onUpdate([r, ...reminders]);
      toast.success('Reminder created');
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    onUpdate(reminders.filter(r => r.id !== deleteId));
    setDeleteId(null);
    toast.success('Reminder deleted');
  };

  const active = reminders.filter(r => r.enabled).length;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-muted-foreground">
            {reminders.length === 0 ? 'No reminders yet' : `${active}/${reminders.length} active`}
          </span>
        </div>
        <Button size="sm" className="h-8 text-xs font-bold gap-1.5 rounded-xl" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="w-3.5 h-3.5" /> New Reminder
        </Button>
      </div>

      {/* Empty state */}
      {reminders.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="py-10 text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center">
            <BellOff className="w-6 h-6 text-primary/40" />
          </div>
          <p className="text-xs text-muted-foreground font-medium">Create your first reminder to stay on track</p>
        </motion.div>
      )}

      {/* Reminder list */}
      <AnimatePresence mode="popLayout">
        {reminders.map(r => (
          <ReminderCard key={r.id} reminder={r} onToggle={handleToggle} onEdit={handleEdit} onDelete={setDeleteId} />
        ))}
      </AnimatePresence>

      {/* Create/Edit Sheet */}
      <BottomSheet open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} title={editing ? '✏️ Edit Reminder' : '✨ New Reminder'} zIndex={90}>
        <ReminderForm initial={editing} onSave={handleSave} onCancel={() => { setFormOpen(false); setEditing(null); }} />
      </BottomSheet>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="glass-card bg-card/90 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reminder?</AlertDialogTitle>
            <AlertDialogDescription>This reminder will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
