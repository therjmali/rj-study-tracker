import test from 'node:test';
import assert from 'node:assert/strict';
import { averageHash, hammingHex, isSameImage } from '../src/lib/imageSimilarityLogic.mjs';

const grad = (f) => Array.from({ length: 64 }, (_, i) => f(i % 8, Math.floor(i / 8)));

test('hash is 16 hex chars and stable', () => {
  const g = grad((x, y) => x * 30 + y * 5);
  const h = averageHash(g);
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(averageHash(g), h);
  assert.equal(averageHash([1, 2, 3]), null);
});

test('same picture (slightly different crop / brightness) is recognised', () => {
  const a = averageHash(grad((x, y) => x * 30 + y * 5));
  const b = averageHash(grad((x, y) => x * 30 + y * 5 + (x === 3 && y === 3 ? 40 : 6)));
  assert.ok(hammingHex(a, b) <= 8);
  assert.equal(isSameImage(a, b), true);
});

test('different pictures are not merged', () => {
  const a = averageHash(grad((x) => x * 30));
  const b = averageHash(grad((x, y) => (x + y) % 2 === 0 ? 220 : 20));   // checkerboard
  assert.ok(hammingHex(a, b) > 8);
  assert.equal(isSameImage(a, b), false);
  assert.equal(isSameImage(null, a), false);
  assert.equal(hammingHex('abc', 'abcd'), 64);
});
