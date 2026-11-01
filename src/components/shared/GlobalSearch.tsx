import { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import { Search, X, CheckCircle2, Circle, Star, Hash, Timer, Filter, ChevronDown, ChevronRight, ExternalLink, ChevronsUpDown, ChevronsDownUp, Tag, FileText, BookOpen, ArrowRight, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import DeepSearchToggle from './DeepSearchToggle';
import TopicStatusBadge from './TopicStatusBadge';
import type { Subject, SubTopic, TopicNavRef } from '../../types';
import { formatDate, formatStudyTime } from '../../lib/utils';
import { normalizeText, tokenizeQuery, scoreTitle, fuzzyIncludesAll, splitForHighlight } from '../../lib/searchUtils';

/** Persisted search state — lives outside the component so it survives unmount/remount */
export interface SearchSnapshot {
  query: string;
  subjectFilter: string;
  collapsedGroups: string[];
  deepSearch: boolean;
  scrollTop: number;
}

let _savedSnapshot: SearchSnapshot | null = null;

export function getSearchSnapshot(): SearchSnapshot | null { return _savedSnapshot; }
export function clearSearchSnapshot() { _savedSnapshot = null; }

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: Subject[];
  onToggleTopic: (subjectId: string, unitId: string, topicId: string) => void;
  onOpenPomodoro?: (subjectId: string, unitId?: string, topicId?: string) => void;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string, navList?: TopicNavRef[]) => void;
  onOpenUnitEditor?: (subjectId: string, unitId: string) => void;
  /** Restore previous query when reopening search via back button */
  initialQuery?: string;
  /** Called whenever the search query changes — used to preserve it for back navigation */
  onQueryChange?: (query: string) => void;
  /** When true, restore the previous search state snapshot instead of resetting */
  restoreState?: boolean;
}

type MatchReason = 'name' | 'unit' | 'subject' | 'tag' | 'notes' | 'resource';

interface SearchResult {
  subject: Subject;
  unitName: string;
  unitId: string;
  topic: SubTopic;
  reasons: MatchReason[];
  score: number;
}

/** Pre-normalised searchable text of one topic — built once per (immutable) topic object. */
interface TopicIndex { name: string; tags: string; notes: string; resources: string }
const topicIndexCache = new WeakMap<object, TopicIndex>();
function getTopicIndex(t: SubTopic): TopicIndex {
  let hit = topicIndexCache.get(t);
  if (hit) return hit;
  hit = {
    name: normalizeText(t.name),
    tags: normalizeText(Array.isArray(t.tags) ? t.tags.map(x => String(x || '')).join(' ') : ''),
    notes: normalizeText(`${t.notes || ''} ${Array.isArray(t.notesArr) ? t.notesArr.filter(n => typeof n === 'string').join(' ') : ''}`),
    resources: normalizeText(Array.isArray(t.resourceLinks) ? t.resourceLinks.map(r => `${r?.title || ''} ${r?.url || ''}`).join(' ') : ''),
  };
  topicIndexCache.set(t, hit);
  return hit;
}

interface IndexEntry {
  subject: Subject; unitId: string; unitName: string; topic: SubTopic;
  idx: TopicIndex; unitN: string; subjectN: string; module: string;
}

export default function GlobalSearch({ open, onClose, subjects, onToggleTopic, onOpenPomodoro, onOpenTopicDetail, onOpenUnitEditor, initialQuery, onQueryChange, restoreState }: Props) {
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [deepSearch, setDeepSearch] = useState(false);
  // Results are shown as a flat list by default (no subject "folder" headers); the toggle brings the grouping back
  const [groupBySubject, setGroupBySubject] = useState<boolean>(() => { try { return localStorage.getItem('global-search-group') === '1'; } catch { return false; } });
  const toggleGrouping = () => setGroupBySubject(prev => { const n = !prev; try { localStorage.setItem('global-search-group', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevOpenRef = useRef(false);

  // Save snapshot whenever state changes (so it's always current)
  useEffect(() => {
    if (open && query) {
      _savedSnapshot = {
        query,
        subjectFilter,
        collapsedGroups: Array.from(collapsedGroups),
        deepSearch,
        scrollTop: scrollContainerRef.current?.scrollTop ?? 0,
      };
    }
  }, [open, query, subjectFilter, collapsedGroups, deepSearch]);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (open && !wasOpen) {
      // Reopening — check if we should restore previous state
      const snap = _savedSnapshot;
      if (restoreState && snap && snap.query) {
        restoredRef.current = true;
        setQuery(snap.query);
        setSubjectFilter(snap.subjectFilter);
        setCollapsedGroups(new Set(snap.collapsedGroups));
        setDeepSearch(snap.deepSearch);
        // Restore scroll position after render
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = snap.scrollTop;
          }
        });
      } else {
        setQuery(initialQuery || '');
        setSubjectFilter('');
        setCollapsedGroups(new Set());
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const filteredSubjects = useMemo(() => {
    return subjectFilter ? subjects.filter(s => s.id === subjectFilter) : subjects;
  }, [subjects, subjectFilter]);

  // Typing stays instant — the heavy matching runs on the deferred value
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;
  const tokens = useMemo(() => tokenizeQuery(deferredQuery), [deferredQuery]);

  // Flat, pre-normalised index — rebuilt only while the dialog is open and the data changes
  const index = useMemo<IndexEntry[]>(() => {
    if (!open) return [];
    const out: IndexEntry[] = [];
    filteredSubjects.forEach(s => {
      const subjectN = normalizeText(`${s.name || ''} ${s.shortName || ''}`);
      (s.units || []).forEach(u => {
        const unitN = normalizeText(u.name);
        (u.subTopics || []).forEach(t => {
          try { out.push({ subject: s, unitId: u.id, unitName: u.name || '', topic: t, idx: getTopicIndex(t), unitN, subjectN, module: normalizeText(`${t.module || ''} ${t.subModule || ''}`) }); } catch { /* skip corrupt topic */ }
        });
      });
    });
    return out;
  }, [open, filteredSubjects]);

  const { results, fuzzy } = useMemo<{ results: SearchResult[]; fuzzy: boolean }>(() => {
    if (tokens.length === 0) return { results: [], fuzzy: false };
    const items: SearchResult[] = [];
    for (const e of index) {
      // every word has to match in at least one field
      let ok = true;
      const reasons = new Set<MatchReason>();
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        let hit = false;
        if (e.idx.name.includes(tok)) { reasons.add('name'); hit = true; }
        if (e.unitN.includes(tok)) { reasons.add('unit'); hit = true; }
        if (e.subjectN.includes(tok)) { reasons.add('subject'); hit = true; }
        if (e.idx.tags.includes(tok)) { reasons.add('tag'); hit = true; }
        if (e.module.includes(tok)) { reasons.add('unit'); hit = true; }
        if (e.idx.notes.includes(tok)) { reasons.add('notes'); hit = true; }
        if (deepSearch && e.idx.resources.includes(tok)) { reasons.add('resource'); hit = true; }
        if (!hit) { ok = false; break; }
      }
      if (!ok) continue;
      const score = scoreTitle(e.topic.name, tokens) + (reasons.has('tag') ? 30 : 0) + (reasons.has('unit') ? 10 : 0);
      items.push({ subject: e.subject, unitName: e.unitName, unitId: e.unitId, topic: e.topic, reasons: Array.from(reasons), score });
    }
    if (items.length === 0 && tokens.some(t => t.length >= 4)) {
      // Nothing matched exactly — fall back to typo-tolerant matching
      for (const e of index) {
        const hay = `${e.idx.name} ${e.unitN} ${e.subjectN} ${e.idx.tags}`;
        if (fuzzyIncludesAll(hay, tokens)) {
          items.push({ subject: e.subject, unitName: e.unitName, unitId: e.unitId, topic: e.topic, reasons: ['name'], score: 1 });
          if (items.length >= 80) break;
        }
      }
      return { results: items.slice(0, 80), fuzzy: items.length > 0 };
    }
    items.sort((a, b) => b.score - a.score);
    return { results: items.slice(0, 80), fuzzy: false };
  }, [tokens, index, deepSearch]);

  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    results.forEach(item => {
      const arr = map.get(item.subject.id) || [];
      arr.push(item);
      map.set(item.subject.id, arr);
    });
    return Array.from(map.entries());
  }, [results]);

  const resultStats = useMemo(() => {
    let complete = 0, inProgress = 0, pending = 0;
    results.forEach(r => {
      const status = r.topic.status || (r.topic.completed ? 'complete' : 'incomplete');
      if (status === 'complete') complete++;
      else if (status === 'in_process') inProgress++;
      else pending++;
    });
    return { complete, inProgress, pending };
  }, [results]);

  const restoredRef = useRef(false);

  useEffect(() => {
    // Don't auto-collapse if we just restored state from a snapshot
    if (restoredRef.current) { restoredRef.current = false; return; }
    // Show the matches themselves: everything open for a normal result set, only the best 3 groups for a very large one
    if (results.length > 40 && grouped.length > 3) {
      setCollapsedGroups(new Set(grouped.slice(3).map(([id]) => id)));
    } else {
      setCollapsedGroups(new Set());
    }
  }, [grouped.length, results.length]);

  const toggleGroup = (id: string) => setCollapsedGroups(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const expandAll = () => setCollapsedGroups(new Set());
  const collapseAll = () => setCollapsedGroups(new Set(grouped.map(([id]) => id)));
  const allExpanded = collapsedGroups.size === 0;
  const allCollapsed = grouped.length > 0 && collapsedGroups.size === grouped.length;

  /** Results in the exact order they are displayed — used for swipe / prev / next inside the topic sheet */
  const orderedResults = useMemo(() => (groupBySubject ? grouped.flatMap(([, items]) => items) : results), [groupBySubject, grouped, results]);

  const totalAll = useMemo(() => filteredSubjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0), [filteredSubjects]);

  const highlightMatch = (text: string, _q: string) => {
    const parts = splitForHighlight(String(text || ''), tokens);
    if (parts.length === 1 && !parts[0].hit) return parts[0].text;
    return (
      <>
        {parts.map((p, i) => p.hit
          ? <span key={i} className="bg-chart-4/30 text-chart-4 rounded px-0.5 font-bold ring-1 ring-chart-4/20">{p.text}</span>
          : <span key={i}>{p.text}</span>)}
      </>
    );
  };

  /** A short excerpt of the notes around the first matching word (only used when the notes are what matched) */
  const getSnippet = (item: SearchResult): string | null => {
    if (!item.reasons.includes('notes')) return null;
    const raw = `${item.topic.notes || ''} ${Array.isArray(item.topic.notesArr) ? item.topic.notesArr.filter(n => typeof n === 'string').join(' ') : ''}`.replace(/\s+/g, ' ').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    let at = -1;
    for (const t of tokens) { const i = lower.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
    if (at < 0) return null;
    const start = Math.max(0, at - 36);
    const end = Math.min(raw.length, at + 84);
    return `${start > 0 ? '…' : ''}${raw.slice(start, end)}${end < raw.length ? '…' : ''}`;
  };

  const handleNavigateToUnit = (subjectId: string, unitId: string, unitName: string) => {
    if (onOpenUnitEditor) {
      onOpenUnitEditor(subjectId, unitId);
      toast(`📂 Opening ${unitName}…`, { duration: 1500 });
    }
  };

  const handleNavigateToSubject = (subjectId: string, subjectName: string) => {
    const subject = subjects.find(s => s.id === subjectId);
    if (onOpenUnitEditor && subject && subject.units.length > 0) {
      onOpenUnitEditor(subjectId, subject.units[0].id);
      toast(`📚 Opening ${subjectName}…`, { duration: 1500 });
    } else {
      // Subject has no units — just close search and navigate to syllabus
      onClose();
      toast(`📚 ${subjectName} has no units yet`, { duration: 2000 });
    }
  };

  const handleOpenTopic = (item: SearchResult) => {
    if (onOpenTopicDetail) {
      // Save snapshot before opening topic detail
      _savedSnapshot = {
        query,
        subjectFilter,
        collapsedGroups: Array.from(collapsedGroups),
        deepSearch,
        scrollTop: scrollContainerRef.current?.scrollTop ?? 0,
      };
      const navList: TopicNavRef[] = orderedResults.map(r => ({ subjectId: r.subject.id, unitId: r.unitId, topicId: r.topic.id }));
      onOpenTopicDetail(item.topic, item.subject.id, item.unitId, navList);
    }
  };

  const reasonIcons: Record<MatchReason, { icon: React.ReactNode; label: string; color: string }> = {
    name: { icon: <BookOpen className="w-2 h-2" />, label: 'name', color: 'text-primary bg-primary/10 border-primary/20' },
    unit: { icon: <Hash className="w-2 h-2" />, label: 'unit', color: 'text-accent bg-accent/10 border-accent/20' },
    subject: { icon: <BookOpen className="w-2 h-2" />, label: 'subject', color: 'text-secondary bg-secondary/10 border-secondary/20' },
    tag: { icon: <Tag className="w-2 h-2" />, label: 'tag', color: 'text-chart-4 bg-chart-4/10 border-chart-4/20' },
    notes: { icon: <FileText className="w-2 h-2" />, label: 'notes', color: 'text-chart-5 bg-chart-5/10 border-chart-5/20' },
    resource: { icon: <ExternalLink className="w-2 h-2" />, label: 'resource', color: 'text-primary bg-primary/10 border-primary/20' },
  };

  const renderRow = (item: SearchResult, showSubject: boolean) => {
    const topicStatus = item.topic.status || (item.topic.completed ? 'complete' : 'incomplete');
    const subject = item.subject;
    const snippet = getSnippet(item);
    return (
      <button
        key={item.topic.id}
        onClick={() => handleOpenTopic(item)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/20 transition-colors text-left border-b border-border/5 group/result cursor-pointer"
      >
        {/* Status badge — dot mode */}
        <TopicStatusBadge status={topicStatus as any} size="dot" showLabel={false} />

        {/* Toggle checkbox */}
        <span
          className="shrink-0"
          onClick={(e) => { e.stopPropagation(); onToggleTopic(item.subject.id, item.unitId, item.topic.id); }}
          role="button"
          tabIndex={0}
        >
          {item.topic.completed ? (
            <CheckCircle2 className="w-4 h-4 text-secondary" />
          ) : (
            <Circle className="w-4 h-4 text-muted-foreground/30 hover:text-primary transition-colors" />
          )}
        </span>

        {/* Topic info */}
        <div className="flex-1 min-w-0">
          <p className={`text-xs ${item.topic.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {highlightMatch(item.topic.name, query)}
          </p>
          {snippet && (
            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">{highlightMatch(snippet, query)}</p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {showSubject && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-md shrink-0" style={{ backgroundColor: subject.color + '18', color: subject.color }}>
                {item.reasons.includes('subject') ? highlightMatch(subject.shortName, query) : subject.shortName}
              </span>
            )}
            {/* Unit badge — clickable, navigates to unit */}
            <span
              onClick={(e) => { e.stopPropagation(); handleNavigateToUnit(item.subject.id, item.unitId, item.unitName); }}
              className="text-[8px] font-bold px-1.5 py-0.5 rounded-md border transition-all hover:scale-105 hover:shadow-sm active:scale-95 cursor-pointer inline-flex items-center gap-0.5"
              style={{ backgroundColor: subject.color + '12', color: subject.color, borderColor: subject.color + '25' }}
              title={`Open ${item.unitName}`}
              role="button"
              tabIndex={0}
            >
              {item.reasons.includes('unit') ? highlightMatch(item.unitName, query) : item.unitName}
              <ArrowRight className="w-2 h-2 opacity-50" />
            </span>
            {/* Match reason badges */}
            {item.reasons.filter(r => r !== 'name').slice(0, 2).map(reason => (
              <span key={reason} className={`inline-flex items-center gap-0.5 text-[7px] font-bold px-1 py-0.5 rounded border ${reasonIcons[reason].color}`}>
                {reasonIcons[reason].icon}
                {reasonIcons[reason].label}
              </span>
            ))}
            {/* Status pill */}
            <TopicStatusBadge status={topicStatus as any} size="sm" showLabel={true} />
            {item.topic.completedDate && (
              <span className="text-[8px] text-muted-foreground/60 font-mono shrink-0">{formatDate(item.topic.completedDate)}</span>
            )}
            {item.topic.timeSpent > 0 && (
              <span className="text-[8px] font-mono font-bold text-secondary shrink-0">⏱ {formatStudyTime(item.topic.timeSpent)}</span>
            )}
          </div>
        </div>

        {item.topic.important && <Star className="w-3 h-3 fill-chart-4 text-chart-4 shrink-0" />}
        <DiffBadge diff={item.topic.difficulty} />
        {/* Pomodoro quick-start */}
        {onOpenPomodoro && !item.topic.completed && (
          <span
            onClick={(e) => { e.stopPropagation(); onOpenPomodoro(item.subject.id, item.unitId, item.topic.id); onClose(); }}
            className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-chart-4/0 group-hover/result:text-chart-4 hover:!bg-chart-4/15 active:scale-90 transition-all border border-transparent group-hover/result:border-chart-4/20"
            title="Start Focus Timer"
            role="button"
            tabIndex={0}
          >
            <Timer className="w-3 h-3" />
          </span>
        )}
      </button>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-md flex items-start justify-center pt-[10vh] sm:pt-[13vh] px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-lg bg-card/95 backdrop-blur-2xl rounded-2xl border border-border/30 shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/20">
              <Search className="w-5 h-5 text-primary shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); onQueryChange?.(e.target.value); }}
                placeholder={deepSearch ? "Deep search: names, notes, resources..." : "Search topics, tags, units..."}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                autoComplete="off"
              />
              <DeepSearchToggle enabled={deepSearch} onToggle={() => setDeepSearch(p => !p)} />
              {query && (
                <span className="text-[10px] text-muted-foreground font-mono shrink-0">{results.length} found</span>
              )}
              <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-full bg-muted/30 flex items-center justify-center hover:bg-muted/50 active:scale-90 transition-all">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Subject Filter Bar */}
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/10 overflow-x-auto scrollbar-hide">
              <Filter className="w-3 h-3 text-muted-foreground shrink-0" />
              <button
                onClick={() => setSubjectFilter('')}
                className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all ${!subjectFilter ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted/20 text-muted-foreground border-border/20 hover:bg-muted/30'}`}
              >
                All
              </button>
              {subjects.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSubjectFilter(prev => prev === s.id ? '' : s.id)}
                  className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all flex items-center gap-1 ${subjectFilter === s.id ? 'bg-primary/15 border-primary/30' : 'bg-muted/20 border-border/20 hover:bg-muted/30'}`}
                  style={subjectFilter === s.id ? { color: s.color } : undefined}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {s.shortName}
                </button>
              ))}
            </div>

            {/* Empty State */}
            {!query && (
              <div className="px-4 py-8 text-center space-y-2">
                <Search className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                <p className="text-xs text-muted-foreground">Search across {totalAll} topics in {filteredSubjects.length} subject{filteredSubjects.length !== 1 ? 's' : ''}</p>
                <p className="text-[10px] text-muted-foreground/60">
                  <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/20 text-[9px] font-mono">Ctrl+K</kbd> to open ·{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/20 text-[9px] font-mono">Esc</kbd> to close
                </p>
              </div>
            )}

            {/* Results */}
            {query && (
              <div ref={scrollContainerRef} className={`max-h-[55vh] overflow-y-auto transition-opacity duration-100 ${isStale ? 'opacity-60' : 'opacity-100'}`}>
                {grouped.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <p className="text-sm text-muted-foreground">No topics found for &ldquo;{query}&rdquo;</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Try a different search term{!deepSearch ? ' or enable Deep Search' : ''}</p>
                  </div>
                ) : (
                  <>
                    {fuzzy && (
                      <div className="px-4 py-1.5 text-[10px] font-semibold text-chart-4 bg-chart-4/5 border-b border-border/10">
                        No exact match — showing close matches for &ldquo;{query.trim()}&rdquo;
                      </div>
                    )}
                    {/* View bar: grouping toggle (+ expand / collapse when grouped) */}
                    <div className="flex items-center justify-between px-4 py-1.5 bg-muted/5 border-b border-border/8">
                      <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                        {results.length} result{results.length !== 1 ? 's' : ''}{groupBySubject ? ` · ${grouped.length} subject${grouped.length !== 1 ? 's' : ''}` : ''}
                      </span>
                      <div className="flex items-center gap-1">
                        {groupBySubject && grouped.length > 1 && (
                          <>
                            <button onClick={expandAll} disabled={allExpanded}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold border transition-all disabled:opacity-30 bg-muted/20 border-border/15 text-muted-foreground hover:bg-muted/40 active:scale-95">
                              <ChevronsUpDown className="w-2.5 h-2.5" /> Expand
                            </button>
                            <button onClick={collapseAll} disabled={allCollapsed}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold border transition-all disabled:opacity-30 bg-muted/20 border-border/15 text-muted-foreground hover:bg-muted/40 active:scale-95">
                              <ChevronsDownUp className="w-2.5 h-2.5" /> Collapse
                            </button>
                          </>
                        )}
                        <button onClick={toggleGrouping} aria-pressed={groupBySubject}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold border transition-all active:scale-95 ${groupBySubject ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-muted/20 border-border/15 text-muted-foreground hover:bg-muted/40'}`}>
                          <Layers className="w-2.5 h-2.5" /> Group by subject
                        </button>
                      </div>
                    </div>

                    {/* Flat list — only the matching topics, no folder / subject headers */}
                    {!groupBySubject && results.map(item => renderRow(item, true))}

                    {groupBySubject && grouped.map(([subjectId, items]) => {
                      const subject = items[0].subject;
                      const isCollapsed = collapsedGroups.has(subjectId);
                      const groupComplete = items.filter(i => i.topic.completed).length;
                      return (
                        <div key={subjectId}>
                          {/* Subject Group Header */}
                          <div className="w-full px-4 py-2 bg-muted/10 border-b border-border/10 sticky top-0 backdrop-blur-sm z-10 hover:bg-muted/20 transition-colors flex items-center gap-2">
                            <button
                              onClick={() => toggleGroup(subjectId)}
                              className="flex items-center gap-2 flex-1 min-w-0"
                            >
                              {isCollapsed ? <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />}
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
                              <span className="text-[10px] font-bold" style={{ color: subject.color }}>{subject.shortName}</span>
                              <span className="text-[10px] text-muted-foreground truncate">{subject.name}</span>
                            </button>
                            <span className="text-[9px] text-muted-foreground/60 shrink-0 flex items-center gap-1.5">
                              <span className="text-secondary font-bold">{groupComplete}✓</span>
                              <span>{items.length} match{items.length !== 1 ? 'es' : ''}</span>
                            </span>
                            {/* Navigate to subject button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleNavigateToSubject(subjectId, subject.shortName); }}
                              className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center hover:bg-primary/10 active:scale-90 transition-all border border-transparent hover:border-primary/20"
                              title={`Go to ${subject.shortName}`}
                            >
                              <ArrowRight className="w-3 h-3 text-muted-foreground/40 hover:text-primary" />
                            </button>
                          </div>
                          <AnimatePresence>
                            {!isCollapsed && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                                {items.map(item => renderRow(item, false))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}

                    {/* Results Stats Bar */}
                    {results.length > 0 && (
                      <div className="flex items-center justify-center gap-3 px-4 py-2.5 bg-muted/8 border-t border-border/10">
                        {resultStats.complete > 0 && (
                          <span className="flex items-center gap-1 text-[9px] font-bold text-secondary">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary shadow-[0_0_4px_hsl(var(--secondary)/0.4)]" />
                            {resultStats.complete} done
                          </span>
                        )}
                        {resultStats.inProgress > 0 && (
                          <span className="flex items-center gap-1 text-[9px] font-bold text-chart-4">
                            <span className="w-1.5 h-1.5 rounded-full bg-chart-4 shadow-[0_0_4px_hsl(var(--chart-4)/0.4)]" />
                            {resultStats.inProgress} in progress
                          </span>
                        )}
                        {resultStats.pending > 0 && (
                          <span className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                            {resultStats.pending} pending
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
                {results.length >= 80 && (
                  <p className="text-[10px] text-muted-foreground text-center py-3">Showing first 80 results</p>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DiffBadge({ diff }: { diff: string }) {
  const safeDiff = String(diff || '');
  const styles: Record<string, string> = {
    Easy: 'bg-secondary/12 text-secondary',
    Medium: 'bg-chart-4/12 text-chart-4',
    Hard: 'bg-destructive/12 text-destructive',
  };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 font-bold ${styles[safeDiff] || 'bg-muted/12 text-muted-foreground'}`}>{safeDiff}</span>;
}
