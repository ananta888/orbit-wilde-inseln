import * as THREE from '/vendor/three.module.js';

export class Movement {
  constructor(rig, camera, renderer, environment, send) {
    Object.assign(this, { rig, camera, renderer, environment, send });
    this.position = [0, 0, 0]; this.velocity = [0, 0, 0]; this.pending = []; this.buffer = { x: 0, y: 0, z: 0, dt: 0 };
    this.sequence = 0; this.keys = new Set(); this.enabled = false; this.mode = 'desktop';
    this.snapLatched = false; this.flightLatched = false; this.flying = false;
    this.yaw = 0; this.pitch = 0; this.turnOffset = new THREE.Vector3(); this.ready = false;
    addEventListener('keydown', event => {
      if (!this.enabled || event.target.matches('input, select, textarea')) return;
      if (event.code === 'KeyF') { event.preventDefault(); if (!event.repeat) this.toggleFlight(); return; }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        this.keys.add(event.code); event.preventDefault();
      }
    });
    addEventListener('keyup', event => this.keys.delete(event.code));
    addEventListener('blur', () => this.clearInput());
    renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
    renderer.domElement.addEventListener('pointermove', event => {
      if (!this.enabled || renderer.xr.isPresenting || !(event.buttons & 2)) return;
      this.yaw -= event.movementX * .003; this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * .003, -1.52, 1.52);
      camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    });
  }
  clearInput() { this.keys.clear(); this.buffer = { x: 0, y: 0, z: 0, dt: 0 }; }
  reset(mode) {
    this.mode = mode; this.pending = []; this.clearInput(); this.ready = false;
    this.position = [0, 0, 0]; this.turnOffset.set(0, 0, 0); this.rig.position.set(0, 0, 0); this.rig.rotation.set(0, 0, 0);
    this.yaw = this.pitch = 0; this.snapLatched = false; this.flightLatched = false; this.flying = false;
    this.velocity = [0, 0, 0];
  }
  get altitude() {
    const [x, y, z] = this.position, ground = this.environment.sample(x, z);
    return Math.max(0, y - Math.max(-.5, ground ?? 0));
  }
  get locomotion() { return this.flying ? 'fly' : this.altitude > .001 ? 'landing' : 'walk'; }
  integrate(position, velocity, direction, dt, flying = this.flying) {
    let result = { position, velocity };
    while (dt > 1e-7) { const part = Math.min(1 / 60, dt); result = this.environment.travel(result.position, result.velocity, ...direction, part, flying); dt -= part; }
    return result;
  }
  queue(direction, dt) {
    const command = { type: 'move', seq: ++this.sequence, direction, dt, flight: this.flying };
    this.pending.push(command); if (this.pending.length > 12) this.pending.shift();
    this.send(command);
  }
  flush() {
    const { x, y, z, dt } = this.buffer;
    if (dt) this.queue([x / dt, y / dt, z / dt], Math.min(.12, dt));
    this.buffer = { x: 0, y: 0, z: 0, dt: 0 };
  }
  toggleFlight() {
    if (!this.enabled || !this.ready || this.mode === 'mr') return;
    this.flush(); // Preserve movement and its mode before queuing the transition.
    this.flying = !this.flying;
    Object.assign(this, this.integrate(this.position, this.velocity, [0, 0, 0], 1 / 60));
    this.queue([0, 0, 0], 1 / 60);
  }
  accept(state) {
    if (!state.player) return;
    this.ready = true;
    this.pending = this.pending.filter(command => command.seq > state.moveAck);
    let result = { position: state.player.slice(), velocity: state.velocity?.slice() || [0, 0, 0] }, flying = state.flying === true;
    for (const command of this.pending) {
      flying = command.flight;
      result = this.integrate(result.position, result.velocity, command.direction, command.dt, flying);
    }
    this.flying = flying;
    const { x, y, z, dt } = this.buffer;
    if (dt) result = this.integrate(result.position, result.velocity, [x / dt, y / dt, z / dt], dt);
    Object.assign(this, result);
  }
  axes(source) {
    const axes = source?.gamepad?.axes;
    return axes?.length >= 4 ? [axes[2], axes[3]] : axes?.length >= 2 ? [axes[0], axes[1]] : [0, 0];
  }
  turn(angle) {
    const head = this.camera.position.clone(); head.y = 0;
    const before = head.clone().applyQuaternion(this.rig.quaternion);
    this.rig.rotation.y += angle;
    const after = head.applyQuaternion(this.rig.quaternion);
    this.turnOffset.add(before.sub(after));
  }
  update(dt, controllers, active) {
    this.enabled = active;
    const left = controllers.find(c => c.userData.source?.handedness === 'left');
    const right = controllers.find(c => c.userData.source?.handedness === 'right');
    // Quest A is the primary face button (index 4 in xr-standard), not the trigger.
    const flightPressed = !!right?.userData.source?.gamepad?.buttons[4]?.pressed;
    if (!active || this.mode === 'mr' || !this.ready) {
      this.clearInput(); this.flightLatched = flightPressed;
      if (this.mode === 'mr') { this.rig.position.set(0, 0, 0); this.rig.rotation.set(0, 0, 0); }
      return;
    }
    let x = 0, y = 0, z = 0, turn = 0;
    if (this.renderer.xr.isPresenting) {
      [x, z] = this.axes(left?.userData.source);
      [turn, y] = this.axes(right?.userData.source); y = -y;
      if (flightPressed && !this.flightLatched) this.toggleFlight();
      this.flightLatched = flightPressed;
      // Choose the dominant axis so climbing doesn't accidentally snap-turn.
      if (Math.abs(turn) > .65 && Math.abs(turn) > Math.abs(y) && !this.snapLatched) { this.turn(-Math.sign(turn) * Math.PI / 6); this.snapLatched = true; }
      if (Math.abs(turn) < .25) this.snapLatched = false;
      if (Math.abs(y) <= Math.abs(turn)) y = 0;
    } else {
      x = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
      z = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));
      y = Number(this.keys.has('Space')) - Number(this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
      turn = Number(this.keys.has('KeyE') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyQ') || this.keys.has('ArrowLeft'));
      this.yaw -= turn * dt * 1.5; this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
    const strength = Math.hypot(x, z);
    const factor = strength > .16 ? Math.min(1, (strength - .16) / .84) / strength : 0;
    x *= factor; z *= factor;
    y = this.flying && Math.abs(y) > .16 ? Math.sign(y) * Math.min(1, (Math.abs(y) - .16) / .84) : 0;
    const moving = x !== 0 || z !== 0 || y !== 0 || Math.hypot(...this.velocity) > 0 || this.locomotion === 'landing';
    if (moving) {
      const facing = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
      facing.y = 0; facing.normalize();
      const dx = -facing.z * x - facing.x * z, dz = facing.x * x - facing.z * z;
      Object.assign(this, this.integrate(this.position, this.velocity, [dx, y, dz], dt));
      this.buffer.x += dx * dt; this.buffer.y += y * dt; this.buffer.z += dz * dt; this.buffer.dt += dt;
    }
    if (this.buffer.dt >= .05 || (!moving && this.buffer.dt > 0)) this.flush();
    this.rig.position.fromArray(this.position).add(this.turnOffset);
  }
}
