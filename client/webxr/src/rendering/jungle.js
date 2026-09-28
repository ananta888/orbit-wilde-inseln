import * as THREE from '/vendor/three.module.js';
import { NOISE } from './materials.js';

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
const sphere = new THREE.SphereGeometry(1, 16, 10);
function palmFrond() {
  const pieces = [], stem = leaf(3.9, .035, 1.6, 10), leaflet = leaf(1, .065, .12, 2);
  pieces.push(part(stem, '#9aae67'));
  for (let j = 1; j <= 13; j++) for (const side of [-1, 1]) {
    const t = j / 15, length = .28 + Math.sin(t * Math.PI) * .63;
    const y = Math.sin(t * Math.PI * .9) * .5 - t * t * 1.6;
    pieces.push(part(leaflet, j % 3 ? '#569750' : '#75aa56', [side * .016, y, -t * 3.9], [1, 1, length], [.12, side * 1.1, side * .12]));
  }
  const result = mergeParts(pieces); stem.dispose(); leaflet.dispose(); return result;
}
export function floraGeometry(kind, detailed = true) {
  const parts = [];
  if (kind === 'palm' || kind === 'broadleaf') {
    const palm = kind === 'palm', height = palm ? 6.5 : 4.2;
    for (let i = 0; i < 7; i++) {
      const t = i / 7;
      parts.push(part(cylinder, i % 2 ? '#846847' : '#967553', [Math.sin(t * 1.4) * 0.65, t * height + height / 14, 0], [1 - t * 0.2, height / 7 + 0.035, 1 - t * 0.2], [0, 0, -0.1]));
    }
    const blade = palm ? (detailed ? palmFrond() : leaf(3.9, .52, 1.6, 5)) : leaf(2.8, .78, .6, detailed ? 12 : 4);
    for (let i = 0; i < (palm ? 10 : 11); i++) {
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
    const rock = new THREE.IcosahedronGeometry(1, detailed ? 2 : 0);
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
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.79, side: THREE.DoubleSide });
  material.forceSinglePass = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.uTime = clock;
    shader.vertexShader = 'uniform float uTime; varying vec3 vLeaf;\n' + shader.vertexShader;
    shader.fragmentShader = 'varying vec3 vLeaf;\n' + NOISE + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float veins=.97+.03*sin(vLeaf.z*52.+vLeaf.x*29.);
      diffuseColor.rgb*=veins*(.9+.2*orbitNoise(vLeaf*7.));`);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vLeaf=position;
      float sway = sin(uTime * 0.8 + position.y * 0.45);
      transformed.x += sway * max(0.0, position.y - 1.0) * 0.018;
      transformed.z += cos(uTime * 0.55 + position.y) * max(0.0, position.y - 2.0) * 0.012;`);
  };
  return material;
}

export function waterMaterial() {
  return new THREE.ShaderMaterial({ uniforms: { uTime: clock, uOpacity: { value: 1 } },
    vertexShader: `attribute float depth; varying vec3 vWorld; varying float vDepth; uniform float uTime;
    void main(){vec3 p=position;float shore=smoothstep(0.,1.,depth);p.y+=(sin(p.x*.62+uTime)*.045+cos(p.z*.83-uTime*1.2)*.03)*shore;
      vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;vDepth=depth;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: NOISE + `uniform float uTime;uniform float uOpacity;varying vec3 vWorld;varying float vDepth;
    void main(){
      if(vDepth<.012)discard;
      vec2 p=vWorld.xz;
      float swell=sin(p.x*.62+uTime),crossWave=sin(p.y*.83-uTime*1.2);
      float detail=orbitFbm(vec3(p*1.8,uTime*.32));
      vec3 n=normalize(vec3(-cos(p.x*.62+uTime)*.045+sin(p.y*5.+uTime)*.027,1.,crossWave*.04+cos(p.x*6.-uTime)*.032));
      vec3 view=normalize(cameraPosition-vWorld), reflected=reflect(-view,n), light=normalize(vec3(-22.,38.,-28.));
      float fresnel=.035+.965*pow(1.-max(0.,dot(view,n)),5.);
      vec3 water=mix(vec3(.055,.48,.39),vec3(.008,.10,.145),smoothstep(0.,9.,vDepth));
      vec3 sky=mix(vec3(.67,.80,.78),vec3(.16,.36,.56),max(0.,reflected.y));
      float spec=pow(max(0.,dot(n,normalize(light+view))),180.);
      float caustic=pow(max(0.,sin(p.x*3.+detail*8.)*sin(p.y*3.7-detail*6.+uTime)),7.)*exp(-vDepth*.8);
      float foam=(1.-smoothstep(.02,.75,vDepth))*(.25+smoothstep(.45,.75,detail)*.65);
      vec3 color=mix(water,sky,fresnel*.85)+vec3(1.,.82,.57)*spec*2.5+caustic*vec3(.12,.27,.18);
      color=mix(color,vec3(.82,.92,.86),foam);color=mix(color,vec3(.55,.72,.70),smoothstep(45.,160.,length(cameraPosition-vWorld))*.7);
      gl_FragColor=vec4(color,uOpacity);
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
    fragmentShader: NOISE + `varying vec3 vPos;uniform float uTime;uniform float uSpace;
    void main(){vec3 d=normalize(vPos);float h=max(0.,d.y);vec3 c=mix(vec3(.70,.83,.76),vec3(.18,.51,.66),pow(h,.55));
      float sun=pow(max(0.,dot(d,normalize(vec3(-.45,.52,-.7)))),200.);c+=vec3(1.,.8,.4)*sun*.7;
      float cloud=orbitFbm(vec3(d.xz/max(.12,h)*1.8+vec2(uTime*.008,0.),.5));cloud=smoothstep(.47,.74,cloud)*(1.-smoothstep(.4,.85,h))*smoothstep(0.,.12,h);
      c=mix(c,vec3(.89,.91,.8),cloud*.65);
      vec3 cell=floor(d*650.);float star=step(.9987,fract(sin(dot(cell,vec3(17.13,93.7,41.9)))*43758.5453));
      vec3 night=vec3(.008,.016,.043)+star*vec3(.7,.8,1.);c=mix(c,night,uSpace);gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
    }` }));
  parent.add(sky); return sky;
}
