import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Load the real reviewed rig/clips for CPU tests; image decoding needs a browser. */
export async function dragonFixture() {
  const bytes = await readFile(new URL('../../../client/webxr/assets/creatures/arin-cethiel.glb', import.meta.url));
  const length = bytes.readUInt32LE(12), doc = JSON.parse(bytes.subarray(20, 20 + length));
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  for (const key of ['images', 'textures', 'samplers', 'materials']) delete doc[key];
  const json = Buffer.from(JSON.stringify(doc)), padded = (json.length + 3) & ~3;
  const glb = Buffer.alloc(20 + padded + bytes.length - 20 - length, 32);
  bytes.copy(glb, 0, 0, 20); glb.writeUInt32LE(glb.length, 8); glb.writeUInt32LE(padded, 12);
  json.copy(glb, 20); bytes.copy(glb, 20 + padded, 20 + length);
  const asset = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length), '');
  const root = new THREE.Group(); root.add(asset.scene);
  asset.scene.rotation.y = Math.PI; asset.scene.scale.setScalar(6.8); asset.scene.position.set(0, -.25, .45);
  return { root, model: asset.scene, clips: asset.animations };
}
