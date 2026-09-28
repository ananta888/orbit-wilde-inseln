import * as THREE from 'three';

const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

/** Authored skeletal clips, with bounded additive gestures and a separate flight pose. */
export class DragonAnimation {
  constructor(root, model, clips) {
    Object.assign(this, { root, model, clips }); this.bones = new Map(); this.overlay = new Map();
    model.traverse(object => { if (object.isBone) this.bones.set(object.name, object); });
    this.mixer = new THREE.AnimationMixer(model);
    const idle = clips.find(c => c.name === 'idle');
    if (!idle) throw Error('Arin benötigt einen Standclip');
    this.idle = this.mixer.clipAction(idle).play();
    const walk = clips.find(c => c.name === 'walk');
    this.walk = walk ? this.mixer.clipAction(walk).setEffectiveWeight(0).play() : null;
    this.time = 0; this.walkWeight = 0; this.speechWeight = 0; this.mixer.update(0);
  }
  remember(bone) { if (!this.overlay.has(bone)) this.overlay.set(bone, bone.quaternion.clone()); }
  rotate(name, axis, angle) {
    const bone = this.bones.get(name); if (!bone || !angle) return;
    this.remember(bone); bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
  }
  aim(name, direction, weight) {
    const bone = this.bones.get(name); if (!bone || weight < 1e-5) return;
    this.remember(bone); this.root.updateWorldMatrix(true, true);
    const world = bone.getWorldQuaternion(new THREE.Quaternion());
    const current = Y.clone().applyQuaternion(world);
    const desired = direction.normalize().applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    const delta = new THREE.Quaternion().setFromUnitVectors(current, desired);
    const target = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(delta).multiply(world);
    bone.quaternion.slerp(target, weight);
  }
  update(dt, { speed = 0, climbing = 0, flight = 1, gesture = 'glide', speaking = false, attention = 0 } = {}) {
    dt = THREE.MathUtils.clamp(dt, 0, .05); flight = THREE.MathUtils.clamp(flight, 0, 1);
    // Restore the last authored pose before mixing; sparse tracks must not accumulate overlays.
    for (const [bone, rotation] of this.overlay) bone.quaternion.copy(rotation);
    this.overlay.clear(); this.time += dt;
    const targetWalk = this.walk && speed > .08 ? (1 - flight) * THREE.MathUtils.clamp(speed / .6, 0, 1) : 0;
    this.walkWeight = THREE.MathUtils.damp(this.walkWeight, targetWalk, 8, dt);
    this.idle.setEffectiveWeight(1 - this.walkWeight);
    this.walk?.setEffectiveWeight(this.walkWeight).setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 1.8, .35, 2.5));
    this.mixer.update(dt);
    const flap = Math.sin(this.time * (climbing > .2 ? 6.5 : 3.8)) * (speed > 12 && climbing < .2 ? .10 : .42);
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      this.aim('wing_lower_' + suffix, new THREE.Vector3(side, .15 + flap, .04), flight);
      this.aim('wing_upper_' + suffix, new THREE.Vector3(side, -.05 + flap * .65, .35), flight);
    }
    this.aim('neck1', new THREE.Vector3(0, .16, -1), flight);
    this.aim('neck2', new THREE.Vector3(0, .09, -1), flight);
    this.aim('neck3', new THREE.Vector3(0, .03, -1), flight);
    const glance = gesture === 'look_around' ? Math.sin(this.time * .7) * .16 : 0;
    this.rotate('neck2', Y, glance + THREE.MathUtils.clamp(attention, -.35, .35) * (1 - flight));
    if (gesture === 'nod') this.rotate('neck3', X, Math.sin(this.time * 3) * .08);
    this.speechWeight = THREE.MathUtils.damp(this.speechWeight, speaking ? 1 : 0, 12, dt);
    this.rotate('jaw_lower', X, (Math.sin(this.time * 18) * .045 + .055) * this.speechWeight);
  }
}

/** Rest-pose support height in a parent's coordinates, including skin deformation. */
export function groundOffset(model, parent) {
  parent.updateWorldMatrix(true, false);
  // SkinnedMesh updates its bindMatrixInverse in updateMatrixWorld, not updateWorldMatrix.
  parent.updateMatrixWorld(true);
  const inverse = parent.matrixWorld.clone().invert(), bounds = new THREE.Box3();
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (mesh.isSkinnedMesh) { mesh.skeleton.update(); mesh.computeBoundingBox(); }
    else if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = (mesh.isSkinnedMesh ? mesh.boundingBox : mesh.geometry.boundingBox).clone();
    box.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld)); bounds.union(box);
  });
  return bounds.isEmpty() ? .7 : Math.max(0, -bounds.min.y) + .02;
}
