import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true,
  args: ['--no-sandbox','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1180, height: 850 } });
const emulator = await readFile(new URL('../../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8');
await context.addInitScript({ content: emulator + `window.xrDevice = new IWER.XRDevice(IWER.metaQuest3); window.xrDevice.installRuntime({forceInstall:true});` });
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
const origin = process.env.ORBIT_URL || 'http://127.0.0.1:8765';
try {
  await page.goto(origin + '/library/index.html');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Assets gefunden'));
  await page.locator('.upload summary').click();
  await page.setInputFiles('#file', new URL('../../tests/assets/data/triangle.glb', import.meta.url).pathname);
  await page.fill('#upload-name', 'Resolver fixture triangle');
  // Fictional provider metadata for an isolated test profile, not a relicensing of the fixture.
  await page.selectOption('#upload-license', 'CC0');
  await page.fill('#upload-creator', 'Fixture creator');
  await page.fill('#upload-source', 'https://assets.example/fixture');
  await page.locator('#upload button').click();
  await page.waitForFunction(() => window.orbitAssetBrowser?.selected?.verified, { timeout: 60000 });
  const initial = await page.evaluate(() => window.orbitAssetBrowser.selected.id);
  assert.equal(await page.evaluate(() => window.orbitAssetBrowser.selected.geometry.triangles), 1);
  await page.screenshot({ path: '.local/asset-library-preview.png', fullPage: true });
  await page.selectOption('#profile', 'quest3-performance');
  await page.click('#optimize');
  await page.waitForFunction(id => window.orbitAssetBrowser.selected.id !== id, initial);
  const selected = await page.evaluate(() => window.orbitAssetBrowser.selected.id);
  await page.click('#preview-vr');
  await page.waitForFunction(() => window.xrDevice.activeSession);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.orbitAssetBrowser.instance.root.children.length > 0), true);
  await page.evaluate(() => window.xrDevice.activeSession.end());
  await page.locator('summary', { hasText: 'Im Spiel platzieren' }).click();
  await page.click('#place');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('In deiner Spielwelt platziert'));
  await page.click('#edit');
  await page.waitForURL('**/designer/index.html?library_asset=*');
  await page.evaluate(async () => { window.w = (await import('/src/design/workspace.js')).workspace; });
  await page.waitForFunction(id => window.w.client.document?.provenance?.asset?.id === id, selected, { timeout: 30000 });
  const before = await page.evaluate(() => {
    const region = [...window.w.client.document.regions.values()][0];
    window.assetRegion = region.id;
    return Array.from(region.positions);
  });
  await page.evaluate(() => window.w.client.command({ tool: 'pull', regions: [window.assetRegion], samples: [[.3,.3,0]], radius: .6, strength: .2 }));
  await page.waitForFunction(() => window.w.client.document.revision === 1);
  assert.notDeepEqual(await page.evaluate(() => Array.from(window.w.client.document.regions.get(window.assetRegion).positions)), before);
  assert.equal(await page.evaluate(() => window.w.client.document.provenance.asset.license.license), 'CC0');
  await page.evaluate(() => window.w.client.command(null, 'undo'));
  await page.waitForFunction(() => window.w.client.document.revision === 2);
  assert.deepEqual(await page.evaluate(() => Array.from(window.w.client.document.regions.get(window.assetRegion).positions)), before);
  await page.goto(origin + '/');
  await page.evaluate(async () => { window.v = (await import('/src/app.js')).view; });
  await page.waitForFunction(() => window.v.worldAssets.instances.length === 1, { timeout: 30000 });
  assert.equal(await page.evaluate(() => window.v.worldAssets.instances[0].root.parent.position.z), -3);
  assert.deepEqual(errors, []);
  console.log('Asset resolver: upload → analysis/cache → optimization → GLB preview → emulated VR → licensed sculpt/undo → server-pinned game placement passed. No external service or physical Quest used.');
} catch (error) {
  console.error(await page.locator('[role=status]').allTextContents());
  console.error(await page.evaluate(() => ({ url: location.href, document: window.w?.client.document?.provenance, asset: window.orbitAssetBrowser?.selected?.id })));
  throw error;
} finally { await browser.close(); }
