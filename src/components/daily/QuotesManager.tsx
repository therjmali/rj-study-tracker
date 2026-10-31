import { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quote, Plus, Pencil, Trash2, X, ImagePlus, Eye, EyeOff, ChevronDown, ChevronRight, Sparkles, RefreshCw, Upload, Type, Image as ImageIcon, Layers, RotateCcw, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useUpload } from '@/platform/upload';
import type { CustomQuote, UserSettings } from '../../types';
import GlowCard from '../shared/GlowCard';
import { BUILT_IN_QUOTES, getAllActiveQuotes, getEffectiveBuiltInQuote } from '../../lib/quotes';

type QuoteMode = 'text' | 'image' | 'both';

interface Props {
  settings: UserSettings;
  onUpdateSettings: (s: UserSettings) => void;
}

export default function QuotesManager({ settings, onUpdateSettings }: Props) {
  const quotes = settings.customQuotes || [];
  const hiddenBuiltIn = settings.hiddenBuiltInQuotes || [];
  const overrides = settings.builtInQuoteOverrides || {};

  const [expanded, setExpanded] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingQuote, setEditingQuote] = useState<CustomQuote | null>(null);
  const [editingBuiltInIdx, setEditingBuiltInIdx] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showBuiltIn, setShowBuiltIn] = useState(false);

  const allQuotes = useMemo(() =>
    getAllActiveQuotes(quotes, hiddenBuiltIn, overrides),
  [quotes, hiddenBuiltIn, overrides]);

  const [activeIdx, setActiveIdx] = useState(() => {
    const d = new Date();
    return (d.getFullYear() * 366 + d.getMonth() * 31 + d.getDate()) % Math.max(1, allQuotes.length);
  });

  const activeQuote = allQuotes[activeIdx % Math.max(1, allQuotes.length)];
  const shuffle = () => setActiveIdx(p => (p + 1) % Math.max(1, allQuotes.length));

  const updateQuotes = (newQuotes: CustomQuote[]) => onUpdateSettings({ ...settings, customQuotes: newQuotes });

  const handleDelete = () => {
    if (!deleteId) return;
    updateQuotes(quotes.filter(q => q.id !== deleteId));
    setDeleteId(null);
    toast.success('Quote deleted');
  };

  const toggleBuiltIn = (idx: number) => {
    const base = BUILT_IN_QUOTES[idx];
    if (!base) return;
    const current = overrides[idx];
    const isHidden = current?.hidden || hiddenBuiltIn.includes(base.text);
    
    if (isHidden) {
      // Show it: remove from hiddenBuiltIn AND clear hidden override
      const newHidden = hiddenBuiltIn.filter(t => t !== base.text);
      const newOverrides = { ...overrides };
      if (newOverrides[idx]) {
        newOverrides[idx] = { ...newOverrides[idx], hidden: false };
      }
      onUpdateSettings({ ...settings, hiddenBuiltInQuotes: newHidden, builtInQuoteOverrides: newOverrides });
    } else {
      // Hide it
      const newOverrides = { ...overrides, [idx]: { ...(overrides[idx] || {}), hidden: true } };
      onUpdateSettings({ ...settings, builtInQuoteOverrides: newOverrides });
    }
  };

  const handleEditBuiltIn = (idx: number) => {
    const eff = getEffectiveBuiltInQuote(idx, overrides);
    setEditingBuiltInIdx(idx);
    setEditingQuote({
      id: `builtin-${idx}`,
      text: eff.text,
      author: eff.author,
      imageUrl: eff.imageUrl,
      backgroundUrl: eff.backgroundUrl,
    });
    setShowEditor(true);
  };

  const handleSaveBuiltInEdit = (q: CustomQuote) => {
    if (editingBuiltInIdx === null) return;
    const base = BUILT_IN_QUOTES[editingBuiltInIdx];
    const newOverrides = {
      ...overrides,
      [editingBuiltInIdx]: {
        ...(overrides[editingBuiltInIdx] || {}),
        text: q.text !== base.text ? q.text : undefined,
        author: q.author !== base.author ? q.author : undefined,
        imageUrl: q.imageUrl,
        backgroundUrl: q.backgroundUrl,
        hidden: false,
      },
    };
    onUpdateSettings({ ...settings, builtInQuoteOverrides: newOverrides });
    toast.success('Built-in quote updated! ✨');
  };

  const resetBuiltInOverride = (idx: number) => {
    const newOverrides = { ...overrides };
    delete newOverrides[idx];
    // Also remove from hiddenBuiltIn if it was there
    const base = BUILT_IN_QUOTES[idx];
    const newHidden = hiddenBuiltIn.filter(t => t !== base?.text);
    onUpdateSettings({ ...settings, builtInQuoteOverrides: newOverrides, hiddenBuiltInQuotes: newHidden });
    toast.success('Reset to original');
  };

  const visibleBuiltIn = BUILT_IN_QUOTES.filter((q, i) => {
    const eff = getEffectiveBuiltInQuote(i, overrides);
    return !eff.hidden && !hiddenBuiltIn.includes(q.text);
  }).length;

  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
      <GlowCard className="overflow-hidden" paper>
        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-chart-4/20 to-accent/20 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-chart-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">Today's Motivation</p>
              <p className="text-[9px] text-muted-foreground">{allQuotes.length} quotes · synced everywhere</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={shuffle} className="w-7 h-7 rounded-lg bg-muted/30 flex items-center justify-center hover:bg-muted/50 transition-colors active:scale-90">
              <RefreshCw className="w-3 h-3 text-muted-foreground" />
            </button>
            <button onClick={() => setExpanded(p => !p)} className="w-7 h-7 rounded-lg bg-muted/30 flex items-center justify-center hover:bg-muted/50 transition-colors">
              {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          </div>
        </div>

        {/* Active Quote Card */}
        {activeQuote && <ActiveQuoteCard quote={activeQuote} />}

        {/* Expanded Manager */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3 border-t border-border/10 pt-3">
                {/* Add Button */}
                <Button
                  onClick={() => { setEditingQuote(null); setEditingBuiltInIdx(null); setShowEditor(true); }}
                  variant="outline"
                  className="w-full h-10 text-xs font-bold gap-2 border-dashed border-primary/30 text-primary hover:bg-primary/5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add New Quote
                </Button>

                {/* Custom Quotes List */}
                {quotes.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-2.5 h-2.5 text-chart-4" /> Your Quotes ({quotes.length})
                    </p>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {quotes.map(q => (
                        <QuoteListItem
                          key={q.id}
                          quote={q}
                          onEdit={() => { setEditingQuote(q); setEditingBuiltInIdx(null); setShowEditor(true); }}
                          onDelete={() => setDeleteId(q.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Built-in Quotes Section */}
                <div className="rounded-xl bg-card/50 border border-border/15 overflow-hidden">
                  <button onClick={() => setShowBuiltIn(p => !p)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-2">
                      <Quote className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] font-bold text-foreground/70">Built-in Quotes ({visibleBuiltIn}/{BUILT_IN_QUOTES.length})</span>
                    </div>
                    {showBuiltIn ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  </button>
                  <AnimatePresence>
                    {showBuiltIn && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-3 pb-3 space-y-1.5 max-h-[400px] overflow-y-auto border-t border-border/10 pt-2">
                          {BUILT_IN_QUOTES.map((q, i) => {
                            const eff = getEffectiveBuiltInQuote(i, overrides);
                            const isHidden = eff.hidden || hiddenBuiltIn.includes(q.text);
                            const isModified = eff.overridden;
                            return (
                              <div key={i} className={`group rounded-xl border transition-all overflow-hidden ${isHidden ? 'opacity-40 border-border/10 bg-muted/5' : 'border-border/15 bg-card/30'}`}>
                                {/* Background preview for modified quotes */}
                                {eff.backgroundUrl && !isHidden && (
                                  <div className="relative h-14 overflow-hidden">
                                    <img src={eff.backgroundUrl} alt="" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />
                                    <p className="absolute bottom-1.5 left-2.5 right-16 text-[9px] text-white/90 italic truncate">"{eff.text}"</p>
                                  </div>
                                )}
                                <div className="flex items-start gap-2 px-2.5 py-2">
                                  {/* Toggle */}
                                  <button onClick={() => toggleBuiltIn(i)}
                                    className="shrink-0 mt-0.5 transition-colors"
                                  >
                                    {isHidden ? (
                                      <ToggleLeft className="w-5 h-5 text-muted-foreground/40" />
                                    ) : (
                                      <ToggleRight className="w-5 h-5 text-primary" />
                                    )}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    {!eff.backgroundUrl && (
                                      <p className="text-[10px] text-foreground/80 italic leading-relaxed">"{eff.text}"</p>
                                    )}
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      {eff.imageUrl && <img src={eff.imageUrl} alt="" className="w-3.5 h-3.5 rounded-full object-cover border border-border/20" />}
                                      <p className="text-[8px] text-muted-foreground font-semibold">— {eff.author}</p>
                                      {isModified && (
                                        <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-chart-4/15 text-chart-4 font-bold border border-chart-4/20">
                                          modified
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {/* Actions */}
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button onClick={() => handleEditBuiltIn(i)}
                                      className="w-6 h-6 rounded-lg bg-muted/30 flex items-center justify-center hover:bg-accent/15 transition-colors opacity-60 group-hover:opacity-100"
                                      title="Edit quote"
                                    >
                                      <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
                                    </button>
                                    {isModified && (
                                      <button onClick={() => resetBuiltInOverride(i)}
                                        className="w-6 h-6 rounded-lg bg-muted/30 flex items-center justify-center hover:bg-primary/15 transition-colors opacity-60 group-hover:opacity-100"
                                        title="Reset to original"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5 text-muted-foreground" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlowCard>

      {/* Quote Editor Sheet */}
      <QuoteEditorSheet
        open={showEditor}
        onClose={() => { setShowEditor(false); setEditingQuote(null); setEditingBuiltInIdx(null); }}
        quote={editingQuote}
        isBuiltIn={editingBuiltInIdx !== null}
        onSave={(q) => {
          if (editingBuiltInIdx !== null) {
            handleSaveBuiltInEdit(q);
          } else if (editingQuote && quotes.some(x => x.id === editingQuote.id)) {
            updateQuotes(quotes.map(x => x.id === editingQuote.id ? q : x));
            toast.success('Quote updated! ✨');
          } else {
            updateQuotes([...quotes, q]);
            toast.success('Quote added! ✨');
          }
          setShowEditor(false);
          setEditingQuote(null);
          setEditingBuiltInIdx(null);
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="glass-card bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="w-4 h-4 text-destructive" /> Delete Quote?</AlertDialogTitle>
            <AlertDialogDescription>This quote will be permanently removed from your collection.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

/* ── Active Quote Card ── */
function ActiveQuoteCard({ quote }: { quote: { text: string; author: string; backgroundUrl?: string; imageUrl?: string; isCustom: boolean } }) {
  const hasBg = !!quote.backgroundUrl;
  const isImageOnly = hasBg && !quote.text.trim();

  return (
    <div className="mx-4 mb-3 rounded-xl overflow-hidden relative" style={{ minHeight: hasBg ? 120 : undefined }}>
      {hasBg ? (
        <>
          <img src={quote.backgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          {!isImageOnly && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />}
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-accent/5 to-secondary/8 border border-border/10 rounded-xl" />
      )}
      {!hasBg && (
        <div className="absolute top-3 right-3 opacity-[0.06]">
          <Quote className="w-10 h-10 text-primary" />
        </div>
      )}
      {!isImageOnly && (
        <div className={`relative px-4 py-4 flex items-start gap-3 ${hasBg ? 'min-h-[120px] flex-col justify-end' : ''}`}>
          {quote.imageUrl && !hasBg && (
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary/20 shrink-0">
              <img src={quote.imageUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div key={quote.text} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }}>
                <p className={`text-[13px] leading-relaxed font-medium italic ${hasBg ? 'text-white drop-shadow-lg' : 'text-foreground'}`}>
                  &ldquo;{quote.text}&rdquo;
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  {quote.imageUrl && hasBg && (
                    <div className="w-5 h-5 rounded-full overflow-hidden border border-white/30 shrink-0">
                      <img src={quote.imageUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <p className={`text-[10px] font-semibold ${hasBg ? 'text-white/70' : 'text-muted-foreground'}`}>
                    — {quote.author}
                  </p>
                  {quote.isCustom && (
                    <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-chart-4/20 text-chart-4 font-bold border border-chart-4/25 flex items-center gap-0.5">
                      <Sparkles className="w-2 h-2" /> yours
                    </span>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}
      {isImageOnly && (
        <div className="relative" style={{ minHeight: 160 }}>
          <div className="absolute bottom-2 right-2">
            <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-black/40 text-white/80 font-bold backdrop-blur-sm flex items-center gap-0.5">
              <Sparkles className="w-2 h-2" /> your quote
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Quote List Item ── */
function QuoteListItem({ quote, onEdit, onDelete }: { quote: CustomQuote; onEdit: () => void; onDelete: () => void }) {
  const hasBg = !!quote.backgroundUrl;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="group relative rounded-xl overflow-hidden border border-border/15 hover:border-border/30 transition-all"
    >
      {hasBg ? (
        <div className="relative h-20">
          <img src={quote.backgroundUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
          {quote.text && (
            <p className="absolute bottom-2 left-3 right-16 text-[10px] text-white/90 italic font-medium truncate">
              "{quote.text}"
            </p>
          )}
          {!quote.text && (
            <div className="absolute bottom-2 left-3 flex items-center gap-1">
              <ImageIcon className="w-3 h-3 text-white/60" />
              <span className="text-[9px] text-white/60 font-medium">Image quote</span>
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 py-2.5">
          <p className="text-[11px] text-foreground italic leading-relaxed pr-14 line-clamp-2">"{quote.text}"</p>
        </div>
      )}

      <div className={`flex items-center justify-between px-3 py-1.5 ${hasBg ? 'bg-card/60' : ''}`}>
        <div className="flex items-center gap-1.5">
          {quote.imageUrl && <img src={quote.imageUrl} alt="" className="w-4 h-4 rounded-full object-cover border border-border/20" />}
          <p className="text-[9px] text-muted-foreground font-semibold">— {quote.author}</p>
        </div>
        <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="w-6 h-6 rounded-lg bg-muted/40 flex items-center justify-center hover:bg-muted/60 transition-colors">
            <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
          </button>
          <button onClick={onDelete} className="w-6 h-6 rounded-lg bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors">
            <Trash2 className="w-2.5 h-2.5 text-destructive" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Quote Editor Sheet (Full-featured) ── */
function QuoteEditorSheet({ open, onClose, quote, isBuiltIn, onSave }: {
  open: boolean;
  onClose: () => void;
  quote: CustomQuote | null;
  isBuiltIn?: boolean;
  onSave: (q: CustomQuote) => void;
}) {
  const isEdit = !!quote;
  const { upload: uploadFn } = useUpload();
  const [text, setText] = useState(quote?.text || '');
  const [author, setAuthor] = useState(quote?.author || '');
  const [bgUrl, setBgUrl] = useState(quote?.backgroundUrl || '');
  const [imgUrl, setImgUrl] = useState(quote?.imageUrl || '');
  const [uploading, setUploading] = useState<'bg' | 'img' | null>(null);
  const [mode, setMode] = useState<QuoteMode>(
    quote?.backgroundUrl && !quote?.text ? 'image' :
    quote?.backgroundUrl && quote?.text ? 'both' : 'text'
  );
  const bgRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  // Reset form when quote changes
  useEffect(() => {
    if (open) {
      setText(quote?.text || '');
      setAuthor(quote?.author || '');
      setBgUrl(quote?.backgroundUrl || '');
      setImgUrl(quote?.imageUrl || '');
      setMode(
        quote?.backgroundUrl && !quote?.text ? 'image' :
        quote?.backgroundUrl && quote?.text ? 'both' : 'text'
      );
    }
  }, [open, quote]);

  const handleUpload = async (file: File, type: 'bg' | 'img') => {
    try {
      setUploading(type);
      const { url } = await uploadFn(file);
      if (type === 'bg') setBgUrl(url);
      else setImgUrl(url);
      toast.success(type === 'bg' ? '🖼️ Background uploaded!' : '📷 Photo uploaded!');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleSave = () => {
    if (mode === 'text' && !text.trim()) { toast.error('Please enter quote text'); return; }
    if (mode === 'image' && !bgUrl) { toast.error('Please upload an image'); return; }
    if (mode === 'both' && !text.trim()) { toast.error('Please enter quote text'); return; }
    if (mode === 'both' && !bgUrl) { toast.error('Please upload a background image'); return; }

    onSave({
      id: quote?.id || `q-${Date.now()}`,
      text: mode === 'image' ? '' : text.trim(),
      author: author.trim() || 'You',
      backgroundUrl: mode === 'text' ? undefined : bgUrl || undefined,
      imageUrl: imgUrl || undefined,
    });
  };

  const showBgPreview = (mode === 'image' || mode === 'both') && bgUrl;

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]" onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[101] max-h-[90vh] overflow-y-auto bg-card border-t border-border/20 rounded-t-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
            </div>
            <div className="px-5 pb-8 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-chart-4" />
                  {isBuiltIn ? 'Edit Built-in Quote' : isEdit ? 'Edit Quote' : 'New Quote'}
                </h3>
                <button onClick={onClose} className="w-7 h-7 rounded-lg bg-muted/40 flex items-center justify-center hover:bg-muted/60">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Mode Selector */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Quote Type</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'text' as QuoteMode, icon: <Type className="w-4 h-4" />, label: 'Text Only' },
                    { id: 'image' as QuoteMode, icon: <ImageIcon className="w-4 h-4" />, label: 'Image Only' },
                    { id: 'both' as QuoteMode, icon: <Layers className="w-4 h-4" />, label: 'Text + Image' },
                  ]).map(m => (
                    <button key={m.id} onClick={() => setMode(m.id)}
                      className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all ${
                        mode === m.id ? 'border-primary bg-primary/8 text-primary' : 'border-border/20 bg-card/50 text-muted-foreground hover:border-border/40'
                      }`}>
                      {m.icon}
                      <span className="text-[10px] font-bold">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Fields */}
              {mode !== 'image' && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Quote Text</p>
                  <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Type your motivational quote..."
                    className="min-h-[80px] text-sm bg-background/50 border-border/30 resize-none" autoFocus />
                  <Input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Author (optional, defaults to 'You')"
                    className="h-9 text-xs bg-background/50 border-border/30" />
                </div>
              )}

              {/* Background Image Upload */}
              {mode !== 'text' && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {mode === 'image' ? 'Quote Image' : 'Background Image'}
                  </p>
                  {bgUrl ? (
                    <div className="relative rounded-xl overflow-hidden border border-border/20">
                      <img src={bgUrl} alt="" className="w-full h-32 object-cover" />
                      <button onClick={() => setBgUrl('')}
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70">
                        <X className="w-3 h-3 text-white" />
                      </button>
                      <button onClick={() => bgRef.current?.click()}
                        className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/50 text-white text-[10px] font-bold hover:bg-black/70 flex items-center gap-1">
                        <RefreshCw className="w-2.5 h-2.5" /> Replace
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => bgRef.current?.click()} disabled={uploading === 'bg'}
                      className="w-full py-6 rounded-xl border-2 border-dashed border-border/30 hover:border-primary/40 transition-all flex flex-col items-center gap-2 text-muted-foreground hover:text-primary">
                      {uploading === 'bg' ? <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <ImagePlus className="w-6 h-6" />}
                      <span className="text-[11px] font-bold">{uploading === 'bg' ? 'Uploading...' : 'Tap to upload image'}</span>
                    </button>
                  )}
                  <input ref={bgRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'bg'); e.target.value = ''; }} />
                </div>
              )}

              {/* Author Photo */}
              {mode !== 'image' && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Author Photo (optional)</p>
                  <div className="flex items-center gap-3">
                    {imgUrl ? (
                      <div className="relative">
                        <img src={imgUrl} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-primary/20" />
                        <button onClick={() => setImgUrl('')} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive flex items-center justify-center">
                          <X className="w-2.5 h-2.5 text-white" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => imgRef.current?.click()} disabled={uploading === 'img'}
                        className="w-12 h-12 rounded-full border-2 border-dashed border-border/30 flex items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-primary transition-all">
                        {uploading === 'img' ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}
                      </button>
                    )}
                    <p className="text-[10px] text-muted-foreground flex-1">Add a circular photo of the quote author</p>
                  </div>
                  <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'img'); e.target.value = ''; }} />
                </div>
              )}

              {/* Live Preview */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Live Preview
                </p>
                <div className="rounded-xl overflow-hidden border border-border/20 relative" style={{ minHeight: showBgPreview ? 120 : undefined }}>
                  {showBgPreview ? (
                    <>
                      <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      {mode === 'both' && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />}
                    </>
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-accent/5 to-secondary/8" />
                  )}
                  {mode !== 'image' ? (
                    <div className={`relative px-4 py-4 ${showBgPreview ? 'min-h-[120px] flex flex-col justify-end' : ''}`}>
                      <p className={`text-[13px] italic font-medium leading-relaxed ${showBgPreview ? 'text-white drop-shadow-lg' : 'text-foreground'}`}>
                        &ldquo;{text || 'Your quote will appear here...'}&rdquo;
                      </p>
                      <div className="flex items-center gap-1.5 mt-2">
                        {imgUrl && <img src={imgUrl} alt="" className="w-5 h-5 rounded-full object-cover border border-white/30" />}
                        <p className={`text-[10px] font-semibold ${showBgPreview ? 'text-white/70' : 'text-muted-foreground'}`}>
                          — {author || 'You'}
                        </p>
                      </div>
                    </div>
                  ) : bgUrl ? (
                    <div className="relative" style={{ minHeight: 140 }}>
                      <div className="absolute bottom-2 right-2">
                        <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-black/40 text-white/80 font-bold backdrop-blur-sm">📷 Image Quote</span>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-8 text-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                      <p className="text-[11px] text-muted-foreground">Upload an image to preview</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={onClose} className="flex-1 h-11 text-xs font-bold">Cancel</Button>
                <Button onClick={handleSave} className="flex-1 h-11 text-xs font-bold gap-2">
                  <Sparkles className="w-3.5 h-3.5" /> {isBuiltIn ? 'Save Changes' : isEdit ? 'Update Quote' : 'Add Quote'}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
