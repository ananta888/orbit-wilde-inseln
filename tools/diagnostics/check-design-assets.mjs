import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto((process.env.ORBIT_URL || 'http://127.0.0.1:8876') + '/designer/index.html');
  await page.evaluate(async () => { window.w = (await import('/src/design/workspace.js')).workspace; });
  await page.waitForFunction(() => window.w.client.document);
  const arin = await page.evaluate(async () => {
    const { existingArin } = await import('/src/design/assets.js');
    const response = await fetch('/api/design/import', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(existingArin()) });
    if (!response.ok) throw Error(await response.text());
    return response.json();
  });
  await page.evaluate(id => window.w.client.send({ type: 'open', id }), arin.id);
  await page.waitForFunction(id => window.w.client.document?.id === id, arin.id);
  assert(await page.evaluate(() => [...window.w.client.document.regions.values()].some(r => r.part === 'head')));
  await page.evaluate(() => window.w.client.command({ tool: 'rig' }));
  await page.waitForFunction(() => window.w.client.document.revision === 1);
  await page.evaluate(() => {
    const bone = window.w.client.document.rig.bones[1].id;
    return window.w.client.command({ tool: 'clip', id: 'inspect', duration: 1, loop: true,
      keys: [{ bone, time: 0, rotation: [0, 0, 0] }, { bone, time: 1, rotation: [0, .2, 0] }] });
  });
  await page.waitForFunction(() => window.w.client.document.revision === 2);
  const report = await page.evaluate(async () => {
    const { exportGLBBytes, importFile, plainDocument } = await import('/src/design/assets.js');
    const THREE = await import('three');
    const doc = window.w.client.document, view = window.w.creature;
    view.root.updateWorldMatrix(true, true); view.skeleton.update();
    const mesh = [...view.meshes.values()][0];
    const vertex = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, 0);
    const posed = vertex.clone(); mesh.applyBoneTransform(0, posed);
    const restError = vertex.distanceTo(posed);
    const bytes = await exportGLBBytes(doc);
    const headerSize = new DataView(bytes).getUint32(12, true);
    const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, headerSize)));
    const imported = await importFile(new File([bytes], 'roundtrip.glb', { type: 'model/gltf-binary' }));
    const original = plainDocument(doc);
    const response = await fetch('/api/design/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(imported) });
    const compare = key => JSON.stringify(original[key]) === JSON.stringify(imported[key]);
    const regionsEqual = original.regions.every(r => {
      const other = imported.regions.find(v => v.id === r.id);
      return other && Object.keys(r).every(key => JSON.stringify(r[key]) === JSON.stringify(other[key]));
    });
    return { bytes: bytes.byteLength, restError, regionsEqual, rig: compare('rig'), clips: compare('clips'),
      standardClips: gltf.animations?.length, mounts: compare('mount_points'), accepted: response.ok };
  });
  assert(report.bytes > 1000);
  assert(report.restError < 1e-5, 'Rig must preserve rest position at dollhouse scale');
  assert(report.regionsEqual && report.rig && report.clips && report.standardClips === 1 && report.mounts && report.accepted, JSON.stringify(report));

  const revision = await page.evaluate(() => window.w.client.document.revision);
  await context.setOffline(true);
  await page.evaluate(() => window.w.client.socket.close());
  await page.waitForTimeout(200);
  await page.evaluate(() => window.w.client.command({ tool: 'rename', name: 'Offline wiederhergestellt' }));
  assert.equal(await page.evaluate(async () => (await window.w.client.journal.list()).length), 1);
  await context.setOffline(false);
  await page.reload();
  await page.evaluate(async () => { window.w = (await import('/src/design/workspace.js')).workspace; });
  await page.waitForFunction(r => window.w.client.document?.revision === r + 1, revision, { timeout: 30000 });
  assert.equal(await page.evaluate(() => window.w.client.document.name), 'Offline wiederhergestellt');
  assert.equal(await page.evaluate(async () => (await window.w.client.journal.list()).length), 0);
  assert.deepEqual(errors, []);
  console.log('Original Arin import, scaled rig rest pose, GLB geometry/material/skin roundtrip and offline journal across reload passed.');
} finally { await browser.close(); }
