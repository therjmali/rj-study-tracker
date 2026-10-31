import { useState, useMemo, useRef } from 'react';
import { FileText, Upload, Sparkles, TreePine, FileJson, Download, Copy, CheckCheck, FolderTree, AlertTriangle, Merge, RefreshCw } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Textarea } from '@project/components/ui/textarea';
import { Input } from '@project/components/ui/input';
import { toast } from 'sonner';
import { parseSyllabusText, PHARMACOLOGY_TEMPLATE, TREE_FORMAT_TEMPLATE, HIERARCHY_TEMPLATE, AI_PROMPT_TEMPLATE } from '../../lib/syllabusParser';
import type { Subject } from '../../types';
import BottomSheet from '../shared/BottomSheet';

type ImportMode = 'merge' | 'replace';

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (subjects: Subject[]) => void;
  /** For replace mode — replaces ALL existing subjects */
  onReplaceImport?: (subjects: Subject[]) => void;
  existingSubjects?: Subject[];
  onOpenBulk?: () => void;
}

export default function ImportSyllabusSheet({ open, onClose, onImport, onReplaceImport, existingSubjects = [], onOpenBulk }: Props) {
  const [text, setText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    try { return parseSyllabusText(text); } catch { return null; }
  }, [text]);

  const handleParse = () => {
    if (!parsed || parsed.stats.subjects === 0) {
      toast.error('No subjects found. Check the format.');
      return;
    }
    setShowPreview(true);
  };

  // Check for duplicate subjects by name
  const duplicateWarning = useMemo(() => {
    if (!parsed || existingSubjects.length === 0) return null;
    const existingNames = new Set(existingSubjects.map(s => s.name.toLowerCase().trim()));
    const dupes = parsed.subjects.filter(s => existingNames.has(s.name.toLowerCase().trim()));
    return dupes.length > 0 ? `⚠️ ${dupes.length} subject(s) already exist: ${dupes.map(d => d.shortName || d.name).join(', ')}. Importing will create duplicates.` : null;
  }, [parsed, existingSubjects]);

  // Merge logic: skip subjects with same name, merge units/topics into existing subjects
  const mergeSubjects = (incoming: Subject[]): Subject[] => {
    const existingMap = new Map(existingSubjects.map(s => [s.name.toLowerCase().trim(), s]));
    const merged: Subject[] = [];
    const skipped: string[] = [];

    for (const inc of incoming) {
      const key = inc.name.toLowerCase().trim();
      const existing = existingMap.get(key);
      if (!existing) {
        merged.push(inc);
      } else {
        // Merge: add new units/topics that don't exist in the existing subject
        const existingTopicIds = new Set<string>();
        const existingTopicNames = new Set<string>();
        existing.units.forEach(u => u.subTopics.forEach(t => {
          existingTopicIds.add(t.id);
          existingTopicNames.add(t.name.toLowerCase().trim());
        }));

        let addedTopics = 0;
        const mergedUnits = [...existing.units];
        for (const incUnit of inc.units) {
          const existingUnit = mergedUnits.find(u => u.name.toLowerCase().trim() === incUnit.name.toLowerCase().trim());
          if (existingUnit) {
            // Add only new topics to existing unit
            const newTopics = incUnit.subTopics.filter(t =>
              !existingTopicIds.has(t.id) && !existingTopicNames.has(t.name.toLowerCase().trim())
            );
            if (newTopics.length > 0) {
              existingUnit.subTopics = [...existingUnit.subTopics, ...newTopics];
              addedTopics += newTopics.length;
            }
          } else {
            mergedUnits.push(incUnit);
            addedTopics += incUnit.subTopics.length;
          }
        }

        if (addedTopics > 0) {
          merged.push({ ...existing, units: mergedUnits });
        } else {
          skipped.push(inc.shortName || inc.name);
        }
      }
    }

    return merged;
  };

  const handleImport = () => {
    if (!parsed) return;

    if (importMode === 'replace') {
      // Show secondary confirmation for replace
      setShowConfirm(true);
      return;
    }

    // Merge mode
    if (existingSubjects.length > 0) {
      const merged = mergeSubjects(parsed.subjects);
      if (merged.length > 0) {
        // For merged subjects that already exist, we need to update them
        const existingNames = new Set(existingSubjects.map(s => s.name.toLowerCase().trim()));
        const brandNew = merged.filter(s => !existingNames.has(s.name.toLowerCase().trim()));
        const updates = merged.filter(s => existingNames.has(s.name.toLowerCase().trim()));

        // Import brand new subjects
        if (brandNew.length > 0) onImport(brandNew);

        // For updated subjects, we need to replace them (call onImport which appends)
        // Since merge modifies existing subjects, we handle via onReplaceImport if available
        if (updates.length > 0 && onReplaceImport) {
          const updatedAll = existingSubjects.map(s => {
            const update = updates.find(u => u.name.toLowerCase().trim() === s.name.toLowerCase().trim());
            return update || s;
          });
          // Add brand new ones
          onReplaceImport([...updatedAll, ...brandNew]);
        } else if (brandNew.length === 0 && updates.length > 0) {
          toast.info('No new subjects to add — all already exist');
        }
      } else {
        toast.info('All subjects already exist — nothing to import');
      }
    } else {
      onImport(parsed.subjects);
    }

    toast.success(`Merged ${parsed.stats.subjects} subject(s) with ${parsed.stats.topics} topics!`);
    setText('');
    setShowPreview(false);
    setImportMode('merge');
    onClose();
  };

  const handleReplaceConfirm = () => {
    if (!parsed || confirmText.toUpperCase() !== 'REPLACE') return;
    if (onReplaceImport) {
      onReplaceImport(parsed.subjects);
    } else {
      onImport(parsed.subjects);
    }
    toast.success(`Replaced with ${parsed.stats.subjects} subject(s) and ${parsed.stats.topics} topics!`);
    setText('');
    setShowPreview(false);
    setShowConfirm(false);
    setConfirmText('');
    setImportMode('merge');
    onClose();
  };

  const jsonRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target?.result as string || '');
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        let subjects: Subject[] = [];
        // Single subject export (has id, name, units directly)
        if (data.id && data.name && Array.isArray(data.units)) subjects = [data];
        // Array of subjects
        else if (Array.isArray(data)) subjects = data.filter((s: any) => s.id && s.name && Array.isArray(s.units));
        // Wrapped in subjects key
        else if (data.subjects && Array.isArray(data.subjects)) subjects = data.subjects.filter((s: any) => s.id && s.name && Array.isArray(s.units));
        // Full app state export
        else if (data.appState?.subjects) subjects = data.appState.subjects.filter((s: any) => s.id && s.name && Array.isArray(s.units));
        if (subjects.length === 0) { toast.error('No valid subjects found in JSON'); return; }
        onImport(subjects);
        toast.success(`Imported ${subjects.length} subject(s) from JSON!`);
        onClose();
      } catch { toast.error('Invalid JSON file'); }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const handleDownloadPrompt = () => {
    const blob = new Blob([AI_PROMPT_TEMPLATE], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NurseTrack-Syllabus-AI-Prompt.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('AI prompt template downloaded!');
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT_TEMPLATE);
      setPromptCopied(true);
      toast.success('Prompt copied to clipboard!');
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  // Count hierarchy depth in preview
  const hierarchyInfo = useMemo(() => {
    if (!parsed) return null;
    let hasModules = false;
    let hasSubModules = false;
    for (const s of parsed.subjects) {
      for (const u of s.units) {
        for (const t of u.subTopics) {
          if (t.module) hasModules = true;
          if (t.subModule) hasSubModules = true;
        }
      }
    }
    const depth = hasSubModules ? 4 : hasModules ? 3 : 2;
    return { depth, hasModules, hasSubModules };
  }, [parsed]);

  return (
    <BottomSheet open={open} onClose={onClose} title="📥 Import Syllabus">
      <div className="space-y-4 pt-2">
        {onOpenBulk && !showPrompt && (
          <button onClick={onOpenBulk} className="w-full flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-left active:scale-[0.99] transition-transform">
            <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl">📦</span>
            <span className="flex-1"><span className="block text-[13px] font-bold text-foreground">Bulk import — JSON files or ZIP</span><span className="block text-[11px] text-muted-foreground">Load many subjects in one go, with preview and duplicate handling</span></span>
            <span className="text-primary text-lg">›</span>
          </button>
        )}
        {showPrompt ? (
          /* ===== AI PROMPT VIEW ===== */
          <>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">AI Prompt Template</h3>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Use this prompt with ChatGPT, Claude, or any AI to convert your syllabus into the correct format. 
                Then paste the AI output back here to import.
              </p>

              {/* Level Legend */}
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {[
                  { emoji: '1️⃣', label: 'Unit / Folder', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
                  { emoji: '2️⃣', label: 'Major Topic', color: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
                  { emoji: '3️⃣', label: 'Subtopic', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
                  { emoji: '4️⃣', label: 'Micro-topic', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
                ].map(l => (
                  <div key={l.emoji} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[9px] font-medium ${l.color}`}>
                    <span className="text-sm">{l.emoji}</span> {l.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Preview of the prompt */}
            <div className="rounded-lg border border-border/40 bg-card/50 p-2.5 max-h-40 overflow-y-auto scrollbar-hide">
              <pre className="text-[8px] text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap">
                {AI_PROMPT_TEMPLATE.slice(0, 600)}...
              </pre>
            </div>

            {/* Steps */}
            <div className="space-y-1.5">
              {[
                { step: '1', text: 'Copy or download the prompt below' },
                { step: '2', text: 'Paste it into ChatGPT / Claude / Gemini' },
                { step: '3', text: 'Add your syllabus at the bottom of the prompt' },
                { step: '4', text: 'Copy the AI output and paste it here to import' },
              ].map(s => (
                <div key={s.step} className="flex items-center gap-2 text-[10px]">
                  <span className="w-5 h-5 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0 text-[9px]">{s.step}</span>
                  <span className="text-muted-foreground">{s.text}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyPrompt} className="flex-1 gap-1.5 text-xs">
                {promptCopied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {promptCopied ? 'Copied!' : 'Copy Prompt'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadPrompt} className="flex-1 gap-1.5 text-xs">
                <Download className="w-3.5 h-3.5" /> Download .txt
              </Button>
            </div>

            <Button variant="outline" onClick={() => setShowPrompt(false)} className="w-full">← Back to Import</Button>
          </>
        ) : !showPreview ? (
          /* ===== INPUT VIEW ===== */
          <>
            <div>
              <p className="text-sm text-foreground/70 mb-2 font-semibold">
                Paste structured syllabus text. Supports 3 formats:
              </p>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                <div className="rounded-lg border border-border/40 bg-card/50 p-2">
                  <p className="text-xs font-bold text-foreground mb-1">Plain</p>
                  <pre className="text-xs text-foreground/60 font-mono leading-relaxed whitespace-pre-wrap">{`SUBJECT: Name\nUNIT 1: Name\n[E] Topic\n[H] Topic`}</pre>
                </div>
                <div className="rounded-lg border border-border/40 bg-card/50 p-2">
                  <p className="text-xs font-bold text-foreground mb-1">Tree</p>
                  <pre className="text-xs text-foreground/60 font-mono leading-relaxed whitespace-pre-wrap">{`SUBJECT: Name\n├── Unit 1\n│ ├── [M] MOD\n│ │ ├── #001`}</pre>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-2">
                  <p className="text-xs font-bold text-primary mb-1">Hierarchy ✨</p>
                  <pre className="text-xs text-primary/70 font-mono leading-relaxed whitespace-pre-wrap">{`1️⃣ Unit\n 2️⃣ Topic\n  3️⃣ Sub\n   4️⃣ Micro`}</pre>
                </div>
              </div>
              <Textarea value={text} onChange={e => setText(e.target.value)} rows={10}
                placeholder={`Paste your syllabus here...\n\nHierarchy format (recommended):\nSUBJECT: Anatomy\n\n1️⃣ Human Body Systems\n 2️⃣ Respiratory System\n  3️⃣ Upper Respiratory Tract\n   4️⃣ Nose\n   4️⃣ Pharynx\n  3️⃣ Lower Respiratory Tract\n   4️⃣ Larynx\n   4️⃣ Bronchi`}
                className="font-mono text-xs" />
            </div>

            {/* Template Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => { setText(HIERARCHY_TEMPLATE); toast.info('Hierarchy template loaded'); }} className="gap-1.5 text-xs">
                <FolderTree className="w-3.5 h-3.5" /> Hierarchy
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setText(PHARMACOLOGY_TEMPLATE); toast.info('Plain template loaded'); }} className="gap-1.5 text-xs">
                <Sparkles className="w-3.5 h-3.5" /> Plain
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setText(TREE_FORMAT_TEMPLATE); toast.info('Tree template loaded'); }} className="gap-1.5 text-xs">
                <TreePine className="w-3.5 h-3.5" /> Tree
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowPrompt(true)} className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10">
                <Download className="w-3.5 h-3.5" /> AI Prompt
              </Button>
            </div>

            {/* File Import */}
            <div className="flex gap-2">
              <label className="flex-1">
                <input type="file" accept=".txt,.text" className="hidden" onChange={handleFile} />
                <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" asChild>
                  <span><Upload className="w-3.5 h-3.5" /> Upload TXT</span>
                </Button>
              </label>
              <label className="flex-1">
                <input ref={jsonRef} type="file" accept=".json" className="hidden" onChange={handleJsonImport} />
                <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" asChild>
                  <span><FileJson className="w-3.5 h-3.5" /> Upload JSON</span>
                </Button>
              </label>
            </div>

            <Button onClick={handleParse} disabled={!text.trim()} className="w-full gap-2">
              <FileText className="w-4 h-4" /> Parse & Preview
            </Button>
          </>
        ) : parsed ? (
          /* ===== PREVIEW VIEW ===== */
          <>
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground">📋 Import Preview</h3>

              <div className="grid grid-cols-4 gap-1.5">
                <div className="text-center p-2 rounded-lg bg-primary/10 border border-primary/15">
                  <p className="text-lg font-bold font-mono text-primary">{parsed.stats.subjects}</p>
                  <p className="text-xs font-bold text-foreground/70">Subjects</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-accent/10 border border-accent/15">
                  <p className="text-lg font-black font-mono text-accent-foreground">{parsed.stats.units}</p>
                  <p className="text-xs font-bold text-foreground/70">Units</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-secondary/10 border border-secondary/15">
                  <p className="text-lg font-black font-mono text-secondary">{parsed.stats.topics}</p>
                  <p className="text-xs font-bold text-foreground/70">Topics</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30 border border-border/30">
                  <p className="text-lg font-black font-mono text-foreground">{hierarchyInfo?.depth || 2}</p>
                  <p className="text-xs font-bold text-foreground/70">Depth</p>
                </div>
              </div>

              {/* Hierarchy depth indicator */}
              {hierarchyInfo && (
                <div className="flex gap-1 items-center">
                  <span className="text-[9px] text-muted-foreground">Levels:</span>
                  {['Unit', 'Topic', 'Subtopic', 'Micro'].slice(0, hierarchyInfo.depth).map((l, i) => (
                    <span key={l} className={`text-[8px] px-1.5 py-0.5 rounded-full border font-medium ${
                      i === 0 ? 'bg-blue-500/15 text-blue-400 border-blue-500/20' :
                      i === 1 ? 'bg-purple-500/15 text-purple-400 border-purple-500/20' :
                      i === 2 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' :
                      'bg-amber-500/15 text-amber-400 border-amber-500/20'
                    }`}>{l}</span>
                  ))}
                </div>
              )}

              <div className="max-h-48 overflow-y-auto space-y-2 scrollbar-hide">
                {parsed.subjects.map(s => (
                  <div key={s.id} className="rounded-lg border border-border/50 p-2.5">
                    <p className="text-xs font-semibold" style={{ color: s.color }}>{s.name}</p>
                    <p className="text-[10px] text-muted-foreground mb-1.5">{s.units.length} units · {s.units.reduce((a, u) => a + u.subTopics.length, 0)} topics</p>
                    <div className="space-y-1">
                      {s.units.map(u => {
                        const modules = new Map<string, { count: number; subModules: Set<string> }>();
                        u.subTopics.forEach(t => {
                          if (t.module) {
                            const m = modules.get(t.module) || { count: 0, subModules: new Set<string>() };
                            m.count++;
                            if (t.subModule) m.subModules.add(t.subModule);
                            modules.set(t.module, m);
                          }
                        });
                        return (
                          <div key={u.id}>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="text-blue-400">📂</span>
                              <span className="text-foreground font-medium truncate">{u.name}</span>
                              <span className="text-muted-foreground shrink-0">({u.subTopics.length})</span>
                            </div>
                            {modules.size > 0 && (
                              <div className="ml-4 mt-0.5 space-y-0.5">
                                {Array.from(modules.entries()).map(([m, info]) => (
                                  <div key={m}>
                                    <div className="flex items-center gap-1 text-[9px] text-purple-400/70">
                                      <span>📁</span> <span className="truncate">{m}</span>
                                      <span className="text-muted-foreground">({info.count})</span>
                                    </div>
                                    {info.subModules.size > 0 && (
                                      <div className="ml-4 space-y-0.5">
                                        {Array.from(info.subModules).map(sm => (
                                          <div key={sm} className="flex items-center gap-1 text-[8px] text-emerald-400/60">
                                            <span>📄</span> <span className="truncate">{sm}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Import Mode Selector */}
            {existingSubjects.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-foreground/80">Import Mode</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setImportMode('merge')}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${
                      importMode === 'merge'
                        ? 'border-primary bg-primary/5'
                        : 'border-border/40 hover:border-border/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Merge className={`w-4 h-4 ${importMode === 'merge' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className={`text-sm font-bold ${importMode === 'merge' ? 'text-primary' : 'text-foreground'}`}>Merge</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Add new subjects & topics. Skips duplicates. Safe — keeps existing data.
                    </p>
                  </button>
                  <button
                    onClick={() => setImportMode('replace')}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${
                      importMode === 'replace'
                        ? 'border-destructive bg-destructive/5'
                        : 'border-border/40 hover:border-border/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <RefreshCw className={`w-4 h-4 ${importMode === 'replace' ? 'text-destructive' : 'text-muted-foreground'}`} />
                      <span className={`text-sm font-bold ${importMode === 'replace' ? 'text-destructive' : 'text-foreground'}`}>Replace</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Replaces all existing data. ⚠️ Destructive — cannot be undone.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {duplicateWarning && importMode === 'merge' && (
              <div className="rounded-lg border border-chart-4/30 bg-chart-4/10 p-2.5 text-[10px] text-chart-4 font-medium">
                {duplicateWarning}
              </div>
            )}

            {importMode === 'replace' && existingSubjects.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 space-y-1">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-xs font-bold text-destructive">Warning: Destructive Action</span>
                </div>
                <p className="text-[10px] text-destructive/80 font-medium leading-relaxed">
                  This will permanently replace {existingSubjects.length} existing subject(s) and all their progress, study time, and notes with the imported data.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowPreview(false)} className="flex-1">Back</Button>
              <Button
                onClick={handleImport}
                className={`flex-1 gap-2 ${importMode === 'replace' ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : ''}`}
              >
                <Upload className="w-4 h-4" />
                {importMode === 'replace' ? 'Replace All' : `Merge ${parsed.stats.subjects} Subject(s)`}
              </Button>
            </div>

            {/* Replace Confirmation Sub-dialog */}
            {showConfirm && (
              <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4 space-y-3 animate-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  <h4 className="text-sm font-bold text-destructive">Confirm Replace</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This will delete <strong className="text-foreground">{existingSubjects.length} subjects</strong> with all their progress and replace them with <strong className="text-foreground">{parsed.stats.subjects} new subjects</strong>.
                </p>
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground">
                    Type <span className="font-mono text-destructive font-bold">REPLACE</span> to confirm:
                  </p>
                  <Input
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder="REPLACE"
                    className="font-mono text-sm border-destructive/30"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleReplaceConfirm(); if (e.key === 'Escape') { setShowConfirm(false); setConfirmText(''); } }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setShowConfirm(false); setConfirmText(''); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleReplaceConfirm}
                    disabled={confirmText.toUpperCase() !== 'REPLACE'}
                    className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                    Replace All Data
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </BottomSheet>
  );
}
