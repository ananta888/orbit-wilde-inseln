import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1050 } }), errors = [];
page.on('pageerror', error => errors.push(error.message));
async function revision() { return page.evaluate(() => window.w.client.document.revision); }
async function click(id) {
  const before = await revision(); await page.locator('#' + id).click();
  await page.waitForFunction(r => window.w.client.document.revision > r && !window.w.client.pending, before, { timeout: 30000 });
}
async function command(operation) {
  const before = await revision(); await page.evaluate(op => window.w.client.command(op), operation);
  await page.waitForFunction(r => window.w.client.document.revision > r && !window.w.client.pending, before);
}
try {
  await page.goto((process.env.ORBIT_URL || 'http://127.0.0.1:8993') + '/designer/index.html');
  await page.evaluate(async () => { window.w = (await import('/src/design/workspace.js')).workspace; });
  await page.waitForFunction(() => window.w.client.document);
  await page.locator('summary').filter({ hasText: 'Bearbeitungsebenen' }).click();
  const base = await page.evaluate(() => Array.from(window.w.client.document.regions.get('head').positions));
  await click('new-layer');
  const layer = await page.locator('#active-layer').inputValue(); assert(layer);
  await command({ tool: 'pull', regions: ['head'], layer, samples: [[0, 1.8, -1.5]], radius: .8, strength: .4 });
  const changed = await page.evaluate(() => Array.from(window.w.client.document.regions.get('head').positions));
  assert.notDeepEqual(base, changed);
  await click('layer-visible');
  const hidden = await page.evaluate(() => Array.from(window.w.client.document.regions.get('head').positions));
  assert(hidden.every((v,i) => Math.abs(v-base[i]) < 1e-6));
  await click('layer-visible'); await click('bake-layers');
  assert.equal(await page.evaluate(() => window.w.client.document.layers.length), 0);
  await page.locator('summary').filter({ hasText: 'Pose & Vorschau' }).click();
  await click('rig');
  assert(await page.evaluate(() => window.w.client.document.rig.weights.left_wing.weights.some(v => v > .1 && v < .9)));
  await page.locator('#bone').selectOption('head');
  await page.locator('#record-pose').click();
  await page.locator('#pose-angle').evaluate(element => { element.value = '.5'; element.dispatchEvent(new Event('input')); }); await click('pose');
  await page.locator('#key-time').fill('1'); await page.locator('#record-pose').click();
  await click('save-clip');
  await page.locator('#clips').selectOption('custom'); await page.locator('#play-clip').click();
  await page.waitForFunction(() => window.w.creature.bones.get('head').rotation.z < .45);
  const oldBones = await page.evaluate(() => JSON.stringify(window.w.client.document.rig.bones));
  await page.locator('summary').filter({ hasText: 'Kreaturen & Dateien' }).click();
  await page.locator('#optimize').click();
  await page.waitForFunction(() => window.w.client.preview, null, { timeout: 30000 });
  assert.equal(await page.evaluate(() => JSON.stringify(window.w.client.preview.rig.bones)), oldBones);
  await click('accept');
  assert.equal(await page.evaluate(() => window.w.client.document.clips[0].id), 'custom');
  await click('undo');
  assert.equal(await page.evaluate(() => JSON.stringify(window.w.client.document.rig.bones)), oldBones);
  assert.deepEqual(errors, []);
  console.log('Designer authoring: layers, visibility, bake, soft skin, recorded poses, clip playback, optimization preview/accept/undo passed.');
} finally { await browser.close(); }
