import * as THREE from 'three';

/** Small physical buttons around the table, driven by the same actions as desktop. */
export class Palette {
  constructor(parent) { this.root = new THREE.Group(); parent.add(this.root); this.buttons = []; }
  button(label, position, action, color = '#516d43') {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
    const c = canvas.getContext('2d'); c.fillStyle = color; c.fillRect(0, 0, 256, 80);
    c.font = 'bold 25px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#f3f7dc'; c.fillText(label, 128, 49);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.19, .065, .018), new THREE.MeshBasicMaterial({ map: texture }));
    mesh.position.fromArray(position); mesh.rotation.x = -.4; mesh.userData.activate = action;
    this.root.add(mesh); this.buttons.push(mesh); return mesh;
  }
  status(text) {
    if (this.statusMesh) this.remove(this.statusMesh);
    this.statusMesh = this.button(text.slice(0, 22), [0, 1.05, -.83], () => {}, '#263e35');
    this.buttons.pop();
    this.statusMesh.scale.x = 2.4;
  }
  remove(mesh) { this.root.remove(mesh); mesh.geometry.dispose(); mesh.material.map.dispose(); mesh.material.dispose(); }
  actions(actions) {
    this.buttons.forEach(mesh => this.remove(mesh)); this.buttons = [];
    actions.forEach(([label, fn], i) => this.button(label, [(i % 4 - 1.5) * .205, .77 - Math.floor(i / 4) * .08, -.45 + Math.floor(i / 4) * .02], fn));
  }
}
