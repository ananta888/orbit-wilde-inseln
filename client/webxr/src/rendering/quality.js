import * as THREE from 'three';
export const QUALITY = {
  balanced: { pixelRatio: 1.5, framebuffer: 1, foveation: .5, shadow: 1024, shadowInterval: .10, detailDistance: 19 },
  high: { pixelRatio: 2, framebuffer: 1.15, foveation: .25, shadow: 2048, shadowInterval: .065, detailDistance: 29 },
  performance: { pixelRatio: 1, framebuffer: .85, foveation: .8, shadow: 512, shadowInterval: .16, detailDistance: 12 },
};
export class QualitySettings {
  constructor(renderer, sun, scene) {
    Object.assign(this, { renderer, sun, scene }); this.elapsed = Infinity;
    const saved = localStorage.getItem('orbit-quality'); this.name = Object.hasOwn(QUALITY, saved) ? saved : 'balanced';
    this.select = document.getElementById('graphics-quality'); this.select.value = this.name;
    this.select.addEventListener('change', () => { this.name = this.select.value; localStorage.setItem('orbit-quality', this.name); this.apply(); });
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.enabled = true; renderer.shadowMap.autoUpdate = false;
    sun.castShadow = true; sun.shadow.normalBias = .045; sun.shadow.bias = -.0002;
    Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 100 });
    scene.add(sun.target); this.apply();
  }
  get settings() { return QUALITY[this.name]; }
  apply() {
    const settings = this.settings;
    if (!this.renderer.xr.isPresenting) {
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.pixelRatio));
      this.renderer.xr.setFramebufferScaleFactor(settings.framebuffer);
    }
    this.renderer.xr.setFoveation(settings.foveation);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.setScalar(settings.shadow); this.sun.shadow.camera.updateProjectionMatrix();
    this.renderer.shadowMap.needsUpdate = true;
  }
  update(dt, camera, mixed) {
    this.select.disabled = this.renderer.xr.isPresenting;
    this.sun.castShadow = !mixed; this.renderer.shadowMap.enabled = !mixed;
    this.elapsed += dt;
    if (mixed || this.elapsed < this.settings.shadowInterval) return;
    this.elapsed = 0;
    const target = camera.getWorldPosition(new THREE.Vector3()); target.y = Math.max(0, target.y - 1.5);
    this.sun.target.position.copy(target); this.sun.position.copy(target).add(new THREE.Vector3(-22, 38, -28));
    this.renderer.shadowMap.needsUpdate = true;
  }
}
