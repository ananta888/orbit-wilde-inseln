import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Reviewed CC0 mount. Authored clips plus an explicit procedural flight overlay. */
export class RiggedDragon {
  constructor(parent) {
    this.root = new THREE.Group(); this.root.name = 'arin-cethiel'; this.root.visible = false; parent.add(this.root);
    this.ready = false; this.time = 0; this.bones = new Map();
    this.loading = new GLTFLoader().loadAsync('/assets/creatures/arin-cethiel.glb').then(asset => {
      this.model = asset.scene; this.root.add(this.model); this.clips = asset.animations;
      this.model.rotation.y = Math.PI; this.model.scale.setScalar(6.8); this.model.position.set(0, -.25, .45);
      this.model.traverse(object => {
        if (object.isBone) this.bones.set(object.name, object);
        if (object.isMesh) { object.castShadow = object.receiveShadow = true; object.frustumCulled = false; }
      });
      this.mixer = new THREE.AnimationMixer(this.model); this.mixer.clipAction(this.clips.find(clip => clip.name === 'idle')).play();
      this.ready = true;
    }).catch(() => { this.error = 'Das lokale Arin-Modell konnte nicht geladen werden; die prozedurale Darstellung bleibt aktiv.'; });
  }
  aim(name, direction) {
    const bone = this.bones.get(name); if (!bone) return;
    this.root.updateWorldMatrix(true, true);
    const world = bone.getWorldQuaternion(new THREE.Quaternion());
    const current = new THREE.Vector3(0, 1, 0).applyQuaternion(world);
    const desired = direction.normalize().applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    const delta = new THREE.Quaternion().setFromUnitVectors(current, desired);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(delta).multiply(world);
  }
  update(dt, speed, climbing, gesture) {
    if (!this.ready || !this.root.visible) return;
    this.time += dt; this.mixer.update(dt);
    const amplitude = speed > 12 && climbing < .2 ? .10 : .42;
    const flap = Math.sin(this.time * (climbing > .2 ? 6.5 : 3.8)) * amplitude;
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      this.aim('wing_lower_' + suffix, new THREE.Vector3(side, .15 + flap, .04));
      this.aim('wing_upper_' + suffix, new THREE.Vector3(side, -.05 + flap * .65, .35));
    }
    this.aim('neck1', new THREE.Vector3(0, .16, -1));
    this.aim('neck2', new THREE.Vector3(0, .09, -1));
    this.aim('neck3', new THREE.Vector3(gesture === 'look_around' ? Math.sin(this.time * .7) * .25 : 0, .03, -1));
  }
}
