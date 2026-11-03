/**
 * Tests for the three-way merge that powers multi-device sync.
 *
 * The module is TypeScript, so it is transpiled on the fly with the project's
 * own TypeScript install — no extra tooling and no duplicated logic in the tests.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
let mergeThreeWay;
let deepEqual;

before(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rj-merge-'));
  const outfile = path.join(dir, 'merge3.mjs');
  const source = await fs.readFile(path.join(repoRoot, 'src/platform/cloud/merge3.ts'), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  await fs.writeFile(outfile, js, 'utf8');
  const mod = await import(outfile);
  mergeThreeWay = mod.mergeThreeWay;
  deepEqual = mod.deepEqual;
});

const topic = (overrides = {}) => ({
  id: 't1', name: 'Cell structure', completed: false, status: 'incomplete',
  notes: '', difficulty: 'Medium', timeSpent: 0, important: false, ...overrides,
});

const state = (topics, extra = {}) => ({
  subjects: [{ id: 's1', name: 'Anatomy', units: [{ id: 'u1', name: 'Unit 1', subTopics: topics }] }],
  dailyLogs: [],
  ...extra,
});

test('independent edits on two devices are both kept', () => {
  const base = state([topic()]);
  const local = state([topic({ completed: true, status: 'complete', completedDate: '2026-11-01' })]);
  const remote = state([topic({ notes: 'Read page 40', important: true })]);
  const { value, conflictCount } = mergeThreeWay(base, local, remote);
  const merged = value.subjects[0].units[0].subTopics[0];
  assert.equal(merged.completed, true);
  assert.equal(merged.completedDate, '2026-11-01');
  assert.equal(merged.notes, 'Read page 40');
  assert.equal(merged.important, true);
  assert.equal(conflictCount, 0);
});

test('identical edits on both devices do not create a conflict', () => {
  const base = state([topic()]);
  const local = state([topic({ completed: true })]);
  const remote = state([topic({ completed: true })]);
  const { conflictCount } = mergeThreeWay(base, local, remote);
  assert.equal(conflictCount, 0);
});

test('only the remote side changing a value wins (un-completing a topic)', () => {
  const base = state([topic({ completed: true })]);
  const local = state([topic({ completed: true })]);
  const remote = state([topic({ completed: false })]);
  const { value, conflictCount } = mergeThreeWay(base, local, remote);
  assert.equal(value.subjects[0].units[0].subTopics[0].completed, false);
  assert.equal(conflictCount, 0);
});

test('a real disagreement keeps this device value and records the conflict', () => {
  const base = state([topic({ difficulty: 'Medium' })]);
  const local = state([topic({ difficulty: 'Hard' })]);
  const remote = state([topic({ difficulty: 'Easy' })]);
  const { value, conflicts } = mergeThreeWay(base, local, remote);
  assert.equal(value.subjects[0].units[0].subTopics[0].difficulty, 'Hard');
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].resolution, 'local');
  assert.equal(conflicts[0].remote, 'Easy');
});

test('subjects and topics added on both devices are unioned', () => {
  const base = { subjects: [{ id: 's1', name: 'Anatomy', units: [] }] };
  const local = {
    subjects: [
      { id: 's1', name: 'Anatomy', units: [] },
      { id: 's2', name: 'Physiology', units: [{ id: 'u9', name: 'Renal', subTopics: [] }] },
    ],
  };
  const remote = {
    subjects: [
      { id: 's1', name: 'Anatomy', units: [] },
      { id: 's3', name: 'Nutrition', units: [] },
    ],
  };
  const { value } = mergeThreeWay(base, local, remote);
  assert.deepEqual(value.subjects.map(s => s.id), ['s1', 's2', 's3']);
});

test('a subject deleted on one device disappears when the other did not touch it', () => {
  const base = { subjects: [{ id: 's1', name: 'Anatomy' }, { id: 's2', name: 'Physiology' }] };
  const local = { subjects: [{ id: 's1', name: 'Anatomy' }] }; // deleted s2 here
  const remote = { subjects: [{ id: 's1', name: 'Anatomy' }, { id: 's2', name: 'Physiology' }] };
  const { value } = mergeThreeWay(base, local, remote);
  assert.deepEqual(value.subjects.map(s => s.id), ['s1']);
});

test('a deletion that collides with a remote edit keeps the edit (never lose work)', () => {
  const base = { subjects: [{ id: 's1', name: 'Anatomy', units: [] }, { id: 's2', name: 'Physiology', units: [] }] };
  const local = { subjects: [{ id: 's1', name: 'Anatomy', units: [] }] };
  const remote = { subjects: [{ id: 's1', name: 'Anatomy', units: [] }, { id: 's2', name: 'Physiology (edited)', units: [] }] };
  const { value, conflicts } = mergeThreeWay(base, local, remote);
  assert.deepEqual(value.subjects.map(s => s.id), ['s1', 's2']);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].resolution, 'remote');
});

test('study sessions from two devices are merged by id without duplicates', () => {
  const base = { sessions: [{ id: 'a', minutes: 30 }, { id: 'b', minutes: 20 }] };
  const local = { sessions: [{ id: 'a', minutes: 30 }, { id: 'b', minutes: 20 }, { id: 'c', minutes: 45 }] };
  const remote = { sessions: [{ id: 'a', minutes: 30 }, { id: 'b', minutes: 20 }, { id: 'd', minutes: 15 }] };
  const { value, conflictCount } = mergeThreeWay(base, local, remote);
  assert.deepEqual(value.sessions.map(s => s.id), ['a', 'b', 'c', 'd']);
  assert.equal(conflictCount, 0);
});

test('daily logs are keyed by date', () => {
  const base = { dailyLogs: [{ date: '2026-11-01', hoursStudied: 2 }] };
  const local = { dailyLogs: [{ date: '2026-11-01', hoursStudied: 2 }, { date: '2026-11-02', hoursStudied: 1.5 }] };
  const remote = { dailyLogs: [{ date: '2026-11-01', hoursStudied: 3 }] };
  const { value } = mergeThreeWay(base, local, remote);
  const byDate = Object.fromEntries(value.dailyLogs.map(l => [l.date, l.hoursStudied]));
  assert.deepEqual(byDate, { '2026-11-01': 3, '2026-11-02': 1.5 });
});

test('missing base (first sync) unions everything and does not throw', () => {
  const { value, conflicts } = mergeThreeWay(undefined, { a: 1 }, { b: 2 });
  assert.equal(value.a, 1);
  assert.equal(value.b, 2);
  assert.equal(conflicts.length, 0);
});

test('deepEqual is key-order independent', () => {
  assert.equal(deepEqual({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 }), true);
  assert.equal(deepEqual({ a: 1 }, { a: 2 }), false);
});

test('first sync of a joining device can prefer the account value on a conflict (settings must not be overwritten by defaults)', () => {
  // Fresh device wrote its default "digital"; the account already says "analog"; no common ancestor.
  const prefer = mergeThreeWay(undefined, 'digital', 'analog', 'nursetrack-clock-mode', 'remote');
  assert.equal(prefer.value, 'analog');
  assert.equal(prefer.conflicts[0].resolution, 'remote');
  // Nested settings: conflicting leaf follows the account, local-only leaf is still kept.
  const nested = mergeThreeWay(undefined, { theme: 'default', extra: 1 }, { theme: 'ocean' }, 'settings', 'remote');
  assert.equal(nested.value.theme, 'ocean');
  assert.equal(nested.value.extra, 1);
});

test('normal syncs still keep this device on a conflict', () => {
  const r = mergeThreeWay('a', 'b', 'c', 'k');
  assert.equal(r.value, 'b');
  assert.equal(r.conflicts[0].resolution, 'local');
});
