import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PinchState, Stroke } from '../../client/webxr/src/design/input.js';

test('pinch hysteresis and tracking loss close one transaction', () => {
  const pinch = new PinchState();
  assert.equal(pinch.update(.04, true), null);
  assert.equal(pinch.update(.018, true), 'begin');
  assert.equal(pinch.update(.025, true), 'sample');
  assert.equal(pinch.update(Infinity, false), 'cancel');
  assert.equal(pinch.update(Infinity, false), null);
  assert.equal(pinch.update(.018, true), 'begin');
  assert.equal(pinch.update(.034, true), 'end');
});
test('stroke samples and displacement are bounded', () => {
  const stroke = new Stroke('grab', { region: 'head', point: [0, 1, 0], normal: [0, 1, 0] }, { radius: .2, strength: .5 });
  for (let i = 0; i < 200; i++) stroke.update([i / 10, 1, 0]);
  const command = stroke.operation();
  assert.equal(command.samples.length, 64);
  assert.deepEqual(command.delta, [2, 0, 0]);
  assert.deepEqual(command.regions, ['head']);
});
