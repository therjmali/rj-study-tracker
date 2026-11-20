import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs, closeLoader, daysAgo, topic, subject } from './_load.mjs';

after(closeLoader);
const D0 = daysAgo(0), D1 = daysAgo(1);

/** A day that mixes every kind of study time. */
function world() {
  const a = topic({ id: 'tA', completed: true, completedDate: D0, completedTime: '09:00', timeSpent: 50,
    timeEntries: [{ date: D0, minutes: 30, time: '08:30', status: 'complete' }, { date: D1, minutes: 20, time: '21:00', status: 'complete' }],
    revisions: { R1: { status: 'complete', completedDate: D0, completedTime: '18:10', timeSpent: 25, timeEntries: [{ date: D0, minutes: 25, time: '17:45' }] } } });
  const b = topic({ id: 'tB', completed: false, timeSpent: 10, timeEntries: [{ date: D0, minutes: 10, time: '10:00' }] });
  const unit = { id: 'u1', name: 'U', timeEntries: [{ date: D0, minutes: 5, time: '12:30' }], subTopics: [a, b] };
  const subs = [{ ...subject([a, b]), units: [unit] }];
  const sessions = [
    // the timer's mirror copies of tA's entries — must NOT be counted again
    { id: 's1', date: D0, minutes: 30, type: 'Topic', topicId: 'tA', subjectId: 's1', description: '[Stopwatch] A', startTime: '08:30' },
    { id: 's2', date: D0, minutes: 25, type: 'Topic', topicId: 'tA', subjectId: 's1', description: '[Revision R1 Stopwatch] A', startTime: '17:45' },
    // hand-logged "Add Study Time" sessions: one linked to a topic, one free — both are real study time
    { id: 's3', date: D0, minutes: 40, type: 'Topic', topicId: 'tA', subjectId: 's1', description: '[MCQ] practice set', startTime: '20:00' },
    { id: 's4', date: D0, minutes: 15, type: 'Other', subjectId: '', description: '[Lecture] online class' },
  ];
  return { subs, sessions };
}

test('one engine: day card, breakdown, range total, slices and rhythm agree on the same day', async () => {
  const u = await loadTs('src/lib/utils.ts');
  const sl = await loadTs('src/lib/studySlices.ts');
  const r = await loadTs('src/lib/studyRhythm.ts');
  const { subs, sessions } = world();
  // 30 topic + 10 other topic + 25 revision + 5 unit + 40 MCQ + 15 lecture  (mirrors s1/s2 dropped)
  const expected = 30 + 10 + 25 + 5 + 40 + 15;
  assert.equal(u.getEffectiveDayMinutes(subs, [], D0, sessions), expected);
  const bd = u.getDayStudyBreakdown(subs, D0, sessions, []);
  assert.deepEqual(bd, { topicMins: 45, revisionMins: 25, sessionMins: 55, totalMins: expected });
  const idx = sl.indexStudyDays(subs, [], sessions, { from: D0, to: D0, slices: true });
  const day = idx.get(D0);
  assert.equal(day.total, expected);
  assert.equal(day.slices.reduce((a, s) => a + s.minutes, 0), expected);
  assert.equal(day.mirroredMin, 55);
  assert.equal(u.getEffectiveStudyMinutes(subs, [], D0, D0, sessions), expected);
  const rh = r.computeStudyRhythm(subs, sessions, { from: D0, to: D0 }, []);
  assert.equal(rh.assigned + rh.unassigned, expected);
});

test('a range equals the sum of its days (Hub total = what the day cards add up to)', async () => {
  const u = await loadTs('src/lib/utils.ts');
  const { subs, sessions } = world();
  const days = [D1, D0].reduce((a, d) => a + u.getEffectiveDayMinutes(subs, [], d, sessions), 0);
  assert.equal(u.getEffectiveStudyMinutes(subs, [], D1, D0, sessions), days);
});

test('hand-logged sessions are independent; timer mirrors are not', async () => {
  const sl = await loadTs('src/lib/studySlices.ts');
  assert.equal(sl.isIndependentSession({ description: '[MCQ] set' }), true);
  assert.equal(sl.isIndependentSession({ description: '[Self-Study] notes' }), true);
  assert.equal(sl.isIndependentSession({ description: '[Stopwatch] topic' }), false);
  assert.equal(sl.isIndependentSession({ description: '[Revision R2 Countdown] topic' }), false);
  assert.equal(sl.isIndependentSession({ description: 'legacy text' }), false);
  assert.equal(sl.sessionActivity('[MCQ] x'), 'MCQ');
});

test('trend "studied" vs "completed" topics are both derived from the same rules', async () => {
  const a = await loadTs('src/lib/topicActivity.ts');
  const { subs } = world();
  const [t1, t2] = subs[0].units[0].subTopics;
  assert.equal(a.topicTouchedOn(t1, D0), true);
  assert.equal(a.topicTouchedOn(t2, D0), true);   // studied, not completed
  assert.equal(a.completionsOn(t2, D0), 0);
  assert.equal(a.completionsOn(t1, D0), 2);        // main completion + R1 revision
});
