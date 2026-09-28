import { SpatialPanel } from './spatial-panel.js';

export class DragonDialogue {
  constructor(scene, send, playVoice, stopVoice) {
    Object.assign(this, { send, playVoice, stopVoice });
    this.surface = new SpatialPanel(scene, 'Arin');
    Object.assign(this, { root: this.surface.root, caption: this.surface.caption, buttons: this.surface.buttons });
    this.options = ['Was entdecken wir?', 'Erzähl mir von dir.', 'Gib mir einen kleinen Hinweis.'];
    this.message = 'Ich bin Arin. Komm, wir entdecken die Inseln.'; this.status = 'idle';
    this.serial = 0; this.busy = false; this.stream = null; this.recorder = null; this.recording = false; this.transcribing = false;
    this.lastChoose = 0; this.lastAuto = -Infinity; this.band = null; this.wasMounted = false;
    this.lastPaint = ''; this.active = false;
    this.micStatus = document.getElementById('voice-status');
    document.getElementById('voice-enable').addEventListener('click', () => this.enableMic());
    document.getElementById('dragon-form').addEventListener('submit', event => {
      event.preventDefault(); const input = document.getElementById('dragon-input');
      if (input.value.trim()) { this.ask(input.value.trim()); input.value = ''; }
    });
    document.getElementById('dragon-record').addEventListener('click', () => this.toggleRecording());
    document.getElementById('dragon-options').addEventListener('click', event => {
      const button = event.target.closest('button[data-option]'); if (button) this.choose(Number(button.dataset.option));
    });
    this.paint();
  }
  receive(data) {
    if (data.status === 'thinking') this.stopVoice();
    this.source = data.source || this.source;
    this.status = data.status; this.busy = data.status === 'thinking'; this.serial = data.serial || this.serial;
    if (data.speech) this.message = data.speech;
    if (Array.isArray(data.options)) this.options = data.options.slice(0, 3);
    this.paint();
  }
  async enableMic() {
    try {
      if (!this.stream) this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      for (const track of this.stream.getTracks()) track.enabled = false;
      this.micStatus.textContent = 'Mikrofon bereit · Aufnahme nur beim Sprechen-Taster';
      document.getElementById('voice-enable').textContent = 'Mikrofon bereit ✓'; this.paint();
    } catch { this.micStatus.textContent = 'Mikrofon nicht freigegeben. Antwortfelder und Texteingabe funktionieren weiterhin.'; }
  }
  ask(message = '') {
    if (!this.active) return;
    this.stopVoice();
    this.send({ type: 'dragon', message: message.slice(0, 600) });
  }
  choose(index) {
    if (performance.now() - this.lastChoose < 400 || !this.active) return;
    this.lastChoose = performance.now();
    if (index === this.options.length) {
      if (this.stream) this.toggleRecording();
      else if (!this.xr) document.getElementById('dragon-input').focus();
      else { this.message = 'Für freie Sprache vor dem VR-Start „Mikrofon aktivieren“ wählen. Du kannst die anderen Antworten sofort auswählen.'; this.paint(); }
    } else this.ask(this.options[index]);
  }
  async toggleRecording() {
    if (this.recording) { this.finishRecording(); return; }
    if (!this.active || this.transcribing) return;
    if (!this.stream) { if (this.xr) { this.choose(this.options.length); return; } await this.enableMic(); }
    if (!this.stream || !this.active) return;
    try {
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      this.stopVoice(); this.parts = []; this.discard = false; this.transcribing = true;
      for (const track of this.stream.getTracks()) track.enabled = true;
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : {});
      this.recorder.ondataavailable = event => { if (event.data.size) this.parts.push(event.data); };
      this.recorder.onstop = () => this.transcribe();
      this.recorder.start(); this.recording = true; this.paint();
      this.recordTimer = setTimeout(() => this.finishRecording(), 20000);
    } catch { this.transcribing = false; for (const track of this.stream.getTracks()) track.enabled = false; this.message = 'Die Aufnahme konnte nicht starten. Nutze die Antwortfelder.'; this.paint(); }
  }
  finishRecording(discard = false) {
    if (discard) { this.discard = true; this.transcription?.abort(); }
    if (!this.recording) return;
    clearTimeout(this.recordTimer); this.discard = discard; this.recording = false;
    this.recorder.stop(); for (const track of this.stream.getTracks()) track.enabled = false;
    this.paint();
  }
  async transcribe() {
    if (this.discard || !this.active) { this.transcribing = false; return; }
    this.transcription = new AbortController();
    const timeout = setTimeout(() => this.transcription?.abort(), 55000);
    this.status = 'transcribing'; this.paint();
    try {
      const blob = new Blob(this.parts, { type: this.recorder.mimeType });
      const response = await fetch('/api/dragon/transcribe', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob, signal: this.transcription.signal });
      const result = await response.json();
      if (!this.active) return;
      if (!response.ok) throw new Error(result.error || 'Whisper ist nicht erreichbar.');
      if (!result.text?.trim()) throw new Error('Ich habe dich nicht verstanden. Versuche es noch einmal.');
      this.message = `Du: ${result.text}`; this.status = 'thinking'; this.ask(result.text);
    } catch (error) { this.status = 'idle'; if (error.name !== 'AbortError') this.message = error.message; }
    finally { clearTimeout(timeout); this.transcribing = false; this.transcription = null; }
    this.paint();
  }
  paint() {
    const state = this.recording ? 'Ich höre dir zu …' : this.status === 'transcribing' ? 'Ich höre deine Worte nach …' : this.status === 'thinking' ? 'Arin überlegt …' : this.status === 'offline' ? 'Verbindung unterbrochen' : this.source === 'authored-offline' ? 'Arin · vorbereiteter Dialog' : 'Arin · dein Drache';
    const caption = this.recording ? 'Sprich jetzt. Zum Senden loslassen oder „Antwort senden“ auswählen.' : this.message;
    const labels = [...this.options, this.recording ? '■ Antwort senden' : '● Frei sprechen'];
    const key = JSON.stringify([state, caption, labels]); if (key === this.lastPaint) return; this.lastPaint = key;
    document.getElementById('dragon-name').textContent = state;
    document.getElementById('dragon-speech').textContent = caption;
    document.getElementById('dragon-record').textContent = this.recording ? 'Antwort senden ■' : 'Sprechen ●';
    const choices = document.getElementById('dragon-options'); choices.replaceChildren();
    this.options.forEach((text, index) => { const button = document.createElement('button'); button.type = 'button'; button.dataset.option = index; button.textContent = text; choices.appendChild(button); });
    this.surface.setContent(state, caption, labels.map((label, i) => ({ label, run: () => this.choose(i) })));
  }
  update(dt, camera, movement, controllers, hands, active, xr, now) {
    const mounted = movement.mode !== 'mr' && movement.locomotion !== 'walk';
    this.active = active; this.xr = xr;
    document.getElementById('dragon-panel').hidden = !mounted || !active || xr;
    if (!this.active) { this.finishRecording(true); this.stopVoice(); }
    if (!mounted && this.wasMounted) { this.band = null; this.lastAuto = -Infinity; this.stopVoice(); }
    this.wasMounted = mounted;
    for (const controller of controllers) {
      const source = controller.userData.source, pressed = !!source?.gamepad?.buttons[5]?.pressed && source.handedness === 'right';
      const before = !!controller.userData.talkPressed;
      if (this.active && pressed && !before) {
        if (this.stream) this.toggleRecording(); else this.ask('Was siehst du gerade?');
      }
      if (!pressed && before && this.recording) this.finishRecording(!this.active);
      controller.userData.talkPressed = pressed;
    }
    if (!this.active) return;
    const band = movement.position[1] > 350 ? 'orbit' : movement.position[1] > 80 ? 'clouds' : 'islands';
    if (mounted && band !== this.band && now - this.lastAuto > 15000) {
      this.band = band; this.lastAuto = now; this.ask('');
    }
  }
}
