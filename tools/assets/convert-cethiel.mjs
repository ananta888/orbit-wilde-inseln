/** Convert the reviewed CC0 dragon_oga.zip's DAE/PNG files; no Blender scripts execute.
 * Usage: node tools/assets/convert-cethiel.mjs SOURCE_DIRECTORY OUTPUT.glb
 * Requires a running Orbit test server, ORBIT_URL and optional CHROMIUM_PATH.
 */
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Expected source directory and output.glb');
const baseURL = process.env.ORBIT_URL || 'http://127.0.0.1:8994';
const files = new Set(['dragon.dae', 'dragon_idle.dae', 'dragon_walk.dae', 'dragon_attack.dae', 'dragon_die.dae', 'dragon.png']);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.route('**/asset-converter', route => route.fulfill({ contentType: 'text/html', body: '<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/addons/"}}</script>' }));
  await page.route('**/import-source/*', async route => {
    const name = basename(new URL(route.request().url()).pathname);
    if (!files.has(name)) return route.abort();
    await route.fulfill({ body: await readFile(resolve(source, name)), contentType: name.endsWith('.png') ? 'image/png' : 'text/xml' });
  });
  await page.goto(baseURL + '/asset-converter');
  const result = await page.evaluate(async () => {
    const T = await import('three');
    const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const loader = new ColladaLoader(), model = (await loader.loadAsync('/import-source/dragon.dae')).scene;
    const clips = [];
    for (const name of ['idle', 'walk', 'attack', 'die']) {
      const animation = (await loader.loadAsync('/import-source/dragon_' + name + '.dae')).scene;
      const clip = animation.animations[0].clone(); clip.name = name;
      for (const track of clip.tracks) {
        const [uuid, property] = track.name.split('.');
        const bone = animation.getObjectByProperty('uuid', uuid), target = model.getObjectByName(bone.name);
        if (!target) throw new Error('Missing animation target ' + bone.name);
        track.name = target.name + '.' + property;
      }
      clips.push(clip.optimize());
    }
    model.traverse(object => {
      if (!object.isMesh) return;
      const old = object.material;
      object.material = new T.MeshStandardMaterial({ map: old.map, color: old.color, roughness: .75, metalness: 0, side: T.DoubleSide });
      object.material.name = 'Cethiel / Drummyfish hand-painted skin';
      // COLLADA stores POSITION as vec3 but its COLOR stream is RGBA. Keep the authored texture.
    });
    model.userData = { source: 'https://opengameart.org/node/96662', authors: ['Cethiel', 'Drummyfish'], license: 'CC0-1.0' };
    const mixer = new T.AnimationMixer(model); mixer.clipAction(clips[0]).play(); mixer.setTime(0); model.updateMatrixWorld(true);
    const glb = await new GLTFExporter().parseAsync(model, { binary: true, animations: clips, onlyVisible: false });
    return Array.from(new Uint8Array(glb));
  });
  await writeFile(output, Buffer.from(result));
  console.log(JSON.stringify({ output, bytes: result.length }));
} finally { await browser.close(); }
