import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Switch } from '@project/components/ui/switch';
import { Camera, X, Loader2, ImagePlus, Upload, Type, Link2, Unlink } from 'lucide-react';
// Select removed — text size uses button pills now
import { useUpload } from '@/platform/upload';
import { toast } from 'sonner';
import BottomSheet from '../shared/BottomSheet';
import type { Subject, UserSettings } from '../../types';

const PRESET_COLORS = ['#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#3b82f6', '#f97316', '#14b8a6', '#f43f5e', '#a855f7', '#84cc16'];

const FONT_SIZE_MAP: Record<string, { unit: string; module: string; topic: string }> = {
  small:  { unit: '18px', module: '11px', topic: '13px' },
  normal: { unit: '24px', module: '14px', topic: '16px' },
  large:  { unit: '28px', module: '17px', topic: '19px' },
  xlarge: { unit: '32px', module: '20px', topic: '22px' },
};

function getPreviewSize(value: string, level: 'unit' | 'module' | 'topic'): string {
  if (value.startsWith('custom:')) return value.replace('custom:', '');
  return FONT_SIZE_MAP[value]?.[level] || FONT_SIZE_MAP.normal[level];
}

function getPresetKey(value: string): string {
  if (value.startsWith('custom:')) return 'custom';
  return value;
}
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/** Global sizes (Settings → Text Size & Layout) expressed in the per-subject `custom:NNpx` format. */
function getUniversalFontSizes(): { unitFontSize?: string; moduleFontSize?: string; topicFontSize?: string } {
  try {
    const raw = localStorage.getItem('nursing-settings-v2');
    if (!raw) return {};
    const ts = (JSON.parse(raw) as UserSettings).textSizes;
    const out: { unitFontSize?: string; moduleFontSize?: string; topicFontSize?: string } = {};
    if (ts?.unit && ts.unit !== 24) out.unitFontSize = `custom:${ts.unit}px`;
    if (ts?.module && ts.module !== 14) out.moduleFontSize = `custom:${ts.module}px`;
    if (ts?.topic && ts.topic !== 16) out.topicFontSize = `custom:${ts.topic}px`;
    return out;
  } catch { return {}; }
}

function getUniversalLabel(level: 'unit' | 'module' | 'topic', ufs: { unitFontSize?: string; moduleFontSize?: string; topicFontSize?: string }): string {
  const key = level === 'unit' ? 'unitFontSize' : level === 'module' ? 'moduleFontSize' : 'topicFontSize';
  const val = ufs[key];
  if (!val || val === 'normal') return 'Normal';
  if (val.startsWith('custom:')) return val.replace('custom:', '');
  return val.charAt(0).toUpperCase() + val.slice(1);
}

const SUBJECT_ICONS = [
  { label: 'Medical & Nursing', icons: ['🏥', '💊', '🩺', '❤️', '🧠', '🦴', '👶', '🫁', '🔬', '💉', '🩻', '🧬', '🫀', '🦷', '👁️', '🩸', '🩹', '⚕️'] },
  { label: 'Agriculture & Science', icons: ['🌾', '🌱', '🌿', '🍃', '🌳', '🌻', '🐄', '🐔', '💧', '☀️', '🐛', '🦠', '🌍', '🧪'] },
  { label: 'Study & Education', icons: ['📚', '📖', '✏️', '🎓', '📝', '💡', '📊', '🔍', '🎯', '⭐', '🏆', '📐', '🧑‍🏫'] },
  { label: 'Numbers & Letters', icons: ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔤', '🅰️', '🅱️'] },
  { label: 'Symbols', icons: ['🌟', '🔥', '💎', '🎨', '🌈', '⚡', '🚀', '🌸', '🍀', '✨', '🛡️', '🏅', '💫', '🎵', '🧩'] },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (subject: Subject) => void;
  editSubject?: Subject | null;
}

export default function AddSubjectSheet({ open, onClose, onSave, editSubject }: Props) {
  const { upload } = useUpload();
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [examDate, setExamDate] = useState('');
  const [image, setImage] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [icon, setIcon] = useState('📚');
  const [iconSize, setIconSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [iconShape, setIconShape] = useState<'square' | 'circle'>('square');
  const [customIconUrl, setCustomIconUrl] = useState('');
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [showTopicNumbers, setShowTopicNumbers] = useState(false);
  const [hideHashSuffix, setHideHashSuffix] = useState(false);
  const [unitFontSize, setUnitFontSize] = useState<string>('normal');
  const [moduleFontSize, setModuleFontSize] = useState<string>('normal');
  const [topicFontSize, setTopicFontSize] = useState<string>('normal');
  const fileRef = useRef<HTMLInputElement>(null);
  const iconFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editSubject) {
      setName(editSubject.name);
      setShortName(editSubject.shortName);
      setColor(editSubject.color);
      setExamDate(editSubject.examDate);
      setImage(editSubject.image);
      setIcon(editSubject.icon || '📚');
      setIconShape(editSubject.iconShape || 'square');
      setIconSize(editSubject.iconSize || 'md');
      const existingIcon = editSubject.icon || '';
      if (existingIcon.startsWith('http')) { setCustomIconUrl(existingIcon); } else { setCustomIconUrl(''); }
      setShowTopicNumbers(editSubject.showTopicNumbers || false);
      setHideHashSuffix(editSubject.hideHashSuffix || false);
      setUnitFontSize(editSubject.unitFontSize as string || 'normal');
      setModuleFontSize(editSubject.moduleFontSize as string || 'normal');
      setTopicFontSize(editSubject.topicFontSize as string || 'normal');
    } else {
      setName(''); setShortName(''); setColor(PRESET_COLORS[0]); setExamDate(''); setImage(undefined);
      setIcon('📚'); setIconShape('square'); setIconSize('md'); setCustomIconUrl(''); setShowTopicNumbers(false); setHideHashSuffix(false);
      setUnitFontSize('normal'); setModuleFontSize('normal'); setTopicFontSize('normal');
    }
  }, [editSubject, open]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > MAX_FILE_SIZE) { toast.error('Image must be under 2 MB'); return; }
    setUploading(true);
    try {
      const { url } = await upload(file);
      setImage(url);
      toast.success('📸 Image uploaded!');
    } catch { toast.error('Upload failed, try again'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Icon must be under 2MB'); return; }
    setUploadingIcon(true);
    try {
      const { url } = await upload(file);
      setCustomIconUrl(url);
      setIcon(url);
      toast.success('Custom icon uploaded!');
    } catch { toast.error('Failed to upload icon'); }
    setUploadingIcon(false);
    if (iconFileRef.current) iconFileRef.current.value = '';
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const iconFields = { icon: customIconUrl || icon, iconShape, iconSize };
    const fontFields = {
      unitFontSize: unitFontSize === 'normal' ? undefined : unitFontSize as any,
      moduleFontSize: moduleFontSize === 'normal' ? undefined : moduleFontSize as any,
      topicFontSize: topicFontSize === 'normal' ? undefined : topicFontSize as any,
    };
    const subject: Subject = editSubject
      ? { ...editSubject, ...iconFields, ...fontFields, name: name.trim(), shortName: shortName.trim() || name.trim().slice(0, 4).toUpperCase(), color, examDate, image, showTopicNumbers, hideHashSuffix }
      : { id: `custom-${Date.now()}`, ...iconFields, ...fontFields, name: name.trim(), shortName: shortName.trim() || name.trim().slice(0, 4).toUpperCase(), color, examDate, image, showTopicNumbers, hideHashSuffix, units: [] };
    onSave(subject);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={editSubject ? '✏️ Edit Subject' : '➕ Add Subject'}>
      <div className="space-y-4">
        {/* Subject Image */}
        <div>
          <Label className="text-xs text-muted-foreground font-semibold">📷 Subject Cover Image</Label>
          <div className="mt-2 flex items-center gap-3">
            {image ? (
              <div className="relative group">
                <img src={image} alt="Subject" className="w-24 h-24 rounded-2xl object-cover border-2 border-border/30 shadow-lg" />
                <button onClick={() => setImage(undefined)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-24 h-24 rounded-2xl border-2 border-dashed border-border/40 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-95 disabled:opacity-50">
                {uploading ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <ImagePlus className="w-5 h-5 text-muted-foreground" />}
                <span className="text-[8px] text-muted-foreground font-semibold">{uploading ? 'Uploading...' : 'Add Image'}</span>
              </button>
            )}
            {image && (
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="text-xs gap-1.5">
                <Camera className="w-3.5 h-3.5" /> Change
              </Button>
            )}
          </div>
          <div className="mt-1.5 px-2.5 py-1.5 rounded-lg bg-muted/15 border border-border/10">
            <p className="text-[9px] text-muted-foreground leading-relaxed font-medium">
              📐 <strong>Recommended:</strong> 400×400px square · JPG/PNG/WebP · Max 5 MB
              <br />💡 Image will be cropped to square. Use a clear, high-contrast image for best results.
              <br />🎨 This is the subject cover/icon shown on cards and the syllabus view.
            </p>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageUpload} />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Subject Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pharmacology" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Short Name</Label>
          <Input value={shortName} onChange={e => setShortName(e.target.value)} placeholder="e.g. PHARM" className="mt-1" maxLength={6} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Color</Label>
          <div className="flex gap-2 mt-1.5 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-9 h-9 rounded-full border-2 transition-all shadow-sm ${color === c ? 'border-foreground scale-110 shadow-lg ring-2 ring-offset-2 ring-offset-background ring-primary' : 'border-transparent hover:scale-105'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Exam Date</Label>
          <Input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} className="mt-1" />
        </div>

        {/* ── Icon Selection with shape & size ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-bold text-foreground/70">Subject Icon</Label>
            <div className="flex items-center gap-2">
              {/* Shape toggle */}
              <div className="flex items-center gap-0.5 bg-muted/20 rounded-full p-0.5">
                <button onClick={() => setIconShape('square')}
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold transition-all flex items-center gap-0.5 ${
                    iconShape === 'square' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}>🟥 Square</button>
                <button onClick={() => setIconShape('circle')}
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold transition-all flex items-center gap-0.5 ${
                    iconShape === 'circle' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}>🔵 Circle</button>
              </div>
              {/* Size toggle */}
              <div className="flex items-center gap-0.5 bg-muted/20 rounded-full p-0.5">
                {(['sm', 'md', 'lg'] as const).map(size => (
                  <button key={size} onClick={() => setIconSize(size)}
                    className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold transition-all ${
                      iconSize === size ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}>
                    {size === 'sm' ? 'S' : size === 'md' ? 'M' : 'L'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Custom Icon Upload */}
          <input ref={iconFileRef} type="file" accept="image/*" className="hidden" onChange={handleIconUpload} />
          <div className="flex items-center gap-2 mb-3">
            {(() => {
              const sizeClass = iconSize === 'sm' ? 'w-8 h-8 text-base' : iconSize === 'lg' ? 'w-12 h-12 text-2xl' : 'w-10 h-10 text-lg';
              const shapeClass = iconShape === 'circle' ? 'rounded-full' : 'rounded-xl';
              return customIconUrl ? (
                <div className="relative group">
                  <img src={customIconUrl} alt="Custom icon" className={`${sizeClass} ${shapeClass} object-cover border-2 border-primary/30 shadow-md`} />
                  <button onClick={() => { setCustomIconUrl(''); setIcon('📚'); }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ) : (
                <button onClick={() => iconFileRef.current?.click()} disabled={uploadingIcon}
                  className={`${sizeClass} ${shapeClass} border-2 border-dashed border-border/30 flex items-center justify-center hover:border-primary/30 hover:bg-primary/5 transition-all`}>
                  {uploadingIcon ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
                </button>
              );
            })()}
            <span className="text-[10px] text-muted-foreground font-medium">
              {customIconUrl ? 'Custom icon set' : 'Upload custom icon'}
            </span>
          </div>

          {/* Emoji picker by category */}
          {!customIconUrl && (() => {
            const sizeClass = iconSize === 'sm' ? 'w-8 h-8 text-base' : iconSize === 'lg' ? 'w-12 h-12 text-2xl' : 'w-10 h-10 text-lg';
            const shapeClass = iconShape === 'circle' ? 'rounded-full' : 'rounded-xl';
            return (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {SUBJECT_ICONS.map(group => (
                  <div key={group.label}>
                    <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-1">{group.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.icons.map(i => (
                        <button key={i} onClick={() => setIcon(i)}
                          className={`${sizeClass} ${shapeClass} flex items-center justify-center transition-all ${
                            icon === i ? 'bg-primary/20 ring-2 ring-primary scale-110 shadow-md' : 'bg-card/30 hover:bg-card/50 hover:scale-105'
                          }`}>{i}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Show Topic Numbers Toggle */}
        <div className="flex items-center justify-between rounded-xl bg-muted/15 border border-border/15 p-3">
          <div className="space-y-0.5">
            <Label className="text-xs font-bold text-foreground/80">Show Topic Numbers</Label>
            <p className="text-[10px] text-muted-foreground">Display sequential numbers across all units</p>
          </div>
          <Switch checked={showTopicNumbers} onCheckedChange={setShowTopicNumbers} />
        </div>

        {/* Hide Hash Suffix Toggle */}
        <div className="flex items-center justify-between rounded-xl bg-muted/15 border border-border/15 p-3">
          <div className="space-y-0.5">
            <Label className="text-xs font-bold text-foreground/80">Hide # Suffix</Label>
            <p className="text-[10px] text-muted-foreground">Hide video/lecture IDs after # in topic names</p>
          </div>
          <Switch checked={hideHashSuffix} onCheckedChange={setHideHashSuffix} />
        </div>

        {/* ── Per-Subject Text Sizes ── */}
        <div className="rounded-xl bg-muted/15 border border-border/15 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-primary/70" />
            <Label className="text-xs font-bold text-foreground/80">🔤 Text Sizes</Label>
          </div>
          <div className="space-y-3">
            {((() => {
              const ufs = getUniversalFontSizes();
              return [
              { label: 'Unit', value: unitFontSize, set: setUnitFontSize, level: 'unit' as const, defaults: { small: '18', normal: '24', large: '28', xlarge: '32' }, universalLabel: getUniversalLabel('unit', ufs) },
              { label: 'Module', value: moduleFontSize, set: setModuleFontSize, level: 'module' as const, defaults: { small: '11', normal: '14', large: '17', xlarge: '20' }, universalLabel: getUniversalLabel('module', ufs) },
              { label: 'Topic', value: topicFontSize, set: setTopicFontSize, level: 'topic' as const, defaults: { small: '13', normal: '16', large: '19', xlarge: '22' }, universalLabel: getUniversalLabel('topic', ufs) },
            ];})()).map(ctrl => {
              const preset = getPresetKey(ctrl.value);
              const isCustom = preset === 'custom';
              const customPx = isCustom ? ctrl.value.replace('custom:', '').replace('px', '') : '';
              const isLinked = ctrl.value === 'normal' || !ctrl.value;
              return (
                <div key={ctrl.label} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{ctrl.label}</span>
                    <button
                      onClick={() => {
                        if (isLinked) {
                          // Unlink — set to the current universal value so it becomes an independent override
                          const ufs = getUniversalFontSizes();
                          const key = ctrl.level === 'unit' ? 'unitFontSize' : ctrl.level === 'module' ? 'moduleFontSize' : 'topicFontSize';
                          const uVal = ufs[key] || 'normal';
                          ctrl.set(uVal === 'normal' ? 'normal' : uVal);
                          toast('🔓 Unlinked — using independent size', { duration: 1500 });
                        } else {
                          // Link — reset to normal so it follows universal
                          ctrl.set('normal');
                          toast('♾️ Linked to universal text size', { duration: 1500 });
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all active:scale-95 ${
                        isLinked
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'border-border/30 bg-card/30 text-muted-foreground hover:border-primary/30 hover:bg-primary/5'
                      }`}
                      title={isLinked ? 'Using universal size — tap to unlink' : 'Tap to link to universal size'}
                    >
                      {isLinked ? <Link2 className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}
                      {isLinked ? `♾️ Universal (${ctrl.universalLabel})` : 'Link ♾️'}
                    </button>
                  </div>
                  {!isLinked && (
                    <>
                      <div className="flex gap-1.5 flex-wrap">
                        {([
                          { key: 'small', label: 'Small', emoji: 'S' },
                          { key: 'normal', label: 'Normal', emoji: 'M' },
                          { key: 'large', label: 'Large', emoji: 'L' },
                          { key: 'xlarge', label: 'XL', emoji: 'XL' },
                          { key: 'custom', label: 'Custom', emoji: '✏️' },
                        ]).map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => {
                              if (opt.key === 'custom') {
                                ctrl.set(`custom:${ctrl.defaults.normal}px`);
                              } else {
                                ctrl.set(opt.key);
                              }
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all active:scale-95 ${
                              preset === opt.key
                                ? 'border-primary bg-primary/15 text-primary shadow-sm'
                                : 'border-border/30 bg-card/30 text-muted-foreground hover:border-border/50 hover:bg-muted/20'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {isCustom && (
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            type="number"
                            min={8}
                            max={48}
                            value={customPx}
                            onChange={e => ctrl.set(`custom:${e.target.value}px`)}
                            className="h-7 w-20 text-xs font-mono text-center"
                            placeholder="px"
                          />
                          <span className="text-[10px] text-muted-foreground font-semibold">px</span>
                          <input
                            type="range"
                            min={8}
                            max={48}
                            value={parseInt(customPx) || 16}
                            onChange={e => ctrl.set(`custom:${e.target.value}px`)}
                            className="flex-1 h-1.5 accent-primary"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {/* Live Preview */}
          <div className="rounded-lg border border-border/20 bg-card/50 p-3 space-y-1.5">
            <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">Preview</span>
            <p className="font-extrabold leading-tight" style={{ fontSize: getPreviewSize(unitFontSize, 'unit'), color: color || 'hsl(var(--foreground))' }}>
              Unit 3: Normal Obstetrics
            </p>
            <p className="font-bold uppercase tracking-wider" style={{ fontSize: getPreviewSize(moduleFontSize, 'module'), color: 'hsl(var(--foreground) / 0.8)' }}>
              🗂️ Pre‑pregnancy Care
            </p>
            <p className="font-semibold" style={{ fontSize: getPreviewSize(topicFontSize, 'topic'), color: 'hsl(var(--foreground) / 0.85)' }}>
              📖 Antenatal Care (ANC)
            </p>
          </div>
        </div>

        <Button className="w-full" onClick={handleSave} disabled={!name.trim()}>
          {editSubject ? 'Save Changes' : 'Add Subject'}
        </Button>
      </div>
    </BottomSheet>
  );
}
