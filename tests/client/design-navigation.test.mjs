import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorkpieceNavigation } from '../../client/webxr/src/design/navigation.js';

test('two grips scale around their midpoint, releasing one grip does not jump', () => {
  const stage = new THREE.Group(); stage.position.set(0, 1, -1); stage.scale.setScalar(.2);
  const a = new THREE.Group(), b = new THREE.Group();
  a.position.set(-.2, 1, -1); b.position.set(.2, 1, -1);
  const nav = new WorkpieceNavigation(stage), grips = new Map([['a', a], ['b', b]]);
  nav.update(grips);
  a.position.x = -.4; b.position.x = .4; nav.update(grips);
  assert(Math.abs(stage.scale.x - .4) < 1e-10);
  const before = stage.position.clone(); grips.delete('b'); nav.update(grips);
  assert(stage.position.distanceTo(before) < 1e-10);
  a.position.y += .3; nav.update(grips);
  assert(Math.abs(stage.position.y - 1.3) < 1e-10);
});

test('grip rotation preserves distance to grab point and tracking reset stops changes', () => {
  const stage = new THREE.Group(); stage.position.set(1, 0, 0);
  const hand = new THREE.Group(), nav = new WorkpieceNavigation(stage), grips = new Map([['hand', hand]]);
  nav.update(grips); hand.rotation.z = Math.PI / 2; nav.update(grips);
  assert(stage.position.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-10);
  grips.clear(); nav.update(grips); const before = stage.position.clone();
  hand.position.x = 5; nav.update(grips);
  assert(stage.position.equals(before));
});
