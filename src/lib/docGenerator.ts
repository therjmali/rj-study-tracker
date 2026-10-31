import type { Subject, AppState } from '../types';
import { APP_VERSION } from '../types';

function esc(s: string) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function screenCard(title: string, desc: string, mockupHtml: string, labels: string[]) {
  return `
  <div class="screen-card">
    <div class="screen-header">
      <h3>${esc(title)}</h3>
      <p>${esc(desc)}</p>
    </div>
    <div class="phone-frame">
      <div class="phone-notch"></div>
      <div class="phone-screen">${mockupHtml}</div>
    </div>
    <div class="label-list">
      ${labels.map((l, i) => `<span class="label-tag"><span class="label-num">${i + 1}</span>${esc(l)}</span>`).join('')}
    </div>
  </div>`;
}

function barChart(items: {label:string;pct:number;color:string}[]) {
  return `<div class="mini-bars">${items.map(i => `
    <div class="mini-bar-row">
      <span class="mini-bar-label">${i.label}</span>
      <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${i.pct}%;background:${i.color}"></div></div>
      <span class="mini-bar-val">${i.pct}%</span>
    </div>`).join('')}</div>`;
}

function statBox(icon: string, val: string, label: string) {
  return `<div class="mock-stat"><span class="mock-stat-icon">${icon}</span><span class="mock-stat-val">${val}</span><span class="mock-stat-label">${label}</span></div>`;
}

function navBtn(icon: string, label: string, active = false) {
  return `<div class="mock-nav-btn ${active ? 'active' : ''}"><span>${icon}</span><span class="mock-nav-lbl">${label}</span></div>`;
}

function topBar(title: string, extra = '') {
  return `<div class="mock-topbar"><span class="mock-topbar-title">${title}</span>${extra}</div>`;
}

function listItem(icon: string, text: string, right = '') {
  return `<div class="mock-list-item"><span>${icon}</span><span class="mock-list-text">${text}</span><span class="mock-list-right">${right}</span></div>`;
}

function pill(text: string, color: string) {
  return `<span class="mock-pill" style="background:${color}20;color:${color};border:1px solid ${color}40">${text}</span>`;
}

function card(content: string) {
  return `<div class="mock-card">${content}</div>`;
}

function bottomNav(activeIdx: number) {
  const tabs = [
    { icon: '📊', label: 'Home' },
    { icon: '📚', label: 'Syllabus' },
    { icon: '📅', label: 'Daily' },
    { icon: '📈', label: 'Charts' },
    { icon: '🔄', label: 'Revision' },
    { icon: '🤖', label: 'AI Chat' },
  ];
  return `<div class="mock-bottom-nav">${tabs.map((t, i) => navBtn(t.icon, t.label, i === activeIdx)).join('')}</div>`;
}

function heatmapGrid() {
  let cells = '';
  for (let i = 0; i < 35; i++) {
    const v = Math.random();
    const opacity = v > 0.7 ? '0.8' : v > 0.4 ? '0.4' : v > 0.2 ? '0.15' : '0.05';
    cells += `<div class="heat-cell" style="opacity:${opacity}"></div>`;
  }
  return `<div class="mock-heatmap">${cells}</div>`;
}

function progressRing(pct: number, color: string) {
  const r = 28, c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return `<svg class="mock-ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="#333" stroke-width="4"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round" transform="rotate(-90 32 32)"/><text x="32" y="36" text-anchor="middle" fill="white" font-size="11" font-weight="bold">${pct}%</text></svg>`;
}

function topicRow(name: string, done: boolean, diff: string, imp: boolean) {
  const diffColor = diff === 'Hard' ? '#ef4444' : diff === 'Medium' ? '#f59e0b' : '#22c55e';
  return `<div class="mock-topic-row">
    <span class="mock-topic-check">${done ? '✅' : '⬜'}</span>
    <span class="mock-topic-name">${esc(name)}</span>
    ${imp ? '<span class="mock-star">⭐</span>' : ''}
    <span class="mock-diff" style="color:${diffColor}">${diff}</span>
  </div>`;
}

export function generateDocHTML(appState: AppState, subjects: Subject[]): string {
  const now = new Date();
  const totalTopics = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.length, 0), 0);
  const doneTopics = subjects.reduce((a, s) => a + s.units.reduce((b, u) => b + u.subTopics.filter(t => t.completed).length, 0), 0);
  const pct = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0;

  const screens: string[] = [];

  // 1. Landing Page
  screens.push(screenCard('Landing Page', 'First screen for unauthenticated users with sign-up and sign-in options.', `
    <div class="mock-landing">
      <div class="mock-landing-icon">🩺</div>
      <div class="mock-landing-title">NurseTrack Pro</div>
      <div class="mock-landing-sub">AI-powered study tracker for B.Sc. Nursing, NORCET & NCLEX prep</div>
      <div class="mock-btn primary">Get Started — It's Free 🚀</div>
      <div class="mock-btn outline">Sign In</div>
      <div class="mock-landing-features">✨ Cloud sync • 🤖 AI Tutor • 📝 MCQ • 📊 Analytics</div>
    </div>
  `, ['App logo & branding', 'Tagline description', 'Sign-up CTA button', 'Sign-in button', 'Feature highlights strip']));

  // 2. Auth Screen
  screens.push(screenCard('Authentication', 'Magic Link email login and Google Sign-In support.', `
    ${topBar('Sign In')}
    <div class="mock-auth">
      <div class="mock-landing-icon" style="font-size:32px">🩺</div>
      <div class="mock-auth-title">Welcome Back</div>
      <div class="mock-input-field">📧 Email address</div>
      <div class="mock-btn primary">Send Magic Link ✉️</div>
      <div class="mock-divider"><span>or</span></div>
      <div class="mock-btn outline">🔵 Continue with Google</div>
    </div>
  `, ['App branding', 'Email input for magic link', 'Magic link send button', 'Divider', 'Google Sign-In option']));

  // 3. Dashboard - Main
  screens.push(screenCard('Dashboard — Overview', 'Main home screen with stats, progress, and quick actions.', `
    ${topBar('🩺 NurseTrack Pro', '<span class="mock-coins">🪙 25</span>')}
    <div class="mock-dash-grid">
      ${statBox('📚', String(subjects.length), 'Subjects')}
      ${statBox('✅', `${doneTopics}/${totalTopics}`, 'Topics')}
      ${statBox('📊', `${pct}%`, 'Progress')}
      ${statBox('🔥', '0d', 'Streak')}
    </div>
    ${card(`<div class="mock-section-title">📅 Today's Progress</div>
      <div class="mock-today-row"><span>Hours Studied</span><span class="mock-val">0.0h</span></div>
      <div class="mock-today-row"><span>Topics Done</span><span class="mock-val">0</span></div>
      <div class="mock-today-row"><span>Mood</span><span>😊 Good</span></div>`)}
    ${bottomNav(0)}
  `, ['Top header with coins & profile', 'Stat cards grid (4 cards)', 'Daily progress report card', 'Hours/Topics/Mood tracking', 'Bottom navigation bar']));

  // 4. Dashboard - Subject Completion
  screens.push(screenCard('Dashboard — Subject Progress', 'Per-subject completion bars and study velocity.', `
    ${topBar('📊 Progress')}
    ${card(`<div class="mock-section-title">📈 Subject Completion</div>
      ${barChart(subjects.length > 0 ? subjects.map(s => {
        const all = s.units.flatMap(u => u.subTopics);
        const d = all.filter(t => t.completed).length;
        return { label: s.shortName, pct: all.length > 0 ? Math.round((d/all.length)*100) : 0, color: s.color };
      }) : [
        { label: 'OBG', pct: 45, color: '#EC4899' },
        { label: 'CHN', pct: 30, color: '#3B82F6' },
        { label: 'MHN', pct: 60, color: '#8B5CF6' },
      ])}`)}
    ${card(`<div class="mock-section-title">🚀 Study Velocity</div>
      <div class="mock-velocity">
        <div class="mock-vel-num">5.2</div>
        <div class="mock-vel-label">topics/day (7-day avg)</div>
      </div>`)}
    ${bottomNav(0)}
  `, ['Subject completion bars with %', 'Color-coded per subject', 'Study velocity metric', '7-day average calculation']));

  // 5. Dashboard - Charts Section
  screens.push(screenCard('Dashboard — Analytics Widgets', 'Difficulty breakdown, topic distribution, and weekly recap.', `
    ${topBar('📊 Analytics')}
    ${card(`<div class="mock-section-title">🎯 Difficulty Breakdown</div>
      ${barChart([
        { label: 'Easy', pct: 75, color: '#22c55e' },
        { label: 'Medium', pct: 45, color: '#f59e0b' },
        { label: 'Hard', pct: 20, color: '#ef4444' },
      ])}`)}
    ${card(`<div class="mock-section-title">📊 Done vs Remaining</div>
      <div class="mock-donut-row">
        ${progressRing(pct || 42, '#10b981')}
        <div class="mock-donut-legend">
          <div>✅ Done: ${doneTopics || 42}</div>
          <div>⏳ Remaining: ${(totalTopics - doneTopics) || 58}</div>
        </div>
      </div>`)}
    ${bottomNav(0)}
  `, ['Difficulty breakdown bars (Easy/Medium/Hard)', 'Progress percentage per difficulty', 'Donut chart (Done vs Remaining)', 'Legend with counts']));

  // 6. Dashboard - Study Suggestions
  screens.push(screenCard('Dashboard — Smart Suggestions', 'AI-powered study recommendations and focus areas.', `
    ${topBar('💡 Suggestions')}
    ${card(`<div class="mock-section-title">🧠 What To Study Next</div>
      <div class="mock-suggestion">
        <div class="mock-sugg-badge">🔴 HIGH PRIORITY</div>
        <div class="mock-sugg-topic">Normal Labor Mechanism</div>
        <div class="mock-sugg-reason">Hard topic • SRS due • Exam in 14 days</div>
      </div>`)}
    ${card(`<div class="mock-section-title">🎯 Today's Focus</div>
      ${listItem('📕', 'OBG — 3 topics recommended', '→')}
      ${listItem('📗', 'CHN — 2 topics due', '→')}`)}
    ${card(`<div class="mock-section-title">📅 Weekly Recap</div>
      <div class="mock-recap-row"><span>This Week</span><span class="mock-val">+12 topics</span></div>
      <div class="mock-recap-row"><span>Last Week</span><span class="mock-val">+8 topics</span></div>
      <div class="mock-recap-trend">📈 50% improvement</div>`)}
    ${bottomNav(0)}
  `, ['AI study suggestion with priority badge', 'Topic name & reasoning', 'Today\'s focus per subject', 'Weekly recap comparison', 'Improvement trend indicator']));

  // 7. Dashboard - Countdown & Targets
  screens.push(screenCard('Dashboard — Exam Countdown & Targets', 'Exam countdown pills and editable study targets.', `
    ${topBar('⏰ Exams & Goals')}
    <div class="mock-exam-strip">
      ${pill('👶 CHN — 14d', '#3B82F6')}
      ${pill('🧠 MHN — 22d', '#8B5CF6')}
      ${pill('📋 NML — 24d', '#10B981')}
    </div>
    ${card(`<div class="mock-section-title">🎯 Editable Targets</div>
      <div class="mock-target-row">
        <span>📅 Daily Hours</span>
        <div class="mock-slider"><div class="mock-slider-fill" style="width:50%"></div></div>
        <span class="mock-val">6h</span>
      </div>
      <div class="mock-target-row">
        <span>📅 Daily Topics</span>
        <div class="mock-slider"><div class="mock-slider-fill" style="width:33%"></div></div>
        <span class="mock-val">10</span>
      </div>
      <div class="mock-target-row">
        <span>📆 Weekly Hours</span>
        <div class="mock-slider"><div class="mock-slider-fill" style="width:37%"></div></div>
        <span class="mock-val">30h</span>
      </div>`)}
    ${bottomNav(0)}
  `, ['Exam countdown pills with emoji & days', 'Color-coded per subject', 'Daily hours target slider', 'Daily topics target slider', 'Weekly hours target slider']));

  // 8. Syllabus Tracker - Main
  screens.push(screenCard('Syllabus Tracker — Subject List', 'Expandable subject cards with progress and actions.', `
    ${topBar('📚 Syllabus', '<span style="font-size:10px">🔍 ↩️ ↪️</span>')}
    <div class="mock-syllabus-header">
      <div class="mock-input-field">🔍 Search topics...</div>
      <div class="mock-filter-row">
        ${pill('All', '#888')} ${pill('Incomplete', '#ef4444')} ${pill('Complete', '#22c55e')}
      </div>
    </div>
    ${card(`<div class="mock-subject-header" style="border-left:3px solid #EC4899">
      <div><b>OBG</b> — Obstetrics & Gynecology</div>
      <div class="mock-subject-meta">9 units · 106 topics · 42%</div>
      <div class="mock-progress-bar"><div style="width:42%;background:#EC4899"></div></div>
    </div>`)}
    ${card(`<div class="mock-subject-header" style="border-left:3px solid #3B82F6">
      <div><b>CHN-I</b> — Child Health Nursing</div>
      <div class="mock-subject-meta">8 units · 45 topics · 30%</div>
      <div class="mock-progress-bar"><div style="width:30%;background:#3B82F6"></div></div>
    </div>`)}
    <div class="mock-fab">+</div>
    ${bottomNav(1)}
  `, ['Search bar with filters', 'Status filter pills', 'Subject card with color border', 'Subject name & short name', 'Unit/topic count & progress bar', 'Add Subject FAB button']));

  // 9. Syllabus - Expanded Subject
  screens.push(screenCard('Syllabus — Expanded Units & Topics', 'Unit sections with individual topic rows and status toggles.', `
    ${topBar('📚 OBG', '⋮')}
    ${card(`<div class="mock-unit-header">📂 Unit 1: Orientation <span class="mock-unit-count">2/2 ✅</span></div>
      ${topicRow('Introduction to Midwifery', true, 'Easy', false)}
      ${topicRow('Medical Termination of Pregnancy', true, 'Easy', false)}`)}
    ${card(`<div class="mock-unit-header">📂 Unit 2: Anatomy & Gynecology <span class="mock-unit-count">5/18</span></div>
      ${topicRow('Anatomy (Part-1)', true, 'Easy', true)}
      ${topicRow('Anatomy (Part-2)', true, 'Easy', true)}
      ${topicRow('Disorders of Menstruation', false, 'Medium', true)}
      ${topicRow('Hormones in Gynecology', false, 'Medium', true)}
      <div class="mock-more">+ 14 more topics...</div>`)}
    ${bottomNav(1)}
  `, ['Unit header with completion count', 'Topic checkbox (✅/⬜)', 'Topic name', 'Importance star ⭐', 'Difficulty badge (Easy/Medium/Hard)', 'Expand to see more topics']));

  // 10. Syllabus - Topic Detail
  screens.push(screenCard('Topic Detail Sheet', 'Full topic editor with notes, MCQs, difficulty, time spent, and SRS info.', `
    ${topBar('📝 Topic Detail', '✕')}
    ${card(`<div class="mock-topic-detail-name">Normal Labor (Part-1) — Mechanism</div>
      <div class="mock-detail-row"><span>Status</span><span>✅ Complete</span></div>
      <div class="mock-detail-row"><span>Difficulty</span><span style="color:#ef4444">🔴 Hard</span></div>
      <div class="mock-detail-row"><span>Important</span><span>⭐ Yes</span></div>
      <div class="mock-detail-row"><span>Time Spent</span><span>⏱ 45 min</span></div>
      <div class="mock-detail-row"><span>SRS Level</span><span>🧠 Level 3</span></div>
      <div class="mock-detail-row"><span>Next Review</span><span>📅 In 7 days</span></div>`)}
    ${card(`<div class="mock-section-title">📝 Notes</div>
      <div class="mock-notes-area">Key mechanism steps: engagement, descent, flexion, internal rotation, extension, external rotation, expulsion...</div>`)}
    ${card(`<div class="mock-section-title">🧠 MCQs (3)</div>
      ${listItem('❓', 'Which stage involves internal rotation?', '→')}
      ${listItem('❓', 'Cardinal movements of labor include...', '→')}`)}
  `, ['Topic name & status', 'Difficulty & importance indicators', 'Time spent tracking', 'SRS level & next review date', 'Notes editor area', 'Linked MCQ questions']));

  // 11. Syllabus - Bulk Select
  screens.push(screenCard('Bulk Select Mode', 'Multi-select topics for batch complete, star, move, copy, or delete.', `
    ${topBar('📚 Select Mode', 'Cancel')}
    ${card(`<div class="mock-unit-header">📂 Unit 3: Reproductive Science</div>
      <div class="mock-topic-row"><span class="mock-checkbox checked">☑️</span><span class="mock-topic-name">Gametogenesis & Fertilization</span></div>
      <div class="mock-topic-row"><span class="mock-checkbox checked">☑️</span><span class="mock-topic-name">Placenta (Part-1)</span></div>
      <div class="mock-topic-row"><span class="mock-checkbox">⬜</span><span class="mock-topic-name">Placental Anomalies</span></div>
      <div class="mock-topic-row"><span class="mock-checkbox checked">☑️</span><span class="mock-topic-name">Amniotic Fluid</span></div>`)}
    <div class="mock-bulk-bar">
      <span>3 selected</span>
      <div class="mock-bulk-actions">
        <span class="mock-bulk-btn">✅</span>
        <span class="mock-bulk-btn">⭐</span>
        <span class="mock-bulk-btn">📦</span>
        <span class="mock-bulk-btn">📋</span>
        <span class="mock-bulk-btn" style="color:#ef4444">🗑️</span>
      </div>
    </div>
    ${bottomNav(1)}
  `, ['Selected topic checkboxes', 'Selection count indicator', 'Batch Complete button', 'Batch Star button', 'Move to Unit button', 'Copy to Unit button', 'Delete selected button']));

  // 12. Add Subject
  screens.push(screenCard('Add / Edit Subject', 'Create a new subject with name, short name, color, and exam date.', `
    ${topBar('➕ Add Subject', '✕')}
    ${card(`
      <div class="mock-form-group"><label>Subject Name</label><div class="mock-input-field">e.g. Pediatric Nursing</div></div>
      <div class="mock-form-group"><label>Short Name</label><div class="mock-input-field">e.g. PED</div></div>
      <div class="mock-form-group"><label>Color</label>
        <div class="mock-color-row">
          <span class="mock-color-dot" style="background:#EC4899"></span>
          <span class="mock-color-dot" style="background:#3B82F6"></span>
          <span class="mock-color-dot" style="background:#8B5CF6"></span>
          <span class="mock-color-dot" style="background:#10B981"></span>
          <span class="mock-color-dot" style="background:#F59E0B"></span>
          <span class="mock-color-dot" style="background:#EF4444"></span>
        </div>
      </div>
      <div class="mock-form-group"><label>Exam Date</label><div class="mock-input-field">📅 2026-04-20</div></div>
      <div class="mock-btn primary" style="margin-top:12px">Save Subject</div>`)}
  `, ['Subject name input', 'Short name input', 'Color picker dots', 'Exam date selector', 'Save button']));

  // 13. Import Syllabus
  screens.push(screenCard('Import Syllabus', 'Paste syllabus text to auto-parse into units and topics.', `
    ${topBar('📥 Import Syllabus', '✕')}
    ${card(`<div class="mock-section-title">📝 Paste Syllabus Text</div>
      <div class="mock-textarea">Unit 1: Introduction
- Topic 1: Overview of nursing
- Topic 2: History of pediatrics
Unit 2: Assessment
- Topic 1: Health assessment
- Topic 2: Growth monitoring</div>
      <div class="mock-parse-preview">
        <div class="mock-section-title">🔍 Preview (2 units, 4 topics)</div>
        ${listItem('📂', 'Unit 1: Introduction', '2 topics')}
        ${listItem('📂', 'Unit 2: Assessment', '2 topics')}
      </div>
      <div class="mock-btn primary">Import to Subject</div>`)}
  `, ['Text area for pasting syllabus', 'Auto-parsed preview', 'Unit count & topic count', 'Import confirmation button']));

  // 14. Unit Detail View
  screens.push(screenCard('Unit Detail View', 'Full-page view of a single unit with all topics, navigation, and actions.', `
    ${topBar('← Unit 4: Normal Obstetrics', '⋮')}
    <div class="mock-unit-stats">
      ${statBox('✅', '8/15', 'Done')} ${statBox('⭐', '6', 'Important')} ${statBox('⏱', '2.5h', 'Time')}
    </div>
    ${topicRow('Basics of Pregnancy (Part-1)', true, 'Medium', true)}
    ${topicRow('Basics of Pregnancy (Part-2)', true, 'Medium', false)}
    ${topicRow('Antenatal Care (ANC)', true, 'Medium', true)}
    ${topicRow('USG in Pregnancy', false, 'Medium', false)}
    ${topicRow('Pelvis — Anatomy', false, 'Hard', true)}
    ${topicRow('Normal Labor Mechanism', false, 'Hard', true)}
    <div class="mock-more">+ 9 more topics...</div>
    <div class="mock-nav-arrows"><span>← Prev Unit</span><span>Next Unit →</span></div>
    ${bottomNav(1)}
  `, ['Back navigation with unit name', 'Unit stats (done/important/time)', 'Topic list with all indicators', 'Completion toggles', 'Difficulty badges', 'Unit navigation arrows']));

  // 15. Daily Tracker
  screens.push(screenCard('Daily Tracker', 'Log daily study hours, topics, mood, and notes.', `
    ${topBar('📅 Daily Log')}
    <div class="mock-date-nav"><span>◀</span><span class="mock-date-current">📅 June 10, 2026</span><span>▶</span></div>
    ${card(`
      <div class="mock-detail-row"><span>⏱ Hours Studied</span><span class="mock-val">4.5h</span></div>
      <div class="mock-detail-row"><span>✅ Topics Completed</span><span class="mock-val">8</span></div>
      <div class="mock-detail-row"><span>😊 Mood</span>
        <div class="mock-mood-row">
          <span class="mock-mood">😄</span><span class="mock-mood active">😊</span><span class="mock-mood">😐</span><span class="mock-mood">😫</span><span class="mock-mood">😰</span>
        </div>
      </div>
      <div class="mock-detail-row"><span>📝 Notes</span></div>
      <div class="mock-notes-area">Focused on OBG Unit 4 today. Completed labor mechanism topics.</div>
      <div class="mock-detail-row"><span>📚 Subject Focus</span><span>OBG</span></div>`)}
    ${card(`<div class="mock-section-title">⏱ Session Timeline</div>
      ${listItem('🟢', '09:00 - 10:30 — OBG (Pomodoro)', '1.5h')}
      ${listItem('🔵', '14:00 - 15:00 — CHN', '1h')}
      ${listItem('🟢', '19:00 - 21:00 — OBG', '2h')}`)}
    ${bottomNav(2)}
  `, ['Date navigation (prev/next)', 'Current date display', 'Hours studied counter', 'Topics completed count', 'Mood selector (5 moods)', 'Daily notes textarea', 'Subject focus', 'Session timeline with times']));

  // 16. Charts View
  screens.push(screenCard('Charts & Analytics', 'Progress calendar heatmap, subject-wise charts, and PDF export.', `
    ${topBar('📈 Analytics', '📄 PDF')}
    ${card(`<div class="mock-section-title">📅 Progress Calendar</div>${heatmapGrid()}<div class="mock-heatmap-legend"><span>Less</span><span>■ ■ ■ ■</span><span>More</span></div>`)}
    ${card(`<div class="mock-section-title">📊 Topics by Subject</div>
      ${barChart([
        { label: 'OBG', pct: 42, color: '#EC4899' },
        { label: 'CHN-I', pct: 30, color: '#3B82F6' },
        { label: 'MHN-I', pct: 55, color: '#8B5CF6' },
        { label: 'NML', pct: 65, color: '#10B981' },
      ])}`)}
    ${card(`<div class="mock-section-title">⏱ Hours by Subject</div>
      ${barChart([
        { label: 'OBG', pct: 60, color: '#EC4899' },
        { label: 'CHN-I', pct: 25, color: '#3B82F6' },
        { label: 'MHN-I', pct: 40, color: '#8B5CF6' },
      ])}`)}
    ${bottomNav(3)}
  `, ['GitHub-style progress heatmap', 'Heatmap intensity legend', 'Topics by subject bar chart', 'Hours by subject bar chart', 'PDF export button', 'Group mode toggle (Topics/Units/Hours)']));

  // 17. Revision Panel
  screens.push(screenCard('Revision Panel (SRS)', 'Spaced repetition review queue with difficulty filters.', `
    ${topBar('🔄 Revision')}
    <div class="mock-srs-stats">
      ${statBox('📋', '12', 'Due Today')} ${statBox('🔴', '5', 'Hard')} ${statBox('🟡', '4', 'Medium')} ${statBox('🟢', '3', 'Easy')}
    </div>
    ${card(`<div class="mock-section-title">📋 Due Topics</div>
      <div class="mock-topic-row"><span>⬜</span><span class="mock-topic-name">PPH Management</span><span class="mock-diff" style="color:#ef4444">Hard</span><span class="mock-srs-badge">SRS L2</span></div>
      <div class="mock-topic-row"><span>⬜</span><span class="mock-topic-name">Eclampsia (Part-2)</span><span class="mock-diff" style="color:#ef4444">Hard</span><span class="mock-srs-badge">SRS L1</span></div>
      <div class="mock-topic-row"><span>⬜</span><span class="mock-topic-name">Ectopic Pregnancy</span><span class="mock-diff" style="color:#ef4444">Hard</span><span class="mock-srs-badge">SRS L3</span></div>
      <div class="mock-topic-row"><span>⬜</span><span class="mock-topic-name">Disorders of Menstruation</span><span class="mock-diff" style="color:#f59e0b">Med</span><span class="mock-srs-badge">SRS L2</span></div>`)}
    ${bottomNav(4)}
  `, ['Due today count & breakdown', 'Hard/Medium/Easy filter cards', 'Topic queue with SRS level', 'Difficulty indicator', 'SRS level badge', 'Review completion toggle']));

  // 18. AI Chat
  screens.push(screenCard('AI Chat — Study Assistant', 'Claude AI-powered study companion with streaming responses.', `
    ${topBar('🤖 AI Study Chat', '🗑️')}
    <div class="mock-chat">
      <div class="mock-chat-msg user"><div class="mock-chat-bubble user">Explain the mechanism of normal labor in detail</div></div>
      <div class="mock-chat-msg ai"><div class="mock-chat-avatar">🤖</div><div class="mock-chat-bubble ai">The mechanism of normal labor involves seven cardinal movements:\n\n**1. Engagement** — The fetal head enters the pelvic inlet...\n\n**2. Descent** — Progressive downward movement...\n\n**3. Flexion** — The chin approaches the chest...</div></div>
      <div class="mock-chat-msg user"><div class="mock-chat-bubble user">What are the stages of labor?</div></div>
    </div>
    <div class="mock-chat-input"><span>💬 Ask your AI tutor...</span><span class="mock-send-btn">↑</span></div>
    ${bottomNav(5)}
  `, ['Chat message history', 'User message bubble', 'AI response with markdown formatting', 'AI avatar icon', 'Streaming response indicator', 'Message input field', 'Send button']));

  // 19. MCQ Practice
  screens.push(screenCard('MCQ Practice', 'AI-generated multiple choice questions with explanations.', `
    ${topBar('🧠 MCQ Practice', '✕')}
    ${card(`<div class="mock-section-title">Select Subject & Topic</div>
      <div class="mock-input-field">📚 Select Subject...</div>
      <div class="mock-input-field">📂 Select Unit...</div>
      <div class="mock-btn primary">🧠 Generate 5 MCQs</div>`)}
    ${card(`<div class="mock-mcq-q"><span class="mock-q-num">Q1.</span> Which hormone is primarily responsible for maintaining pregnancy?</div>
      <div class="mock-mcq-opt correct">A) Progesterone ✅</div>
      <div class="mock-mcq-opt">B) Estrogen</div>
      <div class="mock-mcq-opt">C) Oxytocin</div>
      <div class="mock-mcq-opt">D) Prolactin</div>
      <div class="mock-mcq-exp">✅ Progesterone maintains the endometrium and prevents uterine contractions during pregnancy.</div>`)}
  `, ['Subject & unit selector', 'Generate MCQ button', 'Question with number', 'Multiple choice options', 'Correct answer highlight', 'Explanation after answer']));

  // 20. Pomodoro Timer
  screens.push(screenCard('Pomodoro Timer', 'Focus timer with ambient sounds, subject linking, and session logging.', `
    ${topBar('🍅 Pomodoro Timer', '✕')}
    <div class="mock-pomodoro">
      <div class="mock-pomo-ring">
        ${progressRing(65, '#ef4444')}
      </div>
      <div class="mock-pomo-time">16:15</div>
      <div class="mock-pomo-phase">🍅 Focus Session</div>
      <div class="mock-pomo-controls">
        <span class="mock-btn outline" style="width:auto;padding:6px 16px">⏸ Pause</span>
        <span class="mock-btn outline" style="width:auto;padding:6px 16px">⏭ Skip</span>
      </div>
      <div class="mock-pomo-link">📚 Linked: OBG → Unit 4 → Normal Labor</div>
      <div class="mock-pomo-ambient">
        <span class="mock-ambient active">🌧 Rain</span>
        <span class="mock-ambient">📚 Library</span>
        <span class="mock-ambient">🌿 Nature</span>
        <span class="mock-ambient">🔇 Silent</span>
      </div>
    </div>
  `, ['Timer ring with progress', 'Time remaining display', 'Focus/Break phase indicator', 'Pause & Skip controls', 'Subject/topic link', 'Ambient sound selector (4 options)']));

  // 21. Quick Complete
  screens.push(screenCard('Quick Complete', 'Rapidly mark topics complete from a floating action button.', `
    ${topBar('✅ Quick Complete', '✕')}
    ${card(`
      <div class="mock-form-group"><label>📅 Date</label><div class="mock-input-field">2026-06-10</div></div>
      <div class="mock-form-group"><label>📚 Subject</label><div class="mock-input-field">Select subject...</div></div>
      <div class="mock-form-group"><label>📂 Unit</label><div class="mock-input-field">Select unit...</div></div>
      <div class="mock-form-group"><label>📝 Topic (8 incomplete)</label><div class="mock-input-field">Select topic...</div></div>
      <div class="mock-btn primary" style="margin-top:12px">✅ Mark Complete</div>`)}
  `, ['Date picker for backdating', 'Subject dropdown selector', 'Unit dropdown selector', 'Topic dropdown (shows incomplete count)', 'Mark Complete button']));

  // 22. Global Search
  screens.push(screenCard('Global Search (Ctrl+K)', 'Full-text search across all topics with quick completion toggle.', `
    <div class="mock-search-overlay">
      <div class="mock-search-box">
        <div class="mock-input-field" style="font-size:13px">🔍 Search all topics...</div>
        <div class="mock-search-results">
          <div class="mock-search-result"><span class="mock-search-icon">⬜</span><span>Normal Labor (Part-1)</span><span class="mock-search-sub">OBG → Unit 4</span></div>
          <div class="mock-search-result"><span class="mock-search-icon">✅</span><span>Normal Labor (Part-2)</span><span class="mock-search-sub">OBG → Unit 4</span></div>
          <div class="mock-search-result"><span class="mock-search-icon">⬜</span><span>Preterm Labor & PROM</span><span class="mock-search-sub">OBG → Unit 6</span></div>
          <div class="mock-search-result"><span class="mock-search-icon">⬜</span><span>Induction of Labor</span><span class="mock-search-sub">OBG → Unit 4</span></div>
        </div>
        <div class="mock-search-hint">↑↓ Navigate • Enter to toggle • Esc to close</div>
      </div>
    </div>
  `, ['Search input field', 'Real-time results list', 'Completion status icon per result', 'Subject/unit breadcrumb', 'Toggle completion from search', 'Keyboard shortcut hints']));

  // 23. Profile - Overview
  screens.push(screenCard('Profile — Overview', 'User profile with stats grid, rank badge, and study streak.', `
    <div class="mock-profile-cover"></div>
    <div class="mock-profile-header">
      <div class="mock-avatar">🎓</div>
      <div class="mock-profile-info">
        <div class="mock-profile-name">Student Name ✏️</div>
        <div class="mock-profile-email">student@email.com</div>
        <div class="mock-profile-badges">
          ${pill('🌱 BEGINNER', '#22c55e')}
          ${pill('🔥 5d streak', '#ef4444')}
        </div>
      </div>
    </div>
    <div class="mock-dash-grid">
      ${statBox('📚', '3', 'Subjects')}
      ${statBox('✅', '42/100', 'Topics')}
      ${statBox('📊', '42%', 'Progress')}
      ${statBox('🔥', '5d', 'Streak')}
      ${statBox('🎯', '60%', 'Important')}
      ${statBox('⏱', '12.5h', 'Time')}
    </div>
  `, ['Cover gradient (customizable)', 'Avatar with rank indicator', 'Editable name', 'Email display', 'Rank badge (Beginner/Intermediate/Master/Diamond)', 'Streak badge', 'Stats grid (6 stats)']));

  // 24. Profile - Tabs
  screens.push(screenCard('Profile — Tab Navigation', 'Profile sub-tabs for Awards, Pomodoro, Exams, History, Settings, Backup, Trash.', `
    ${topBar('← Profile', '✕')}
    <div class="mock-tab-strip">
      <span class="mock-tab">📈 Overview</span>
      <span class="mock-tab active">🏆 Awards</span>
      <span class="mock-tab">🍅 Pomodoro</span>
      <span class="mock-tab">⏰ Exams</span>
      <span class="mock-tab">📜 History</span>
      <span class="mock-tab">⚙️ Settings</span>
      <span class="mock-tab">💾 Backup</span>
      <span class="mock-tab">🗑️ Trash</span>
    </div>
    ${card(`<div class="mock-section-title">🏆 Achievements</div>
      <div class="mock-achievement"><span class="mock-ach-icon">🌱</span><div><b>First Steps</b><div class="mock-ach-desc">Complete your first topic</div></div><span class="mock-ach-xp">+10 XP</span></div>
      <div class="mock-achievement"><span class="mock-ach-icon">🔥</span><div><b>On Fire</b><div class="mock-ach-desc">Maintain a 7-day streak</div></div><span class="mock-ach-xp">+50 XP</span></div>
      <div class="mock-achievement locked"><span class="mock-ach-icon">🔒</span><div><b>Century Club</b><div class="mock-ach-desc">Complete 100 topics</div></div><span class="mock-ach-xp">+100 XP</span></div>`)}
  `, ['8 profile tabs', 'Horizontal scrollable tab strip', 'Achievement cards with icon', 'Achievement title & description', 'XP reward badge', 'Locked achievements']));

  // 25. Exam Countdown
  screens.push(screenCard('Exam Countdown', 'Manage exam dates with countdown timers and custom exam creation.', `
    ${topBar('⏰ Exam Countdown')}
    ${card(`<div class="mock-exam-card" style="border-left:3px solid #EC4899">
      <div class="mock-exam-name">👶 Child Health Nursing</div>
      <div class="mock-exam-date">April 9, 2026</div>
      <div class="mock-exam-days">14 days remaining</div>
      <div class="mock-progress-bar"><div style="width:75%;background:#EC4899"></div></div>
    </div>`)}
    ${card(`<div class="mock-exam-card" style="border-left:3px solid #8B5CF6">
      <div class="mock-exam-name">🧠 Mental Health Nursing</div>
      <div class="mock-exam-date">April 18, 2026</div>
      <div class="mock-exam-days">22 days remaining</div>
      <div class="mock-progress-bar"><div style="width:55%;background:#8B5CF6"></div></div>
    </div>`)}
    <div class="mock-btn outline" style="margin:12px 0">➕ Add Custom Exam</div>
  `, ['Exam card with subject color', 'Exam name with emoji', 'Exam date display', 'Days remaining countdown', 'Study progress bar', 'Add custom exam button']));

  // 26. History Center
  screens.push(screenCard('Activity History', 'Chronological log of all study actions (up to 500 entries).', `
    ${topBar('📜 Activity History')}
    ${card(`
      <div class="mock-history-item"><span>✅</span><span class="mock-history-time">10:32</span><span class="mock-topic-name">Anatomy (Part-1)</span><span class="mock-pill-sm" style="color:#EC4899">OBG</span></div>
      <div class="mock-history-item"><span>✅</span><span class="mock-history-time">10:28</span><span class="mock-topic-name">Anatomy (Part-2)</span><span class="mock-pill-sm" style="color:#EC4899">OBG</span></div>
      <div class="mock-history-item"><span>↩️</span><span class="mock-history-time">09:45</span><span class="mock-topic-name">Meningitis</span><span class="mock-pill-sm" style="color:#3B82F6">CHN</span></div>
      <div class="mock-history-item"><span>✏️</span><span class="mock-history-time">09:30</span><span class="mock-topic-name">Difficulty changed</span><span class="mock-pill-sm" style="color:#8B5CF6">MHN</span></div>
      <div class="mock-history-item"><span>✅</span><span class="mock-history-time">09:15</span><span class="mock-topic-name">Schizophrenia types</span><span class="mock-pill-sm" style="color:#8B5CF6">MHN</span></div>`)}
  `, ['Activity icon (✅/↩️/✏️)', 'Timestamp', 'Topic name', 'Subject badge with color', 'Chronological order']));

  // 27. Settings - Appearance
  screens.push(screenCard('Settings — Appearance', 'Theme mode selection and accent color customization.', `
    ${topBar('⚙️ Settings')}
    ${card(`<div class="mock-section-title">📱 Appearance</div>
      <div class="mock-section-sub">Display Mode</div>
      <div class="mock-mode-grid">
        <div class="mock-mode-btn">☀️<br>Light</div>
        <div class="mock-mode-btn active">🌙<br>Dark</div>
        <div class="mock-mode-btn">📱<br>AMOLED</div>
      </div>
      <div class="mock-section-sub">Accent Color</div>
      <div class="mock-color-row" style="gap:8px">
        <span class="mock-color-dot active-dot" style="background:#3B82F6"></span>
        <span class="mock-color-dot" style="background:#22c55e"></span>
        <span class="mock-color-dot" style="background:#f97316"></span>
        <span class="mock-color-dot" style="background:#EC4899"></span>
        <span class="mock-color-dot" style="background:#8B5CF6"></span>
        <span class="mock-color-dot" style="background:#EF4444"></span>
      </div>`)}
  `, ['Display mode grid (Light/Dark/AMOLED)', 'Active mode indicator', 'Accent color dots', 'Active color checkmark', 'Preview in real-time']));

  // 28. Settings - Goals & Timer
  screens.push(screenCard('Settings — Goals & Timer', 'Study targets and Pomodoro timer configuration.', `
    ${topBar('⚙️ Settings')}
    ${card(`<div class="mock-section-title">🎯 Study Goals</div>
      <div class="mock-target-row"><span>📅 Daily Hours</span><div class="mock-slider"><div class="mock-slider-fill" style="width:50%"></div></div><span class="mock-val">6h</span></div>
      <div class="mock-target-row"><span>📅 Daily Topics</span><div class="mock-slider"><div class="mock-slider-fill" style="width:33%"></div></div><span class="mock-val">10</span></div>
      <div class="mock-target-row"><span>📆 Weekly Hours</span><div class="mock-slider"><div class="mock-slider-fill" style="width:37%"></div></div><span class="mock-val">30h</span></div>`)}
    ${card(`<div class="mock-section-title">⏱️ Pomodoro Timer</div>
      <div class="mock-target-row"><span>Focus</span><div class="mock-slider"><div class="mock-slider-fill" style="width:42%"></div></div><span class="mock-val">25m</span></div>
      <div class="mock-target-row"><span>Short Break</span><div class="mock-slider"><div class="mock-slider-fill" style="width:17%"></div></div><span class="mock-val">5m</span></div>
      <div class="mock-detail-row"><span>Auto-start Breaks</span><span class="mock-toggle off">OFF</span></div>
      <div class="mock-detail-row"><span>🔊 Sound Alerts</span><span class="mock-toggle on">ON</span></div>`)}
  `, ['Daily hours slider', 'Daily topics slider', 'Weekly hours slider', 'Focus duration slider', 'Short break slider', 'Auto-start toggle', 'Sound alert toggle']));

  // 29. Settings - SRS & Shortcuts
  screens.push(screenCard('Settings — SRS & Shortcuts', 'Custom spaced repetition intervals and keyboard shortcuts.', `
    ${topBar('⚙️ Settings')}
    ${card(`<div class="mock-section-title">🧠 Spaced Repetition</div>
      <div class="mock-form-group"><label>Easy intervals (days)</label><div class="mock-input-field">2, 5, 10, 20, 40</div></div>
      <div class="mock-form-group"><label>Medium intervals (days)</label><div class="mock-input-field">1, 3, 7, 14, 30</div></div>
      <div class="mock-form-group"><label>Hard intervals (days)</label><div class="mock-input-field">1, 2, 4, 7, 15</div></div>
      <div class="mock-btn outline" style="width:auto;font-size:10px">Reset to Defaults</div>`)}
    ${card(`<div class="mock-section-title">⌨️ Keyboard Shortcuts</div>
      <div class="mock-shortcut"><span>Open Search</span><kbd>Ctrl+K</kbd></div>
      <div class="mock-shortcut"><span>Undo</span><kbd>Ctrl+Z</kbd></div>
      <div class="mock-shortcut"><span>Redo</span><kbd>Ctrl+Y</kbd></div>
      <div class="mock-shortcut"><span>Close Dialog</span><kbd>Esc</kbd></div>`)}
  `, ['Easy interval config', 'Medium interval config', 'Hard interval config', 'Reset to defaults button', 'Keyboard shortcut reference', 'Key combination display']));

  // 30. Backup & Export
  screens.push(screenCard('Backup & Export', 'Data backup, documentation download, and factory reset.', `
    ${topBar('💾 Backup')}
    ${card(`<div class="mock-section-title">🛡️ Backup & Restore</div>
      <div class="mock-btn-grid">
        <div class="mock-btn outline">📥 Export</div>
        <div class="mock-btn outline">📤 Import</div>
        <div class="mock-btn outline">🗑 Clear History</div>
        <div class="mock-btn outline" style="color:#ef4444;border-color:#ef444440">🗑 Reset All</div>
      </div>`)}
    ${card(`<div class="mock-section-title">📦 Export & Documentation</div>
      ${listItem('📄', 'App Documentation (A–Z)', 'Markdown')}
      ${listItem('💻', 'Source Architecture Manifest', 'JSON')}
      ${listItem('🌐', 'Visual Documentation (HTML)', 'HTML')}
      <div class="mock-small-note">💡 Downloads include visual screen previews</div>`)}
  `, ['Export JSON backup button', 'Import backup button', 'Clear history button', 'Factory reset (password-protected)', 'Documentation downloads', 'Multiple format options']));

  // 31. Trash
  screens.push(screenCard('Trash Management', 'Recover or permanently delete trashed subjects.', `
    ${topBar('🗑️ Trash')}
    ${card(`<div class="mock-trash-item" style="border-left:3px solid #3B82F6">
      <div><b>CHN-I</b> — Child Health Nursing<br><span class="mock-small">Deleted June 5, 2026</span></div>
      <div class="mock-trash-actions"><span class="mock-btn outline" style="width:auto;padding:4px 10px;font-size:9px">↩️ Restore</span><span class="mock-btn outline" style="width:auto;padding:4px 8px;font-size:9px;color:#ef4444">🗑</span></div>
    </div>`)}
    ${card(`<div class="mock-trash-item" style="border-left:3px solid #8B5CF6">
      <div><b>MHN-II</b> — Mental Health Nursing II<br><span class="mock-small">Deleted June 3, 2026</span></div>
      <div class="mock-trash-actions"><span class="mock-btn outline" style="width:auto;padding:4px 10px;font-size:9px">↩️ Restore</span><span class="mock-btn outline" style="width:auto;padding:4px 8px;font-size:9px;color:#ef4444">🗑</span></div>
    </div>`)}
    <div class="mock-btn outline" style="color:#ef4444;border-color:#ef444440;margin-top:8px">Empty Trash (2 items)</div>
  `, ['Trashed subject with color', 'Subject name & delete date', 'Restore button', 'Permanent delete button', 'Empty all trash button']));

  // 32. Coin Store
  screens.push(screenCard('Coin Store', 'Spend earned coins on themes, borders, and confetti effects.', `
    ${topBar('🪙 Coin Store', '💰 Balance: 45')}
    ${card(`<div class="mock-section-title">🎨 Accent Themes</div>
      <div class="mock-store-grid">
        <div class="mock-store-item"><span>🌸</span><div>Cherry Blossom</div><div class="mock-price">15 🪙</div></div>
        <div class="mock-store-item"><span>🌙</span><div>Midnight Blue</div><div class="mock-price">15 🪙</div></div>
        <div class="mock-store-item"><span>🌲</span><div>Forest Green</div><div class="mock-price">15 🪙</div></div>
      </div>`)}
    ${card(`<div class="mock-section-title">💫 Avatar Borders</div>
      <div class="mock-store-grid">
        <div class="mock-store-item"><span>💡</span><div>Neon Glow</div><div class="mock-price">10 🪙</div></div>
        <div class="mock-store-item"><span>💛</span><div>Gold Ring</div><div class="mock-price">20 🪙</div></div>
        <div class="mock-store-item"><span>🌈</span><div>Rainbow Ring</div><div class="mock-price">30 🪙</div></div>
      </div>`)}
    ${card(`<div class="mock-section-title">🎆 Confetti Effects</div>
      <div class="mock-store-grid">
        <div class="mock-store-item"><span>⭐</span><div>Star Burst</div><div class="mock-price">10 🪙</div></div>
        <div class="mock-store-item"><span>🎆</span><div>Fireworks</div><div class="mock-price">20 🪙</div></div>
      </div>`)}
  `, ['Coin balance display', 'Theme items with prices', 'Border items with prices', 'Confetti effects with prices', 'Purchase buttons', 'Equip/unequip toggle']));

  // 33. PWA Install
  screens.push(screenCard('PWA Install Banner', 'Prompts users to install the app on their device.', `
    ${topBar('🩺 NurseTrack Pro')}
    <div class="mock-install-banner">
      <div class="mock-install-icon">📲</div>
      <div class="mock-install-text">
        <div><b>Install NurseTrack Pro</b></div>
        <div class="mock-small">Add to home screen for the best experience</div>
      </div>
      <div class="mock-btn primary" style="width:auto;padding:6px 14px;font-size:10px">Install</div>
      <span style="cursor:pointer;opacity:0.5">✕</span>
    </div>
    <div class="mock-install-note">Works offline • App-like experience • No browser chrome</div>
  `, ['Install prompt banner', 'App icon', 'Install description', 'Install button', 'Dismiss button', 'Offline capability note']));

  // 34. Milestone Toast
  screens.push(screenCard('Milestone Celebrations', 'Auto-triggered toast notifications at key achievements.', `
    ${topBar('📊 Dashboard')}
    <div class="mock-milestone-toast">
      <div class="mock-milestone-icon">🎉</div>
      <div class="mock-milestone-content">
        <div><b>Milestone Reached!</b></div>
        <div class="mock-small">You completed 50 topics! Keep going! 🚀</div>
      </div>
    </div>
    <div class="mock-milestone-toast" style="top:80px;opacity:0.6">
      <div class="mock-milestone-icon">🔥</div>
      <div class="mock-milestone-content">
        <div><b>7-Day Streak!</b></div>
        <div class="mock-small">You've been studying consistently for a week!</div>
      </div>
    </div>
  `, ['Celebration emoji', 'Milestone title', 'Achievement description', 'Auto-dismiss animation', 'Multiple milestones stack']));

  // 35. Help / Onboarding
  screens.push(screenCard('Help & Onboarding', 'First-time user guide and feature walkthrough.', `
    ${topBar('❓ Getting Started', '✕')}
    ${card(`<div class="mock-section-title">👋 Welcome to NurseTrack Pro!</div>
      <div class="mock-help-steps">
        ${listItem('1️⃣', 'Add subjects in the Syllabus tab', '')}
        ${listItem('2️⃣', 'Create units and topics within each subject', '')}
        ${listItem('3️⃣', 'Mark topics complete as you study', '')}
        ${listItem('4️⃣', 'Track daily hours in the Daily tab', '')}
        ${listItem('5️⃣', 'Use AI Chat for study help & MCQs', '')}
        ${listItem('6️⃣', 'Review with SRS in the Revision tab', '')}
        ${listItem('7️⃣', 'Check Charts for analytics', '')}
      </div>
      <div class="mock-btn primary" style="margin-top:8px">Got it! Let's start 🚀</div>`)}
  `, ['Welcome message', 'Step-by-step guide (7 steps)', 'Feature descriptions', 'Dismiss/start button']));

  // 36. Cloud Sync Indicator
  screens.push(screenCard('Cloud Sync Status', 'Real-time sync indicator showing save status.', `
    ${topBar('🩺 NurseTrack Pro')}
    <div class="mock-sync-states">
      <div class="mock-sync-item"><span class="mock-sync-dot syncing"></span><span>☁️ Syncing...</span><span class="mock-small">Debounced auto-save in progress</span></div>
      <div class="mock-sync-item"><span class="mock-sync-dot saved"></span><span>☁️ Saved</span><span class="mock-small">All changes saved to cloud</span></div>
      <div class="mock-sync-item"><span class="mock-sync-dot error"></span><span>⚠️ Offline</span><span class="mock-small">Using local cache, will retry</span></div>
    </div>
    ${card(`<div class="mock-section-title">⚡ Sync Architecture</div>
      <div class="mock-sync-detail">Settings: 2s debounce</div>
      <div class="mock-sync-detail">Subjects: 3s debounce</div>
      <div class="mock-sync-detail">Topics: 500ms debounce</div>
      <div class="mock-sync-detail">Daily logs: 1s debounce</div>`)}
  `, ['Syncing spinner state', 'Saved checkmark state', 'Offline/error state', 'Debounce timing details', 'Top-right position indicator']));

  // 37. Side Navigation (Desktop)
  screens.push(screenCard('Desktop Side Navigation', 'Sidebar navigation visible on large screens (lg+).', `
    <div class="mock-desktop-layout">
      <div class="mock-sidebar">
        <div class="mock-sidebar-item active">📊 Dashboard</div>
        <div class="mock-sidebar-item">📚 Syllabus</div>
        <div class="mock-sidebar-item">📅 Daily</div>
        <div class="mock-sidebar-item">📈 Charts</div>
        <div class="mock-sidebar-item">🔄 Revision <span class="mock-badge">3</span></div>
        <div class="mock-sidebar-item">🤖 AI Chat</div>
        <div class="mock-sidebar-item">🪙 Store</div>
        <div class="mock-sidebar-item">👤 Profile</div>
      </div>
      <div class="mock-desktop-content">
        <div class="mock-section-title">📊 Dashboard</div>
        <div class="mock-small">Main content area (responsive)</div>
      </div>
    </div>
  `, ['Sidebar navigation (desktop only)', 'Active tab highlight', 'SRS badge count on Revision', 'Responsive: hidden on mobile', 'Content area fills remaining space']));

  // Build final HTML
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NurseTrack Pro ${APP_VERSION} — Visual Documentation</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5;padding:0}
a{color:#60a5fa}

.doc-header{text-align:center;padding:60px 20px 40px;background:linear-gradient(135deg,#1a1030 0%,#0d1117 50%,#0a1628 100%);border-bottom:1px solid #ffffff10}
.doc-header h1{font-size:clamp(28px,5vw,42px);font-weight:900;background:linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.doc-header .subtitle{color:#888;font-size:14px}
.doc-header .gen-date{color:#555;font-size:11px;margin-top:12px}
.doc-header .stat-strip{display:flex;justify-content:center;gap:20px;margin-top:20px;flex-wrap:wrap}
.doc-header .stat-strip span{padding:6px 16px;border-radius:12px;background:#ffffff08;border:1px solid #ffffff10;font-size:12px;font-weight:600}

.toc{max-width:900px;margin:30px auto;padding:0 20px}
.toc h2{font-size:20px;margin-bottom:16px;color:#a78bfa}
.toc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
.toc-item{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:#ffffff05;border:1px solid #ffffff08;font-size:12px;color:#aaa;transition:all .2s}
.toc-item:hover{background:#ffffff10;color:#fff}
.toc-item .toc-num{color:#60a5fa;font-weight:700;min-width:24px}

.screens-grid{max-width:1400px;margin:40px auto;padding:0 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:30px}

.screen-card{background:#111118;border:1px solid #ffffff10;border-radius:20px;overflow:hidden;transition:transform .2s,box-shadow .2s}
.screen-card:hover{transform:translateY(-4px);box-shadow:0 12px 40px #00000060}
.screen-header{padding:20px 20px 12px}
.screen-header h3{font-size:16px;font-weight:800;color:#fff;margin-bottom:4px}
.screen-header p{font-size:11px;color:#777}

.phone-frame{width:260px;margin:0 auto 16px;border-radius:24px;border:2px solid #333;background:#0d0d14;overflow:hidden;position:relative;min-height:420px}
.phone-notch{width:100px;height:18px;background:#0d0d14;border-radius:0 0 14px 14px;margin:0 auto;position:relative;z-index:2;border:1px solid #333;border-top:0}
.phone-screen{padding:4px 8px 8px;font-size:10px;overflow:hidden}

.label-list{padding:12px 20px 20px;display:flex;flex-wrap:wrap;gap:4px}
.label-tag{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:#60a5fa10;border:1px solid #60a5fa20;font-size:9px;color:#60a5fa}
.label-num{width:14px;height:14px;border-radius:50%;background:#60a5fa;color:#000;font-size:8px;font-weight:800;display:flex;align-items:center;justify-content:center}

/* Mock UI Components */
.mock-topbar{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;font-size:11px;font-weight:700;border-bottom:1px solid #ffffff08}
.mock-topbar-title{font-size:11px}
.mock-coins{font-size:9px;background:#fbbf2420;color:#fbbf24;padding:2px 6px;border-radius:8px}

.mock-card{background:#ffffff06;border:1px solid #ffffff08;border-radius:10px;padding:8px;margin:6px 0}
.mock-section-title{font-size:10px;font-weight:700;margin-bottom:6px;color:#ccc}
.mock-section-sub{font-size:9px;color:#888;margin:6px 0 4px}

.mock-stat{display:inline-flex;flex-direction:column;align-items:center;padding:6px;background:#ffffff05;border:1px solid #ffffff08;border-radius:8px;min-width:50px;text-align:center}
.mock-stat-icon{font-size:12px}
.mock-stat-val{font-size:11px;font-weight:800;font-family:monospace;color:#fff}
.mock-stat-label{font-size:7px;color:#777;text-transform:uppercase;letter-spacing:0.5px}

.mock-dash-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:6px 0}
.mock-srs-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:6px 0}
.mock-unit-stats{display:flex;gap:4px;margin:6px 0}

.mock-btn{display:block;text-align:center;padding:8px;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer}
.mock-btn.primary{background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff}
.mock-btn.outline{background:transparent;border:1px solid #ffffff15;color:#ccc}
.mock-btn-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}

.mock-bottom-nav{display:flex;justify-content:space-around;padding:6px 2px;border-top:1px solid #ffffff08;background:#0d0d14;position:absolute;bottom:0;left:0;right:0}
.mock-nav-btn{display:flex;flex-direction:column;align-items:center;font-size:10px;color:#555;gap:1px}
.mock-nav-btn.active{color:#60a5fa}
.mock-nav-lbl{font-size:7px}

.mock-list-item{display:flex;align-items:center;gap:6px;padding:5px 4px;font-size:10px;border-bottom:1px solid #ffffff05}
.mock-list-text{flex:1;color:#ccc}
.mock-list-right{color:#666;font-size:9px}

.mock-pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:8px;font-weight:600;margin:2px}
.mock-pill-sm{font-size:8px;font-weight:600}

.mock-progress-bar{height:4px;border-radius:2px;background:#ffffff10;overflow:hidden;margin-top:4px}
.mock-progress-bar div{height:100%;border-radius:2px;transition:width .3s}

.mini-bars{space-y:4px}.mini-bar-row{display:flex;align-items:center;gap:4px;margin-bottom:4px;font-size:9px}
.mini-bar-label{width:32px;color:#999;font-size:8px;text-align:right}
.mini-bar-track{flex:1;height:6px;border-radius:3px;background:#ffffff10;overflow:hidden}
.mini-bar-fill{height:100%;border-radius:3px}
.mini-bar-val{width:28px;font-size:8px;color:#999;font-family:monospace}

.mock-input-field{padding:6px 8px;border-radius:6px;background:#ffffff08;border:1px solid #ffffff10;font-size:9px;color:#888;margin:4px 0}
.mock-form-group{margin-bottom:8px}
.mock-form-group label{font-size:8px;color:#888;display:block;margin-bottom:2px}
.mock-textarea{padding:6px 8px;border-radius:6px;background:#ffffff08;border:1px solid #ffffff10;font-size:8px;color:#999;min-height:60px;white-space:pre-line;margin:4px 0}
.mock-notes-area{padding:6px;border-radius:6px;background:#ffffff05;font-size:8px;color:#999;min-height:30px;margin:4px 0}

.mock-color-row{display:flex;gap:6px;margin:4px 0}
.mock-color-dot{width:20px;height:20px;border-radius:50%;cursor:pointer;border:2px solid transparent}
.mock-color-dot.active-dot{border-color:#fff;box-shadow:0 0 8px #ffffff40}

.mock-topic-row{display:flex;align-items:center;gap:4px;padding:3px 0;font-size:9px;border-bottom:1px solid #ffffff05}
.mock-topic-check{font-size:10px}
.mock-topic-name{flex:1;color:#ccc}
.mock-star{font-size:8px}
.mock-diff{font-size:7px;font-weight:700}
.mock-more{font-size:8px;color:#666;padding:4px 0;text-align:center}
.mock-srs-badge{font-size:7px;background:#8b5cf620;color:#a78bfa;padding:1px 4px;border-radius:4px}

.mock-today-row,.mock-detail-row,.mock-recap-row{display:flex;justify-content:space-between;padding:4px 0;font-size:9px;color:#999;border-bottom:1px solid #ffffff05}
.mock-val{font-weight:700;color:#fff;font-family:monospace}
.mock-velocity .mock-vel-num{font-size:24px;font-weight:900;color:#60a5fa;text-align:center}
.mock-velocity .mock-vel-label{font-size:8px;color:#666;text-align:center}
.mock-recap-trend{text-align:center;font-size:9px;color:#22c55e;padding:4px 0}

.mock-landing{text-align:center;padding:40px 16px}
.mock-landing-icon{font-size:40px;margin-bottom:8px}
.mock-landing-title{font-size:20px;font-weight:900;color:#fff}
.mock-landing-sub{font-size:9px;color:#888;margin:8px 0 16px}
.mock-landing-features{font-size:8px;color:#666;margin-top:12px}

.mock-auth{text-align:center;padding:20px 16px}
.mock-auth-title{font-size:14px;font-weight:700;color:#fff;margin:8px 0 12px}
.mock-divider{text-align:center;padding:8px 0;font-size:8px;color:#555;position:relative}
.mock-divider span{background:#0d0d14;padding:0 8px;position:relative;z-index:1}

.mock-subject-header{padding:4px 8px}
.mock-subject-header b{font-size:10px;color:#fff}
.mock-subject-meta{font-size:8px;color:#777;margin:2px 0}
.mock-unit-header{font-size:9px;font-weight:700;color:#ddd;margin-bottom:4px;display:flex;justify-content:space-between}
.mock-unit-count{font-size:8px;color:#888}

.mock-filter-row{display:flex;gap:4px;margin:4px 0}
.mock-fab{position:absolute;bottom:50px;right:10px;width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700}

.mock-exam-strip{display:flex;gap:4px;padding:6px 4px;overflow-x:auto}
.mock-target-row{display:flex;align-items:center;gap:6px;padding:4px 0;font-size:9px;color:#999}
.mock-slider{flex:1;height:4px;border-radius:2px;background:#ffffff10;overflow:hidden}
.mock-slider-fill{height:100%;border-radius:2px;background:#60a5fa}

.mock-chat{padding:4px 0;min-height:200px}
.mock-chat-msg{display:flex;gap:4px;margin:6px 0;align-items:flex-start}
.mock-chat-msg.user{justify-content:flex-end}
.mock-chat-bubble{padding:6px 8px;border-radius:10px;font-size:9px;max-width:85%;white-space:pre-line}
.mock-chat-bubble.user{background:#3b82f6;color:#fff;border-bottom-right-radius:2px}
.mock-chat-bubble.ai{background:#ffffff08;border:1px solid #ffffff10;color:#ccc;border-bottom-left-radius:2px}
.mock-chat-avatar{font-size:14px}
.mock-chat-input{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border:1px solid #ffffff10;border-radius:10px;font-size:9px;color:#666;margin-top:8px}
.mock-send-btn{width:20px;height:20px;border-radius:50%;background:#3b82f6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px}

.mock-pomodoro{text-align:center;padding:12px}
.mock-pomo-ring{margin:0 auto}
.mock-ring{width:80px;height:80px;margin:0 auto}
.mock-pomo-time{font-size:28px;font-weight:900;color:#fff;font-family:monospace;margin:8px 0 4px}
.mock-pomo-phase{font-size:10px;color:#ef4444;font-weight:600}
.mock-pomo-controls{display:flex;justify-content:center;gap:8px;margin:10px 0}
.mock-pomo-link{font-size:8px;color:#888;margin:8px 0}
.mock-pomo-ambient{display:flex;justify-content:center;gap:6px;margin-top:8px}
.mock-ambient{font-size:8px;padding:3px 6px;border-radius:6px;background:#ffffff05;color:#777}
.mock-ambient.active{background:#ef444420;color:#ef4444;border:1px solid #ef444430}

.mock-mcq-q{font-size:10px;font-weight:600;color:#ddd;margin-bottom:6px;padding:4px 0;border-bottom:1px solid #ffffff08}
.mock-q-num{color:#60a5fa;margin-right:4px}
.mock-mcq-opt{padding:4px 6px;margin:3px 0;border-radius:6px;font-size:9px;background:#ffffff05;border:1px solid #ffffff08;color:#999}
.mock-mcq-opt.correct{background:#22c55e15;border-color:#22c55e30;color:#22c55e}
.mock-mcq-exp{font-size:8px;color:#22c55e;padding:4px;margin-top:4px;background:#22c55e08;border-radius:4px}

.mock-heatmap{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin:4px 0}
.heat-cell{aspect-ratio:1;border-radius:2px;background:#22c55e;min-height:8px}
.mock-heatmap-legend{display:flex;justify-content:center;gap:4px;font-size:7px;color:#666;margin-top:4px}

.mock-suggestion{padding:6px;border-radius:6px;background:#ef444410;border:1px solid #ef444420}
.mock-sugg-badge{font-size:7px;font-weight:800;color:#ef4444;margin-bottom:2px}
.mock-sugg-topic{font-size:10px;font-weight:700;color:#fff}
.mock-sugg-reason{font-size:8px;color:#888;margin-top:2px}

.mock-date-nav{display:flex;justify-content:space-between;align-items:center;padding:6px;font-size:10px;color:#888}
.mock-date-current{font-weight:700;color:#fff}
.mock-mood-row{display:flex;gap:4px}
.mock-mood{font-size:14px;opacity:0.4;cursor:pointer}
.mock-mood.active{opacity:1;transform:scale(1.2)}

.mock-search-overlay{padding:20px 8px}
.mock-search-box{background:#15151f;border:1px solid #ffffff15;border-radius:12px;overflow:hidden}
.mock-search-results{max-height:200px}
.mock-search-result{display:flex;align-items:center;gap:6px;padding:6px 8px;font-size:9px;color:#ccc;border-bottom:1px solid #ffffff05}
.mock-search-icon{font-size:10px}
.mock-search-sub{font-size:7px;color:#666;margin-left:auto}
.mock-search-hint{font-size:7px;color:#555;text-align:center;padding:6px}

.mock-profile-cover{height:50px;background:linear-gradient(135deg,#3b82f630,#8b5cf620,#22c55e30)}
.mock-profile-header{display:flex;gap:8px;padding:0 8px;margin-top:-16px}
.mock-avatar{width:36px;height:36px;border-radius:8px;background:#3b82f620;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #0d0d14}
.mock-profile-info{padding-top:18px}
.mock-profile-name{font-size:12px;font-weight:800;color:#fff}
.mock-profile-email{font-size:8px;color:#888}
.mock-profile-badges{display:flex;gap:4px;margin-top:2px}

.mock-tab-strip{display:flex;gap:4px;overflow-x:auto;padding:4px 0;margin-bottom:8px}
.mock-tab{padding:4px 8px;border-radius:6px;font-size:8px;color:#888;white-space:nowrap}
.mock-tab.active{background:#60a5fa15;color:#60a5fa;border:1px solid #60a5fa20}

.mock-achievement{display:flex;align-items:center;gap:6px;padding:6px 4px;border-bottom:1px solid #ffffff05}
.mock-achievement.locked{opacity:0.4}
.mock-ach-icon{font-size:16px}
.mock-ach-desc{font-size:8px;color:#888}
.mock-ach-xp{font-size:8px;color:#fbbf24;margin-left:auto;font-weight:700}

.mock-exam-card{padding:6px 8px;margin-bottom:4px}
.mock-exam-name{font-size:10px;font-weight:700;color:#fff}
.mock-exam-date{font-size:8px;color:#888}
.mock-exam-days{font-size:9px;color:#60a5fa;font-weight:600;margin:2px 0}

.mock-history-item{display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #ffffff05;font-size:9px}
.mock-history-time{font-size:8px;color:#666;font-family:monospace;min-width:30px}

.mock-mode-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:4px 0}
.mock-mode-btn{text-align:center;padding:8px 4px;border-radius:8px;font-size:9px;color:#888;background:#ffffff05;border:1px solid #ffffff08}
.mock-mode-btn.active{background:#60a5fa10;color:#60a5fa;border-color:#60a5fa30}

.mock-toggle{font-size:8px;font-weight:700;padding:2px 6px;border-radius:4px}
.mock-toggle.on{background:#22c55e20;color:#22c55e}
.mock-toggle.off{background:#ffffff10;color:#888}

.mock-shortcut{display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:9px;color:#999}
.mock-shortcut kbd{padding:2px 6px;border-radius:4px;background:#ffffff10;border:1px solid #ffffff15;font-size:8px;font-family:monospace;color:#ccc}

.mock-store-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
.mock-store-item{text-align:center;padding:8px 4px;border-radius:8px;background:#ffffff05;border:1px solid #ffffff08;font-size:8px;color:#ccc}
.mock-store-item span{font-size:16px;display:block;margin-bottom:2px}
.mock-price{font-size:8px;color:#fbbf24;font-weight:700;margin-top:2px}

.mock-trash-item{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;font-size:9px;color:#ccc;margin-bottom:4px}
.mock-trash-actions{display:flex;gap:4px}

.mock-install-banner{display:flex;align-items:center;gap:8px;padding:8px;margin:8px 0;border-radius:10px;background:#3b82f610;border:1px solid #3b82f620}
.mock-install-icon{font-size:20px}
.mock-install-text{flex:1;font-size:9px;color:#ccc}
.mock-install-note{text-align:center;font-size:8px;color:#666;margin:8px 0}

.mock-milestone-toast{position:relative;display:flex;align-items:center;gap:8px;padding:8px 12px;margin:8px;border-radius:10px;background:#22c55e10;border:1px solid #22c55e20}
.mock-milestone-icon{font-size:20px}
.mock-milestone-content{font-size:9px;color:#ccc}

.mock-sync-states{space-y:8px}
.mock-sync-item{display:flex;align-items:center;gap:8px;padding:8px;margin:4px 0;border-radius:8px;background:#ffffff05;font-size:9px;color:#ccc}
.mock-sync-dot{width:8px;height:8px;border-radius:50%}
.mock-sync-dot.syncing{background:#f59e0b;animation:pulse 1s infinite}
.mock-sync-dot.saved{background:#22c55e}
.mock-sync-dot.error{background:#ef4444}
.mock-sync-detail{font-size:8px;color:#888;padding:2px 0}
.mock-small{font-size:8px;color:#666}
.mock-small-note{font-size:8px;color:#888;margin-top:6px;padding:4px;background:#ffffff05;border-radius:4px}
.mock-checkbox{font-size:10px}
.mock-bulk-bar{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:#3b82f615;border:1px solid #3b82f620;border-radius:8px;margin:6px 0;font-size:9px;color:#60a5fa}
.mock-bulk-actions{display:flex;gap:8px;font-size:14px}
.mock-bulk-btn{cursor:pointer}
.mock-parse-preview{margin:6px 0;padding:6px;border-radius:6px;background:#22c55e08;border:1px solid #22c55e15}
.mock-nav-arrows{display:flex;justify-content:space-between;padding:6px 0;font-size:9px;color:#60a5fa}
.mock-donut-row{display:flex;align-items:center;gap:12px;justify-content:center}
.mock-donut-legend{font-size:9px;color:#999}
.mock-desktop-layout{display:flex;min-height:300px}
.mock-sidebar{width:80px;background:#0a0a0f;border-right:1px solid #ffffff08;padding:8px 4px}
.mock-sidebar-item{padding:6px 4px;font-size:8px;color:#888;border-radius:6px;margin-bottom:2px;white-space:nowrap;overflow:hidden}
.mock-sidebar-item.active{background:#60a5fa15;color:#60a5fa}
.mock-badge{font-size:7px;background:#ef4444;color:#fff;padding:1px 4px;border-radius:8px;margin-left:2px}
.mock-desktop-content{flex:1;padding:8px}

.mock-help-steps{padding:4px 0}

@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}

.footer{text-align:center;padding:40px 20px;color:#555;font-size:11px;border-top:1px solid #ffffff08;margin-top:40px}
.footer .heart{color:#ef4444}

.section-divider{max-width:900px;margin:40px auto 20px;padding:0 20px}
.section-divider h2{font-size:22px;font-weight:800;color:#a78bfa;display:flex;align-items:center;gap:8px}
.section-divider p{font-size:12px;color:#666;margin-top:4px}

@media(max-width:400px){.screens-grid{grid-template-columns:1fr}.phone-frame{width:240px}}
@media print{body{background:#fff;color:#000}.screen-card{break-inside:avoid}}
</style>
</head>
<body>

<div class="doc-header">
  <h1>🩺 NurseTrack Pro ${APP_VERSION}</h1>
  <div class="subtitle">Complete Visual Documentation — Every Screen & Feature from A to Z</div>
  <div class="gen-date">Generated: ${now.toLocaleString()} | ${screens.length} Screen Previews</div>
  <div class="stat-strip">
    <span>📚 ${subjects.length} Subjects</span>
    <span>✅ ${doneTopics}/${totalTopics} Topics</span>
    <span>📊 ${pct}% Complete</span>
    <span>🖥️ ${screens.length} Screens Documented</span>
  </div>
</div>

<div class="toc">
  <h2>📋 Table of Contents</h2>
  <div class="toc-grid">
    ${['Landing Page','Authentication','Dashboard Overview','Subject Progress','Analytics Widgets','Smart Suggestions','Exam Countdown & Targets','Syllabus Subject List','Expanded Units & Topics','Topic Detail Sheet','Bulk Select Mode','Add/Edit Subject','Import Syllabus','Unit Detail View','Daily Tracker','Charts & Analytics','Revision Panel (SRS)','AI Chat','MCQ Practice','Pomodoro Timer','Quick Complete','Global Search','Profile Overview','Profile Tabs & Awards','Exam Countdown','Activity History','Settings Appearance','Settings Goals & Timer','Settings SRS & Shortcuts','Backup & Export','Trash Management','Coin Store','PWA Install','Milestone Celebrations','Help & Onboarding','Cloud Sync Status','Desktop Side Navigation'].map((t, i) => `<div class="toc-item"><span class="toc-num">${i + 1}</span>${t}</div>`).join('')}
  </div>
</div>

<div class="section-divider"><h2>🖥️ Screen Previews</h2><p>Interactive mockups of every screen in NurseTrack Pro</p></div>
<div class="screens-grid">
${screens.join('\n')}
</div>

<div class="footer">
  <p>Built with <span class="heart">❤️</span> using React + TypeScript + Tailwind CSS + shadcn/ui</p>
  <p>NurseTrack Pro ${APP_VERSION} | AI-powered by Anthropic Claude</p>
  <p>© ${now.getFullYear()} NurseTrack Pro. All rights reserved.</p>
</div>

</body></html>`;
}
