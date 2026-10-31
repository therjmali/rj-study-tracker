import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Pin, Loader2, ImageIcon, Clock } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Switch } from '@project/components/ui/switch';
import { Label } from '@project/components/ui/label';
import { toast } from 'sonner';
import { useUpload } from '@/platform/upload';
import type { Reminder, ReminderColor, ReminderDateMode, ReminderTimeMode } from '../../types';
import { REMINDER_COLORS } from '../../types';
import AnalogClock from './AnalogClock';
import ImageLightbox from './ImageLightbox';

const DATE_MODES: { id: ReminderDateMode; label: string; emoji: string }[] = [
  { id: 'every_day', label: 'Every Day', emoji: '🔄' },
  { id: 'single', label: 'Single Date', emoji: '📅' },
  { id: 'range', label: 'Date Range', emoji: '📆' },
  { id: 'specific_dates', label: 'Pick Dates', emoji: '🗓️' },
];

const TIME_MODES: { id: ReminderTimeMode; label: string; emoji: string }[] = [
  { id: 'on_app_open', label: 'On App Open', emoji: '🚀' },
  { id: 'full_day', label: 'Full Day', emoji: '☀️' },
  { id: 'custom_window', label: 'Custom Time', emoji: '⏰' },
];

interface Props {
  initial?: Reminder | null;
  onSave: (r: Reminder) => void;
  onCancel: () => void;
}

export default function ReminderForm({ initial, onSave, onCancel }: Props) {
  const isEdit = !!initial;
  const { upload } = useUpload();
  const [title, setTitle] = useState(initial?.title || '');
  const [content, setContent] = useState(initial?.content || '');
  const [color, setColor] = useState<ReminderColor>(initial?.color || 'primary');
  const [dateMode, setDateMode] = useState<ReminderDateMode>(initial?.dateMode || 'every_day');
  const [dateFrom, setDateFrom] = useState(initial?.dateFrom || '');
  const [dateTo, setDateTo] = useState(initial?.dateTo || '');
  const [specificDates, setSpecificDates] = useState<string[]>(initial?.specificDates || []);
  const [newSpecDate, setNewSpecDate] = useState('');
  const [timeMode, setTimeMode] = useState<ReminderTimeMode>(initial?.timeMode || 'on_app_open');
  const [timeFrom, setTimeFrom] = useState(initial?.timeFrom || '08:00');
  const [timeTo, setTimeTo] = useState(initial?.timeTo || '22:00');
  const [pinned, setPinned] = useState(initial?.pinned || false);
  const [images, setImages] = useState(initial?.images || []);
  const [uploading, setUploading] = useState(false);
  const [clockField, setClockField] = useState<'from' | 'to' | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) { toast.error('Only images allowed'); continue; }
        const { url } = await upload(file);
        setImages(prev => [...prev, { id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, url: url, name: file.name }]);
      }
      toast.success('Image uploaded');
    } catch { toast.error('Upload failed'); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSave = () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    onSave({
      id: initial?.id || `rem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(), content, images, color, dateMode,
      dateFrom: dateMode === 'single' || dateMode === 'range' ? dateFrom : undefined,
      dateTo: dateMode === 'range' ? dateTo : undefined,
      specificDates: dateMode === 'specific_dates' ? specificDates : undefined,
      timeMode,
      timeFrom: timeMode === 'custom_window' ? timeFrom : undefined,
      timeTo: timeMode === 'custom_window' ? timeTo : undefined,
      enabled: initial?.enabled ?? true, pinned,
      snoozedUntil: initial?.snoozedUntil,
      createdAt: initial?.createdAt || new Date().toISOString(),
      dismissedDates: initial?.dismissedDates || [],
    });
  };

  const formatTime12 = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hN = isNaN(h) ? 0 : h;
    const mN = isNaN(m) ? 0 : m;
    return `${hN % 12 || 12}:${String(mN).padStart(2, '0')} ${ampm}`;
  };

  return (
    <div className="space-y-4 pb-2">
      {/* Title */}
      <div>
        <Label className="text-[10px] font-bold text-muted-foreground">Title *</Label>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Study reminder..." className="mt-1 h-9 text-sm" />
      </div>

      {/* Sticky Note Content */}
      <div>
        <Label className="text-[10px] font-bold text-muted-foreground">📝 Sticky Note</Label>
        <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Write your reminder note..." rows={3} className="mt-1 text-sm resize-none" />
      </div>

      {/* Color */}
      <div>
        <Label className="text-[10px] font-bold text-muted-foreground">🎨 Color</Label>
        <div className="flex gap-2 mt-1.5">
          {REMINDER_COLORS.map(c => (
            <button key={c.id} onClick={() => setColor(c.id)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${color === c.id ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110' : 'opacity-60 hover:opacity-100'}`}>
              {c.emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Date Mode */}
      <div>
        <Label className="text-[10px] font-bold text-muted-foreground">📅 When (Date)</Label>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          {DATE_MODES.map(dm => (
            <button key={dm.id} onClick={() => setDateMode(dm.id)}
              className={`text-[11px] font-semibold py-2 px-3 rounded-lg border transition-all flex items-center gap-1.5 ${dateMode === dm.id ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card/30 border-border/20 text-muted-foreground hover:bg-card/50'}`}>
              <span>{dm.emoji}</span> {dm.label}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          {dateMode === 'single' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-2 h-8 text-xs" />
            </motion.div>
          )}
          {dateMode === 'range' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex gap-2 mt-2">
                <div className="flex-1"><label className="text-[9px] text-muted-foreground font-bold">From</label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs" /></div>
                <div className="flex-1"><label className="text-[9px] text-muted-foreground font-bold">To</label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs" /></div>
              </div>
            </motion.div>
          )}
          {dateMode === 'specific_dates' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex gap-2 mt-2">
                <Input type="date" value={newSpecDate} onChange={e => setNewSpecDate(e.target.value)} className="h-8 text-xs flex-1" />
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                  if (newSpecDate && !specificDates.includes(newSpecDate)) { setSpecificDates(prev => [...prev, newSpecDate].sort()); setNewSpecDate(''); }
                }}><Plus className="w-3 h-3" /></Button>
              </div>
              {specificDates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {specificDates.map(d => (
                    <span key={d} className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center gap-1">
                      {d} <button onClick={() => setSpecificDates(prev => prev.filter(x => x !== d))}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Time Mode */}
      <div>
        <Label className="text-[10px] font-bold text-muted-foreground">⏰ When (Time)</Label>
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          {TIME_MODES.map(tm => (
            <button key={tm.id} onClick={() => { setTimeMode(tm.id); setClockField(null); }}
              className={`text-[10px] font-semibold py-2 px-2 rounded-lg border transition-all text-center ${timeMode === tm.id ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card/30 border-border/20 text-muted-foreground hover:bg-card/50'}`}>
              <span className="block text-sm mb-0.5">{tm.emoji}</span> {tm.label}
            </button>
          ))}
        </div>
        <AnimatePresence>
          {timeMode === 'custom_window' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-3 space-y-3">
                {/* Time buttons */}
                <div className="flex gap-2">
                  <TimeButton label="From" time={timeFrom} active={clockField === 'from'} onClick={() => setClockField(clockField === 'from' ? null : 'from')} formatFn={formatTime12} />
                  <TimeButton label="To" time={timeTo} active={clockField === 'to'} onClick={() => setClockField(clockField === 'to' ? null : 'to')} formatFn={formatTime12} />
                </div>

                {/* Analog clock */}
                <AnimatePresence>
                  {clockField && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden rounded-2xl border border-primary/15 bg-card/50"
                    >
                      <div className="px-3 py-2 border-b border-border/10 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-primary">
                          ⌚ Set {clockField === 'from' ? 'Start' : 'End'} Time
                        </span>
                        <button onClick={() => setClockField(null)} className="text-[10px] text-muted-foreground hover:text-foreground font-bold">Done ✓</button>
                      </div>
                      <AnalogClock
                        value={clockField === 'from' ? timeFrom : timeTo}
                        onChange={(v) => clockField === 'from' ? setTimeFrom(v) : setTimeTo(v)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Images — Enhanced Gallery */}
      <div>
        <Label className="text-[10px] font-bold text-muted-foreground">🖼️ Attachments</Label>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleImageUpload} />

        {/* Image grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {images.map((img, i) => (
              <div key={img.id} className="relative group">
                <button
                  onClick={() => setLightboxIdx(i)}
                  className="w-full aspect-square rounded-xl overflow-hidden border border-border/20 bg-card/30 hover:border-primary/30 transition-all"
                >
                  <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </button>
                <button onClick={() => setImages(prev => prev.filter(x => x.id !== img.id))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10">
                  <X className="w-3 h-3" />
                </button>
                <p className="text-[8px] text-muted-foreground font-medium truncate mt-1 px-0.5">{img.name}</p>
              </div>
            ))}
          </div>
        )}

        {/* Upload area */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full mt-2 py-4 rounded-xl border-2 border-dashed border-border/30 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 transition-all"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <ImageIcon className="w-5 h-5" />
              <span className="text-[10px] font-bold">Tap to add images</span>
              <span className="text-[8px] text-muted-foreground/60">JPG, PNG, WebP</span>
            </>
          )}
        </button>
      </div>

      {/* Pin toggle */}
      <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-card/30 border border-border/15">
        <div className="flex items-center gap-2">
          <Pin className="w-4 h-4 text-chart-4" />
          <div><p className="text-xs font-semibold text-foreground">Pin Reminder</p>
            <p className="text-[9px] text-muted-foreground">Shows even after dismiss until unpinned</p></div>
        </div>
        <Switch checked={pinned} onCheckedChange={setPinned} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1 h-10 text-xs font-bold">Cancel</Button>
        <Button onClick={handleSave} className="flex-1 h-10 text-xs font-bold">{isEdit ? '💾 Update' : '✨ Create'} Reminder</Button>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIdx !== null && (
          <ImageLightbox images={images} initialIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function TimeButton({ label, time, active, onClick, formatFn }: { label: string; time: string; active: boolean; onClick: () => void; formatFn: (t: string) => string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center gap-2 p-2.5 rounded-xl border transition-all ${
        active ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/20' : 'bg-card/30 border-border/20 hover:border-border/40'
      }`}
    >
      <Clock className={`w-4 h-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
      <div className="text-left">
        <p className="text-[9px] font-bold text-muted-foreground">{label}</p>
        <p className={`text-sm font-black font-mono ${active ? 'text-primary' : 'text-foreground'}`}>{formatFn(time)}</p>
      </div>
    </button>
  );
}
