// Trusted local worker. Input never selects executable files, modules or destinations.
import { MeshoptSimplifier } from 'meshoptimizer';

let raw = '', bytes = 0;
for await (const chunk of process.stdin) {
  bytes += chunk.length;
  if (bytes > 28 * 1024 * 1024) throw Error('Geometry input budget');
  raw += chunk;
}
const { document: doc, ratio, error: tolerance } = JSON.parse(raw);
await MeshoptSimplifier.ready;
const report = [];
for (const region of doc.regions) {
  const count = region.positions.length / 3, old = region.indices.length / 3;
  if (region.locked || region.mask.some(x => x > 0)) {
    report.push({ region: region.id, before: old, after: old, preserved: 'protected' }); continue;
  }
  const skin = doc.rig.weights[region.id], jointIds = skin ? [...new Set(skin.joints)].sort((a, b) => a-b) : [];
  if (jointIds.length > 20) { report.push({ region: region.id, before: old, after: old, preserved: 'skin-budget' }); continue; }
  const stride = 10 + jointIds.length, attributes = new Float32Array(count * stride), locks = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    attributes.set(region.normals.slice(i*3, i*3+3), i*stride);
    attributes.set(region.colors.slice(i*3, i*3+3), i*stride+3);
    attributes.set(region.surface.slice(i*4, i*4+4), i*stride+6);
    if (skin) for (let j = 0; j < 4; j++) attributes[i*stride+10+jointIds.indexOf(skin.joints[i*4+j])] += skin.weights[i*4+j];
    for (const seat of doc.mount_points) {
      if (Math.hypot(...seat.position.map((v, k) => v - region.positions[i*3+k])) < seat.safe_radius * 2) locks[i] = 1;
    }
  }
  const [indices, error] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(region.indices),
    new Float32Array(region.positions), 3, attributes, stride, new Array(stride).fill(1), locks,
    Math.max(3, Math.floor(region.indices.length * ratio / 3) * 3), tolerance, ['LockBorder', 'ErrorAbsolute', 'Regularize']);
  if (indices.length >= region.indices.length) { report.push({ region: region.id, before: old, after: old, error }); continue; }
  // Index-only simplification preserves every surviving vertex attribute and skin weight exactly.
  const used = [...new Set(indices)].sort((a, b) => a-b), remap = new Map(used.map((v, i) => [v, i]));
  for (const [field, width] of Object.entries({ positions:3, normals:3, colors:3, surface:4, mask:1 }))
    region[field] = used.flatMap(i => region[field].slice(i*width, (i+1)*width));
  if (skin) for (const field of ['joints', 'weights']) skin[field] = used.flatMap(i => skin[field].slice(i*4, i*4+4));
  region.indices = Array.from(indices, i => remap.get(i)); region.topology_revision++;
  report.push({ region: region.id, before: old, after: indices.length / 3, error });
}
process.stdout.write(JSON.stringify({ document: doc, report }));
