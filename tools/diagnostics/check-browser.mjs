import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const baseURL = process.env.ORBIT_URL || 'https://localhost:8443';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = new Proxy(OriginalWebSocket, {
    construct(Target, args) {
      const socket = new Target(...args);
      window.testSocket = socket;
      return socket;
    },
  });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { window.orbitView = (await import('/src/app.js')).view; });
  await page.waitForFunction(() => document.getElementById('connection').textContent.includes('Laptop verbunden'));
  await page.screenshot({ path: '.local/hybrid-landing.png' });
  const startTick = await page.evaluate(async () => (await import('/src/app.js')).view.state.tick);
  await page.waitForTimeout(600);
  const laterTick = await page.evaluate(async () => (await import('/src/app.js')).view.state.tick);
  assert(laterTick > startTick + 15, 'Laptop physics ticks must advance while the client is idle');
  await page.getByRole('button', { name: 'Am Laptop testen' }).click();
  await page.waitForFunction(() => window.orbitView.state.phase === 'playing');
  await page.locator('#overlay').waitFor({ state: 'hidden' });
  const targetPoint = () => page.evaluate(async () => {
    const { view } = await import('/src/app.js');
    const target = view.bodies.find(item => item.active);
    const p = target.group.getWorldPosition(new (await import('/vendor/three.module.js')).Vector3()).project(view.camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  });
  const point = await targetPoint();
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(900);
  const releasePoint = await targetPoint();
  await page.mouse.move(releasePoint.x, releasePoint.y);
  await page.mouse.up();
  await page.waitForFunction(() => window.orbitView.state.score >= 100);
  await page.waitForFunction(() => Number(document.getElementById('score').textContent) >= 1);
  const initialZ = await page.evaluate(() => window.orbitView.state.player[2]);
  await page.keyboard.down('w');
  await page.waitForFunction(z => window.orbitView.state.player[2] < z - 1, initialZ);
  await page.keyboard.up('w');
  await page.waitForFunction(() => window.orbitView.state.discovered >= 2);
  await page.waitForFunction(() => window.orbitView.environment.queue.size === 0);
  assert(await page.evaluate(() => [...window.orbitView.environment.chunks.keys()].some(id => id.startsWith('tile:0:-3'))), 'New terrain must arrive while walking');
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.orbitView.state.flying);
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.orbitView.state.altitude > 11);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => !window.orbitView.movement.pending.length && !window.orbitView.movement.buffer.dt);
  const hoverY = await page.evaluate(() => window.orbitView.state.player[1]);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.orbitView.state.player[1]), hoverY, 'Released controls must hover');
  assert(await page.evaluate(() => Math.abs(window.orbitView.rig.position.y - window.orbitView.state.player[1]) < .01), 'Headset height must agree with laptop physics');
  await page.keyboard.down('Shift');
  await page.waitForFunction(y => window.orbitView.state.player[1] < y - .5, hoverY);
  await page.keyboard.up('Shift');
  const flightStart = await page.evaluate(() => ({ position: window.orbitView.state.player.slice(), revision: window.orbitView.environment.revision }));
  await page.keyboard.down('w');
  await page.waitForFunction(z => window.orbitView.state.player[2] < z - 35, flightStart.position[2], { timeout: 90000 });
  await page.keyboard.up('w');
  await page.waitForFunction(revision => window.orbitView.environment.revision > revision && !window.orbitView.environment.queue.size, flightStart.revision);
  assert(await page.evaluate(() => window.orbitView.environment.chunks.size === 25), 'Flight must keep terrain streaming bounded');
  await page.screenshot({ path: '.local/hybrid-flight.png' });
  await page.locator('#flight').click();
  await page.waitForFunction(() => window.orbitView.state.locomotion === 'landing');
  await page.waitForFunction(() => window.orbitView.state.locomotion === 'walk', null, { timeout: 45000 });
  assert.equal(await page.evaluate(() => window.orbitView.state.altitude), 0);
  const beforeYaw = await page.evaluate(() => window.orbitView.camera.rotation.y);
  await page.mouse.move(750, 450); await page.mouse.down({ button: 'right' });
  await page.mouse.move(870, 455, { steps: 5 }); await page.mouse.up({ button: 'right' });
  assert.notEqual(await page.evaluate(() => window.orbitView.camera.rotation.y), beforeYaw);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForFunction(() => window.orbitView.state.phase === 'paused');
  const paused = await page.evaluate(async () => (await import('/src/app.js')).view.state.remaining);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(async () => (await import('/src/app.js')).view.state.remaining), paused);
  await page.getByRole('button', { name: 'Weiter spielen' }).click();
  await page.waitForFunction(() => window.orbitView.state.phase === 'playing');
  await page.locator('#overlay').waitFor({ state: 'hidden' });
  await page.screenshot({ path: '.local/hybrid-game.png' });
  await page.evaluate(() => window.testSocket.close());
  await page.waitForFunction(() => document.getElementById('overlay-title').textContent === 'Verbindung fehlt');
  await page.waitForFunction(() => window.orbitView.state.phase === 'ready' && document.getElementById('connection').textContent.includes('Laptop verbunden'));
  await page.getByRole('button', { name: 'Zur Startseite' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.local/hybrid-mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile layout must not overflow');
  await page.getByRole('button', { name: 'So funktioniert' }).click();
  assert.equal(await page.locator('dialog').evaluate(element => element.open), true);
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: wildlife, ballistic hit, WASD, flight/climb/hover/descent/landing, streamed islands, mouse look, pause/resume, reconnect, mobile layout, no JavaScript errors.');
} finally {
  await browser.close();
}
