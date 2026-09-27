import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1000, height: 750 }, deviceScaleFactor: .7 });
const emulator = await readFile(new URL('../../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8');
await context.addInitScript({ content: emulator + `
  window.xrDevice = new IWER.XRDevice(IWER.metaQuest3); window.xrDevice.installRuntime({ forceInstall: true });
  window.xrDevice.position.set(0, 1.65, 0);
  window.xrDevice.controllers.left.position.set(-.2, 1.4, -.4);
  window.xrDevice.controllers.right.position.set(.2, 1.4, -.4);
` });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(process.env.ORBIT_URL || 'http://127.0.0.1:8765', { waitUntil: 'networkidle' });
  await page.evaluate(async () => { window.orbitView = (await import('/src/app.js')).view; });
  await page.waitForFunction(() => !document.getElementById('mr').disabled);
  await page.locator('#mr').click();
  await page.waitForFunction(() => window.orbitView.state.phase === 'playing' && window.orbitView.renderer.xr.isPresenting);
  assert.equal(await page.evaluate(() => window.orbitView.missions.root.visible), false);
  await page.evaluate(() => window.xrDevice.controllers.left.updateButtonValue('x-button', 1));
  await page.waitForFunction(() => window.orbitView.missions.root.visible);
  await page.evaluate(() => window.xrDevice.controllers.left.updateButtonValue('x-button', 0));
  await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.js'), view = window.orbitView;
    const from = new THREE.Vector3(.2, 1.4, -.4), target = view.missions.buttons[0].mesh.getWorldPosition(new THREE.Vector3());
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), target.sub(from).normalize());
    window.xrDevice.controllers.right.position.set(...from.toArray()); window.xrDevice.controllers.right.quaternion.set(q.x, q.y, q.z, q.w);
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('trigger', 1));
  await page.waitForFunction(() => window.orbitView.missions.packet.active?.id === 'language_001_bridge');
  await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('trigger', 0));
  assert.equal(await page.evaluate(() => window.orbitView.state.shots), 0, 'Choosing a mission must not release an arrow');
  await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.js'), ui = window.orbitView.missions;
    const point = ui.buttons[0].mesh.getWorldPosition(new THREE.Vector3());
    const hand = { visible: true, joints: {
      'index-finger-tip': { getWorldPosition: target => target.copy(point) },
      'thumb-tip': { getWorldPosition: target => target.copy(point).add(new THREE.Vector3(.01, 0, 0)) },
    }};
    ui.update(window.orbitView.camera, [hand], true, true);
  });
  await page.waitForFunction(() => window.orbitView.missions.packet.active.phase === 'movement');
  assert.deepEqual(await page.evaluate(() => window.orbitView.state.player), [0, 0, 0]);
  assert.equal(await page.evaluate(() => window.orbitView.renderer.getClearAlpha()), 0);
  assert.deepEqual(errors, []);
  console.log('Mission XR checks passed: explicit menu toggle, controller selection, direct pinch, no accidental shot, stationary MR.');
} finally { await browser.close(); }
