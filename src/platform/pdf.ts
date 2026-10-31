/**
 * PDF export without a server.
 *
 * The report HTML is opened in a new tab with a floating "Save as PDF" bar that calls
 * the browser's print engine — real vector text, selectable, correct page breaks,
 * and the document title becomes the default file name. On phones choose
 * "Save as PDF" as the destination in the print sheet.
 */

interface ExportPdfInput {
  mode?: 'simple' | 'detailed';
  studentName?: string;
  subjects?: Array<{
    name: string; shortName: string; color: string; examDate: string;
    totalTopics: number; completedTopics: number; easyCount: number; mediumCount: number; hardCount: number; totalHours: number;
  }>;
  totalTopics?: number;
  completedTopics?: number;
  totalHours?: number;
  streakDays?: number;
  generatedAt?: string;
  html?: string;
  filename?: string;
}

const escapeHtml = (s: unknown) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeNum = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? v : 0; };
const fmtTime = (mins: number) => {
  if (!mins || mins <= 0) return '0 min';
  if (mins < 60) return `${Math.round(mins)} min`;
  return `${Math.floor(mins / 60)}:${String(Math.round(mins % 60)).padStart(2, '0')} h`;
};

function simpleReportHtml(input: ExportPdfInput): string {
  const rows = (input.subjects || []).map(s => {
    const sp = s.totalTopics > 0 ? Math.round((s.completedTopics / s.totalTopics) * 100) : 0;
    return `<tr>
      <td><span style="width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px;vertical-align:middle;background:${escapeHtml(s.color)}"></span> ${escapeHtml(s.shortName)}</td>
      <td class="num">${safeNum(s.completedTopics)}/${safeNum(s.totalTopics)}</td>
      <td class="num">${sp}%</td>
      <td class="num">${fmtTime(safeNum(s.totalHours) * 60)}</td>
      <td class="num">${escapeHtml(s.examDate)}</td>
    </tr>`;
  }).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>RJ Tracker — Study Report</title>
<style>
  @page { size: a4; margin: 0.6in; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; color: #111827; font-size: 10pt; }
  h1 { font-size: 22pt; margin: 0 0 4px; color: #1e293b; }
  .subtitle { color: #64748b; font-size: 10pt; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; margin-top: 8px; }
  th { text-align: left; font-size: 8pt; font-weight: 600; color: #475569; border-bottom: 1.5px solid #cbd5e1; padding: 8px 8px 8px 0; text-transform: uppercase; }
  td { padding: 8px 8px 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 9.5pt; }
  td.num, th.num { text-align: right; }
</style></head>
<body>
  <h1>RJ Tracker — Study Report</h1>
  <p class="subtitle">Student: ${escapeHtml(input.studentName || 'Student')} | Generated: ${escapeHtml(input.generatedAt || new Date().toLocaleDateString())}</p>
  <table>
    <thead><tr><th>Subject</th><th class="num">Progress</th><th class="num">%</th><th class="num">Hours</th><th class="num">Exam</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`;
}

const TOOLBAR = `
<style>
  #rj-print-bar{position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:flex;gap:10px;align-items:center;justify-content:center;
    padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px));background:rgba(17,24,39,.94);backdrop-filter:blur(8px);
    font:600 14px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#fff;box-shadow:0 -6px 24px rgba(0,0,0,.25)}
  #rj-print-bar button{appearance:none;border:0;border-radius:12px;padding:11px 18px;font:inherit;cursor:pointer}
  #rj-print-bar .go{background:#c2410c;color:#fff}
  #rj-print-bar .x{background:rgba(255,255,255,.14);color:#fff}
  #rj-print-bar span{opacity:.75;font-weight:500;font-size:12px}
  body{padding-bottom:84px}
  @media print{#rj-print-bar{display:none!important}body{padding-bottom:0!important}}
</style>
<div id="rj-print-bar" role="toolbar" aria-label="Report actions">
  <button class="go" type="button" onclick="window.print()">Save as PDF</button>
  <button class="x" type="button" onclick="window.close()">Close</button>
  <span>Choose “Save as PDF” as the printer</span>
</div>
<script>
  window.addEventListener('load', function () { setTimeout(function () { try { window.print(); } catch (e) {} }, 700); });
</script>`;

function withToolbar(html: string, title: string): string {
  let out = html;
  if (/<title>[\s\S]*?<\/title>/i.test(out)) out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  else if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, m => `${m}<title>${escapeHtml(title)}</title>`);
  if (/<\/body>/i.test(out)) return out.replace(/<\/body>/i, `${TOOLBAR}</body>`);
  return out + TOOLBAR;
}

export async function exportPdf(input: ExportPdfInput): Promise<{ url: string; error?: string }> {
  const detailed = input.mode === 'detailed';
  if (detailed && !input.html) throw new Error('html is required for detailed mode');

  const stamp = new Date().toISOString().split('T')[0];
  const filename = (input.filename || `rj-tracker-report-${stamp}`).replace(/\.pdf$/i, '');
  const html = withToolbar(detailed ? (input.html as string) : simpleReportHtml(input), filename);

  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  setTimeout(() => URL.revokeObjectURL(url), 15 * 60 * 1000);
  return { url };
}
