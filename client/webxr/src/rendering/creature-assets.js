import * as THREE from 'three';
import { CreatureView } from '../design/rendering.js';

const MAX_BYTES = 32 * 1024 * 1024;

async function boundedBytes(response) {
  if (!response.ok) throw Error('Spielmodell konnte nicht geladen werden');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try {
    if (Number(response.headers.get('Content-Length')) > MAX_BYTES) throw Error('Spielmodell überschreitet das Ladebudget');
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > MAX_BYTES) throw Error('Spielmodell überschreitet das Ladebudget');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

/** Immutable geometry is shared; skeletons, materials and playback belong to each instance. */
export class CreatureAssets {
  constructor() { this.cache = new Map(); }
  async entry(descriptor) {
    if (!/^[a-f0-9]{64}$/.test(descriptor.hash) || descriptor.url !== '/api/creatures/' + descriptor.hash)
      throw Error('Ungültige Kreaturenreferenz');
    let entry = this.cache.get(descriptor.hash);
    if (!entry) {
      if (this.cache.size >= 8) {
        const unused = [...this.cache].find(([, value]) => value.ready && value.refs === 0);
        if (!unused) throw Error('Zu viele aktive Kreaturenmodelle');
        unused[1].geometry.forEach(g => g.dispose()); this.cache.delete(unused[0]);
      }
      entry = { refs: 0, ready: false, geometry: new Map(), promise: null };
      entry.promise = fetch(descriptor.url, { signal: AbortSignal.timeout(15000) }).then(boundedBytes).then(async bytes => {
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
        if (hash !== descriptor.hash) throw Error('Prüfsumme des Spielmodells stimmt nicht');
        const artifact = JSON.parse(new TextDecoder().decode(bytes)); entry.ready = true; return artifact;
      }).catch(error => { this.cache.delete(descriptor.hash); throw error; });
      this.cache.set(descriptor.hash, entry);
    }
    const artifact = await entry.promise;
    if (artifact.schema_version !== '1.0' || artifact.asset_id !== descriptor.asset_id || artifact.revision !== descriptor.revision)
      throw Error('Falsche Kreaturenrevision');
    return { entry, artifact };
  }
  async load(descriptor) { return (await this.entry(descriptor)).artifact; }
  async instantiate(descriptor, parent) {
    const { entry, artifact } = await this.entry(descriptor), doc = structuredClone(artifact.document);
    doc.regions = new Map(doc.regions.map(r => [r.id, { ...r, positions: new Float32Array(r.positions),
      normals: new Float32Array(r.normals), colors: new Float32Array(r.colors), mask: new Float32Array(r.mask),
      surface: new Float32Array(r.surface), indices: new Uint32Array(r.indices) }]));
    const view = new CreatureView(parent, { sharedGeometry: entry.geometry });
    try { view.load(doc); } catch (error) { view.clear(); view.root.removeFromParent(); throw error; }
    entry.refs++;
    for (const mesh of view.meshes.values()) mesh.frustumCulled = false;
    let disposed = false;
    return { view, artifact, dispose() {
      if (disposed) return;
      disposed = true; entry.refs--; view.clear(); view.root.removeFromParent();
    } };
  }
  clear() {
    for (const [hash, entry] of this.cache) if (entry.ready && entry.refs === 0) {
      entry.geometry.forEach(g => g.dispose()); this.cache.delete(hash);
    }
  }
}

export function alignRider(instance) {
  const point = instance.artifact.document.mount_points.find(p => p.id === 'rider_seat');
  if (!point) throw Error('Sitzpunkt fehlt');
  const root = instance.view.root;
  root.quaternion.setFromEuler(new THREE.Euler(...point.rotation)).invert();
  root.position.copy(new THREE.Vector3(...point.position).applyQuaternion(root.quaternion).negate()).add(new THREE.Vector3(0, .8, .2));
}
