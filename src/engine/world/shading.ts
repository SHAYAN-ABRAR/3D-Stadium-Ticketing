/**
 * Shader patches shared by the scene's materials (PROMPT.md 6.6, item 8):
 * - cloud shadows: scrolling noise multiplied into the sun term (the directional light), projected along the
 *   sun so the same cloud darkens the park, the stands and the roof consistently (Medium and up);
 * - tree sway (High) and waving flags, in the vertex shader.
 * Patches chain onto any existing onBeforeCompile and extend customProgramCacheKey, so a patched material
 * never shares a compiled program with a plain one (pitfall 5). The uniforms are per world (one object
 * shared by every patched material), so the engine updates them once per frame.
 */
import * as THREE from 'three';

export interface AmbientUniforms {
  /** Seconds of ambient animation (frozen while ambient animation is off). */
  uTime: { value: number };
  /** Cloud noise offset (drifts with the wind), strength (0 = no cloud shadows) and the sun direction. */
  uCloudOffset: { value: THREE.Vector2 };
  uCloudStrength: { value: number };
  uCloudSun: { value: THREE.Vector3 };
  /** Tree sway amount: 1 on High with ambient animation, else 0. */
  uWind: { value: number };
}

export function createAmbientUniforms(): AmbientUniforms {
  return {
    uTime: { value: 0 },
    uCloudOffset: { value: new THREE.Vector2(0.37, 0.81) },
    uCloudStrength: { value: 0 },
    uCloudSun: { value: new THREE.Vector3(0, 1, 0) },
    uWind: { value: 0 },
  };
}

type Shader = THREE.WebGLProgramParametersWithUniforms;

/** Adds a shader patch to a material, after any patch it already has. */
export function patchMaterial(mat: THREE.Material, key: string, patch: (shader: Shader) => void) {
  const prev = mat.onBeforeCompile;
  const custom = mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey;
  const prevKey = custom ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    patch(shader);
  };
  mat.customProgramCacheKey = () => `${prevKey()}|${key}`;
  mat.needsUpdate = true;
}

/** Replaces `find` in `src`; throws when the anchor is missing (a three.js upgrade changed the chunk). */
function replaceOnce(src: string, find: string, by: string): string {
  if (!src.includes(find)) throw new Error(`Shader patch anchor not found: ${find}`);
  return src.replace(find, by);
}

/** World position for the cloud lookup (instanced meshes included). */
const CLOUD_VERTEX = /* glsl */ `
{
  vec4 cloudWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  cloudWorld = instanceMatrix * cloudWorld;
  #endif
  vCloudPos = (modelMatrix * cloudWorld).xyz;
}`;

const CLOUD_FUNCTIONS = /* glsl */ `
uniform vec2 uCloudOffset;
uniform float uCloudStrength;
uniform vec3 uCloudSun;
varying vec3 vCloudPos;
float cloudHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float cloudNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cloudHash(i), cloudHash(i + vec2(1.0, 0.0)), u.x),
             mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
/* 1 in sunlight, darker under a cloud. Ground point under the cloud: back along the sun ray to y = 0. */
float cloudShade() {
  if (uCloudStrength < 0.001) return 1.0;
  vec2 q = vCloudPos.xz - uCloudSun.xz / max(uCloudSun.y, 0.15) * vCloudPos.y;
  q = q * 0.0042 + uCloudOffset;
  float n = cloudNoise(q) * 0.55 + cloudNoise(q * 2.03 + 7.1) * 0.3 + cloudNoise(q * 4.1 + 3.7) * 0.15;
  return 1.0 - uCloudStrength * smoothstep(0.5, 0.72, n);
}`;

const LIGHTS_WITH_CLOUDS = replaceOnce(
  THREE.ShaderChunk.lights_fragment_begin,
  'getDirectionalLightInfo( directionalLight, directLight );',
  'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= cloudShade();',
);

/** Drifting cloud shadows on the sun term of a lit material (MeshStandardMaterial and friends). */
export function addCloudShadows(mat: THREE.Material, u: AmbientUniforms) {
  patchMaterial(mat, 'clouds', (sh) => {
    sh.uniforms.uCloudOffset = u.uCloudOffset;
    sh.uniforms.uCloudStrength = u.uCloudStrength;
    sh.uniforms.uCloudSun = u.uCloudSun;
    sh.vertexShader = replaceOnce(
      replaceOnce(sh.vertexShader, '#include <common>', '#include <common>\nvarying vec3 vCloudPos;'),
      '#include <project_vertex>',
      `#include <project_vertex>${CLOUD_VERTEX}`,
    );
    sh.fragmentShader = replaceOnce(
      replaceOnce(sh.fragmentShader, '#include <common>', `#include <common>${CLOUD_FUNCTIONS}`),
      '#include <lights_fragment_begin>',
      LIGHTS_WITH_CLOUDS,
    );
  });
}

/** Tree sway for instanced canopies (High): the top moves, the base stays put; each tree has its own phase. */
export function addTreeSway(mat: THREE.Material, u: AmbientUniforms) {
  patchMaterial(mat, 'sway', (sh) => {
    sh.uniforms.uTime = u.uTime;
    sh.uniforms.uWind = u.uWind;
    sh.vertexShader = replaceOnce(
      replaceOnce(
        sh.vertexShader,
        '#include <common>',
        '#include <common>\nuniform float uTime;\nuniform float uWind;',
      ),
      '#include <begin_vertex>',
      /* glsl */ `#include <begin_vertex>
#ifdef USE_INSTANCING
if (uWind > 0.0) {
  vec3 treeBase = vec3(instanceMatrix[3]);
  float ph = uTime * 1.6 + treeBase.x * 0.09 + treeBase.z * 0.13;
  float k = uWind * max(0.0, position.y + 0.6);
  transformed.x += (sin(ph) * 0.026 + sin(ph * 2.7) * 0.008) * k;
  transformed.z += cos(ph * 0.83) * 0.02 * k;
}
#endif`,
    );
  });
}

/**
 * Waving flags. Flag geometry: x from 0 (at the pole) to 1 (free end), y from 0 to 1; instances scale it
 * (length, height, height), so the wave scales with the flag.
 */
export function addFlagWave(mat: THREE.Material, u: AmbientUniforms) {
  patchMaterial(mat, 'flag', (sh) => {
    sh.uniforms.uTime = u.uTime;
    sh.vertexShader = replaceOnce(
      replaceOnce(
        replaceOnce(sh.vertexShader, '#include <common>', '#include <common>\nuniform float uTime;'),
        '#include <beginnormal_vertex>',
        /* glsl */ `
float flagX = position.x;
#ifdef USE_INSTANCING
vec3 flagBase = vec3(instanceMatrix[3]);
#else
vec3 flagBase = vec3(0.0);
#endif
float flagPh = uTime * 4.2 - flagX * 5.5 + flagBase.x * 0.31 + flagBase.z * 0.17;
float flagAmp = 0.12 * flagX;
vec3 objectNormal = normalize(vec3(-(cos(flagPh) * -5.5 * flagAmp + sin(flagPh) * 0.12), 0.0, 1.0));`,
      ),
      '#include <begin_vertex>',
      /* glsl */ `#include <begin_vertex>
transformed.z += sin(flagPh) * flagAmp;
transformed.y -= (1.0 - cos(flagPh)) * 0.02 * flagX;`,
    );
  });
}
