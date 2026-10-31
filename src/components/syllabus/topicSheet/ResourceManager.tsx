import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, X, Check, Youtube, FileText, ExternalLink, Link2, Send, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import type { ResourceLink } from '../../../types';

/* ─────────────────────────────────────────────────────────────────────────
   Resource manager — a small link dashboard.
   • "+" (top-right) opens the add form; nothing else is on screen until then
   • every link has Edit + Delete buttons in its right corner
   • delete always asks for confirmation; edit has explicit Save / Cancel
   ───────────────────────────────────────────────────────────────────────── */

type Kind = 'youtube' | 'pdf' | 'telegram' | 'article';

function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch { return null; }
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function kindOf(url: string, stored?: ResourceLink['type']): Kind {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('t.me/') || u.includes('telegram.')) return 'telegram';
  const pathOnly = u.split('?')[0].split('#')[0];
  if (pathOnly.endsWith('.pdf') || u.includes('.pdf')) return 'pdf';
  if (stored === 'youtube') return 'youtube';
  if (stored === 'pdf') return 'pdf';
  return 'article';
}

const KIND_UI: Record<Kind, { icon: React.ReactNode; tile: string; label: string }> = {
  youtube: { icon: <Youtube className="w-4 h-4 text-red-500" />, tile: 'bg-red-500/10 border-red-500/20', label: 'Video' },
  pdf: { icon: <FileText className="w-4 h-4 text-orange-500" />, tile: 'bg-orange-500/10 border-orange-500/20', label: 'PDF' },
  telegram: { icon: <Send className="w-4 h-4 text-sky-500" />, tile: 'bg-sky-500/10 border-sky-500/20', label: 'Telegram' },
  article: { icon: <Link2 className="w-4 h-4 text-blue-500" />, tile: 'bg-blue-500/10 border-blue-500/20', label: 'Link' },
};

function storedType(k: Kind): ResourceLink['type'] {
  return k === 'youtube' ? 'youtube' : k === 'pdf' ? 'pdf' : 'article';
}

export default function ResourceManager({ resources, onChange }: { resources: ResourceLink[]; onChange: (links: ResourceLink[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editError, setEditError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ResourceLink | null>(null);

  const existing = useMemo(() => new Set(resources.map(r => r.url)), [resources]);

  const closeAdd = () => { setAdding(false); setNewUrl(''); setNewTitle(''); setError(''); };

  const addLink = () => {
    const url = normalizeUrl(newUrl);
    if (!url) { setError('Enter a valid link, e.g. https://youtu.be/…'); return; }
    if (existing.has(url)) { setError('This link is already saved'); return; }
    const title = newTitle.trim() || hostOf(url);
    onChange([...resources, { id: `res-${Date.now()}`, url, title, type: storedType(kindOf(url)) }]);
    navigator.vibrate?.(10);
    toast.success('🔗 Link added');
    closeAdd();
  };

  const startEdit = (r: ResourceLink) => { setEditId(r.id); setEditUrl(r.url); setEditTitle(r.title); setEditError(''); };

  const saveEdit = () => {
    const url = normalizeUrl(editUrl);
    if (!url) { setEditError('Enter a valid link'); return; }
    if (resources.some(r => r.id !== editId && r.url === url)) { setEditError('Another saved link already uses this URL'); return; }
    onChange(resources.map(r => r.id === editId ? { ...r, url, title: editTitle.trim() || hostOf(url), type: storedType(kindOf(url, r.type)) } : r));
    toast.success('✅ Link updated');
    setEditId(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    onChange(resources.filter(r => r.id !== deleteTarget.id));
    navigator.vibrate?.(15);
    toast.success('🗑️ Link deleted');
    setDeleteTarget(null);
  };

  const copy = (url: string) => navigator.clipboard?.writeText(url).then(() => toast.success('📋 Link copied')).catch(() => toast.error('Copy failed'));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground">
          {resources.length === 0 ? 'No links yet' : `${resources.length} saved link${resources.length !== 1 ? 's' : ''}`}
        </span>
        <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => (adding ? closeAdd() : setAdding(true))}
          aria-label={adding ? 'Close add link form' : 'Add a link'} aria-expanded={adding}
          className={`h-8 pl-2.5 pr-3 rounded-full border flex items-center gap-1 text-[11px] font-bold transition-colors ${
            adding ? 'bg-muted/40 border-border/30 text-foreground' : 'bg-primary/10 border-primary/25 text-primary'
          }`}>
          <Plus className={`w-3.5 h-3.5 transition-transform duration-200 ${adding ? 'rotate-45' : ''}`} /> {adding ? 'Close' : 'Add link'}
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div key="add" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
              <Input autoFocus placeholder="Paste URL…" value={newUrl} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                onChange={e => { setNewUrl(e.target.value); setError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') addLink(); if (e.key === 'Escape') closeAdd(); }}
                className="h-9 text-xs bg-card border-border/25 rounded-xl" />
              <Input placeholder="Title (optional)" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addLink(); }} className="h-9 text-xs bg-card border-border/25 rounded-xl" />
              {error && <p className="text-[10px] font-semibold text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={closeAdd} className="flex-1 h-9 text-xs rounded-xl">Cancel</Button>
                <Button type="button" size="sm" onClick={addLink} disabled={!newUrl.trim()} className="flex-1 h-9 text-xs rounded-xl font-bold gap-1"><Plus className="w-3.5 h-3.5" /> Add link</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-1.5">
        {resources.map(r => {
          const kind = kindOf(r.url, r.type);
          const ui = KIND_UI[kind];
          const editing = editId === r.id;
          return (
            <div key={r.id} className={`rounded-xl border transition-colors ${editing ? 'border-primary/30 bg-primary/5' : 'border-border/12 bg-muted/10'}`}>
              {editing ? (
                <div className="p-2.5 space-y-2">
                  <Input value={editTitle} placeholder="Title" onChange={e => setEditTitle(e.target.value)} className="h-9 text-xs bg-card border-border/25 rounded-xl" />
                  <Input value={editUrl} placeholder="URL" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    onChange={e => { setEditUrl(e.target.value); setEditError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null); }}
                    className="h-9 text-xs bg-card border-border/25 rounded-xl font-mono" />
                  {editError && <p className="text-[10px] font-semibold text-destructive">{editError}</p>}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditId(null)} className="flex-1 h-8 text-xs rounded-xl gap-1"><X className="w-3 h-3" /> Cancel</Button>
                    <Button type="button" size="sm" onClick={saveEdit} className="flex-1 h-8 text-xs rounded-xl font-bold gap-1"><Check className="w-3.5 h-3.5" /> Save</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 p-2">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 flex-1 min-w-0 active:opacity-70">
                    <span className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${ui.tile}`}>{ui.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12px] font-semibold text-foreground leading-snug line-clamp-2" style={{ overflowWrap: 'anywhere' }}>{r.title}</span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                        <span className="font-bold">{ui.label}</span><span>·</span><span className="truncate">{hostOf(r.url)}</span>
                        <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60" />
                      </span>
                    </span>
                  </a>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => copy(r.url)} aria-label={`Copy link ${r.title}`}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/40 active:scale-90 transition"><Copy className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => startEdit(r)} aria-label={`Edit link ${r.title}`}
                      className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/15 flex items-center justify-center text-accent hover:bg-accent/20 active:scale-90 transition"><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => setDeleteTarget(r)} aria-label={`Delete link ${r.title}`}
                      className="w-8 h-8 rounded-lg bg-destructive/8 border border-destructive/15 flex items-center justify-center text-destructive hover:bg-destructive/15 active:scale-90 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {resources.length === 0 && !adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="w-full py-5 rounded-xl border-2 border-dashed border-border/30 text-[11px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors">
            + Add your first link — videos, PDFs, articles
          </button>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this link?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” ({deleteTarget ? hostOf(deleteTarget.url) : ''}) will be removed from this topic. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
