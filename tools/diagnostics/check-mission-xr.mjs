import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('.local', { recursive: true });
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
async function aimAt(index, hand = false) {
  await page.evaluate(async ({ index, hand }) => {
    const THREE = await import('/vendor/three.module.js'), view = window.orbitView;
    const from = new THREE.Vector3(.2, 1.4, -.25), target = view.missions.buttons[index].mesh.getWorldPosition(new THREE.Vector3());
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), target.sub(from).normalize());
    const source = (hand ? window.xrDevice.hands : window.xrDevice.controllers).right;
    source.position.set(...from.toArray()); source.quaternion.set(...q.toArray());
  }, { index, hand });
  await page.waitForFunction(index => window.orbitView.handMenu.states.get('right')?.target?.item === window.orbitView.missions.buttons[index], index);
}
try {
  await page.goto(process.env.ORBIT_URL || 'http://127.0.0.1:8765', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    window.orbitView = (await import('/src/app.js')).view; window.testInputEvents = [];
    for (const controller of window.orbitView.controllers) for (const type of ['selectstart', 'select', 'selectend']) {
      controller.addEventListener(type, () => {
        const state = window.orbitView.handMenu.states.get(controller.userData.source?.handedness);
        window.testInputEvents.push({ type, visible: controller.visible, connected: controller.userData.source?.gamepad?.connected,
          focus: window.orbitView.renderer.xr.getSession()?.visibilityState, target: state?.target?.key, pressed: state?.selection.pressed?.key });
      });
    }
  });
  await page.waitForFunction(() => !document.getElementById('mr').disabled);
  await page.locator('#mr').click();
  await page.waitForFunction(() => window.orbitView.state.phase === 'playing' && window.orbitView.renderer.xr.isPresenting);
  await page.waitForFunction(() => window.orbitView.inputVisuals.ready);
  assert.equal(await page.evaluate(() => window.orbitView.missions.root.visible), false);
  await page.evaluate(() => window.xrDevice.controllers.left.updateButtonValue('x-button', 1));
  await page.waitForFunction(() => window.orbitView.missions.root.visible);
  await page.evaluate(() => window.xrDevice.controllers.left.updateButtonValue('x-button', 0));
  const resting = await page.evaluate(() => window.orbitView.missions.root.matrixWorld.elements.slice());
  await page.evaluate(() => { window.xrDevice.position.x += .08; window.xrDevice.controllers.left.position.y -= .2; });
  await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(() => window.orbitView.missions.root.matrixWorld.elements.slice()), resting, 'Open panel must stay still when wrist and head move');
  assert(await page.evaluate(async () => {
    const T = await import('three'), v = window.orbitView;
    const panel = v.missions.root, head = v.camera.getWorldPosition(new T.Vector3());
    const toHead = head.sub(panel.getWorldPosition(new T.Vector3())).normalize();
    return new T.Vector3(0, 0, 1).applyQuaternion(panel.getWorldQuaternion(new T.Quaternion())).dot(toHead) > .96 && v.missions.surface.caption.width === .42;
  }), 'Panel faces the head at a bounded physical size');
  await aimAt(0);
  // Native WebXR may end an action without select (for example when tracking is lost).
  // IWER's legacy runtime emits a different order, so exercise this contract explicitly.
  await page.evaluate(() => {
    const controller = window.orbitView.controllers.find(c => c.userData.source?.handedness === 'right');
    controller.dispatchEvent({ type: 'selectstart' });
    controller.dispatchEvent({ type: 'selectend' });
  });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.orbitView.missions.packet.active), null, 'Bare selectend cancels a captured UI action');
  assert.equal(await page.evaluate(() => window.orbitView.handMenu.states.get('right').selection.pressed), null);
  await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('trigger', 1));
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.orbitView.missions.packet.active), null, 'Press alone must not choose');
  await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('trigger', 0));
  await page.waitForFunction(() => window.orbitView.missions.packet.active?.id === 'language_001_bridge');
  assert.equal(await page.evaluate(() => window.orbitView.state.shots), 0);
  await page.evaluate(() => {
    window.xrDevice.primaryInputMode = 'hand';
    window.xrDevice.hands.left.position.set(-.2, 1.3, -.4); window.xrDevice.hands.right.position.set(.2, 1.4, -.25);
    window.xrDevice.hands.right.updatePinchValue(0);
  });
  await page.waitForFunction(() => window.orbitView.inputVisuals.handSkins.get('right').root.visible);
  assert.equal(await page.evaluate(() => window.orbitView.inputVisuals.handSkins.get('right').bones.size), 25);
  await aimAt(0, true);
  await page.waitForFunction(() => window.orbitView.handMenu.states.get('right').pinch.armed);
  await page.evaluate(() => window.xrDevice.hands.right.updatePinchValue(1));
  await page.waitForFunction(() => window.orbitView.handMenu.states.get('right').pinch.down);
  assert.equal(await page.evaluate(() => window.orbitView.missions.packet.active.phase), 'discover');
  await page.evaluate(() => window.xrDevice.hands.right.updatePinchValue(0));
  await page.waitForFunction(() => window.orbitView.missions.packet.active.phase === 'movement');
  await page.evaluate(() => { window.xrDevice.hands.right.poseId = 'point'; });
  await page.waitForTimeout(400);
  async function fingertip(depth) {
    await page.evaluate(async depth => {
      const T = await import('three'), v = window.orbitView;
      const entry = v.inputVisuals.entries.find(item => item.source?.handedness === 'right');
      const tip = entry.hand.joints['index-finger-tip'].getWorldPosition(new T.Vector3());
      const button = v.missions.buttons[0].mesh;
      const target = button.getWorldPosition(new T.Vector3()).addScaledVector(new T.Vector3(0, 0, 1).applyQuaternion(button.getWorldQuaternion(new T.Quaternion())), depth);
      const delta = target.sub(tip), hand = window.xrDevice.hands.right;
      hand.position.set(hand.position.x + delta.x, hand.position.y + delta.y, hand.position.z + delta.z);
    }, depth);
    await page.waitForTimeout(220);
  }
  await fingertip(.028); await fingertip(.001);
  await page.waitForFunction(() => window.orbitView.missions.packet.active.inventory.includes('plank_a'));
  assert.equal(await page.evaluate(() => window.orbitView.state.shots), 0);
  assert.deepEqual(await page.evaluate(() => window.orbitView.state.player), [0, 0, 0]);
  assert.equal(await page.evaluate(() => window.orbitView.renderer.getClearAlpha()), 0);
  await page.screenshot({ path: '.local/mission-hand-menu-emulated.png' });
  assert.deepEqual(errors, []);
  console.log('Emulated Quest checks passed: wrist menu, stable readable panel, native cancellation, release confirmation, 25 tracked joints, hand pinch and direct fingertip touch, no accidental arrow, stationary MR.');
} catch (error) {
  console.error(await page.evaluate(() => ({ events: window.testInputEvents, mission: window.orbitView?.missions.packet, phase: window.orbitView?.state?.phase })), errors);
  throw error;
} finally { await browser.close(); }
