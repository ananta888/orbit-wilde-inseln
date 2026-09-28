import * as THREE from 'three';

function wrap(context, text, width) {
  const lines = []; let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (context.measureText(line + ' ' + word).width > width && line) { lines.push(line); line = word; }
    else line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  return lines;
}
export function tile(parent, width, height, { x = 0, y = 0, text = '', small = false } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = Math.round(900 * height / width);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  mesh.position.set(x, y, 0); mesh.renderOrder = 200; parent.add(mesh);
  const item = { mesh, canvas, texture, width, height, small, text, lines: [] };
  paintTile(item, text); return item;
}
export function paintTile(item, text, accent = false) {
  item.text = text;
  const c = item.canvas.getContext('2d'), w = item.canvas.width, h = item.canvas.height;
  c.clearRect(0, 0, w, h); c.fillStyle = accent ? '#245d59' : '#102c32';
  c.beginPath(); c.roundRect(3, 3, w - 6, h - 6, Math.min(22, h / 5)); c.fill();
  c.strokeStyle = accent ? '#98efce' : '#426c70'; c.lineWidth = 2; c.stroke();
  const size = Math.round(900 * (item.small ? .0115 : .014) / item.width);
  item.fontSize = size;
  c.font = `500 ${size}px system-ui, sans-serif`; c.textBaseline = 'middle'; c.fillStyle = '#f1f8f1';
  const lines = wrap(c, text, w - 62), max = Math.max(1, Math.floor((h - 14) / (size * 1.26)));
  item.lines = lines;
  const visible = lines.slice(0, max);
  if (lines.length > max) visible[max - 1] = visible[max - 1].replace(/\s+\S*$/, '') + ' …';
  const start = (h - (visible.length - 1) * size * 1.26) / 2;
  visible.forEach((line, i) => c.fillText(line, 28, start + i * size * 1.26));
  item.texture.needsUpdate = true;
}

/** A 42 cm, paged surface. Complex content rests in space after opening. */
export class SpatialPanel {
  constructor(parent, title) {
    this.root = new THREE.Group(); parent.add(this.root); this.root.visible = false;
    this.title = title; this.version = 0; this.page = 0; this.textPage = 0; this.actions = [];
    this.header = tile(this.root, .342, .037, { x: -.039, y: .193, small: true });
    this.close = tile(this.root, .062, .037, { x: .179, y: .193, text: '×' });
    this.caption = tile(this.root, .42, .115, { y: .11, small: true });
    this.buttons = Array.from({ length: 3 }, (_, i) => tile(this.root, .42, .056, { y: .014 - i * .069 }));
    this.previous = tile(this.root, .095, .037, { x: -.1625, y: -.184, text: '←' });
    this.counter = tile(this.root, .198, .037, { y: -.184, small: true });
    this.next = tile(this.root, .095, .037, { x: .1625, y: -.184, text: '→' });
    this.tiles = [this.header, this.close, this.caption, ...this.buttons, this.previous, this.counter, this.next];
    this.raycaster = new THREE.Raycaster(); this.hovered = new Set();
  }
  setContent(title, text, actions) {
    const key = JSON.stringify([title, text, actions.map(action => action.label)]);
    this.actions = actions;
    if (key === this.contentKey) return;
    this.contentKey = key; this.title = title; this.text = text; this.page = 0; this.textPage = 0; this.version++;
    this.draw();
  }
  draw() {
    paintTile(this.header, this.title, true);
    const c = this.caption.canvas.getContext('2d'); c.font = `500 ${this.caption.fontSize}px system-ui, sans-serif`;
    const lines = wrap(c, this.text || '', 838), perPage = 6;
    this.textPages = Math.max(1, Math.ceil(lines.length / perPage)); this.textPage %= this.textPages;
    paintTile(this.caption, lines.slice(this.textPage * perPage, (this.textPage + 1) * perPage).join(' '));
    this.caption.run = () => { this.textPage++; this.draw(); };
    this.buttons.forEach((item, i) => {
      const index = this.page * 3 + i, action = this.actions[index];
      item.mesh.visible = !!action; item.run = action?.run; item.actionIndex = index;
      if (action) paintTile(item, action.label);
    });
    const count = Math.max(1, Math.ceil(this.actions.length / 3));
    this.previous.mesh.visible = this.next.mesh.visible = count > 1;
    this.previous.run = () => { this.page = (this.page + count - 1) % count; this.version++; this.draw(); };
    this.next.run = () => { this.page = (this.page + 1) % count; this.version++; this.draw(); };
    paintTile(this.counter, this.textPages > 1 ? `Text ${this.textPage + 1}/${this.textPages} · antippen` : `${this.page + 1} / ${count}   ·   Tippen / Trigger`);
    this.counter.run = this.caption.run;
  }
  target(item, point, depth = null) {
    const version = this.version, run = item.run;
    return { key: `${this.root.uuid}:${version}:${this.tiles.indexOf(item)}`, item, panel: this,
      point, depth, run: () => { if (this.root.visible && this.version === version) run?.(); } };
  }
  ray(origin, direction) {
    if (!this.root.visible) return null;
    this.root.updateWorldMatrix(true, true); this.raycaster.set(origin, direction); this.raycaster.far = 2.5;
    const hit = this.raycaster.intersectObjects(this.tiles.filter(t => t.mesh.visible && t.run).map(t => t.mesh), false)[0];
    return hit ? this.target(this.tiles.find(t => t.mesh === hit.object), hit.point) : null;
  }
  near(point) {
    if (!this.root.visible) return null;
    this.root.updateWorldMatrix(true, true);
    for (const item of this.tiles) {
      if (!item.mesh.visible || !item.run) continue;
      const local = item.mesh.worldToLocal(point.clone());
      if (Math.abs(local.x) < item.width / 2 + .004 && Math.abs(local.y) < item.height / 2 + .004 && Math.abs(local.z) < .045)
        return this.target(item, point.clone().addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion())), -local.z), local.z);
    }
    return null;
  }
  highlight(targets) {
    const hovered = new Set(targets.filter(t => t?.panel === this).map(t => t.item));
    for (const item of this.tiles) {
      const lit = hovered.has(item);
      item.mesh.material.color.set(performance.now() < (item.flashUntil || 0) ? '#ffe2a2' : '#ffffff');
      if (lit !== this.hovered.has(item)) paintTile(item, item.text, lit || item === this.header);
    }
    this.hovered = hovered;
  }
}
