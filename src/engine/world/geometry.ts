/**
 * Geometry builders ported from the prototype (world.js): the profile sweep used for tiers, the skybox
 * band, roof and facade (hard-edged normals, UVs in metres), the 24-triangle seat, the molded close-up
 * seat, rounded boxes, and the wheelchair-space platform.
 */
import * as THREE from 'three';
import { loopSamples, planAt, realLen, type PlanPoint } from '@/lib/stadium/plan';
import type { TierDef } from '@/lib/stadium/params';

const PI = Math.PI;

export const PAL = {
  tread: '#bdb8ae',
  riser: '#8f8b84',
  wall: '#3d4944',
  pTop: '#dcd9d2',
  pBack: '#a29e95',
  fascia: '#22272e',
  soffit: '#aeaca7',
  back: '#4b4e53',
  roofEdge: '#c9ccd0',
  roofUnder: '#e4e4e1',
  ring: '#2b2f35',
} as const;

/** A profile point: offset d, height y, vertex colour c, and material group m of the segment after it. */
export interface ProfilePoint {
  d: number;
  y: number;
  c?: string;
  m?: number;
}

/** Loop samples every 0.04 rad on the corners (shared by all sweeps). */
export const LOOP = loopSamples(0.04);

/** Sweeps a 2D profile (d, y) around the whole bowl. */
export function sweep(
  profile: readonly ProfilePoint[],
  samples: readonly number[] = LOOP,
): THREE.BufferGeometry {
  const S = samples,
    pos: number[] = [],
    nor: number[] = [],
    colr: number[] = [],
    uvs: number[] = [];
  const groups = new Map<number, number[]>(),
    P: PlanPoint = { x: 0, z: 0, nx: 0, nz: 0 },
    Q: PlanPoint = { x: 0, z: 0, nx: 0, nz: 0 };
  const col = new THREE.Color();
  let v = 0;
  for (let j = 0; j < profile.length - 1; j++) {
    const a = profile[j],
      b = profile[j + 1],
      dd = b.d - a.d,
      dy = b.y - a.y,
      len = Math.hypot(dd, dy);
    if (len < 1e-5) continue;
    const nd = -dy / len,
      ny = dd / len,
      m = a.m || 0;
    col.set(a.c || '#9a968f');
    if (!groups.has(m)) groups.set(m, []);
    const idx = groups.get(m)!,
      base = v,
      dm = (a.d + b.d) / 2;
    let acc = 0,
      prev = S[0];
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (i > 0) acc += realLen(prev, s, dm);
      prev = s;
      planAt(s, a.d, P);
      planAt(s, b.d, Q);
      pos.push(P.x, a.y, P.z, Q.x, b.y, Q.z);
      const nx = P.nx * nd,
        nz = P.nz * nd;
      nor.push(nx, ny, nz, nx, ny, nz);
      colr.push(col.r, col.g, col.b, col.r, col.g, col.b);
      uvs.push(acc, 0, acc, 1);
      v += 2;
    }
    for (let i = 0; i < S.length - 1; i++) {
      const i0 = base + i * 2;
      idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const index: number[] = [];
  let start = 0;
  for (const [m, list] of [...groups.entries()].sort((x, y) => x[0] - y[0])) {
    for (const k of list) index.push(k);
    g.addGroup(start, list.length, m);
    start += list.length;
  }
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/** Parapet heights above the first tread: 1.0 m (lower tier); 0.4 m on the middle and upper tiers, where a
 * glass balustrade continues it to 1.0 m (details.ts), so sightlines from the front rows are unchanged. */
export const PARAPET_TOP = 1.0;
export const GLASS_PARAPET_TOP = 0.4;

/** Cross-section of a tier: fascia (middle and upper), parapet, then tread and riser for every row. */
export function tierProfile(t: TierDef): ProfilePoint[] {
  const P: ProfilePoint[] = [],
    f = t.d0 - 0.7;
  if (t.key === 'L') P.push({ d: f, y: 0, c: PAL.wall });
  else {
    P.push({ d: t.dEnd, y: t.yTop - 1.4, c: PAL.soffit });
    P.push({ d: f, y: t.y0 - 2.6, c: PAL.fascia });
    P.push({ d: f, y: t.y0 - 2.0, c: '#ffffff', m: 1 });
    P.push({ d: f, y: t.y0 - 0.85, c: PAL.fascia });
  }
  const top = t.key === 'L' ? PARAPET_TOP : GLASS_PARAPET_TOP;
  P.push({ d: f, y: t.y0 + top, c: PAL.pTop });
  P.push({ d: f + 0.3, y: t.y0 + top, c: PAL.pBack });
  P.push({ d: f + 0.3, y: t.y0, c: PAL.tread });
  for (let r = 0; r < t.rows; r++) {
    const y = t.y0 + r * t.riser,
      dB = t.d0 + (r + 1) * t.tread,
      last = r === t.rows - 1;
    P.push({ d: dB, y, c: last ? PAL.back : PAL.riser });
    P.push({ d: dB, y: last ? y + t.back : y + t.riser, c: PAL.tread });
  }
  return P;
}

/** The far seat: 24 triangles (pan, tilted back, pedestal). Front faces +z. */
export function seatGeometry(): THREE.BufferGeometry {
  const P: number[] = [],
    N: number[] = [];
  const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, want: THREE.Vector3) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    if (n.dot(want) < 0) {
      [b, d] = [d, b];
      n.negate();
    }
    for (const p of [a, b, c, a, c, d]) {
      P.push(p.x, p.y, p.z);
      N.push(n.x, n.y, n.z);
    }
  }
  type Face = 'px' | 'nx' | 'py' | 'pz' | 'nz';
  function box(
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    dp: number,
    faces: Face[],
    tilt = 0,
  ) {
    const c = Math.cos(tilt),
      s = Math.sin(tilt);
    const rot = (x: number, y: number, z: number) => v3(cx + x, cy + y * c - z * s, cz + y * s + z * c);
    const nrm = (x: number, y: number, z: number) => v3(x, y * c - z * s, y * s + z * c);
    const X = w / 2,
      Y = h / 2,
      Z = dp / 2;
    const F: Record<Face, THREE.Vector3[]> = {
      px: [rot(X, -Y, -Z), rot(X, Y, -Z), rot(X, Y, Z), rot(X, -Y, Z), nrm(1, 0, 0)],
      nx: [rot(-X, -Y, -Z), rot(-X, -Y, Z), rot(-X, Y, Z), rot(-X, Y, -Z), nrm(-1, 0, 0)],
      py: [rot(-X, Y, -Z), rot(-X, Y, Z), rot(X, Y, Z), rot(X, Y, -Z), nrm(0, 1, 0)],
      pz: [rot(-X, -Y, Z), rot(X, -Y, Z), rot(X, Y, Z), rot(-X, Y, Z), nrm(0, 0, 1)],
      nz: [rot(-X, -Y, -Z), rot(-X, Y, -Z), rot(X, Y, -Z), rot(X, -Y, -Z), nrm(0, 0, -1)],
    };
    for (const k of faces) {
      const f = F[k];
      quad(f[0], f[1], f[2], f[3], f[4]);
    }
  }
  box(0, 0.43, 0.04, 0.46, 0.06, 0.42, ['py', 'pz', 'px', 'nx']); // pan
  box(0, 0.69, -0.2, 0.46, 0.44, 0.05, ['pz', 'nz', 'py', 'px', 'nx'], -0.15); // back
  box(0, 0.2, -0.08, 0.07, 0.4, 0.07, ['pz', 'px', 'nx']); // pedestal
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}

/** Merges geometries into one non-indexed geometry (positions and normals only). */
export function mergeFlat(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const P: number[] = [],
    N: number[] = [];
  for (let g of geos) {
    if (g.index) g = g.toNonIndexed();
    P.push(...(g.attributes.position.array as Float32Array));
    N.push(...(g.attributes.normal.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return out;
}

/** The close-up seat: a molded shell on a leg. Swapped in for the seats nearest the camera. */
export function detailSeatGeometry(): THREE.BufferGeometry {
  const pts = [
    [0.25, 0.446],
    [0.16, 0.452],
    [0.02, 0.446],
    [-0.09, 0.44],
    [-0.15, 0.462],
    [-0.183, 0.53],
    [-0.2, 0.66],
    [-0.212, 0.8],
    [-0.222, 0.868],
    [-0.24, 0.882],
    [-0.258, 0.87],
    [-0.252, 0.79],
    [-0.238, 0.65],
    [-0.218, 0.53],
    [-0.188, 0.455],
    [-0.13, 0.41],
    [0.02, 0.41],
    [0.2, 0.418],
    [0.262, 0.43],
  ];
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  sh.splineThru(pts.slice(1).map((p) => new THREE.Vector2(p[0], p[1])));
  sh.closePath();
  const W = 0.4,
    shell = new THREE.ExtrudeGeometry(sh, {
      depth: W,
      bevelEnabled: true,
      bevelThickness: 0.016,
      bevelSize: 0.01,
      bevelSegments: 2,
      curveSegments: 2,
    });
  shell.rotateY(-PI / 2);
  shell.translate(W / 2, 0, 0);
  const leg = new THREE.BoxGeometry(0.06, 0.42, 0.06);
  leg.translate(0, 0.21, -0.06);
  const g = mergeFlat([shell, leg]);
  g.computeBoundingSphere();
  shell.dispose();
  leg.dispose();
  return g;
}

/** A box with rounded edges (used for the lounge chairs). Centred on the origin. */
export function roundedBox(w: number, h: number, d: number, r: number): THREE.ExtrudeGeometry {
  const b = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001),
    iw = w / 2 - b,
    ih = h / 2 - b,
    c = Math.min(b, iw, ih) * 0.9;
  const s = new THREE.Shape();
  s.moveTo(-iw + c, -ih);
  s.lineTo(iw - c, -ih);
  s.quadraticCurveTo(iw, -ih, iw, -ih + c);
  s.lineTo(iw, ih - c);
  s.quadraticCurveTo(iw, ih, iw - c, ih);
  s.lineTo(-iw + c, ih);
  s.quadraticCurveTo(-iw, ih, -iw, ih - c);
  s.lineTo(-iw, -ih + c);
  s.quadraticCurveTo(-iw, -ih, -iw + c, -ih);
  const depth = Math.max(0.002, d - 2 * b);
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 3,
    curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Wheelchair space: a low platform the width of a seat, a little deeper than the tread allows a chair. */
export function wheelchairPlatformGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.46, 0.05, 0.62);
  g.translate(0, 0.025, 0.02);
  return g;
}

/** The pictogram decal that lies on the platform (UVs cover the top face). */
export function wheelchairDecalGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(0.38, 0.38);
  g.rotateX(-PI / 2);
  g.translate(0, 0.052, 0.02);
  return g;
}
