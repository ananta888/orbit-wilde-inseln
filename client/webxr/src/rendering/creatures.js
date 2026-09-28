import * as THREE from '/vendor/three.module.js';
import { mergeParts, part, shadowGeometry, shadowTexture } from '/src/rendering/jungle.js';

const sphere = new THREE.SphereGeometry(1, 24, 16), lowSphere = new THREE.SphereGeometry(1, 10, 7);
const cylinder = new THREE.CylinderGeometry(0.07, 0.055, 1, 12);
const cone = new THREE.ConeGeometry(1, 1, 8);
import { LimbBatch, solveTwoBone, gaitSample } from './kinematics.js';
import { surfaceMaterial } from './materials.js';
const dark = '#242c24';
const material = surfaceMaterial('fur', { vertexColors: true, roughness: .87 });
const limbMaterial = surfaceMaterial('fur', { roughness: .89 });
const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
const templates = new Map();
function branch(a, b, shade, thickness = 0.035) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.sub(from);
  const object = new THREE.Object3D(); object.position.copy(from).addScaledVector(delta, 0.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
  object.scale.set(thickness / 0.07, delta.length(), thickness / 0.07); object.updateMatrix();
  return { geometry: cylinder, shade, matrix: object.matrix.clone() };
}
function template(species) {
  if (templates.has(species)) return templates.get(species);
  const p = [], legs = [];
  const ellipsoid = (shade, position, scale, rotation) => p.push(part(sphere, shade, position, scale, rotation));
  let center;
  if (species === 'deer') {
    center = 0.85;
    ellipsoid('#aa7546', [0, .89, 0], [.28, .35, .59]);
    ellipsoid('#d9be88', [0, .69, .10], [.23, .19, .42]);
    ellipsoid('#9b6841', [0, 1.18, .43], [.19, .4, .2], [.35, 0, 0]);
    ellipsoid('#b7804b', [0, 1.53, .61], [.2, .2, .3]);
    ellipsoid('#5b4633', [0, 1.45, .84], [.12, .11, .15]);
    ellipsoid(dark, [0, 1.45, .96], [.095, .065, .04]);
    for (const side of [-1, 1]) {
      ellipsoid('#b88a5a', [side * .23, 1.73, .55], [.10, .23, .055], [0, 0, -side * .6]);
      ellipsoid('#e6c89c', [side * .23, 1.74, .59], [.057, .16, .014], [0, 0, -side * .6]);
      ellipsoid(dark, [side * .17, 1.56, .72], [.045, .05, .037]);
      p.push(branch([side * .10, 1.69, .55], [side * .21, 2.19, .38], '#dcc7a0'));
      p.push(branch([side * .17, 1.92, .46], [side * .44, 2.15, .42], '#dcc7a0', .026));
      p.push(branch([side * .21, 2.04, .42], [side * .11, 2.28, .54], '#dcc7a0', .021));
    }
    ellipsoid('#ede0bc', [0, 1.00, -.59], [.10, .10, .2], [-.6, 0, 0]);
    for (const x of [-.18, .18]) for (const z of [-.37, .36]) legs.push({ x, z, height: .77, shade: '#98623f' });
  } else if (species === 'boar') {
    center = .56;
    ellipsoid('#584735', [0, .63, 0], [.38, .42, .61]);
    ellipsoid('#786044', [0, .61, .58], [.29, .27, .37]);
    ellipsoid('#926d4e', [0, .47, .87], [.19, .14, .2]);
    ellipsoid('#423d32', [0, .47, 1.02], [.17, .105, .04]);
    for (const side of [-1, 1]) {
      ellipsoid(dark, [side * .07, .49, 1.052], [.033, .025, .008]);
      ellipsoid(dark, [side * .245, .72, .66], [.034, .034, .036]);
      p.push(part(cone, '#d9caa2', [side * .21, .47, .82], [.06, .24, .065], [0, 0, -side * .45]));
      p.push(part(cone, '#544834', [side * .24, .94, .42], [.15, .31, .12], [.2, 0, side * .3]));
    }
    for (let i = 0; i < 8; i++) p.push(part(cone, '#302e26', [0, 1.04, -.42 + i * .11], [.09, .17, .10], [-.3, 0, 0]));
    p.push(branch([0, .77, -.56], [.12, .92, -.82], '#554a35', .025));
    for (const x of [-.25, .25]) for (const z of [-.35, .34]) legs.push({ x, z, height: .47, shade: '#443c2d' });
  } else {
    center = 1.0;
    ellipsoid('#567f79', [0, 1.12, 0], [.3, .52, .2]);
    ellipsoid('#88bcb0', [0, 1.41, .10], [.2, .3, .14]);
    ellipsoid('#71a995', [0, 1.88, .01], [.32, .39, .27]);
    for (const side of [-1, 1]) {
      ellipsoid('#162e32', [side * .135, 1.92, .245], [.10, .15, .034], [0, 0, -side * .25]);
      ellipsoid('#bcebb2', [side * .145, 1.96, .272], [.027, .049, .015]);
      p.push(branch([side * .15, 2.17, 0], [side * .27, 2.53, -.11], '#567f79', .025));
      ellipsoid('#d7f4b1', [side * .27, 2.53, -.11], [.052, .075, .052]);
      p.push(branch([side * .25, 1.46, 0], [side * .44, .89, .09], '#5f9c8a', .065));
      ellipsoid('#86b8a0', [side * .45, .84, .13], [.075, .14, .08]);
      legs.push({ x: side * .14, z: 0, height: .85, shade: '#527f78' });
    }
    for (let i = 0; i < 4; i++) ellipsoid('#b3d6a0', [0, 1.32 - i * .12, .197], [.13 - i * .015, .025, .021]);
  }
  const pivot = species === 'deer' ? new THREE.Vector3(0, .94, .28) : species === 'boar' ? new THREE.Vector3(0, .68, .38) : new THREE.Vector3(0, 1.52, 0);
  const isHead = item => species === 'deer' ? item.matrix.elements[13] > 1.1 : species === 'boar' ? item.matrix.elements[14] > .4 : item.matrix.elements[13] > 1.6;
  const headParts = p.filter(isHead).map(item => ({ ...item, matrix: new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z).multiply(item.matrix) }));
  const bodyParts = p.filter(item => !isHead(item));
  const low = parts => mergeParts(parts.map(item => ({ ...item, geometry: item.geometry === sphere ? lowSphere : item.geometry })));
  const result = { torso: mergeParts(bodyParts), head: mergeParts(headParts), lowTorso: low(bodyParts), lowHead: low(headParts), pivot, legs, center };
  templates.set(species, result); return result;
}
export function makeCreature(species) {
  const data = template(species), group = new THREE.Group(), visual = new THREE.Group();
  visual.position.y = -data.center; group.add(visual);
  const body = new THREE.Mesh(data.torso, material), head = new THREE.Mesh(data.head, material);
  head.position.copy(data.pivot); visual.add(body, head);
  body.castShadow = body.receiveShadow = head.castShadow = head.receiveShadow = true;
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial); shadow.position.y = .028; shadow.scale.set(1.8, 1, 2.3); visual.add(shadow);
  const batch = new LimbBatch(visual, limbMaterial);
  const legs = data.legs.map((leg, i) => ({ ...leg, phase: species === 'alien' ? i * .5 : [0, .5, .75, .25][i], joints: [] }));
  return { group, visual, body, head, legs, batch, data, phase: 0, species, active: true, center: data.center, highDetail: true };
}
export function animateCreature(creature, state, time, dt = 1 / 60, environment = null, viewer = null, detailDistance = 19) {
  const walking = state.speed > .05 && state.mood !== 'grazing';
  const fast = state.mood === 'alert' || state.speed > 1.8, biped = creature.species === 'alien', boar = creature.species === 'boar';
  const stride = (boar ? .42 : biped ? .52 : .64) * (fast ? 1.35 : 1), duty = fast ? .52 : .68;
  if (walking) creature.phase += Math.max(0, state.speed) * dt * duty / stride;
  creature.walkBlend = THREE.MathUtils.damp(creature.walkBlend || 0, walking ? 1 : 0, 12, dt);
  const detailed = !viewer || creature.group.getWorldPosition(new THREE.Vector3()).distanceTo(viewer) < detailDistance;
  if (detailed !== creature.highDetail) {
    creature.body.geometry = detailed ? creature.data.torso : creature.data.lowTorso;
    creature.head.geometry = detailed ? creature.data.head : creature.data.lowHead; creature.highDetail = detailed;
  }
  creature.visual.position.y = -creature.center + (walking ? Math.sin(creature.phase * Math.PI * 4) * (fast ? .03 : .012) : Math.sin(time * 1.8) * .004);
  creature.head.rotation.x = THREE.MathUtils.damp(creature.head.rotation.x, state.mood === 'grazing' && !biped ? (boar ? .32 : .95) : 0, 3, dt);
  creature.head.rotation.y = Math.sin(time * .65 + creature.phase) * (state.mood === 'alert' ? .16 : .06);
  creature.batch.begin();
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), creature.group.rotation.y);
  for (const [index, leg] of creature.legs.entries()) {
    const sample = gaitSample(creature.phase + (fast && !biped ? [0, .5, .5, 0][index] : leg.phase), stride * creature.walkBlend, (fast ? .21 : .10) * creature.walkBlend, duty);
    const hip = new THREE.Vector3(leg.x, leg.height, leg.z);
    const foot = new THREE.Vector3(leg.x, .045, leg.z + sample.forward);
    const world = foot.clone().applyQuaternion(rotation).add(creature.group.position);
    const ground = environment && !environment.mixed ? environment.sample(world.x, world.z) : 0;
    foot.y = (ground ?? creature.group.position.y - creature.center) - creature.group.position.y + creature.center + .045 + sample.lift;
    const hockHeight = boar ? .065 : biped ? .04 : .13, back = leg.z < 0 && !biped;
    const hock = foot.clone().add(new THREE.Vector3(0, hockHeight, back ? -.07 : -.025));
    const length = boar ? .245 : biped ? .44 : .36;
    const pole = new THREE.Vector3(0, .08, biped || back ? 1 : -1);
    const result = solveTwoBone(hip, hock, pole, length, length);
    leg.joints = [hip, result.joint, result.target, foot]; leg.contact = sample.contact;
    const radius = boar ? .074 : biped ? .073 : .049;
    creature.batch.segment(hip, result.joint, radius, leg.shade, back ? 1.3 : 1);
    creature.batch.segment(result.joint, result.target, radius * .63, leg.shade);
    creature.batch.sphere(result.joint, [radius * .76, radius * .9, radius * .76], leg.shade);
    creature.batch.segment(result.target, foot, radius * .44, leg.shade);
    if (biped) creature.batch.sphere(foot.clone().add(new THREE.Vector3(0, 0, .055)), [.075, .052, .16], '#354e47');
    else for (const side of [-1, 1]) creature.batch.sphere(foot.clone().add(new THREE.Vector3(side * .019, -.014, .015)), [boar ? .025 : .019, .042, .071], '#2c2a23');
  }
  creature.batch.finish();
}
