import * as THREE from '/vendor/three.module.js';
import { makeCreature } from '/src/rendering/creatures.js';

const material = color => new THREE.MeshStandardMaterial({ color, roughness: .85 });
function add(group, geometry, color, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material(color)); mesh.position.set(...position); group.add(mesh); return mesh;
}
function makeObject(item) {
  const group = new THREE.Group();
  if (item.kind === 'target' || item.kind === 'moving_target') {
    const radius = item.radius || .4;
    const target = add(group, new THREE.CylinderGeometry(radius, radius, .1, 24), '#b79059'); target.rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const ring = add(group, new THREE.TorusGeometry(radius * (1 - i * .29), .015, 6, 24), i === 2 ? '#dc9260' : '#eee2b6', [0, 0, .065]);
      ring.userData.decorative = true;
    }
  } else if (item.kind === 'oracle') {
    const points = Array.from({ length: 60 }, (_, i) => {
      const t = i / 59, angle = t * Math.PI * 4;
      return new THREE.Vector3(Math.cos(angle) * .25 * (1 - t * .5), .1 + t * .8, Math.sin(angle) * .25 * (1 - t * .5));
    });
    add(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, .075, 8, false), '#428f83');
    add(group, new THREE.SphereGeometry(.12, 12, 8), '#64b3a0', [.125, .9, 0]);
    for (const x of [.07, .17]) add(group, new THREE.SphereGeometry(.022, 8, 6), '#ffe5a0', [x, .94, .095]);
  } else if (item.kind === 'boar') {
    const creature = makeCreature('boar'); creature.group.position.y = .56; group.add(creature.group);
  } else if (item.kind === 'wind_marker') {
    add(group, new THREE.CylinderGeometry(.035, .05, 1.5, 8), '#d9c6a0', [0, .75, 0]);
    const flag = add(group, new THREE.BoxGeometry(.65, .28, .03), '#efa566', [.3, 1.35, 0]); group.userData.flag = flag;
  } else if (item.kind === 'plank' || item.kind === 'bridge') {
    add(group, new THREE.BoxGeometry(item.kind === 'bridge' ? 1.8 : .28, .12, 1.8), '#ba9467', [0, .12, 0]);
    if (item.kind === 'bridge') {
      const gap = add(group, new THREE.BoxGeometry(1.9, .13, .7), '#294e51', [0, .14, 0]); group.userData.gap = gap;
    }
  } else if (item.kind === 'bait') {
    for (let i = 0; i < 4; i++) add(group, new THREE.SphereGeometry(.09, 10, 8), '#db9952', [(i % 2) * .13, .12, Math.floor(i / 2) * .13]);
  } else {
    add(group, new THREE.BoxGeometry(item.kind === 'route' ? 1 : .8, item.kind === 'route' ? .08 : .7, .6), '#a6b7a8', [0, item.kind === 'route' ? .04 : .35, 0]);
  }
  group.traverse(mesh => { if (mesh.isMesh) mesh.userData.missionTarget = item.id; });
  return group;
}
function dispose(group) {
  group.traverse(object => { object.geometry?.dispose(); if (object.material) object.material.dispose(); });
}

export class MissionObjects {
  constructor(parent) { this.parent = parent; this.objects = new Map(); this.package = ''; }
  receive(packet) {
    const key = `${packet.active?.id || ''}@${packet.active?.version || ''}/${packet.settings.fitness}/${packet.settings.difficulty}`;
    if (this.package !== key) {
      for (const group of this.objects.values()) { this.parent.remove(group); dispose(group); }
      this.objects.clear(); this.package = key;
    }
    for (const item of packet.objects) {
      if (!this.objects.has(item.id)) { const group = makeObject(item); this.objects.set(item.id, group); this.parent.add(group); }
      const group = this.objects.get(item.id); group.position.set(...item.position); group.visible = item.visible;
      if (group.userData.flag) group.rotation.y = Math.atan2(packet.wind[2], packet.wind[0]);
      if (group.userData.gap) group.userData.gap.visible = !item.resolved?.includes('use');
    }
  }
}
