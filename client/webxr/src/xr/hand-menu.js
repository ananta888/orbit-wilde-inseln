import * as THREE from 'three';
import { SpatialPanel, tile } from '../ui/spatial-panel.js';
import { PinchGate, SelectionGate } from './gestures.js';
const Z = new THREE.Vector3(0, 0, -1);

export class HandMenu {
  constructor(scene, rig, missions, dialogue, cancelBow) {
    Object.assign(this, { scene, rig, missions, dialogue, cancelBow });
    this.states = new Map(); this.current = null; this.xr = false;
    this.dock = new SpatialPanel(rig, 'Orbit');
    for (const item of this.dock.tiles) item.mesh.visible = false;
    const episode = tile(this.dock.root, .10, .042, { x: -.055, text: 'Episoden' });
    const arin = tile(this.dock.root, .10, .042, { x: .055, text: 'Arin' });
    episode.run = () => this.toggle('missions'); arin.run = () => this.toggle('dialogue');
    this.dock.tiles.push(episode, arin); this.dock.root.name = 'wrist-menu';
    for (const name of ['missions', 'dialogue']) {
      rig.attach(this[name].surface.root);
      this[name].surface.close.run = () => this.close();
    }
  }
  get open() { return this.current !== null; }
  close() {
    this.current = null; this.missions.panelOpen = false;
    this.missions.root.visible = this.dialogue.root.visible = false;
    for (const state of this.states.values()) state.selection.reset();
  }
  toggle(name) { if (this.current === name) this.close(); else this.show(name); }
  show(name) {
    if (!this.xr || !this.active) return;
    this.close(); this.current = name; this.cancelBow();
    this.missions.panelOpen = name === 'missions';
    const panel = this[name].surface; panel.root.visible = true;
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    const forward = Z.clone().applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    forward.y = 0; if (forward.lengthSq() < .01) forward.set(0, 0, -1); forward.normalize();
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    const target = head.clone().addScaledVector(forward, .65).addScaledVector(side, -.1); target.y -= .09;
    // Open beside the hand, then hold the panel still while the other hand interacts.
    if (this.anchor) {
      const anchor = this.anchor.getWorldPosition(new THREE.Vector3());
      const ahead = anchor.clone().sub(head).dot(forward);
      if (ahead > .25 && ahead < .8) target.lerp(anchor.add(new THREE.Vector3(0, .10, 0)), .25);
    }
    target.y = Math.max(head.y - .12, target.y);
    panel.root.position.copy(this.rig.worldToLocal(target.clone()));
    const look = new THREE.Object3D(); look.position.copy(target); look.lookAt(head);
    panel.root.quaternion.copy(this.rig.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(look.quaternion);
    panel.root.updateMatrixWorld(true);
  }
  state(side) {
    if (!this.states.has(side)) {
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: '#a2ecd8', transparent: true, opacity: .7, depthTest: false }));
      const cursor = new THREE.Mesh(new THREE.RingGeometry(.004, .006, 24), new THREE.MeshBasicMaterial({ color: '#bafcdb', depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
      ray.renderOrder = cursor.renderOrder = 210; this.scene.add(ray, cursor);
      this.states.set(side, { selection: new SelectionGate(), pinch: new PinchGate(), ray, cursor,
        direction: new THREE.Vector3(), origin: new THREE.Vector3(), target: null });
    }
    return this.states.get(side);
  }
  press(controller) {
    const state = this.state(controller.userData.source?.handedness || 'none');
    if (!this.active || !this.xr) return false;
    if (state.target || this.open) {
      // The runtime suppresses reserved Meta system pinches. Joints only arm input after tracking recovery.
      if (!controller.userData.source?.hand || (state.pinch.armed && state.tracked)) state.selection.press(state.target);
      return true;
    }
    return false;
  }
  cancel(controller) { this.states.get(controller.userData.source?.handedness || 'none')?.selection.reset(); }
  release(controller) {
    const state = this.state(controller.userData.source?.handedness || 'none');
    const hadPress = !!state.selection.pressed;
    const action = state.selection.release(state.target, performance.now());
    if (action) this.activate(action, controller);
    return hadPress || this.open;
  }
  activate(target, controller) {
    this.cancelBow(); target.run();
    const actuator = controller?.userData.source?.gamepad?.hapticActuators?.[0];
    actuator?.pulse(.25, 28).catch(() => {});
    if (target.item) target.item.flashUntil = performance.now() + 180;
  }
  update(dt, now, camera, controllers, grips, hands, active, xr, drawing, preferredHand = 'left') {
    Object.assign(this, { camera, active, xr });
    for (const name of ['missions', 'dialogue']) this[name].root.visible = active && xr && this.current === name;
    if (!active || !xr) {
      this.close(); this.dock.root.visible = false;
      for (const state of this.states.values()) { state.tracked = false; state.pinch.reset(); state.target = null; state.ray.visible = state.cursor.visible = false; }
      return;
    }
    const hand = hands.find(h => h.userData.source?.handedness === preferredHand && h.visible && h.joints?.wrist?.visible);
    this.anchor = hand?.joints.wrist || grips.find(g => g.userData.source?.handedness === preferredHand && g.visible);
    this.dock.root.visible = !!this.anchor && !drawing && !this.open;
    if (this.anchor && this.dock.root.visible) {
      const position = this.anchor.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(preferredHand === 'left' ? -.035 : .035, .075, .02));
      const head = camera.getWorldPosition(new THREE.Vector3()), distance = head.distanceTo(position);
      const forward = Z.clone().applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
      this.dock.root.visible = distance > .2 && distance < 1 && position.clone().sub(head).dot(forward) > .15 && position.y < head.y - .07;
      this.dock.root.position.copy(this.rig.worldToLocal(position.clone()));
      const look = new THREE.Object3D(); look.position.copy(position); look.lookAt(head);
      this.dock.root.quaternion.copy(this.rig.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(look.quaternion);
    }
    const seen = new Set();
    for (const controller of controllers) {
      const source = controller.userData.source;
      if (!source) continue;
      const state = this.state(source.handedness), pressed = source.handedness === 'left' && !!source.gamepad?.buttons[4]?.pressed;
      if (state.source !== source) { state.source = source; state.tracked = false; state.selection.reset(); state.pinch.reset(); state.target = null; }
      if (pressed && !state.menuPressed) this.toggle('missions');
      seen.add(source.handedness); state.menuPressed = pressed;
      const trackedHand = hands.find(h => h.userData.source === source);
      const finger = trackedHand?.joints?.['index-finger-tip'], thumb = trackedHand?.joints?.['thumb-tip'];
      const tracked = controller.visible && (!source.hand || (trackedHand?.visible && finger?.visible && thumb?.visible));
      state.ray.visible = state.cursor.visible = false;
      if (!tracked) { state.tracked = false; state.selection.reset(); state.pinch.reset(); state.target = null; continue; }
      const panels = this.open ? [this[this.current].surface] : [this.dock];
      const origin = controller.getWorldPosition(new THREE.Vector3()), direction = Z.clone().applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()));
      const alpha = 1 - Math.exp(-28 * dt);
      if (!state.tracked) { state.origin.copy(origin); state.direction.copy(direction); }
      else { state.origin.lerp(origin, alpha); state.direction.lerp(direction, alpha).normalize(); }
      state.tracked = tracked;
      const point = finger?.getWorldPosition(new THREE.Vector3());
      const near = point && panels.map(panel => panel.near(point)).find(Boolean);
      state.target = near || panels.map(panel => panel.ray(state.origin, state.direction)).find(Boolean) || null;
      if (state.target) {
        state.cursor.visible = true; state.cursor.position.copy(state.target.point);
        state.cursor.quaternion.copy(state.target.panel.root.getWorldQuaternion(new THREE.Quaternion()));
        state.cursor.translateZ(.002); state.cursor.scale.setScalar(state.selection.pressed ? .75 : 1);
        if (!near) {
          state.ray.visible = true; state.ray.position.copy(origin); state.ray.quaternion.setFromUnitVectors(Z, state.direction);
          state.ray.scale.z = origin.distanceTo(state.target.point);
        }
      }
      if (finger && thumb) {
        const distance = point.distanceTo(thumb.getWorldPosition(new THREE.Vector3()));
        const edge = state.pinch.update(distance, tracked);
        if (edge === 'cancel') state.selection.reset();
        // An extended index may poke; closing a pinch must never masquerade as a poke.
        const action = state.selection.touch(distance > .033 ? near : null, near?.depth ?? Infinity, now);
        if (action) this.activate(action, controller);
      }
    }
    for (const [side, state] of this.states) if (!seen.has(side)) {
      state.tracked = false; state.selection.reset(); state.pinch.reset(); state.target = null; state.ray.visible = state.cursor.visible = false;
    }
    const targets = [...this.states.values()].map(s => s.target);
    for (const panel of [this.dock, this.missions.surface, this.dialogue.surface]) panel.highlight(targets);
  }
}
