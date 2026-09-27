/** Tracking quality and hysteresis are separate from tool state and network state. */
export class PinchState {
  constructor(close = .021, open = .032) { this.close = close; this.open = open; this.active = false; }
  update(distance, visible) {
    if (!visible || !Number.isFinite(distance)) {
      const event = this.active ? 'cancel' : null; this.active = false; return event;
    }
    if (!this.active && distance < this.close) { this.active = true; return 'begin'; }
    if (this.active && distance > this.open) { this.active = false; return 'end'; }
    return this.active ? 'sample' : null;
  }
}

export class Stroke {
  constructor(tool, hit, settings) {
    this.region = hit.region; this.start = hit.point.slice(); this.normal = hit.normal.slice();
    this.samples = [this.start]; this.last = this.start; this.settings = { ...settings }; this.tool = tool;
  }
  update(point) {
    this.last = point.slice();
    if (this.samples.length < 64 && Math.hypot(...point.map((x, i) => x - this.samples.at(-1)[i])) > this.settings.radius * .12)
      this.samples.push(point.slice());
  }
  operation() {
    if (this.tool === 'pose') return { tool: 'pose', bone: this.region,
      rotation: [0, Math.max(-1.5, Math.min(1.5, (this.last[0] - this.start[0]) * 2)),
        Math.max(-1.5, Math.min(1.5, (this.last[1] - this.start[1]) * 2))] };
    return { tool: this.tool, regions: [this.region], samples: this.samples, normal: this.normal,
      delta: this.last.map((x, i) => Math.max(-2, Math.min(2, x - this.start[i]))), ...this.settings };
  }
}
