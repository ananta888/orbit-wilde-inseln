import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { solveTwoBone, gaitSample } from '../../client/webxr/src/rendering/kinematics.js';
const close = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test('two-bone IK preserves limb lengths for crouch, overreach and degenerate poles', () => {
  const hip = new Vector3(4, 2, -3);
  for (const offset of [new Vector3(), new Vector3(0, -1, 0), new Vector3(.1, -.5, .2), new Vector3(0, -.01, 0)]) {
    for (const pole of [new Vector3(0, 0, 1), new Vector3(0, -1, 0)]) {
      const result = solveTwoBone(hip, hip.clone().add(offset), pole, .43, .35);
      close(hip.distanceTo(result.joint), .43); close(result.joint.distanceTo(result.target), .35);
      assert(result.joint.toArray().every(Number.isFinite));
    }
  }
});
test('gait contact counteracts forward travel; opposite biped foot lifts in swing', () => {
  const stride = .5, duty = .64;
  const start = gaitSample(.1, stride, .12, duty), end = gaitSample(.2, stride, .12, duty);
  assert(start.contact && end.contact); close(start.lift, 0); close(end.forward - start.forward, -.1 / duty * stride);
  assert(gaitSample(.8, stride, .12, duty).lift > .1);
  assert(!gaitSample(.8, stride, .12, duty).contact);
  close(gaitSample(1, stride, .12).forward, gaitSample(0, stride, .12).forward);
});
