/** Bounded, cancellable push-to-talk capture. No permission request until a user gesture. */
export class VoiceCapture {
  constructor(onStatus, onText) {
    Object.assign(this, { onStatus, onText }); this.recording = false; this.generation = 0;
  }
  start(stream) {
    if (this.recording || !stream) return;
    try {
    this.abort?.abort(); this.generation++;
    this.stream = stream; this.chunks = []; this.bytes = 0;
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    const generation = this.generation;
    this.recorder.ondataavailable = event => {
      this.bytes += event.data.size;
      if (this.bytes > 2 * 1024 * 1024) this.finish(true);
      else if (event.data.size) this.chunks.push(event.data);
    };
    this.recorder.onstop = async () => {
      if (this.cancelled || generation !== this.generation) return;
      try {
        this.onStatus('Deine Worte werden erkannt …'); this.abort = new AbortController();
        const blob = new Blob(this.chunks, { type: this.recorder.mimeType });
        const response = await fetch('/api/dragon/transcribe', { method: 'POST', body: blob, signal: this.abort.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Spracherkennung nicht erreichbar');
        if (generation === this.generation) this.onText(data.text);
      } catch (error) { if (error.name !== 'AbortError') this.onStatus(error.message); }
    };
    for (const track of stream.getTracks()) track.enabled = true;
    this.cancelled = false; this.recording = true; this.recorder.start(200);
    this.timer = setTimeout(() => this.finish(), 20000);
    this.onStatus('Sprich jetzt. Erneut wählen sendet deine Antwort.');
    } catch { this.finish(true); this.onStatus('Die Aufnahme konnte nicht starten. Du kannst deine Antwort auch tippen.'); }
  }
  finish(cancel = false) {
    if (cancel) { this.generation++; this.abort?.abort(); }
    this.cancelled = cancel; clearTimeout(this.timer);
    if (this.recording) { this.recording = false; this.recorder.stop(); }
    for (const track of this.stream?.getTracks() || []) track.stop();
  }
}
