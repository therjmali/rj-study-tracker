import test from 'node:test';
import assert from 'node:assert/strict';
import { jankRatio, windowIsJanky, shouldUseLite, liteReason } from '../src/platform/perfLogic.mjs';

test('jank ratio ignores pauses and junk values', () => {
  assert.equal(jankRatio([]), 0);
  assert.equal(jankRatio([16, 16, 16, 16]), 0);
  assert.equal(jankRatio([16, 40, 16, 40]), 0.5);
  assert.equal(jankRatio([16, 900, 16, NaN, -4]), 0);          // tab was hidden for 900 ms: not jank
});

test('a window needs enough frames AND a high share of slow ones', () => {
  const smooth = Array(60).fill(16);
  const stutter = Array(60).fill(0).map((_, i) => (i % 2 ? 45 : 16));
  assert.equal(windowIsJanky(smooth), false);
  assert.equal(windowIsJanky(stutter), true);
  assert.equal(windowIsJanky(Array(10).fill(80)), false);        // 10 frames is not evidence
});

test('modes decide as documented', () => {
  assert.equal(shouldUseLite({ mode: 'smooth' }), true);
  assert.equal(shouldUseLite({ mode: 'full', autoLite: true, saveData: true, deviceMemory: 1 }), false);
  assert.equal(shouldUseLite({ mode: 'auto' }), false);
  assert.equal(shouldUseLite({ mode: 'auto', autoLite: true }), true);
  assert.equal(shouldUseLite({ mode: 'auto', saveData: true }), true);
  assert.equal(shouldUseLite({ mode: 'auto', reducedMotion: true }), true);
  assert.equal(shouldUseLite({ mode: 'auto', deviceMemory: 2 }), true);
  assert.equal(shouldUseLite({ mode: 'auto', deviceMemory: 8, cores: 8 }), false);
  assert.equal(shouldUseLite({ mode: 'auto', cores: 2 }), true);
  assert.equal(shouldUseLite(undefined), false);
});

test('the reason matches the cause', () => {
  assert.equal(liteReason({ mode: 'full' }), null);
  assert.match(liteReason({ mode: 'smooth' }), /chose Smooth/);
  assert.match(liteReason({ mode: 'auto', autoLite: true }), /dropping frames/);
  assert.match(liteReason({ mode: 'auto', saveData: true }), /Data-saver/);
});
