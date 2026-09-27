import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const destination = new URL('client/webxr/vendor/', root);
await mkdir(destination, { recursive: true });
for (const name of ['three.core.js', 'three.module.js']) await copyFile(new URL(`node_modules/three/build/${name}`, root), new URL(name, destination));
await copyFile(new URL('node_modules/three/LICENSE', root), new URL('LICENSE', destination));
console.log('Pinned Three.js copied locally with its MIT license; no runtime CDN.');
