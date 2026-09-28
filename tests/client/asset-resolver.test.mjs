import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AssetInstances, assetBytes } from '../../client/webxr/src/assets/instances.js';

const bytes = await readFile(new URL('../assets/data/animated-morph.glb', import.meta.url));
const hash = createHash('sha256').update(bytes).digest('hex');
const descriptor = { asset_id: 'asset_' + 'a'.repeat(32), sha256: hash, revision: 1 };
descriptor.url = `/api/assets/blob/${descriptor.asset_id}/${hash}`;

test('resolver instances share only immutable mesh data; skeleton, morph, material and clips stay independent', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(bytes); });
  const cache = new AssetInstances();
  const [first, second] = await Promise.all([cache.acquire(descriptor), cache.acquire(descriptor)]);
  let a, b; first.root.traverse(o => { if (o.isSkinnedMesh) a = o; }); second.root.traverse(o => { if (o.isSkinnedMesh) b = o; });
  assert.equal(calls, 1); assert.equal(a.geometry, b.geometry); assert.notEqual(a.material, b.material);
  assert.notEqual(a.skeleton, b.skeleton); assert.notEqual(a.skeleton.bones[0], b.skeleton.bones[0]);
  a.morphTargetInfluences[0] = .75; assert.equal(b.morphTargetInfluences[0], 0);
  first.play(0); first.mixer.update(.5); assert.notEqual(a.skeleton.bones[0].quaternion.z, b.skeleton.bones[0].quaternion.z);
  first.dispose(); cache.clearUnused(); assert.equal(cache.cache.size, 1);
  second.dispose(); cache.clearUnused(); assert.equal(cache.cache.size, 0);
});

test('resolver cache rejects altered pins, corruption and oversized streams', async t => {
  const cache = new AssetInstances();
  await assert.rejects(cache.acquire({ ...descriptor, revision: 2 }), /Assetreferenz/);
  await assert.rejects(cache.acquire({ ...descriptor, url: 'https://untrusted.invalid/asset' }), /Assetreferenz/);
  t.mock.method(globalThis, 'fetch', async () => new Response('corrupt'));
  await assert.rejects(cache.acquire(descriptor), /prüfsumme/);
  assert.equal(cache.cache.size, 0);
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes));
  await assert.rejects(assetBytes(descriptor, { maxBytes: 16 }), /Ladebudget/);
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(65536)); }, cancel() { cancelled = true; },
  }), { headers: { 'Content-Length': String(65 * 1024 * 1024) } }));
  await assert.rejects(cache.acquire(descriptor), /Ladebudget/); assert(cancelled);
});
