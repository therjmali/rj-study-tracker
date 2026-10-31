/**
 * Ultra-Premium Report HTML Generator v2
 * Professional, clean PDF report with premium typography and layout.
 */
import type { Subject } from '../types';

export interface ReportConfig {
  studentName: string;
  generatedAt: string;
  scope: {
    subjectIds: string[];
    unitIds: string[];
    topicIds: string[];
  };
  badges: {
    difficulty: boolean;
    important: boolean;
    norcetRelevance: boolean;
  };
  details: {
    status: boolean;
    attachments: boolean;
    resources: boolean;
    notes: boolean;
  };
}

function normalizeDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  return dateStr;
}

function normalizeTime(timeStr?: string): string {
  if (!timeStr) return '';
  const [hRaw, mRaw] = timeStr.replace(/\./g, ':').split(':').map(Number);
  const h = isNaN(hRaw) ? 0 : hRaw;
  const m = isNaN(mRaw) ? 0 : mRaw;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const safeNum = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? v : 0; };

function fmtTime(mins: number): string {
  if (!mins || mins <= 0) return '0 min';
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

export function getFilteredData(subjects: Subject[], config: ReportConfig) {
  return subjects
    .filter(s => config.scope.subjectIds.includes(s.id))
    .map(s => ({
      ...s,
      units: s.units
        .filter(u => config.scope.unitIds.includes(u.id))
        .map(u => ({
          ...u,
          subTopics: u.subTopics.filter(t => config.scope.topicIds.includes(t.id)),
        }))
        .filter(u => u.subTopics.length > 0),
    }))
    .filter(s => s.units.length > 0);
}

export function computeStats(filteredSubjects: Subject[]) {
  const allTopics = filteredSubjects.flatMap(s => s.units.flatMap(u => u.subTopics));
  const total = allTopics.length;
  const completed = allTopics.filter(t => t.completed).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const totalTime = allTopics.reduce((a, t) => a + safeNum(t.timeSpent), 0);
  const easy = allTopics.filter(t => t.difficulty === 'Easy').length;
  const medium = allTopics.filter(t => t.difficulty === 'Medium').length;
  const hard = allTopics.filter(t => t.difficulty === 'Hard').length;
  const important = allTopics.filter(t => t.important).length;
  const unitCount = filteredSubjects.reduce((a, s) => a + s.units.length, 0);
  return { total, completed, pct, totalTime, easy, medium, hard, important, unitCount, subjectCount: filteredSubjects.length };
}

/** Lighten a hex color */
function lighten(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = Math.min(255, parseInt(c.substring(0, 2), 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(c.substring(2, 4), 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(c.substring(4, 6), 16) + Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function diffBadge(diff: string): string {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    Easy: { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0' },
    Medium: { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
    Hard: { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' },
  };
  const c = colors[diff] || colors.Medium;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:7pt;font-weight:700;background:${c.bg};color:${c.text};border:1px solid ${c.border};margin-right:4px;letter-spacing:0.03em;text-transform:uppercase;">${esc(diff)}</span>`;
}

function importantBadge(): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:7pt;font-weight:700;background:#fffbeb;color:#92400e;border:1px solid #fde68a;margin-right:4px;letter-spacing:0.03em;text-transform:uppercase;">★ IMPORTANT</span>`;
}

function norcetBadge(level: string): string {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    High: { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' },
    Med: { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
    Low: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
  };
  const c = colors[level] || colors.Med;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:7pt;font-weight:700;background:${c.bg};color:${c.text};border:1px solid ${c.border};margin-right:4px;letter-spacing:0.03em;text-transform:uppercase;">NORCET ${esc(level)}</span>`;
}

function buildInsights(filtered: Subject[]): string {
  if (filtered.length === 0) return '';

  const subjectStats = filtered.map(s => {
    const topics = s.units.flatMap(u => u.subTopics);
    const done = topics.filter(t => t.completed).length;
    const pct = topics.length > 0 ? Math.round((done / topics.length) * 100) : 0;
    const time = topics.reduce((a, t) => a + safeNum(t.timeSpent), 0);
    return { name: s.name, color: s.color, pct, time, total: topics.length, done };
  });

  const strongest = subjectStats.reduce((a, b) => b.pct > a.pct ? b : a, subjectStats[0]);
  const mostStudied = subjectStats.reduce((a, b) => b.time > a.time ? b : a, subjectStats[0]);
  const weakest = subjectStats.reduce((a, b) => b.pct < a.pct ? b : a, subjectStats[0]);

  const items: string[] = [];
  if (strongest && strongest.pct > 0) {
    items.push(`<div class="insight-item"><div class="insight-icon" style="background:#ecfdf5;color:#065f46;">▲</div><div><div class="insight-label">Strongest Subject</div><div class="insight-val">${esc(strongest.name)} — ${strongest.pct}% complete</div></div></div>`);
  }
  if (mostStudied && mostStudied.time > 0) {
    items.push(`<div class="insight-item"><div class="insight-icon" style="background:#eff6ff;color:#1e40af;">◷</div><div><div class="insight-label">Most Studied</div><div class="insight-val">${esc(mostStudied.name)} — ${fmtTime(mostStudied.time)}</div></div></div>`);
  }
  if (weakest && subjectStats.length > 1 && weakest.pct < 100) {
    items.push(`<div class="insight-item"><div class="insight-icon" style="background:#fffbeb;color:#92400e;">◆</div><div><div class="insight-label">Focus Area</div><div class="insight-val">${esc(weakest.name)} — only ${weakest.pct}% done</div></div></div>`);
  }

  if (items.length === 0) return '';
  return `<div class="insights-section">
    <div class="section-title">Quick Insights</div>
    <div class="insights-grid">${items.join('')}</div>
  </div>`;
}

export function generateReportHtml(subjects: Subject[], config: ReportConfig, folderInfo?: { name: string; coverImage?: string }): string {
  const filtered = getFilteredData(subjects, config);
  const stats = computeStats(filtered);
  const scopeLabel = folderInfo
    ? `📁 ${folderInfo.name} — ${filtered.length} Subjects`
    : filtered.length === 1
      ? `${filtered[0].name} — ${filtered[0].units.length === 1 ? filtered[0].units[0].name : 'Full Subject Report'}`
      : `${filtered.length} Subjects — Comprehensive Report`;

  // TOC
  let tocHtml = '';
  if (stats.unitCount > 2) {
    tocHtml = `<div class="toc">
      <div class="section-title">Table of Contents</div>
      ${filtered.map((s, si) => `
        <div style="margin-bottom:8px;">
          <div style="font-size:9.5pt;font-weight:700;color:${esc(s.color)};display:flex;align-items:center;gap:6px;"><span style="width:18px;height:18px;border-radius:4px;background:${esc(s.color)};color:white;font-size:7pt;display:inline-flex;align-items:center;justify-content:center;font-weight:800;">${si + 1}</span> ${esc(s.name)}</div>
          ${s.units.map((u, ui) => {
            const uDone = u.subTopics.filter(t => t.completed).length;
            return `<div style="margin-left:28px;font-size:8.5pt;color:#475569;padding:1px 0;">Unit ${ui + 1}: ${esc(u.name)} <span style="color:#94a3b8;font-weight:600;">${uDone}/${u.subTopics.length}</span></div>`;
          }).join('')}
        </div>`).join('')}
    </div>`;
  }

  // Insights
  const insightsHtml = buildInsights(filtered);

  // Subject sections — with sequential numbering and poster/logo
  const sectionsHtml = filtered.map((s, si) => {
    const sTopics = s.units.flatMap(u => u.subTopics);
    const sDone = sTopics.filter(t => t.completed).length;
    const sPct = sTopics.length > 0 ? Math.round((sDone / sTopics.length) * 100) : 0;
    const sTime = sTopics.reduce((a, t) => a + safeNum(t.timeSpent), 0);
    const lightColor = lighten(s.color || '#3b82f6', 0.35);

    // Build global sequential numbering map for this subject
    let globalSeqCounter = 0;
    const seqMap = new Map<string, number>();
    s.units.forEach(u => u.subTopics.forEach(t => { globalSeqCounter++; seqMap.set(t.id, globalSeqCounter); }));

    // Subject poster/logo
    const posterHtml = (s.image || s.icon)
      ? `<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
           ${s.image ? `<img src="${esc(s.image)}" style="width:48px;height:48px;border-radius:10px;object-fit:cover;border:2px solid ${esc(s.color)}40;" />` :
             (s.icon?.startsWith('http') ? `<img src="${esc(s.icon)}" style="width:40px;height:40px;border-radius:${s.iconShape === 'circle' ? '50%' : '8px'};object-fit:cover;border:2px solid ${esc(s.color)}40;" />` : '')}
         </div>`
      : '';

    const unitsHtml = s.units.map((u, ui) => {
      const uDone = u.subTopics.filter(t => t.completed).length;
      const uPct = u.subTopics.length > 0 ? Math.round((uDone / u.subTopics.length) * 100) : 0;

      const topicsHtml = u.subTopics.map((t, ti) => {
        const badges: string[] = [];
        if (config.badges.difficulty) badges.push(diffBadge(t.difficulty));
        if (config.badges.important && t.important) badges.push(importantBadge());
        if (config.badges.norcetRelevance && t.norcetRelevance) badges.push(norcetBadge(t.norcetRelevance));

        // Only ✅ for completed, nothing for incomplete
        const statusIcon = t.completed ? '<span style="font-size:11pt;">✅</span>' : '';

        let detailsHtml = '';
        if (config.details.status) {
          const statusLabel = t.completed ? 'Completed' : t.status === 'in_process' ? 'In Progress' : 'Not Started';
          let dateInfo = '';
          if (t.completed && t.completedDate) {
            dateInfo = ` — ${normalizeDate(t.completedDate)}`;
            if (t.completedTime) dateInfo += ` at ${normalizeTime(t.completedTime)}`;
          }
          detailsHtml += `<div class="topic-meta">Status: <strong>${statusLabel}</strong>${dateInfo}${t.timeSpent ? ` · Time: ${fmtTime(safeNum(t.timeSpent))}` : ''}</div>`;
        }
        if (config.details.notes && t.notes) {
          const noteText = t.notes.length > 200 ? t.notes.slice(0, 200) + '…' : t.notes;
          detailsHtml += `<div class="topic-note">${esc(noteText)}</div>`;
        }
        if (config.details.resources && t.resourceLinks?.length) {
          detailsHtml += `<div class="topic-meta">Resources: ${t.resourceLinks.map(r => esc(r.title || r.url)).join(', ')}</div>`;
        }
        if (config.details.attachments && t.attachments?.length) {
          detailsHtml += `<div class="topic-meta">Attachments: ${t.attachments.map(a => esc(a.name)).join(', ')}</div>`;
        }

        const rowBg = ti % 2 === 0 ? '#ffffff' : '#fafbfc';
        // Completed: subtle green tint, weight 600. Incomplete: dark, weight 500
        const nameStyle = t.completed
          ? 'font-weight:600;color:#15803d;'
          : 'font-weight:500;color:#1e293b;';

        const globalNum = seqMap.get(t.id) || (ti + 1);

        return `<tr style="background:${rowBg};">
          <td class="tc" style="width:28px;vertical-align:top;padding-top:8px;">${statusIcon}</td>
          <td class="tc" style="width:28px;vertical-align:top;font-size:8pt;color:#94a3b8;font-weight:600;padding-top:9px;">${s.showTopicNumbers ? globalNum : (ti + 1)}</td>
          <td style="padding:7px 6px;">
            <div style="font-size:10pt;${nameStyle}">${esc(t.name)}</div>
            ${badges.length > 0 ? `<div style="margin-top:3px;">${badges.join('')}</div>` : ''}
            ${detailsHtml}
          </td>
        </tr>`;
      }).join('');

      return `<div class="unit-block">
        <div class="unit-hdr">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="unit-num" style="background:${esc(s.color)};color:white;">${ui + 1}</span>
            <div>
              <div style="font-size:12pt;font-weight:700;color:#1e293b;">${esc(u.name)}</div>
              <div style="font-size:7.5pt;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">${u.subTopics.length} topics · ${uDone} completed</div>
            </div>
          </div>
          <div style="text-align:right;">
            <span style="font-size:16pt;font-weight:900;color:${esc(s.color)};">${uPct}%</span>
          </div>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${uPct}%;background:linear-gradient(90deg,${esc(s.color)},${lightColor});"></div></div>
        <table class="topic-tbl"><tbody>${topicsHtml}</tbody></table>
      </div>`;
    }).join('');

    return `<div class="subject-block" ${si > 0 ? 'style="page-break-before:always;"' : ''}>
      ${posterHtml}
      <div class="subject-hdr" style="border-left:4px solid ${esc(s.color)};background:linear-gradient(135deg,${lighten(s.color || '#3b82f6', 0.42)},${lighten(s.color || '#3b82f6', 0.48)});">
        <div>
          <h2 style="font-size:16pt;font-weight:800;color:${esc(s.color)};margin:0;">${esc(s.name)}</h2>
          <p style="font-size:8pt;color:#475569;margin:3px 0 0;font-weight:600;">${esc(s.shortName)} · Exam: ${normalizeDate(s.examDate)} · ${s.units.length} units · ${sTopics.length} topics</p>
        </div>
        <div style="text-align:right;">
          <div style="font-size:22pt;font-weight:900;color:${esc(s.color)};">${sPct}%</div>
          <div style="font-size:7.5pt;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">${sDone}/${sTopics.length} done${sTime > 0 ? ` · ${fmtTime(sTime)}` : ''}</div>
        </div>
      </div>
      ${unitsHtml}
    </div>`;
  }).join('<div class="section-divider"></div>');

  // Circular progress SVG
  const circRadius = 38;
  const circCircumf = 2 * Math.PI * circRadius;
  const circOffset = circCircumf - (stats.pct / 100) * circCircumf;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page { size: a4; margin: 0.6in 0.55in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; font-size: 10pt; line-height: 1.55; }

    /* ── COVER ── */
    .cover { text-align: center; padding: 50px 20px 36px; margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; }
    .cover h1 { font-size: 28pt; font-weight: 900; color: #0f172a; letter-spacing: -0.03em; margin: 0 0 4px; }
    .cover .scope { font-size: 11pt; color: #475569; font-weight: 600; margin: 0 0 18px; }
    .cover .meta-line { font-size: 8pt; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
    .cover .meta-line strong { color: #334155; font-weight: 700; }

    /* ── SECTION TITLE ── */
    .section-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }

    /* ── STATS ── */
    .stats-row { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
    .circ-progress { flex-shrink: 0; }
    .stat-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; flex: 1; }
    .stat-card { border-radius: 8px; padding: 10px 12px; text-align: center; border: 1px solid #e2e8f0; position: relative; overflow: hidden; }
    .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
    .stat-card.c1::before { background: linear-gradient(90deg,#3b82f6,#60a5fa); }
    .stat-card.c2::before { background: linear-gradient(90deg,#8b5cf6,#a78bfa); }
    .stat-card.c3::before { background: linear-gradient(90deg,#f59e0b,#fbbf24); }
    .stat-val { font-size: 17pt; font-weight: 900; color: #0f172a; }
    .stat-lbl { font-size: 7pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; margin-top: 1px; }

    /* ── OVERALL BAR ── */
    .overall-track { background: #e2e8f0; border-radius: 6px; height: 10px; margin-bottom: 20px; overflow: hidden; }
    .overall-fill { height: 100%; border-radius: 6px; background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899); }

    /* ── DIFFICULTY ROW ── */
    .diff-row { display: flex; gap: 8px; margin-bottom: 20px; }
    .diff-pill { flex: 1; padding: 7px; border-radius: 6px; text-align: center; font-size: 8pt; font-weight: 700; border: 1px solid; }

    /* ── INSIGHTS ── */
    .insights-section { margin-bottom: 20px; }
    .insights-grid { display: flex; gap: 10px; }
    .insight-item { flex: 1; display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fafbfc; }
    .insight-icon { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12pt; flex-shrink: 0; font-weight: 800; }
    .insight-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; font-weight: 700; }
    .insight-val { font-size: 8.5pt; font-weight: 700; color: #1e293b; }

    /* ── TOC ── */
    .toc { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 22px; background: #fafbfc; }

    /* ── SECTION DIVIDER ── */
    .section-divider { height: 1px; background: linear-gradient(90deg, transparent, #cbd5e1 30%, #cbd5e1 70%, transparent); margin: 24px 0; }

    /* ── SUBJECTS ── */
    .subject-block { margin-bottom: 24px; }
    .subject-hdr { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-radius: 8px; margin-bottom: 14px; }

    /* ── UNITS ── */
    .unit-block { margin-bottom: 14px; page-break-inside: avoid; }
    .unit-hdr { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8fafc; border-radius: 6px; margin-bottom: 4px; }
    .unit-num { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 5px; font-size: 8pt; font-weight: 800; flex-shrink: 0; }
    .progress-track { background: #e2e8f0; border-radius: 4px; height: 5px; margin-bottom: 6px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 4px; }

    /* ── TOPIC TABLE ── */
    .topic-tbl { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    .topic-tbl td { padding: 6px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .topic-tbl .tc { text-align: center; }
    .topic-meta { font-size: 8pt; color: #64748b; margin-top: 3px; }
    .topic-meta strong { color: #334155; }
    .topic-note { font-size: 8pt; color: #475569; margin-top: 3px; padding: 4px 8px; background: #f8fafc; border-left: 2px solid #cbd5e1; border-radius: 2px; }

    /* ── FOOTER ── */
    .footer { margin-top: 28px; text-align: center; color: #94a3b8; font-size: 7pt; padding-top: 10px; border-top: 1px solid #e2e8f0; font-weight: 600; letter-spacing: 0.03em; }
  </style>
</head>
<body>
  <!-- COVER -->
  <div class="cover">
    ${folderInfo?.coverImage ? `<img src="${esc(folderInfo.coverImage)}" style="width:100%;max-height:120px;object-fit:cover;border-radius:10px;margin-bottom:16px;border:1px solid #e2e8f0;" />` : ''}
    <h1>NurseTrack Pro</h1>
    <p class="scope">${esc(scopeLabel)}</p>
    <p class="meta-line">Student: <strong>${esc(config.studentName)}</strong> &nbsp;·&nbsp; Generated: <strong>${esc(config.generatedAt)}</strong></p>
  </div>

  <!-- STATS -->
  <div class="section-title">Performance Summary</div>
  <div class="stats-row">
    <div class="circ-progress">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="${circRadius}" fill="none" stroke="#e2e8f0" stroke-width="7"/>
        <circle cx="48" cy="48" r="${circRadius}" fill="none" stroke="url(#grad)" stroke-width="7" stroke-linecap="round"
          stroke-dasharray="${circCircumf}" stroke-dashoffset="${circOffset}"
          transform="rotate(-90 48 48)"/>
        <defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs>
        <text x="48" y="44" text-anchor="middle" font-size="18pt" font-weight="900" fill="#0f172a" font-family="Inter,sans-serif">${stats.pct}%</text>
        <text x="48" y="58" text-anchor="middle" font-size="6pt" font-weight="700" fill="#94a3b8" font-family="Inter,sans-serif" text-transform="uppercase">COMPLETE</text>
      </svg>
    </div>
    <div class="stat-cards">
      <div class="stat-card c1"><div class="stat-val">${stats.completed}/${stats.total}</div><div class="stat-lbl">Topics Done</div></div>
      <div class="stat-card c2"><div class="stat-val">${fmtTime(stats.totalTime)}</div><div class="stat-lbl">Study Time</div></div>
      <div class="stat-card c3"><div class="stat-val">${stats.important}</div><div class="stat-lbl">Important</div></div>
    </div>
  </div>

  <div class="overall-track"><div class="overall-fill" style="width:${stats.pct}%;"></div></div>

  <div class="diff-row">
    <div class="diff-pill" style="background:#ecfdf5;color:#065f46;border-color:#a7f3d0;">Easy: ${stats.easy}</div>
    <div class="diff-pill" style="background:#fffbeb;color:#92400e;border-color:#fde68a;">Medium: ${stats.medium}</div>
    <div class="diff-pill" style="background:#fef2f2;color:#991b1b;border-color:#fecaca;">Hard: ${stats.hard}</div>
  </div>

  ${insightsHtml}
  ${tocHtml}

  <!-- CONTENT -->
  ${sectionsHtml}

  <div class="footer">NurseTrack Pro — AI-Powered Study Tracker &nbsp;·&nbsp; Report generated on ${esc(config.generatedAt)}</div>
</body>
</html>`;
}
