import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1200, height: 900 } });
const emulator = await readFile(new URL('../../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8');
await context.addInitScript({ content: emulator + '\nwindow.xrDevice = new IWER.XRDevice(IWER.metaQuest3); window.xrDevice.installRuntime({forceInstall:true}); window.xrDevice.position.set(0,1.65,0);' });
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto((process.env.ORBIT_URL || 'http://127.0.0.1:8876') + '/designer/index.html');
  await page.evaluate(async () => { window.design = (await import('/src/design/workspace.js')).workspace; });
  await page.waitForFunction(() => window.design.client.document);
  await page.locator('#vr').click();
  await page.waitForFunction(() => window.design.renderer.xr.isPresenting);
  assert.equal(await page.evaluate(() => window.design.renderer.xr.getCamera().cameras.length), 2);
  const before = await page.evaluate(() => window.design.client.document.revision);
  await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.js'), w = window.design;
    w.scene.updateMatrixWorld(true);
    const mesh = w.creature.meshes.get('head'); mesh.geometry.computeBoundingSphere();
    const target = mesh.localToWorld(mesh.geometry.boundingSphere.center.clone());
    const from = target.clone().add(new THREE.Vector3(0, .12, .15));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), target.sub(from).normalize());
    window.xrDevice.controllers.right.position.set(...from.toArray());
    window.xrDevice.controllers.right.quaternion.set(q.x, q.y, q.z, q.w);
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('trigger', 1));
  await page.waitForFunction(() => !!window.design.stroke);
  await page.evaluate(() => { window.xrDevice.controllers.right.position.x += .006; });
  await page.waitForTimeout(120);
  await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('trigger', 0));
  await page.waitForFunction(r => window.design.client.document.revision > r, before);
  const edited = await page.evaluate(() => window.design.client.document.revision);
  await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('trigger', 1));
  await page.waitForFunction(() => !!window.design.stroke);
  await page.evaluate(() => window.xrDevice.updateVisibilityState('visible-blurred'));
  await page.waitForFunction(() => !window.design.stroke);
  await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('trigger', 0));
  assert.equal(await page.evaluate(() => window.design.client.document.revision), edited, 'focus cancellation must not commit');
  await page.evaluate(() => window.xrDevice.updateVisibilityState('visible'));
  await page.evaluate(() => {
    window.xrDevice.primaryInputMode = 'hand';
    window.xrDevice.hands.right.position.set(.2, 1.3, -.8);
  });
  await page.waitForFunction(() => [0, 1].some(i => window.design.renderer.xr.getHand(i).userData.source?.handedness === 'right'));
  await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.js'), w = window.design;
    const hand = [0, 1].map(i => w.renderer.xr.getHand(i)).find(h => h.userData.source?.handedness === 'right');
    const finger = hand.joints['index-finger-tip'].getWorldPosition(new THREE.Vector3());
    const mesh = w.creature.meshes.get('head');
    const center = mesh.localToWorld(mesh.geometry.boundingSphere.center.clone());
    const viewer = w.renderer.xr.getCamera().getWorldPosition(new THREE.Vector3());
    const target = center.clone().addScaledVector(viewer.sub(center).normalize(), .09);
    const delta = target.sub(finger);
    const p = window.xrDevice.hands.right.position;
    p.set(p.x + delta.x, p.y + delta.y, p.z + delta.z);
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => window.xrDevice.hands.right.updatePinchValue(1));
  await page.waitForFunction(() => !!window.design.stroke, null, { timeout: 8000 });
  await page.evaluate(() => window.xrDevice.hands.right.updatePinchValue(0));
  await page.waitForFunction(r => window.design.client.document.revision > r, edited);
  await page.evaluate(() => window.xrDevice.activeSession.end());
  await page.waitForFunction(() => !window.design.renderer.xr.isPresenting);
  await page.locator('#mr').click();
  await page.waitForFunction(() => window.design.renderer.xr.isPresenting);
  assert.equal(await page.evaluate(() => window.design.renderer.getClearAlpha()), 0);
  assert.equal(await page.evaluate(() => window.design.scene.background), null);
  await page.evaluate(() => window.xrDevice.activeSession.end());
  await page.waitForFunction(() => !window.design.renderer.xr.isPresenting);
  assert.deepEqual(errors, []);
  console.log('Emulated Quest: stereo VR, controller and hand-pinch sculpt, server commit, focus cancellation, MR transparency and exit passed. Physical hands/passthrough remain unverified.');
} finally { await browser.close(); }
