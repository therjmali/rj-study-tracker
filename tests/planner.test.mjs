import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs, closeLoader, daysAgo, iso, topic } from './_load.mjs';

after(closeLoader);
const inDays = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return iso(d); };
const today = () => daysAgo(0);

function makeSubject({ total, done, examIn, recentDone = 0, important = [] }) {
  const topics = Array.from({ length: total }, (_, i) => topic({
    id: 't' + i, name: 'Topic ' + (i + 1), completed: i < done,
    completedDate: i < done ? (i < recentDone ? daysAgo(i % 14) : daysAgo(60)) : undefined,
    important: important.includes(i), difficulty: i % 4 === 0 ? 'Hard' : 'Medium',
  }));
  return { id: 's1', name: 'Fundamentals', shortName: 'FON', color: '#00f', examDate: examIn == null ? '' : inDays(examIn), units: [{ id: 'u1', name: 'U', subTopics: topics }] };
}

test('planner: needs vs pace gives an honest status', async () => {
  const { buildPlans } = await loadTs('src/lib/planner.ts');
  const critical = buildPlans([makeSubject({ total: 100, done: 20, recentDone: 14, examIn: 20 })], today())[0];
  assert.equal(critical.remaining, 80);
  assert.equal(Math.round(critical.requiredPerDay), 4);
  assert.equal(critical.pace, 1);
  assert.equal(critical.status, 'critical');
  const ok = buildPlans([makeSubject({ total: 30, done: 20, recentDone: 14, examIn: 10 })], today())[0];
  assert.equal(ok.status, 'on-track');
  assert.equal(buildPlans([makeSubject({ total: 10, done: 10, examIn: 5 })], today())[0].status, 'done');
  assert.equal(buildPlans([makeSubject({ total: 10, done: 2, examIn: null })], today())[0].status, 'no-deadline');
  assert.equal(buildPlans([makeSubject({ total: 10, done: 2, examIn: -3 })], today())[0].status, 'past');
});

test('planner: rest days shrink the number of study days and raise the daily need', async () => {
  const { buildPlans, countStudyDays } = await loadTs('src/lib/planner.ts');
  const t = today();
  const exam = inDays(14);
  assert.equal(countStudyDays(t, exam, []), 14);
  assert.equal(countStudyDays(t, exam, [0]), 12);
  const base = buildPlans([makeSubject({ total: 60, done: 20, recentDone: 14, examIn: 14 })], t)[0];
  const rested = buildPlans([makeSubject({ total: 60, done: 20, recentDone: 14, examIn: 14 })], t, { restDays: [0] })[0];
  assert.ok(rested.requiredPerDay > base.requiredPerDay);
});

test('suggestToday: sized to the need, Important topics first, never completed ones', async () => {
  const { buildPlans, suggestToday } = await loadTs('src/lib/planner.ts');
  const s = makeSubject({ total: 60, done: 10, recentDone: 10, examIn: 10, important: [14, 15] });
  const plans = buildPlans([s], today());
  const tasks = suggestToday([s], plans, today(), { maxNew: 6 });
  const news = tasks.filter(x => x.kind === 'new');
  assert.ok(news.length >= 1 && news.length <= 6);
  assert.ok(news.every(x => !s.units[0].subTopics.find(t => t.id === x.topicId).completed));
  assert.equal(news[0].important, true, 'important topics are surfaced first');
});

test('suggestToday: due revisions appear; fresh completions do not', async () => {
  const { buildPlans, suggestToday } = await loadTs('src/lib/planner.ts');
  const s = makeSubject({ total: 10, done: 0, examIn: 30 });
  s.units[0].subTopics[0] = topic({ id: 'old', name: 'Old topic', completed: true, completedDate: daysAgo(5) });
  s.units[0].subTopics[1] = topic({ id: 'fresh', name: 'Fresh topic', completed: true, completedDate: daysAgo(0) });
  const tasks = suggestToday([s], buildPlans([s], today()), today());
  const revs = tasks.filter(x => x.kind === 'revise');
  assert.ok(revs.some(r => r.topicId === 'old' && r.round === 'R1'));
  assert.ok(!revs.some(r => r.topicId === 'fresh'));
});

test('readiness: more weighted completion, revision and freshness → higher score, bounded 0–100', async () => {
  const { computeReadiness } = await loadTs('src/lib/planner.ts');
  const low = computeReadiness(makeSubject({ total: 20, done: 2, recentDone: 2, examIn: 10 }), today()).score;
  const high = computeReadiness(makeSubject({ total: 20, done: 18, recentDone: 18, examIn: 10 }), today()).score;
  assert.ok(low >= 0 && high <= 100 && high > low);
  const s = makeSubject({ total: 4, done: 4, recentDone: 4, examIn: 10 });
  s.units[0].subTopics.forEach(t => { t.revisions = { R1: { status: 'complete' }, R2: { status: 'complete' }, R3: { status: 'complete' }, R4: { status: 'complete' } }; });
  assert.equal(computeReadiness(s, today()).score, 100);
});
