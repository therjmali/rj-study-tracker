import { motion } from 'framer-motion';
import { Clock, Pin, ImageIcon, Trash2 } from 'lucide-react';
import { Switch } from '@project/components/ui/switch';
import type { Reminder } from '../../types';
import { getScheduleSummary } from '../../lib/reminderUtils';

const COLOR_MAP: Record<string, string> = {
  primary: 'bg-primary/15 border-primary/25',
  secondary: 'bg-secondary/15 border-secondary/25',
  accent: 'bg-accent/15 border-accent/25',
  destructive: 'bg-destructive/15 border-destructive/25',
  'chart-4': 'bg-chart-4/15 border-chart-4/25',
  'chart-5': 'bg-chart-5/15 border-chart-5/25',
};

const DOT_MAP: Record<string, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  accent: 'bg-accent',
  destructive: 'bg-destructive',
  'chart-4': 'bg-chart-4',
  'chart-5': 'bg-chart-5',
};

interface Props {
  reminder: Reminder;
  onToggle: (id: string) => void;
  onEdit: (r: Reminder) => void;
  onDelete: (id: string) => void;
}

export default function ReminderCard({ reminder: r, onToggle, onEdit, onDelete }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      className={`rounded-xl border p-3 transition-all cursor-pointer ${COLOR_MAP[r.color] || COLOR_MAP.primary} ${!r.enabled ? 'opacity-50' : ''}`}
      onClick={() => onEdit(r)}
    >
      <div className="flex items-start gap-2.5">
        <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${DOT_MAP[r.color] || DOT_MAP.primary}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-bold text-foreground truncate">{r.title || 'Untitled'}</h4>
            {r.pinned && <Pin className="w-3 h-3 text-chart-4 shrink-0" />}
          </div>
          {r.content && (
            <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">{r.content}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[9px] font-semibold text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> {getScheduleSummary(r)}
            </span>
            {r.images.length > 0 && (
              <span className="text-[9px] font-semibold text-muted-foreground flex items-center gap-0.5">
                <ImageIcon className="w-3 h-3" /> {r.images.length}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => onDelete(r.id)} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-destructive/10 transition-colors">
            <Trash2 className="w-3 h-3 text-destructive/60" />
          </button>
          <Switch checked={r.enabled} onCheckedChange={() => onToggle(r.id)} />
        </div>
      </div>
    </motion.div>
  );
}
