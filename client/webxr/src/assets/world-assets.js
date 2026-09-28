import * as THREE from 'three';
import { AssetInstances } from './instances.js';

/** Server-owned decorative placements; never awards, physics or mission state. */
export class WorldAssets {
  constructor(parent, onError = () => {}) {
    // Two bounded snapshots may coexist during atomic replacement (24 placements each).
    this.parent = parent; this.onError = onError; this.cache = new AssetInstances(48); this.instances = [];
    this.revision = -1; this.nextPoll = 0; this.loading = false; this.disposed = false; this.group = new THREE.Group(); parent.add(this.group);
  }
  async refresh() {
    if (this.loading || this.disposed) return;
    this.loading = true; const staged = [];
    try {
      const response = await fetch('/api/assets/placements', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Error('Assetplatzierungen nicht verfügbar');
      const state = await response.json();
      if (state.revision === this.revision && !state.rejected.length) return;
      if (state.items.length > 24) throw Error('Platzierungsbudget');
      const group = new THREE.Group();
      for (const item of state.items) {
        const instance = await this.cache.acquire(item.asset); staged.push(instance);
        const placement = new THREE.Group(); placement.position.fromArray(item.position); placement.rotation.set(...item.rotation);
        placement.scale.setScalar(item.scale); placement.add(instance.root); group.add(placement);
        instance.play(0);
      }
      if (this.disposed) return;
      this.instances.forEach(i => i.dispose()); this.group.removeFromParent(); this.group = group; this.parent.add(group);
      this.instances = [...staged]; staged.length = 0; this.revision = state.revision; this.cache.clearUnused();
    } catch (error) { this.onError(error); }
    finally { staged.forEach(i => i.dispose()); this.cache.clearUnused(); this.loading = false; }
  }
  update(dt, now) {
    for (const instance of this.instances) instance.mixer.update(dt);
    if (now >= this.nextPoll) { this.nextPoll = now + 15000; void this.refresh(); }
  }
  dispose() { this.disposed = true; this.instances.forEach(i => i.dispose()); this.group.removeFromParent(); this.cache.clearUnused(); }
}
