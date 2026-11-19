import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs, closeLoader } from './_load.mjs';

after(closeLoader);
const subj = (id, folderId, order) => ({ id, name: id, shortName: id, color: '#000', folderId, order, units: [] });

test('reorderSubjectGroup: rewrites one group inside its own slots and leaves everyone else untouched', async () => {
  const { reorderSubjectGroup } = await loadTs('src/lib/reorder.ts');
  const list = [subj('a', 'f1', 0), subj('r1', undefined, 0), subj('b', 'f1', 1), subj('r2', undefined, 1), subj('c', 'f1', 2)];
  const out = reorderSubjectGroup(list, ['c', 'a', 'b']);
  assert.deepEqual(out.map(s => s.id), ['c', 'r1', 'a', 'r2', 'b'], 'folder subjects keep their slots, others do not move');
  assert.deepEqual(out.filter(s => s.folderId === 'f1').map(s => [s.id, s.order]), [['c', 0], ['a', 1], ['b', 2]]);
  assert.strictEqual(out[1], list[1], 'untouched subjects are the same objects');
});

test('reorderSubjectGroup: invalid input changes nothing', async () => {
  const { reorderSubjectGroup } = await loadTs('src/lib/reorder.ts');
  const list = [subj('a', undefined, 0), subj('b', undefined, 1)];
  assert.strictEqual(reorderSubjectGroup(list, ['a', 'zzz']), list);
  assert.strictEqual(reorderSubjectGroup(list, ['a', 'a']), list);
});

test('reorderFolderIds: listed folders get 0..n-1, unlisted ones follow', async () => {
  const { reorderFolderIds } = await loadTs('src/lib/reorder.ts');
  const f = [{ id: 'x', order: 0 }, { id: 'y', order: 1 }, { id: 'z', order: 2 }];
  assert.deepEqual(reorderFolderIds(f, ['z', 'x', 'y']).map(o => [o.id, o.order]), [['z', 0], ['x', 1], ['y', 2]]);
  assert.deepEqual(reorderFolderIds(f, ['y']).map(o => [o.id, o.order]), [['y', 0], ['x', 1], ['z', 2]]);
});
