import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const MAX = 64 * 1024 * 1024;
async function bounded(response, limit) {
  if (!response.ok) throw Error('Asset nicht verfügbar');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try {
    if (+response.headers.get('Content-Length') > limit) throw Error('Asset-Ladebudget');
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > limit) throw Error('Asset-Ladebudget'); chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const data = new Uint8Array(length); let offset = 0;
  for (const c of chunks) { data.set(c, offset); offset += c.length; }
  return data;
}

function validateReference(descriptor) {
  if (!/^asset_[a-f0-9]{32}$/.test(descriptor.asset_id) || !/^[a-f0-9]{64}$/.test(descriptor.sha256)
    || descriptor.revision !== 1 || descriptor.url !== `/api/assets/blob/${descriptor.asset_id}/${descriptor.sha256}`)
    throw Error('Ungültige Assetreferenz');
}

/** The editor and renderer use the same bounded, hash-verified source bytes. */
export async function assetBytes(descriptor, { maxBytes = MAX } = {}) {
  validateReference(descriptor);
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX) throw Error('Asset-Ladebudget');
  const data = await bounded(await fetch(descriptor.url, { signal: AbortSignal.timeout(20000) }), maxBytes);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(v => v.toString(16).padStart(2, '0')).join('');
  if (hash !== descriptor.sha256) throw Error('Assetprüfsumme stimmt nicht');
  return data;
}

/** Shared immutable GLB resources, separate skeletons, materials and animation mixers. */
export class AssetInstances {
  constructor(maxEntries = 24) { this.cache = new Map(); this.maxEntries = maxEntries; }
  async acquire(descriptor) {
    validateReference(descriptor);
    let entry = this.cache.get(descriptor.sha256);
    if (!entry) {
      if (this.cache.size >= this.maxEntries) { this.clearUnused(); if (this.cache.size >= this.maxEntries) throw Error('Asset-Instanzbudget'); }
      entry = { refs: 0, scene: null, promise: null };
      entry.promise = assetBytes(descriptor).then(async data => {
        const gltf = await new GLTFLoader().parseAsync(data.buffer, '');
        if (!gltf.scene) throw Error('Asset enthält keine Vorschau-Szene');
        entry.scene = gltf.scene; return gltf;
      }).catch(error => { this.cache.delete(descriptor.sha256); throw error; });
      this.cache.set(descriptor.sha256, entry);
    }
    // Pin before awaiting, so concurrent cleanup cannot dispose a pending load.
    entry.refs++;
    let gltf;
    try { gltf = await entry.promise; } catch (error) { entry.refs--; throw error; }
    const root = clone(gltf.scene), materials = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      const copy = m => { const c = m.clone(); materials.push(c); return c; };
      o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
    });
    const mixer = new THREE.AnimationMixer(root); let disposed = false;
    return { root, mixer, animations: gltf.animations,
      play(index) { mixer.stopAllAction(); if (gltf.animations[index]) mixer.clipAction(gltf.animations[index]).play(); },
      dispose() { if (disposed) return; disposed = true; mixer.stopAllAction(); mixer.uncacheRoot(root);
        root.removeFromParent(); materials.forEach(m => m.dispose());
        const skeletons = new Set(); root.traverse(o => { if (o.skeleton) skeletons.add(o.skeleton); });
        skeletons.forEach(s => s.dispose()); entry.refs--; } };
  }
  clearUnused() {
    for (const [key, entry] of this.cache) if (!entry.refs && entry.scene) {
      const seen = new Set();
      entry.scene.traverse(o => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
          for (const t of Object.values(m)) if (t?.isTexture && !seen.has(t)) { seen.add(t); t.dispose(); t.source?.data?.close?.(); }
          m.dispose();
        }
      }); this.cache.delete(key);
    }
  }
}
