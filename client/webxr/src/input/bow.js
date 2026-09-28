import * as THREE from '/vendor/three.module.js';
import { surfaceMaterial } from '../rendering/materials.js';
import { BOW_GRIP_RADIUS, BOW_GRIP_LENGTH } from '../xr/hand-pose.js';

const shaft = new THREE.CylinderGeometry(0.004, 0.004, 0.68, 6);
shaft.rotateX(Math.PI / 2);
const tip = new THREE.ConeGeometry(0.012, 0.035, 6);
tip.rotateX(-Math.PI / 2);
const feather = new THREE.BoxGeometry(0.046, 0.002, 0.11);
const wood = new THREE.MeshStandardMaterial({ color: 0xbb8154, roughness: 0.65 });
const metal = new THREE.MeshStandardMaterial({ color: 0xaac2c5, metalness: 0.7, roughness: 0.3 });
const flight = new THREE.MeshStandardMaterial({ color: 0xbceccc, roughness: 0.9 });
const axis = new THREE.Vector3(0, 0, -1), up = new THREE.Vector3(0, 1, 0);

export function makeArrow() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(shaft, wood); pole.position.z = 0.35; group.add(pole);
  const head = new THREE.Mesh(tip, metal); head.position.z = 0.014; group.add(head);
  for (let i = 0; i < 3; i++) {
    const vane = new THREE.Mesh(feather, flight);
    vane.rotation.z = i * Math.PI / 3;
    vane.position.z = 0.61;
    group.add(vane);
  }
  return group;
}

export class Bow {
  constructor(scene, release) {
    this.release = release;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    const limbMaterial = surfaceMaterial('wood', { color: 0x8e552e, roughness: .65 });
    const limbGeometry = new THREE.CylinderGeometry(0.010, 0.012, 1, 10);
    this.limbs = Array.from({ length: 24 }, () => {
      const limb = new THREE.Mesh(limbGeometry, limbMaterial); this.root.add(limb); return limb;
    });
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(BOW_GRIP_RADIUS, BOW_GRIP_RADIUS, BOW_GRIP_LENGTH, 12), new THREE.MeshStandardMaterial({ color: 0x263c36 }));
    this.root.add(grip);
    for (let i = 0; i < 9; i++) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(BOW_GRIP_RADIUS, .0012, 4, 16), grip.material);
      wrap.rotation.x = Math.PI / 2; wrap.position.y = (i - 4) * .015; this.root.add(wrap);
    }
    const positions = new Float32Array(9);
    this.stringGeometry = new THREE.BufferGeometry();
    this.stringGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.string = new THREE.Line(this.stringGeometry, new THREE.LineBasicMaterial({ color: 0xe8e6cb }));
    this.string.frustumCulled = false;
    this.root.add(this.string);
    this.arrow = makeArrow(); this.arrow.visible = false; scene.add(this.arrow);
    this.draw = 0;
    this.drawing = false;
    this.hint = 'Trigger: Runde starten';
    this.hand = 'left';
    this.bowPosition = new THREE.Vector3();
    this.stringPosition = new THREE.Vector3();
    this.aim = new THREE.Vector3(0, 0, -1);
    this.forward = new THREE.Vector3();
    this.lastPulse = 0;
  }

  hands(controllers) {
    this.bowHand = controllers.find(controller => controller.userData.source?.handedness === this.hand);
    this.drawHand = controllers.find(controller => controller.userData.source?.handedness === (this.hand === 'left' ? 'right' : 'left'));
  }

  begin(controller, playing) {
    if (controller !== this.drawHand || !playing || !this.bowHand?.visible || !this.drawHand?.visible) return;
    const rest = this.bowPosition.clone().addScaledVector(this.forward, -0.12);
    if (this.stringPosition.distanceTo(rest) > 0.28) {
      this.hint = 'Zughand zur Sehne führen · dann Trigger halten';
      return;
    }
    this.drawing = true;
    this.draw = 0;
  }

  end(controller, playing) {
    if (controller !== this.drawHand || !this.drawing) return;
    if (playing && this.draw >= 0.08 && this.aim.dot(this.forward) > 0.1) {
      this.release(this.arrow.position, this.aim, this.draw, controller);
      this.pulse(controller, 0.7, 50);
      this.hint = 'Pfeil unterwegs · Zughand zurück zur Sehne';
    } else this.hint = 'Sehne weiter nach hinten ziehen';
    this.cancel();
  }

  cancel() { this.drawing = false; this.draw = 0; this.arrow.visible = false; }

  pulse(controller, strength, duration) {
    const actuator = controller?.userData.source?.gamepad?.hapticActuators?.[0];
    if (actuator) actuator.pulse(strength, duration).catch(() => {});
  }

  update(controllers, active, playing, now) {
    this.hands(controllers);
    const bowPose = this.bowHand?.userData.bowGrip || this.bowHand;
    const drawPose = this.drawHand?.userData.pinchPose || this.drawHand;
    const tracked = bowPose?.visible && drawPose?.visible && active && this.bowHand?.userData.source && this.drawHand?.userData.source && this.bowHand.visible && this.drawHand.visible;
    this.root.visible = !!tracked;
    if (!tracked) { this.cancel(); if (active) this.hint = 'Beide Hände oder Controller bereithalten'; return; }
    if (!playing) this.cancel();
    bowPose.getWorldPosition(this.bowPosition);
    drawPose.getWorldPosition(this.stringPosition);
    this.root.position.copy(this.bowPosition);
    this.root.quaternion.copy(bowPose.getWorldQuaternion(new THREE.Quaternion()));
    this.forward.copy(axis).applyQuaternion(this.root.quaternion);
    this.root.updateMatrixWorld(true);
    let nock = new THREE.Vector3(0, 0, 0.12);
    if (this.drawing) {
      const distance = this.bowPosition.distanceTo(this.stringPosition);
      if (distance > 1.15) { this.cancel(); this.hint = 'Sehne losgelassen · Hände zu weit auseinander'; }
      else {
        this.draw = THREE.MathUtils.clamp(distance - 0.12, 0, 0.65);
        this.aim.copy(this.bowPosition).sub(this.stringPosition).normalize();
        nock = this.root.worldToLocal(this.stringPosition.clone());
        this.arrow.visible = true;
        this.arrow.position.copy(this.stringPosition).addScaledVector(this.aim, 0.72);
        this.arrow.quaternion.setFromUnitVectors(axis, this.aim);
        this.hint = `Auszug ${Math.round(this.draw * 100)} cm · Trigger loslassen`;
        if (now - this.lastPulse > 110 && this.draw > 0.04) {
          this.pulse(this.drawHand, 0.05 + this.draw * 0.25, 25);
          this.lastPulse = now;
        }
      }
    }
    const amount = this.draw / 0.65, half = 0.59 - amount * 0.06;
    const points = [];
    for (let i = 0; i <= 24; i++) {
      const y = (i / 12 - 1) * half;
      // Keep the riser straight inside the handle instead of bending through fingers.
      const t = Math.max(0, (Math.abs(y) - BOW_GRIP_LENGTH / 2) / (half - BOW_GRIP_LENGTH / 2));
      const bend = Math.sin(t * Math.PI) * -0.11 + t ** 3 * (0.12 + amount * 0.10);
      points.push(new THREE.Vector3(0, y, bend));
    }
    this.limbs.forEach((limb, i) => {
      const delta = points[i + 1].clone().sub(points[i]);
      limb.position.copy(points[i]).add(points[i + 1]).multiplyScalar(0.5);
      limb.scale.y = delta.length();
      limb.quaternion.setFromUnitVectors(up, delta.normalize());
    });
    const positions = this.stringGeometry.attributes.position;
    [points[0], nock, points.at(-1)].forEach((point, i) => positions.setXYZ(i, point.x, point.y, point.z));
    positions.needsUpdate = true;
  }
}
