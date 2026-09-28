import * as THREE from 'three';

export const NOISE = `
float orbitHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float orbitNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(orbitHash(i),orbitHash(i+vec3(1,0,0)),f.x),mix(orbitHash(i+vec3(0,1,0)),orbitHash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(orbitHash(i+vec3(0,0,1)),orbitHash(i+vec3(1,0,1)),f.x),mix(orbitHash(i+vec3(0,1,1)),orbitHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float orbitFbm(vec3 p){return orbitNoise(p)*.57+orbitNoise(p*2.07)*.28+orbitNoise(p*4.13)*.15;}
`;

/** Original procedural surface detail: no downloaded textures or per-object bitmaps. */
export function surfaceMaterial(kind, parameters = {}) {
  const material = new THREE.MeshStandardMaterial({ roughness: .88, ...parameters });
  const detail = {
    terrain: 'orbitFbm(vOrbitSurface*7.)*.65 + orbitNoise(vOrbitSurface*75.)*.15',
    stone: 'orbitFbm(vOrbitSurface*12.)*.8 + orbitNoise(vOrbitSurface*65.)*.12',
    fur: 'orbitNoise(vOrbitSurface*40.)*.28 + sin(vOrbitSurface.y*220.+orbitNoise(vOrbitSurface*18.)*9.)*.075',
    scales: 'pow(abs(sin(vOrbitSurface.x*55.+vOrbitSurface.y*19.)*sin(vOrbitSurface.z*48.-vOrbitSurface.y*15.)),.45)*.4',
    wood: 'orbitNoise(vOrbitSurface*vec3(22.,3.,22.))*.035',
  }[kind] || 'orbitNoise(vOrbitSurface*40.)*.2';
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vOrbitSurface;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvOrbitSurface=position;');
    shader.fragmentShader = 'varying vec3 vOrbitSurface;\n' + NOISE + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float orbitDetail=${detail};
      float orbitPatch=orbitFbm(vOrbitSurface*1.7);
      diffuseColor.rgb*=.82+orbitPatch*.29+orbitDetail*.12;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec3 orbitDx=dFdx(-vViewPosition), orbitDy=dFdy(-vViewPosition);
      vec3 orbitR1=cross(orbitDy,normal), orbitR2=cross(normal,orbitDx);
      float orbitDet=dot(orbitDx,orbitR1);
      vec3 orbitGradient=sign(orbitDet)*(dFdx(orbitDetail)*orbitR1+dFdy(orbitDetail)*orbitR2);
      normal=normalize(max(abs(orbitDet),1e-8)*normal-orbitGradient*.018);
    `);
  };
  material.customProgramCacheKey = () => 'orbit-surface-v1-' + kind;
  return material;
}
