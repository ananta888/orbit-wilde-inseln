import * as THREE from '/vendor/three.module.js';
import { FLIGHT } from '/src/input/flight.js';

export class Planet {
  constructor(scene) {
    this.root = new THREE.Group(); this.root.visible = false; scene.add(this.root);
    this.version = null; this.mix = 0;
  }
  receive(data) {
    if (!data || this.version === data.version) return;
    for (const child of [...this.root.children]) { child.geometry.dispose(); child.material.dispose(); this.root.remove(child); }
    this.version = data.version; this.data = data;
    const positions = [], colors = [], indices = [], { width, height, heights, radius } = data;
    const deep = new THREE.Color('#164e68'), shallow = new THREE.Color('#46bbaa'), sand = new THREE.Color('#e2cf94');
    const jungle = new THREE.Color(data.palette.ground || '#608b48'), stone = new THREE.Color(data.palette.stone || '#647a70');
    for (let j = 0; j <= height; j++) for (let i = 0; i <= width; i++) {
      const lon = (i / width - .5) * Math.PI * 2, lat = (.5 - j / height) * Math.PI;
      const h = heights[j * (width + 1) + i], r = radius + Math.max(0, h);
      positions.push(r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.cos(lon));
      const shade = h < 0 ? deep.clone().lerp(shallow, Math.max(0, 1 + h / 5)) : sand.clone().lerp(jungle, THREE.MathUtils.smoothstep(h, .3, 2.4));
      if (h > 5) shade.lerp(stone, Math.min(1, (h - 5) / 5));
      colors.push(shade.r, shade.g, shade.b);
      if (i < width && j < height) { const a = j * (width + 1) + i; indices.push(a, a + width + 1, a + 1, a + 1, a + width + 1, a + width + 2); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    this.surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, transparent: true, fog: false }));
    this.root.add(this.surface);
    const atmosphere = new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, depthWrite: false,
      uniforms: { opacity: { value: 0 } },
      vertexShader: `varying vec3 n; varying vec3 p; void main(){vec4 w=modelMatrix*vec4(position,1.);p=w.xyz;n=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `varying vec3 n;varying vec3 p;uniform float opacity;void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(cameraPosition-p))),3.);gl_FragColor=vec4(.28,.66,1.,rim*.42*opacity);}` });
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.035, 64, 32), atmosphere); this.root.add(this.atmosphere);
    const clouds = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      uniforms: { opacity: { value: 0 }, time: { value: 0 } },
      vertexShader: `varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 p;uniform float opacity;uniform float time;void main(){float a=sin(p.x*25.+p.z*18.+time*.006)*sin(p.y*33.-p.z*8.)+sin(p.z*47.+p.x*13.)*.35;float cloud=smoothstep(.3,.95,a);gl_FragColor=vec4(.89,.95,1.,cloud*.5*opacity);}` });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(radius + 14, 64, 32), clouds); this.root.add(this.clouds);
  }
  update(position, mixed, now) {
    const [x, y, z] = position;
    this.mix = mixed ? 0 : THREE.MathUtils.smoothstep(y, FLIGHT.detailFadeStart, FLIGHT.detailFadeEnd);
    this.root.visible = !!this.data && !mixed && y > 24;
    if (!this.data) return;
    const lon = x / this.data.radius, lat = -z / this.data.radius;
    const east = new THREE.Vector3(Math.cos(lon), 0, -Math.sin(lon));
    const up = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
    const south = new THREE.Vector3(Math.sin(lat) * Math.sin(lon), -Math.cos(lat), Math.sin(lat) * Math.cos(lon));
    const basis = new THREE.Matrix4().makeBasis(east, up, south).transpose();
    this.root.quaternion.setFromRotationMatrix(basis); this.root.position.set(x, -this.data.radius, z);
    const opacity = THREE.MathUtils.smoothstep(y, 24, 65);
    this.surface.material.opacity = opacity;
    this.atmosphere.material.uniforms.opacity.value = this.mix;
    this.clouds.material.uniforms.opacity.value = this.mix; this.clouds.material.uniforms.time.value = now / 1000;
  }
}
