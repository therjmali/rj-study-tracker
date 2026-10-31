import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Paperclip, Upload, X, Download, Trash2, Image, FileText, File, Eye, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useUpload } from '@/platform/upload';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Label } from '@project/components/ui/label';
import { Progress } from '@project/components/ui/progress';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@project/components/ui/alert-dialog';
import type { TopicAttachment } from '../../types';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf', 'text/plain'];
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf', '.txt'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 10;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

function isImageFile(name: string): boolean {
  const clean = name.split('?')[0].split('#')[0];
  const ext = getFileExtension(clean);
  return ['jpg', 'jpeg', 'png'].includes(ext);
}

function isPdfFile(name: string): boolean {
  // Strip query params/hash for CDN URLs (e.g., Classplus assets)
  const clean = name.split('?')[0].split('#')[0];
  return getFileExtension(clean) === 'pdf';
}

function isTxtFile(name: string): boolean {
  const clean = name.split('?')[0].split('#')[0];
  return getFileExtension(clean) === 'txt';
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch { return ''; }
}

interface UploadingFile {
  id: string;
  name: string;
  progress: number;
}

interface Props {
  attachments: TopicAttachment[];
  onChange: (attachments: TopicAttachment[]) => void;
  /** Slim layout for the topic sheet: one-line upload row instead of a big drop zone */
  compact?: boolean;
}

export default function TopicAttachments({ attachments, onChange, compact = false }: Props) {
  const { upload } = useUpload();
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalSize = attachments.reduce((s, a) => s + a.size, 0);

  const validateFile = (file: File): string | null => {
    if (attachments.length + uploading.length >= MAX_FILES) return `Maximum ${MAX_FILES} files allowed per topic`;
    const ext = '.' + getFileExtension(file.name);
    if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type. Only JPG, PNG, PDF, TXT allowed`;
    }
    if (file.size > MAX_FILE_SIZE) return `File too large (${formatFileSize(file.size)}). Maximum is 5 MB`;
    if (attachments.some(a => a.name === file.name)) return `"${file.name}" is already attached`;
    return null;
  };

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    for (const file of fileArr) {
      const error = validateFile(file);
      if (error) { toast.error(error); continue; }

      const tempId = `uploading-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploading(prev => [...prev, { id: tempId, name: file.name, progress: 0 }]);

      // Simulate progress since upload doesn't have progress callbacks
      const progressInterval = setInterval(() => {
        setUploading(prev => prev.map(u => u.id === tempId ? { ...u, progress: Math.min(u.progress + 15, 90) } : u));
      }, 200);

      try {
        const { url } = await upload(file);
        clearInterval(progressInterval);
        setUploading(prev => prev.map(u => u.id === tempId ? { ...u, progress: 100 } : u));

        const attachment: TopicAttachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          url: url,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          uploadedAt: new Date().toISOString(),
        };

        onChange([...attachments, attachment]);
        toast.success(`📎 "${file.name}" uploaded`);

        // Small delay before removing from uploading list
        setTimeout(() => {
          setUploading(prev => prev.filter(u => u.id !== tempId));
        }, 400);
      } catch {
        clearInterval(progressInterval);
        setUploading(prev => prev.filter(u => u.id !== tempId));
        toast.error(`Failed to upload "${file.name}"`);
      }
    }
  }, [attachments, uploading.length, onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
  }, [uploadFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const removeAttachment = (id: string) => {
    onChange(attachments.filter(a => a.id !== id));
    toast.success('Attachment removed');
  };

  return (
    <div className={compact ? 'rounded-2xl bg-card/80 border border-border/12 p-3.5 space-y-2.5' : 'rounded-2xl bg-card border border-border/20 p-4 space-y-3'}>
      <div className="flex items-center justify-between">
        <Label className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-1.5">
          <Paperclip className="w-3 h-3 text-primary" /> Attachments
        </Label>
        {attachments.length > 0 && (
          <span className="text-[10px] font-bold text-muted-foreground">
            {attachments.length} file{attachments.length !== 1 ? 's' : ''} · {formatFileSize(totalSize)}
          </span>
        )}
      </div>

      {/* File list */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map(att => (
            <AttachmentCard key={att.id} attachment={att} onDelete={() => removeAttachment(att.id)} onPreview={() => isImageFile(att.name) && setLightboxUrl(att.url)} />
          ))}
        </div>
      )}

      {/* Uploading files */}
      <AnimatePresence>
        {uploading.map(u => (
          <motion.div key={u.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2.5 p-2.5 rounded-xl bg-primary/5 border border-primary/15">
            <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-xs font-semibold text-foreground truncate">{u.name}</p>
              <Progress value={u.progress} className="h-1.5" />
            </div>
            <span className="text-[10px] font-mono font-bold text-primary shrink-0">{u.progress}%</span>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex ${compact ? 'flex-row gap-3 py-2.5 px-3' : 'flex-col gap-2 py-6 px-4'} items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 group ${
          dragOver
            ? 'border-primary bg-primary/8 scale-[1.01]'
            : 'border-border/30 bg-muted/20 hover:border-primary/40 hover:bg-primary/5'
        }`}
      >
        <div className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          dragOver ? 'bg-primary/20 text-primary' : 'bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
        }`}>
          <Upload className="w-5 h-5" />
        </div>
        <div className={compact ? 'text-left' : 'text-center'}>
          <p className="text-xs font-bold text-foreground">
            {dragOver ? 'Drop files here' : 'Drag & drop or click to upload'}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            JPG, PNG, PDF, TXT · Max 5 MB · Up to {MAX_FILES - attachments.length} more
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.txt"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* Empty state */}
      {!compact && attachments.length === 0 && uploading.length === 0 && (
        <p className="text-[10px] text-muted-foreground/60 text-center italic font-medium">
          No attachments yet — drag files here or click to upload
        </p>
      )}

      {/* Image Lightbox */}
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

/* ===== Attachment Card ===== */
function AttachmentCard({ attachment, onDelete, onPreview }: { attachment: TopicAttachment; onDelete: () => void; onPreview: () => void }) {
  const isImage = isImageFile(attachment.name);
  const isPdf = isPdfFile(attachment.name);
  const isTxt = isTxtFile(attachment.name);

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted/20 border border-border/10 group hover:border-border/30 transition-all">
      {/* Thumbnail / Icon */}
      {isImage ? (
        <button onClick={onPreview} className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted shrink-0 hover:opacity-80 transition-opacity group/thumb">
          <img src={attachment.url} alt={attachment.name} className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-colors flex items-center justify-center">
            <Eye className="w-4 h-4 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
          </div>
        </button>
      ) : (
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
          isPdf ? 'bg-red-500/10' : isTxt ? 'bg-blue-500/10' : 'bg-muted/40'
        }`}>
          {isPdf ? <FileText className="w-5 h-5 text-red-500" /> :
           isTxt ? <FileText className="w-5 h-5 text-blue-500" /> :
           <File className="w-5 h-5 text-muted-foreground" />}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-xs font-bold text-foreground truncate">{attachment.name}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {formatFileSize(attachment.size)} · {formatDate(attachment.uploadedAt)}
        </p>
        {isTxt && <TxtPreview url={attachment.url} />}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 pt-1">
        {isPdf ? (
          <a href={attachment.url} target="_blank" rel="noopener noreferrer"
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all"
            title="Open PDF">
            <Eye className="w-3.5 h-3.5" />
          </a>
        ) : null}
        <a href={attachment.url} download={attachment.name} target="_blank" rel="noopener noreferrer"
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all"
          title="Download">
          <Download className="w-3.5 h-3.5" />
        </a>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Attachment</AlertDialogTitle>
              <AlertDialogDescription>Remove "{attachment.name}" from this topic? The file will no longer be accessible.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </motion.div>
  );
}

/* ===== TXT Preview ===== */
function TxtPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadText = async () => {
    if (text !== null) { setExpanded(e => !e); return; }
    setLoading(true);
    try {
      const res = await fetch(url);
      const content = await res.text();
      setText(content);
      setExpanded(true);
    } catch { toast.error('Could not load text preview'); }
    setLoading(false);
  };

  const lines = text?.split('\n') || [];
  const previewLines = expanded ? lines : lines.slice(0, 3);
  const hasMore = lines.length > 3;

  return (
    <div className="mt-1.5">
      <button onClick={loadText} className="text-[10px] font-bold text-blue-500 hover:text-blue-600 flex items-center gap-1 transition-colors">
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
        {text === null ? 'Preview' : expanded ? 'Collapse' : 'Expand'}
      </button>
      {text !== null && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden">
          <pre className="mt-1 p-2 rounded-lg bg-muted/40 text-[10px] leading-relaxed text-foreground/80 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto border border-border/10">
            {previewLines.join('\n')}
            {!expanded && hasMore && '\n...'}
          </pre>
          {hasMore && text !== null && (
            <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-muted-foreground font-bold flex items-center gap-0.5 mt-1 hover:text-foreground transition-colors">
              {expanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Show all {lines.length} lines</>}
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}

/* ===== Image Lightbox ===== */
function ImageLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {url && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative max-w-[90vw] max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            <img src={url} alt="Preview" className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" />
            <button
              onClick={onClose}
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center shadow-lg hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
            <a href={url} download target="_blank" rel="noopener noreferrer"
              className="absolute -bottom-3 right-0 h-8 px-4 rounded-full bg-card border border-border flex items-center gap-1.5 shadow-lg hover:bg-muted transition-colors text-xs font-bold text-foreground">
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
