import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronRight, Download, FileText, Eye, EyeOff, CheckSquare, Square, Loader2 } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Switch } from '@project/components/ui/switch';
import { toast } from 'sonner';
import type { Subject } from '../../types';
import { generateReportHtml, computeStats, getFilteredData, type ReportConfig } from '../../lib/reportHtml';
import { useAuth } from '@/platform/auth';
import { useDebouncedCallback } from 'use-debounce';
import { sanitizeFilename } from '../../lib/dayPeriods';

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: Subject[];
  /** Pre-scope to a specific subject */
  preSelectSubjectId?: string;
  /** Pre-scope to a specific unit within a subject */
  preSelectUnitId?: string;
  /** Folder report mode — includes folder poster in report */
  folderInfo?: { name: string; coverImage?: string };
}

export default function ReportBuilder({ open, onClose, subjects, preSelectSubjectId, preSelectUnitId, folderInfo }: Props) {
  const { user } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [downloading, setDownloading] = useState(false);
  // Phones: Settings and Preview are separate tabs (desktop shows both side by side)
  const [mobileTab, setMobileTab] = useState<'settings' | 'preview'>('settings');
  // The report is laid out for A4 (794px); scale it to whatever width the preview area has
  const frameBoxRef = useRef<HTMLDivElement>(null);
  const [frameBox, setFrameBox] = useState({ w: 0, h: 0 });

  // Scope state
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());

  // Badge toggles
  const [showDifficulty, setShowDifficulty] = useState(true);
  const [showImportant, setShowImportant] = useState(true);
  const [showNorcet, setShowNorcet] = useState(true);

  // Detail toggles
  const [showStatus, setShowStatus] = useState(true);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Section collapse
  const [scopeOpen, setScopeOpen] = useState(true);
  const [badgesOpen, setBadgesOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Preview HTML
  const [previewHtml, setPreviewHtml] = useState('');

  // Initialize scope on open
  useEffect(() => {
    if (!open) return;
    const sIds = new Set<string>();
    const uIds = new Set<string>();
    const tIds = new Set<string>();
    const expanded = new Set<string>();

    if (preSelectSubjectId) {
      const s = subjects.find(x => x.id === preSelectSubjectId);
      if (s) {
        sIds.add(s.id);
        expanded.add(s.id);
        if (preSelectUnitId) {
          const u = s.units.find(x => x.id === preSelectUnitId);
          if (u) {
            uIds.add(u.id);
            u.subTopics.forEach(t => tIds.add(t.id));
          }
        } else {
          s.units.forEach(u => {
            uIds.add(u.id);
            u.subTopics.forEach(t => tIds.add(t.id));
          });
        }
      }
    } else {
      subjects.forEach(s => {
        sIds.add(s.id);
        s.units.forEach(u => {
          uIds.add(u.id);
          u.subTopics.forEach(t => tIds.add(t.id));
        });
      });
    }

    setSelectedSubjects(sIds);
    setSelectedUnits(uIds);
    setSelectedTopics(tIds);
    setExpandedSubjects(expanded);
    setScopeOpen(true);
    setBadgesOpen(false);
    setDetailsOpen(false);
  }, [open, preSelectSubjectId, preSelectUnitId, subjects]);

  const config = useMemo((): ReportConfig => ({
    studentName: user?.firstName ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}` : user?.email || 'Student',
    generatedAt: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    scope: {
      subjectIds: Array.from(selectedSubjects),
      unitIds: Array.from(selectedUnits),
      topicIds: Array.from(selectedTopics),
    },
    badges: { difficulty: showDifficulty, important: showImportant, norcetRelevance: showNorcet },
    details: { status: showStatus, attachments: showAttachments, resources: showResources, notes: showNotes },
  }), [selectedSubjects, selectedUnits, selectedTopics, showDifficulty, showImportant, showNorcet, showStatus, showAttachments, showResources, showNotes, user]);

  const filteredData = useMemo(() => getFilteredData(subjects, config), [subjects, config]);
  const stats = useMemo(() => computeStats(filteredData), [filteredData]);

  // Total topics available
  const totalAvailable = useMemo(() => {
    let c = 0;
    subjects.forEach(s => s.units.forEach(u => c += u.subTopics.length));
    return c;
  }, [subjects]);

  // Debounced preview update
  const updatePreview = useDebouncedCallback(() => {
    if (stats.total === 0) {
      setPreviewHtml('');
      return;
    }
    const html = generateReportHtml(subjects, config, folderInfo);
    setPreviewHtml(html);
  }, 300);

  useEffect(() => {
    if (open) updatePreview();
  }, [config, open]);

  // Write to iframe
  useEffect(() => {
    if (!previewHtml || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (doc) {
      doc.open();
      doc.write(previewHtml);
      doc.close();
    }
  }, [previewHtml]);

  // Toggle helpers
  const toggleSubject = useCallback((subjectId: string) => {
    const s = subjects.find(x => x.id === subjectId);
    if (!s) return;
    const isSelected = selectedSubjects.has(subjectId);
    setSelectedSubjects(prev => {
      const n = new Set(prev);
      isSelected ? n.delete(subjectId) : n.add(subjectId);
      return n;
    });
    setSelectedUnits(prev => {
      const n = new Set(prev);
      s.units.forEach(u => isSelected ? n.delete(u.id) : n.add(u.id));
      return n;
    });
    setSelectedTopics(prev => {
      const n = new Set(prev);
      s.units.forEach(u => u.subTopics.forEach(t => isSelected ? n.delete(t.id) : n.add(t.id)));
      return n;
    });
  }, [subjects, selectedSubjects]);

  const toggleUnit = useCallback((subjectId: string, unitId: string) => {
    const s = subjects.find(x => x.id === subjectId);
    const u = s?.units.find(x => x.id === unitId);
    if (!u) return;
    const isSelected = selectedUnits.has(unitId);
    setSelectedUnits(prev => {
      const n = new Set(prev);
      isSelected ? n.delete(unitId) : n.add(unitId);
      return n;
    });
    setSelectedTopics(prev => {
      const n = new Set(prev);
      u.subTopics.forEach(t => isSelected ? n.delete(t.id) : n.add(t.id));
      return n;
    });
    // Ensure subject is selected if any unit is
    if (!isSelected) {
      setSelectedSubjects(prev => new Set([...prev, subjectId]));
    }
  }, [subjects, selectedUnits]);

  const toggleTopic = useCallback((topicId: string) => {
    setSelectedTopics(prev => {
      const n = new Set(prev);
      n.has(topicId) ? n.delete(topicId) : n.add(topicId);
      return n;
    });
  }, []);

  const selectAll = useCallback(() => {
    const sIds = new Set<string>();
    const uIds = new Set<string>();
    const tIds = new Set<string>();
    subjects.forEach(s => {
      sIds.add(s.id);
      s.units.forEach(u => {
        uIds.add(u.id);
        u.subTopics.forEach(t => tIds.add(t.id));
      });
    });
    setSelectedSubjects(sIds);
    setSelectedUnits(uIds);
    setSelectedTopics(tIds);
  }, [subjects]);

  const selectNone = useCallback(() => {
    setSelectedSubjects(new Set());
    setSelectedUnits(new Set());
    setSelectedTopics(new Set());
  }, []);

  // Generate smart filename based on report scope
  const smartFilename = useMemo(() => {
    const dateStr = new Date().toISOString().split('T')[0];
    const filtered = getFilteredData(subjects, config);

    if (folderInfo) {
      return `${sanitizeFilename(folderInfo.name)}-Report-${dateStr}.pdf`;
    }
    if (filtered.length === 1) {
      const s = filtered[0];
      if (s.units.length === 1) {
        return `${sanitizeFilename(s.shortName)}-${sanitizeFilename(s.units[0].name)}-Report-${dateStr}.pdf`;
      }
      return `${sanitizeFilename(s.name)}-Report-${dateStr}.pdf`;
    }
    return `NurseTrack-Full-Report-${dateStr}.pdf`;
  }, [subjects, config, folderInfo]);

  const handleDownloadPdf = useCallback(async () => {
    if (stats.total === 0) { toast.error('No topics selected'); return; }
    setDownloading(true);
    try {
      const { exportPdf } = await import('@/platform/api');
      const html = generateReportHtml(subjects, config, folderInfo);
      const result = await exportPdf({ mode: 'detailed', html, filename: smartFilename });
      // Open PDF in new tab
      window.open(result.url, '_blank');
      toast.success('📄 PDF generated! Opening in new tab...');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || 'Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  }, [subjects, config, stats.total]);

  useEffect(() => {
    const el = frameBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r) setFrameBox(prev => (Math.abs(prev.w - r.width) > 1 || Math.abs(prev.h - r.height) > 1) ? { w: r.width, h: r.height } : prev);
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  if (!open) return null;

  const A4_W = 794;
  const frameScale = frameBox.w > 0 ? Math.min(1, frameBox.w / A4_W) : 1;

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-background"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border/20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-card/60 border border-border/20 flex items-center justify-center hover:bg-card transition-colors">
              <X className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-bold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Report Builder
              </h1>
              <p className="text-[10px] text-muted-foreground font-semibold">
                {stats.total > 0 ? `${selectedTopics.size} of ${totalAvailable} topics selected · ${stats.completed} completed` : 'Configure your report'}
              </p>
            </div>
          </div>
          <Button onClick={handleDownloadPdf} disabled={downloading || stats.total === 0} className="gap-2 h-10 px-5 font-bold">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {downloading ? 'Generating...' : 'Download PDF'}
          </Button>
        </div>
      </div>

      {/* Phone tabs */}
      <div className="lg:hidden px-4 pt-3">
        <div className="grid grid-cols-2 p-1 rounded-2xl bg-muted/20 border border-border/10">
          {([['settings', 'Settings'], ['preview', 'Preview']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setMobileTab(id)}
              className={`relative h-10 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-colors ${mobileTab === id ? 'text-foreground' : 'text-muted-foreground/70'}`}>
              {mobileTab === id && <motion.span layoutId="report-tab" className="absolute inset-0 rounded-xl bg-card border border-border/20 shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
              <span className="relative flex items-center gap-1.5">{id === 'settings' ? <FileText className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Body: Config + Preview */}
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row h-[calc(100dvh-60px-60px)] lg:h-[calc(100dvh-60px)]">
        {/* LEFT: Config Panel */}
        <div className={`${mobileTab === 'settings' ? 'block' : 'hidden'} lg:block flex-1 lg:flex-none min-h-0 lg:w-[380px] xl:w-[420px] shrink-0 overflow-y-auto overscroll-contain border-r border-border/10 p-4 space-y-3`}>
          {/* Section 1: Scope */}
          <CollapsibleSection title="📋 Syllabus Scope" open={scopeOpen} onToggle={() => setScopeOpen(p => !p)}
            subtitle={`${selectedTopics.size} of ${totalAvailable} topics selected`}>
            <div className="flex items-center gap-2 mb-3">
              <Button variant="outline" size="sm" onClick={selectAll} className="text-[10px] h-7 px-2.5 font-bold">Select All</Button>
              <Button variant="outline" size="sm" onClick={selectNone} className="text-[10px] h-7 px-2.5 font-bold">Select None</Button>
            </div>
            <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
              {subjects.map(s => {
                const isExpanded = expandedSubjects.has(s.id);
                const isSelected = selectedSubjects.has(s.id);
                const sTopics = s.units.flatMap(u => u.subTopics);
                const selectedCount = sTopics.filter(t => selectedTopics.has(t.id)).length;
                return (
                  <div key={s.id}>
                    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-card/40 transition-colors">
                      <button onClick={() => toggleSubject(s.id)} className="shrink-0">
                        {isSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground/40" />}
                      </button>
                      <button onClick={() => setExpandedSubjects(prev => {
                        const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n;
                      })} className="shrink-0">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className={`text-xs font-semibold flex-1 truncate ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>{s.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">{selectedCount}/{sTopics.length}</span>
                    </div>
                    {isExpanded && (
                      <div className="ml-7 space-y-0.5 border-l-2 border-border/15 pl-3 py-1">
                        {s.units.map(u => {
                          const uSelected = selectedUnits.has(u.id);
                          const uTopicCount = u.subTopics.filter(t => selectedTopics.has(t.id)).length;
                          return (
                            <div key={u.id} className="flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-card/30 transition-colors">
                              <button onClick={() => toggleUnit(s.id, u.id)} className="shrink-0">
                                {uSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5 text-muted-foreground/40" />}
                              </button>
                              <span className={`text-[11px] font-medium flex-1 truncate ${uSelected ? 'text-foreground' : 'text-muted-foreground/60'}`}>{u.name}</span>
                              <span className="text-[9px] font-mono text-muted-foreground shrink-0">{uTopicCount}/{u.subTopics.length}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>

          {/* Section 2: Classification Filters */}
          <CollapsibleSection title="🏷️ Classification Badges" open={badgesOpen} onToggle={() => setBadgesOpen(p => !p)}
            subtitle="Control which badges appear per topic">
            <ToggleRow label="Difficulty Badges" sublabel="Easy / Medium / Hard colored pills" checked={showDifficulty} onChange={setShowDifficulty} />
            <ToggleRow label="Important Badge" sublabel="⭐ Important marker" checked={showImportant} onChange={setShowImportant} />
            <ToggleRow label="NORCET Relevance" sublabel="🎯 High / Med / Low badges" checked={showNorcet} onChange={setShowNorcet} />
          </CollapsibleSection>

          {/* Section 3: Topic Detail Fields */}
          <CollapsibleSection title="📝 Topic Detail Fields" open={detailsOpen} onToggle={() => setDetailsOpen(p => !p)}
            subtitle="What details to show per topic">
            <ToggleRow label="Status & Completion" sublabel="Completion date, time, study hours" checked={showStatus} onChange={setShowStatus} />
            <ToggleRow label="Attachments" sublabel="File names from topic attachments" checked={showAttachments} onChange={setShowAttachments} />
            <ToggleRow label="Resources" sublabel="YouTube, articles, PDF links" checked={showResources} onChange={setShowResources} />
            <ToggleRow label="Notes" sublabel="Topic notes content" checked={showNotes} onChange={setShowNotes} />
          </CollapsibleSection>
        </div>

        {/* RIGHT: Preview Panel */}
        <div className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} lg:flex flex-1 min-w-0 min-h-0 bg-muted/10 overflow-hidden flex-col`}>
          <div className="px-4 py-2 flex items-center justify-between border-b border-border/10 shrink-0">
            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Live Preview
            </span>
            {stats.total > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {stats.subjectCount} subject{stats.subjectCount !== 1 ? 's' : ''} · {stats.unitCount} unit{stats.unitCount !== 1 ? 's' : ''} · {stats.total} topic{stats.total !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div ref={frameBoxRef} className="flex-1 min-h-0 overflow-hidden p-3 lg:p-4">
            {stats.total === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                <EyeOff className="w-10 h-10 text-muted-foreground/30" />
                <div>
                  <p className="text-sm font-bold text-foreground/60">No topics selected</p>
                  <p className="text-xs text-muted-foreground mt-1">Choose at least one topic in Syllabus Scope to generate a report</p>
                </div>
              </div>
            ) : (
              <div className="mx-auto" style={{ width: A4_W * frameScale, height: Math.max(240, frameBox.h) }}>
                <iframe
                  ref={iframeRef}
                  className="rounded-sm bg-white border-0 block"
                  style={{
                    width: A4_W, height: Math.max(240, frameBox.h) / frameScale, transform: `scale(${frameScale})`, transformOrigin: 'top left',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
                  }}
                  title="Report Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Collapsible section wrapper */
function CollapsibleSection({ title, subtitle, open, onToggle, children }: {
  title: string; subtitle?: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/20 bg-card/40 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-card/60 transition-colors">
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-bold text-foreground">{title}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground font-medium">{subtitle}</p>}
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Toggle row */
function ToggleRow({ label, sublabel, checked, onChange }: {
  label: string; sublabel?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/10 last:border-b-0">
      <div>
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {sublabel && <p className="text-[10px] text-muted-foreground">{sublabel}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
