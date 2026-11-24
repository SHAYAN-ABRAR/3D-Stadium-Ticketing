/**
 * The match-day crowd (PROMPT.md 6.7). Spectators sit only in sold seats.
 * - Far: one camera-facing quad per bowl seat (zero size unless sold), alpha-tested (no transparency
 *   sorting), from a sprite atlas drawn in code at load time: 16 variants (skin tones; home, away and neutral
 *   shirts; scarves; caps), each from the front and from behind, arms down and arms up. The quads are
 *   billboarded around the vertical axis in the vertex shader of a standard material (onBeforeCompile), so
 *   they receive shadows and fog. Alpha is sharpened with distance so mipmaps don't thin the crowd out.
 * - Near (High, seat and box views): low-poly 3D people (174 triangles) within 25 m of the camera, in the
 *   same colours; their impostors are hidden.
 * - Idle animation (sway, an occasional raised arm) with ambient animation; a Mexican wave travels along s;
 *   when the match on the pitch has a goal, the scoring side's fans jump with their arms up.
 * - Fades in and out with a 400 ms dissolve; a seat that sells scales its spectator in.
 */
import * as THREE from 'three';
import { hash2, type StadiumLayout } from '@/lib/stadium';
import { P0, planInverse } from '@/lib/stadium/plan';
import { addCloudShadows, patchMaterial, type AmbientUniforms } from './world/shading';
import type { TextureText } from './world/textures';

const VARIANTS = 16;
const CELL_W = 64,
  CELL_H = 128,
  COLS = 8,
  ROWS = 8;
/** The sprite covers 0.65 x 1.3 m, from 0.36 m above the seat's base (98.5 px per metre). */
const SPRITE_W = 0.65,
  SPRITE_H = 1.3,
  SPRITE_BASE = 0.36,
  PX_PER_M = CELL_H / SPRITE_H;
const FADE_S = 0.4;
const SCALE_IN_S = 0.6;
/**
 * Spectators closer than this to the camera dissolve (metres from the eye: about three rows in front), so a
 * seat view shows the pitch instead of the backs of the nearest heads.
 */
const CLEAR_FROM = 3.0,
  CLEAR_TO = 4.2;
/**
 * Whether this spectator is shown: the fade and the clear zone thin the crowd person by person (each has
 * its own threshold), so nobody is ever drawn half-dissolved.
 */
const VISIBLE_GLSL = (dist: string) =>
  `step(fract(cPhase * 13.7 + 0.31), uFade * smoothstep(${CLEAR_FROM.toFixed(2)}, ${CLEAR_TO.toFixed(2)}, ${dist}))`;
/** The wave: metres of s per second, laps, and its ramps. */
const WAVE_SPEED = 30;
const WAVE_LAPS = 1;
const NEAR_RADIUS = 25;
const NEAR_MAX = 1500;
/** How long the fans celebrate a goal. */
const CHEER_S = 6;

interface Variant {
  group: 'home' | 'away' | 'neutral';
  shirt: string;
  skin: string;
  hair: string;
  pants: string;
  team: string;
  stripes: boolean;
  scarf: boolean;
  cap: boolean;
}

const SKIN = ['#f1c7a5', '#e0ac85', '#c68b62', '#9a6544', '#6b4430'];
const HAIR = ['#1d1714', '#3b2a1f', '#6b4a2d', '#b8925a', '#7c7c7c'];
const PANTS = ['#2c3a55', '#22252b', '#3e4652', '#2a2f3a'];
const NEUTRAL = ['#f2f2ee', '#2b3445', '#70767e', '#1f2024', '#8f2632'];

function shade(hex: string, k: number): string {
  return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
}

/** Variants 0-6 wear home colours, 7-10 away colours, 11-15 neutral shirts. */
function makeVariants(home: string, away: string): Variant[] {
  const out: Variant[] = [];
  for (let k = 0; k < VARIANTS; k++) {
    const group = k < 7 ? 'home' : k < 11 ? 'away' : 'neutral';
    const team = group === 'away' ? away : home;
    out.push({
      group,
      team,
      shirt: group === 'neutral' ? NEUTRAL[k - 11] : shade(team, [1, 0.86, 1.1, 1, 0.94, 1, 1.05][k % 7]),
      skin: SKIN[(k * 3) % SKIN.length],
      hair: HAIR[(k * 7 + 1) % HAIR.length],
      pants: PANTS[k % PANTS.length],
      stripes: group !== 'neutral' && k % 4 === 1,
      scarf: (group === 'neutral' && k % 2 === 0) || k === 5 || k === 9,
      cap: k % 5 === 2,
    });
  }
  return out;
}

/** Home fans everywhere, the away end in the West stand, neutral shirts throughout. */
export function crowdVariantOf(i: number, layout: StadiumLayout): number {
  const awayEnd = layout.blocks[layout.blockOf[i]].standKey === 'W';
  const r = hash2(i, 31),
    v = hash2(i, 47);
  const away = awayEnd ? 0.7 : 0.06,
    neutral = 0.3;
  if (r < away) return 7 + Math.min(3, Math.floor(v * 4));
  if (r < away + neutral) return 11 + Math.min(4, Math.floor(v * 5));
  return Math.min(6, Math.floor(v * 7));
}

/* ---------------- the sprite atlas ---------------- */

const Y = (h: number) => (SPRITE_BASE + SPRITE_H - h) * PX_PER_M;

function roundRect(
  x: CanvasRenderingContext2D,
  l: number,
  t: number,
  w: number,
  h: number,
  r: number | number[],
) {
  x.beginPath();
  x.roundRect(l, t, w, h, r);
}

function drawPerson(x: CanvasRenderingContext2D, v: Variant, back: boolean, armsUp: boolean) {
  const shoulder = Y(0.99),
    hip = Y(0.5),
    headY = Y(1.18),
    neckTop = Y(1.09);
  // legs (from the front only: from behind, the seat back hides them)
  if (!back) {
    x.fillStyle = v.pants;
    roundRect(x, 15, Y(0.58), 34, CELL_H - Y(0.58), 5);
    x.fill();
  }
  // arms down: sleeves at the sides, forearms resting on the lap
  if (!armsUp) {
    x.fillStyle = shade(v.shirt, 0.9);
    roundRect(x, 7, shoulder + 3, 9, 30, 4);
    x.fill();
    roundRect(x, 48, shoulder + 3, 9, 30, 4);
    x.fill();
    if (!back) {
      x.fillStyle = v.skin;
      roundRect(x, 10, Y(0.64), 15, 8, 4);
      x.fill();
      roundRect(x, 39, Y(0.64), 15, 8, 4);
      x.fill();
    }
  }
  // torso
  const bottom = back ? CELL_H : hip;
  x.save();
  roundRect(x, 13, shoulder, 38, bottom - shoulder, [10, 10, 4, 4]);
  x.fillStyle = v.shirt;
  x.fill();
  x.clip();
  if (v.stripes) {
    x.fillStyle = 'rgba(255,255,255,.9)';
    for (const sx of [19, 28, 37, 46]) x.fillRect(sx, shoulder, 4, bottom - shoulder);
  }
  if (back && v.group !== 'neutral') {
    x.fillStyle = 'rgba(255,255,255,.92)';
    x.font = 'bold 19px Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(String(2 + ((v.skin.length * 7 + v.shirt.charCodeAt(2)) % 22)), 32, shoulder + 24);
  }
  const g = x.createLinearGradient(13, 0, 51, 0);
  g.addColorStop(0, 'rgba(0,0,0,.16)');
  g.addColorStop(0.45, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.2)');
  x.fillStyle = g;
  x.fillRect(13, shoulder, 38, bottom - shoulder);
  x.restore();
  // arms up: sleeves and forearms reaching above the head
  if (armsUp) {
    x.lineCap = 'round';
    for (const s of [-1, 1]) {
      const sx = 32 + s * 17;
      x.strokeStyle = shade(v.shirt, 0.92);
      x.lineWidth = 9;
      x.beginPath();
      x.moveTo(sx, shoulder + 6);
      x.lineTo(32 + s * 21, Y(1.32));
      x.stroke();
      x.strokeStyle = v.skin;
      x.lineWidth = 7;
      x.beginPath();
      x.moveTo(32 + s * 21, Y(1.32));
      x.lineTo(32 + s * 23, Y(1.58));
      x.stroke();
      x.fillStyle = v.skin;
      x.beginPath();
      x.arc(32 + s * 23, Y(1.6), 4.5, 0, Math.PI * 2);
      x.fill();
    }
  }
  // neck and head
  x.fillStyle = v.skin;
  x.fillRect(27, neckTop, 10, shoulder - neckTop + 3);
  x.beginPath();
  x.ellipse(32, headY, 10.5, 12.5, 0, 0, Math.PI * 2);
  x.fillStyle = back && !v.cap ? v.hair : v.skin;
  x.fill();
  if (back && !v.cap) {
    x.fillStyle = v.skin;
    x.fillRect(28, headY + 9, 8, 4);
  }
  if (v.cap) {
    x.fillStyle = v.team;
    x.beginPath();
    x.ellipse(32, headY - 3, 11.5, 10.5, 0, Math.PI, Math.PI * 2);
    x.fill();
    if (!back) {
      x.fillStyle = shade(v.team, 0.7);
      x.beginPath();
      x.ellipse(32, headY - 3, 13, 3, 0, 0, Math.PI * 2);
      x.fill();
    }
  } else if (!back) {
    x.fillStyle = v.hair;
    x.beginPath();
    x.ellipse(32, headY - 1, 11.5, 12.5, 0, Math.PI, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(0,0,0,.12)';
    x.beginPath();
    x.ellipse(32, headY + 11, 6, 2, 0, 0, Math.PI * 2);
    x.fill();
  }
  // scarf
  if (v.scarf) {
    x.fillStyle = v.team;
    roundRect(x, 21, shoulder - 5, 22, 9, 4);
    x.fill();
    if (!back) {
      roundRect(x, 34, shoulder + 2, 7, 28, 2);
      x.fill();
      x.fillStyle = '#ffffff';
      x.fillRect(34, shoulder + 14, 7, 4);
    }
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.fillRect(27, shoulder - 5, 3, 9);
    x.fillRect(35, shoulder - 5, 3, 9);
  }
}

function drawAtlas(vs: Variant[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CELL_W * COLS;
  c.height = CELL_H * ROWS;
  const x = c.getContext('2d')!;
  for (let pose = 0; pose < 2; pose++)
    for (let back = 0; back < 2; back++)
      vs.forEach((v, k) => {
        const cell = k + VARIANTS * back + 2 * VARIANTS * pose;
        x.save();
        x.translate((cell % COLS) * CELL_W, Math.floor(cell / COLS) * CELL_H);
        x.beginPath();
        x.rect(0, 0, CELL_W, CELL_H);
        x.clip();
        drawPerson(x, v, back === 1, pose === 1);
        x.restore();
      });
  return c;
}

/* ---------------- shaders ---------------- */

const CROWD_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform float uClock;
uniform float uIdle;
uniform float uWaveFront;
uniform float uWaveAmp;
uniform float uPerimeter;
uniform float uFade;
uniform float uCheer;
uniform float uCheerTeam;`;

/**
 * Shared animation terms: the wave crest's distance along s, a goal cheer (the scoring side's fans jump
 * with their arms up, neutral fans less), raised arms, and the scale-in. Needs cS, cPhase, cBorn and cGroup
 * (0 home, 1 away, 2 neutral).
 */
const ANIMATION = /* glsl */ `
float cWd = mod(uWaveFront - cS + 0.5 * uPerimeter, uPerimeter) - 0.5 * uPerimeter;
float cWave = uWaveAmp * exp(-cWd * cWd / 60.0);
float cIdleUp = uIdle * step(0.972, fract(uTime * 0.05 + cPhase * 7.0));
float cCheer = uCheer * (cGroup == uCheerTeam ? 1.0 : cGroup > 1.5 ? 0.45 : 0.0);
float cJump = cCheer * abs(sin(uClock * 7.5 + cPhase * 29.0)) * 0.3;
float cRaise = max(max(smoothstep(0.15, 0.55, cWave), cIdleUp), step(0.3, cCheer) * step(0.3, fract(cPhase * 5.3 + 0.2)));
float cAge = cBorn < 0.0 ? 1.0 : clamp((uClock - cBorn) / ${SCALE_IN_S.toFixed(2)}, 0.0, 1.0);
float cGrow = 1.0 - (1.0 - cAge) * (1.0 - cAge) * (1.0 - cAge);
float cLean = uIdle * sin(uTime * 1.3 + cPhase * 40.0) * 0.022;`;

interface CrowdUniforms {
  uClock: { value: number };
  uIdle: { value: number };
  uWaveFront: { value: number };
  uWaveAmp: { value: number };
  uPerimeter: { value: number };
  uFade: { value: number };
  uCheer: { value: number };
  uCheerTeam: { value: number };
}

function farMaterial(atlas: THREE.Texture, u: CrowdUniforms, amb: AmbientUniforms) {
  const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, roughness: 0.9, metalness: 0 });
  patchMaterial(mat, 'crowd-far', (sh) => {
    Object.assign(sh.uniforms, u, { uTime: amb.uTime });
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aSeat;
attribute vec2 aFace;
attribute vec3 aInfo;
attribute float aShow;
varying float vCrowdWave;${CROWD_UNIFORMS}`,
      )
      .replace(
        '#include <uv_vertex>',
        /* glsl */ `
float cS = aSeat.w, cPhase = aInfo.y, cBorn = aInfo.z;
float cGroup = aInfo.x < 6.5 ? 0.0 : aInfo.x < 10.5 ? 1.0 : 2.0;
${ANIMATION}
vCrowdWave = cWave;
vec3 cFace = vec3(-aFace.x, 0.0, -aFace.y);
vec3 cToCam = cameraPosition - aSeat.xyz;
// The wave is stylised to read from any distance: people rise and stretch a little more the further away
// they are (a real 0.5 m rise is under a pixel from the far side of the bowl or from the air).
float cReach = 0.55 + 0.004 * length(cToCam);
vec3 cFlat = vec3(cToCam.x, 0.0, cToCam.z);
cFlat = dot(cFlat, cFlat) > 1e-8 ? normalize(cFlat) : cFace;
vec3 cRight = vec3(cFlat.z, 0.0, -cFlat.x);
float cBack = dot(cFlat, cFace) < 0.0 ? 1.0 : 0.0;
float cCell = aInfo.x + ${VARIANTS.toFixed(1)} * cBack + ${(2 * VARIANTS).toFixed(1)} * step(0.5, cRaise);
float cScale = aShow * cGrow * ${VISIBLE_GLSL('length(cToCam)')};
#include <uv_vertex>
#ifdef USE_MAP
vMapUv = (vec2(mod(cCell, ${COLS.toFixed(1)}), ${(ROWS - 1).toFixed(1)} - floor(cCell / ${COLS.toFixed(1)})) + uv) / vec2(${COLS.toFixed(1)}, ${ROWS.toFixed(1)});
#endif`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        'vec3 objectNormal = normalize(cFlat + vec3(0.0, 0.45, 0.0));',
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
vec3 transformed = aSeat.xyz + cFace * -0.04
  + cRight * ((position.x + cLean * position.y) * ${SPRITE_W.toFixed(2)} * cScale)
  + vec3(0.0, ${SPRITE_BASE.toFixed(2)} + position.y * ${SPRITE_H.toFixed(2)} * (1.0 + 0.45 * cReach * cWave) * cScale + (cWave + cJump) * cReach * cScale, 0.0);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCrowdWave;')
      // The crest catches the light: scarves and shirts held up brighten the band as it travels.
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vCrowdWave * 0.5;',
      )
      .replace(
        '#include <alphatest_fragment>',
        /* glsl */ `{
  // Mipmaps average the alpha down: sharpen it with distance so far spectators don't thin out.
  vec2 cTex = vMapUv * vec2(${(CELL_W * COLS).toFixed(1)}, ${(CELL_H * ROWS).toFixed(1)});
  vec2 cdx = dFdx(cTex), cdy = dFdy(cTex);
  float cLod = 0.5 * log2(max(max(dot(cdx, cdx), dot(cdy, cdy)), 1e-8));
  diffuseColor.a *= 1.0 + max(0.0, cLod) * 0.3;
}
#include <alphatest_fragment>`,
      );
  });
  addCloudShadows(mat, amb);
  return mat;
}

/** Part ids of the near people's vertices. */
const PART = { torso: 0, skin: 1, hair: 2, legs: 3, armL: 4, armR: 5, handL: 6, handR: 7 } as const;

function personGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, part: number) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    ng.deleteAttribute('uv');
    ng.setAttribute(
      'aPart',
      new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count).fill(part), 1),
    );
    parts.push(ng);
  };
  add(new THREE.BoxGeometry(0.36, 0.5, 0.2).translate(0, 0.76, -0.07), PART.torso);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6, 1, true).translate(0, 1.05, -0.06), PART.skin);
  add(new THREE.SphereGeometry(0.105, 6, 4).translate(0, 1.18, -0.05), PART.skin);
  add(
    new THREE.SphereGeometry(0.113, 6, 2, 0, Math.PI * 2, 0, Math.PI * 0.42).translate(0, 1.19, -0.055),
    PART.hair,
  );
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.14, 0.13, 0.42).translate(0.095 * s, 0.5, 0.12), PART.legs);
    add(new THREE.BoxGeometry(0.11, 0.44, 0.12).translate(0.095 * s, 0.24, 0.32), PART.legs);
    // arms hang from the shoulder pivot (0.215, 0.98, -0.06), swung forward onto the lap
    const arm = new THREE.BoxGeometry(0.085, 0.48, 0.1).translate(0, -0.24, 0).rotateX(-0.55);
    add(arm.translate(0.215 * s, 0.98, -0.06), s > 0 ? PART.armL : PART.armR);
    const hand = new THREE.BoxGeometry(0.07, 0.09, 0.07).translate(0, -0.52, 0).rotateX(-0.55);
    add(hand.translate(0.215 * s, 0.98, -0.06), s > 0 ? PART.handL : PART.handR);
  }
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'aPart'] as const;
  for (const n of names) {
    const size = parts[0].getAttribute(n).itemSize;
    const total = parts.reduce((a, g) => a + g.getAttribute(n).array.length, 0);
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of parts) {
      arr.set(g.getAttribute(n).array as Float32Array, o);
      o += g.getAttribute(n).array.length;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  for (const g of parts) g.dispose();
  out.computeBoundingSphere();
  return out;
}

function nearMaterial(u: CrowdUniforms, amb: AmbientUniforms) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  patchMaterial(mat, 'crowd-near', (sh) => {
    Object.assign(sh.uniforms, u, { uTime: amb.uTime });
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aPart;
attribute vec3 aShirt;
attribute vec3 aSkin;
attribute vec3 aHair;
attribute vec3 aPants;
attribute vec3 aMeta;
attribute float aGroup;
varying vec3 vPColor;${CROWD_UNIFORMS}`,
      )
      .replace(
        '#include <uv_vertex>',
        /* glsl */ `
float cS = aMeta.x, cPhase = aMeta.y, cBorn = aMeta.z, cGroup = aGroup;
${ANIMATION}
float pVis = ${VISIBLE_GLSL('distance(cameraPosition, (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz)')};
float pArm = (aPart == 4.0 || aPart == 6.0) ? 1.0 : (aPart == 5.0 || aPart == 7.0) ? -1.0 : 0.0;
float pAng = cRaise * 2.7 * pArm;
float pC = cos(pAng), pSn = sin(pAng);
vPColor = aPart < 0.5 || aPart == 4.0 || aPart == 5.0 ? aShirt : aPart == 2.0 ? aHair : aPart == 3.0 ? aPants : aSkin;
#include <uv_vertex>`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `vec3 objectNormal = vec3(normal);
if (pArm != 0.0) objectNormal = vec3(pC * objectNormal.x - pSn * objectNormal.y, pSn * objectNormal.x + pC * objectNormal.y, objectNormal.z);`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `vec3 transformed = vec3(position);
if (pArm != 0.0) {
  vec3 piv = vec3(0.215 * pArm, 0.98, -0.06);
  vec3 r = transformed - piv;
  transformed = piv + vec3(pC * r.x - pSn * r.y, pSn * r.x + pC * r.y, r.z);
}
transformed.x += cLean * 1.4 * max(0.0, transformed.y - 0.5);
transformed.y += cWave * 0.45 + cJump;
transformed = mix(vec3(0.0, 0.45, 0.0), transformed, cGrow * pVis);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPColor;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPColor;');
  });
  addCloudShadows(mat, amb);
  return mat;
}

/* ---------------- the crowd ---------------- */

export class Crowd {
  readonly far: THREE.Mesh;
  readonly near: THREE.InstancedMesh;
  private readonly atlas: THREE.CanvasTexture;
  private readonly u: CrowdUniforms;
  private readonly show: THREE.InstancedBufferAttribute;
  private readonly info: THREE.InstancedBufferAttribute;
  private readonly variants: Variant[];
  private readonly variantOf: Uint8Array;
  /** 1 where a bowl seat is sold (someone sits there). */
  private readonly sold: Uint8Array;
  private nearIdx: number[] = [];
  private fade = 0;
  private target = 0;
  private wave: { start: number; from: number; duration: number } | null = null;
  private cheering: { start: number; team: 0 | 1 } | null = null;
  private clock = 0;
  private lastBorn = -Infinity;
  private snapshotState: { fade: number; swapped: boolean } | null = null;
  /** Off in tests and with reduced motion: a new spectator appears at once. */
  scaleIn = true;

  constructor(
    private readonly layout: StadiumLayout,
    text: Pick<TextureText, 'homeColor' | 'awayColor'>,
    amb: AmbientUniforms,
  ) {
    const n = layout.bowlSeatCount;
    this.variants = makeVariants(text.homeColor || '#1f46b8', text.awayColor || '#b3121c');
    this.atlas = new THREE.CanvasTexture(drawAtlas(this.variants));
    this.atlas.colorSpace = THREE.SRGBColorSpace;
    this.atlas.anisotropy = 4;
    this.u = {
      uClock: { value: 0 },
      uIdle: { value: 0 },
      uWaveFront: { value: 0 },
      uWaveAmp: { value: 0 },
      uPerimeter: { value: P0 },
      uFade: { value: 0 },
      uCheer: { value: 0 },
      uCheerTeam: { value: 0 },
    };

    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('normal', quad.getAttribute('normal'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    const seat = new Float32Array(n * 4),
      face = new Float32Array(n * 2),
      info = new Float32Array(n * 3);
    this.variantOf = new Uint8Array(n);
    const p = layout.positions,
      nr = layout.normals;
    for (let i = 0; i < n; i++) {
      seat.set([p[i * 3], p[i * 3 + 1], p[i * 3 + 2], layout.planS[i]], i * 4);
      face.set([nr[i * 2], nr[i * 2 + 1]], i * 2);
      const v = crowdVariantOf(i, layout);
      this.variantOf[i] = v;
      info.set([v, hash2(i, 59), -1], i * 3);
    }
    geo.setAttribute('aSeat', new THREE.InstancedBufferAttribute(seat, 4));
    geo.setAttribute('aFace', new THREE.InstancedBufferAttribute(face, 2));
    this.info = new THREE.InstancedBufferAttribute(info, 3);
    this.info.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aInfo', this.info);
    this.show = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.show.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aShow', this.show);
    geo.instanceCount = n;
    this.sold = new Uint8Array(n);
    this.far = new THREE.Mesh(geo, farMaterial(this.atlas, this.u, amb));
    this.far.frustumCulled = false;
    this.far.receiveShadow = true;
    this.far.visible = false;
    this.far.renderOrder = 0;

    const pg = personGeometry();
    for (const name of ['aShirt', 'aSkin', 'aHair', 'aPants', 'aMeta']) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(NEAR_MAX * 3), 3);
      a.setUsage(THREE.DynamicDrawUsage);
      pg.setAttribute(name, a);
    }
    const group = new THREE.InstancedBufferAttribute(new Float32Array(NEAR_MAX), 1);
    group.setUsage(THREE.DynamicDrawUsage);
    pg.setAttribute('aGroup', group);
    this.near = new THREE.InstancedMesh(pg, nearMaterial(this.u, amb), NEAR_MAX);
    this.near.count = 0;
    this.near.frustumCulled = false;
    this.near.receiveShadow = true;
    this.near.visible = false;
  }

  /** Whether anything is (fading) on screen. */
  get visible() {
    return this.fade > 0;
  }

  get waving() {
    return !!this.wave;
  }

  get shown() {
    return this.target === 1;
  }

  /** Full availability: spectators in every sold seat (no scale-in). */
  setStatuses(statuses: Uint8Array) {
    const n = this.layout.bowlSeatCount,
      show = this.show.array as Float32Array,
      info = this.info.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const s = statuses[i] === 2 ? 1 : 0;
      this.sold[i] = s;
      show[i] = s;
      info[i * 3 + 2] = -1;
    }
    for (const i of this.nearIdx) show[i] = 0;
    this.show.clearUpdateRanges();
    this.info.clearUpdateRanges();
    this.show.needsUpdate = this.info.needsUpdate = true;
  }

  /** Changed seats: a seat that sells gets a spectator who scales in. Returns true when something changed. */
  applyChanges(changes: ReadonlyArray<readonly [number, number]>): boolean {
    const n = this.layout.bowlSeatCount,
      show = this.show.array as Float32Array,
      info = this.info.array as Float32Array;
    let changed = false;
    for (const [i, st] of changes) {
      if (i < 0 || i >= n) continue;
      const s = st === 2 ? 1 : 0;
      if (s === this.sold[i]) continue;
      this.sold[i] = s;
      show[i] = s && !this.nearIdx.includes(i) ? 1 : 0;
      info[i * 3 + 2] = s && this.scaleIn ? this.clock : -1;
      this.show.addUpdateRange(i, 1);
      this.info.addUpdateRange(i * 3 + 2, 1);
      changed = true;
      if (s && this.scaleIn) this.lastBorn = this.clock;
    }
    if (changed) this.show.needsUpdate = this.info.needsUpdate = true;
    return changed;
  }

  /** Shows or hides the crowd with a 400 ms dissolve (instant when asked). */
  setShown(on: boolean, instant = false) {
    this.target = on ? 1 : 0;
    if (instant) this.fade = this.target;
    this.applyFade();
  }

  /**
   * Swaps the sold seats within 25 m of `eye` (in front of `dir`) to 3D people; eye = null restores the
   * impostors.
   */
  setNear(eye: THREE.Vector3 | null, dir: THREE.Vector3 | null) {
    const show = this.show.array as Float32Array;
    for (const i of this.nearIdx) {
      show[i] = this.sold[i];
      this.show.addUpdateRange(i, 1);
    }
    this.nearIdx = [];
    if (eye) {
      const p = this.layout.positions,
        n = this.layout.bowlSeatCount,
        r2 = NEAR_RADIUS * NEAR_RADIUS;
      const cand: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        if (!this.sold[i]) continue;
        const dx = p[i * 3] - eye.x,
          dy = p[i * 3 + 1] - eye.y,
          dz = p[i * 3 + 2] - eye.z,
          d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2 || (dir && dx * dir.x + dz * dir.z < -2)) continue;
        cand.push([i, d2]);
      }
      cand.sort((a, b) => a[1] - b[1]);
      this.nearIdx = cand.slice(0, NEAR_MAX).map((c) => c[0]);
    }
    const g = this.near.geometry,
      shirt = g.getAttribute('aShirt').array as Float32Array,
      skin = g.getAttribute('aSkin').array as Float32Array,
      hair = g.getAttribute('aHair').array as Float32Array,
      pants = g.getAttribute('aPants').array as Float32Array,
      meta = g.getAttribute('aMeta').array as Float32Array,
      group = g.getAttribute('aGroup').array as Float32Array,
      m = new THREE.Matrix4(),
      c = new THREE.Color(),
      info = this.info.array as Float32Array;
    this.nearIdx.forEach((i, k) => {
      show[i] = 0;
      this.show.addUpdateRange(i, 1);
      m.fromArray(seatMatrix(this.layout, i));
      this.near.setMatrixAt(k, m);
      const v = this.variants[this.variantOf[i]];
      c.set(v.shirt).toArray(shirt, k * 3);
      c.set(v.skin).toArray(skin, k * 3);
      c.set(v.cap ? v.team : v.hair).toArray(hair, k * 3);
      c.set(v.pants).toArray(pants, k * 3);
      meta.set([this.layout.planS[i], info[i * 3 + 1], info[i * 3 + 2]], k * 3);
      group[k] = v.group === 'home' ? 0 : v.group === 'away' ? 1 : 2;
    });
    this.near.count = this.nearIdx.length;
    this.near.instanceMatrix.needsUpdate = true;
    for (const name of ['aShirt', 'aSkin', 'aHair', 'aPants', 'aMeta', 'aGroup'])
      g.getAttribute(name).needsUpdate = true;
    this.show.needsUpdate = true;
    this.applyFade();
  }

  /** Starts a Mexican wave that first sweeps through the stands across from `from` (a world point). */
  startWave(from: THREE.Vector3) {
    const s = planInverse(from.x, from.z).s;
    this.wave = { start: this.clock, from: s + P0 / 2 - 30, duration: (P0 * WAVE_LAPS) / WAVE_SPEED + 2 };
  }

  stopWave() {
    this.wave = null;
    this.u.uWaveAmp.value = 0;
  }

  /** A goal: the scoring side's fans (team 0 home, 1 away) jump with their arms up for a few seconds. */
  cheer(team: 0 | 1) {
    this.cheering = { start: this.clock, team };
    this.u.uCheerTeam.value = team;
  }

  /**
   * Advances the clock, the fade, the wave and scale-ins. `idle` turns the idle animation on. Returns true
   * while something animates that needs frames (fade, wave, scale-in).
   */
  update(dt: number, idle: boolean): boolean {
    this.clock += dt;
    this.u.uClock.value = this.clock;
    this.u.uIdle.value = idle ? 1 : 0;
    let busy = false;
    if (this.fade !== this.target) {
      const step = dt / FADE_S;
      this.fade = this.target > this.fade ? Math.min(1, this.fade + step) : Math.max(0, this.fade - step);
      busy = true;
    }
    if (this.wave) {
      const t = this.clock - this.wave.start,
        dur = this.wave.duration;
      if (t >= dur) this.stopWave();
      else {
        this.u.uWaveFront.value = (((this.wave.from + t * WAVE_SPEED) % P0) + P0) % P0;
        this.u.uWaveAmp.value = Math.min(1, t / 1, (dur - t) / 1.5);
        busy = true;
      }
    }
    if (this.cheering) {
      // Up in 0.4 s, on for a while, down over 1.5 s.
      const t = this.clock - this.cheering.start;
      if (t >= CHEER_S) {
        this.cheering = null;
        this.u.uCheer.value = 0;
      } else {
        this.u.uCheer.value = Math.min(1, t / 0.4, (CHEER_S - t) / 1.5);
        busy = true;
      }
    }
    if (this.clock - this.lastBorn < SCALE_IN_S + 0.05) busy = true;
    this.applyFade();
    return busy && this.fade > 0;
  }

  /** Snapshots: High shows the crowd (impostors only), other tiers hide it. Call `restore` afterwards. */
  forSnapshot(withCrowd: boolean) {
    const swapped = withCrowd && this.nearIdx.length > 0;
    this.snapshotState = { fade: this.fade, swapped };
    this.far.visible = withCrowd;
    this.near.visible = false;
    this.u.uFade.value = 1;
    if (swapped) {
      // The near people belong to the main camera: the snapshot shows impostors in their seats.
      const show = this.show.array as Float32Array;
      for (const i of this.nearIdx) show[i] = this.sold[i];
      this.show.needsUpdate = true;
    }
  }

  restore() {
    const st = this.snapshotState;
    if (!st) return;
    this.snapshotState = null;
    if (st.swapped) {
      const show = this.show.array as Float32Array;
      for (const i of this.nearIdx) show[i] = 0;
      this.show.needsUpdate = true;
    }
    this.fade = st.fade;
    this.applyFade();
  }

  private applyFade() {
    this.u.uFade.value = this.fade;
    this.far.visible = this.fade > 0;
    this.near.visible = this.fade > 0 && this.near.count > 0;
  }

  dispose() {
    this.far.geometry.dispose();
    (this.far.material as THREE.Material).dispose();
    this.near.geometry.dispose();
    (this.near.material as THREE.Material).dispose();
    this.near.dispose();
    this.atlas.dispose();
  }
}

/** The seat's matrix (seat-data.ts: x = (-nz, 0, nx), y = up, z = towards the pitch). */
function seatMatrix(layout: StadiumLayout, i: number): number[] {
  const nx = layout.normals[i * 2],
    nz = layout.normals[i * 2 + 1],
    p = layout.positions;
  return [-nz, 0, nx, 0, 0, 1, 0, 0, -nx, 0, -nz, 0, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], 1];
}
