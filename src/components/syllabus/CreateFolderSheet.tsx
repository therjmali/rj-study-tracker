import { useState, useEffect, useRef } from 'react';
import { ImagePlus, X, Loader2, Upload, Copy } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import { toast } from 'sonner';
import { useUpload } from '@/platform/upload';
import BottomSheet from '../shared/BottomSheet';
import type { Folder } from '../../types';

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F1948A', '#82E0AA', '#F0B27A', '#AED6F1'];

const ICON_GROUPS = [
  { label: 'Folders', icons: ['📁', '📂', '🗂️', '📦', '🏷️', '📋', '🗃️', '📎', '📌'] },
  { label: 'Medical & Nursing', icons: ['🏥', '💊', '🩺', '❤️', '🧠', '🦴', '👶', '🫁', '🔬', '💉', '🩻', '🧬', '🫀', '🦷', '👁️', '🩸', '🧫', '🩹', '🏨', '⚕️'] },
  { label: 'Agriculture & Science', icons: ['🌾', '🌱', '🌿', '🍃', '🌳', '🌻', '🐄', '🐔', '🧪', '🔭', '🧮', '🌍', '💧', '☀️', '🐛', '🦠'] },
  { label: 'Study & Education', icons: ['📚', '📖', '✏️', '🎓', '📝', '💡', '📊', '🔍', '🎯', '⭐', '🏆', '📐', '🖊️', '📓', '🗒️', '🧑‍🏫'] },
  { label: 'Numbers & Letters', icons: ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔤', '🅰️', '🅱️'] },
  { label: 'Symbols', icons: ['🌟', '🔥', '💎', '🎨', '🌈', '⚡', '🚀', '🎪', '🌸', '🍀', '🎵', '🧩', '🛡️', '🏅', '💫', '✨'] },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (folder: Folder) => void;
  editFolder?: Folder | null;
}

export default function CreateFolderSheet({ open, onClose, onSave, editFolder }: Props) {
  const { upload } = useUpload();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState('📁');
  const [customIconUrl, setCustomIconUrl] = useState('');
  const [description, setDescription] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [iconSize, setIconSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [iconShape, setIconShape] = useState<'square' | 'circle'>('square');
  const fileRef = useRef<HTMLInputElement>(null);
  const iconFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (editFolder) {
        setName(editFolder.name);
        setColor(editFolder.color);
        setIcon(editFolder.icon);
        setIconShape(editFolder.iconShape || 'square');
        setIconSize(editFolder.iconSize || 'md');
        setDescription(editFolder.description || '');
        setCoverImage(editFolder.coverImage || '');
        // Check if icon is a URL (custom uploaded)
        if (editFolder.icon.startsWith('http')) {
          setCustomIconUrl(editFolder.icon);
        } else {
          setCustomIconUrl('');
        }
      } else {
        setName('');
        setColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
        setIcon('📁');
        setCustomIconUrl('');
        setDescription('');
        setCoverImage('');
      }
    }
  }, [editFolder, open]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }
    setUploading(true);
    try {
      const { url } = await upload(file);
      setCoverImage(url);
      toast.success('Cover image uploaded!');
    } catch {
      toast.error('Failed to upload image');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Icon must be under 2MB'); return; }
    setUploadingIcon(true);
    try {
      const { url } = await upload(file);
      setCustomIconUrl(url);
      setIcon(url); // Store URL as icon
      toast.success('Custom icon uploaded!');
    } catch {
      toast.error('Failed to upload icon');
    }
    setUploadingIcon(false);
    if (iconFileRef.current) iconFileRef.current.value = '';
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: editFolder?.id || `folder-${Date.now()}`,
      name: name.trim(),
      color,
      icon: customIconUrl || icon,
      iconShape: iconShape,
      iconSize: iconSize,
      coverImage: coverImage || undefined,
      description: description.trim() || undefined,
      order: editFolder?.order ?? Date.now(),
      createdAt: editFolder?.createdAt || new Date().toISOString(),
    });
    onClose();
  };

  const iconSizeClass = iconSize === 'sm' ? 'w-8 h-8 text-base' : iconSize === 'lg' ? 'w-12 h-12 text-2xl' : 'w-10 h-10 text-lg';
  const iconShapeClass = iconShape === 'circle' ? 'rounded-full' : 'rounded-xl';

  return (
    <BottomSheet open={open} onClose={onClose} title={editFolder ? '✏️ Edit Folder' : '📁 New Folder'}>
      <div className="space-y-4">
        <div>
          <Label className="text-xs font-bold text-foreground/70">Folder Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" placeholder="e.g. OBG, Pediatrics..."
            onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
        </div>

        <div>
          <Label className="text-xs font-bold text-foreground/70">Description (optional)</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)}
            className="mt-1 text-xs min-h-[60px]" placeholder="Brief description of this folder..." />
        </div>

        {/* Cover Image */}
        <div>
          <Label className="text-xs font-bold text-foreground/70">Cover Image (optional)</Label>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          {coverImage ? (
            <>
              <div className="mt-1.5 relative rounded-xl overflow-hidden border border-border/20">
                <img src={coverImage} alt="Cover" className="w-full h-24 object-cover" />
                <button onClick={() => setCoverImage('')}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center border border-border/30">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Input value={coverImage} readOnly className="h-7 text-[10px] font-mono text-muted-foreground bg-muted/20 border-border/15 flex-1" />
                <button
                  onClick={() => { navigator.clipboard.writeText(coverImage); toast.success('📋 Cover URL copied!'); }}
                  className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center hover:bg-primary/20 transition-colors"
                  title="Copy cover URL"
                >
                  <Copy className="w-3 h-3 text-primary" />
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="mt-1.5 w-full h-20 rounded-xl border-2 border-dashed border-border/30 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
              <span className="text-[10px] font-semibold">{uploading ? 'Uploading...' : 'Add Cover Image'}</span>
            </button>
          )}
        </div>

        {/* Icon Selection — Enhanced with custom upload & size control */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-bold text-foreground/70">Icon</Label>
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
            {customIconUrl ? (
              <div className="relative group">
                <img src={customIconUrl} alt="Custom icon" className={`${iconSizeClass} ${iconShapeClass} object-cover border-2 border-primary/30 shadow-md`} />
                <button onClick={() => { setCustomIconUrl(''); setIcon('📁'); }}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ) : (
              <button onClick={() => iconFileRef.current?.click()} disabled={uploadingIcon}
                className={`${iconSizeClass} ${iconShapeClass} border-2 border-dashed border-border/30 flex items-center justify-center hover:border-primary/30 hover:bg-primary/5 transition-all`}>
                {uploadingIcon ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
              </button>
            )}
            <span className="text-[10px] text-muted-foreground font-medium">
              {customIconUrl ? 'Custom icon set' : 'Upload custom icon (PNG/JPG)'}
            </span>
          </div>

          {/* Emoji Picker by Category */}
          {!customIconUrl && (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {ICON_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-1">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.icons.map(i => (
                      <button key={i} onClick={() => setIcon(i)}
                        className={`${iconSizeClass} ${iconShapeClass} flex items-center justify-center transition-all ${
                          icon === i ? 'bg-primary/20 ring-2 ring-primary scale-110 shadow-md' : 'bg-card/30 hover:bg-card/50 hover:scale-105'
                        }`}>{i}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label className="text-xs font-bold text-foreground/70">Color</Label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-all shadow-sm ${color === c ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110' : 'hover:scale-105'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>

        <Button className="w-full h-11 text-sm font-bold rounded-xl" onClick={handleSave} disabled={!name.trim()}>
          {editFolder ? 'Update Folder' : 'Create Folder'}
        </Button>
      </div>
    </BottomSheet>
  );
}
