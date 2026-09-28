import test from 'node:test';
import assert from 'node:assert/strict';
import { PinchGate, SelectionGate, ActionSequence } from '../../client/webxr/src/xr/gestures.js';
const a = { key: 'button:a:revision1' }, b = { key: 'button:b:revision1' };
test('pinch requires an open hand after tracking loss, with distinct release threshold', () => {
  const gate = new PinchGate();
  assert.equal(gate.update(.01), null);
  gate.update(.05); assert.equal(gate.update(.018), 'press');
  assert.equal(gate.update(.027), null); assert.equal(gate.update(.01, false), 'cancel');
  assert.equal(gate.update(.01), null); gate.update(.05);
  assert.equal(gate.update(.01), 'press'); assert.equal(gate.update(.04), 'release');
  assert.equal(gate.update(.04), null);
});
test('UI activates once on matching release, never after drag-off, layout change or cancellation', () => {
  const gate = new SelectionGate();
  gate.press(a); assert.equal(gate.release(b, 500), null);
  gate.press(a); assert.equal(gate.release({ key: 'button:a:revision2' }, 600), null);
  gate.press(a); gate.reset(); assert.equal(gate.release(a, 700), null);
  gate.press(a); assert.equal(gate.release(a, 800), a); assert.equal(gate.release(a, 850), null);
  gate.press(a); assert.equal(gate.release(a, 900), null);
  gate.press(a); assert.equal(gate.release(a, 1200), a);
});
test('direct touch needs approach then withdrawal before another activation', () => {
  const gate = new SelectionGate();
  assert.equal(gate.touch(a, .001, 0), null);
  assert.equal(gate.touch(a, .025, 100), null);
  assert.equal(gate.touch(a, .002, 200), a);
  assert.equal(gate.touch(a, -.001, 1000), null);
  gate.touch(a, .018, 1050); assert.equal(gate.touch(a, .001, 1100), a);
  gate.reset(); assert.equal(gate.touch(a, -.003, 1800), null);
});

test('native select completes once; a bare selectend cancels even with tracking', () => {
  const sequence = new ActionSequence(); sequence.begin();
  assert.equal(sequence.end(true), false);
  sequence.begin(); assert.equal(sequence.select(), true); assert.equal(sequence.select(), false);
  assert.equal(sequence.end(true), false);
});
test('early-select emulator ordering still waits for release and rejects disconnection', () => {
  const sequence = new ActionSequence(); assert.equal(sequence.select(), false); sequence.begin();
  assert.equal(sequence.end(), true); assert.equal(sequence.end(), false);
  sequence.select(); sequence.begin(); assert.equal(sequence.end(false), false);
});
