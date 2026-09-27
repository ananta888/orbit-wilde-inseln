import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
// The real shared data, with only HTTP replaced for a headless module test.
const config = JSON.parse(await readFile(new URL('../../shared/protocol/flight-config.json', import.meta.url)));
globalThis.fetch = async () => ({ ok: true, json: async () => config });
const flight = await import('../../client/webxr/src/input/flight.js');
test('altitude gain is bounded, coordinates wrap, acceleration brakes smoothly', () => {
  assert.equal(flight.flightBoost(4000), 100);
  assert(flight.flightBoost(100) > flight.flightBoost(20));
  assert(flight.coordinates(flight.HALF_WORLD + 1, 0)[0] < 0);
  const velocity = flight.accelerate([10, 0, 0], [0, 0, 0], 20, 1 / 60, true);
  assert(velocity[0] > 0 && velocity[0] < 10);
});
