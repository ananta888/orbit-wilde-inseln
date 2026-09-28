import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DragonAnimation, groundOffset } from './dragon-animation.js';

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
      this.animation = new DragonAnimation(this.root, this.model, this.clips); this.mixer = this.animation.mixer;
      this.groundOffset = groundOffset(this.model, this.root);
      this.ready = true;
    }).catch(() => { this.error = 'Das lokale Arin-Modell konnte nicht geladen werden; die prozedurale Darstellung bleibt aktiv.'; });
  }
  update(dt, speed, climbing, gesture, options = {}) {
    if (!this.ready || !this.root.visible) return;
    this.animation.update(dt, { speed, climbing, gesture, ...options });
  }
}
