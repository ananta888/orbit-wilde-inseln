import * as THREE from 'three';

/** One shared object-space navigation state for controller grips and tracked fists. */
export class WorkpieceNavigation {
  constructor(stage) { this.stage = stage; this.keys = ''; this.base = null; }
  reset() { this.keys = ''; this.base = null; }
  update(grips) {
    const entries = [...grips].sort(([a], [b]) => a.localeCompare(b)).slice(0, 2);
    const keys = entries.map(([id]) => id).join('|');
    if (!entries.length) { this.reset(); return; }
    const poses = entries.map(([, object]) => ({ point: object.getWorldPosition(new THREE.Vector3()),
      rotation: object.getWorldQuaternion(new THREE.Quaternion()) }));
    const center = poses[0].point.clone();
    if (poses.length === 2) center.add(poses[1].point).multiplyScalar(.5);
    const axis = poses.length === 2 ? poses[1].point.clone().sub(poses[0].point) : null;
    if (keys !== this.keys) {
      this.keys = keys;
      this.base = { position: this.stage.position.clone(), scale: this.stage.scale.x,
        rotation: this.stage.quaternion.clone(), handRotation: poses[0].rotation.clone(), center: center.clone(), axis: axis?.clone() };
    }
    const base = this.base;
    const rotation = poses.length === 1 ? poses[0].rotation.clone().multiply(base.handRotation.clone().invert()) :
      new THREE.Quaternion().setFromUnitVectors(base.axis.clone().normalize(), axis.clone().normalize());
    const scale = poses.length === 2 ? THREE.MathUtils.clamp(base.scale * axis.length() / Math.max(.08, base.axis.length()), .03, 2) : base.scale;
    this.stage.scale.setScalar(scale);
    this.stage.quaternion.copy(rotation).multiply(base.rotation);
    this.stage.position.copy(base.position).sub(base.center).multiplyScalar(scale / base.scale).applyQuaternion(rotation).add(center);
  }
}
