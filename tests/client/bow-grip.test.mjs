import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { handFixture } from './helpers/hand-fixture.mjs';
import { BOW_GRIP_RADIUS, BOW_GRIP_LENGTH, trackedBowGrip } from '../../client/webxr/src/xr/hand-pose.js';

for (const side of ['left', 'right']) {
  test(`${side} actual hand surface clears the handle; fingers wrap without stretching bones`, async () => {
    const skin = await handFixture(side), grip = new T.Group(); grip.add(skin.root);
    grip.position.set(3, 1.5, -4); grip.rotation.set(.7, -.9, .3);
    for (let i = 0; i < 180; i++) skin.pose(1 / 60, null, 'bow', false);
    grip.updateMatrixWorld(true); const inverse = grip.matrixWorld.clone().invert();
    let samples = 0, minimum = Infinity;
    function clearance(point) {
      if (Math.abs(point.y) >= BOW_GRIP_LENGTH / 2) return;
      samples++; const distance = Math.hypot(point.x, point.z); minimum = Math.min(minimum, distance);
      assert(distance > BOW_GRIP_RADIUS + .0012, `Skin intersects handle/wrapping: ${distance}`);
    }
    skin.object.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      mesh.skeleton.update(); const geometry = mesh.geometry, points = [];
      for (let i = 0; i < geometry.attributes.position.count; i++) {
        const p = mesh.getVertexPosition(i, new T.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
        points.push(p); clearance(p);
      }
      for (let i = 0; i < geometry.index.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map(j => points[geometry.index.getX(i + j)]);
        clearance(a.clone().lerp(b, .5)); clearance(b.clone().lerp(c, .5)); clearance(c.clone().lerp(a, .5));
        clearance(a.clone().add(b).add(c).multiplyScalar(1 / 3));
      }
    });
    assert(samples > 2000); assert(minimum < BOW_GRIP_RADIUS + .004, 'The hand must hold the handle, not float far away');
    for (const finger of ['index', 'middle', 'ring', 'pinky']) {
      const chain = [`${finger}-finger-phalanx-proximal`, `${finger}-finger-phalanx-intermediate`, `${finger}-finger-phalanx-distal`, `${finger}-finger-tip`];
      for (let i = 1; i < chain.length; i++) {
        const a = skin.bones.get(chain[i - 1]), b = skin.bones.get(chain[i]);
        const expected = skin.rest.get(chain[i - 1]).position.distanceTo(skin.rest.get(chain[i]).position);
        assert(Math.abs(a.position.distanceTo(b.position) - expected) < 1e-6, 'Do not stretch fingers onto the handle');
      }
    }
    const sign = side === 'left' ? 1 : -1;
    const palm = skin.bones.get('wrist').getWorldPosition(new T.Vector3()).applyMatrix4(inverse);
    const tip = skin.bones.get('middle-finger-tip').getWorldPosition(new T.Vector3()).applyMatrix4(inverse);
    assert(palm.x * sign < -.03 && tip.x * sign > .02, 'Palm and fingertips must enclose opposite sides');
  });

  test(`${side} tracked grip uses palm landmarks, leaves joints untouched, rejects missing/degenerate data`, async () => {
    const skin = await handFixture(side), hand = new T.Group(); hand.joints = {};
    for (const [name, rest] of skin.rest) {
      const joint = new T.Group(); joint.position.copy(rest.position); joint.quaternion.copy(rest.quaternion);
      hand.joints[name] = joint; hand.add(joint);
    }
    hand.position.set(-2, 3, 1); hand.rotation.set(.3, .5, -.2); hand.updateMatrixWorld(true);
    const snapshot = [...hand.children].map(joint => [...joint.position.toArray(), ...joint.quaternion.toArray()]);
    const position = new T.Vector3(), quaternion = new T.Quaternion();
    assert(trackedBowGrip(hand, side, position, quaternion));
    const local = hand.worldToLocal(position.clone());
    assert(local.y < hand.joints['middle-finger-phalanx-proximal'].position.y - .03);
    const across = hand.joints['index-finger-phalanx-proximal'].getWorldPosition(new T.Vector3())
      .sub(hand.joints['pinky-finger-phalanx-proximal'].getWorldPosition(new T.Vector3())).normalize();
    assert(new T.Vector3(0, 1, 0).applyQuaternion(quaternion).dot(across) > .9999);
    assert(Math.abs(quaternion.length() - 1) < 1e-6);
    assert.deepEqual([...hand.children].map(joint => [...joint.position.toArray(), ...joint.quaternion.toArray()]), snapshot);
    const before = position.clone();
    hand.joints['pinky-finger-phalanx-proximal'].visible = false;
    assert.equal(trackedBowGrip(hand, side, position, quaternion), false); assert(position.equals(before));
    hand.joints['pinky-finger-phalanx-proximal'].visible = true;
    for (const joint of hand.children) joint.position.set(0, 0, 0);
    assert.equal(trackedBowGrip(hand, side, position, quaternion), false);
    hand.joints.wrist.position.x = NaN;
    assert.equal(trackedBowGrip(hand, side, position, quaternion), false);
  });
}
