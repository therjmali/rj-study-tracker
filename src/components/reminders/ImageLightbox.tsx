import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { ReminderImage } from '../../types';

interface Props {
  images: ReminderImage[];
  initialIndex: number;
  onClose: () => void;
}

export default function ImageLightbox({ images, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });
  const lastTap = useRef(0);
  const pinchStart = useRef(0);
  const pinchScaleStart = useRef(1);
  const touchesRef = useRef<React.Touch[]>([]);

  const img = images[index];

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const goTo = useCallback((i: number) => {
    resetZoom();
    setIndex(i);
  }, [resetZoom]);

  const goPrev = () => { if (index > 0) goTo(index - 1); };
  const goNext = () => { if (index < images.length - 1) goTo(index + 1); };

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Mouse wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale(s => Math.max(0.5, Math.min(5, s + delta)));
  };

  // Double tap zoom
  const handleDoubleTap = () => {
    if (scale > 1) {
      resetZoom();
    } else {
      setScale(2.5);
    }
  };

  // Touch handlers for pinch-to-zoom + pan + swipe
  const onTouchStart = (e: React.TouchEvent) => {
    touchesRef.current = Array.from(e.touches);
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStart.current = Math.sqrt(dx * dx + dy * dy);
      pinchScaleStart.current = scale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        handleDoubleTap();
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;
      panStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      translateStart.current = { ...translate };
      if (scale > 1) setIsPanning(true);
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const newScale = Math.max(0.5, Math.min(5, pinchScaleStart.current * (dist / pinchStart.current)));
      setScale(newScale);
    } else if (e.touches.length === 1 && isPanning && scale > 1) {
      const dx = e.touches[0].clientX - panStart.current.x;
      const dy = e.touches[0].clientY - panStart.current.y;
      setTranslate({ x: translateStart.current.x + dx, y: translateStart.current.y + dy });
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    // Swipe detection (only when not zoomed)
    if (scale <= 1 && touchesRef.current.length === 1 && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - panStart.current.x;
      const absDx = Math.abs(dx);
      const dy = Math.abs(e.changedTouches[0].clientY - panStart.current.y);
      if (absDx > 50 && absDx > dy) {
        if (dx > 0) goPrev();
        else goNext();
      }
    }
  };

  // Mouse drag pan
  const onMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translate };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setTranslate({ x: translateStart.current.x + dx, y: translateStart.current.y + dy });
  };

  const onMouseUp = () => { setIsPanning(false); };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex flex-col"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 relative z-10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold font-mono text-white/70">
            {index + 1} / {images.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setScale(s => Math.min(5, s + 0.5))} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
            <ZoomIn className="w-4 h-4 text-white" />
          </button>
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.5))} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
            <ZoomOut className="w-4 h-4 text-white" />
          </button>
          <button onClick={resetZoom} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
            <RotateCcw className="w-4 h-4 text-white" />
          </button>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 transition-colors ml-1">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative"
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={handleDoubleTap}
        style={{ cursor: scale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
      >
        {/* Nav arrows */}
        {images.length > 1 && index > 0 && (
          <button onClick={goPrev} className="absolute left-2 z-10 w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
        )}
        {images.length > 1 && index < images.length - 1 && (
          <button onClick={goNext} className="absolute right-2 z-10 w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors">
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        )}

        <AnimatePresence mode="wait">
          <motion.img
            key={img.id}
            src={img.url}
            alt={img.name}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.2 }}
            className="max-w-[90vw] max-h-[75vh] object-contain rounded-lg select-none"
            draggable={false}
            style={{
              transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
              transition: isPanning ? 'none' : 'transform 0.2s ease',
            }}
          />
        </AnimatePresence>
      </div>

      {/* Dots + filename */}
      <div className="shrink-0 pb-6 pt-2 flex flex-col items-center gap-2">
        {images.length > 1 && (
          <div className="flex gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === index ? 'bg-white w-5' : 'bg-white/30 hover:bg-white/50'
                }`}
              />
            ))}
          </div>
        )}
        <p className="text-[10px] text-white/50 font-medium truncate max-w-[200px]">{img.name}</p>
        {scale > 1 && (
          <span className="text-[9px] text-white/30 font-mono">{Math.round(scale * 100)}%</span>
        )}
      </div>
    </motion.div>
  );
}
