import { applyFrame, beginDocument, decodeFrame } from './protocol.js';
import { Journal } from './journal.js';

export class DesignClient extends EventTarget {
  constructor() {
    super(); this.document = null; this.preview = null; this.pending = null;
    this.journal = new Journal(); this.closed = false; this.serial = 0;
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  async start() {
    await this.journal.open();
    // Establish HttpOnly profile cookie before a websocket upgrade.
    const response = await fetch('/api/design/catalog');
    if (!response.ok) throw Error('Designer benötigt die Python-Erweiterung: pip install -e ".[design]"');
    this.catalog = await response.json(); this.connect();
  }
  connect() {
    const serial = ++this.serial;
    const socket = this.socket = new WebSocket(location.origin.replace(/^http/, 'ws') + '/api/design/ws');
    socket.binaryType = 'arraybuffer'; let chain = Promise.resolve();
    socket.onmessage = event => {
      chain = chain.then(async () => { if (serial === this.serial) await this.receive(event.data); }).catch(error => {
        this.staging = null; this.emit('error', { message: error.message, code: 'transport' }); this.send({ type: 'resync' });
      });
    };
    socket.onclose = () => {
      if (serial !== this.serial) return;
      this.emit('status', 'Verbindung unterbrochen · lokale Änderungen bleiben im Puffer');
      this.pending = null; this.staging = null;
      if (!this.closed) this.timer = setTimeout(() => this.connect(), 1800);
    };
  }
  send(data) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(data)); }
  async receive(data) {
    if (data instanceof ArrayBuffer) {
      if (!this.staging) throw Error('Geometrie ohne Transaktion');
      const packet = await decodeFrame(data);
      if (this.staging.regions.has(packet.header.region_id)) throw Error('Doppelte Regionsantwort');
      this.staging.regions.add(packet.header.region_id);
      applyFrame(this.staging.doc, packet); this.staging.received++; return;
    }
    const message = JSON.parse(data);
    if (message.type === 'hello') {
      this.emit('status', 'Verbunden');
      const id = this.document?.id || localStorage.getItem('orbit-design-asset');
      const found = message.assets.find(a => a.id === id) || message.assets[0];
      this.send(found ? { type: 'open', id: found.id } : { type: 'new', template: 'dragon' });
    } else if (message.type === 'document' || message.type === 'preview_begin') {
      if (this.staging) throw Error('Überlappende Geometrietransaktion');
      if (message.type === 'preview_begin') message.base_revision = this.document.revision;
      this.staging = { doc: beginDocument(this.document, message), received: 0, expected: message.frames,
                       regions: new Set(), preview: message.type === 'preview_begin' };
    } else if (message.type === 'committed' || message.type === 'preview_ready') {
      const stage = this.staging;
      if (!stage || stage.received !== stage.expected || [...stage.doc.regions.values()].some(r => !r.positions)) throw Error('Unvollständige Geometrie');
      this.staging = null;
      if (stage.preview) { this.preview = stage.doc; this.emit('preview', this.preview); }
      else {
        if (message.command_id) { await this.journal.remove(message.command_id); this.pending = null; }
        this.document = stage.doc; this.preview = null;
        localStorage.setItem('orbit-design-asset', this.document.id);
        this.emit('document', this.document);
        this.emit('status', 'Gespeichert · Revision ' + this.document.revision);
        await this.flush();
      }
    } else if (message.type === 'ack') {
      await this.journal.remove(message.command_id); this.pending = null;
      this.send({ type: 'resync' });
    } else if (message.type === 'error') {
      this.pending = null; this.emit('error', message);
    } else if (message.type === 'proposal') this.emit('proposal', message);
    else if (message.type === 'proposal_rejected') { this.preview = null; this.emit('preview', null); }
  }
  async command(operation, type = 'command', extra = {}) {
    if (!this.document) throw Error('Keine Kreatur geladen');
    if (this.pending || (await this.journal.list()).length) throw Error('Zuerst ausstehende Änderung bestätigen oder Konflikt lösen');
    const data = { type, command_id: crypto.randomUUID(), asset_id: this.document.id,
                   base_revision: this.document.revision, ...extra };
    if (type === 'command') data.operation = operation;
    await this.journal.put(data); await this.flush();
  }
  async flush() {
    if (this.pending || this.socket?.readyState !== WebSocket.OPEN || !this.document) return;
    const pending = (await this.journal.list()).filter(c => c.asset_id === this.document.id)[0];
    if (!pending) return;
    // Send the original base revision and ID, even after a reconnect: server dedup runs before CAS.
    const { created, ...command } = pending;
    this.pending = command.command_id; this.emit('status', 'Änderung wird bestätigt …'); this.send(command);
  }
  async discardPending() {
    const list = await this.journal.list();
    for (const c of list) if (c.asset_id === this.document?.id) await this.journal.remove(c.command_id);
    this.pending = null; this.send({ type: 'resync' });
  }
  close() { this.closed = true; clearTimeout(this.timer); this.serial++; this.socket?.close(); }
}
