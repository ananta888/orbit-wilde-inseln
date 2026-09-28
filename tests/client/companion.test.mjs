import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { CompanionMotion } from '../../client/webxr/src/rendering/companion-motion.js';
import { DragonAnimation, groundOffset } from '../../client/webxr/src/rendering/dragon-animation.js';
import { dragonFixture } from './helpers/dragon-fixture.mjs';

const floor = () => 1, dt = 1 / 60;
test('companion stands beside the player and does not orbit when only the head turns', () => {
  const motion = new CompanionMotion(), player = new T.Vector3(0, 1, 0);
  motion.update(dt, player, 0, false, floor);
  const start = motion.position.clone(); assert(start.distanceTo(player) > 5);
  for (let i = 0; i < 180; i++) motion.update(dt, player, i / 60, false, floor);
  assert.deepEqual(motion.position, start); assert.equal(motion.speed, 0);
  assert.deepEqual(player.toArray(), [0, 1, 0]);
});
test('companion follows translation with bounded speed and settles when the player stops', () => {
  const motion = new CompanionMotion(), player = new T.Vector3(0, 1, 0);
  motion.update(dt, player, 0, false, floor);
  for (let i = 0; i < 600; i++) {
    player.z -= 2 * dt; const before = motion.position.clone();
    motion.update(dt, player, 0, false, floor);
    assert(motion.position.distanceTo(before) <= 4.6 * dt + 1e-8);
  }
  assert(motion.position.z < -18); assert(motion.position.distanceTo(player) < 8);
  for (let i = 0; i < 600; i++) motion.update(dt, player, 0, false, floor);
  assert(motion.speed < .01); assert.equal(motion.walking, false);
  // Walking changes position without a server velocity; the follow slot still turns.
  for (let i = 0; i < 240; i++) { player.x += 2 * dt; motion.update(dt, player, 0, false, floor); }
  assert(Math.abs(motion.followHeading + Math.PI / 2) < .01);
});
test('missing terrain, water and cliffs stop following; landing starts by the current island', () => {
  const motion = new CompanionMotion(), player = new T.Vector3(0, 1, 0);
  motion.update(dt, player, 0, false, () => null); assert.equal(motion.ready, false);
  motion.update(dt, player, 0, false, () => -.2); assert.equal(motion.ready, false);
  motion.update(dt, player, 0, false, floor);
  const start = motion.position.clone(); player.z = -9;
  const cliff = (x, z) => z < -5 ? 8 : 1;
  for (let i = 0; i < 600; i++) motion.update(dt, player, 0, false, cliff);
  assert(motion.position.z > -5, 'Do not cross a cliff as if it were a ramp');
  assert(motion.position.distanceTo(start) < 5);
  motion.update(dt, player, 0, true, floor); player.set(300, 1, -250);
  motion.update(dt, player, 0, false, floor);
  assert(motion.ready && motion.position.distanceTo(player) < 7);
});
test('actual CC0 rig blends idle/walk/flight with independent instances and finite joints', async () => {
  const a = await dragonFixture(), b = await dragonFixture();
  const animation = new DragonAnimation(a.root, a.model, a.clips), untouched = new DragonAnimation(b.root, b.model, b.clips);
  const rest = untouched.bones.get('wing_lower_L').quaternion.clone();
  for (let i = 0; i < 240; i++) animation.update(dt, { speed: 2, flight: 0 });
  assert(animation.walkWeight > .99); assert.equal(animation.bones.size, 32);
  for (let i = 0; i < 240; i++) animation.update(dt, { speed: 20, flight: 1, speaking: true, gesture: 'nod' });
  assert(animation.walkWeight < .001); assert(animation.speechWeight > .99);
  assert(untouched.bones.get('wing_lower_L').quaternion.equals(rest));
  for (const bone of animation.bones.values()) {
    assert(Math.abs(bone.quaternion.length() - 1) < 1e-5); assert(bone.quaternion.toArray().every(Number.isFinite));
  }
  for (let i = 0; i < 240; i++) animation.update(dt, { speed: 0, flight: 0, speaking: false });
  assert(animation.speechWeight < .001); assert.equal(animation.idle.getEffectiveWeight() + animation.walk.getEffectiveWeight(), 1);
});
test('sparse animation channels do not accumulate gestures; ground support survives parent transforms', async () => {
  const root = new T.Group(), model = new T.Group(), neck = new T.Bone(); neck.name = 'neck2'; root.add(model); model.add(neck);
  const animation = new DragonAnimation(root, model, [new T.AnimationClip('idle', 1, [])]);
  for (let i = 0; i < 1000; i++) animation.update(dt, { flight: 0, attention: .3 });
  assert(neck.quaternion.angleTo(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), .3)) < 1e-6);
  animation.update(dt, { flight: 0 }); assert(neck.quaternion.angleTo(new T.Quaternion()) < 1e-6);
  const fixture = await dragonFixture(); new DragonAnimation(fixture.root, fixture.model, fixture.clips);
  const before = groundOffset(fixture.model, fixture.root); assert(before > 2 && before < 3);
  fixture.root.position.set(20, 15, -10); fixture.root.rotation.set(.3, .5, .2); fixture.root.scale.setScalar(2);
  assert(Math.abs(groundOffset(fixture.model, fixture.root) - before) < 1e-5);
});
