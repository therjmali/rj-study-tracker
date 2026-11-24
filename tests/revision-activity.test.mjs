import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs, closeLoader, daysAgo, topic, subject } from './_load.mjs';

after(closeLoader);
const D0 = daysAgo(0), D1 = daysAgo(1);

const withRev = () => topic({
  id: 'tA', completed: true, completedDate: D1, timeSpent: 30,
  timeEntries: [{ date: D1, minutes: 30, status: 'complete' }],
  revisions: {
    R1: { status: 'complete', completedDate: D0, completedTime: '05:25', timeSpent: 25, timeEntries: [{ date: D0, minutes: 25 }] },
    R2: { status: 'in_process', timeSpent: 10, timeEntries: [{ date: D0, minutes: 10 }] },
  },
});

test('revision completions and minutes are first-class activity', async () => {
  const a = await loadTs('src/lib/topicActivity.ts');
  const t = withRev();
  assert.equal(a.completionsOn(t, D1), 1);            // main completion
  assert.equal(a.completionsOn(t, D0), 1);            // R1 done today
  assert.equal(a.revisionCompletionsOn(t, D0), 1);
  assert.equal(a.completionsInRange(t, D1, D0), 2);
  assert.equal(a.revisionMinutes(t), 35);
  assert.equal(a.revisionMinutesOn(t, D0), 35);
  assert.equal(a.completionsOn(topic(), D0), 0);       // tolerant of topics without revisions
});

test('day minutes = main study time + revision study time, topics include revision rounds', async () => {
  const u = await loadTs('src/lib/utils.ts');
  const subs = [subject([withRev()])];
  assert.equal(u.getEffectiveDayMinutes(subs, [], D0, []), 35);
  assert.equal(u.getEffectiveDayMinutes(subs, [], D1, []), 30);
  assert.equal(u.getDayStudyStats(subs, [], D0, []).topics, 1);
  assert.equal(u.getTotalTopicMinutes(subs), 65);
});

test('a revision timer session is not counted twice against its own db session', async () => {
  const u = await loadTs('src/lib/utils.ts');
  const subs = [subject([withRev()])];
  const sess = [{ id: 's', date: D0, minutes: 25, type: 'Topic', topicId: 'tA', subjectId: 's1' }];
  assert.equal(u.getEffectiveDayMinutes(subs, [], D0, sess), 35);
});

test('revision activity keeps the streak alive', async () => {
  const a = await loadTs('src/lib/topicActivity.ts');
  const dates = new Set();
  a.addActivityDates(withRev(), dates);
  assert.deepEqual([...dates].sort(), [D1, D0].sort());
});

test('last activity = newest completion / study / revision in the subject (widget deep link)', async () => {
  const a = await loadTs('src/lib/topicActivity.ts');
  const t1 = topic({ id: 'a', name: 'Old', completed: true, completedDate: D1, completedTime: '10:00', timeEntries: [] });
  const t2 = topic({ id: 'b', name: 'Revised today', completed: true, completedDate: D1, timeEntries: [],
    revisions: { R1: { status: 'complete', completedDate: D0, completedTime: '07:30', timeSpent: 10, timeEntries: [{ date: D0, minutes: 10, time: '07:00' }] } } });
  const t3 = topic({ id: 'c', name: 'Studied later today', completed: false, timeEntries: [{ date: D0, minutes: 20, time: '21:15' }] });
  const sub = { units: [{ id: 'u1', subTopics: [t1, t2] }, { id: 'u2', subTopics: [t3] }] };
  const last = a.getLastActivity(sub);
  assert.equal(last.topicId, 'c');
  assert.equal(last.unitId, 'u2');
  assert.equal(last.kind, 'studied');
  assert.equal(a.getLastActivity({ units: [{ id: 'u', subTopics: [topic({ id: 'x', name: 'None' })] }] }), undefined);
});
