import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceCapture } from '../../client/webxr/src/audio/recording.js';

class Recorder {
  static isTypeSupported() { return true; }
  constructor() { this.mimeType = 'audio/webm'; }
  start() {}
  stop() { this.ondataavailable({ data: new Blob(['voice']) }); queueMicrotask(() => this.onstop()); }
}
globalThis.MediaRecorder = Recorder;
test('cancelled capture stops owned tracks and never submits audio', async () => {
  let stopped = false, sent = false;
  globalThis.fetch = async () => { sent = true; };
  const voice = new VoiceCapture(() => {}, () => {});
  voice.start({ getTracks: () => [{ stop: () => { stopped = true; } }] });
  voice.finish(true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(stopped); assert(!sent); assert(!voice.recording);
});
test('finished capture forwards transcript once, without retaining an active track', async () => {
  let result = '', stopped = false;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ text: 'I found two planks.' }) });
  const voice = new VoiceCapture(() => {}, text => { result = text; });
  voice.start({ getTracks: () => [{ stop: () => { stopped = true; } }] });
  voice.finish();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(result, 'I found two planks.'); assert(stopped);
});
