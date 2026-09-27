import * as THREE from '/vendor/three.module.js';
import { mergeParts, part } from '/src/rendering/jungle.js';

const sphere = new THREE.SphereGeometry(1, 16, 10);
const cone = new THREE.ConeGeometry(1, 1, 8);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 9);
const scale = new THREE.IcosahedronGeometry(1, 0);
const UP = new THREE.Vector3(0, 1, 0);
function joined(parts, parent, material = null) {
  const mesh = new THREE.Mesh(mergeParts(parts), material || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7 }));
  parent.add(mesh); return mesh;
}
function bar(a, b, radius, color, target) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.sub(from);
  const matrix = new THREE.Matrix4().compose(from.addScaledVector(delta, .5), new THREE.Quaternion().setFromUnitVectors(UP, delta.clone().normalize()), new THREE.Vector3(radius, delta.length(), radius));
  target.push({ geometry: cylinder, matrix, shade: color });
}
function wing(side) {
  const group = new THREE.Group(), parts = [];
  const fingers = [[1.8, .28, -.65], [4.6, .0, -1.5], [4.1, -.03, .15], [3.2, -.10, 1.3], [1.6, -.18, 2.0]];
  const elbow = [.9, .28, -.15];
  bar([0, 0, 0], elbow, .12, '#315e61', parts);
  const vertices = [];
  for (let i = 0; i < fingers.length; i++) {
    bar(elbow, fingers[i], .06 + (i === 0 ? .05 : 0), '#c6aa68', parts);
    if (i < fingers.length - 1) vertices.push(...elbow, ...fingers[i], ...fingers[i + 1]);
  }
  vertices.push(0, 0, 0, ...elbow, ...fingers.at(-1), 0, 0, 0, ...fingers.at(-1), 0, -.1, 1.3);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
  const membrane = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#bb7858', side: THREE.DoubleSide, roughness: .85 }));
  group.add(membrane); joined(parts, group); group.scale.x = side; group.position.set(side * .55, .12, .0);
  return group;
}

export class DragonMount {
  constructor(scene) {
    this.root = new THREE.Group(); this.root.visible = false; scene.add(this.root);
    this.body = new THREE.Group(); this.root.add(this.body);
    this.heading = null; this.blend = 0; this.mood = 'calm'; this.gesture = 'glide'; this.time = 0;
    const parts = [part(sphere, '#366f70', [0, 0, .2], [.68, .55, 1.6]),
      part(sphere, '#bad0a8', [0, -.35, -.03], [.46, .25, 1.25]),
      part(sphere, '#2b5558', [0, .24, -1.5], [.37, .42, .95]),
      part(sphere, '#428482', [0, .62, -2.25], [.34, .46, .7])];
    for (let i = 0; i < 10; i++) {
      const z = -.7 + i * .31;
      parts.push(part(cone, '#d2b87c', [0, .51 - Math.abs(z) * .075, z], [.095, .24, .22], [-.4, 0, 0]));
    }
    for (let side of [-1, 1]) {
      for (let i = 0; i < 7; i++) parts.push(part(scale, i % 2 ? '#468a80' : '#326e73', [side * .48, .28, -1.0 + i * .40], [.17, .085, .26], [0, 0, side * -.7]));
      for (const z of [-.45, 1.05]) {
        bar([side * .4, -.05, z], [side * .72, -.48, z + .35], .19, '#2e6668', parts);
        bar([side * .72, -.48, z + .35], [side * .4, -.55, z + .85], .12, '#386d68', parts);
        for (let k = 0; k < 3; k++) parts.push(part(cone, '#e6d3a4', [side * (.34 + k * .08), -.61, z + .98], [.045, .25, .045], [Math.PI / 2, 0, 0]));
      }
    }
    joined(parts, this.body);
    this.head = new THREE.Group(); this.head.position.set(0, .72, -2.68); this.body.add(this.head);
    const head = [part(sphere, '#428783', [0, 0, 0], [.43, .34, .65]),
      part(sphere, '#326f6d', [0, -.12, -.57], [.3, .17, .46]),
      part(sphere, '#b6c7a0', [0, -.24, -.32], [.32, .06, .63])];
    for (let side of [-1, 1]) {
      head.push(part(cone, '#d3bb87', [side * .30, .35, .22], [.11, .62, .12], [-.7, 0, side * -.35]));
      head.push(part(cone, '#668782', [side * .41, .05, .24], [.17, .44, .14], [0, 0, side * -1.1]));
      for (let j = 0; j < 4; j++) head.push(part(cone, '#e8dfbd', [side * .25, -.21, -.73 + j * .15], [.038, .11, .035], [Math.PI, 0, 0]));
    }
    joined(head, this.head);
    const eyes = [];
    for (let side of [-1, 1]) {
      eyes.push(part(sphere, '#efc168', [side * .37, .06, -.25], [.09, .075, .15]));
      eyes.push(part(sphere, '#132e32', [side * .43, .07, -.27], [.02, .052, .023]));
    }
    this.eyes = joined(eyes, this.head, new THREE.MeshStandardMaterial({ vertexColors: true, emissive: '#b06a21', emissiveIntensity: .35 }));
    this.wings = [wing(-1), wing(1)]; this.body.add(...this.wings);
    this.tail = [];
    let parent = this.body;
    for (let i = 0; i < 7; i++) {
      const joint = new THREE.Group(); joint.position.set(0, i ? 0 : -.08, i ? .63 : 1.38); parent.add(joint);
      const r = .25 * (1 - i / 8);
      joined([part(sphere, i % 2 ? '#367876' : '#336768', [0, 0, .31], [r, r * .7, .44]), part(cone, '#c6af73', [0, r * .75, .28], [.05, r, .15], [-.7, 0, 0])], joint);
      this.tail.push(joint); parent = joint;
    }
    joined([part(cone, '#bb7858', [0, .0, .52], [.32, .6, .05], [Math.PI / 2, 0, 0])], parent);
    // A prone rider: the torso and legs extend along the dragon's back; no artificial head rotation.
    this.rider = new THREE.Group(); this.body.add(this.rider);
    const rider = [part(sphere, '#363e48', [0, .78, .42], [.25, .15, .57]),
      part(sphere, '#665347', [0, .65, 1.02], [.23, .13, .24])];
    for (let side of [-1, 1]) {
      bar([side * .14, .65, 1.05], [side * .36, .45, 1.55], .115, '#384552', rider);
      bar([side * .36, .45, 1.55], [side * .26, .35, 2.04], .085, '#3e4b56', rider);
      rider.push(part(sphere, '#3b302b', [side * .26, .31, 2.13], [.1, .075, .2]));
    }
    joined(rider, this.rider);
    this.arms = [-1, 1].map(side => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, 1, 8), new THREE.MeshStandardMaterial({ color: '#526270' }));
      this.rider.add(mesh); return { mesh, side };
    });
  }
  react(state) { this.mood = state.mood || 'calm'; this.gesture = state.gesture || 'glide'; }
  async setAsset(descriptor) {
    if (this.assetHash === descriptor?.hash) return;
    const generation = this.assetGeneration = (this.assetGeneration || 0) + 1;
    if (!this.defaultVisuals) this.defaultVisuals = this.body.children.filter(child => child !== this.rider);
    if (!descriptor) {
      this.custom?.dispose(); this.custom = null; this.assetHash = null;
      this.defaultVisuals.forEach(child => { child.visible = true; }); return;
    }
    const { CreatureAssets, alignRider } = await import('./creature-assets.js');
    this.assetCache ||= new CreatureAssets();
    const candidate = await this.assetCache.instantiate(descriptor, new THREE.Group());
    if (generation !== this.assetGeneration) { candidate.dispose(); return; }
    try { alignRider(candidate); } catch (error) { candidate.dispose(); throw error; }
    this.body.add(candidate.view.root);
    this.custom?.dispose(); this.custom = candidate; this.assetHash = descriptor.hash;
    this.defaultVisuals.forEach(child => { child.visible = false; });
  }
  update(dt, camera, movement, controllers, active) {
    const mounted = active && movement.mode !== 'mr' && movement.locomotion !== 'walk';
    this.blend = THREE.MathUtils.damp(this.blend, mounted ? 1 : 0, 7, dt);
    this.root.visible = this.blend > .02;
    if (!this.root.visible) { this.heading = null; return; }
    const velocity = new THREE.Vector3(...movement.velocity), speed = Math.hypot(velocity.x, velocity.z);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const targetHeading = speed > .4 ? Math.atan2(-velocity.x, -velocity.z) : (this.heading ?? Math.atan2(-forward.x, -forward.z));
    this.heading ??= targetHeading;
    const delta = Math.atan2(Math.sin(targetHeading - this.heading), Math.cos(targetHeading - this.heading));
    this.heading += delta * (1 - Math.exp(-3 * dt));
    this.root.position.copy(movement.rig.position).add(new THREE.Vector3(Math.sin(this.heading) * .8, .33, Math.cos(this.heading) * .8));
    this.root.rotation.y = this.heading; this.root.scale.setScalar(this.blend);
    this.time += dt;
    if (this.custom) {
      const clips = this.custom.artifact.document.clips;
      this.custom.view.pose(true, this.time, clips.find(c => c.id === (speed > .5 ? 'fly' : 'idle')));
    }
    const climbing = THREE.MathUtils.clamp(velocity.y / Math.max(5, velocity.length()), -1, 1);
    this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, climbing * .18, 4, dt);
    this.body.rotation.z = THREE.MathUtils.damp(this.body.rotation.z, THREE.MathUtils.clamp(-delta * .28, -.22, .22), 4, dt);
    const flap = Math.sin(this.time * (climbing > .2 ? 6.5 : 3.8)) * (speed > 12 && climbing < .2 ? .045 : .24);
    this.wings.forEach((wing, i) => { wing.rotation.z = (i ? 1 : -1) * (flap + .12); });
    this.tail.forEach((tail, i) => { tail.rotation.y = Math.sin(this.time * 1.8 - i * .5) * .065; tail.rotation.x = Math.cos(this.time - i * .4) * .035; });
    this.head.rotation.y = Math.sin(this.time * .65) * (this.gesture === 'look_around' ? .28 : .045);
    this.head.rotation.x = this.gesture === 'nod' ? Math.sin(this.time * 3) * .09 : -.04;
    this.eyes.material.emissiveIntensity = this.mood === 'excited' ? .9 : this.mood === 'alert' ? .7 : .35;
    this.root.updateMatrixWorld(true);
    for (const { mesh, side } of this.arms) {
      const hand = controllers.find(c => c.userData.source?.handedness === (side < 0 ? 'left' : 'right'));
      mesh.visible = !!hand;
      if (!hand) continue;
      const end = this.rider.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
      const start = new THREE.Vector3(side * .22, .79, -.06), direction = end.clone().sub(start);
      mesh.position.copy(start).addScaledVector(direction, .5);
      mesh.quaternion.setFromUnitVectors(UP, direction.clone().normalize()); mesh.scale.y = Math.min(1, direction.length());
    }
  }
}
