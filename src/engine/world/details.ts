/**
 * Phase 6 details (PROMPT.md 6.6, items 5 to 8): the procedural pitch, goal nets, corner flags and the
 * flags on the roof ring, the roof's tension cables, glass balustrades on the middle and upper tier fronts,
 * and yellow nosings on the aisle steps.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StadiumLayout } from '@/lib/stadium';
import { P0, planAt } from '@/lib/stadium/plan';
import { ROOF, TIERS } from '@/lib/stadium/params';
import { GLASS_PARAPET_TOP, LOOP, PARAPET_TOP, sweep } from './geometry';
import { addFlagWave, patchMaterial, type AmbientUniforms } from './shading';
import { netTexture, type DrawnTexture } from './textures';

/* ---------------- pitch ---------------- */

const PITCH_FUNCTIONS = /* glsl */ `
uniform vec3 uGrassBase;
uniform vec3 uGrassA;
uniform vec3 uGrassB;
uniform vec3 uLine;
varying vec2 vPitch;
float pHash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float pNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), u.x),
             mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
/* Integral of the stripe pattern (1 on odd stripes), for box filtering. */
float sqInt(float t) { return floor(t * 0.5) + max(fract(t * 0.5) * 2.0 - 1.0, 0.0); }
float stripes(float x, float w) {
  w = max(w, 1e-4);
  return (sqInt(x + 0.5 * w) - sqInt(x - 0.5 * w)) / w;
}
/* Share of a pixel (footprint pw) covered by a line of half width hw whose centre is d away. */
float lineCov(float d, float hw, float pw) {
  return clamp((min(hw, d + 0.5 * pw) - max(-hw, d - 0.5 * pw)) / pw, 0.0, 1.0);
}
float discCov(float d, float r, float pw) { return clamp((r - d) / pw + 0.5, 0.0, 1.0); }
vec3 pitchColor(vec2 p) {
  float pw = max(length(fwidth(p)), 1e-4);
  vec2 a = abs(p);
  vec3 c = uGrassBase;
  // Mowing stripes, 5.25 m wide (20 across the pitch), filtered so they never shimmer from far away.
  float st = stripes((p.x + 52.5) / 5.25, pw / 5.25);
  if (a.x <= 52.5 && a.y <= 34.0) c = mix(uGrassA, uGrassB, st);
  // Noise at three scales; the fine grain fades once a pixel covers more than it.
  float n1 = pNoise(p * 0.33);
  float n2 = pNoise(p * 1.9 + 13.0);
  float n3 = pNoise(p * 11.0 + 41.0);
  float f2 = 1.0 - clamp(pw * 1.2, 0.0, 1.0);
  float f3 = 1.0 - clamp(pw * 7.0, 0.0, 1.0);
  c *= 1.0 + (n1 - 0.5) * 0.12 + (n2 - 0.5) * 0.10 * f2 + (n3 - 0.5) * 0.12 * f3;
  // Line markings (12 cm), as distances: crisp at any zoom.
  vec2 q = vec2(a.x, p.y);
  float d = abs(sdBox(p, vec2(52.5, 34.0)));
  d = min(d, length(vec2(p.x, max(a.y - 34.0, 0.0))));
  d = min(d, abs(length(p) - 9.15));
  d = min(d, abs(sdBox(q - vec2(44.25, 0.0), vec2(8.25, 20.16))));
  d = min(d, abs(sdBox(q - vec2(49.75, 0.0), vec2(2.75, 9.16))));
  if (a.x < 36.0) d = min(d, abs(length(q - vec2(41.5, 0.0)) - 9.15));
  vec2 cq = vec2(52.5, 34.0) - a;
  if (cq.x > 0.0 && cq.y > 0.0) d = min(d, abs(length(cq) - 1.0));
  float cov = lineCov(d, 0.06, pw);
  cov = max(cov, discCov(length(p), 0.22, pw));
  cov = max(cov, discCov(length(q - vec2(41.5, 0.0)), 0.22, pw));
  return mix(c, uLine, cov * 0.92);
}`;

/** The pitch and its surround: stripes, noise and markings computed per pixel (sharper than a texture). */
export function pitchMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
  const colors = {
    uGrassBase: { value: new THREE.Color('#3c7a2b') },
    uGrassA: { value: new THREE.Color('#41882e') },
    uGrassB: { value: new THREE.Color('#4a9634') },
    uLine: { value: new THREE.Color('#f3f5ee') },
  };
  patchMaterial(mat, 'pitch', (sh) => {
    Object.assign(sh.uniforms, colors);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPitch;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPitch = position.xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${PITCH_FUNCTIONS}`)
      .replace('#include <map_fragment>', 'diffuseColor.rgb *= pitchColor(vPitch);');
  });
  return mat;
}

/* ---------------- goal nets ---------------- */

/**
 * Nets behind both goals (top, back and sides), textured with a net. Alpha-tested, and also blended: with
 * mipmaps, a pure 0.5 alpha test makes a net vanish beyond a few metres (the twine averages out).
 */
export function goalNets(): { mesh: THREE.Mesh; texture: DrawnTexture } {
  const net = netTexture();
  const pos: number[] = [],
    uv: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => {
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      uv.push(p[3], p[4]);
    }
  };
  const slope = Math.hypot(2, 2.44 - 1.6);
  for (const s of [-1, 1]) {
    const g = 52.5 * s,
      b = g + 2 * s,
      zs = [-3.66, 3.66];
    // top: crossbar down to the back bar (u along the goal, v down the slope)
    tri([g, 2.44, zs[0], 0, 0], [g, 2.44, zs[1], 7.32, 0], [b, 1.6, zs[1], 7.32, slope]);
    tri([g, 2.44, zs[0], 0, 0], [b, 1.6, zs[1], 7.32, slope], [b, 1.6, zs[0], 0, slope]);
    // back
    tri([b, 1.6, zs[0], 0, 1.6], [b, 1.6, zs[1], 7.32, 1.6], [b, 0, zs[1], 7.32, 0]);
    tri([b, 1.6, zs[0], 0, 1.6], [b, 0, zs[1], 7.32, 0], [b, 0, zs[0], 0, 0]);
    // sides
    for (const z of zs) {
      tri([g, 0, z, 0, 0], [g, 2.44, z, 0, 2.44], [b, 1.6, z, 2, 1.6]);
      tri([g, 0, z, 0, 0], [b, 1.6, z, 2, 1.6], [b, 0, z, 2, 0]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: '#f4f4f0',
    map: net.texture,
    roughness: 0.85,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return { mesh, texture: net };
}

/* ---------------- flags ---------------- */

/** Flags fly downwind (towards the north-east). */
const WIND = new THREE.Vector3(0.8, 0, -0.6).normalize();

/** Corner flags and a ring of flags on the roof's outer edge, waving in the vertex shader. */
export function buildFlags(u: AmbientUniforms, colors: string[]): THREE.Group {
  const group = new THREE.Group();
  type Pole = {
    x: number;
    y: number;
    z: number;
    h: number;
    r: number;
    fw: number;
    fh: number;
    color: string;
  };
  const poles: Pole[] = [];
  const P = { x: 0, z: 0, nx: 0, nz: 0 };
  const RING = 28;
  const dEdge = ROOF.d1 - 1.2,
    yEdge = ROOF.yOut + ((ROOF.yIn - ROOF.yOut) * 1.2) / (ROOF.d1 - ROOF.d0);
  for (let k = 0; k < RING; k++) {
    planAt(((k + 0.5) / RING) * P0, dEdge, P);
    poles.push({
      x: P.x,
      y: yEdge,
      z: P.z,
      h: 6.5,
      r: 0.07,
      fw: 3.2,
      fh: 2,
      color: colors[k % colors.length],
    });
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      poles.push({ x: 52.5 * sx, y: 0, z: 34 * sz, h: 1.55, r: 0.02, fw: 0.5, fh: 0.36, color: '#ffd23f' });

  const poleMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ color: '#d9dcdf', roughness: 0.4, metalness: 0.5 }),
    poles.length,
  );
  const flagGeo = new THREE.PlaneGeometry(1, 1, 10, 4).translate(0.5, 0.5, 0);
  const flagMat = new THREE.MeshStandardMaterial({ roughness: 0.75, side: THREE.DoubleSide });
  addFlagWave(flagMat, u);
  const flagMesh = new THREE.InstancedMesh(flagGeo, flagMat, poles.length);
  const m = new THREE.Matrix4(),
    side = new THREE.Vector3(-WIND.z, 0, WIND.x),
    up = new THREE.Vector3(0, 1, 0),
    c = new THREE.Color();
  poles.forEach((p, i) => {
    m.makeScale(p.r, p.h, p.r).setPosition(p.x, p.y, p.z);
    poleMesh.setMatrixAt(i, m);
    m.makeBasis(
      WIND.clone().multiplyScalar(p.fw),
      up.clone().multiplyScalar(p.fh),
      side.clone().multiplyScalar(p.fh),
    ).setPosition(p.x + WIND.x * p.r, p.y + p.h - p.fh - 0.05, p.z + WIND.z * p.r);
    flagMesh.setMatrixAt(i, m);
    flagMesh.setColorAt(i, c.set(p.color));
  });
  for (const mesh of [poleMesh, flagMesh]) {
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/* ---------------- roof ---------------- */

/** Tension cables on top of the membrane: radial cables plus two rings (line segments). */
export function roofCables(): THREE.LineSegments {
  const pts: number[] = [];
  const A = { x: 0, z: 0, nx: 0, nz: 0 },
    B = { x: 0, z: 0, nx: 0, nz: 0 };
  const lift = 0.12,
    // the membrane is straight from (d0, yIn) to (d1, yOut)
    yAt = (d: number) => ROOF.yIn + ((ROOF.yOut - ROOF.yIn) * (d - ROOF.d0)) / (ROOF.d1 - ROOF.d0) + lift;
  const d0 = ROOF.d0 + 0.4,
    d1 = ROOF.d1 - 0.4;
  const N = 88;
  for (let k = 0; k < N; k++) {
    const s = ((k + 0.5) / N) * P0;
    planAt(s, d0, A);
    planAt(s, d1, B);
    pts.push(A.x, yAt(d0), A.z, B.x, yAt(d1), B.z);
  }
  for (const d of [d0, (d0 + d1) / 2]) {
    for (let i = 0; i < LOOP.length - 1; i++) {
      planAt(LOOP[i], d, A);
      planAt(LOOP[i + 1], d, B);
      pts.push(A.x, yAt(d), A.z, B.x, yAt(d), B.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#7d858c' }));
}

/* ---------------- tier fronts and aisles ---------------- */

/** Glass balustrades with a steel top rail along the fronts of the middle and upper tiers. */
export function balustrades(): THREE.Group {
  const glass: THREE.BufferGeometry[] = [],
    rails: THREE.BufferGeometry[] = [];
  for (const t of TIERS) {
    if (t.key === 'L') continue;
    const d = t.d0 - 0.7 + 0.15,
      top = t.y0 + PARAPET_TOP;
    glass.push(
      sweep([
        { d, y: t.y0 + GLASS_PARAPET_TOP },
        { d, y: top },
      ]),
    );
    rails.push(
      sweep([
        { d: d + 0.045, y: top - 0.03 },
        { d: d + 0.045, y: top + 0.03 },
        { d: d - 0.045, y: top + 0.03 },
        { d: d - 0.045, y: top - 0.03 },
      ]),
    );
  }
  const glassGeo = mergeGeometries(glass, false),
    railGeo = mergeGeometries(rails, false);
  for (const g of [...glass, ...rails]) g.dispose();
  const group = new THREE.Group();
  const pane = new THREE.Mesh(
    glassGeo,
    new THREE.MeshStandardMaterial({
      color: '#d6e6ec',
      transparent: true,
      opacity: 0.2,
      roughness: 0.05,
      metalness: 0,
      envMapIntensity: 1.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  pane.renderOrder = 1;
  const rail = new THREE.Mesh(
    railGeo,
    new THREE.MeshStandardMaterial({ color: '#c9cdd1', roughness: 0.32, metalness: 0.65 }),
  );
  rail.castShadow = rail.receiveShadow = true;
  group.add(pane, rail);
  return group;
}

/** Thin yellow nosings on the aisle steps: the front edge of every tread at every block boundary. */
export function aisleNosings(layout: StadiumLayout): THREE.InstancedMesh {
  const spots: { s: number; t: (typeof TIERS)[number] }[] = [];
  for (const b of layout.blocks) spots.push({ s: b.sa, t: TIERS[b.tier] });
  let n = 0;
  for (const p of spots) n += p.t.rows - 1;
  const geo = new THREE.BoxGeometry(1.0, 0.022, 0.06);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.6 }),
    Math.max(1, n),
  );
  const P = { x: 0, z: 0, nx: 0, nz: 0 },
    m = new THREE.Matrix4(),
    ax = new THREE.Vector3(),
    ay = new THREE.Vector3(0, 1, 0),
    az = new THREE.Vector3();
  let k = 0;
  for (const { s, t } of spots) {
    for (let r = 1; r < t.rows; r++) {
      planAt(s, t.d0 + r * t.tread + 0.03, P);
      ax.set(-P.nz, 0, P.nx);
      az.set(-P.nx, 0, -P.nz);
      m.makeBasis(ax, ay, az).setPosition(P.x, t.y0 + r * t.riser + 0.011, P.z);
      mesh.setMatrixAt(k++, m);
    }
  }
  mesh.count = k;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
