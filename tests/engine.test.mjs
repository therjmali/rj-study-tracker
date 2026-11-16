import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs, closeLoader, daysAgo, topic, subject } from './_load.mjs';

after(closeLoader);

const entries = (days) => days.map(n => ({ id: 'e' + n, date: daysAgo(n), minutes: 30, startTime: '20:00', endTime: '20:30' }));

test('streak: days with only topic time entries count (the 5d-vs-42d bug)', async () => {
  const { computeStreak: engine } = await loadTs('src/hooks/useStreak.ts');
  const { computeStreak: profileStreak } = await loadTs('src/lib/gamification.ts');
  const { getLocalDateStr } = await loadTs('src/lib/utils.ts');
  const subs = [subject([topic({ timeSpent: 300, timeEntries: entries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) })])];
  const home = engine(subs, [], getLocalDateStr(), []).current;
  assert.equal(home, 10);
  assert.equal(profileStreak(subs, [], []), home, 'Profile / banner / widgets must equal Home');
});

test('streak: a gap breaks it, today not yet studied keeps yesterday’s run alive', async () => {
  const { computeStreak: engine } = await loadTs('src/hooks/useStreak.ts');
  const { getLocalDateStr } = await loadTs('src/lib/utils.ts');
  const subs = [subject([topic({ timeSpent: 90, timeEntries: entries([1, 2, 3, 6, 7]) })])];
  assert.equal(engine(subs, [], getLocalDateStr(), []).current, 3);
  const withToday = [subject([topic({ timeSpent: 120, timeEntries: entries([0, 1, 2, 3]) })])];
  assert.equal(engine(withToday, [], getLocalDateStr(), []).current, 4);
});

test('streak: every caller agrees on completions-only, sessions-only and logs-only histories', async () => {
  const { computeStreak: engine } = await loadTs('src/hooks/useStreak.ts');
  const { computeStreak: profileStreak } = await loadTs('src/lib/gamification.ts');
  const { getLocalDateStr } = await loadTs('src/lib/utils.ts');
  const completed = [subject([1, 2, 3, 4].map(n => topic({ completed: true, status: 'completed', completedDate: daysAgo(n) })))];
  assert.equal(profileStreak(completed, [], []), engine(completed, [], getLocalDateStr(), []).current);
  const logs = [1, 2, 3].map(n => ({ date: daysAgo(n), hoursStudied: 1, topicsCompleted: 0 }));
  assert.equal(profileStreak([subject([])], logs, []), engine([subject([])], logs, getLocalDateStr(), []).current);
  const sessions = [1, 2].map(n => ({ id: 's' + n, date: daysAgo(n), minutes: 40, subjectId: 's1' }));
  assert.equal(profileStreak([subject([])], [], sessions), engine([subject([])], [], getLocalDateStr(), sessions).current);
});

test('getDayStudyStats = minutes from the shared engine + topics completed that day', async () => {
  const { getDayStudyStats, getEffectiveDayMinutes } = await loadTs('src/lib/utils.ts');
  const d = daysAgo(2);
  const subs = [subject([topic({ completed: true, completedDate: d, timeSpent: 45, timeEntries: [{ id: 'x', date: d, minutes: 45 }] }), topic({ timeSpent: 20, timeEntries: [{ id: 'y', date: d, minutes: 20 }] })])];
  const s = getDayStudyStats(subs, [], d, []);
  assert.equal(s.topics, 1);
  assert.equal(s.mins, Math.round(getEffectiveDayMinutes(subs, [], d, [])));
  assert.equal(s.mins, 65);
});

test('getSubjectStudyMinutes: sessions + only the topic time they do not already cover', async () => {
  const { getSubjectStudyMinutes } = await loadTs('src/lib/utils.ts');
  const subj = { id: 's1', units: [{ timeSpent: 10, subTopics: [{ timeSpent: 60 }, { timeSpent: 30 }] }] };
  const all = new Map([['s1', 50]]);
  const overlap = new Map([['s1', 40]]);
  assert.equal(getSubjectStudyMinutes(subj, all, overlap), 50 + (100 - 40));
  assert.equal(getSubjectStudyMinutes(subj, new Map(), new Map()), 100);
});

test('streak rules: a rest day neither counts nor breaks; minimum minutes raises the bar', async () => {
  const { computeStreak: engine } = await loadTs('src/hooks/useStreak.ts');
  const { getLocalDateStr } = await loadTs('src/lib/utils.ts');
  const subs = [subject([topic({ timeSpent: 120, timeEntries: entries([1, 2, 4, 5]) })])];
  const weekdayOf3 = new Date(daysAgo(3) + 'T12:00:00').getDay();
  const today = getLocalDateStr();
  assert.equal(engine(subs, [], today, [], { minMinutes: 1, restDays: [] }).current, 2);
  assert.equal(engine(subs, [], today, [], { minMinutes: 1, restDays: [weekdayOf3] }).current, 4);
  assert.equal(engine(subs, [], today, [], { minMinutes: 45, restDays: [] }).current, 0, '30-minute days do not reach a 45-minute bar');
  assert.equal(engine(subs, [], today, [], { minMinutes: 30, restDays: [] }).current, 2);
});

test('streak rules: best streak bridges rest-day gaps too', async () => {
  const { computeStreak: engine } = await loadTs('src/hooks/useStreak.ts');
  const { getLocalDateStr } = await loadTs('src/lib/utils.ts');
  const subs = [subject([topic({ timeSpent: 120, timeEntries: entries([10, 11, 13, 14]) })])];
  const wd = new Date(daysAgo(12) + 'T12:00:00').getDay();
  assert.equal(engine(subs, [], getLocalDateStr(), [], { minMinutes: 1, restDays: [] }).best, 2);
  assert.equal(engine(subs, [], getLocalDateStr(), [], { minMinutes: 1, restDays: [wd] }).best, 4);
});
