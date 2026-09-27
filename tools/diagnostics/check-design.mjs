import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
await mkdir('.local', { recursive: true });
async function revision() { return page.evaluate(() => window.design.client.document.revision); }
async function changed(old) { await page.waitForFunction(r => window.design.client.document.revision > r, old, { timeout: 30000 }); }
async function pointOnCreature() {
  return page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.js'), w = window.design;
    w.scene.updateMatrixWorld(true);
    const meshes = [...w.creature.meshes.values()], ray = new THREE.Raycaster();
    const mesh = w.creature.meshes.get('torso') || meshes[0];
    mesh.geometry.computeBoundingSphere();
    const world = mesh.localToWorld(mesh.geometry.boundingSphere.center.clone());
    const p = world.project(w.camera);
    ray.setFromCamera(new THREE.Vector2(p.x, p.y), w.camera);
    const hit = ray.intersectObjects(meshes)[0];
    if (!hit) throw Error('Visible creature surface required');
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2, region: hit.object.userData.region };
  });
}
try {
  await page.goto((process.env.ORBIT_URL || 'http://127.0.0.1:8876') + '/designer/index.html');
  await page.evaluate(async () => { window.design = (await import('/src/design/workspace.js')).workspace; });
  await page.waitForFunction(() => window.design.client.document);
  const point = await pointOnCreature();
  const baseline = await page.evaluate(id => Array.from(window.design.client.document.regions.get(id).positions), point.region);
  let old = await revision();
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 3, point.y - 3, { steps: 4 });
  await page.mouse.up(); await changed(old);
  const edited = await page.evaluate(id => Array.from(window.design.client.document.regions.get(id).positions), point.region);
  assert.notDeepEqual(edited, baseline, 'real pointer stroke must edit geometry');
  old = await revision(); await page.locator('#undo').click(); await changed(old);
  assert.deepEqual(await page.evaluate(id => Array.from(window.design.client.document.regions.get(id).positions), point.region), baseline);
  old = await revision(); await page.locator('#redo').click(); await changed(old);
  assert.deepEqual(await page.evaluate(id => Array.from(window.design.client.document.regions.get(id).positions), point.region), edited);
  await page.locator('#instruction').fill('Mach diesen Bereich 20 Prozent größer');
  await page.locator('#propose').click();
  await page.waitForFunction(() => !!window.design.client.preview);
  assert(await page.locator('#assistant-text').innerText().then(t => t.includes('kein LLM')));
  await page.locator('#blend').evaluate(element => { element.value = '.5'; element.dispatchEvent(new Event('input')); });
  const proposal = await page.evaluate(id => Array.from(window.design.client.preview.regions.get(id).positions), point.region);
  old = await revision(); await page.locator('#accept').click(); await changed(old);
  assert.equal(await page.evaluate(() => window.design.creature.root.visible), true);
  const blended = await page.evaluate(id => Array.from(window.design.client.document.regions.get(id).positions), point.region);
  assert.deepEqual(blended, Array.from(new Float32Array(edited.map((v, i) => v + (proposal[i] - v) * .5))));
  old = await revision();
  const materialVersion = await page.evaluate(() => window.design.creature.meshes.get('head').material.version);
  await page.evaluate(() => {
    const region = window.design.client.document.regions.get('head');
    return window.design.client.command({ tool: 'paint', regions: ['head'], samples: [Array.from(region.positions.slice(0, 3))],
      radius: .3, strength: 1, channel: 'opacity', value: .35 });
  });
  await changed(old);
  assert.equal(await page.evaluate(() => window.design.creature.meshes.get('head').material.transparent), true);
  assert(await page.evaluate(v => window.design.creature.meshes.get('head').material.version > v, materialVersion));
  const saved = await page.evaluate(() => ({ id: window.design.client.document.id, revision: window.design.client.document.revision }));
  await page.reload();
  await page.evaluate(async () => { window.design = (await import('/src/design/workspace.js')).workspace; });
  await page.waitForFunction(v => window.design.client.document?.id === v.id && window.design.client.document?.revision === v.revision, saved);
  await page.screenshot({ path: '.local/design-verified.png' });
  assert.deepEqual(errors, []);
  console.log('Design browser: real pointer sculpt, delta, undo/redo, proposal/accept, autosave/reload passed.');
} finally { await browser.close(); }
