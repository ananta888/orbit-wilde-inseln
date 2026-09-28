import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('.local', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1000, height: 750 }, deviceScaleFactor: .7 });
await context.addInitScript({ content: await readFile(new URL('../../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8') + `
  window.xrDevice = new IWER.XRDevice(IWER.metaQuest3); window.xrDevice.installRuntime({forceInstall:true});
  xrDevice.position.set(0,1.65,0); xrDevice.controllers.left.position.set(-.2,1.35,-.4); xrDevice.controllers.right.position.set(.2,1.35,-.4);
` });
const page = await context.newPage(), errors = [], shaderErrors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (/Error:.*Shader|VALIDATE_STATUS|ERROR: 0:/.test(message.text())) shaderErrors.push(message.text()); });
const url = process.env.ORBIT_URL || 'http://127.0.0.1:8765';
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { window.v = (await import('/src/app.js')).view; });
  await page.waitForFunction(() => !document.getElementById('vr').disabled && v.dragon.rigged.ready && v.inputVisuals.ready);
  await page.selectOption('#graphics-quality', 'high');
  await page.locator('#vr').click();
  await page.waitForFunction(() => v.avatar.knees.length === 2 && v.inputVisuals.entries.every(entry => entry.model.children.length > 0));
  const status = await page.evaluate(async () => {
    const T = await import('three'), position = v.bow.root.getWorldPosition(new T.Vector3());
    const grip = v.controllers.find(c => c.userData.source.handedness === v.bow.hand).userData.bowGrip.getWorldPosition(new T.Vector3());
    return { gripError: position.distanceTo(grip), skins: [...v.inputVisuals.skins.values()].map(s => s.bones.size),
      knees: v.avatar.knees.map(k => k.y), feet: v.avatar.feet.map(k => k.y), tracking: v.avatar.tracking,
      models: v.inputVisuals.entries.map(e => e.model.motionController.xrInputSource.profiles[0]),
      qualityLocked: document.getElementById('graphics-quality').disabled };
  });
  assert(status.gripError < .001); assert.deepEqual(status.skins, [25, 25]); assert(status.qualityLocked);
  assert(status.models.every(name => name.includes('touch'))); assert.equal(status.tracking, 'head-hands-only');
  await page.evaluate(() => { window.xrDevice.position.y = 1.1; });
  await page.waitForFunction(knees => v.avatar.knees.every((k, i) => k.y < knees[i] - .1), status.knees);
  assert(await page.evaluate(feet => v.avatar.feet.every((f, i) => Math.abs(f.y - feet[i]) < .02), status.feet), 'Crouching bends knees without dragging feet underground');
  await page.evaluate(() => { window.xrDevice.position.y = 1.65; window.xrDevice.controllers.left.updateButtonValue('x-button', 1); });
  await page.waitForFunction(() => v.handMenu.open);
  await page.evaluate(() => window.xrDevice.controllers.left.updateButtonValue('x-button', 0));
  const firstCurl = await page.evaluate(() => v.inputVisuals.skins.get('right').curls.index);
  await page.evaluate(() => { window.xrDevice.controllers.right.quaternion.set(0, 1, 0, 0); window.xrDevice.controllers.right.updateButtonValue('trigger', 1); });
  await page.waitForFunction(before => v.inputVisuals.skins.get('right').curls.index > before + .3, firstCurl);
  await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('trigger', 0));
  assert.equal(await page.evaluate(() => v.state.shots), 0);
  // Stale pressed targets must not run replacement content, even before another frame.
  assert(await page.evaluate(() => {
    const p = v.missions.surface; let count = 0;
    p.setContent('Probe', 'Alt', [{ label: 'Alt', run: () => count++ }]);
    const target = p.target(p.buttons[0], p.root.position.clone());
    p.setContent('Probe', 'Neu', [{ label: 'Neu', run: () => count++ }]); target.run();
    v.missions.lastPaint = ''; v.missions.paint(); return count === 0;
  }));
  await page.evaluate(() => { v.handMenu.close(); window.xrDevice.controllers.right.updateButtonValue('a-button', 1); });
  await page.waitForFunction(() => v.dragon.rigged.root.visible && v.state.flying);
  const wing = await page.evaluate(() => v.dragon.rigged.bones.get('wing_lower_L').quaternion.toArray());
  await page.waitForFunction(before => v.dragon.rigged.bones.get('wing_lower_L').quaternion.toArray().some((x, i) => Math.abs(x - before[i]) > .01), wing);
  assert(await page.evaluate(() => !v.dragon.proceduralVisuals.some(mesh => mesh.visible)));
  assert.deepEqual(await page.evaluate(() => v.dragon.rigged.clips.map(clip => clip.name)), ['idle', 'walk', 'attack', 'die']);
  assert(await page.evaluate(() => v.bodies.every(body => body.legs.length === (body.species === 'alien' ? 2 : 4) && body.legs.every(leg => leg.joints.length === 4 && leg.joints.every(p => p.toArray().every(Number.isFinite))))));
  const telemetry = await page.evaluate(() => ({ ...v.renderer.info.render, hardware: 'Chromium + IWER; not Quest hardware' }));
  await page.screenshot({ path: '.local/presence-flight-emulated.png' });
  await page.evaluate(() => v.renderer.xr.getSession().end());
  await page.route('**/arin-cethiel.glb', route => route.abort());
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(async () => { window.v = (await import('/src/app.js')).view; });
  await page.waitForFunction(() => v.dragon.rigged.error && !document.getElementById('desktop').disabled);
  await page.locator('#desktop').click(); await page.waitForFunction(() => v.state.phase === 'playing');
  await page.locator('#flight').click();
  await page.waitForFunction(() => v.dragon.root.visible);
  assert(await page.evaluate(() => !v.dragon.rigged.ready && v.dragon.proceduralVisuals.every(mesh => mesh.visible)), 'Asset load failure retains a visible dragon');
  assert.deepEqual(errors, []); assert.deepEqual(shaderErrors, []);
  console.log('XR presence passed: grip placement, controller finger poses, knees/crouch, safe stale UI, animated GLB, articulated creatures, asset failure fallback.');
  console.log(JSON.stringify(telemetry));
} finally { await browser.close(); }
