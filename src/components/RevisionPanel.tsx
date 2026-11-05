import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Check, X, Copy, ChevronLeft, ChevronRight, ChevronDown, Brain, Star, Zap, BookOpen, RotateCcw, ExternalLink, AlertTriangle, Filter, Eye, EyeOff, Hash, Flame, Trophy, SlidersHorizontal, Play, ArrowUpDown, Layers, Timer } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Switch } from '@project/components/ui/switch';
import { Label } from '@project/components/ui/label';
import { toast } from 'sonner';
import { REVISION_KEYS } from '../types';
import type { Subject, SubTopic, RevisionKey, TopicNavRef } from '../types';
import { isDueToday, getNextDueDate, getDueCountdown } from '../lib/srs';
import { formatStudyTime, getLocalDateStr, readableInk } from '../lib/utils';
import { computeSubjectRevisionStats } from '../lib/revisionStats';
import {
  SORT_OPTIONS, PRESETS, STATUS_LABEL, ROUND_FILTER_OPTIONS, TIME_FILTER_OPTIONS,
  roundsDone, roundState, studyMinutes, lastTouched, daysSince, agoLabel,
  matchesRoundFilter, matchesTimeFilter, getComparator,
} from '../lib/revisionCenter';
import type { SortKey, StatusKey, RoundFilter, TimeFilter, PresetDef } from '../lib/revisionCenter';
import EmptyState from './shared/EmptyState';
import SubjectLink from './shared/SubjectLink';
import TopicStatusBadge from './shared/TopicStatusBadge';
import { Markdown } from '@project/components/markdown';
import { matchesFields } from '../lib/searchUtils';

type DiffFilter = 'all' | 'Hard' | 'Medium' | 'Easy';
type NorcetFilter = 'all' | 'High' | 'Med' | 'Low' | 'none';

interface TopicItem {
  subject: Subject;
  unitName: string;
  unitId: string;
  topic: SubTopic;
}

interface Props {
  subjects: Subject[];
  onUpdate: (subjects: Subject[]) => void;
  initialFilter?: Record<string, string>;
  onOpenTopicDetail?: (topic: SubTopic, subjectId: string, unitId: string, navList?: TopicNavRef[]) => void;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
}

function getUserSettings() {
  try {
    const raw = localStorage.getItem('nursing-settings-v2');
    if (!raw) return { examLabel: 'NORCET' };
    const s = JSON.parse(raw);
    const mode = s.studentMode || 'nursing';
    return { examLabel: mode === 'agriculture' ? (s.examLabelAgriculture || 'AAO') : (s.examLabelNursing || 'NORCET') };
  } catch { return { examLabel: 'NORCET' }; }
}

type ViewMode = 'topics' | 'subjects';
type SubjectSort = 'leastRevised' | 'mostRevised' | 'mostPending' | 'mostTime' | 'az';

interface Prefs {
  view: ViewMode;
  sort: SortKey;
  status: StatusKey;
  rounds: RoundFilter;
  time: TimeFilter;
  important: boolean;
  showUnitName: boolean;
  subjectSort: SubjectSort;
}

const PREFS_KEY = 'revision-center-prefs-v2';
const DEFAULT_PREFS: Prefs = { view: 'topics', sort: 'default', status: 'all', rounds: 'any', time: 'any', important: false, showUnitName: true, subjectSort: 'leastRevised' };

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      view: p.view === 'subjects' ? 'subjects' : 'topics',
      sort: SORT_OPTIONS.some(o => o.key === p.sort) ? (p.sort as SortKey) : 'default',
      status: p.status && p.status in STATUS_LABEL ? p.status : 'all',
      rounds: ROUND_FILTER_OPTIONS.some(o => o.key === p.rounds) ? (p.rounds as RoundFilter) : 'any',
      time: TIME_FILTER_OPTIONS.some(o => o.key === p.time) ? (p.time as TimeFilter) : 'any',
      important: !!p.important,
      showUnitName: p.showUnitName !== false,
      subjectSort: (['leastRevised', 'mostRevised', 'mostPending', 'mostTime', 'az'] as const).includes(p.subjectSort as SubjectSort) ? (p.subjectSort as SubjectSort) : 'leastRevised',
    };
  } catch { return DEFAULT_PREFS; }
}

const PAGE = 60;

export default function RevisionPanel({ subjects, onUpdate, initialFilter, onOpenTopicDetail, onNavigate }: Props) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const patchPrefs = useCallback((p: Partial<Prefs>) => setPrefs(prev => ({ ...prev, ...p })), []);
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } }, [prefs]);
  const { view, sort, status: statusFilter, rounds: roundFilter, time: timeFilter, important: importantFilter, showUnitName, subjectSort } = prefs;

  const [search, setSearch] = useState('');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>(() => {
    if (initialFilter?.difficulty && ['Easy', 'Medium', 'Hard'].includes(initialFilter.difficulty)) return initialFilter.difficulty as DiffFilter;
    return 'all';
  });
  const [subjectFilter, setSubjectFilter] = useState<string>(() => initialFilter?.subject || 'all');
  const [norcetFilter, setNorcetFilter] = useState<NorcetFilter>('all');
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [topicNumberMin, setTopicNumberMin] = useState('');
  const [topicNumberMax, setTopicNumberMax] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [flashcards, setFlashcards] = useState(false);
  const [visible, setVisible] = useState(PAGE);

  const { examLabel } = useMemo(() => getUserSettings(), []);
  const today = getLocalDateStr();

  useEffect(() => {
    if (!initialFilter) return;
    if (initialFilter.difficulty && ['Easy', 'Medium', 'Hard'].includes(initialFilter.difficulty)) setDiffFilter(initialFilter.difficulty as DiffFilter);
    if (initialFilter.subject) { setSubjectFilter(initialFilter.subject); patchPrefs({ view: 'topics' }); }
    if (initialFilter.status === 'important') patchPrefs({ status: 'incomplete', view: 'topics' });
  }, [initialFilter, patchPrefs]);

  const allTopics = useMemo(() => {
    const topics: TopicItem[] = [];
    subjects.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
      topics.push({ subject: s, unitName: u.name, unitId: u.id, topic: t });
    })));
    return topics;
  }, [subjects]);

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    allTopics.forEach(i => { if (i.topic.category) cats.add(String(i.topic.category)); });
    return Array.from(cats).sort();
  }, [allTopics]);

  const weakIds = useMemo(() => {
    const ids = new Set<string>();
    allTopics.forEach(i => {
      const t = i.topic;
      if (!t.completed) return;
      if (t.timeSpent > 0 && t.timeSpent < 1) ids.add(t.id);
      else if (t.timeSpent === 0 && !t.notes && (!t.notesArr || t.notesArr.length === 0)) ids.add(t.id);
    });
    return ids;
  }, [allTopics]);

  const matchesStatus = useCallback((t: SubTopic, f: StatusKey): boolean => {
    switch (f) {
      case 'all': return true;
      case 'completed': return !!t.completed;
      case 'incomplete': return !t.completed;
      case 'in_progress': return !t.completed && t.status === 'in_process';
      case 'not_started': return !t.completed && t.status !== 'in_process';
      case 'due': return !!t.completed && isDueToday(t.srsDueDate);
      case 'weak': return weakIds.has(t.id);
      default: return true;
    }
  }, [weakIds]);

  // Items in scope of the subject picker — the status pills show counts for exactly this scope
  const scoped = useMemo(() => {
    if (subjectFilter === 'all') return allTopics;
    const ids = subjectFilter.split(',');
    return allTopics.filter(i => ids.includes(i.subject.id));
  }, [allTopics, subjectFilter]);

  const statusCounts = useMemo(() => {
    const c: Record<StatusKey, number> = { all: scoped.length, completed: 0, incomplete: 0, in_progress: 0, not_started: 0, due: 0, weak: 0 };
    scoped.forEach(i => {
      const t = i.topic;
      if (t.completed) c.completed++; else { c.incomplete++; if (t.status === 'in_process') c.in_progress++; else c.not_started++; }
      if (t.completed && isDueToday(t.srsDueDate)) c.due++;
      if (weakIds.has(t.id)) c.weak++;
    });
    return c;
  }, [scoped, weakIds]);

  const filtered = useMemo(() => {
    let items = scoped;
    if (diffFilter !== 'all') items = items.filter(i => i.topic.difficulty === diffFilter);
    if (statusFilter !== 'all') items = items.filter(i => matchesStatus(i.topic, statusFilter));
    if (roundFilter !== 'any') items = items.filter(i => matchesRoundFilter(i.topic, roundFilter));
    if (timeFilter !== 'any') items = items.filter(i => matchesTimeFilter(i.topic, timeFilter));
    if (importantFilter) items = items.filter(i => i.topic.important);
    if (norcetFilter !== 'all') {
      items = norcetFilter === 'none' ? items.filter(i => !i.topic.norcetRelevance) : items.filter(i => i.topic.norcetRelevance === norcetFilter);
    }
    if (starFilter !== null) items = items.filter(i => (i.topic.rank || 0) >= starFilter);
    if (categoryFilter !== 'all') items = items.filter(i => i.topic.category === categoryFilter);
    if (topicNumberMin) { const min = parseInt(topicNumberMin, 10); if (!isNaN(min)) items = items.filter(i => (i.topic.topicNumber ?? 0) >= min); }
    if (topicNumberMax) { const max = parseInt(topicNumberMax, 10); if (!isNaN(max)) items = items.filter(i => (i.topic.topicNumber ?? Infinity) <= max); }
    if (search) items = items.filter(i => matchesFields(search, [i.topic.name, i.unitName, i.subject.shortName, i.subject.name, ...(i.topic.tags || [])]));
    const cmp = getComparator(sort);
    if (cmp) items = items.slice().sort((x, y) => cmp(x.topic, y.topic));
    return items;
  }, [scoped, diffFilter, statusFilter, roundFilter, timeFilter, importantFilter, norcetFilter, starFilter, categoryFilter, topicNumberMin, topicNumberMax, search, sort, matchesStatus]);

  useEffect(() => { setVisible(PAGE); }, [filtered]);

  const stats = useMemo(() => {
    const hard = filtered.filter(i => i.topic.difficulty === 'Hard');
    const med = filtered.filter(i => i.topic.difficulty === 'Medium');
    const easy = filtered.filter(i => i.topic.difficulty === 'Easy');
    let minutes = 0;
    filtered.forEach(i => { minutes += studyMinutes(i.topic); });
    return { hard, med, easy, total: filtered.length, done: filtered.filter(i => i.topic.completed).length, minutes };
  }, [filtered]);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (diffFilter !== 'all') c++;
    if (importantFilter) c++;
    if (norcetFilter !== 'all') c++;
    if (starFilter !== null) c++;
    if (categoryFilter !== 'all') c++;
    if (topicNumberMin || topicNumberMax) c++;
    if (subjectFilter !== 'all') c++;
    if (statusFilter !== 'all') c++;
    if (roundFilter !== 'any') c++;
    if (timeFilter !== 'any') c++;
    return c;
  }, [diffFilter, importantFilter, norcetFilter, starFilter, categoryFilter, topicNumberMin, topicNumberMax, subjectFilter, statusFilter, roundFilter, timeFilter]);

  const clearAllFilters = useCallback(() => {
    setDiffFilter('all'); setSubjectFilter('all');
    setNorcetFilter('all'); setStarFilter(null);
    setCategoryFilter('all'); setTopicNumberMin(''); setTopicNumberMax('');
    setSearch('');
    patchPrefs({ status: 'all', rounds: 'any', time: 'any', important: false, sort: 'default' });
  }, [patchPrefs]);

  const activePresetId = useMemo(() => PRESETS.find(p =>
    p.status === statusFilter && p.rounds === roundFilter && p.time === timeFilter && p.sort === sort && !!p.important === importantFilter
  )?.id ?? null, [statusFilter, roundFilter, timeFilter, sort, importantFilter]);

  const applyPreset = useCallback((p: PresetDef) => {
    if (activePresetId === p.id) { patchPrefs({ status: 'all', rounds: 'any', time: 'any', sort: 'default', important: false }); return; }
    setDiffFilter('all'); setNorcetFilter('all'); setStarFilter(null); setCategoryFilter('all'); setTopicNumberMin(''); setTopicNumberMax('');
    patchPrefs({ status: p.status, rounds: p.rounds, time: p.time, sort: p.sort, important: !!p.important });
  }, [activePresetId, patchPrefs]);

  const handleSRSReview = useCallback((topicId: string, subjectId: string, unitId: string, gotIt: boolean) => {
    const { newLevel, dueDate } = getNextDueDate(0, gotIt);
    const updated = subjects.map(s => s.id !== subjectId ? s : ({
      ...s, units: s.units.map(u => u.id !== unitId ? u : ({
        ...u, subTopics: u.subTopics.map(t => t.id !== topicId ? t : ({
          ...t, srsLevel: newLevel, srsDueDate: dueDate, lastReviewedDate: getLocalDateStr(),
        })),
      })),
    }));
    onUpdate(updated);
    toast.success(gotIt ? '✓ Got it! Next review later.' : '✗ Reset — review tomorrow.');
  }, [subjects, onUpdate]);

  const exportFiltered = useCallback(() => {
    if (filtered.length === 0) { toast.info('No topics to export'); return; }
    const lines = filtered.map((i, idx) => {
      const status = i.topic.completed ? '✅' : i.topic.status === 'in_process' ? '🔄' : '☐';
      const num = i.topic.topicNumber != null ? ` #${i.topic.topicNumber}` : '';
      const imp = i.topic.important ? ' ⭐' : '';
      const rel = i.topic.norcetRelevance ? ` [${i.topic.norcetRelevance}]` : '';
      const rev = ` · R ${roundsDone(i.topic)}/4`;
      const time = studyMinutes(i.topic) > 0 ? ` · ${formatStudyTime(studyMinutes(i.topic))}` : '';
      return `${idx + 1}. ${status} ${i.topic.name}${num} — ${i.subject.shortName} › ${i.unitName} [${i.topic.difficulty}]${imp}${rel}${rev}${time}`;
    });
    const filterDesc: string[] = [];
    if (diffFilter !== 'all') filterDesc.push(`Difficulty: ${diffFilter}`);
    if (statusFilter !== 'all') filterDesc.push(`Status: ${STATUS_LABEL[statusFilter]}`);
    if (roundFilter !== 'any') filterDesc.push(`Revision: ${ROUND_FILTER_OPTIONS.find(o => o.key === roundFilter)?.label}`);
    if (timeFilter !== 'any') filterDesc.push(`Time: ${TIME_FILTER_OPTIONS.find(o => o.key === timeFilter)?.label}`);
    if (importantFilter) filterDesc.push('Important only');
    if (norcetFilter !== 'all') filterDesc.push(`${examLabel}: ${norcetFilter}`);
    if (subjectFilter !== 'all') filterDesc.push(`Subject: ${subjects.find(s => s.id === subjectFilter)?.shortName || subjectFilter}`);
    if (categoryFilter !== 'all') filterDesc.push(`Category: ${categoryFilter}`);
    if (sort !== 'default') filterDesc.push(`Sorted: ${SORT_OPTIONS.find(o => o.key === sort)?.label}`);
    const filterLine = filterDesc.length > 0 ? `Filters: ${filterDesc.join(' · ')}\n` : '';
    const text = `📋 Revision Export (${filtered.length} topics)\n${filterLine}${'─'.repeat(40)}\n${lines.join('\n')}`;
    navigator.clipboard.writeText(text);
    toast.success(`📋 Copied ${filtered.length} topics to clipboard`);
  }, [filtered, diffFilter, statusFilter, roundFilter, timeFilter, sort, importantFilter, norcetFilter, subjectFilter, categoryFilter, examLabel, subjects]);

  // The visible list is also the list you swipe through inside the topic sheet
  const navList = useMemo<TopicNavRef[]>(() => filtered.map(i => ({ subjectId: i.subject.id, unitId: i.unitId, topicId: i.topic.id })), [filtered]);

  const handleTopicClick = useCallback((item: TopicItem) => {
    onOpenTopicDetail?.(item.topic, item.subject.id, item.unitId, navList);
  }, [onOpenTopicDetail, navList]);

  const startRevising = useCallback(() => {
    const first = filtered[0];
    if (first) onOpenTopicDetail?.(first.topic, first.subject.id, first.unitId, navList);
  }, [filtered, navList, onOpenTopicDetail]);

  // Jump from a subject card to the topic list, pre-filtered to what still needs revising in that subject
  const reviseSubject = useCallback((subjectId: string, firstOpen: RevisionKey | undefined) => {
    setSubjectFilter(subjectId);
    setDiffFilter('all'); setNorcetFilter('all'); setStarFilter(null); setCategoryFilter('all'); setTopicNumberMin(''); setTopicNumberMax(''); setSearch('');
    patchPrefs({ view: 'topics', status: 'completed', rounds: firstOpen ? (`missing${firstOpen}` as RoundFilter) : 'full', time: 'any', sort: 'leastRevised', important: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [patchPrefs]);

  if (allTopics.length === 0) {
    return <EmptyState emoji="🧠" title="No Topics to Review" description="Add subjects and topics in the Syllabus tab first." actionLabel="📚 Go to Syllabus" />;
  }

  if (flashcards) {
    return <FlashcardView items={filtered} onBack={() => setFlashcards(false)} onSRSReview={handleSRSReview} />;
  }

  const shown = filtered.slice(0, visible);

  return (
    <div className="space-y-3">
      {/* ══════ HEADER ══════ */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" /> Revision Center
        </h2>
        {view === 'topics' && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setFlashcards(true)} className="gap-1 text-[11px] h-8 rounded-xl">🃏 Flashcards</Button>
            <Button variant="outline" size="sm" onClick={exportFiltered} className="gap-1 text-[11px] h-8 rounded-xl"><Copy className="w-3 h-3" /> Export</Button>
          </div>
        )}
      </div>

      {/* ══════ VIEW SWITCH ══════ */}
      <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-card/50 border border-border/15">
        {([
          { id: 'topics' as ViewMode, label: 'Topics', icon: <BookOpen className="w-3.5 h-3.5" /> },
          { id: 'subjects' as ViewMode, label: 'Subject Progress', icon: <Layers className="w-3.5 h-3.5" /> },
        ]).map(v => (
          <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => patchPrefs({ view: v.id })}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold transition-[background-color,color,box-shadow] duration-150 ${
              view === v.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/70 hover:bg-card'
            }`}>
            {v.icon}{v.label}
          </button>
        ))}
      </div>

      {view === 'subjects' ? (
        <SubjectProgressView subjects={subjects} today={today} sort={subjectSort} onSort={s => patchPrefs({ subjectSort: s })}
          onRevise={reviseSubject} onOpenTopic={onOpenTopicDetail} onNavigate={onNavigate} />
      ) : (
        <>
          {/* ══════ DIFFICULTY CARDS ══════ */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Hard" count={stats.hard.length} done={stats.hard.filter(i => i.topic.completed).length}
              emoji="⚡" active={diffFilter === 'Hard'} onClick={() => setDiffFilter(diffFilter === 'Hard' ? 'all' : 'Hard')}
              colorClass="text-red-500" bgClass="bg-red-500/10 border-red-500/25" />
            <StatCard label="Medium" count={stats.med.length} done={stats.med.filter(i => i.topic.completed).length}
              emoji="📖" active={diffFilter === 'Medium'} onClick={() => setDiffFilter(diffFilter === 'Medium' ? 'all' : 'Medium')}
              colorClass="text-amber-500" bgClass="bg-amber-500/10 border-amber-500/25" />
            <StatCard label="Easy" count={stats.easy.length} done={stats.easy.filter(i => i.topic.completed).length}
              emoji="☆" active={diffFilter === 'Easy'} onClick={() => setDiffFilter(diffFilter === 'Easy' ? 'all' : 'Easy')}
              colorClass="text-emerald-500" bgClass="bg-emerald-500/10 border-emerald-500/25" />
          </div>

          {/* ══════ SEARCH + SUBJECT ══════ */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search topics..." className="pl-10 h-9 text-sm bg-card/50 border-border/20 rounded-xl" />
            </div>
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger className="h-9 w-[130px] text-xs rounded-xl bg-card/50 border-border/20"><SelectValue placeholder="All Subjects" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.shortName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* ══════ SMART PRESETS ══════ */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/70 mb-1.5 px-0.5">Smart views</p>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
              {PRESETS.map(p => {
                const active = activePresetId === p.id;
                return (
                  <button key={p.id} onClick={() => applyPreset(p)} title={p.hint} aria-pressed={active}
                    className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-[background-color,color,border-color,transform] duration-150 active:scale-95 ${
                      active ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-card/50 text-foreground/75 border-border/20 hover:bg-card hover:text-foreground'
                    }`}>
                    <span>{p.emoji}</span>{p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ══════ STATUS PILLS ══════ */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
            {(['all', 'completed', 'incomplete', 'in_progress', 'not_started', 'due', 'weak'] as StatusKey[]).map(k => (
              <button key={k} onClick={() => patchPrefs({ status: k })} aria-pressed={statusFilter === k}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-[background-color,color,border-color] duration-150 ${
                  statusFilter === k ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-card/50 text-foreground/70 border-border/20 hover:bg-card hover:text-foreground'
                }`}>
                {STATUS_LABEL[k]} <span className={`font-mono ${statusFilter === k ? 'opacity-80' : 'text-muted-foreground'}`}>{statusCounts[k]}</span>
              </button>
            ))}
          </div>

          {/* ══════ SORT + FILTERS ══════ */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-primary shrink-0" />
              <Select value={sort} onValueChange={v => patchPrefs({ sort: v as SortKey })}>
                <SelectTrigger className="h-9 flex-1 min-w-0 text-xs rounded-xl bg-card/50 border-border/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(o => (
                    <SelectItem key={o.key} value={o.key}>
                      <span className="font-semibold">{o.label}</span>
                      <span className="text-muted-foreground"> · {o.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button onClick={() => setFiltersOpen(p => !p)} aria-expanded={filtersOpen}
              className={`shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-xl border text-[11px] font-bold transition-colors ${
                filtersOpen || activeFilterCount > 0 ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card/50 border-border/20 text-foreground/70'
              }`}>
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
              {activeFilterCount > 0 && <span className="text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full min-w-[16px] text-center">{activeFilterCount}</span>}
            </button>
          </div>

          {filtersOpen && (
            <div className="rounded-2xl border border-border/15 bg-card/60 overflow-hidden animate-fade-in">
              <div className="px-4 py-4 space-y-4">
                <FilterSection icon={<RotateCcw className="w-3.5 h-3.5 text-primary" />} label="Revision rounds" active={roundFilter !== 'any'}>
                  <div className="flex gap-1.5 flex-wrap">
                    {ROUND_FILTER_OPTIONS.map(o => (
                      <button key={o.key} onClick={() => patchPrefs({ rounds: o.key })}
                        className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-colors ${roundFilter === o.key ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-card/30 border-border/15 text-foreground/60 hover:bg-card/60'}`}>{o.label}</button>
                    ))}
                  </div>
                </FilterSection>

                <FilterSection icon={<Timer className="w-3.5 h-3.5 text-chart-4" />} label="Time spent studying" active={timeFilter !== 'any'}>
                  <div className="flex gap-1.5 flex-wrap">
                    {TIME_FILTER_OPTIONS.map(o => (
                      <button key={o.key} onClick={() => patchPrefs({ time: o.key })}
                        className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-colors ${timeFilter === o.key ? 'bg-chart-4/15 border-chart-4/30 text-chart-4' : 'bg-card/30 border-border/15 text-foreground/60 hover:bg-card/60'}`}>{o.label}</button>
                    ))}
                  </div>
                </FilterSection>

                <FilterSection icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-500" />} label="Difficulty" active={diffFilter !== 'all'}>
                  <div className="flex gap-1.5">
                    {(['all', 'Easy', 'Medium', 'Hard'] as DiffFilter[]).map(d => (
                      <button key={d} onClick={() => setDiffFilter(d)}
                        className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
                          diffFilter === d
                            ? d === 'Easy' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600'
                              : d === 'Medium' ? 'bg-amber-500/15 border-amber-500/30 text-amber-600'
                              : d === 'Hard' ? 'bg-red-500/15 border-red-500/30 text-red-600'
                              : 'bg-primary/15 border-primary/30 text-primary'
                            : 'bg-card/30 border-border/15 text-foreground/60 hover:bg-card/60'
                        }`}>
                        {d === 'all' ? '📊 All' : d === 'Easy' ? '🟢 Easy' : d === 'Medium' ? '🟡 Med' : '🔴 Hard'}
                      </button>
                    ))}
                  </div>
                </FilterSection>

                <FilterSection icon={<Flame className="w-3.5 h-3.5 text-amber-500" />} label="Important" active={importantFilter}>
                  <div className="flex items-center gap-3">
                    <Switch checked={importantFilter} onCheckedChange={v => patchPrefs({ important: v })} />
                    <Label className="text-[11px] text-foreground/70 font-semibold">{importantFilter ? '⭐ Showing important only' : 'Show all topics'}</Label>
                  </div>
                </FilterSection>

                <FilterSection icon={<Zap className="w-3.5 h-3.5 text-primary" />} label={examLabel} active={norcetFilter !== 'all'}>
                  <div className="flex gap-1.5">
                    {([{ key: 'all' as NorcetFilter, label: 'All' }, { key: 'High' as NorcetFilter, label: 'High' }, { key: 'Med' as NorcetFilter, label: 'Med' }, { key: 'Low' as NorcetFilter, label: 'Low' }, { key: 'none' as NorcetFilter, label: 'None' }]).map(n => (
                      <button key={n.key} onClick={() => setNorcetFilter(n.key)}
                        className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${norcetFilter === n.key ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-card/30 border-border/15 text-foreground/60 hover:bg-card/60'}`}>{n.label}</button>
                    ))}
                  </div>
                </FilterSection>

                <FilterSection icon={<Trophy className="w-3.5 h-3.5 text-chart-4" />} label="Star Rating" active={starFilter !== null}>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(r => (
                      <button key={r} onClick={() => setStarFilter(starFilter === r ? null : r)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-colors border ${starFilter !== null && r <= starFilter ? 'bg-chart-4/15 border-chart-4/35 shadow-sm' : 'bg-muted/10 border-border/10 hover:bg-muted/20'}`}>
                        {starFilter !== null && r <= starFilter ? '★' : '☆'}
                      </button>
                    ))}
                    {starFilter !== null && <span className="text-[10px] text-muted-foreground ml-1">≥ {starFilter}★</span>}
                  </div>
                </FilterSection>

                {allCategories.length > 0 && (
                  <FilterSection icon={<BookOpen className="w-3.5 h-3.5 text-accent" />} label="Category" active={categoryFilter !== 'all'}>
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => setCategoryFilter('all')} className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-colors ${categoryFilter === 'all' ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-card/30 border-border/15 text-foreground/60 hover:bg-card/60'}`}>All</button>
                      {allCategories.map(cat => (
                        <button key={cat} onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)}
                          className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-colors ${categoryFilter === cat ? 'bg-accent/15 border-accent/30 text-accent-ink' : 'bg-card/30 border-border/15 text-foreground/60 hover:bg-card/60'}`}>{cat}</button>
                      ))}
                    </div>
                  </FilterSection>
                )}

                <FilterSection icon={<Hash className="w-3.5 h-3.5 text-primary" />} label="Topic #" active={!!topicNumberMin || !!topicNumberMax}>
                  <div className="flex items-center gap-2">
                    <Input type="text" inputMode="numeric" pattern="[0-9]*" value={topicNumberMin} onChange={e => setTopicNumberMin(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Min" className="w-20 h-8 text-[11px] text-center bg-card border-border/20 rounded-xl font-mono" />
                    <span className="text-[10px] text-muted-foreground">to</span>
                    <Input type="text" inputMode="numeric" pattern="[0-9]*" value={topicNumberMax} onChange={e => setTopicNumberMax(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Max" className="w-20 h-8 text-[11px] text-center bg-card border-border/20 rounded-xl font-mono" />
                  </div>
                </FilterSection>

                <div className="flex items-center justify-between pt-1 border-t border-border/10">
                  <div className="flex items-center gap-2">
                    {showUnitName ? <Eye className="w-3.5 h-3.5 text-muted-foreground" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                    <Label className="text-[11px] text-foreground/70 font-bold">Show unit names</Label>
                  </div>
                  <Switch checked={showUnitName} onCheckedChange={v => patchPrefs({ showUnitName: v })} />
                </div>

                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} className="w-full py-2 rounded-xl text-[11px] font-bold text-destructive border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors">Clear all filters</button>
                )}
              </div>
            </div>
          )}

          {/* ══════ ACTIVE FILTER CHIPS ══════ */}
          {activeFilterCount > 0 && !filtersOpen && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="w-3 h-3 text-primary shrink-0" />
              {diffFilter !== 'all' && <FilterChip label={diffFilter} onClear={() => setDiffFilter('all')} />}
              {statusFilter !== 'all' && <FilterChip label={STATUS_LABEL[statusFilter]} onClear={() => patchPrefs({ status: 'all' })} />}
              {roundFilter !== 'any' && <FilterChip label={ROUND_FILTER_OPTIONS.find(o => o.key === roundFilter)?.label || 'Rounds'} onClear={() => patchPrefs({ rounds: 'any' })} />}
              {timeFilter !== 'any' && <FilterChip label={`Time ${TIME_FILTER_OPTIONS.find(o => o.key === timeFilter)?.label}`} onClear={() => patchPrefs({ time: 'any' })} />}
              {importantFilter && <FilterChip label="Important" onClear={() => patchPrefs({ important: false })} />}
              {norcetFilter !== 'all' && <FilterChip label={`${examLabel}: ${norcetFilter}`} onClear={() => setNorcetFilter('all')} />}
              {starFilter !== null && <FilterChip label={`≥${starFilter}★`} onClear={() => setStarFilter(null)} />}
              {categoryFilter !== 'all' && <FilterChip label={categoryFilter} onClear={() => setCategoryFilter('all')} />}
              {(topicNumberMin || topicNumberMax) && <FilterChip label={`#${topicNumberMin || '0'}–${topicNumberMax || '∞'}`} onClear={() => { setTopicNumberMin(''); setTopicNumberMax(''); }} />}
              {subjectFilter !== 'all' && <FilterChip label={subjects.find(s => s.id === subjectFilter)?.shortName || 'Subject'} onClear={() => setSubjectFilter('all')} />}
              <button onClick={clearAllFilters} className="text-[10px] font-bold text-destructive hover:underline px-1">Clear all</button>
            </div>
          )}

          {/* ══════ RESULTS SUMMARY ══════ */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-bold text-muted-foreground truncate">
              {filtered.length} topic{filtered.length !== 1 ? 's' : ''} · {stats.done} done{stats.minutes > 0 ? ` · ${formatStudyTime(stats.minutes)}` : ''}
            </span>
            {filtered.length > 0 && onOpenTopicDetail && (
              <button onClick={startRevising}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold shadow-sm active:scale-95 transition-transform">
                <Play className="w-3 h-3 fill-current" /> Start revising
              </button>
            )}
          </div>

          {/* ══════ TOPIC LIST ══════ */}
          {filtered.length === 0 ? (
            <EmptyState emoji="🔍" title="No Topics Found" description="Try adjusting your filters or search query."
              actionLabel={activeFilterCount > 0 || search ? '✕ Clear Filters' : undefined}
              onAction={activeFilterCount > 0 || search ? clearAllFilters : undefined} />
          ) : (
            <div className="space-y-1.5">
              {shown.map(item => (
                <TopicRow key={item.topic.id} item={item} showUnitName={showUnitName} isWeak={weakIds.has(item.topic.id)} today={today}
                  onTopicClick={handleTopicClick} onSRSReview={handleSRSReview} onNavigate={onNavigate} hasDetailHandler={!!onOpenTopicDetail} />
              ))}
              {filtered.length > shown.length && (
                <button onClick={() => setVisible(v => v + PAGE)}
                  className="w-full py-2.5 rounded-xl border border-border/20 bg-card/50 text-[11px] font-bold text-foreground/80 hover:bg-card active:scale-[0.99] transition">
                  Show {Math.min(PAGE, filtered.length - shown.length)} more · {shown.length} of {filtered.length}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   SUBJECT-WISE REVISION PROGRESS
   ═══════════════════════════════════════════ */

const ROUND_STYLE: Record<RevisionKey, { bar: string; text: string; soft: string }> = {
  R1: { bar: 'bg-primary', text: 'text-primary', soft: 'bg-primary/12 border-primary/30 text-primary' },
  R2: { bar: 'bg-chart-4', text: 'text-chart-4', soft: 'bg-chart-4/12 border-chart-4/30 text-chart-4' },
  R3: { bar: 'bg-accent', text: 'text-accent-ink', soft: 'bg-accent/15 border-accent/35 text-accent-ink' },
  R4: { bar: 'bg-secondary', text: 'text-secondary', soft: 'bg-secondary/12 border-secondary/30 text-secondary' },
};

function SubjectProgressView({ subjects, today, sort, onSort, onRevise, onOpenTopic, onNavigate }: {
  subjects: Subject[]; today: string; sort: SubjectSort; onSort: (s: SubjectSort) => void;
  onRevise: (subjectId: string, firstOpen: RevisionKey | undefined) => void;
  onOpenTopic?: Props['onOpenTopicDetail'];
  onNavigate?: Props['onNavigate'];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => subjects.map(s => ({ subject: s, st: computeSubjectRevisionStats(s, today) })), [subjects, today]);

  const overall = useMemo(() => {
    let completed = 0, roundsDoneN = 0, roundsTotal = 0, minutes = 0, streak = 0, waitingR1 = 0;
    rows.forEach(({ st }) => {
      completed += st.completedTopics; roundsDoneN += st.roundsDone; roundsTotal += st.roundsTotal;
      minutes += st.totalTime; streak = Math.max(streak, st.streak); waitingR1 += st.rounds[0]?.left ?? 0;
    });
    const withTopics = rows.filter(r => r.st.completedTopics > 0);
    const weakest = withTopics.slice().sort((a, b) => a.st.overallPct - b.st.overallPct)[0];
    return { completed, roundsDoneN, roundsTotal, pct: roundsTotal > 0 ? Math.round((roundsDoneN / roundsTotal) * 100) : 0, minutes, streak, waitingR1, weakest };
  }, [rows]);

  const sorted = useMemo(() => {
    const list = rows.slice();
    // subjects with nothing completed yet have nothing to revise → bottom, whatever the sort
    const live = (r: typeof rows[number]) => r.st.completedTopics > 0;
    list.sort((a, b) => {
      if (live(a) !== live(b)) return live(a) ? -1 : 1;
      switch (sort) {
        case 'mostRevised': return b.st.overallPct - a.st.overallPct;
        case 'mostPending': return (b.st.roundsTotal - b.st.roundsDone) - (a.st.roundsTotal - a.st.roundsDone);
        case 'mostTime': return b.st.totalTime - a.st.totalTime;
        case 'az': return a.subject.name.localeCompare(b.subject.name);
        default: return a.st.overallPct - b.st.overallPct;
      }
    });
    return list;
  }, [rows, sort]);

  const SORTS: { id: SubjectSort; label: string }[] = [
    { id: 'leastRevised', label: 'Least revised' }, { id: 'mostRevised', label: 'Most revised' },
    { id: 'mostPending', label: 'Most pending' }, { id: 'mostTime', label: 'Most time' }, { id: 'az', label: 'A–Z' },
  ];

  const focus = overall.weakest;
  const focusOpen = focus ? focus.st.rounds.find(r => r.left > 0)?.key : undefined;

  return (
    <div className="space-y-3">
      {/* Overview */}
      <div className="rounded-3xl border border-border/15 bg-gradient-to-br from-primary/8 via-card/60 to-secondary/6 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/70">Overall revision</p>
            <p className="text-4xl font-black font-mono text-primary leading-none mt-1">{overall.pct}<span className="text-lg">%</span></p>
            <p className="text-[11px] text-muted-foreground mt-1.5">{overall.roundsDoneN} of {overall.roundsTotal} rounds done across {overall.completed} completed topics</p>
          </div>
          <div className="grid grid-cols-1 gap-1.5 text-right shrink-0">
            <span className="text-[11px] font-bold text-foreground/80">🔥 {overall.streak}d streak</span>
            <span className="text-[11px] font-bold text-foreground/80">⏱ {overall.minutes > 0 ? formatStudyTime(overall.minutes) : '0m'}</span>
            <span className="text-[11px] font-bold text-foreground/80">🎯 {overall.waitingR1} need R1</span>
          </div>
        </div>
        <div className="h-2 rounded-full bg-muted/30 mt-3 overflow-hidden"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${overall.pct}%` }} /></div>

        {focus && (
          <button onClick={() => onRevise(focus.subject.id, focusOpen)}
            className="mt-3 w-full flex items-center gap-2.5 rounded-2xl border border-primary/20 bg-card/60 px-3 py-2.5 text-left active:scale-[0.99] transition-transform">
            <span className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: focus.subject.color }} />
            <span className="flex-1 min-w-0">
              <span className="block text-[10px] font-black uppercase tracking-wider text-primary">Focus next</span>
              <span className="block text-[12px] font-bold text-foreground truncate">{focus.subject.name}</span>
              <span className="block text-[10px] text-muted-foreground">{focus.st.overallPct}% revised · {focus.st.roundsTotal - focus.st.roundsDone} rounds left</span>
            </span>
            <ChevronRight className="w-4 h-4 text-primary shrink-0" />
          </button>
        )}
      </div>

      {/* Sort */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        {SORTS.map(o => (
          <button key={o.id} onClick={() => onSort(o.id)} aria-pressed={sort === o.id}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${sort === o.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card/50 text-foreground/70 border-border/20 hover:bg-card'}`}>{o.label}</button>
        ))}
      </div>

      {/* Subject cards */}
      <div className="space-y-2.5">
        {sorted.map(({ subject, st }) => {
          const open = openId === subject.id;
          const empty = st.completedTopics === 0;
          const firstOpen = st.rounds.find(r => r.left > 0)?.key;
          const nextRound = st.rounds.find(r => r.readyCount > 0);
          return (
            <div key={subject.id} className={`rounded-2xl border bg-card/50 overflow-hidden ${empty ? 'border-border/10 opacity-70' : 'border-border/15'}`}>
              <button onClick={() => setOpenId(open ? null : subject.id)} aria-expanded={open} className="w-full p-3.5 text-left">
                <div className="flex items-center gap-2.5">
                  <span className="w-1.5 h-10 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-extrabold text-foreground truncate">{subject.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {empty ? 'No completed topics yet — finish topics to unlock revision' : `${st.completedTopics}/${st.totalTopics} topics completed · ${st.roundsDone}/${st.roundsTotal} rounds`}
                    </p>
                  </div>
                  {!empty && <span className="text-2xl font-black font-mono shrink-0" style={{ color: readableInk(subject.color) }}>{st.overallPct}<span className="text-xs">%</span></span>}
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                </div>

                {!empty && (
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {st.rounds.map(r => (
                      <div key={r.key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-black ${ROUND_STYLE[r.key].text}`}>{r.key}</span>
                          <span className="text-[10px] font-mono font-bold text-muted-foreground">{r.pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden"><div className={`h-full rounded-full ${ROUND_STYLE[r.key].bar} transition-[width] duration-500`} style={{ width: `${r.pct}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </button>

              {open && !empty && (
                <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-border/10 animate-fade-in">
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-muted/25 text-foreground/80">⏱ {st.totalTime > 0 ? formatStudyTime(st.totalTime) : 'no revision time'}</span>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-muted/25 text-foreground/80">🔥 {st.streak}d streak</span>
                    {st.rounds.map(r => r.inProgress > 0 && (
                      <span key={r.key} className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${ROUND_STYLE[r.key].soft}`}>🔄 {r.inProgress} in {r.key}</span>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    {st.rounds.map(r => (
                      <div key={r.key} className="flex items-center gap-2 text-[11px]">
                        <span className={`w-7 text-center font-black ${ROUND_STYLE[r.key].text}`}>{r.key}</span>
                        <span className="flex-1 text-muted-foreground">{r.done} done · <strong className="text-foreground/80">{r.left} left</strong>{r.time > 0 ? ` · ${formatStudyTime(r.time)}` : ''}</span>
                        <span className="font-mono font-bold text-foreground/70">{r.pct}%</span>
                      </div>
                    ))}
                  </div>

                  {nextRound && nextRound.nextUp.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70 mb-1.5">Next up · {nextRound.key}</p>
                      <div className="space-y-1">
                        {nextRound.nextUp.map(n => (
                          <button key={n.topic.id} disabled={!onOpenTopic}
                            onClick={() => onOpenTopic?.(n.topic, subject.id, n.unitId, nextRound.readyRefs.map(x => ({ subjectId: subject.id, unitId: x.unitId, topicId: x.topicId })))}
                            className="w-full flex items-center gap-2 rounded-xl border border-border/12 bg-background/40 px-2.5 py-2 text-left hover:border-primary/25 active:scale-[0.99] transition">
                            <span className="flex-1 min-w-0">
                              <span className="block text-[11px] font-semibold text-foreground truncate">{n.topic.name}</span>
                              <span className="block text-[9px] text-muted-foreground truncate uppercase">{n.unitName}</span>
                            </span>
                            {n.inProgress && <span className="text-[9px] font-bold text-chart-4">in progress</span>}
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {firstOpen && st.rounds.find(r => r.key === firstOpen)!.units.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70 mb-1.5">Least revised units · {firstOpen}</p>
                      <div className="space-y-1.5">
                        {st.rounds.find(r => r.key === firstOpen)!.units.slice(0, 3).map(u => (
                          <div key={u.id} className="flex items-center gap-2 text-[11px]">
                            <span className="w-4 text-muted-foreground font-mono">{u.index + 1}</span>
                            <span className="flex-1 min-w-0 truncate font-semibold text-foreground/80 uppercase text-[10px]">{u.name}</span>
                            <span className="w-16 h-1.5 rounded-full bg-muted/30 overflow-hidden shrink-0"><span className={`block h-full ${ROUND_STYLE[firstOpen].bar}`} style={{ width: `${u.pct}%` }} /></span>
                            <span className="font-mono text-muted-foreground w-9 text-right">{u.done}/{u.total}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button size="sm" onClick={() => onRevise(subject.id, firstOpen)} className="h-9 rounded-xl text-[11px] font-bold gap-1.5">
                      <Play className="w-3 h-3 fill-current" /> {firstOpen ? `Revise ${firstOpen} topics` : 'View topics'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onNavigate?.('syllabus', { subjectId: subject.id })} className="h-9 rounded-xl text-[11px] font-bold gap-1.5">
                      <BookOpen className="w-3 h-3" /> Open syllabus
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TOPIC ROW
   ═══════════════════════════════════════════ */

const RoundPills = memo(function RoundPills({ topic }: { topic: SubTopic }) {
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0" aria-label={`${roundsDone(topic)} of 4 revision rounds done`}>
      {REVISION_KEYS.map(k => {
        const st = roundState(topic, k);
        return (
          <span key={k} className={`text-[8px] leading-none font-black px-1 py-[3px] rounded ${
            st === 'done' ? `${ROUND_STYLE[k].bar} text-white` : st === 'active' ? `border ${ROUND_STYLE[k].soft} animate-soft-pulse` : 'bg-muted/25 text-muted-foreground/45'
          }`}>{k}</span>
        );
      })}
    </span>
  );
});

const TopicRow = memo(function TopicRow({ item, showUnitName, isWeak, today, onTopicClick, onSRSReview, onNavigate, hasDetailHandler }: {
  item: TopicItem; showUnitName: boolean; isWeak: boolean; today: string;
  onTopicClick: (item: TopicItem) => void;
  onSRSReview: (topicId: string, subjectId: string, unitId: string, gotIt: boolean) => void;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
  hasDetailHandler: boolean;
}) {
  const t = item.topic;
  const isDue = t.completed && isDueToday(t.srsDueDate);
  const minutes = studyMinutes(t);
  const touched = t.completed ? lastTouched(t) : '';

  return (
    <button
      onClick={() => onTopicClick(item)}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border bg-card/60 hover:border-primary/20 transition-colors text-left active:scale-[0.99] group ${
        isWeak ? 'border-destructive/25 bg-destructive/5' : isDue ? 'border-chart-4/25 bg-chart-4/5' : 'border-border/12'
      } ${t.completed && !isWeak && !isDue ? 'opacity-80' : ''}`}
    >
      <TopicStatusBadge status={t.status} completed={t.completed} showLabel={false} />

      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold leading-tight text-foreground group-hover:text-primary transition-colors">{t.name}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <SubjectLink shortName={item.subject.shortName} color={item.subject.color} subjectId={item.subject.id} onNavigate={onNavigate} />
          {showUnitName && <span className="text-[9px] text-muted-foreground/60 font-medium truncate max-w-[110px]">{item.unitName}</span>}
          {t.completed && <RoundPills topic={t} />}
          {isWeak && <span className="text-[8px] px-1 py-0.5 rounded bg-destructive/15 text-destructive font-bold border border-destructive/20">⚠ Weak</span>}
          {t.norcetRelevance && (
            <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${t.norcetRelevance === 'High' ? 'bg-primary/15 text-primary' : t.norcetRelevance === 'Med' ? 'bg-amber-500/15 text-amber-600' : 'bg-muted/30 text-muted-foreground'}`}>{t.norcetRelevance}</span>
          )}
        </div>
        {(minutes > 0 || touched) && (
          <p className="text-[9px] text-muted-foreground/70 mt-1 font-mono">
            {minutes > 0 && <span>⏱ {formatStudyTime(minutes)}</span>}
            {minutes > 0 && touched && <span> · </span>}
            {touched && <span>last touched {agoLabel(daysSince(touched, today))}</span>}
          </p>
        )}
      </div>

      {t.topicNumber != null && <span className="text-[8px] font-mono font-bold text-muted-foreground/40 bg-muted/15 px-1.5 py-0.5 rounded shrink-0">#{t.topicNumber}</span>}
      <DiffBadge diff={t.difficulty} />
      {t.important && <Star className="w-3 h-3 fill-amber-500 text-amber-500 shrink-0" />}
      {t.rank != null && t.rank > 0 && <span className="text-[9px] text-chart-4 shrink-0">{'★'.repeat(t.rank)}</span>}

      {isDue && (
        <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          <span role="button" tabIndex={0} aria-label="Got it" onClick={e => { e.stopPropagation(); onSRSReview(t.id, item.subject.id, item.unitId, true); }}
            className="w-7 h-7 rounded-lg bg-secondary/15 border border-secondary/25 flex items-center justify-center text-secondary hover:bg-secondary/25 transition-colors"><Check className="w-3.5 h-3.5" /></span>
          <span role="button" tabIndex={0} aria-label="Needs work" onClick={e => { e.stopPropagation(); onSRSReview(t.id, item.subject.id, item.unitId, false); }}
            className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center text-primary hover:bg-primary/25 transition-colors"><RotateCcw className="w-3.5 h-3.5" /></span>
        </div>
      )}
      {!isDue && t.completed && t.srsDueDate && <span className="text-[8px] text-muted-foreground font-mono shrink-0">{getDueCountdown(t.srsDueDate)}</span>}
      {hasDetailHandler && <ExternalLink className="w-3 h-3 text-muted-foreground/0 group-hover:text-primary shrink-0 transition-colors" />}
    </button>
  );
});

function FilterSection({ icon, label, active, children }: { icon: React.ReactNode; label: string; active: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em]">{label}</span>
        {active && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
      </div>
      {children}
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold">
      {label}
      <button onClick={onClear} className="hover:text-destructive transition-colors"><X className="w-2.5 h-2.5" /></button>
    </span>
  );
}

function StatCard({ label, count, done, emoji, active, onClick, colorClass, bgClass }: {
  label: string; count: number; done: number; emoji: string; active: boolean; onClick: () => void; colorClass: string; bgClass: string;
}) {
  const pct = count > 0 ? Math.round((done / count) * 100) : 0;
  return (
    <button onClick={onClick}
      className={`rounded-2xl border p-3 text-center transition-all ${active ? bgClass : 'border-border/15 bg-card/60 hover:border-primary/20'}`}
      >
      <div className="flex items-center justify-center gap-1 mb-0.5">
        <span className="text-sm">{emoji}</span>
        <span className={`text-[11px] font-bold ${active ? colorClass : 'text-foreground/70'}`}>{label}</span>
      </div>
      <p className={`text-xl font-black font-mono ${active ? colorClass : 'text-foreground'}`}>
        {done}<span className="text-muted-foreground/60 text-sm font-medium">/{count}</span>
      </p>
      <div className="h-1 rounded-full bg-muted/30 mt-2 overflow-hidden">
        <motion.div className={`h-full rounded-full ${active ? '' : 'bg-primary/50'}`}
          style={active ? { backgroundColor: 'currentColor', opacity: 0.6 } : undefined}
          initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
      </div>
    </button>
  );
}

function DiffBadge({ diff }: { diff: string }) {
  const styles: Record<string, string> = {
    Easy: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/25',
    Medium: 'bg-amber-500/15 text-amber-600 border-amber-500/25',
    Hard: 'bg-red-500/15 text-red-600 border-red-500/25',
  };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded-lg border shrink-0 font-bold ${styles[diff] || 'bg-muted text-muted-foreground border-border'}`}>{diff}</span>;
}

/* ═══════════════════════════════════════════
   FLASHCARD VIEW
   ═══════════════════════════════════════════ */
function FlashcardView({ items, onBack, onSRSReview }: {
  items: TopicItem[]; onBack: () => void;
  onSRSReview: (topicId: string, subjectId: string, unitId: string, gotIt: boolean) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const swipe = useRef({ x: 0, y: 0, swiped: false });
  const current = items[idx];
  const go = (delta: number) => { setIdx(i => Math.min(items.length - 1, Math.max(0, i + delta))); setFlipped(false); };
  if (!current) return <EmptyState emoji="🃏" title="No Flashcards" description="No topics match your current filters." actionLabel="← Back" onAction={onBack} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        <span className="text-xs text-muted-foreground font-mono">{idx + 1} / {items.length}</span>
      </div>
      <div className="flex justify-center touch-pan-y select-none"
        onPointerDown={e => { swipe.current = { x: e.clientX, y: e.clientY, swiped: false }; }}
        onPointerUp={e => {
          const dx = e.clientX - swipe.current.x, dy = e.clientY - swipe.current.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { swipe.current.swiped = true; go(dx < 0 ? 1 : -1); }
        }}
        onClick={() => { if (swipe.current.swiped) { swipe.current.swiped = false; return; } setFlipped(f => !f); }}>
        <div className="w-full max-w-sm h-72 cursor-pointer perspective-1000">
          <AnimatePresence mode="wait">
            <motion.div key={flipped ? 'back' : 'front'}
              initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: -90, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full rounded-2xl border border-border bg-card p-6 flex flex-col">
              {!flipped ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: current.subject.color + '20', color: current.subject.color }}>
                      {current.subject.shortName}
                    </span>
                    <DiffBadge diff={current.topic.difficulty} />
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-center text-foreground font-medium">{current.topic.name}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">Tap to flip · swipe for next / previous</p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-foreground mb-3">Notes</p>
                  <div className="flex-1 overflow-y-auto">
                    {current.topic.notes ? (
                      <div className="prose prose-xs dark:prose-invert max-w-none"><Markdown>{current.topic.notes}</Markdown></div>
                    ) : (<p className="text-xs text-muted-foreground italic">No notes yet</p>)}
                    {current.topic.mcqs && current.topic.mcqs.length > 0 && (
                      <div className="mt-3 border-t border-border pt-2">
                        <p className="text-[10px] font-semibold text-foreground mb-1">MCQs</p>
                        {current.topic.mcqs.map(m => (
                          <div key={m.id} className="text-[11px] text-muted-foreground mb-1">
                            <p>Q: {m.q}</p><p className="text-secondary">A: {m.a}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">Tap to flip back</p>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="icon" disabled={idx === 0} onClick={() => { setIdx(idx - 1); setFlipped(false); }}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" className="gap-1 text-primary"
          onClick={() => { onSRSReview(current.topic.id, current.subject.id, current.unitId, false); if (idx < items.length - 1) { setIdx(idx + 1); setFlipped(false); } }}>
          <X className="w-3.5 h-3.5" /> Needs Work
        </Button>
        <Button variant="default" size="sm" className="gap-1"
          onClick={() => { onSRSReview(current.topic.id, current.subject.id, current.unitId, true); if (idx < items.length - 1) { setIdx(idx + 1); setFlipped(false); } }}>
          <Check className="w-3.5 h-3.5" /> Got It
        </Button>
        <Button variant="outline" size="icon" disabled={idx >= items.length - 1} onClick={() => { setIdx(idx + 1); setFlipped(false); }}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
