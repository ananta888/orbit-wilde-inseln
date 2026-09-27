import * as THREE from '/vendor/three.module.js';

function panel(width, height, parent) {
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * height / 1200), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false }));
  mesh.renderOrder = 100; parent.add(mesh); return { canvas, texture, mesh };
}
function write(panel, text, selected = false) {
  const c = panel.canvas.getContext('2d'), { width, height } = panel.canvas;
  c.clearRect(0, 0, width, height); c.fillStyle = selected ? '#35675a' : '#142e2df2'; c.fillRect(0, 0, width, height);
  c.strokeStyle = selected ? '#e4edb0' : '#698c7680'; c.lineWidth = 5; c.strokeRect(3, 3, width - 6, height - 6);
  c.fillStyle = '#ecf0d8'; c.font = '42px sans-serif'; c.textBaseline = 'top';
  let line = '', y = 24;
  for (const word of text.split(' ')) {
    const next = line + word + ' ';
    if (c.measureText(next).width > width - 60 && line) { c.fillText(line, 30, y); line = word + ' '; y += 56; } else line = next;
  }
  c.fillText(line, 30, y); panel.texture.needsUpdate = true;
}

export class DragonDialogue {
  constructor(scene, send, playVoice, stopVoice) {
    Object.assign(this, { send, playVoice, stopVoice });
    this.root = new THREE.Group(); scene.add(this.root); this.root.visible = false;
    this.caption = panel(.8, 340, this.root); this.caption.mesh.position.y = .27;
    this.buttons = Array.from({ length: 4 }, (_, i) => {
      const item = panel(.8, 125, this.root); item.mesh.position.y = .05 - i * .105; return item;
    });
    this.options = ['Was entdecken wir?', 'Erzähl mir von dir.', 'Ich möchte etwas fragen.'];
    this.message = 'Ich bin Arin. Komm, wir entdecken die Inseln.'; this.status = 'idle';
    this.serial = 0; this.busy = false; this.stream = null; this.recorder = null; this.recording = false; this.transcribing = false;
    this.pinches = new Map(); this.lastChoose = 0; this.lastAuto = -Infinity; this.band = null; this.wasMounted = false;
    this.raycaster = new THREE.Raycaster(); this.visible = false; this.lastPaint = ''; this.active = false;
    this.handledControllers = new Set(); this.micStatus = document.getElementById('voice-status');
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
    if (index === 3 || index === 2) {
      if (this.stream) this.toggleRecording();
      else if (!this.xr) document.getElementById('dragon-input').focus();
      else { this.message = 'Für freie Sprache vor dem VR-Start „Mikrofon aktivieren“ wählen. Du kannst die anderen Antworten sofort auswählen.'; this.paint(); }
    } else this.ask(this.options[index]);
  }
  async toggleRecording() {
    if (this.recording) { this.finishRecording(); return; }
    if (!this.active || this.transcribing) return;
    if (!this.stream) { if (this.xr) { this.choose(2); return; } await this.enableMic(); }
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
    write(this.caption, `${state} — ${caption}`);
    this.buttons.forEach((item, index) => { item.label = labels[index]; write(item, item.label); });
  }
  hit(controller) {
    if (!this.root.visible || !this.active) return null;
    this.root.updateMatrixWorld(true); controller.updateWorldMatrix(true, false);
    this.raycaster.set(controller.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, 0, -1).applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion())));
    return this.raycaster.intersectObjects(this.buttons.map(p => p.mesh), false).find(hit => hit.distance < 4) || null;
  }
  select(controller) {
    const hit = this.hit(controller); if (!hit) return false;
    this.choose(this.buttons.findIndex(item => item.mesh === hit.object));
    return true;
  }
  update(dt, camera, movement, controllers, hands, active, xr, now) {
    const mounted = movement.mode !== 'mr' && movement.locomotion !== 'walk';
    this.active = active && mounted; this.xr = xr;
    this.root.visible = xr && mounted && active;
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
      if (!controller.userData.dialogueRay) {
        const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: '#e1eaaa', depthTest: false }));
        ray.renderOrder = 101; controller.add(ray); controller.userData.dialogueRay = ray;
      }
      const hit = this.hit(controller), ray = controller.userData.dialogueRay;
      ray.visible = !!hit; if (hit) ray.scale.z = hit.distance;
    }
    if (!this.active) return;
    const band = movement.position[1] > 350 ? 'orbit' : movement.position[1] > 80 ? 'clouds' : 'islands';
    if (band !== this.band && now - this.lastAuto > 15000) {
      this.band = band; this.lastAuto = now; this.ask('');
    }
    if (!xr) return;
    const head = camera.getWorldPosition(new THREE.Vector3()), direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    direction.y = 0; direction.normalize(); const right = new THREE.Vector3(-direction.z, 0, direction.x);
    const target = head.clone().addScaledVector(direction, .95).addScaledVector(right, .68); target.y -= .12;
    this.root.position.lerp(target, 1 - Math.exp(-6 * dt));
    this.root.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));
    this.root.updateMatrixWorld(true);
    for (const hand of hands) {
      const finger = hand.joints?.['index-finger-tip'], thumb = hand.joints?.['thumb-tip'];
      if (!hand.visible || !finger || !thumb) { this.pinches.set(hand, false); continue; }
      const point = finger.getWorldPosition(new THREE.Vector3()), pinch = point.distanceTo(thumb.getWorldPosition(new THREE.Vector3())) < .025;
      if (pinch && !this.pinches.get(hand)) {
        for (let i = 0; i < this.buttons.length; i++) {
          const local = this.buttons[i].mesh.worldToLocal(point.clone());
          if (Math.abs(local.x) < .4 && Math.abs(local.y) < .05 && Math.abs(local.z) < .08) { this.choose(i); break; }
        }
      }
      this.pinches.set(hand, pinch);
    }
  }
}
