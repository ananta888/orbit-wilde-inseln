import * as THREE from 'three';

/** Analytic two-bone IK. Pole controls knee/elbow direction, never the camera. */
export function solveTwoBone(start, desired, pole, upper, lower) {
  const direction = desired.clone().sub(start), requested = direction.length();
  if (requested < 1e-8) direction.set(0, -1, 0); else direction.divideScalar(requested);
  const distance = THREE.MathUtils.clamp(requested, Math.abs(upper - lower) + 1e-5, upper + lower - 1e-5);
  const target = start.clone().addScaledVector(direction, distance);
  const axis = pole.clone().addScaledVector(direction, -pole.dot(direction));
  if (axis.lengthSq() < 1e-8) axis.crossVectors(direction, Math.abs(direction.x) < .8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1));
  axis.normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  return { joint: start.clone().addScaledVector(direction, along).addScaledVector(axis, height), target };
}

/** Stance moves back at body speed; swing returns the foot above the ground. */
export function gaitSample(phase, stride, lift, duty = .64) {
  const t = ((phase % 1) + 1) % 1;
  if (t < duty) return { forward: stride * (.5 - t / duty), lift: 0, contact: true };
  const swing = (t - duty) / (1 - duty), smooth = swing * swing * (3 - 2 * swing);
  return { forward: stride * (-.5 + smooth), lift: Math.sin(Math.PI * swing) ** 1.2 * lift, contact: false };
}

const UP = new THREE.Vector3(0, 1, 0), transform = new THREE.Object3D();
const capsule = new THREE.CapsuleGeometry(1, 1, 5, 10); capsule.scale(1, 1 / 3, 1);
const sphere = new THREE.SphereGeometry(1, 12, 8);
export class LimbBatch {
  constructor(parent, material, capacity = 48) {
    this.links = new THREE.InstancedMesh(capsule, material, capacity);
    this.joints = new THREE.InstancedMesh(sphere, material, capacity);
    for (const mesh of [this.links, this.joints]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
    }
    this.color = new THREE.Color(); this.begin();
  }
  begin() { this.linkCount = this.jointCount = 0; }
  segment(a, b, radius, color, width = 1) {
    const delta = b.clone().sub(a); transform.position.copy(a).add(b).multiplyScalar(.5);
    transform.quaternion.setFromUnitVectors(UP, delta.normalize()); transform.scale.set(radius * width, a.distanceTo(b), radius); transform.updateMatrix();
    this.links.setMatrixAt(this.linkCount, transform.matrix); this.links.setColorAt(this.linkCount++, this.color.set(color));
  }
  sphere(point, scale, color, quaternion = null) {
    transform.position.copy(point); transform.scale.set(...scale); transform.quaternion.copy(quaternion || new THREE.Quaternion()); transform.updateMatrix();
    this.joints.setMatrixAt(this.jointCount, transform.matrix); this.joints.setColorAt(this.jointCount++, this.color.set(color));
  }
  finish() {
    for (const [mesh, count] of [[this.links, this.linkCount], [this.joints, this.jointCount]]) {
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  dispose() { this.links.dispose(); this.joints.dispose(); }
}
