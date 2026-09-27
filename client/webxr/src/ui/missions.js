import * as THREE from '/vendor/three.module.js';
import { MissionObjects } from '/src/rendering/mission-objects.js';
import { VoiceCapture } from '/src/audio/recording.js';
import { interaction } from '/src/networking/protocol.js';

const verbs = { observe: 'Beobachten', collect: 'Mitnehmen', use: 'Verwenden', speak: 'Frei antworten', reach: 'Ort betreten', distract: 'Ablenken', sneak: 'Leisen Weg nutzen', hit: 'Mit dem Bogen treffen' };
function makePanel(parent, width, height, y) {
  const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * height / 1100), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false }));
  mesh.position.y = y; mesh.renderOrder = 103; parent.add(mesh); return { canvas, mesh, texture };
}
function paint(panel, text) {
  const ctx = panel.canvas.getContext('2d'); ctx.fillStyle = '#183932f2'; ctx.fillRect(0, 0, 1100, panel.canvas.height);
  ctx.fillStyle = '#e6eccb'; ctx.font = '36px sans-serif'; ctx.textBaseline = 'top';
  let line = '', y = 20;
  for (const word of text.split(/\s+/)) {
    if (ctx.measureText(line + word).width > 1030 && line) { ctx.fillText(line, 30, y); line = ''; y += 43; }
    line += word + ' ';
  }
  ctx.fillText(line, 30, y); panel.texture.needsUpdate = true;
}

export class MissionUI {
  constructor(scene, contentRoot, send, getStream) {
    Object.assign(this, { send, getStream });
    this.objects = new MissionObjects(contentRoot); this.packet = null; this.page = 0; this.notice = ''; this.lastKey = ''; this.panelOpen = false;
    this.root = new THREE.Group(); scene.add(this.root); this.root.visible = false;
    this.caption = makePanel(this.root, .9, 410, .28);
    this.buttons = Array.from({ length: 6 }, (_, i) => makePanel(this.root, .9, 100, .02 - i * .09));
    this.actions = []; this.ray = new THREE.Raycaster(); this.pinches = new Map(); this.active = false;
    this.voice = new VoiceCapture(text => { this.notice = text; this.paint(); }, text => this.reply(text));
    this.element = document.getElementById('mission-panel');
    this.element.addEventListener('click', event => {
      const button = event.target.closest('[data-mission-action]');
      if (button) this.choose(Number(button.dataset.missionAction));
    });
    document.getElementById('mission-reply').addEventListener('submit', event => {
      event.preventDefault(); const input = document.getElementById('mission-answer'); this.reply(input.value); input.value = '';
    });
    document.getElementById('mission-select').addEventListener('change', event => {
      this.send(event.target.value ? { type: 'mission_start', id: event.target.value } : { type: 'mission_leave' });
    });
    document.getElementById('apply-settings').addEventListener('click', () => this.send({ type: 'settings',
      fitness: document.getElementById('fitness').value, difficulty: Number(document.getElementById('difficulty').value), adaptive: false }));
  }
  receive(packet) {
    const changed = this.packet?.active?.stage !== packet.active?.stage || this.packet?.active?.id !== packet.active?.id;
    if (changed) { this.notice = ''; this.voice.finish(true); this.hintLevel = 0; if (packet.active) this.panelOpen = true; }
    this.packet = packet; this.objects.receive(packet);
    if (!this.initialSettings) {
      this.initialSettings = true; document.getElementById('fitness').value = packet.settings.fitness; document.getElementById('difficulty').value = packet.settings.difficulty;
    }
    const select = document.getElementById('mission-select');
    const catalogKey = JSON.stringify(packet.catalog);
    if (catalogKey !== this.catalogKey) {
      this.catalogKey = catalogKey; select.replaceChildren(new Option('Frei erkunden', ''));
      for (const item of packet.catalog) select.add(new Option(item.title, item.id));
    }
    select.value = packet.active?.id || '';
    this.paint();
  }
  error(text) { this.notice = text; this.paint(); }
  reply(text) {
    const objective = this.packet?.active?.objectives.find(item => item.event === 'speak' && item.progress < item.count);
    if (objective && text.trim()) { this.send(interaction(objective.target, 'speak', text)); this.notice = 'Deine Antwort wurde gesendet.'; this.paint(); }
  }
  choose(index) { if (this.active) this.actions[index]?.run(); }
  paint() {
    if (!this.packet) return;
    const active = this.packet.active;
    const actions = [];
    let caption = 'Wähle eine Episode oder erkunde die Inseln frei.';
    if (active) {
      caption = `${active.title} · ${active.stage}. ${active.narration?.text || 'Arin erinnert sich an ein weiteres Fragment.'}`;
      for (const item of active.objectives.filter(item => item.progress < item.count).slice(0, 3)) {
        actions.push({ label: `${verbs[item.event]}: ${item.description}`, run: () => {
          if (item.event === 'hit') { this.error('Spanne den Bogen und triff das Holzzeichen.'); return; }
          if (item.event === 'speak') {
            if (!this.xr) { document.getElementById('mission-answer').focus(); return; }
            if (this.voice.recording) { this.voice.finish(); return; }
            const stream = this.getStream();
            if (!stream) { this.error('Aktiviere vor dem XR-Start das Mikrofon auf der Startseite.'); return; }
            this.voice.start(stream); return;
          }
          this.send(interaction(item.target, item.event));
        }});
      }
      actions.push({ label: 'Ananta: nächster Hinweis', run: () => {
        const level = Math.min(3, (this.hintLevel || 0) + 1); this.hintLevel = level; this.send({ type: 'hint', level });
      }});
      actions.push({ label: 'Ananta: vollständige Hilfe anfordern', run: () => this.send({ type: 'hint', level: 4, full_help: true }) });
      actions.push({ label: 'Episode verlassen · frei erkunden', run: () => { this.hintLevel = 0; this.send({ type: 'mission_leave' }); } });
    } else {
      const catalog = this.packet.catalog, pageCount = Math.max(1, Math.ceil(catalog.length / 4));
      this.page %= pageCount;
      for (const item of catalog.slice(this.page * 4, this.page * 4 + 4)) actions.push({ label: item.title, run: () => this.send({ type: 'mission_start', id: item.id }) });
      if (pageCount > 1) actions.push({ label: 'Weitere Episoden', run: () => { this.page++; this.lastKey = ''; this.paint(); } });
    }
    this.actions = actions;
    const text = this.notice || this.packet.notice || caption;
    const key = JSON.stringify([text, actions.map(item => item.label)]);
    if (key === this.lastKey) return; this.lastKey = key;
    document.getElementById('mission-caption').textContent = text;
    const list = document.getElementById('mission-actions'); list.replaceChildren();
    actions.forEach((action, i) => { const button = document.createElement('button'); button.textContent = action.label; button.dataset.missionAction = i; list.append(button); });
    document.getElementById('mission-reply').hidden = !active?.objectives.some(item => item.event === 'speak');
    paint(this.caption, text);
    this.buttons.forEach((button, i) => { button.mesh.visible = !!actions[i]; if (actions[i]) paint(button, actions[i].label); });
  }
  hit(controller) {
    if (!this.active || !this.root.visible) return null;
    controller.updateWorldMatrix(true, false); this.root.updateMatrixWorld(true);
    this.ray.set(controller.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, 0, -1).applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion())));
    const hit = this.ray.intersectObjects(this.buttons.filter(item => item.mesh.visible).map(item => item.mesh)).find(item => item.distance < 4);
    return hit || null;
  }
  select(controller) {
    const hit = this.hit(controller);
    if (!hit) return false;
    this.choose(this.buttons.findIndex(item => item.mesh === hit.object)); return true;
  }
  update(camera, hands, active, xr, controllers = []) {
    for (const controller of controllers) {
      if (controller.userData.missionRay) controller.userData.missionRay.visible = false;
      const source = controller.userData.source;
      const pressed = source?.handedness === 'left' && !!source.gamepad?.buttons[4]?.pressed;
      if (pressed && !controller.userData.missionPressed && active) this.panelOpen = !this.panelOpen;
      controller.userData.missionPressed = pressed;
    }
    this.active = active; this.xr = xr; this.root.visible = active && xr && this.panelOpen; this.element.hidden = !active || xr;
    if (!active) { this.voice.finish(true); return; }
    if (!xr || !this.panelOpen) { if (xr) this.voice.finish(true); return; }
    const head = camera.getWorldPosition(new THREE.Vector3()), rotation = camera.getWorldQuaternion(new THREE.Quaternion());
    this.root.position.copy(new THREE.Vector3(-.45, -.08, -.7).applyQuaternion(rotation).add(head)); this.root.quaternion.copy(rotation);
    this.root.updateMatrixWorld(true);
    for (const controller of controllers) {
      if (!controller.userData.missionRay) {
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
        const ray = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#e1eaaa', depthTest: false }));
        ray.renderOrder = 105; controller.add(ray); controller.userData.missionRay = ray;
      }
      const hit = this.hit(controller), ray = controller.userData.missionRay;
      ray.visible = !!hit; if (hit) ray.scale.z = hit.distance;
    }
    for (const hand of hands) {
      const finger = hand.joints?.['index-finger-tip'], thumb = hand.joints?.['thumb-tip'];
      if (!hand.visible || !finger || !thumb) { this.pinches.set(hand, false); continue; }
      const point = finger.getWorldPosition(new THREE.Vector3()), pinch = point.distanceTo(thumb.getWorldPosition(new THREE.Vector3())) < .025;
      if (pinch && !this.pinches.get(hand)) {
        for (let i = 0; i < this.buttons.length; i++) {
          if (!this.buttons[i].mesh.visible) continue;
          const local = this.buttons[i].mesh.worldToLocal(point.clone());
          if (Math.abs(local.x) < .45 && Math.abs(local.y) < .045 && Math.abs(local.z) < .09) { this.choose(i); break; }
        }
      }
      this.pinches.set(hand, pinch);
    }
  }
}
