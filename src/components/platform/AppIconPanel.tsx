import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, RotateCcw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import {
  IconError, MAX_ICON_BYTES, buildLauncherIcon, loadBitmap, pinIconShortcut, renderIcon, resetAppIcon, saveAppIcon, syncNativeIcon, useAppIcon,
  type CropState,
} from '@/platform/appIcon';
import { isNative } from '@/platform/native';

const START: CropState = { zoom: 1, x: 0, y: 0 };

export default function AppIconPanel() {
  const current = useAppIcon();
  const inputRef = useRef<HTMLInputElement>(null);
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [fileName, setFileName] = useState('');
  const [crop, setCrop] = useState<CropState>(START);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => () => bmp?.close?.(), [bmp]);

  // Live preview on a 160px canvas with launcher-style rounded corners.
  useEffect(() => {
    if (!bmp || !previewRef.current) return;
    const c = renderIcon(bmp, crop, 160, 'rounded');
    const ctx = previewRef.current.getContext('2d');
    ctx?.clearRect(0, 0, 160, 160);
    ctx?.drawImage(c, 0, 0);
  }, [bmp, crop]);

  const pick = async (file?: File) => {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const b = await loadBitmap(file);
      setBmp(prev => { prev?.close?.(); return b; });
      setFileName(file.name);
      setCrop(START);
    } catch (e) {
      setError(e instanceof IconError ? e.message : 'Could not open that image.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const apply = async () => {
    if (!bmp) return;
    const url = renderIcon(bmp, crop, 512, 'square').toDataURL('image/png');
    saveAppIcon(url);
    setBmp(null);
    setFileName('');
    const r = await syncNativeIcon(url);
    if (r === 'updated') toast.success('App icon updated — your home-screen icon changed too');
    else if (r === 'needs-pin') {
      toast.success('App icon updated');
      // Android needs one confirmation to place the icon on the home screen; after that it updates itself.
      try {
        const ok = pinIconShortcut(await buildLauncherIcon(url));
        if (ok) toast.info('Tap “Add” in the Android prompt to put the new icon on your home screen');
      } catch { /* the manual button below still works */ }
    } else toast.success('App icon updated');
  };

  const pin = () => {
    if (!current) return;
    // Launcher-style rounded icon at 192px for the Android shortcut.
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 192;
      const ctx = c.getContext('2d')!;
      ctx.beginPath();
      ctx.roundRect(0, 0, 192, 192, 42);
      ctx.clip();
      ctx.drawImage(img, 0, 0, 192, 192);
      const ok = pinIconShortcut(c.toDataURL('image/png'));
      if (ok) toast.success('Confirm “Add to home screen” in the Android prompt');
      else toast.error('Your launcher does not support pinned shortcuts');
    };
    img.src = current.dataUrl;
  };

  const sliders = useMemo(() => ([
    { key: 'zoom', label: 'Zoom', min: 1, max: 4, step: 0.01 },
    { key: 'x', label: 'Move left / right', min: -1, max: 1, step: 0.01 },
    { key: 'y', label: 'Move up / down', min: -1, max: 1, step: 0.01 },
  ] as const), []);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/20 bg-card/30 p-4 flex items-center gap-4">
        <div className="w-20 h-20 rounded-[22px] overflow-hidden border border-border/30 bg-primary flex items-center justify-center shrink-0 shadow-sm">
          {current ? <img src={current.dataUrl} alt="Current app icon" className="w-full h-full object-cover" /> : <span className="text-3xl">🎓</span>}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-foreground">{current ? 'Your custom icon' : 'Default icon'}</p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            Shown in the app header, browser tab and installed-app listing. JPG, PNG or WebP, up to {MAX_ICON_BYTES / 1024 / 1024} MB.
          </p>
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => void pick(e.target.files?.[0])} />

      {!bmp && (
        <Button onClick={() => inputRef.current?.click()} disabled={busy} className="w-full h-11 rounded-xl font-bold gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} Upload icon image
        </Button>
      )}

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[12px] font-semibold text-destructive">{error}</p>}

      {bmp && (
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 space-y-4">
          <div className="flex items-center gap-4">
            <canvas ref={previewRef} width={160} height={160} className="w-28 h-28 rounded-[26px] border border-border/30 shadow-sm shrink-0 bg-white" aria-label="Icon preview" />
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-foreground truncate">{fileName}</p>
              <p className="text-[11px] text-muted-foreground leading-snug mt-1">Adjust until the important part sits in the middle — the corners are rounded by Android.</p>
            </div>
          </div>
          {sliders.map(s => (
            <label key={s.key} className="block">
              <span className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-1">{s.label}</span>
              <input
                type="range" min={s.min} max={s.max} step={s.step} value={crop[s.key]}
                onChange={e => setCrop(c => ({ ...c, [s.key]: Number(e.target.value) }))}
                className="w-full accent-[hsl(var(--primary))]"
              />
            </label>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setBmp(null); setFileName(''); }} className="h-11 rounded-xl font-bold">Cancel</Button>
            <Button onClick={apply} className="flex-1 h-11 rounded-xl font-bold">Use as app icon</Button>
          </div>
        </div>
      )}

      {current && !bmp && (
        <div className="space-y-2">
          {isNative ? (
            <>
              <Button variant="outline" onClick={pin} className="w-full h-11 rounded-xl font-bold gap-2">
                <Smartphone className="w-4 h-4" /> Add custom icon to home screen
              </Button>
              <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
                Android fixes the app-drawer icon at install time, so no app can replace it. Your picture is applied everywhere Android allows:
                the home-screen icon (added once, then it updates itself whenever you change the picture), recent apps, the splash screen and the timer notification.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
              To change the icon of an app you already installed, remove it and use “Add to Home screen / Install app” again. In the Android APK there is an “Add custom icon to home screen” button.
            </p>
          )}
          <Button variant="outline" onClick={() => { resetAppIcon(); void syncNativeIcon(null); toast.success('Default icon restored'); }} className="w-full h-10 rounded-xl font-bold gap-2 text-muted-foreground">
            <RotateCcw className="w-4 h-4" /> Restore default icon
          </Button>
        </div>
      )}
    </div>
  );
}
