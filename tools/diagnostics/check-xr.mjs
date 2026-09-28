import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1100, height: 780 } });
const emulator = await readFile(new URL('../../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8');
await context.addInitScript({ content: emulator + `
  window.xrDevice = new IWER.XRDevice(IWER.metaQuest3);
  window.xrDevice.installRuntime({ forceInstall: true });
  window.xrDevice.position.set(0.5, 1.65, 0.3);
  window.xrDevice.quaternion.set(0, Math.sin(0.125), 0, Math.cos(0.125));
  window.xrDevice.controllers.left.position.set(-0.2, 1.4, -0.4);
  window.xrDevice.controllers.right.position.set(0.2, 1.4, -0.4);
` });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => { errors.push(error.message); console.error('PAGE:', error.message); });
async function press(hand, value) {
  await page.evaluate(({ hand, value }) => window.xrDevice.controllers[hand].updateButtonValue('trigger', value), { hand, value });
  await page.waitForTimeout(160);
}
async function placeHands(bowHand, drawDistance = 0) {
  await page.evaluate(async ({ bowHand, drawDistance }) => {
    const THREE = await import('/vendor/three.module.js');
    const view = window.orbitView;
    view.scene.updateMatrixWorld(true);
    const from = view.rig.localToWorld(new THREE.Vector3(-0.2, 1.4, -0.7));
    const target = view.bodies.find(body => body.active).group.getWorldPosition(new THREE.Vector3());
    target.y += 0.025; // Small elevation for the physical drop, no auto-aim in the app.
    const direction = target.sub(from).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
    const drawHand = bowHand === 'left' ? 'right' : 'left';
    for (const hand of [bowHand, drawHand]) {
      const p = view.rig.worldToLocal(from.clone().addScaledVector(direction, hand === bowHand ? 0 : -0.12 - drawDistance));
      const localQ = view.rig.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(quaternion);
      const entry = view.inputVisuals.entries.find(entry => entry.source?.handedness === hand);
      // IWER positions are target-ray poses. Archery uses the physical grip pose.
      const offset = entry.controller.matrix.clone().invert().multiply(entry.grip.matrix);
      const desiredRay = new THREE.Matrix4().compose(p, localQ, new THREE.Vector3(1, 1, 1)).multiply(offset.clone().invert());
      const rayQ = new THREE.Quaternion(), rayP = new THREE.Vector3(); desiredRay.decompose(rayP, rayQ, new THREE.Vector3());
      window.xrDevice.controllers[hand].position.set(...rayP.toArray());
      window.xrDevice.controllers[hand].quaternion.set(...rayQ.toArray());
      if (hand === drawHand) window.testDrawGrip = { offset: offset.toArray(), quaternion: localQ.toArray() };
    }
    const localFrom = view.rig.worldToLocal(from.clone());
    const localDirection = direction.clone().transformDirection(new THREE.Matrix4().copy(view.rig.matrixWorld).invert());
    window.testBowPose = { from: localFrom.toArray(), direction: localDirection.toArray(), drawHand };
  }, { bowHand, drawDistance });
  await page.waitForTimeout(220);
}
async function pull(distance) {
  await page.evaluate(async distance => {
    const THREE = await import('/vendor/three.module.js');
    const { from, direction, drawHand } = window.testBowPose, { offset, quaternion } = window.testDrawGrip;
    const gripP = new THREE.Vector3(...from.map((v, i) => v - direction[i] * (0.12 + distance)));
    const ray = new THREE.Matrix4().compose(gripP, new THREE.Quaternion().fromArray(quaternion), new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().fromArray(offset).invert());
    window.xrDevice.controllers[drawHand].position.set(...new THREE.Vector3().setFromMatrixPosition(ray).toArray());
  }, distance);
  await page.waitForTimeout(180);
}
let originalWorld;
const worldFile = process.env.ORBIT_TEST_WORLD;
try {
  if (worldFile) originalWorld = await readFile(worldFile, 'utf8');
  for (const mode of ['mr', 'vr']) {
    await page.goto(process.env.ORBIT_URL || 'https://localhost:8443', { waitUntil: 'networkidle' });
    await page.evaluate(async () => { window.orbitView = (await import('/src/app.js')).view; });
    const bowHand = mode === 'mr' ? 'left' : 'right', drawHand = bowHand === 'left' ? 'right' : 'left';
    await page.selectOption('#bow-hand', bowHand);
    await page.locator(`#${mode}`).click();
    await page.waitForFunction(mode => window.orbitView.renderer.xr.isPresenting && document.body.classList.contains(mode), mode);
    await page.waitForFunction(() => window.orbitView.bow.root.visible);
    assert.equal(await page.evaluate(() => window.orbitView.renderer.xr.getCamera().cameras.length), 2);
    await page.evaluate(() => { window.testXRSession = window.orbitView.renderer.xr.getSession(); });
    if (mode === 'mr') {
      assert.deepEqual(await page.evaluate(() => ({
        blend: window.testXRSession.environmentBlendMode,
        alpha: window.orbitView.renderer.getClearAlpha(), background: window.orbitView.scene.background,
        backdrop: window.orbitView.backdrop.visible, x: window.orbitView.contentRoot.position.x,
      })), { blend: 'alpha-blend', alpha: 0, background: null, backdrop: false, x: 0.5 });
      assert(await page.evaluate(() => Math.abs(window.orbitView.contentRoot.rotation.y) > 0.1), 'MR world follows initial viewing direction');
    }
    await page.waitForFunction(() => window.orbitView.state.phase === 'playing');
    await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('a-button', 1));
    if (mode === 'vr') {
      await page.waitForFunction(() => window.orbitView.state.flying);
      await page.waitForTimeout(350);
      assert(await page.evaluate(() => window.orbitView.state.flying), 'Holding A must not toggle repeatedly');
      await page.evaluate(() => window.xrDevice.controllers.right.updateAxes('thumbstick', 0, -1));
      await page.waitForFunction(() => window.orbitView.state.altitude > 2.5);
    } else {
      await page.evaluate(() => window.xrDevice.controllers.right.updateAxes('thumbstick', 0, -1));
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => window.orbitView.state.flying), false, 'MR must not enable flight');
      assert.equal(await page.evaluate(() => window.orbitView.rig.position.y), 0);
    }
    await page.evaluate(() => {
      window.xrDevice.controllers.right.updateButtonValue('a-button', 0);
      window.xrDevice.controllers.right.updateAxes('thumbstick', 0, 0);
    });
    await page.waitForFunction(() => !window.orbitView.movement.pending.length && !window.orbitView.movement.buffer.dt);
    const hoverY = await page.evaluate(() => window.orbitView.state.player[1]);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.orbitView.state.player[1]), hoverY, 'No unwanted motion with sticks released');
    // In VR this shot is made while hovering, with both controller poses transformed by the flying rig.
    await placeHands(bowHand);
    await press(drawHand, 1);
    await page.waitForFunction(() => window.orbitView.bow.drawing);
    for (const distance of [0.15, 0.3, 0.45, 0.6]) await pull(distance);
    assert(await page.evaluate(() => window.orbitView.bow.draw > 0.55 && window.orbitView.bow.arrow.visible));
    assert.equal(await page.evaluate(() => window.orbitView.state.shots), 0, 'Holding a drawn bow must not fire');
    await page.screenshot({ path: `.local/hybrid-${mode}-bow-emulated.png` });
    // A software-rendered screenshot may take seconds; keep aiming at the moving animal.
    await placeHands(bowHand, .6);
    await press(drawHand, 0);
    await page.waitForFunction(() => window.orbitView.state.hits >= 1);
    assert.equal(await page.evaluate(() => window.orbitView.state.shots), 1);
    if (mode === 'vr') {
      await page.evaluate(() => window.xrDevice.controllers.right.updateAxes('thumbstick', 0, 1));
      await page.waitForFunction(y => window.orbitView.state.player[1] < y - .4, hoverY);
      await page.evaluate(() => window.xrDevice.controllers.right.updateAxes('thumbstick', 0, 0));
      await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('a-button', 1));
      await page.waitForFunction(() => window.orbitView.state.locomotion === 'landing');
      await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('a-button', 0));
      await page.waitForFunction(() => window.orbitView.state.locomotion === 'walk');
    }

    if (mode === 'mr' && worldFile) {
      await page.waitForFunction(() => window.orbitView.environment.areas >= 3);
      const old = await page.evaluate(() => ({ revision: window.orbitView.environment.appliedRevision, score: window.orbitView.state.score }));
      const edit = JSON.parse(originalWorld);
      edit.title = 'Live im MR-Test';
      edit.generation = { enabled: true, viewRadius: 1, density: .8 };
      edit.objects = [{ id: 'live-tower', kind: 'box', position: [2, 1, -3], scale: [0.3, 2, 0.3], color: '#ff6600' }];
      await writeFile(worldFile, JSON.stringify(edit));
      await page.waitForFunction(revision => window.orbitView.environment.appliedRevision > revision && window.orbitView.environment.title === 'Live im MR-Test', old.revision);
      await page.waitForFunction(() => window.orbitView.environment.retiring.length === 0);
      assert(await page.evaluate(() => window.testXRSession === window.orbitView.renderer.xr.getSession()), 'Hot edits must keep the same XR session');
      assert.equal(await page.evaluate(() => window.orbitView.state.score), old.score);
      assert(await page.evaluate(() => window.orbitView.environment.chunks.has('authored-0')));
      assert.equal(await page.evaluate(() => window.orbitView.environment.chunks.size), 26);
      const keptRevision = await page.evaluate(() => window.orbitView.environment.appliedRevision);
      await writeFile(worldFile, '{incomplete');
      await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => window.orbitView.environment.appliedRevision), keptRevision);
      await writeFile(worldFile, originalWorld);
      await page.waitForFunction(() => window.orbitView.environment.title !== 'Live im MR-Test');
    }

    const startPlayer = await page.evaluate(() => window.orbitView.state.player.slice());
    await page.evaluate(() => window.xrDevice.controllers.left.updateAxes('thumbstick', 0, -1));
    if (mode === 'vr') {
      await page.waitForFunction(z => window.orbitView.state.player[2] < z - .8, startPlayer[2]);
      await page.waitForFunction(() => window.orbitView.state.discovered >= 2);
    } else {
      await page.waitForTimeout(400);
      assert.deepEqual(await page.evaluate(() => window.orbitView.state.player), startPlayer, 'MR must not move the real room');
    }
    await page.evaluate(() => window.xrDevice.controllers.left.updateAxes('thumbstick', 0, 0));
    if (mode === 'vr') {
      await page.evaluate(() => window.xrDevice.controllers.right.updateAxes('thumbstick', 1, 0));
      await page.waitForFunction(() => window.orbitView.rig.rotation.y < -.4);
      const once = await page.evaluate(() => window.orbitView.rig.rotation.y);
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => window.orbitView.rig.rotation.y), once, 'Held turn must only snap once');
      await page.evaluate(() => window.xrDevice.controllers.right.updateAxes('thumbstick', 0, 0));
      await page.waitForTimeout(180);
      await page.evaluate(() => window.xrDevice.controllers.right.updateAxes('thumbstick', -1, 0));
      await page.waitForFunction(() => Math.abs(window.orbitView.rig.rotation.y) < .01);
      await page.evaluate(() => window.xrDevice.controllers.right.updateAxes('thumbstick', 0, 0));
    }
    // Losing focus mid-draw must cancel without launching a stray arrow.
    if (mode === 'vr') {
      await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('a-button', 1));
      await page.waitForFunction(() => window.orbitView.state.flying);
      await page.evaluate(() => {
        window.xrDevice.controllers.right.updateButtonValue('a-button', 0);
        window.xrDevice.controllers.right.updateAxes('thumbstick', 0, -1);
      });
      await page.waitForFunction(() => window.orbitView.state.altitude > 1);
      await page.evaluate(() => window.xrDevice.controllers.right.updateAxes('thumbstick', 0, 0));
      await page.waitForFunction(() => !window.orbitView.movement.pending.length && !window.orbitView.movement.buffer.dt);
    }
    await placeHands(bowHand);
    await press(drawHand, 1); await pull(0.3);
    await page.evaluate(() => window.xrDevice.updateVisibilityState('visible-blurred'));
    await page.waitForFunction(() => window.orbitView.state.phase === 'paused');
    await press(drawHand, 0);
    assert.equal(await page.evaluate(() => window.orbitView.state.shots), 1);
    const pausedTick = await page.evaluate(() => window.orbitView.state.tick);
    const pausedPosition = await page.evaluate(() => window.orbitView.state.player.slice());
    await page.evaluate(() => window.xrDevice.controllers.right.updateAxes('thumbstick', 0, -1));
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => window.orbitView.state.player), pausedPosition, 'Focus loss must freeze flight height too');
    await page.evaluate(() => window.xrDevice.controllers.right.updateAxes('thumbstick', 0, 0));
    await page.evaluate(() => { window.xrDevice.position.x = 0.8; window.xrDevice.updateVisibilityState('visible'); });
    await page.waitForFunction(() => window.orbitView.camera.position.x > 0.7);
    assert.equal(await page.evaluate(() => window.orbitView.state.tick), pausedTick, 'Local head tracking continues while laptop physics is paused');
    await press(drawHand, 1); await press(drawHand, 0);
    await page.waitForFunction(() => window.orbitView.state.phase === 'playing');
    assert.equal(await page.evaluate(() => window.orbitView.state.shots), 1);
    if (mode === 'mr') {
      await page.evaluate(hand => window.xrDevice.controllers[hand].updateButtonValue('squeeze', 1), bowHand);
      await page.waitForFunction(() => window.orbitView.contentRoot.position.x > 0.7);
      await page.evaluate(hand => window.xrDevice.controllers[hand].updateButtonValue('squeeze', 0), bowHand);
    }
    await page.evaluate(() => window.xrDevice.activeSession.end());
    await page.waitForFunction(() => !document.body.classList.contains('xr'));
    assert.equal(await page.evaluate(() => window.orbitView.renderer.getClearAlpha()), 1);
    assert.equal(await page.evaluate(() => window.orbitView.backdrop.visible), true);
    console.log(`${mode.toUpperCase()}: stereo, bow, ${mode === 'vr' ? 'flight/climb/hover/descent/landing, bow in flight, walking/streaming, turning' : 'flight blocked, stationary room'}, focus cancellation, local tracking, exit passed.`);
  }
  // Switching modes in the same page must resume exploration after session-end pause.
  await page.locator('#mr').click();
  await page.waitForFunction(() => window.orbitView.mode === 'mr' && window.orbitView.state.phase === 'playing');
  assert.equal(await page.evaluate(() => window.orbitView.renderer.getClearAlpha()), 0);
  assert.equal(await page.evaluate(() => window.orbitView.state.flying), false, 'Switching from airborne VR to MR resets flight');
  assert.equal(await page.evaluate(() => window.orbitView.rig.position.y), 0);
  await page.evaluate(() => window.xrDevice.activeSession.end());
  assert.deepEqual(errors, []);
  console.log('Emulated Quest 3 checks passed. Real passthrough image and physical controller feel still require headset testing.');
} finally {
  if (originalWorld) await writeFile(worldFile, originalWorld);
  await browser.close();
}
