import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Clock, CheckCircle2, XCircle, Filter } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import type { HistoryEntry } from '../types';
import { formatDateRelative } from '../lib/utils';
import { matchesFields } from '../lib/searchUtils';

interface Props {
  history: HistoryEntry[];
}

export default function HistoryCenter({ history }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'topic_complete' | 'topic_uncomplete'>('all');

  const filtered = useMemo(() => {
    let items = history;
    if (typeFilter !== 'all') items = items.filter(h => h.type === typeFilter);
    if (search) {
      items = items.filter(h => matchesFields(search, [h.topicName, h.subjectName, h.unitName]));
    }
    return items;
  }, [history, search, typeFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, HistoryEntry[]> = {};
    filtered.forEach(h => {
      const key = h.date;
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" /> Activity History
        </h2>
        <span className="text-xs text-muted-foreground font-mono">{history.length}/500 entries</span>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search topics, subjects, units..." className="pl-10" />
        </div>
        <div className="flex gap-1">
          {([['all', 'All'], ['topic_complete', '✅ Completed'], ['topic_uncomplete', '↩ Uncompleted']] as const).map(([val, label]) => (
            <Button key={val} variant={typeFilter === val ? 'default' : 'outline'} size="sm" onClick={() => setTypeFilter(val)} className="text-xs">
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No activity yet</p>
          <p className="text-xs text-muted-foreground mt-1">Complete or uncomplete topics to see your history here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, entries]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold text-muted-foreground px-2">{formatDateRelative(date)}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{entries.length} actions</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                {entries.map((entry, i) => (
                  <motion.div key={entry.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors">
                    <div className="mt-0.5 shrink-0">
                      {entry.type === 'topic_complete'
                        ? <CheckCircle2 className="w-4 h-4 text-secondary" />
                        : <XCircle className="w-4 h-4 text-destructive" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{entry.topicName}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: entry.subjectColor + '20', color: entry.subjectColor }}>
                          {entry.subjectName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{entry.unitName}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">{entry.time}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
