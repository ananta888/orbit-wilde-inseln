import * as THREE from 'three';

const turn = (from, to, amount) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;

/** Visual companion following. No gameplay position, collision or camera is changed. */
export class CompanionMotion {
  constructor() { this.reset(); }
  reset() {
    this.position = new THREE.Vector3(); this.heading = 0; this.followHeading = 0;
    this.ready = false; this.walking = false; this.speed = 0; this.wasMounted = false;
  }
  ground(x, z, sample) {
    const y = sample(x, z);
    if (!Number.isFinite(y) || y < .08) return null;
    // Keep the standing footprint off cliffs and out of unloaded terrain.
    for (const [dx, dz] of [[1.15, 0], [-1.15, 0], [0, 1.8], [0, -1.8]]) {
      const nearby = sample(x + dx, z + dz);
      if (!Number.isFinite(nearby) || nearby < .08 || Math.abs(nearby - y) > .65) return null;
    }
    return y;
  }
  destination(player, sample) {
    const ahead = new THREE.Vector3(-Math.sin(this.followHeading), 0, -Math.cos(this.followHeading));
    const side = new THREE.Vector3(Math.cos(this.followHeading), 0, -Math.sin(this.followHeading));
    for (const [right, forward] of [[4.6, 2.8], [-4.6, 2.8], [5.4, -1], [-5.4, -1]]) {
      const point = player.clone().addScaledVector(side, right).addScaledVector(ahead, forward);
      const y = this.ground(point.x, point.z, sample);
      if (y !== null) { point.y = y; return point; }
    }
    return null;
  }
  update(dt, player, velocity, headYaw, mounted, sample) {
    dt = THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, .05);
    if (mounted) { this.wasMounted = true; this.walking = false; this.speed = 0; return; }
    if (this.wasMounted) { this.ready = false; this.wasMounted = false; }
    const travel = Math.hypot(velocity.x, velocity.z);
    if (!this.ready) this.followHeading = headYaw;
    else if (travel > .35) this.followHeading = turn(this.followHeading, Math.atan2(-velocity.x, -velocity.z), 1 - Math.exp(-2 * dt));
    const target = this.destination(player, sample);
    if (!target) { this.speed = 0; this.walking = false; return; }
    if (!this.ready) {
      this.position.copy(target); this.heading = this.followHeading; this.ready = true;
      return;
    }
    const delta = target.clone().sub(this.position).setY(0), distance = delta.length();
    // Rebase after a discontinuous world relocation; this is presentation, not a navigation path.
    if (this.position.distanceTo(player) > 40) { this.position.copy(target); this.speed = 0; this.walking = false; return; }
    if (distance > 1.25) this.walking = true;
    if (distance < .12) this.walking = false;
    this.speed = THREE.MathUtils.damp(this.speed, this.walking ? Math.min(4.6, distance * 1.8) : 0, 6, dt);
    const step = Math.min(distance, this.speed * dt);
    if (step < 1e-5) { this.speed = 0; return; }
    const next = this.position.clone().addScaledVector(delta, step / distance);
    const y = this.ground(next.x, next.z, sample);
    if (y === null || Math.abs(y - this.position.y) > .12 + step * .8) { this.speed = 0; this.walking = false; return; }
    next.y = y; this.position.copy(next);
    this.heading = turn(this.heading, Math.atan2(-delta.x, -delta.z), 1 - Math.exp(-4 * dt));
  }
}
