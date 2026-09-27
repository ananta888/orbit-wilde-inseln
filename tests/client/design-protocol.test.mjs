import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyFrame, beginDocument, decodeFrame } from '../../client/webxr/src/design/networking/protocol.js';

const fixture = JSON.parse(readFileSync(new URL('../../examples/design/odg1-triangle.json', import.meta.url), 'utf8'));
function bytes(value) { return Uint8Array.from(Buffer.from(value, 'base64')).buffer; }
async function initial() {
  const doc = beginDocument(null, fixture.initial.message);
  applyFrame(doc, await decodeFrame(bytes(fixture.initial.frames[0]))); return doc;
}

test('Python-produced ODG1 snapshot and delta decode exactly without changing old revision', async () => {
  const before = await initial(), original = before.regions.get('surface').positions.slice();
  const after = beginDocument(before, fixture.edit.message);
  applyFrame(after, await decodeFrame(bytes(fixture.edit.frames[0])));
  assert.deepEqual(Array.from(after.regions.get('surface').positions), fixture.expected_positions);
  assert.deepEqual(before.regions.get('surface').positions, original);
});

test('ODG1 detects corruption, stale revision, out-of-bounds indices and duplicate metadata', async () => {
  const damaged = new Uint8Array(bytes(fixture.edit.frames[0])); damaged[damaged.length - 1] ^= 1;
  await assert.rejects(decodeFrame(damaged.buffer), /prüfsumme/);
  const before = await initial(), after = beginDocument(before, fixture.edit.message);
  const packet = await decodeFrame(bytes(fixture.edit.frames[0]));
  packet.header.base_revision = 100;
  assert.throws(() => applyFrame(after, packet), /revision/);
  packet.header.base_revision = 0; packet.arrays.vertex_ids[0] = 999;
  assert.throws(() => applyFrame(after, packet), /Deltaindex/);
  const bad = structuredClone(fixture.initial.message); bad.document.regions.push(bad.document.regions[0]);
  assert.throws(() => beginDocument(null, bad), /Regionsmetadaten/);
});
