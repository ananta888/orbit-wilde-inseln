/** Stateful UI gates shared by ray, pinch and direct index-finger interaction. */
export class PinchGate {
  constructor() { this.reset(); }
  reset() { this.armed = false; this.down = false; }
  update(distance, tracked = true) {
    if (!tracked || !Number.isFinite(distance)) { const was = this.down; this.reset(); return was ? 'cancel' : null; }
    if (distance > .033) { const was = this.down; this.armed = true; this.down = false; return was ? 'release' : null; }
    if (this.armed && !this.down && distance < .019) { this.down = true; return 'press'; }
    return null;
  }
}
export class SelectionGate {
  constructor() { this.reset(); this.last = -Infinity; }
  reset() { this.pressed = null; this.poke = null; this.pokeReady = false; }
  press(target) { if (!this.pressed) this.pressed = target; }
  release(target, now) {
    const pressed = this.pressed; this.pressed = null;
    if (!pressed || !target || pressed.key !== target.key || now - this.last < 280) return null;
    this.last = now; return pressed;
  }
  touch(target, depth, now) {
    if (!target || depth > .035 || depth < -.025) { this.poke = null; this.pokeReady = false; return null; }
    if (this.poke !== target.key) { this.poke = target.key; this.pokeReady = depth > .012; }
    if (depth > .016) this.pokeReady = true;
    if (depth < .004 && this.pokeReady && now - this.last >= 280) {
      this.pokeReady = false; this.last = now; this.pressed = null; return target;
    }
    return null;
  }
}

/** WebXR completes with select, then selectend; selectend alone is cancellation.
 * Older emulators emit select before selectstart: defer that confirmation until release.
 */
export class ActionSequence {
  constructor() { this.reset(); }
  reset() { this.started = false; this.confirmed = false; this.earlySelect = false; }
  begin() { this.started = true; this.confirmed = false; }
  select() {
    if (!this.started) { this.earlySelect = true; return false; }
    if (this.confirmed) return false;
    this.confirmed = true; return true;
  }
  end(tracked = true) {
    const complete = tracked && this.started && this.earlySelect && !this.confirmed;
    this.reset(); return complete;
  }
}
