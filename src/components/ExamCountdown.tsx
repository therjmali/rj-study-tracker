import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Download, Trash2, Pencil, ImageIcon, Upload, X } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Checkbox } from '@project/components/ui/checkbox';
import { Label } from '@project/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useClock } from '../hooks/useClock';
import { useUpload } from '@/platform/upload';
import type { Subject, ExamConfig } from '../types';
import BottomSheet from './shared/BottomSheet';
import GlowCard from './shared/GlowCard';
import ExamPosterCard, { computeExamPosterData } from './shared/ExamPosterCard';

const EMOJIS = ['📝', '🩺', '🏥', '📋', '🧪', '💉', '👶', '🧠', '🫀', '📚'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

interface Props {
  subjects: Subject[];
  exams: ExamConfig[];
  onUpdateExams: (exams: ExamConfig[]) => void;
}

export default function ExamCountdown({ subjects, exams, onUpdateExams }: Props) {
  const now = useClock();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamConfig | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formLabel, setFormLabel] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formEmoji, setFormEmoji] = useState('📝');
  const [formSubjects, setFormSubjects] = useState<string[]>([]);
  const [formIconUrl, setFormIconUrl] = useState('');
  const [formBgImage, setFormBgImage] = useState('');

  const openAdd = () => {
    setEditingExam(null);
    setFormLabel(''); setFormDate(''); setFormTime(''); setFormEmoji('📝'); setFormSubjects([]); setFormIconUrl(''); setFormBgImage('');
    setSheetOpen(true);
  };

  const openEdit = (exam: ExamConfig) => {
    setEditingExam(exam);
    setFormLabel(exam.label); setFormDate(exam.date); setFormTime(exam.time || ''); setFormEmoji(exam.emoji); setFormSubjects([...exam.subjects]);
    setFormIconUrl(exam.iconUrl || ''); setFormBgImage(exam.backgroundImage || '');
    setSheetOpen(true);
  };

  const toggleSubject = (id: string) => {
    setFormSubjects(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const saveExam = useCallback(() => {
    if (!formLabel.trim() || !formDate) { toast.error('Fill in name and date'); return; }
    const timeVal = formTime || undefined;
    if (editingExam) {
      onUpdateExams(exams.map(e => e.id !== editingExam.id ? e : {
        ...e, label: formLabel.trim(), date: formDate, time: timeVal, emoji: formEmoji || '📝', subjects: formSubjects,
        iconUrl: formIconUrl.trim() || undefined, backgroundImage: formBgImage.trim() || undefined,
      }));
      toast.success('Exam updated!');
    } else {
      const exam: ExamConfig = {
        id: `exam-${Date.now()}`, label: formLabel.trim(), date: formDate, time: timeVal,
        subjects: formSubjects, color: '#6366F1', emoji: formEmoji || '📝', isCustom: true,
        iconUrl: formIconUrl.trim() || undefined, backgroundImage: formBgImage.trim() || undefined,
      };
      onUpdateExams([...exams, exam]);
      toast.success('Exam added!');
    }
    setSheetOpen(false);
  }, [formLabel, formDate, formTime, formEmoji, formSubjects, formIconUrl, formBgImage, editingExam, exams, onUpdateExams]);

  const confirmDelete = useCallback(() => {
    if (!deleteId) return;
    onUpdateExams(exams.filter(e => e.id !== deleteId));
    setDeleteId(null);
    toast.success('Exam removed');
  }, [deleteId, exams, onUpdateExams]);

  const exportICS = useCallback((exam: ExamConfig) => {
    const t = exam.time || '09:00';
    const [h, m] = t.split(':');
    const start = exam.date.replace(/-/g, '') + `T${h}${m}00`;
    const endH = String(Math.min(23, Number(h) + 3)).padStart(2, '0');
    const end = exam.date.replace(/-/g, '') + `T${endH}${m}00`;
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${start}\nDTEND:${end}\nSUMMARY:${exam.label}\nDESCRIPTION:Exam - ${exam.label}\nEND:VEVENT\nEND:VCALENDAR`;
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${exam.label.replace(/\s+/g, '_')}.ics`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Calendar file downloaded!');
  }, []);

  const sorted = [...exams].sort((a, b) => {
    const da = new Date(`${a.date}T${a.time || '00:00'}:00`).getTime() - now.getTime();
    const db_val = new Date(`${b.date}T${b.time || '00:00'}:00`).getTime() - now.getTime();
    if (da > 0 && db_val > 0) return da - db_val;
    if (da > 0) return -1;
    if (db_val > 0) return 1;
    return db_val - da;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">⏰ Exam Countdown</h2>
        <Button variant="outline" size="sm" onClick={openAdd} className="gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" /> Add Exam
        </Button>
      </div>

      {exams.length === 0 && (
        <div className="glass-card p-8 text-center">
          <span className="text-4xl">📅</span>
          <p className="text-sm text-muted-foreground mt-3">No exams added yet. Tap + to create one.</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((exam, i) => {
          const posterData = computeExamPosterData(exam, subjects, now);
          const glowColor = posterData.isPast ? 'none' as const : posterData.days <= 3 ? 'red' as const : posterData.days <= 14 ? 'amber' as const : 'cyan' as const;
          return (
            <motion.div key={exam.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <GlowCard glow={glowColor} className="relative overflow-hidden">
                <ExamPosterCard data={posterData} onManage={() => openEdit(exam)} />
                {/* Action buttons */}
                <div className="flex items-center justify-end gap-1 px-4 pb-3 -mt-1">
                  <button onClick={() => openEdit(exam)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Edit">
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => exportICS(exam)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Download .ics">
                    <Download className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => setDeleteId(exam.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="Delete">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </GlowCard>
            </motion.div>
          );
        })}
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editingExam ? '✏️ Edit Exam' : '➕ Add Exam'} zIndex={110}>
        <ExamForm
          label={formLabel} date={formDate} time={formTime} emoji={formEmoji} linkedSubjects={formSubjects}
          subjects={subjects} isEdit={!!editingExam}
          iconUrl={formIconUrl} bgImage={formBgImage}
          onLabelChange={setFormLabel} onDateChange={setFormDate} onTimeChange={setFormTime}
          onEmojiChange={setFormEmoji} onToggleSubject={toggleSubject} onSave={saveExam}
          onIconUrlChange={setFormIconUrl} onBgImageChange={setFormBgImage}
        />
      </BottomSheet>

      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent className="glass-card bg-card/90 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Exam?</AlertDialogTitle>
            <AlertDialogDescription>This exam will be permanently removed. This cannot be undone.</AlertDialogDescription>
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

/* ─── File Upload Button ─────────────────────────────────── */
function ImageUploadField({ label, helperText, value, onChange, placeholder }: {
  label: string; helperText?: string; value: string; onChange: (url: string) => void; placeholder?: string;
}) {
  const { upload, isUploading } = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File too large. Max 5 MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }
    try {
      const { url } = await upload(file);
      onChange(url);
      toast.success('Image uploaded!');
    } catch {
      toast.error('Upload failed. Try again.');
    }
  };

  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label} {helperText && <span className="text-muted-foreground/60">{helperText}</span>}</label>
      <div className="flex gap-2">
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || 'https://example.com/image.png'} className="text-xs flex-1" />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={isUploading} className="gap-1 text-[10px] shrink-0">
          <Upload className="w-3 h-3" />
          {isUploading ? 'Uploading…' : 'Upload'}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      <p className="text-[9px] text-muted-foreground/50 mt-0.5">Max 5 MB · JPG, PNG, WebP</p>

      {value && (
        <div className="mt-1.5 flex items-center gap-2">
          <img src={value} alt="" className="w-10 h-10 rounded-lg object-cover border border-border/20" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span className="text-[10px] text-muted-foreground">Preview</span>
          <button onClick={() => onChange('')} className="ml-auto p-1 rounded-lg hover:bg-destructive/10 transition-colors">
            <X className="w-3 h-3 text-destructive" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Form ────────────────────────────────────────────────── */
function ExamForm({ label, date, time, emoji, linkedSubjects, subjects, isEdit, iconUrl, bgImage, onLabelChange, onDateChange, onTimeChange, onEmojiChange, onToggleSubject, onSave, onIconUrlChange, onBgImageChange }: {
  label: string; date: string; time: string; emoji: string; linkedSubjects: string[]; subjects: Subject[]; isEdit: boolean;
  iconUrl: string; bgImage: string;
  onLabelChange: (v: string) => void; onDateChange: (v: string) => void; onTimeChange: (v: string) => void;
  onEmojiChange: (v: string) => void; onToggleSubject: (id: string) => void; onSave: () => void;
  onIconUrlChange: (v: string) => void; onBgImageChange: (v: string) => void;
}) {
  const hasIcon = !!iconUrl;

  return (
    <div className="space-y-4 pt-2">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Exam Name</label>
        <Input value={label} onChange={e => onLabelChange(e.target.value)} placeholder="e.g., NORCET-11 Stage I" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">📅 Date</label>
          <Input type="date" value={date} onChange={e => onDateChange(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">🕐 Time <span className="text-muted-foreground/60">(optional)</span></label>
          <Input type="time" value={time} onChange={e => onTimeChange(e.target.value)} placeholder="e.g. 09:00" />
          {!time && <p className="text-[9px] text-muted-foreground mt-0.5">Defaults to 00:00 (midnight)</p>}
        </div>
      </div>

      {/* Emoji picker — hidden when icon URL is set */}
      {!hasIcon && (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Emoji</label>
          <div className="flex gap-2 flex-wrap">
            {EMOJIS.map(e => (
              <button key={e} onClick={() => onEmojiChange(e)}
                className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all
                  ${emoji === e ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted'}`}>{e}</button>
            ))}
          </div>
        </div>
      )}

      {/* Custom Icon & Background — with file upload */}
      <div className="space-y-3 rounded-xl border border-border/15 bg-card/30 p-3">
        <Label className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-1.5">
          <ImageIcon className="w-3 h-3" /> Custom Visuals
        </Label>

        <ImageUploadField
          label="🖼️ Icon Image"
          helperText="(replaces emoji)"
          value={iconUrl}
          onChange={onIconUrlChange}
          placeholder="https://example.com/icon.png"
        />

        <ImageUploadField
          label="🎨 Background Image"
          helperText="(card background)"
          value={bgImage}
          onChange={onBgImageChange}
          placeholder="https://example.com/bg.jpg"
        />

        {/* Background preview — full width */}
        {bgImage && (
          <div className="rounded-lg overflow-hidden border border-border/20 h-20">
            <img src={bgImage} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        )}
      </div>

      {subjects.length > 0 && (
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Link Subjects (for readiness tracking)</label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {subjects.map(s => (
              <label key={s.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-card/50 cursor-pointer transition-colors">
                <Checkbox checked={linkedSubjects.includes(s.id)} onCheckedChange={() => onToggleSubject(s.id)} />
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-foreground">{s.name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{s.shortName}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <Button onClick={onSave} className="w-full">{isEdit ? 'Save Changes' : 'Add Exam'}</Button>
    </div>
  );
}


