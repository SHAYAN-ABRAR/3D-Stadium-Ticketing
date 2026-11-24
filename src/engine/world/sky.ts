/**
 * The sky (PROMPT.md 6.6, item 2): three's Sky addon (atmospheric scattering with drifting clouds) drives the
 * sun's position and colour; it follows the camera like a skybox. At night: stars and a moon. The same sky,
 * rendered into a PMREM environment, lights the materials; it is rebuilt when the preset changes.
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export interface SkyParams {
  /** Sun height and direction, degrees (azimuth = atan2(z, x)). */
  elevation: number;
  azimuth: number;
  turbidity: number;
  rayleigh: number;
  mie: number;
  mieG: number;
  /** Brightness of the sky against the scene's exposure. */
  gain: number;
  clouds: number;
  /** Colour grade from the horizon up to the zenith (linear RGB multipliers; 1, 1, 1 leaves the sky as it is). */
  horizonTint: readonly [number, number, number];
  zenithTint: readonly [number, number, number];
}

const SKY_SIZE = 9000;
/** The addon expects the sun this far away (its sun fade uses sunPosition.y / 450000). */
const SUN_DISTANCE = 450_000;

/** A unit direction from elevation and azimuth (degrees). */
export function dirFrom(elevation: number, azimuth: number, out = new THREE.Vector3()): THREE.Vector3 {
  const e = THREE.MathUtils.degToRad(elevation),
    a = THREE.MathUtils.degToRad(azimuth);
  return out.set(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
}

export function makeSky(): Sky {
  const sky = new Sky();
  const mat = sky.material as THREE.ShaderMaterial;
  mat.uniforms.skyGain = { value: 0.55 };
  mat.uniforms.skyHorizonTint = { value: new THREE.Vector3(1, 1, 1) };
  mat.uniforms.skyZenithTint = { value: new THREE.Vector3(1, 1, 1) };
  mat.fragmentShader = mat.fragmentShader
    .replace(
      'uniform float time;',
      'uniform float time;\nuniform float skyGain;\nuniform vec3 skyHorizonTint;\nuniform vec3 skyZenithTint;',
    )
    .replace(
      'gl_FragColor = vec4( texColor, 1.0 );',
      'gl_FragColor = vec4( texColor * skyGain * mix( skyHorizonTint, skyZenithTint, sqrt( clamp( direction.y, 0.0, 1.0 ) ) ), 1.0 );',
    );
  sky.scale.setScalar(SKY_SIZE);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  // A skybox: centred on whichever camera renders it (main view and snapshots). The world matrix is
  // computed before onBeforeRender, so it is updated here.
  sky.onBeforeRender = (_r, _s, camera) => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld();
  };
  return sky;
}

export function setSky(sky: Sky, p: SkyParams) {
  const u = (sky.material as THREE.ShaderMaterial).uniforms;
  u.turbidity.value = p.turbidity;
  u.rayleigh.value = p.rayleigh;
  u.mieCoefficient.value = p.mie;
  u.mieDirectionalG.value = p.mieG;
  u.skyGain.value = p.gain;
  (u.skyHorizonTint.value as THREE.Vector3).set(...p.horizonTint);
  (u.skyZenithTint.value as THREE.Vector3).set(...p.zenithTint);
  u.cloudCoverage.value = p.clouds;
  // The disc only once the sun is clearly up (blue hour keeps it just below the horizon).
  u.showSunDisc.value = p.elevation > 0.5 ? 1 : 0;
  dirFrom(p.elevation, p.azimuth, u.sunPosition.value).multiplyScalar(SUN_DISTANCE);
}

/** Advances the clouds (ambient animation). */
export function tickSky(sky: Sky, seconds: number) {
  (sky.material as THREE.ShaderMaterial).uniforms.time.value = seconds;
}

/** The sky rendered into a PMREM environment map. The caller disposes the returned target. */
export function skyEnvironment(renderer: THREE.WebGLRenderer, p: SkyParams) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  const sky = makeSky();
  sky.onBeforeRender = () => {};
  setSky(sky, p);
  scene.add(sky);
  const rt = pmrem.fromScene(scene, 0.02, 1, 20000);
  pmrem.dispose();
  sky.geometry.dispose();
  (sky.material as THREE.Material).dispose();
  return rt;
}

/** About 1,800 stars on the upper half of the sky (visible at night). */
export function makeStars(): THREE.Points {
  const n = 1800,
    pos = new Float32Array(n * 3),
    col = new Float32Array(n * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < n; i++) {
    const y = 0.06 + 0.94 * Math.pow(rnd(), 0.7),
      a = rnd() * Math.PI * 2,
      r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * 8000, y * 8000, Math.sin(a) * r * 8000], i * 3);
    const b = 0.55 + rnd() * 0.45,
      warm = rnd() < 0.2 ? 0.85 : 1;
    col.set([b, b * warm + (1 - warm) * 0.2, b * (warm < 1 ? 0.75 : 1)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({
    size: 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(g, m);
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  stars.visible = false;
  stars.onBeforeRender = (_r, _s, camera) => {
    stars.position.copy(camera.position);
    stars.updateMatrixWorld();
  };
  return stars;
}

/** The moon: a bright disc far away along `dir` (it blooms on Medium and up). */
export function makeMoon(dir: THREE.Vector3): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(150, 40),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#f4efe0').multiplyScalar(6),
      fog: false,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    }),
  );
  const offset = dir.clone().multiplyScalar(7000);
  m.frustumCulled = false;
  m.renderOrder = -9;
  m.visible = false;
  m.onBeforeRender = (_r, _s, camera) => {
    m.position.copy(camera.position).add(offset);
    m.lookAt(camera.position);
    m.updateMatrixWorld();
  };
  return m;
}
