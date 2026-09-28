/** Fixed offline data processor. Invoked only by the bounded Python runner. */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Document, NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds, dedup, join, simplify, copyToDocument, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import validator from 'gltf-validator';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { BoxGeometry } from 'three';

const workspace = process.cwd();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const allowedExtensions = new Set(ALL_EXTENSIONS.map(e => e.EXTENSION_NAME));
// These require configured codecs or an instance-aware bounds analyzer.
// Reject rather than dropping their data or underestimating rendered resources.
for (const name of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu', 'EXT_mesh_gpu_instancing']) allowedExtensions.delete(name);
const MAX = 64 * 1024 * 1024;
function assert(condition, message) { if (!condition) throw Error(message); }
function local(name) {
  assert(typeof name === 'string' && name.length <= 240 && !/[\\:%\x00]/.test(name) && !path.isAbsolute(name)
    && name.split('/').every(p => p && p !== '.' && p !== '..'), 'Unsafe resource path');
  return path.join(workspace, name);
}
async function bytes(name) {
  const p = local(name), info = await stat(p); assert(info.isFile() && info.size <= MAX, 'Resource size budget');
  return new Uint8Array(await readFile(p));
}
function glbJSON(buffer) {
  const v = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  assert(buffer.length >= 20 && v.getUint32(0, true) === 0x46546c67 && v.getUint32(4, true) === 2
    && v.getUint32(8, true) === buffer.length && v.getUint32(16, true) === 0x4e4f534a, 'Invalid GLB header');
  const size = v.getUint32(12, true); assert(size < 16 * 1024 * 1024 && size + 20 <= buffer.length, 'GLB JSON budget');
  return JSON.parse(new TextDecoder().decode(buffer.subarray(20, 20 + size)));
}
function preflight(json) {
  assert(json.asset?.version === '2.0', 'Only glTF 2.0 is supported');
  for (const name of [...json.extensionsUsed || [], ...json.extensionsRequired || []])
    assert(allowedExtensions.has(name), 'Unsupported extension: ' + name);
  for (const key of ['nodes', 'meshes', 'accessors', 'bufferViews']) assert((json[key]?.length || 0) <= 10000, key + ' budget');
  assert((json.materials?.length || 0) <= 256 && (json.images?.length || 0) <= 64, 'Material/texture budget');
  assert((json.animations?.length || 0) <= 128 && (json.skins?.length || 0) <= 64, 'Animation/skin budget');
  let elements = 0;
  for (const a of json.accessors || []) {
    assert(Number.isSafeInteger(a.count) && a.count >= 0 && a.count <= 2000000, 'Accessor budget'); elements += a.count;
  }
  assert(elements <= 12000000, 'Total accessor budget');
  for (const m of json.meshes || []) for (const p of m.primitives) assert((p.mode ?? 4) === 4, 'Only triangle primitives are supported');
}
async function validate(data, externalResourceFunction, repairHint = false) {
  const report = await validator.validateBytes(data, { maxIssues: 80, externalResourceFunction });
  const errors = report.issues.messages.filter(m => m.severity === 0);
  assert(!report.issues.numErrors || repairHint && errors.length === report.issues.numErrors && errors.every(m => m.code === 'SKIN_SKELETON_INVALID'),
    'glTF validation: ' + errors.slice(0, 3).map(m => m.code).join(', '));
  if (errors.length) return errors.map(m => m.pointer);
  return report.issues.messages.filter(m => m.severity === 1).map(m => m.code);
}
async function loadGLTF(entry) {
  const data = await bytes(entry), binary = entry.toLowerCase().endsWith('.glb');
  const json = binary ? glbJSON(data) : JSON.parse(new TextDecoder().decode(data)); preflight(json);
  const resources = {};
  for (const r of [...json.buffers || [], ...json.images || []]) {
    if (!r.uri) continue;
    assert(!binary, 'GLB must embed all resources');
    // Only explicit local files in the validated package. No data URIs, URLs or traversal.
    const full = path.posix.join(path.posix.dirname(entry), r.uri); local(r.uri);
    resources[r.uri] = await bytes(full);
  }
  const hints = await validate(data, async uri => { assert(resources[uri], 'Missing local resource'); return resources[uri]; }, true);
  const doc = await (binary ? io.readBinary(data) : io.readJSON({ json, resources }));
  const repaired = [];
  for (const pointer of hints) if (/^\/skins\/\d+\/skeleton$/.test(pointer)) {
    doc.getRoot().listSkins()[Number(pointer.split('/')[2])].setSkeleton(null);
    repaired.push('Removed invalid optional skin.skeleton hint; joints, inverse binds and clips retained');
  }
  if (repaired.length) doc.getRoot().setExtras({ ...doc.getRoot().getExtras(), orbitRepairs: repaired });
  return doc;
}
function geometryDocument(geometries) {
  const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene('Imported'); doc.getRoot().setDefaultScene(scene);
  for (const [name, geometry, color] of geometries) {
    assert(geometry.attributes.position.count <= 1000000, 'Geometry budget');
    const primitive = doc.createPrimitive();
    for (const [attribute, semantic, type] of [['position', 'POSITION', 'VEC3'], ['normal', 'NORMAL', 'VEC3'], ['uv', 'TEXCOORD_0', 'VEC2'], ['color', 'COLOR_0', 'VEC3']]) {
      const a = geometry.attributes[attribute];
      if (a) primitive.setAttribute(semantic, doc.createAccessor().setType(type).setArray(new Float32Array(a.array)).setBuffer(buffer));
    }
    if (geometry.index) primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(geometry.index.array)).setBuffer(buffer));
    primitive.setMaterial(doc.createMaterial(name).setBaseColorFactor([...color, 1]).setMetallicFactor(0).setRoughnessFactor(.8));
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive)));
  }
  return doc;
}
async function loadMaterial() {
  const names = (await readdir(workspace, { recursive: true })).sort(), images = names.filter(n => /\.(jpg|jpeg|png|webp)$/i.test(n));
  const used = new Set();
  const choose = pattern => images.find(n => pattern.test(n));
  const color = choose(/(?:color|diff|albedo)/i); assert(color, 'Material package has no color map');
  const doc = geometryDocument([['Material sample (one metre)', new BoxGeometry(1, 1, 1), [1, 1, 1]]]);
  const material = doc.getRoot().listMaterials()[0];
  async function texture(name) {
    used.add(name);
    const data = await bytes(name); const meta = await sharp(data, { limitInputPixels: 67108864 }).metadata();
    assert(!meta.pages || meta.pages === 1, 'Animated images are not supported');
    return doc.createTexture(name).setImage(new Uint8Array(await sharp(data).png().toBuffer())).setMimeType('image/png');
  }
  material.setBaseColorTexture(await texture(color));
  const normal = choose(/(?:normalgl|nor_gl|^normal\.)/i); if (normal) material.setNormalTexture(await texture(normal));
  const occlusion = choose(/(?:ambientocclusion|occlusion|_ao\.)/i);
  if (occlusion) material.setOcclusionTexture(await texture(occlusion));
  const rough = choose(/rough/i), metal = choose(/metal/i);
  if (rough) {
    used.add(rough); if (metal) used.add(metal);
    const source = sharp(await bytes(rough), { limitInputPixels: 67108864 });
    const meta = await source.metadata();
    const green = await source.removeAlpha().greyscale().raw().toBuffer();
    const blue = metal ? await sharp(await bytes(metal)).resize(meta.width, meta.height).removeAlpha().greyscale().raw().toBuffer() : new Uint8Array(green.length);
    const rgb = new Uint8Array(green.length * 3);
    for (let i = 0; i < green.length; i++) { rgb[i * 3] = 255; rgb[i * 3 + 1] = green[i]; rgb[i * 3 + 2] = blue[i]; }
    const image = await sharp(rgb, { raw: { width: meta.width, height: meta.height, channels: 3 } }).png().toBuffer();
    material.setMetallicRoughnessTexture(doc.createTexture('metallic-roughness').setImage(new Uint8Array(image)).setMimeType('image/png'));
    material.setMetallicFactor(metal ? 1 : 0);
  }
  const omitted = images.filter(name => !used.has(name));
  doc.getRoot().setExtras({ orbitRepairs: omitted.map(name => 'Source-only map (not applied to GLB): ' + name) });
  return doc;
}
async function load(entry, kind) {
  if (kind === 'material') return loadMaterial();
  if (/\.gl(b|tf)$/i.test(entry)) return loadGLTF(entry);
  if (/\.stl$/i.test(entry)) {
    const data = await bytes(entry); return geometryDocument([['STL', new STLLoader().parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.length)), [.6, .65, .6]]]);
  }
  if (/\.obj$/i.test(entry)) {
    const text = new TextDecoder().decode(await bytes(entry));
    assert(!/^\s*mtllib\s/m.test(text), 'OBJ with MTL requires conversion to glTF; materials are not discarded');
    const root = new OBJLoader().parse(text), geometries = [];
    root.traverse(o => { if (o.isMesh) geometries.push([o.name || 'OBJ', o.geometry, [.6, .65, .6]]); });
    return geometryDocument(geometries);
  }
  throw Error('No safe converter is configured for this format; export GLB from your authoring tool to import here');
}
function normalize(doc, options) {
  if (options.scale === 1 && options.up === 'Y') return;
  for (const scene of doc.getRoot().listScenes()) {
    const root = doc.createNode('Orbit unit/axis normalization').setScale([options.scale, options.scale, options.scale]);
    if (options.up === 'Z') root.setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
    for (const child of scene.listChildren()) root.addChild(child);
    scene.addChild(root);
  }
}
async function analyze(doc, fileBytes) {
  const root = doc.getRoot(), nodes = root.listNodes(), meshes = root.listMeshes(), skins = root.listSkins();
  let vertices = 0, triangles = 0, primitives = 0, morphTargets = 0;
  for (const mesh of meshes) for (const p of mesh.listPrimitives()) {
    vertices += p.getAttribute('POSITION').getCount(); triangles += (p.getIndices() || p.getAttribute('POSITION')).getCount() / 3;
    primitives++; morphTargets += p.listTargets().length;
  }
  assert(vertices <= 1000000 && triangles <= 2000000, 'Geometry budget');
  let geometryBytes = 0;
  for (const accessor of root.listAccessors()) {
    const a = accessor.getArray(); geometryBytes += a.byteLength;
    assert(a.every(Number.isFinite), 'Non-finite geometry/animation');
  }
  const textures = [];
  for (const t of root.listTextures()) {
    const image = t.getImage(); assert(image && image.length <= MAX, 'Texture byte budget');
    const m = await sharp(image, { limitInputPixels: 67108864 }).metadata();
    assert(m.width && m.height && m.width <= 8192 && m.height <= 8192 && (!m.pages || m.pages === 1), 'Texture pixel budget');
    textures.push({ name: t.getName(), resolution: [m.width, m.height], mimeType: t.getMimeType(), bytes: image.length });
  }
  const animations = root.listAnimations().map((a, index) => ({ id: 'clip_' + createHash('sha256').update(JSON.stringify(a.listChannels().map(c => ({
    target: c.getTargetNode()?.getName(), path: c.getTargetPath(), interpolation: c.getSampler().getInterpolation(),
    time: Array.from(c.getSampler().getInput().getArray()), values: Array.from(c.getSampler().getOutput().getArray()) })))).digest('hex'), index, name: a.getName() || 'Clip ' + index,
    duration: Math.max(0, ...a.listSamplers().map(s => Math.max(...s.getInput().getMax([])))), channels: a.listChannels().length,
    targets: a.listChannels().map(c => c.getTargetNode()?.getName() || ''), tags: animationTags(a.getName()) }));
  const drawCalls = nodes.reduce((n, node) => n + (node.getMesh()?.listPrimitives().length || 0), 0);
  const renderTriangles = nodes.reduce((n, node) => n + (node.getMesh()?.listPrimitives() || []).reduce((sum, p) => sum + (p.getIndices() || p.getAttribute('POSITION')).getCount() / 3, 0), 0);
  // Count ordinary node instances before the vertex-by-vertex bounds traversal.
  assert(drawCalls <= 2048 && renderTriangles <= 2000000, 'Instantiated geometry budget');
  const bounds = meshes.length && root.getDefaultScene() ? getBounds(root.getDefaultScene()) : { min: [0, 0, 0], max: [0, 0, 0] };
  assert([...bounds.min, ...bounds.max].every(Number.isFinite), 'Invalid bounding box');
  const joints = [...new Set(skins.flatMap(s => s.listJoints()))];
  const bones = joints.map((n, index) => ({ index, name: n.getName(), parent: joints.indexOf(n.getParentNode()),
    translation: n.getTranslation(), rotation: n.getRotation(), scale: n.getScale() }));
  return { geometry: { vertices, triangles, renderTriangles, meshes: meshes.length, primitives }, bounds: { ...bounds, size: bounds.max.map((x, i) => x - bounds.min[i]), pose: 'rest' },
    materials: root.listMaterials().map(m => ({ name: m.getName(), pbr: !m.getExtension('KHR_materials_unlit'), alphaMode: m.getAlphaMode(), doubleSided: m.getDoubleSided() })),
    textures, skeleton: { present: skins.length > 0, bones: bones.length, joints: bones, skins: skins.length, skinning: nodes.some(n => n.getSkin()) },
    animations, morphTargets, pbr: root.listMaterials().every(m => !m.getExtension('KHR_materials_unlit')), drawCalls, fileBytes,
    classes: [...(skins.length ? ['rigged'] : ['static']), ...(animations.length ? ['animated'] : []), ...(morphTargets ? ['morph-target'] : [])],
    memory: { geometryBytes, textureBytes: Math.ceil(textures.reduce((n, t) => n + t.resolution[0] * t.resolution[1] * 4 * 4 / 3, 0)) },
    semanticRig: dragonRig(bones), warnings: [] };
}
function animationTags(name) {
  const tags = ['idle','walk','run','takeoff','flight','glide','turn-left','turn-right','climb','dive','landing','attack','roar','bite','tail-attack','sleep'];
  const normalized = name.toLowerCase().replace(/[ _]/g, '-');
  return tags.filter(t => normalized.includes(t) || (t === 'flight' && /fly|flying/.test(normalized)));
}
function dragonRig(bones) {
  const mapping = {};
  for (const part of ['head','neck','spine','tail','jaw','eyes','left-wing','right-wing','legs','feet']) {
    const terms = part.split('-');
    mapping[part] = bones.filter(b => terms.every(term => b.name.toLowerCase().includes(term))).map(b => b.index);
  }
  return { profile: 'dragon-v1', mapping, status: 'name-hints-unverified', riderPosition: null };
}
async function optimize(doc, profile) {
  const before = await analyze(doc, 0);
  await doc.transform(dedup());
  // Skin/morph/custom attribute topology stays exact. Original buffers always remain cached.
  const protectedData = before.skeleton.present || before.morphTargets || before.animations.length ||
    doc.getRoot().listMeshes().some(m => m.listPrimitives().some(p => p.listSemantics().some(s => s.startsWith('_'))));
  if (!protectedData) {
    await MeshoptSimplifier.ready;
    const ratio = Math.min(profile.ratio, profile.triangles / Math.max(1, before.geometry.triangles));
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: .001 }), join());
  }
  for (const t of doc.getRoot().listTextures()) {
    const input = t.getImage(), meta = await sharp(input, { limitInputPixels: 67108864 }).metadata();
    if (Math.max(meta.width, meta.height) > profile.textureSize) {
      const out = await sharp(input).resize(profile.textureSize, profile.textureSize, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      t.setImage(new Uint8Array(out)).setMimeType('image/png');
    }
  }
  return protectedData ? ['Protected skin/morph/animation/custom data: geometry simplification skipped'] : [];
}
async function retarget(doc, options) {
  const source = await loadGLTF(options.source), root = doc.getRoot();
  const clip = source.getRoot().listAnimations()[options.clip]; assert(clip, 'Animation clip not found');
  const targets = new Map(root.listNodes().map(n => [n.getName(), n]));
  assert(targets.size === root.listNodes().length, 'Retargeting needs unique target node names');
  const [copy] = [copyToDocument(doc, source, [clip]).get(clip)];
  for (const channel of copy.listChannels()) {
    const sourceNode = channel.getTargetNode(), targetName = options.mapping[sourceNode.getName()], target = targets.get(targetName);
    assert(target && sourceNode && channel.getTargetPath() === 'rotation', 'Retargeting supports explicitly mapped rotation clips only');
    assert(sourceNode.getRotation().every((v, i) => Math.abs(v - target.getRotation()[i]) < 1e-5), 'Different rest orientations require a rig-specific retargeter');
    channel.setTargetNode(target);
  }
  copy.setName(clip.getName() + ' (mapped)');
}
try {
  const options = JSON.parse(await readFile(local('job.json'), 'utf8'));
  let doc = await load(options.entry, options.kind); doc.setLogger(new Logger(Logger.Verbosity.SILENT));
  const root = doc.getRoot(), extras = root.getExtras(), inherited = [extras.orbitLicense, ...(extras.orbitSourceLicenses || []),
    ...root.listNodes().flatMap(n => { const source = n.getExtras().orbitCreature?.provenance?.asset;
      return [source?.license, ...(source?.sourceLicenses || [])]; }), ...(options.sourceLicenses || [])].filter(Boolean);
  const bySource = new Map();
  for (const license of inherited) {
    const { modifications, downloadDate, ...identity } = license;
    const key = JSON.stringify(identity), previous = bySource.get(key);
    bySource.set(key, previous ? { ...license, downloadDate: previous.downloadDate || downloadDate,
      modifications: [...new Set([...(previous.modifications || []), ...(modifications || [])])] } : license);
  }
  const sourceLicenses = [...bySource.values()]; assert(sourceLicenses.length <= 32, 'Embedded license budget');
  if (options.license) root.setExtras({ ...extras, orbitLicense: options.license, orbitSourceLicenses: sourceLicenses });
  normalize(doc, options.normalize || { scale: 1, up: 'Y' });
  let warnings = [...extras.orbitRepairs || []];
  if (options.profile) warnings.push(...await optimize(doc, options.profile));
  if (options.retarget) await retarget(doc, options.retarget);
  await doc.transform(unpartition());
  const output = await io.writeBinary(doc); assert(output.length <= MAX, 'Canonical file budget');
  warnings.push(...await validate(output));
  const report = await analyze(doc, output.length); report.warnings = warnings; report.sourceLicenses = sourceLicenses;
  await writeFile(local('output.glb'), output);
  await writeFile(local('report.json'), JSON.stringify(report));
} catch (error) {
  process.stderr.write(String(error.message).slice(0, 2000)); process.exitCode = 1;
}
