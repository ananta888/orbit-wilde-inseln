import * as THREE from '/vendor/three.module.js';
import { clock, floraGeometry, foliageMaterial, waterMaterial, waterfallMaterial, shadowGeometry, shadowTexture } from '/src/rendering/jungle.js';
import { FLIGHT, coordinates, accelerate } from '/src/input/flight.js';

export class LiveScene {
  constructor(parent) {
    this.root = new THREE.Group(); parent.add(this.root);
    this.geometry = { box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(.5, 12, 8),
      cylinder: new THREE.CylinderGeometry(.5, .5, 1, 8), cone: new THREE.ConeGeometry(.5, 1, 8), crystal: new THREE.OctahedronGeometry(.5) };
    for (const kind of ['palm', 'broadleaf', 'fern', 'rock', 'cliff']) this.geometry[kind] = floraGeometry(kind);
    this.floraMaterial = foliageMaterial();
    this.chunks = new Map(); this.data = new Map(); this.queue = new Map(); this.retiring = [];
    this.mixed = false; this.revision = 0; this.appliedRevision = 0; this.areas = 0; this.title = '';
    this.detailOpacity = 1; this.lastOpacity = 1;
  }
  receive(packet) {
    this.revision = packet.revision; this.title = packet.title; this.areas = packet.areas;
    if (packet.full) {
      const desired = new Set(packet.upsert.map(c => c.id));
      for (const id of new Set([...this.chunks.keys(), ...this.queue.keys()])) if (!desired.has(id)) { this.queue.set(id, null); this.data.delete(id); }
    }
    for (const id of packet.remove) { this.queue.set(id, null); this.data.delete(id); }
    for (const chunk of packet.upsert) { this.queue.set(chunk.id, chunk); this.data.set(chunk.id, chunk); }
  }
  setMixed(mixed) {
    this.mixed = mixed;
    this.root.traverse(object => { if (object.userData.vrOnly) object.visible = !mixed; });
  }
  terrainGeometry(terrain, water = false, palette = {}) {
    const { x, z, size, steps, heights } = terrain, positions = [], colors = [], indices = [];
    const sand = new THREE.Color('#d6c48d'), soil = new THREE.Color(palette.ground || '#608b48'), stone = new THREE.Color(palette.stone || '#647a70');
    const shade = new THREE.Color();
    for (let j = 0; j <= steps; j++) for (let i = 0; i <= steps; i++) {
      const h = heights[j * (steps + 1) + i], px = x + i * size / steps, pz = z + j * size / steps;
      positions.push(px, water ? 0 : h, pz);
      shade.copy(sand).lerp(soil, THREE.MathUtils.smoothstep(h, .4, 2.4));
      if (h > 5) shade.lerp(stone, Math.min(1, (h - 5) / 4));
      const path = Math.abs(px - Math.sin(pz * .07) * 4) < 2.4 && Math.abs(pz) < 42;
      if (path && h > 1) shade.lerp(sand, .45);
      shade.multiplyScalar(.93 + Math.sin(px * 3.2 + pz * 4.6) * .045);
      colors.push(shade.r, shade.g, shade.b);
      if (i < steps && j < steps) { const a = j * (steps + 1) + i; indices.push(a, a + steps + 1, a + 1, a + 1, a + steps + 1, a + steps + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    if (water) g.setAttribute('depth', new THREE.Float32BufferAttribute(heights.map(h => Math.max(0, -h)), 1));
    g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }
  build(chunk) {
    const group = new THREE.Group(); Object.assign(group.userData, { id: chunk.id, version: chunk.version });
    if (chunk.terrain) {
      const ground = new THREE.Mesh(this.terrainGeometry(chunk.terrain, false, chunk.palette), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
      ground.userData.ownedGeometry = true; ground.userData.vrOnly = true; group.add(ground);
      if (chunk.terrain.heights.some(h => h < .1)) {
        const water = new THREE.Mesh(this.terrainGeometry(chunk.terrain, true), waterMaterial());
        water.userData.ownedGeometry = true; water.userData.vrOnly = true; group.add(water);
      }
      const kinds = new Map();
      for (const prop of chunk.props) { if (!kinds.has(prop.kind)) kinds.set(prop.kind, []); kinds.get(prop.kind).push(prop); }
      const transform = new THREE.Object3D();
      const shadedProps = chunk.props.filter(p => p.kind !== 'fern');
      if (shadedProps.length) {
        const shadows = new THREE.InstancedMesh(shadowGeometry, new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }), shadedProps.length);
        shadedProps.forEach((p, i) => { transform.position.set(p.position[0], p.position[1] + .03, p.position[2]); transform.rotation.set(0, 0, 0); transform.scale.set(p.scale * 3.6, 1, p.scale * 3.6); transform.updateMatrix(); shadows.setMatrixAt(i, transform.matrix); });
        shadows.instanceMatrix.needsUpdate = true; shadows.computeBoundingSphere(); shadows.userData.vrOnly = true; group.add(shadows);
      }
      for (const [kind, props] of kinds) {
        const material = ['rock', 'cliff'].includes(kind) ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }) : this.floraMaterial.clone();
        if (!['rock', 'cliff'].includes(kind)) material.onBeforeCompile = this.floraMaterial.onBeforeCompile;
        const stone = ['rock', 'cliff'].includes(kind), base = new THREE.Color(stone ? '#647a70' : '#39854c');
        const tint = new THREE.Color(chunk.palette[stone ? 'stone' : 'foliage']);
        material.color.setRGB(Math.min(2, tint.r / base.r), Math.min(2, tint.g / base.g), Math.min(2, tint.b / base.b));
        const batch = new THREE.InstancedMesh(this.geometry[kind], material, props.length);
        props.forEach((p, i) => { transform.position.set(...p.position); transform.rotation.set(0, p.yaw, 0); transform.scale.setScalar(p.scale); transform.updateMatrix(); batch.setMatrixAt(i, transform.matrix); });
        batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere(); batch.userData.vrOnly = true; group.add(batch);
      }
      for (const fall of chunk.falls) {
        const [x, y, z] = fall.position;
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(fall.width, fall.height, 6, 16), waterfallMaterial());
        sheet.position.set(x, y + fall.height / 2, z + 3); sheet.userData.ownedGeometry = true; sheet.userData.vrOnly = true; group.add(sheet);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(3.1, 28), new THREE.MeshBasicMaterial({ color: '#a2d9c5', transparent: true, opacity: .45, depthWrite: false }));
        pool.rotation.x = -Math.PI / 2; pool.position.set(x, y + .06, z + 5); pool.scale.y = .7;
        pool.userData.ownedGeometry = true; pool.userData.vrOnly = true; group.add(pool);
        const points = [];
        for (let i = 0; i < 70; i++) points.push(x + Math.sin(i * 7.1) * 2.5, y + .3 + (i % 9) * .13, z + 3 + Math.cos(i * 3.7) * 1.8);
        const mist = new THREE.BufferGeometry(); mist.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        const spray = new THREE.Points(mist, new THREE.PointsMaterial({ color: '#d7eee1', size: .18, transparent: true, opacity: .28, depthWrite: false }));
        spray.userData.ownedGeometry = true; spray.userData.vrOnly = true; group.add(spray);
      }
    }
    for (const object of chunk.objects) {
      const mesh = new THREE.Mesh(this.geometry[object.kind], new THREE.MeshStandardMaterial({ color: object.color, roughness: .9 }));
      mesh.position.set(...object.position); mesh.rotation.set(...object.rotation); mesh.scale.set(...object.scale); mesh.userData.vrOnly = object.space === 'vr'; group.add(mesh);
    }
    group.traverse(object => {
      if (object.userData.vrOnly) object.visible = !this.mixed;
      if (object.material) { object.userData.opacity = object.material.opacity; object.material.transparent = true; object.material.opacity = 0; if (object.material.uniforms?.uOpacity) object.material.uniforms.uOpacity.value = 0; }
    });
    group.userData.fade = 0;
    return group;
  }
  fade(group, amount) {
    group.userData.fade = amount;
    for (const object of group.children) if (object.material) {
      object.material.opacity = amount * object.userData.opacity * this.detailOpacity;
      if (object.material.uniforms?.uOpacity) object.material.uniforms.uOpacity.value = amount * this.detailOpacity;
    }
  }
  tick(dt, now) {
    clock.value = now / 1000;
    this.root.visible = this.detailOpacity > .001;
    if (this.queue.size) {
      const [id, chunk] = this.queue.entries().next().value; this.queue.delete(id);
      const previous = this.chunks.get(id);
      if (!chunk || previous?.userData.version !== chunk.version) {
        if (previous) { this.retiring.push(previous); this.chunks.delete(id); }
        if (chunk) { const group = this.build(chunk); this.root.add(group); this.chunks.set(id, group); }
      }
    }
    if (!this.queue.size) this.appliedRevision = this.revision;
    for (const group of this.chunks.values()) if (group.userData.fade < 1 || this.lastOpacity !== this.detailOpacity) this.fade(group, Math.min(1, group.userData.fade + dt * 3));
    this.lastOpacity = this.detailOpacity;
    this.retiring = this.retiring.filter(group => {
      this.fade(group, Math.max(0, group.userData.fade - dt * 3));
      if (group.userData.fade > 0) return true;
      this.root.remove(group);
      for (const object of group.children) { object.material?.dispose(); if (object.userData.ownedGeometry) object.geometry.dispose(); if (object.isInstancedMesh) object.dispose(); }
      return false;
    });
  }
  sample(x, z) {
    const tile = this.data.get(`tile:${Math.floor(x / 32)}:${Math.floor(z / 32)}`)?.terrain;
    if (!tile) return null;
    const gx = Math.min(tile.steps - 1e-8, (x - tile.x) / tile.size * tile.steps), gz = Math.min(tile.steps - 1e-8, (z - tile.z) / tile.size * tile.steps);
    const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz, stride = tile.steps + 1;
    const a = tile.heights[iz * stride + ix], b = tile.heights[iz * stride + ix + 1], c = tile.heights[(iz + 1) * stride + ix], d = tile.heights[(iz + 1) * stride + ix + 1];
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }
  travel(position, velocity, dx, dy, dz, dt, flying) {
    const [x, y, z] = position, height = this.sample(x, z);
    if (height === null && y < 80) return { position, velocity: [0, 0, 0] };
    const floor = Math.max(-.5, height ?? 0);
    if (!flying && y <= floor + .001) return { position: this.walk(position, dx, dz, dt), velocity: [0, 0, 0] };
    velocity = accelerate(velocity, [dx, dy, dz], y, dt, flying);
    const [nx, nz] = coordinates(x + velocity[0] * dt, z + velocity[2] * dt);
    const ny = Math.min(FLIGHT.ceiling, y + velocity[1] * dt), heightNext = this.sample(nx, nz) ?? (ny >= 80 ? 0 : null);
    if (heightNext === null) return { position, velocity: [0, 0, 0] };
    const next = Math.max(-.5, heightNext);
    if (next > Math.max(y, floor) + .24 + Math.hypot(coordinates(nx - x, 0)[0], nz - z) * .8) return { position: [x, Math.max(floor, ny), z], velocity: [0, velocity[1], 0] };
    if (ny <= next || ny >= FLIGHT.ceiling) velocity[1] = 0;
    return { position: [nx, Math.max(next, ny), nz], velocity };
  }
  walk(position, dx, dz, dt) {
    const [x, , z] = position, h = this.sample(x, z);
    if (h === null) return position;
    const speed = h < .1 ? 1.35 : 2.8;
    const [nx, nz] = coordinates(x + dx * dt * speed, z + dz * dt * speed);
    const next = this.sample(nx, nz);
    if (next === null) return position;
    const before = Math.max(-.5, h), after = Math.max(-.5, next);
    if (after - before > .24 + Math.hypot(coordinates(nx - x, 0)[0], nz - z) * .8) return [x, before, z];
    const tile = this.data.get(`tile:${Math.floor(nx / 32)}:${Math.floor(nz / 32)}`);
    for (const prop of tile.props) {
      const radius = ({ palm: .35, broadleaf: .45, rock: .7, cliff: 1.4 }[prop.kind] || 0) * prop.scale;
      if (radius && Math.hypot(nx - prop.position[0], nz - prop.position[2]) < radius + .23) return [x, before, z];
    }
    return [nx, after, nz];
  }
}
