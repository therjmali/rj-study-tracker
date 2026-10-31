import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, Archive, Check, FileJson, Loader2, PackageOpen, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import BottomSheet from '../shared/BottomSheet';
import type { Subject } from '../../types';
import {
  applyImport, buildCandidates, buildSubjectsZip, readSources,
  type Candidate, type DuplicateMode, type ParsedSource,
} from '../../lib/bulkImport';

interface Props {
  open: boolean;
  onClose: () => void;
  existingSubjects: Subject[];
  /** Receives the complete, merged subject list. */
  onApply: (subjects: Subject[]) => void;
}

const MODES: { id: DuplicateMode; label: string; hint: string }[] = [
  { id: 'keep-both', label: 'Keep both', hint: 'Same-name subjects are added with “(2)”' },
  { id: 'skip', label: 'Skip existing', hint: 'Subjects you already have are left untouched' },
  { id: 'replace', label: 'Replace', hint: 'Overwrites the same-name subject with the imported one' },
];

export default function BulkImportSheet({ open, onClose, existingSubjects, onApply }: Props) {
  const [sources, setSources] = useState<ParsedSource[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<DuplicateMode>('keep-both');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => { setSources([]); setCandidates([]); setSelected(new Set()); setMode('keep-both'); }, []);
  const close = () => { reset(); onClose(); };

  const ingest = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const parsed = await readSources(files);
      const cands = buildCandidates(parsed, existingSubjects);
      setSources(prev => [...prev, ...parsed]);
      // Keys must stay unique when more files are added to an existing batch.
      const offset = candidates.length;
      const rekeyed = cands.map(c => ({ ...c, key: `${offset + Number(c.key)}` }));
      setCandidates(prev => [...prev, ...rekeyed]);
      setSelected(prev => new Set([...prev, ...rekeyed.map(c => c.key)]));
      if (!cands.length) toast.error('No subjects found in the selected files');
    } finally {
      setBusy(false);
    }
  }, [existingSubjects, candidates.length]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void ingest(Array.from(e.dataTransfer.files));
  };

  const picked = useMemo(() => candidates.filter(c => selected.has(c.key)), [candidates, selected]);
  const totalTopics = picked.reduce((a, c) => a + c.topics, 0);
  const errors = sources.filter(s => s.error);
  const dupCount = candidates.filter(c => c.existingId || c.duplicateInBatch).length;

  const toggle = (key: string) => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const allOn = candidates.length > 0 && selected.size === candidates.length;

  const doImport = () => {
    if (!picked.length) return;
    const res = applyImport(existingSubjects, picked, mode);
    onApply(res.subjects);
    const parts = [res.added && `${res.added} added`, res.replaced && `${res.replaced} replaced`, res.skipped && `${res.skipped} skipped`].filter(Boolean);
    toast.success(`Import complete — ${parts.join(', ') || 'nothing changed'}`);
    close();
  };

  const exportZip = () => {
    if (!existingSubjects.length) { toast.error('No subjects to export yet'); return; }
    const blob = new Blob([buildSubjectsZip(existingSubjects)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RJ-Tracker-subjects-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success(`Exported ${existingSubjects.length} subjects as a ZIP`);
  };

  return (
    <BottomSheet open={open} onClose={close} title="Bulk import subjects" zIndex={110}>
      <div className="px-4 pb-6 space-y-4">
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
          className={`rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${dragging ? 'border-primary bg-primary/10' : 'border-border/40 bg-card/30'}`}
        >
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-2.5">
            {busy ? <Loader2 className="w-6 h-6 text-primary animate-spin" /> : <PackageOpen className="w-6 h-6 text-primary" />}
          </div>
          <p className="text-[13px] font-bold text-foreground">Import many subjects at once</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
            Choose several <b>.json</b> files, or a <b>.zip</b> containing many JSON files. Single subjects, lists and full backups all work.
          </p>
          <Button onClick={() => inputRef.current?.click()} disabled={busy} className="mt-3 h-10 rounded-xl font-bold gap-1.5">
            <Upload className="w-4 h-4" /> Choose files
          </Button>
          <input
            ref={inputRef} type="file" multiple accept=".json,.zip,.txt,application/json,application/zip,application/x-zip-compressed" className="hidden"
            onChange={e => { void ingest(Array.from(e.target.files ?? [])); e.target.value = ''; }}
          />
        </div>

        {errors.length > 0 && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 space-y-1">
            <p className="text-[11px] font-bold text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {errors.length} file{errors.length > 1 ? 's' : ''} skipped</p>
            {errors.slice(0, 6).map((e, i) => (
              <p key={i} className="text-[11px] text-destructive/90 break-all leading-snug"><b>{e.path}</b> — {e.error}</p>
            ))}
            {errors.length > 6 && <p className="text-[11px] text-destructive/80">…and {errors.length - 6} more</p>}
          </div>
        )}

        {candidates.length > 0 && (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                {candidates.length} subject{candidates.length > 1 ? 's' : ''} found{dupCount ? ` · ${dupCount} already exist` : ''}
              </p>
              <button
                onClick={() => setSelected(allOn ? new Set() : new Set(candidates.map(c => c.key)))}
                className="text-[11px] font-bold text-primary"
              >{allOn ? 'Select none' : 'Select all'}</button>
            </div>

            <ul className="space-y-1.5 max-h-[38vh] overflow-y-auto pr-0.5">
              {candidates.map(c => {
                const on = selected.has(c.key);
                const dup = c.existingId || c.duplicateInBatch;
                return (
                  <li key={c.key}>
                    <button
                      onClick={() => toggle(c.key)} aria-pressed={on}
                      className={`w-full flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors active:scale-[0.99] ${on ? 'border-primary/40 bg-primary/5' : 'border-border/20 bg-card/20 opacity-70'}`}
                    >
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-primary border-primary text-primary-foreground' : 'border-border/50'}`}>
                        {on && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <span className="w-2.5 h-9 rounded-full shrink-0" style={{ background: c.subject.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold text-foreground truncate">{c.subject.name}</span>
                        <span className="block text-[10px] text-muted-foreground truncate flex items-center gap-1">
                          <FileJson className="w-3 h-3 inline shrink-0" />{c.source}
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-[11px] font-bold text-foreground">{c.topics} topics</span>
                        <span className="block text-[10px] text-muted-foreground">{c.units} units</span>
                      </span>
                      {dup && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0">EXISTS</span>}
                    </button>
                  </li>
                );
              })}
            </ul>

            {dupCount > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 mb-2 px-1">If a subject already exists</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {MODES.map(m => (
                    <button
                      key={m.id} onClick={() => setMode(m.id)} aria-pressed={mode === m.id}
                      className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition-colors ${mode === m.id ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border/25 bg-card/30 text-muted-foreground'}`}
                    >{m.label}</button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 px-1">{MODES.find(m => m.id === mode)?.hint}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} className="h-11 rounded-xl font-bold gap-1.5"><X className="w-4 h-4" /> Clear</Button>
              <Button onClick={doImport} disabled={!picked.length} className="flex-1 h-11 rounded-xl font-bold">
                Import {picked.length} subject{picked.length === 1 ? '' : 's'} · {totalTopics} topics
              </Button>
            </div>
          </>
        )}

        <div className="rounded-2xl border border-border/20 bg-card/25 p-3.5 flex items-center gap-3">
          <Archive className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-foreground">Export all subjects as ZIP</p>
            <p className="text-[11px] text-muted-foreground leading-snug">One JSON per subject — share a syllabus pack or re-import it here.</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportZip} className="rounded-xl font-bold">Export</Button>
        </div>
      </div>
    </BottomSheet>
  );
}
