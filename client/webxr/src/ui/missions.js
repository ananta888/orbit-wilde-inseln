import { SpatialPanel } from './spatial-panel.js';
import { MissionObjects } from '/src/rendering/mission-objects.js';
import { VoiceCapture } from '/src/audio/recording.js';
import { interaction } from '/src/networking/protocol.js';

const verbs = { observe: 'Beobachten', collect: 'Mitnehmen', use: 'Verwenden', speak: 'Frei antworten', reach: 'Ort betreten', distract: 'Ablenken', sneak: 'Leisen Weg nutzen', hit: 'Mit dem Bogen treffen' };
export class MissionUI {
  constructor(scene, contentRoot, send, getStream) {
    Object.assign(this, { send, getStream });
    this.objects = new MissionObjects(contentRoot); this.packet = null; this.page = 0; this.notice = ''; this.lastKey = ''; this.panelOpen = false;
    this.surface = new SpatialPanel(scene, 'Episoden');
    Object.assign(this, { root: this.surface.root, caption: this.surface.caption, buttons: this.surface.buttons });
    this.actions = []; this.active = false;
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
    if (changed) { this.notice = ''; this.voice.finish(true); this.hintLevel = 0; this.surface.page = 0; }
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
    this.surface.setContent(active?.title || 'Episoden', text, actions.map((action, i) => ({ label: action.label, run: () => this.choose(i) })));
  }
  update(camera, hands, active, xr) {
    this.active = active; this.xr = xr; this.element.hidden = !active || xr;
    if (!active) this.voice.finish(true);
  }
}
