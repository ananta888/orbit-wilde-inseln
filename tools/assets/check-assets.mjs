/** Offline provenance, integrity and mobile-budget checks for bundled GLB data. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = new URL('../../', import.meta.url);
const inventory = JSON.parse(await readFile(new URL('content/assets/third-party.json', root), 'utf8'));
assert.equal(inventory.schemaVersion, 1);
for (const asset of inventory.assets) {
  assert(/^client\/webxr\/assets\/[a-zA-Z0-9_/-]+\.glb$/.test(asset.path));
  assert(['CC0-1.0', 'CC-BY-4.0'].includes(asset.license));
  assert(asset.authors.length && asset.source.startsWith('https://') && asset.licenseUrl.startsWith('https://'));
  const bytes = await readFile(new URL(asset.path, root));
  assert.equal(bytes.length, asset.bytes); assert(bytes.length < 4 * 1024 * 1024, 'Per-model transfer budget');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF'); assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length); assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const length = bytes.readUInt32LE(12), document = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
  assert(!(document.extensionsRequired || []).length, 'No unconfigured runtime decoders');
  for (const resource of [...document.buffers, ...(document.images || [])]) assert(!resource.uri, 'All image/buffer data must be embedded');
  let triangles = 0;
  for (const mesh of document.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4);
    triangles += document.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
    assert(primitive.attributes.JOINTS_0 !== undefined && primitive.attributes.WEIGHTS_0 !== undefined, 'Preserve skinning');
  }
  assert.equal(triangles, asset.triangles); assert(triangles < 20000, 'Initial mount geometry budget');
  assert.equal(document.skins[0].joints.length, asset.bones);
  assert.deepEqual(document.animations.map(clip => clip.name), asset.animations);
  for (const clip of document.animations) {
    assert(clip.channels.length > 0);
    for (const channel of clip.channels) assert(document.nodes[channel.target.node], 'Animation target must exist');
  }
  console.log(`${asset.id}: ${triangles} triangles, ${asset.bones} bones, ${asset.animations.length} clips, ${bytes.length} bytes, integrity/license recorded.`);
}
