import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTelemetry, renderEnginePrompt, NA, ENGINE_TEMPLATE } from '../src/lib/tutorTelemetryLogic.mjs';

const T = (name, completed, extra = {}) => ({ name, completed, ...extra });
const subjects = [
  { name: 'Obstetrics & Gynaecology', shortName: 'OBG', units: [
    { name: 'Unit 1', subTopics: [T('Anatomy', true, { completedDate: '2026-11-05', completedTime: '10:00' }), T('Physiology', true, { completedDate: '2026-11-07', completedTime: '09:30' })] },
    { name: 'Unit 2', subTopics: [T('Antenatal care', false, { difficulty: 'Easy' }), T('Pre-eclampsia', false, { difficulty: 'Hard', important: true }), T('Labour stages', false, { difficulty: 'Hard' })] },
  ] },
  { name: 'Pediatrics', shortName: 'PED', units: [{ name: 'Unit 1', subTopics: [T('Growth', true, { completedDate: '2026-11-08', completedTime: '08:00' }), T('Immunisation', false)] }] },
];
const NOW = new Date(2026, 10, 8, 11, 10); // 8 Nov 2026
const base = {
  subjects, now: NOW,
  dayMinutes: { '2026-11-08': 60, '2026-11-07': 120, '2026-11-03': 30 },
  dailyLogs: [{ date: '2026-11-06', topicsCompleted: 2 }],
  exams: [{ label: 'Old exam', date: '2026-09-01' }, { label: 'NORCET', date: '2026-11-28' }, { label: 'Later', date: '2027-01-10' }],
  mcq: { total: 40, correct: 30 },
};

test('exact numbers: completion, exam countdown, pace', () => {
  const t = buildTelemetry(base);
  assert.equal(t.completionRate, 42.9);                  // 3 of 7
  assert.equal(t.examDate, '2026-11-28 (NORCET)');       // earliest FUTURE exam
  assert.equal(t.daysRemaining, 20);
  assert.equal(t.derived.remainingTopics, 4);
  assert.equal(t.derived.requiredPace, 0.2);             // 4 / 20
  assert.equal(t.derived.observedPace, 0.7);             // (1 on 8th + 1 on 7th + 2 on 6th + 1 on 5th) / 7 = 0.714
  assert.equal(t.derived.paceVerdict, 'ON_TRACK');
  assert.equal(t.totalMcqs, 40);
  assert.equal(t.accuracyRate, 75);
});

test('active unit follows the latest completed topic; topic focus prefers important + hard', () => {
  const t = buildTelemetry(base);
  // latest completion is PED/Growth on 8 Nov, but PED Unit 1 still has a pending topic → it is the bottleneck
  assert.equal(t.currentUnit, 'PED › Unit 1');
  assert.equal(t.currentTopic, 'Immunisation');
  const t2 = buildTelemetry({ ...base, subjects: [subjects[0]] });
  assert.equal(t2.currentUnit, 'OBG › Unit 2');
  assert.equal(t2.currentTopic, 'Pre-eclampsia [Hard, Important]');
  assert.equal(t2.derived.remainingInActiveUnit, 3);
});

test('7-day window is today-inclusive, ordered, and merges logs with completions', () => {
  const t = buildTelemetry(base);
  assert.equal(t.recentLogs.length, 7);
  assert.equal(t.recentLogs[0].date, '2026-11-02');
  assert.equal(t.recentLogs[6].date, '2026-11-08');
  assert.deepEqual(t.recentLogs[6], { date: '2026-11-08', minutes: 60, topics_completed: 1 });
  assert.equal(t.recentLogs.find(r => r.date === '2026-11-06').topics_completed, 2);
  assert.equal(t.recentLogs.find(r => r.date === '2026-11-03').minutes, 30);
  assert.equal(t.derived.avgMinutesPerDay7d, 30);        // 210 / 7
  assert.equal(t.derived.studyDays7d, 5);
  assert.deepEqual(JSON.parse(t.recentLogsJson), t.recentLogs);
});

test('behind pace is reported with the exact gap', () => {
  const t = buildTelemetry({ ...base, exams: [{ label: 'NORCET', date: '2026-11-10' }] }); // 2 days left, 4 topics remain
  assert.equal(t.daysRemaining, 2);
  assert.equal(t.derived.requiredPace, 2);
  assert.match(t.derived.paceVerdict, /^BEHIND \(gap 1\.3 topics\/day\)$/);
});

test('missing data is NOT_AVAILABLE, never guessed', () => {
  const t = buildTelemetry({ subjects: [], now: NOW });
  assert.equal(t.currentUnit, NA); assert.equal(t.currentTopic, NA);
  assert.equal(t.completionRate, NA); assert.equal(t.examDate, NA); assert.equal(t.daysRemaining, NA);
  assert.equal(t.accuracyRate, NA); assert.equal(t.totalMcqs, 0);
  assert.equal(t.derived.requiredPace, NA); assert.equal(t.derived.paceVerdict, NA);
  const noMcq = buildTelemetry({ ...base, mcq: { total: 0, correct: 0 } });
  assert.equal(noMcq.accuracyRate, NA);
  const onlyPast = buildTelemetry({ ...base, exams: [{ label: 'x', date: '2020-01-01' }] });
  assert.equal(onlyPast.daysRemaining, NA);
});

test('exam today → 0 days; complete syllabus; mcq clamped', () => {
  assert.equal(buildTelemetry({ ...base, exams: [{ label: 'T', date: '2026-11-08' }] }).daysRemaining, 0);
  assert.equal(buildTelemetry({ ...base, exams: [{ label: 'T', date: '2026-11-08' }] }).derived.paceVerdict, 'EXAM_TODAY');
  const all = subjects.map(s => ({ ...s, units: s.units.map(u => ({ ...u, subTopics: u.subTopics.map(x => ({ ...x, completed: true, completedDate: '2026-11-01' })) })) }));
  assert.equal(buildTelemetry({ ...base, subjects: all }).derived.paceVerdict, 'SYLLABUS_COMPLETE');
  assert.equal(buildTelemetry({ ...base, mcq: { total: 10, correct: 99 } }).accuracyRate, 100);
});

test('rendered prompt keeps the user’s rules verbatim and fills every placeholder', () => {
  const p = renderEnginePrompt(buildTelemetry(base));
  assert.ok(!/\{\{\w+\}\}/.test(p), 'unfilled placeholder left');
  assert.ok(p.startsWith('You are the core analytical engine of a high-efficiency Offline Study Tracker.'));
  assert.ok(p.includes('[ANTI-GRAVITY EXECUTION ARCHITECTURE (OPERATIONAL RULES)]'));
  assert.ok(p.includes('1. STRICT BOUNDARY RETENTION'));
  assert.ok(p.includes('4. TONE AND REASONING'));
  assert.ok(p.includes('- CURRENT_ACTIVE_UNIT: PED › Unit 1'));
  assert.ok(p.includes('- COMPLETED_SYLLABUS_PERCENTAGE: 42.9%'));
  assert.ok(p.includes('- TARGET_EXAM_DATE: 2026-11-28 (NORCET)'));
  assert.ok(p.includes('- DAYS_UNTIL_EXAM: 20'));
  assert.ok(p.includes('PACE_VERDICT: ON_TRACK'));
  assert.ok(ENGINE_TEMPLATE.includes('{{user_question}}') === false);
  const empty = renderEnginePrompt(buildTelemetry({ subjects: [], now: NOW }));
  assert.ok(empty.includes('- CURRENT_ACTIVE_UNIT: NOT_AVAILABLE'));
  assert.ok(empty.includes('- DAYS_UNTIL_EXAM: NOT_AVAILABLE'));
});
