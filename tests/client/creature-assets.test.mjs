import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CreatureAssets } from '../../client/webxr/src/rendering/creature-assets.js';

const body = JSON.stringify({ schema_version: '1.0', asset_id: 'arin', revision: 4 });
const hash = createHash('sha256').update(body).digest('hex');
const descriptor = { hash, url: '/api/creatures/' + hash, asset_id: 'arin', revision: 4 };

test('cached immutable assets still check revision, URL and integrity', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response(body); });
  const assets = new CreatureAssets();
  assert.equal((await assets.load(descriptor)).revision, 4);
  await assert.rejects(assets.load({ ...descriptor, revision: 5 }), /revision/i);
  await assert.rejects(assets.load({ ...descriptor, url: 'https://external.invalid/model' }), /referenz/);
  assert.equal(requests, 1);
  assets.clear();
  t.mock.method(globalThis, 'fetch', async () => new Response(body + ' '));
  await assert.rejects(assets.load(descriptor), /Prüfsumme/);
  assert.equal(assets.cache.size, 0);
});

test('oversized advertised and streamed assets cancel before accumulating unbounded data', async t => {
  for (const advertised of [true, false]) {
    let cancelled = false;
    t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel() { cancelled = true; },
    }), { headers: advertised ? { 'Content-Length': String(33 * 1024 * 1024) } : {} }));
    const assets = new CreatureAssets();
    await assert.rejects(assets.load(descriptor), /Ladebudget/);
    assert(cancelled);
    assert.equal(assets.cache.size, 0);
  }
});
