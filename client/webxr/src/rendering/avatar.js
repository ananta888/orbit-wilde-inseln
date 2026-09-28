import * as THREE from 'three';
import { LimbBatch, solveTwoBone, gaitSample } from './kinematics.js';

/** Head/hands are tracked. Pelvis, elbows and legs are explicitly inferred animation. */
export class PlayerAvatar {
  constructor(scene) {
    this.root = new THREE.Group(); this.root.name = 'inferred-player-body'; scene.add(this.root);
    this.material = new THREE.MeshStandardMaterial({ roughness: .85 });
    this.limbs = new LimbBatch(this.root, this.material, 36);
    this.phase = 0; this.previous = null; this.heading = null; this.knees = []; this.feet = []; this.elbows = [];
    this.tracking = 'head-hands-only'; this.walkBlend = 0; this.travelDirection = new THREE.Vector3(0, 0, -1);
  }
  update(dt, camera, movement, visuals, environment, dragon, active, xr) {
    this.root.visible = active && xr && movement.mode !== 'mr';
    if (!this.root.visible) { this.previous = null; return; }
    const head = camera.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const yaw = Math.atan2(-forward.x, -forward.z); this.heading ??= yaw;
    this.heading += Math.atan2(Math.sin(yaw - this.heading), Math.cos(yaw - this.heading)) * (1 - Math.exp(-dt * 5));
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q), ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const moved = this.previous ? Math.hypot(head.x - this.previous.x, head.z - this.previous.z) : 0;
    const distance = moved < .4 ? moved : 0;
    if (distance > .0004 && this.previous) this.travelDirection.lerp(head.clone().sub(this.previous).setY(0).normalize(), 1 - Math.exp(-dt * 14)).normalize();
    this.phase += distance * .64 / .48; this.previous = head.clone();
    this.walkBlend = THREE.MathUtils.damp(this.walkBlend, distance > .0004 ? 1 : 0, 12, dt);
    const mounted = movement.locomotion !== 'walk';
    const ground = environment.sample(head.x, head.z) ?? movement.position[1];
    const hip = head.clone(); hip.y = Math.max(ground + .30, head.y - .72); hip.addScaledVector(ahead, -.035);
    this.limbs.begin(); this.knees = []; this.feet = []; this.elbows = [];
    if (!mounted) {
      this.limbs.sphere(hip.clone().add(new THREE.Vector3(0, .11, 0)), [.21, .20, .13], '#394951', q);
      this.limbs.sphere(head.clone().add(new THREE.Vector3(0, -.42, 0)).addScaledVector(ahead, -.055), [.22, .27, .135], '#344f58', q);
      for (const side of [-1, 1]) {
        const sample = gaitSample(this.phase + (side < 0 ? 0 : .5), .48 * this.walkBlend, .12 * this.walkBlend);
        const start = hip.clone().addScaledVector(right, side * .105);
        const foot = head.clone().addScaledVector(right, side * .135).addScaledVector(this.travelDirection, sample.forward);
        foot.y = (environment.sample(foot.x, foot.z) ?? ground) + .065 + sample.lift;
        const ankle = foot.clone().add(new THREE.Vector3(0, .075, 0));
        const solved = solveTwoBone(start, ankle, ahead, .43, .43);
        this.knees.push(solved.joint.clone()); this.feet.push(foot.clone());
        this.limbs.segment(start, solved.joint, .090, '#384751', 1.08);
        this.limbs.segment(solved.joint, solved.target, .060, '#435560');
        this.limbs.sphere(solved.joint, [.071, .070, .069], '#2e424b');
        this.limbs.sphere(foot.clone().addScaledVector(ahead, .05), [.070, .061, .145], '#3b3028', q);
      }
    }
    for (const side of [-1, 1]) {
      const wrist = visuals.wrist(side < 0 ? 'left' : 'right'); if (!wrist) continue;
      const shoulder = mounted ? dragon.rider.localToWorld(new THREE.Vector3(side * .22, .79, -.06)) : head.clone().addScaledVector(right, side * .19).add(new THREE.Vector3(0, -.25, 0));
      const pole = right.clone().multiplyScalar(side).add(new THREE.Vector3(0, -.65, 0));
      const arm = solveTwoBone(shoulder, wrist, pole, .32, .31); this.elbows.push(arm.joint.clone());
      this.limbs.segment(shoulder, arm.joint, .056, '#42616a');
      this.limbs.segment(arm.joint, arm.target, .039, '#d6a482');
      this.limbs.sphere(arm.joint, [.045, .047, .045], '#c39778');
      const cuff = arm.joint.clone().lerp(arm.target, .78);
      this.limbs.segment(cuff, arm.target, .044, '#695039');
    }
    this.limbs.finish();
  }
}
