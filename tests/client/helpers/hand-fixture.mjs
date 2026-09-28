import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HandSkin } from '../../../client/webxr/src/xr/hand-pose.js';

/** The actual bundled, texture-free WebXR hand mesh, including skin weights. */
export async function handFixture(side) {
  const bytes = await readFile(new URL(`../../../client/webxr/vendor/xr-profiles/generic-hand/${side}.glb`, import.meta.url));
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  const skin = new HandSkin(asset, new THREE.MeshStandardMaterial());
  skin.attachToGrip(side);
  return skin;
}
