import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

function materialFor(region) {
  const data = region.material;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: data.roughness,
    metalness: data.metallic, emissive: new THREE.Color(...data.emissive), transparent: data.opacity < 1 || region.surface.some((v, i) => i % 4 === 3 && v < 1),
    opacity: data.opacity, side: region.solid ? THREE.FrontSide : THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.detailScale = { value: data.detail_scale };
    shader.uniforms.detailKind = { value: ['none', 'skin', 'scales', 'fur', 'feather', 'horn', 'bone', 'metal', 'stone', 'crystal', 'slime'].indexOf(data.detail) };
    shader.vertexShader = 'attribute float editMask; attribute vec4 surface; varying float vEditMask; varying vec4 vSurface; varying vec3 vDetailPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvEditMask=editMask; vSurface=surface; vDetailPosition=position;');
    shader.fragmentShader = 'varying float vEditMask; varying vec4 vSurface; varying vec3 vDetailPosition; uniform float detailScale; uniform int detailKind;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' +
      'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.25,0.08,0.55),vEditMask*0.6);' +
      'float pattern=1.0; vec3 p=vDetailPosition*detailScale;' +
      'if(detailKind==2){vec2 q=fract(p.xz+vec2(0.5*mod(floor(p.z),2.0),0.0))-0.5; pattern=0.72+0.28*(1.0-smoothstep(0.12,0.48,length(q)));}' +
      'else if(detailKind>0){pattern=0.86+0.14*sin(p.x*2.1+sin(p.z*1.7))*sin(p.y*2.3);}' +
      'diffuseColor.rgb*=pattern; diffuseColor.a=vSurface.w;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(vSurface.x,0.03,1.0);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=vSurface.y;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*vSurface.z;');
  };
  material.customProgramCacheKey = () => 'orbit-creature-pbr-v1';
  return material;
}

export class CreatureView {
  constructor(parent, { sharedGeometry = null } = {}) {
    this.root = new THREE.Group(); parent.add(this.root); this.meshes = new Map(); this.bones = new Map();
    this.sharedGeometry = sharedGeometry;
  }
  update(doc) {
    if (this.sharedGeometry) throw Error('Veröffentlichte Geometrie ist unveränderlich');
    const old = this.document;
    if (!old || old.id !== doc.id || old.regions.size !== doc.regions.size ||
        JSON.stringify(old.rig) !== JSON.stringify(doc.rig) ||
        [...doc.regions].some(([id, r]) => !old.regions.has(id) || old.regions.get(id).topology_revision !== r.topology_revision ||
          old.regions.get(id).positions.length !== r.positions.length)) { this.load(doc); return; }
    const attributes = { positions: 'position', normals: 'normal', colors: 'color', mask: 'editMask', surface: 'surface' };
    for (const [id, region] of doc.regions) {
      const mesh = this.meshes.get(id), previous = old.regions.get(id);
      for (const [key, name] of Object.entries(attributes)) {
        if (previous[key] !== region[key]) {
          mesh.geometry.attributes[name].array.set(region[key]); mesh.geometry.attributes[name].needsUpdate = true;
        }
      }
      if (previous.positions !== region.positions) {
        mesh.geometry.boundsTree?.refit(); mesh.geometry.computeBoundingSphere(); mesh.geometry.computeBoundingBox();
      }
      const transparent = region.material.opacity < 1 || region.surface.some((v, i) => i % 4 === 3 && v < 1);
      if (transparent !== mesh.material.transparent) {
        mesh.material.transparent = transparent; mesh.material.needsUpdate = true;
      }
      if (JSON.stringify(previous.material) !== JSON.stringify(region.material)) {
        mesh.material.dispose(); mesh.material = materialFor(region);
      }
    }
    this.document = doc;
  }
  clear() {
    for (const mesh of this.meshes.values()) { if (!this.sharedGeometry) mesh.geometry.dispose(); mesh.material.dispose(); }
    this.root.clear(); this.meshes.clear(); this.bones.clear(); this.skeleton?.dispose(); this.skeleton = null;
  }
  load(doc) {
    this.clear(); this.document = doc;
    const rig = doc.rig;
    if (rig?.bones.length) {
      for (const item of rig.bones) {
        const bone = new THREE.Bone(); bone.name = item.id; bone.position.fromArray(item.position);
        this.bones.set(item.id, bone);
        const parent = this.bones.get(item.parent);
        if (parent) parent.add(bone); else this.root.add(bone);
      }
      this.root.updateMatrixWorld(true);
      this.skeleton = new THREE.Skeleton([...this.bones.values()]);
      this.skeleton.calculateInverses();
    }
    for (const [id, item] of doc.regions) {
      const weights = rig?.weights[id];
      let geometry = this.sharedGeometry?.get(id);
      if (!geometry) {
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(item.positions.slice(), 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(item.normals.slice(), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(item.colors.slice(), 3));
        geometry.setAttribute('editMask', new THREE.BufferAttribute(item.mask.slice(), 1));
        geometry.setAttribute('surface', new THREE.BufferAttribute(item.surface.slice(), 4));
        geometry.setIndex(new THREE.BufferAttribute(item.indices.slice(), 1));
        geometry.computeBoundingSphere();
        if (this.skeleton && weights) {
          geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(weights.joints, 4));
          geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights.weights, 4));
        } else geometry.boundsTree = new MeshBVH(geometry, { indirect: true });
        this.sharedGeometry?.set(id, geometry);
      }
      let mesh;
      if (this.skeleton && weights) {
        mesh = new THREE.SkinnedMesh(geometry, materialFor(item));
      } else {
        mesh = new THREE.Mesh(geometry, materialFor(item));
        // Preserve canonical triangle ordering; never install global prototype patches.
        mesh.raycast = acceleratedRaycast;
      }
      mesh.name = id; mesh.userData.region = id; this.root.add(mesh); this.meshes.set(id, mesh);
      if (mesh.isSkinnedMesh) { this.root.updateMatrixWorld(true); mesh.bind(this.skeleton, mesh.matrixWorld); }
    }
    this.pose(false, 0);
  }
  pose(living, time, clip = null) {
    if (!this.document) return;
    for (const b of this.document.rig.bones) {
      const bone = this.bones.get(b.id); if (!bone) continue;
      bone.rotation.fromArray([...b.rotation, 'XYZ']);
      if (living) {
        if (b.id.includes('wing')) bone.rotation.z += Math.sin(time * 2) * .16 * (b.id.startsWith('left') ? -1 : 1);
        if (b.id === 'head') bone.rotation.y += Math.sin(time * .7) * .07;
        if (b.id.startsWith('tail')) bone.rotation.y += Math.sin(time * 1.2 + Number(b.id.at(-1) || 0)) * .06;
      }
    }
    for (const mesh of this.meshes.values()) {
      mesh.scale.setScalar(1);
      const bone = this.bones.get(mesh.name);
      if (bone && mesh.name.includes('eye')) bone.scale.y = living && (time % 4) < .15 ? .12 : 1;
    }
    if (clip) {
      const t = clip.loop ? time % clip.duration : Math.min(time, clip.duration);
      for (const [name, bone] of this.bones) {
        const keys = clip.keys.filter(k => k.bone === name).sort((a, b) => a.time - b.time);
        if (!keys.length) continue;
        const next = keys.find(k => k.time >= t) || keys.at(-1), prev = [...keys].reverse().find(k => k.time <= t) || keys[0];
        const blend = next.time === prev.time ? 0 : (t - prev.time) / (next.time - prev.time);
        const a = new THREE.Quaternion().setFromEuler(new THREE.Euler(...prev.rotation));
        const b = new THREE.Quaternion().setFromEuler(new THREE.Euler(...next.rotation));
        bone.quaternion.copy(a.slerp(b, blend));
      }
    }
    for (const source of this.document.rig.bones) if (source.limits) {
      const bone = this.bones.get(source.id);
      for (const [i, axis] of ['x', 'y', 'z'].entries())
        bone.rotation[axis] = THREE.MathUtils.clamp(bone.rotation[axis], source.limits.min[i], source.limits.max[i]);
    }
  }
  restPose() {
    for (const bone of this.bones.values()) { bone.quaternion.identity(); bone.scale.setScalar(1); }
    this.root.updateWorldMatrix(true, true); this.skeleton?.update();
  }
  highlight(selected) {
    for (const [id, mesh] of this.meshes) {
      const source = this.document.regions.get(id).material.emissive;
      mesh.material.emissive.setRGB(...source);
      if (selected.has(id)) mesh.material.emissive.add(new THREE.Color(.035, .07, .1));
    }
  }
  localPreview(operation) {
    if (this.sharedGeometry) throw Error('Veröffentlichte Geometrie ist unveränderlich');
    this.resetPreview();
    if (operation.tool === 'pose') {
      const bone = this.bones.get(operation.bone);
      if (bone) bone.rotation.fromArray([...operation.rotation, 'XYZ']);
      return;
    }
    if (!['push', 'pull', 'inflate', 'deflate', 'grab', 'move'].includes(operation.tool)) return;
    const c = new THREE.Vector3(...operation.samples.at(-1)), radius = operation.radius, strength = operation.strength;
    for (const id of operation.regions) {
      const mesh = this.meshes.get(id), source = this.document.regions.get(id);
      if (!mesh || source.locked) continue;
      const a = mesh.geometry.attributes.position.array, p = new THREE.Vector3();
      for (let i = 0; i < a.length; i += 3) {
        p.fromArray(source.positions, i);
        const w = Math.max(0, 1 - p.distanceToSquared(c) / radius**2)**2 * (1 - source.mask[i / 3]) * strength;
        const delta = ['grab', 'move'].includes(operation.tool) ? operation.delta :
          Array.from(source.normals.slice(i, i + 3), v => v * radius * .35 * (['push', 'deflate'].includes(operation.tool) ? -1 : 1));
        for (let k = 0; k < 3; k++) a[i + k] += (delta?.[k] || 0) * w;
      }
      mesh.geometry.attributes.position.needsUpdate = true;
    }
  }
  resetPreview() {
    if (!this.document) return;
    for (const [id, mesh] of this.meshes) {
      mesh.geometry.attributes.position.array.set(this.document.regions.get(id).positions);
      mesh.geometry.attributes.position.needsUpdate = true;
    }
  }
}
