import * as THREE from '/vendor/three.module.js';

export const clock = { value: 0 };
const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
const shadowContext = shadowCanvas.getContext('2d');
const shadowGradient = shadowContext.createRadialGradient(32, 32, 3, 32, 32, 32);
shadowGradient.addColorStop(0, 'rgba(8,24,16,0.38)'); shadowGradient.addColorStop(1, 'rgba(8,24,16,0)');
shadowContext.fillStyle = shadowGradient; shadowContext.fillRect(0, 0, 64, 64);
export const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
export const shadowGeometry = new THREE.PlaneGeometry(1, 1);
shadowGeometry.rotateX(-Math.PI / 2);
const color = new THREE.Color();
export function mergeParts(parts) {
  const positions = [], normals = [], colors = [];
  for (const { geometry, matrix, shade } of parts) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    color.set(shade);
    for (let i = 0; i < p.length; i++) { positions.push(p[i]); normals.push(n[i]); colors.push([color.r, color.g, color.b][i % 3]); }
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeBoundingSphere();
  return g;
}
const transform = new THREE.Object3D();
export function part(geometry, shade, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
  transform.position.set(...position); transform.scale.set(...scale); transform.rotation.set(...rotation); transform.updateMatrix();
  return { geometry, shade, matrix: transform.matrix.clone() };
}
function leaf(length = 3, width = 0.45, droop = 1, segments = 12) {
  const positions = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, span = Math.sin(Math.PI * t) ** 0.65 * width;
    const y = Math.sin(t * Math.PI * 0.9) * 0.5 - t * t * droop;
    positions.push(-span, y - span * 0.22, -t * length, 0, y + 0.035, -t * length, span, y - span * 0.22, -t * length);
    if (i < segments) for (let j = 0; j < 2; j++) { const a = i * 3 + j; indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals();
  return g;
}
const cylinder = new THREE.CylinderGeometry(0.13, 0.21, 1, 9);
const sphere = new THREE.SphereGeometry(1, 10, 7);
export function floraGeometry(kind) {
  const parts = [];
  if (kind === 'palm' || kind === 'broadleaf') {
    const palm = kind === 'palm', height = palm ? 6.5 : 4.2;
    for (let i = 0; i < 7; i++) {
      const t = i / 7;
      parts.push(part(cylinder, i % 2 ? '#846847' : '#967553', [Math.sin(t * 1.4) * 0.65, t * height + height / 14, 0], [1 - t * 0.2, height / 7 + 0.035, 1 - t * 0.2], [0, 0, -0.1]));
    }
    const blade = leaf(palm ? 3.9 : 2.8, palm ? 0.32 : 0.78, palm ? 1.6 : 0.6);
    for (let i = 0; i < (palm ? 12 : 13); i++) {
      parts.push(part(blade, ['#397644', '#52984a', '#6ca451'][i % 3], [0.65, height - (i % 2) * 0.45, 0], [1, 1, 1], [(i % 3 - 1) * 0.17, i * 2.399, 0]));
    }
    if (palm) for (let i = 0; i < 3; i++) parts.push(part(sphere, '#655536', [0.65 + Math.cos(i * 2) * 0.2, height - 0.2, Math.sin(i * 2) * 0.2], [0.18, 0.23, 0.18]));
    else for (let i = 0; i < 3; i++) parts.push(part(cylinder, '#55704b', [Math.cos(i * 2) * 0.3, 0.4, Math.sin(i * 2) * 0.3], [0.5, 1, 0.5], [0.35, i * 2, 0.3]));
    blade.dispose();
  } else if (kind === 'fern') {
    const blade = leaf(1.05, 0.16, 0.2, 4);
    for (let i = 0; i < 9; i++) {
      parts.push(part(blade, i % 2 ? '#67994d' : '#367848', [0, 0.42, 0], [1, 1, 1], [-0.15, i * 2.399, 0]));
      for (let j = 1; j < 3; j++) for (const side of [-1, 1]) {
        const a = i * 2.399, d = j * 0.18;
        parts.push(part(blade, '#609344', [-Math.sin(a) * d, 0.4, -Math.cos(a) * d], [0.55, 0.5, 0.34], [0, a + side * 0.8, 0]));
      }
    }
    blade.dispose();
  } else {
    const rock = new THREE.IcosahedronGeometry(1, 1);
    const p = rock.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const warp = 1 + Math.sin(x * 7 + z * 4) * 0.13;
      p.setXYZ(i, x * warp, y * (1 + Math.cos(z * 8) * 0.1), z * warp);
    }
    rock.computeVertexNormals();
    if (kind === 'cliff') {
      for (let i = 0; i < 4; i++) parts.push(part(rock, ['#65796c', '#789078', '#4d6c60', '#6b805d'][i], [Math.sin(i) * 0.3, 1.2 + i * 1.65, 0], [1.6 - i * 0.13, 2.1, 1.8], [0, i * 0.7, 0.05]));
      const blade = leaf(1.6, 0.3, 1.2);
      for (let i = 0; i < 5; i++) parts.push(part(blade, '#4b854c', [Math.sin(i * 2) * 1.2, 6.5, Math.cos(i * 2)], [1, 1, 1], [0, i, 0]));
      blade.dispose();
    } else parts.push(part(rock, '#74867a', [0, 0.5, 0], [1.1, 0.85, 0.9], [0.1, 0.3, 0.2]));
    const merged = mergeParts(parts); rock.dispose(); return merged;
  }
  return mergeParts(parts);
}

export function foliageMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
  material.forceSinglePass = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.uTime = clock;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float sway = sin(uTime * 0.8 + position.y * 0.45);
      transformed.x += sway * max(0.0, position.y - 1.0) * 0.018;
      transformed.z += cos(uTime * 0.55 + position.y) * max(0.0, position.y - 2.0) * 0.012;`);
  };
  return material;
}

export function waterMaterial() {
  return new THREE.ShaderMaterial({ uniforms: { uTime: clock, uOpacity: { value: 1 } },
    vertexShader: `attribute float depth; varying vec3 vWorld; varying float vDepth; uniform float uTime;
    void main(){ vec3 p=position; p.y += sin(p.x*.65+uTime)*.035+cos(p.z*.9-uTime*1.2)*.025;
      vec4 world=modelMatrix*vec4(p,1.); vWorld=world.xyz; vDepth=depth;
      gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform float uTime; uniform float uOpacity; varying vec3 vWorld; varying float vDepth;
    void main(){float ripple=sin(vWorld.x*2.+uTime*1.3+sin(vWorld.z*1.6))*sin(vWorld.z*2.4-uTime);
      float depth=clamp(vDepth/5.,0.,1.); vec3 c=mix(vec3(.18,.64,.55),vec3(.018,.27,.34),depth);
      float fresnel=pow(1.-max(0.,normalize(cameraPosition-vWorld).y),4.);
      c=mix(c,vec3(.65,.83,.8),fresnel*.6); c+=pow(max(0.,ripple),18.)*.28;
      float foam=(1.-smoothstep(.05,.5,vDepth))*(.4+.2*sin(vWorld.x*3.+vWorld.z*2.+uTime*2.));
      c=mix(c,vec3(.83,.91,.79),foam);
      c=mix(c,vec3(.61,.79,.73),smoothstep(35.,100.,length(cameraPosition-vWorld)));
      gl_FragColor=vec4(c,uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`, transparent: true, depthWrite: false });
}
export function waterfallMaterial() {
  return new THREE.ShaderMaterial({ uniforms: { uTime: clock, uOpacity: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; uniform float uTime; void main(){vUv=uv;vec3 p=position;p.z+=sin(uv.y*16.+uTime*4.)*.07;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uTime;uniform float uOpacity;
    void main(){float flow=sin(vUv.x*90.+sin(vUv.y*22.+uTime*7.))*0.5+0.5;
      float streak=sin(vUv.y*65.+uTime*18.+vUv.x*9.)*.5+.5;
      float edge=smoothstep(0.,.09,vUv.x)*smoothstep(0.,.09,1.-vUv.x);
      vec3 c=mix(vec3(.24,.65,.66),vec3(.92,.98,.9),flow*.65+streak*.22);
      gl_FragColor=vec4(c,edge*(.6+flow*.3)*uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` });
}
export function addSky(parent) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(210, 32, 20), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    uniforms: { uTime: clock, uSpace: { value: 0 } },
    vertexShader: `varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vPos;uniform float uTime;uniform float uSpace;
    void main(){vec3 d=normalize(vPos);float h=max(0.,d.y);vec3 c=mix(vec3(.70,.83,.76),vec3(.18,.51,.66),pow(h,.55));
      float sun=pow(max(0.,dot(d,normalize(vec3(-.45,.52,-.7)))),200.);c+=vec3(1.,.8,.4)*sun*.7;
      float cloud=sin(d.x*12.+d.z*4.+uTime*.008)*sin(d.z*16.-d.x*3.);cloud=smoothstep(.2,.8,cloud)*(1.-smoothstep(.2,.65,h))*smoothstep(0.,.12,h);
      c=mix(c,vec3(.89,.91,.8),cloud*.65);
      vec3 cell=floor(d*650.);float star=step(.9987,fract(sin(dot(cell,vec3(17.13,93.7,41.9)))*43758.5453));
      vec3 night=vec3(.008,.016,.043)+star*vec3(.7,.8,1.);c=mix(c,night,uSpace);gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
    }` }));
  parent.add(sky); return sky;
}
