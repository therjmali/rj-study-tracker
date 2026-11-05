import { useState } from 'react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import BottomSheet from '../shared/BottomSheet';
import type { SubTopic } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  unitId: string;
  modules: string[];
  onAdd: (topic: SubTopic) => void;
}

export default function AddTopicInline({ open, onClose, unitId, modules, onAdd }: Props) {
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<SubTopic['difficulty']>('Medium');
  const [important, setImportant] = useState(false);
  const [module, setModule] = useState('');

  const handleAdd = () => {
    if (!name.trim()) return;
    const topic: SubTopic = {
      id: `${unitId}-ct-${Date.now()}`,
      name: name.trim(),
      completed: false,
      notes: '',
      notesArr: [],
      difficulty,
      timeSpent: 0,
      important,
      mcqs: [],
      tags: [],
      module: module || undefined,
    };
    onAdd(topic);
    setName('');
    setDifficulty('Medium');
    setImportant(false);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="➕ Add Topic">
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">Topic Name</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            className="mt-1"
            placeholder="e.g. Anatomy (Part-1)"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
        </div>

        {modules.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground">Module Folder (optional)</Label>
            <Input
              value={module}
              onChange={e => setModule(e.target.value)}
              className="mt-1"
              placeholder="e.g. ANATOMY"
            />
            <div className="flex flex-wrap gap-1 mt-1.5">
              {modules.map(m => (
                <button
                  key={m}
                  onClick={() => setModule(module === m ? '' : m)}
                  className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors ${
                    module === m
                      ? 'bg-accent/15 text-accent-ink border-accent/30'
                      : 'bg-muted/20 text-muted-foreground border-border/30 hover:bg-muted/40'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs text-muted-foreground">Difficulty</Label>
          <div className="flex gap-2 mt-1">
            {(['Easy', 'Medium', 'Hard'] as const).map(d => (
              <Button
                key={d}
                size="sm"
                variant={difficulty === d ? 'default' : 'outline'}
                onClick={() => setDifficulty(d)}
                className="flex-1 text-xs"
              >
                {d === 'Easy' ? '🟢' : d === 'Medium' ? '🟡' : '🔴'} {d}
              </Button>
            ))}
          </div>
        </div>

        <Button
          size="sm"
          variant={important ? 'default' : 'outline'}
          className="w-full text-xs"
          onClick={() => setImportant(!important)}
        >
          {important ? '⭐ Important' : '☆ Not Important'}
        </Button>

        <Button className="w-full" onClick={handleAdd} disabled={!name.trim()}>
          Add Topic
        </Button>
      </div>
    </BottomSheet>
  );
}
