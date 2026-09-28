import * as THREE from 'three';
import { mergeVertices, deinterleaveAttribute } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { DragonMount } from '../rendering/dragon.js';
import { CreatureView } from './rendering.js';

const BUFFERS = ['positions', 'indices', 'normals', 'colors', 'mask', 'surface'];

export function plainDocument(document) {
  const { history, ...doc } = document;
  doc.regions = [...document.regions.values()].map(region => {
    const { vertex_count, index_count, ...value } = region;
    for (const key of BUFFERS) value[key] = Array.from(region[key]);
    return value;
  });
  return doc;
}

function orbitDocument(scene) {
  let metadata = null; const regions = [], weights = {};
  scene.traverse(node => { if (node.userData.orbitCreature) {
    if (metadata) throw Error('Mehrere Kreaturendokumente in einem GLB');
    metadata = node.userData.orbitCreature;
  } });
  if (!metadata) return null;
  scene.traverse(mesh => {
    if (!mesh.isMesh || !mesh.userData.orbitRegion) return;
    const region = { ...mesh.userData.orbitRegion }, a = mesh.geometry.attributes;
    const attributes = { positions: 'position', normals: 'normal', colors: 'color', mask: '_editmask', surface: '_surface' };
    for (const [key, attribute] of Object.entries(attributes)) {
      if (!a[attribute] || a[attribute].isInterleavedBufferAttribute) throw Error('Unvollständige Orbit-GLB-Attribute');
      region[key] = Array.from(a[attribute].array);
    }
    if (!mesh.geometry.index) throw Error('Orbit-GLB ohne Indizes');
    region.indices = Array.from(mesh.geometry.index.array);
    if (a.skinIndex && a.skinWeight) {
      // GLTFLoader normalizes WEIGHTS_0 in place. Keep the canonical Float32 bits
      // for reversible editing, alongside the interoperable standard attribute.
      const canonical = a._orbit_skinweight || a.skinWeight;
      if (canonical.itemSize !== 4 || canonical.count !== a.skinWeight.count || canonical.isInterleavedBufferAttribute ||
          Array.from(canonical.array).some((value, i) => !Number.isFinite(value) ||
            Math.abs(value - a.skinWeight.array[i]) > 1e-6)) throw Error('Widersprüchliche Orbit-GLB-Gelenkgewichte');
      weights[region.id] = { joints: Array.from(a.skinIndex.array), weights: Array.from(canonical.array) };
    }
    regions.push(region);
  });
  if (!regions.length) throw Error('Orbit-GLB ohne bearbeitbare Regionen');
  return { ...metadata, regions, rig: { bones: metadata.rig.bones, weights } };
}

export function download(name, data, type = 'application/json') {
  const blob = new Blob([data], { type }), url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function documentFromObject(root, source = 'Imported GLB', { procedural = false } = {}) {
  root.updateMatrixWorld(true); const regions = []; let total = 0;
  root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.visible) return;
    if (mesh.isSkinnedMesh || Object.values(mesh.geometry.morphAttributes).some(x => x.length))
      throw Error('Dieses Importprofil unterstützt noch keine Skin-/Morphdaten. Das Original bleibt unverändert.');
    if (!procedural && (mesh.geometry.attributes.uv || mesh.geometry.attributes.uv1))
      throw Error('UV-Daten benötigen das erweiterte Bearbeitungsprofil. Vorschau und Spielimport sind in der Assetbibliothek verfügbar.');
    if (!procedural && (Object.keys(mesh.geometry.attributes).some(key => !['position', 'normal', 'color'].includes(key))
      || mesh.geometry.attributes.color && mesh.geometry.attributes.color.itemSize !== 3))
      throw Error('Zusätzliche Vertexdaten werden von diesem Bearbeitungsprofil nicht verlustfrei unterstützt.');
    if (Array.isArray(mesh.material) || mesh.material.map) throw Error('Texturierte Mehrfachmaterialien benötigen das erweiterte Importprofil.');
    let geometry = mesh.geometry.clone();
    for (const [name, attribute] of Object.entries(geometry.attributes))
      if (attribute.isInterleavedBufferAttribute) geometry.setAttribute(name, deinterleaveAttribute(attribute));
    geometry.applyMatrix4(mesh.matrixWorld);
    const indexed = mergeVertices(geometry, 1e-5); geometry.dispose(); geometry = indexed;
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const count = geometry.attributes.position.count; total += count;
    if (total > 100000 || regions.length >= 96) throw Error('Import überschreitet das Quest-Bearbeitungsprofil.');
    const color = geometry.attributes.color, material = mesh.material, base = material.color || new THREE.Color(.2, .4, .3);
    const colors = [];
    for (let i = 0; i < count; i++) colors.push(color ? color.getX(i) : base.r, color ? color.getY(i) : base.g, color ? color.getZ(i) : base.b);
    const name = (mesh.userData.part || mesh.name || 'part').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    regions.push({ id: name + '_' + regions.length, part: name || 'part', topology_revision: 0,
      solid: material.side !== THREE.DoubleSide, locked: false,
      positions: Array.from(geometry.attributes.position.array), indices: Array.from(geometry.index.array),
      normals: Array.from(geometry.attributes.normal.array), colors, mask: new Array(count).fill(0),
      surface: Array.from({ length: count }, () => [material.roughness ?? .65, material.metalness ?? 0, 0, material.opacity ?? 1]).flat(),
      material: { roughness: material.roughness ?? .65, metallic: material.metalness ?? 0,
        emissive: (material.emissive || new THREE.Color(0)).toArray(), opacity: material.opacity ?? 1, detail: 'none', detail_scale: 12 } });
    geometry.dispose();
  });
  if (!regions.length) throw Error('Keine bearbeitbare Geometrie gefunden');
  return { schema_version: '1.0', id: 'imported', name: source.slice(0, 100), revision: 0, units: 'meters',
    regions, rig: { bones: [], weights: {} }, clips: [], mount_points: [], colliders: [], layers: [],
    provenance: { source, license: source === 'Arin aus Orbit' ? 'BSD-3-Clause' : 'user-supplied' }, behaviour_profile: 'friendly_dragon' };
}

export function existingArin() {
  const mount = new DragonMount(new THREE.Group());
  mount.body.remove(mount.rider);
  mount.head.name = 'head';
  mount.head.traverse(o => { if (o.isMesh) o.userData.part = 'head'; });
  mount.wings.forEach((wing, i) => wing.traverse(o => { if (o.isMesh) o.userData.part = i ? 'right_wing' : 'left_wing'; }));
  mount.tail.forEach((tail, i) => tail.children.forEach(o => { if (o.isMesh) o.userData.part = 'tail_' + i; }));
  const doc = documentFromObject(mount.body, 'Arin aus Orbit', { procedural: true });
  const geometries = new Set(), materials = new Set();
  mount.root.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
  mount.rider.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  return doc;
}

export async function importFile(file) {
  if (file.size > 16 * 1024 * 1024) throw Error('Datei zu groß (16 MiB)');
  if (file.name.endsWith('.json')) return JSON.parse(await file.text());
  const bytes = await file.arrayBuffer(), view = new DataView(bytes);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 ||
      view.getUint32(8, true) !== bytes.byteLength) throw Error('Ungültiges GLB');
  const size = view.getUint32(12, true);
  if (size > bytes.byteLength - 20 || view.getUint32(16, true) !== 0x4e4f534a) throw Error('GLB-Header');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, size)));
  if (json.extensionsRequired?.length) throw Error('Erforderliche GLB-Erweiterung wird von diesem Importprofil nicht unterstützt');
  if ([...(json.buffers || []), ...(json.images || [])].some(x => x.uri)) throw Error('Externe GLB-Ressourcen sind nicht erlaubt');
  if ((json.accessors || []).some(a => !Number.isSafeInteger(a.count) || a.count > 540000)) throw Error('GLB-Accessorbudget');
  if (json.images?.length) throw Error('Texturimport benötigt das erweiterte Importprofil');
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  try {
    const own = orbitDocument(gltf.scene);
    if (own) return own;
    if (json.extensionsUsed?.length) throw Error('GLB-Erweiterungen benötigen ein passendes Bearbeitungsprofil. Das Original bleibt erhalten.');
    if (gltf.animations.length) throw Error('Animationsdaten dürfen beim Werkstattimport nicht verloren gehen. Das GLB bleibt in der Assetbibliothek nutzbar.');
    return documentFromObject(gltf.scene, file.name);
  }
  finally { gltf.scene.traverse(o => { o.geometry?.dispose(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material?.dispose(); }); }
}

export async function exportGLBBytes(document) {
  // Isolated rest-space export: never move the live workspace or export a predicted stroke.
  const view = new CreatureView(new THREE.Group()); view.load(document);
  const root = view.root, doc = structuredClone(plainDocument(document));
  if (doc.provenance.asset) doc.provenance.asset.license.modifications.push(`Orbit geometry editing through revision ${doc.revision}; original library asset ${doc.provenance.asset.id}`);
  root.name = doc.name;
  const { regions, rig, ...metadata } = doc;
  root.userData.orbitCreature = { ...metadata, rig: { bones: rig.bones } };
  for (const region of regions) {
    const meta = Object.fromEntries(Object.entries(region).filter(([key]) => !BUFFERS.includes(key)));
    const mesh = view.meshes.get(region.id); mesh.userData.orbitRegion = meta;
    if (mesh.geometry.hasAttribute('skinWeight'))
      mesh.geometry.setAttribute('orbit_skinweight', mesh.geometry.getAttribute('skinWeight').clone());
    // Standard glTF carries the base PBR material; per-vertex channels remain custom attributes.
    mesh.material.emissive.setRGB(...region.material.emissive);
  }
  const animations = doc.clips.map(clip => {
    const tracks = [];
    for (const bone of doc.rig.bones) {
      const keys = clip.keys.filter(k => k.bone === bone.id).sort((a, b) => a.time - b.time);
      if (!keys.length) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(view.bones.get(bone.id).uuid + '.quaternion',
        keys.map(k => k.time), keys.flatMap(k => new THREE.Quaternion().setFromEuler(new THREE.Euler(...k.rotation)).toArray())));
    }
    return new THREE.AnimationClip(clip.id, clip.duration, tracks);
  });
  try {
    return await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false, animations });
  } finally { view.clear(); }
}

export async function exportGLB(creature) {
  download('creature.glb', await exportGLBBytes(creature.document), 'model/gltf-binary');
}
