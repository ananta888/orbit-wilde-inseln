import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

// The handle and the authored controller fist share one physical grip surface.
export const BOW_GRIP_RADIUS = .0145;
export const BOW_GRIP_LENGTH = .135;
const palmClearance = BOW_GRIP_RADIUS + .0255;

const fingers = {
  thumb: ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  index: ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  middle: ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  ring: ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  pinky: ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
};

function gripCurlAngles(rest, chain, center) {
  // Each finger has different phalanx lengths and a different knuckle setback.
  // Wrap its bone chords around the handle plus skin padding for the bundled
  // profile. Tangent segments preserve length and do not cross the handle.
  const lengths = chain.slice(2).map((name, i) => {
    const delta = rest.get(name).position.clone().sub(rest.get(chain[i + 1]).position);
    return Math.hypot(delta.y, delta.z);
  });
  const clearance = BOW_GRIP_RADIUS + .013;
  let point = rest.get(chain[1]).position.clone().sub(center), previous = 0;
  return lengths.map((length, i) => {
    const distance = Math.hypot(point.y, point.z);
    const tangent = Math.sqrt(Math.max(0, distance ** 2 - clearance ** 2));
    const radius = Math.hypot(clearance, length - tangent);
    const arc = Math.acos(Math.min(1, clearance / distance))
      + Math.sign(length - tangent) * Math.acos(Math.min(1, clearance / radius));
    const phase = Math.atan2(point.z, point.y) - arc;
    const next = new THREE.Vector3(0, Math.cos(phase) * radius, Math.sin(phase) * radius);
    const delta = rest.get(chain[i + 2]).position.clone().sub(rest.get(chain[i + 1]).position);
    let angle = Math.atan2(next.z - point.z, next.y - point.y) - Math.atan2(delta.z, delta.y);
    while (angle > previous + Math.PI) angle -= 2 * Math.PI;
    while (angle < previous - Math.PI) angle += 2 * Math.PI;
    point = next; previous = angle;
    return angle;
  });
}

/** Independent skin instance: XR joints are copied; controller poses are authored. */
export class HandSkin {
  constructor(asset, material) {
    this.root = new THREE.Group(); this.object = clone(asset.scene.children[0]); this.root.add(this.object);
    this.bones = new Map(); this.rest = new Map(); this.curls = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
    this.object.traverse(child => {
      if (child.isBone) this.bones.set(child.name, child);
      if (child.isMesh) { child.material = material; child.frustumCulled = false; child.castShadow = child.receiveShadow = true; }
    });
    const wrist = this.bones.get('wrist'), inverse = wrist.quaternion.clone().invert();
    for (const [name, bone] of this.bones) this.rest.set(name, {
      position: bone.position.clone().sub(wrist.position).applyQuaternion(inverse),
      quaternion: inverse.clone().multiply(bone.quaternion),
    });
    this.gripCenter = new THREE.Vector3(0, -palmClearance, this.rest.get('middle-finger-phalanx-proximal').position.z);
    this.gripAngles = Object.fromEntries(Object.entries(fingers).filter(([name]) => name !== 'thumb')
      .map(([name, chain]) => [name, gripCurlAngles(this.rest, chain, this.gripCenter)]));
  }
  attachToGrip(side) {
    // Wrist-local -Z points along the fingers, -Y through the palm. Roll the
    // knuckle row onto the upright handle; translate its hollow onto gripSpace.
    this.root.rotation.set(0, 0, side === 'left' ? Math.PI / 2 : -Math.PI / 2);
    this.root.position.copy(this.gripCenter).applyQuaternion(this.root.quaternion).negate();
  }
  track(hand) {
    let visible = 0;
    for (const [name, bone] of this.bones) {
      const joint = hand.joints[name];
      if (joint?.visible) { bone.position.copy(joint.position); bone.quaternion.copy(joint.quaternion); visible++; }
    }
    this.root.visible = visible >= 23 && !!hand.joints.wrist?.visible;
  }
  pose(dt, gamepad, bowRole, drawing) {
    for (const [name, bone] of this.bones) {
      bone.position.copy(this.rest.get(name).position); bone.quaternion.copy(this.rest.get(name).quaternion);
    }
    const trigger = gamepad?.buttons[0]?.value || 0, grip = gamepad?.buttons[1]?.value || 0;
    for (const [name, chain] of Object.entries(fingers)) {
      let target = name === 'index' ? .15 + trigger * .8 : name === 'thumb' ? .38 : .68 + grip * .3;
      if (bowRole === 'bow') target = 1;
      if (bowRole === 'string') target = ['index', 'middle', 'ring'].includes(name) ? (drawing ? .9 : .28) : .5;
      this.curls[name] = THREE.MathUtils.damp(this.curls[name], target, 18, dt);
      const curl = this.curls[name];
      const rotation = new THREE.Quaternion();
      if (name === 'thumb') {
        const side = Math.sign(this.rest.get(chain[0]).position.x);
        rotation.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -side * curl * .7)
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -side * curl * .15));
        this.bones.get(chain[0]).quaternion.copy(rotation).multiply(this.rest.get(chain[0]).quaternion);
      }
      for (let i = 1; i < chain.length; i++) {
        const bone = this.bones.get(chain[i]), previous = this.bones.get(chain[i - 1]);
        const rest = this.rest.get(chain[i]), prior = this.rest.get(chain[i - 1]);
        bone.position.copy(rest.position).sub(prior.position).applyQuaternion(rotation).add(previous.position);
        if (i < chain.length - 1) {
          if (name === 'thumb') rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -.4 * curl));
          else rotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.gripAngles[name][i - 1] * curl);
        }
        bone.quaternion.copy(rotation).multiply(rest.quaternion);
      }
    }
  }
}

/**
 * Write a world-space grip frame from visible XR palm landmarks into the outputs.
 * Returns false without changing outputs when tracking is unusable. Never edits joints.
 */
export function trackedBowGrip(hand, side, position, quaternion) {
  const names = ['wrist', 'index-finger-phalanx-proximal', 'middle-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal'];
  const joints = names.map(name => hand.joints?.[name]);
  if (!['left', 'right'].includes(side) || joints.some(joint => !joint?.visible)) return false;
  const [wrist, index, middle, pinky] = joints.map(joint => joint.getWorldPosition(new THREE.Vector3()));
  if (![wrist, index, middle, pinky].every(point => point.toArray().every(Number.isFinite))) return false;
  const y = index.clone().sub(pinky), z = wrist.clone().sub(middle);
  if (y.lengthSq() < .0001 || z.lengthSq() < .0001) return false;
  y.normalize(); z.addScaledVector(y, -z.dot(y));
  if (z.lengthSq() < .0001) return false;
  z.normalize(); const x = new THREE.Vector3().crossVectors(y, z).normalize();
  position.copy(middle).addScaledVector(x, side === 'left' ? palmClearance : -palmClearance);
  quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return true;
}
