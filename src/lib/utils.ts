/**
 * Normalize a session's subjectId — empty string, null, undefined, 'general'
 * all map to '' (no subject). Use this everywhere to avoid _general/__other__ mismatches.
 */
export function normalizeSubjectId(id: string | null | undefined): string {
  if (!id || id === 'general' || id === '_general' || id === '__other__') return '';
  return id;
}

/**
 * Strip everything after the first `#` (including separators like ` — ` before it).
 * Used for clean copy-to-clipboard of topic/unit names.
 * "Anatomy Part-1 — #1221 / #15" → "Anatomy Part-1"
 * "Antenatal Care — #1020 / #721" → "Antenatal Care"
 * "Simple Name" → "Simple Name"
 */
/** Map per-subject font size setting to CSS pixel value */
export function getSubjectFontSize(level: 'unit' | 'module' | 'topic', size?: string): string | undefined {
  if (!size || size === 'normal') return undefined; // use CSS variable default
  // Support custom:NNpx format
  if (size.startsWith('custom:')) {
    return size.replace('custom:', '');
  }
  const map: Record<string, Record<string, string>> = {
    small:  { unit: '18px', module: '11px', topic: '13px' },
    large:  { unit: '28px', module: '17px', topic: '19px' },
    xlarge: { unit: '32px', module: '20px', topic: '22px' },
  };
  return map[size]?.[level];
}

export function getCleanName(name: string): string {
  if (!name) return '';
  const hashIdx = name.indexOf('#');
  if (hashIdx < 0) return name.trim();
  let clean = name.slice(0, hashIdx);
  // Strip trailing separators like " — ", " - ", " "
  clean = clean.replace(/\s*[—–-]\s*$/, '').trim();
  return clean || name.trim();
}

/**
 * Get topic display name — strips `#` suffix when `hideHash` is true.
 * Use this for rendering topic names; the stored name is never modified.
 */
export function getDisplayTopicName(name: string, hideHash?: boolean): string {
  if (!name) return '';
  if (hideHash) return getCleanName(name);
  return name;
}

export function cn(...classes: (string | false | null | undefined | Record<string, boolean>)[]): string {
  return classes
    .flatMap(c => {
      if (!c) return [];
      if (typeof c === 'string') return [c];
      return Object.entries(c).filter(([, v]) => v).map(([k]) => k);
    })
    .join(' ');
}

/**
 * Get YYYY-MM-DD string in the user's LOCAL timezone.
 * Fixes the critical UTC bug where toISOString().split('T')[0]
 * returns yesterday's date between midnight and 5:30 AM IST.
 */
export function getLocalDateStr(date?: Date): string {
  const d = date ?? new Date();
  return d.toLocaleDateString('en-CA'); // returns YYYY-MM-DD in local TZ
}

/** Convert YYYY-MM-DD to DD / MM / YYYY for display (styled format) */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]} / ${parts[1]} / ${parts[0]}`;
}

/** Format date with relative label (Today, Yesterday) or DD / MM / YYYY */
export function formatDateRelative(dateStr: string): string {
  const today = getLocalDateStr();
  const yd = new Date();
  yd.setDate(yd.getDate() - 1);
  const yesterday = getLocalDateStr(yd);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return formatDate(dateStr);
}

/** Get the Monday of the current week (ISO week start) */
export function getCurrentWeekStart(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  d.setDate(d.getDate() - diff);
  return getLocalDateStr(d);
}

/** Get the first day of the current month */
export function getCurrentMonthStart(): string {
  const d = new Date();
  d.setDate(1);
  return getLocalDateStr(d);
}

/**
 * Robust 12-hour time formatter.
 * Handles colon, period, and malformed separators; guards against NaN.
 */
/** "8:17 – 8:47 PM" for a block that starts at `start` (HH:mm) and lasts `minutes`. */
export function formatTimeRange12h(start: string | undefined, minutes = 0): string {
  if (!start) return '';
  const [h, m] = start.replace(/\./g, ':').split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return formatTime12h(start);
  const startMin = h * 60 + m;
  const endMin = startMin + Math.max(0, Math.round(minutes));
  const fmt = (mm: number) => { const t = ((mm % 1440) + 1440) % 1440; return formatTime12h(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`); };
  const a = fmt(startMin), b = fmt(endMin);
  return a.slice(-2) === b.slice(-2) && endMin < 1440 ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

export function formatTime12h(t: string | undefined): string {
  if (!t) return '';
  const normalized = t.replace(/\./g, ':');
  const [hRaw, mRaw] = normalized.split(':').map(Number);
  const h = isNaN(hRaw) ? 0 : hRaw;
  const m = isNaN(mRaw) ? 0 : mRaw;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Format minutes into a clear h m study-time display.
 * 0 → "0m", 45 → "45m", 60 → "1h 00m", 74 → "1h 14m", 140 → "2h 20m"
 */
export function formatStudyTime(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded}m`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (m === 0) return `${h}h 00m`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

/**
 * Format hours (e.g. dailyLog.hoursStudied) into the standard h:mm display.
 * Converts hours → minutes then delegates to formatStudyTime.
 */
export function formatStudyHours(hours: number): string {
  return formatStudyTime(Math.round((hours || 0) * 60));
}

/*
 * ═══════════════════════════════════════════════════════════════════
 * UNIFIED STUDY-TIME CALCULATION — SINGLE SOURCE OF TRUTH
 *
 * Study time comes from TWO non-overlapping pools:
 *   Pool A — dbSessions: first-class logged sessions (ALL types)
 *   Pool B — topic/unit timeSpent: embedded time on syllabus items
 *
 * Overlap occurs because Pomodoro & StudyTimeLogger create BOTH
 * a dbSession (type='Topic'/'Unit') AND update topic/unit timeSpent.
 * The deduction formula avoids double counting:
 *
 *   total = allSessions + max(0, topicUnitTime - overlappingSessions)
 *
 * where overlappingSessions = sessions with type 'Topic' or 'Unit'
 * (these are the ones that also update syllabus timeSpent).
 * ═══════════════════════════════════════════════════════════════════
 */

/** Internal: compute topic+unit time from syllabus for a single date */
function _getTopicUnitDayMinutes(
  subjects: { id?: string; units: { id?: string; timeEntries?: { date: string; minutes: number }[]; subTopics: { id?: string; completed: boolean; completedDate?: string; timeSpent: number; timeEntries?: { date: string; minutes: number }[] }[] }[] }[],
  dateStr: string,
): { mins: number; topicIds: Set<string> } {
  let topicMin = 0;
  let unitMin = 0;
  const topicIds = new Set<string>();
  subjects.forEach(s => s.units.forEach(u => {
    const uEntryMins = u.timeEntries?.filter(e => e.date === dateStr).reduce((a, e) => a + e.minutes, 0) || 0;
    unitMin += uEntryMins;
    u.subTopics.forEach(t => {
      const entryMins = t.timeEntries?.filter(e => e.date === dateStr).reduce((a, e) => a + e.minutes, 0) || 0;
      if (entryMins > 0) {
        topicMin += entryMins;
        if (t.id) topicIds.add(t.id);
      } else if (
        // Legacy fallback: only use topic.timeSpent when the topic has NO
        // timeEntries at all (pre-entries era data).  If timeEntries exist
        // (even for other dates), the per-date breakdown is authoritative
        // and this date simply had 0 minutes logged.
        (!t.timeEntries || t.timeEntries.length === 0) &&
        t.completed && t.completedDate === dateStr && (t.timeSpent || 0) > 0
      ) {
        topicMin += t.timeSpent;
        if (t.id) topicIds.add(t.id);
      }
    });
  }));
  return { mins: topicMin + unitMin, topicIds };
}

/**
 * Internal: merge dbSessions + legacy dailyLog.sessions for a single date.
 * dbSessions are canonical; legacy sessions are only used when NO dbSessions
 * exist for the date (same fallback logic DayDetailPanel uses).
 * This ensures getEffectiveDayMinutes and getDayStudyBreakdown NEVER disagree
 * with the detailed STUDY TIME UI section.
 */
function _getAllDaySessions(
  dailyLogs: { date: string; hoursStudied: number; sessions?: any[] }[],
  dateStr: string,
  dbSessions?: { date: string; minutes: number; type: string; topicId?: string; unitId?: string }[],
): { minutes: number; topicId?: string }[] {
  const dbForDay = (dbSessions || []).filter(s => s.date === dateStr);
  if (dbForDay.length > 0) return dbForDay;
  // Fallback to legacy sessions embedded in dailyLogs
  const dayLog = dailyLogs.find(l => l.date === dateStr);
  if (dayLog?.sessions?.length) {
    return dayLog.sessions.map((s: any) => ({
      minutes: s.durationMinutes || s.minutes || 0,
      topicId: s.topicId || undefined,
    }));
  }
  return [];
}

/**
 * Get effective study minutes for a SINGLE date.
 *
 * Uses the unified formula:
 *   allSessions(date) + max(0, topicUnitTime(date) - overlappingSessions(date))
 */
export function getEffectiveDayMinutes(
  subjects: { id?: string; units: { id?: string; timeEntries?: { date: string; minutes: number }[]; subTopics: { id?: string; completed: boolean; completedDate?: string; timeSpent: number; timeEntries?: { date: string; minutes: number }[] }[] }[] }[],
  dailyLogs: { date: string; hoursStudied: number; sessions?: any[] }[],
  dateStr: string,
  dbSessions?: { date: string; minutes: number; type: string; topicId?: string; unitId?: string }[],
): number {
  const { mins: topicUnitMin, topicIds } = _getTopicUnitDayMinutes(subjects, dateStr);

  // Collect ALL sessions for this date — dbSessions first, then legacy dailyLog.sessions fallback
  const allDaySessions = _getAllDaySessions(dailyLogs, dateStr, dbSessions);

  // Count all sessions EXCEPT those whose topicId is already counted in topic time
  const sessionMin = allDaySessions
    .filter(s => !s.topicId || !topicIds.has(s.topicId))
    .reduce((a, s) => a + (s.minutes || 0), 0);
  return topicUnitMin + sessionMin;
}

/**
 * Shared breakdown of study time for a day — used by both the top stat card
 * and the Study Time detail card so they can never disagree.
 *
 * Returns { topicMins, sessionMins, totalMins } where:
 * - topicMins: time from syllabus topics/units (via timeEntries)
 * - sessionMins: time from manually logged sessions that are NOT linked to any topic/unit
 * - totalMins: topicMins + sessionMins (no overlap possible)
 */
export function getDayStudyBreakdown(
  subjects: { id?: string; units: { id?: string; timeEntries?: { date: string; minutes: number }[]; subTopics: { id?: string; completed: boolean; completedDate?: string; timeSpent: number; timeEntries?: { date: string; minutes: number }[] }[] }[] }[],
  dateStr: string,
  dbSessions: { date: string; minutes: number; type: string; topicId?: string; unitId?: string }[],
  dailyLogs?: { date: string; hoursStudied: number; sessions?: any[] }[],
): { topicMins: number; sessionMins: number; totalMins: number } {
  const { mins: topicMins, topicIds } = _getTopicUnitDayMinutes(subjects, dateStr);
  const allDaySessions = _getAllDaySessions(dailyLogs || [], dateStr, dbSessions);
  // Count all sessions EXCEPT those whose topicId is already counted in topic time
  const sessionMins = allDaySessions
    .filter(s => !s.topicId || !topicIds.has(s.topicId))
    .reduce((a, s) => a + (s.minutes || 0), 0);
  return { topicMins, sessionMins, totalMins: topicMins + sessionMins };
}

/**
 * Get the raw daily-log minutes for a date (for display/comparison only).
 */
export function getLogDayMinutes(
  dailyLogs: { date: string; hoursStudied: number }[],
  dateStr: string,
): number {
  const log = dailyLogs.find(l => l.date === dateStr);
  return log ? Math.round(log.hoursStudied * 60) : 0;
}

/**
 * Get the pure topic-tracked minutes for a date (for display/comparison only).
 */
export function getTopicDayMinutes(
  subjects: { id?: string; units: { id?: string; timeEntries?: { date: string; minutes: number }[]; subTopics: { id?: string; completed: boolean; completedDate?: string; timeSpent: number; timeEntries?: { date: string; minutes: number }[] }[] }[] }[],
  dateStr: string,
): number {
  return _getTopicUnitDayMinutes(subjects, dateStr).mins;
}

/**
 * Get total topic-tracked time across ALL topics (matches syllabus display).
 * Includes timeSpent from ALL topics — completed or not — since users
 * track time on topics they are still studying.
 */
export function getTotalTopicMinutes(
  subjects: { units: { timeSpent?: number; subTopics: { timeSpent: number }[] }[] }[],
): number {
  let total = 0;
  subjects.forEach(s => s.units.forEach(u => {
    total += u.timeSpent || 0;
    u.subTopics.forEach(t => {
      total += t.timeSpent || 0;
    });
  }));
  return total;
}

/**
 * Get UNIFIED total study minutes — sessions + non-overlapping topic/unit time.
 * This is the single source of truth for total study time across the app.
 *
 * Formula: allSessions + max(0, topicUnitTime - overlappingSessions)
 */
export function getUnifiedTotalMinutes(
  subjects: { units: { timeSpent?: number; subTopics: { timeSpent: number }[] }[] }[],
  dbSessions?: { id: string; minutes: number; type: string }[],
  dailyLogs?: { hoursStudied: number; sessions?: { id: string; durationMinutes: number }[] }[],
): number {
  const topicUnitTime = getTotalTopicMinutes(subjects);

  // Collect legacy sessions from dailyLogs that aren't in dbSessions
  const dbIds = new Set((dbSessions || []).map(s => s.id));
  let legacyOnlyMins = 0;
  if (dailyLogs) {
    dailyLogs.forEach(l => {
      (l.sessions || []).forEach(s => {
        if (!dbIds.has(s.id) && s.durationMinutes > 0) {
          legacyOnlyMins += s.durationMinutes;
        }
      });
    });
  }

  if (!dbSessions || dbSessions.length === 0) {
    // No db sessions — total is topic time + any legacy sessions (non-overlapping)
    return topicUnitTime + legacyOnlyMins;
  }

  // Count ALL session types (db + legacy)
  const allSessionTime = dbSessions.reduce((a, s) => a + (s.minutes || 0), 0) + legacyOnlyMins;
  // Sessions with type 'Topic'/'Unit' also update syllabus timeSpent — deduct overlap
  const overlapping = dbSessions
    .filter(s => s.type === 'Topic' || s.type === 'Unit')
    .reduce((a, s) => a + (s.minutes || 0), 0);
  return allSessionTime + Math.max(0, topicUnitTime - overlapping);
}

/**
 * Get ALL session minutes per subject (for unified per-subject totals).
 */
export function getAllSessionMinutesBySubject(
  dbSessions: { subjectId: string; minutes: number; type: string }[],
): Map<string, number> {
  const map = new Map<string, number>();
  dbSessions.forEach(s => {
    if (s.subjectId) {
      map.set(s.subjectId, (map.get(s.subjectId) || 0) + (s.minutes || 0));
    }
  });
  return map;
}

/**
 * Get overlapping (Topic+Unit type) session minutes per subject.
 * These sessions also update syllabus timeSpent, so they overlap.
 */
export function getOverlappingSessionMinutesBySubject(
  dbSessions: { subjectId: string; minutes: number; type: string }[],
): Map<string, number> {
  const map = new Map<string, number>();
  dbSessions.forEach(s => {
    if ((s.type === 'Topic' || s.type === 'Unit') && s.subjectId) {
      map.set(s.subjectId, (map.get(s.subjectId) || 0) + (s.minutes || 0));
    }
  });
  return map;
}

/**
 * Merge dbSessions + legacy dailyLog sessions into a single deduplicated list.
 * Legacy sessions embedded in dailyLogs[].sessions[] that aren't already in dbSessions
 * are included so that per-subject totals account for ALL historical data.
 */
function _mergeLegacySessions(
  dbSessions: { id: string; subjectId: string; minutes: number; type: string }[],
  dailyLogs?: { sessions?: { id: string; subjectId: string; durationMinutes: number }[] }[],
): { subjectId: string; minutes: number; type: string }[] {
  if (!dailyLogs) return dbSessions;
  const dbIds = new Set(dbSessions.map(s => s.id));
  const legacySessions: { subjectId: string; minutes: number; type: string }[] = [];
  dailyLogs.forEach(l => {
    (l.sessions || []).forEach(s => {
      if (!dbIds.has(s.id) && s.durationMinutes > 0) {
        legacySessions.push({
          subjectId: s.subjectId || '',
          minutes: s.durationMinutes,
          type: 'Other',
        });
      }
    });
  });
  if (legacySessions.length === 0) return dbSessions;
  return [...dbSessions, ...legacySessions];
}

/**
 * Get ALL session minutes per subject, INCLUDING legacy sessions from dailyLogs.
 * This is the single source of truth for per-subject session time.
 */
export function getMergedAllSessionMinutesBySubject(
  dbSessions: { id: string; subjectId: string; minutes: number; type: string }[],
  dailyLogs?: { sessions?: { id: string; subjectId: string; durationMinutes: number }[] }[],
): Map<string, number> {
  return getAllSessionMinutesBySubject(_mergeLegacySessions(dbSessions, dailyLogs));
}

/**
 * Get overlapping session minutes per subject, INCLUDING legacy sessions from dailyLogs.
 */
export function getMergedOverlappingSessionMinutesBySubject(
  dbSessions: { id: string; subjectId: string; minutes: number; type: string }[],
  dailyLogs?: { sessions?: { id: string; subjectId: string; durationMinutes: number }[] }[],
): Map<string, number> {
  return getOverlappingSessionMinutesBySubject(_mergeLegacySessions(dbSessions, dailyLogs));
}

/**
 * @deprecated Use getAllSessionMinutesBySubject + getOverlappingSessionMinutesBySubject instead.
 * Kept for backward compatibility — now returns ALL session minutes per subject.
 */
export function getSessionMinutesBySubject(
  dbSessions: { subjectId: string; minutes: number; type: string }[],
): Map<string, number> {
  return getAllSessionMinutesBySubject(dbSessions);
}

/**
 * Get effective study time (in minutes) across a date range.
 *
 * Unified formula per date:
 *   allSessions(date) + max(0, topicUnitTime(date) - overlappingSessions(date))
 */
export function getEffectiveStudyMinutes(
  subjects: { units: { timeSpent?: number; timeEntries?: { date: string; minutes: number }[]; subTopics: { completed: boolean; completedDate?: string; timeSpent: number; timeEntries?: { date: string; minutes: number }[] }[] }[] }[],
  dailyLogs: { date: string; hoursStudied: number; sessions?: any[] }[],
  dateFrom?: string,
  dateTo?: string,
  dbSessions?: { date: string; minutes: number; type: string }[],
): number {
  // 1. Accumulate topic + unit time by date
  const topicMinByDate = new Map<string, number>();
  subjects.forEach(s => s.units.forEach(u => {
    if (u.timeEntries && u.timeEntries.length > 0) {
      u.timeEntries.forEach(e => {
        if (dateFrom && e.date < dateFrom) return;
        if (dateTo && e.date > dateTo) return;
        topicMinByDate.set(e.date, (topicMinByDate.get(e.date) || 0) + e.minutes);
      });
    }
    u.subTopics.forEach(t => {
      if (t.timeEntries && t.timeEntries.length > 0) {
        t.timeEntries.forEach(e => {
          if (dateFrom && e.date < dateFrom) return;
          if (dateTo && e.date > dateTo) return;
          topicMinByDate.set(e.date, (topicMinByDate.get(e.date) || 0) + e.minutes);
        });
      } else if (t.completed && t.completedDate && (t.timeSpent || 0) > 0) {
        if (dateFrom && t.completedDate < dateFrom) return;
        if (dateTo && t.completedDate > dateTo) return;
        topicMinByDate.set(t.completedDate, (topicMinByDate.get(t.completedDate) || 0) + t.timeSpent);
      }
    });
  }));

  // 2. Accumulate ALL session minutes by date + overlapping (Topic/Unit type) by date
  const allSessionMinByDate = new Map<string, number>();
  const overlappingMinByDate = new Map<string, number>();
  // dbSessions (canonical)
  const dbIds = new Set<string>();
  if (dbSessions) {
    dbSessions.forEach(s => {
      if (dateFrom && s.date < dateFrom) return;
      if (dateTo && s.date > dateTo) return;
      if ((s as any).id) dbIds.add((s as any).id);
      allSessionMinByDate.set(s.date, (allSessionMinByDate.get(s.date) || 0) + (s.minutes || 0));
      if (s.type === 'Topic' || s.type === 'Unit') {
        overlappingMinByDate.set(s.date, (overlappingMinByDate.get(s.date) || 0) + (s.minutes || 0));
      }
    });
  }
  // Legacy sessions from dailyLogs — only for dates with NO dbSessions
  const dbDates = new Set(dbSessions?.map(s => s.date) || []);
  dailyLogs.forEach(l => {
    if (dbDates.has(l.date)) return; // db sessions take priority
    if (dateFrom && l.date < dateFrom) return;
    if (dateTo && l.date > dateTo) return;
    (l.sessions || []).forEach((s: any) => {
      const mins = s.durationMinutes || s.minutes || 0;
      if (mins > 0 && !dbIds.has(s.id)) {
        allSessionMinByDate.set(l.date, (allSessionMinByDate.get(l.date) || 0) + mins);
      }
    });
  });

  // 3. Merge using unified formula per date
  const allDates = new Set([...topicMinByDate.keys(), ...allSessionMinByDate.keys()]);
  let total = 0;
  allDates.forEach(date => {
    const topicMin = topicMinByDate.get(date) || 0;
    const allSessionMin = allSessionMinByDate.get(date) || 0;
    const overlappingMin = overlappingMinByDate.get(date) || 0;

    // Unified: allSessions + max(0, topicUnit - overlap)
    // Legacy sessions are already included in allSessionMinByDate
    total += allSessionMin + Math.max(0, topicMin - overlappingMin);
  });

  // 4. Include "undated" topic time — topics with timeSpent > 0 but no timeEntries
  //    and either not completed or no completedDate. These are counted by
  //    getUnifiedTotalMinutes (getTotalTopicMinutes) but missed above because
  //    they can't be assigned to any date. Include them so totals match.
  let datedTopicTime = 0;
  let allTopicTime = 0;
  subjects.forEach(s => s.units.forEach(u => {
    // Unit-level time
    if (u.timeEntries && u.timeEntries.length > 0) {
      // Dated entries already counted above
    } else {
      // No timeEntries on unit — not counted above unless via topic loop
    }
    u.subTopics.forEach(t => {
      const ts = t.timeSpent || 0;
      if (ts <= 0) return;
      allTopicTime += ts;
      if (t.timeEntries && t.timeEntries.length > 0) {
        // Has timeEntries — already counted by date above
        datedTopicTime += ts;
      } else if (t.completed && t.completedDate) {
        // Completed with date — already counted above (if in range)
        datedTopicTime += ts;
      }
      // else: undated — NOT counted above
    });
  }));
  // Also count unit-level time
  let datedUnitTime = 0;
  let allUnitTime = 0;
  subjects.forEach(s => s.units.forEach(u => {
    const ut = u.timeSpent || 0;
    if (ut <= 0) return;
    allUnitTime += ut;
    if (u.timeEntries && u.timeEntries.length > 0) {
      datedUnitTime += ut;
    }
    // else: undated unit time
  }));
  const undatedTopicMins = Math.max(0, (allTopicTime - datedTopicTime) + (allUnitTime - datedUnitTime));
  // Add undated time directly — these topics were never linked to a session
  // (they have no date info), so no double-counting risk with sessions.
  total += undatedTopicMins;

  return total;
}


/**
 * Text colour for a user/subject colour on a card or tint: the colour mixed toward the theme's text colour,
 * so it stays readable on light AND dark themes (a plain bright green/yellow is under 3:1 on parchment).
 * Use for TEXT only — bars, dots and rings keep the pure colour.
 */
export function readableInk(color: string | undefined | null): string {
  if (!color) return 'hsl(var(--foreground))';
  return `color-mix(in srgb, ${color} 62%, hsl(var(--foreground)))`;
}
