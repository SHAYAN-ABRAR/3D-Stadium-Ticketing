/**
 * The park around the stadium, ported from the prototype (world.js): tree and car placement, the painted
 * ground (roads, car parks, paths, lake, plaza) and the pitch markings. No three.js and no DOM: the
 * drawing functions take any 2D context, so they run on an OffscreenCanvas in the build worker or on a
 * normal canvas as a fallback. Painted shadows go to a separate mask (pitfall 14) so their strength can
 * fade with the light while the sun's azimuth stays fixed.
 */
import { CX, CZ, L0, P0, planAt, R0, realLen, sAtLen, W0, type PlanPoint } from '@/lib/stadium/plan';
import { clamp, noise2, rng } from '@/lib/stadium/random';
import { METRO, ROUNDABOUT } from './city-data';

const PI = Math.PI,
  TAU = PI * 2;

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The painted ground square (metres) and its canvas size (pixels). The city starts just beyond it. */
export const GROUND = 860;
export const GROUND_PX = 2048;
const GK = GROUND_PX / GROUND;
const gx = (x: number) => (x + GROUND / 2) * GK;
const gz = (z: number) => (z + GROUND / 2) * GK;

/** Fixed sun direction (towards the sun): south-west, about 22 degrees high. Presets keep this azimuth. */
export const SUN_DIR: readonly [number, number, number] = (() => {
  const v = [-0.759, 0.375, 0.532];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l] as const;
})();

export const RING_D = 212;
export const RING_HW = 7;
export const LOTS: readonly (readonly [number, number, number, number])[] = [
  [176, -94, 254, -12],
  [176, 12, 254, 94],
  [-254, -94, -176, -12],
  [-254, 12, -176, 94],
];
export const LAKE = (() => {
  const pts: [number, number][] = [],
    cx = -62,
    cz = -192;
  for (let k = 0; k < 56; k++) {
    const a = (k / 56) * TAU,
      f = 1 + 0.16 * Math.sin(3 * a + 0.7) + 0.09 * Math.sin(5 * a + 2.1);
    pts.push([cx + Math.cos(a) * 56 * f, cz + Math.sin(a) * 30 * f]);
  }
  return { cx, cz, pts };
})();
const PATHS: readonly (readonly [number, number][])[] = [
  [
    [8, -137],
    [16, -168],
    [-6, -150 - 70],
    [10, -246],
  ],
  [
    [-6, 137],
    [-22, 178],
    [6, 214],
    [-4, 246],
  ],
  [
    [120, -98],
    [150, -150],
    [204, -184],
  ],
  [
    [-120, -98],
    [-160, -134],
    [-204, -184],
  ],
  [
    [120, 98],
    [152, 152],
    [204, 184],
  ],
  [
    [-120, 98],
    [-160, 148],
    [-204, 184],
  ],
  [
    [156, 0],
    [265, 0],
  ],
  [
    [-156, 0],
    [-265, 0],
  ],
];

function inPoly(
  px: number,
  pz: number,
  pts: readonly [number, number][],
  cx: number,
  cz: number,
  grow: number,
): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = cx + (pts[i][0] - cx) * grow,
      zi = cz + (pts[i][1] - cz) * grow,
      xj = cx + (pts[j][0] - cx) * grow,
      zj = cz + (pts[j][1] - cz) * grow;
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function distSeg(px: number, pz: number, a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}
function nearPath(x: number, z: number, m: number): boolean {
  for (const p of PATHS)
    for (let i = 0; i < p.length - 1; i++) if (distSeg(x, z, p[i], p[i + 1]) < m) return true;
  return false;
}
function inLot(x: number, z: number, m: number): boolean {
  for (const l of LOTS) if (x > l[0] - m && x < l[2] + m && z > l[1] - m && z < l[3] + m) return true;
  return false;
}
function offsetOf(x: number, z: number): number {
  const px = clamp(x, -CX, CX),
    pz = clamp(z, -CZ, CZ);
  return Math.hypot(x - px, z - pz) - R0;
}
/** The station's plaza under the viaduct (stairs come down here). */
const STATION_PLAZA = {
  x0: METRO.x - 34,
  x1: METRO.x + 34,
  z0: METRO.stationZ - METRO.stationLength / 2 - 18,
  z1: METRO.stationZ + METRO.stationLength / 2 + 18,
};
/** Begum Rokeya Sarani under the viaduct, the Mirpur 10 roundabout and the station plaza stay clear of trees. */
function onMetroGround(x: number, z: number, m: number): boolean {
  if (Math.abs(x - METRO.x) < METRO.roadW / 2 + m) return true;
  if (Math.hypot(x - ROUNDABOUT.x, z - ROUNDABOUT.z) < ROUNDABOUT.r + 10 + m) return true;
  return (
    x > STATION_PLAZA.x0 - m &&
    x < STATION_PLAZA.x1 + m &&
    z > STATION_PLAZA.z0 - m &&
    z < STATION_PLAZA.z1 + m
  );
}

export interface Tree {
  x: number;
  z: number;
  h: number;
  r: number;
  conifer: boolean;
  tint: number;
}

export function placeTrees(): Tree[] {
  const r = rng(4242),
    trees: Tree[] = [],
    P: PlanPoint = { x: 0, z: 0, nx: 0, nz: 0 };
  const add = (x: number, z: number, kind: 'c' | 'd', scale?: number) => {
    if (Math.abs(x) > GROUND / 2 - 10 || Math.abs(z) > GROUND / 2 - 10) return;
    if (onMetroGround(x, z, 5)) return;
    const conifer = kind === 'c';
    const h = conifer ? 13 + r() * 8 : (9 + r() * 6) * (scale || 1),
      rad = conifer ? 3 + r() * 1.5 : (3.6 + r() * 2.4) * (scale || 1);
    trees.push({ x, z, h, r: rad, conifer, tint: r() });
  };
  for (let s = 0, n = Math.floor(realLen(0, P0, 90) / 15); s < n; s++) {
    planAt(sAtLen(0, (s + 0.5) * 15, 90), 90, P);
    if (!nearPath(P.x, P.z, 6)) add(P.x, P.z, 'd', 0.7);
  }
  for (const d of [199, 226])
    for (let s = 0, n = Math.floor(realLen(0, P0, d) / 17); s < n; s++) {
      planAt(sAtLen(0, (s + 0.5) * 17, d), d, P);
      if (!nearPath(P.x, P.z, 6) && !inLot(P.x, P.z, 4) && Math.abs(P.x) > 12 && Math.abs(P.z) > 12)
        add(P.x, P.z, 'd', 0.85);
    }
  for (let i = 0; i < 9000 && trees.length < 1300; i++) {
    const x = (r() - 0.5) * 560,
      z = (r() - 0.5) * 520,
      d = offsetOf(x, z);
    if (d < 100 || d > 196) continue;
    if (noise2(x * 0.018 + 3, z * 0.018) < 0.5) continue;
    if (inLot(x, z, 8) || nearPath(x, z, 5) || inPoly(x, z, LAKE.pts, LAKE.cx, LAKE.cz, 1.25)) continue;
    add(x, z, r() < 0.22 ? 'c' : 'd');
  }
  for (let i = 0; i < 26000 && trees.length < 2600; i++) {
    const x = (r() - 0.5) * GROUND,
      z = (r() - 0.5) * GROUND,
      d = offsetOf(x, z);
    if (d < 234) continue;
    if (noise2(x * 0.0065, z * 0.0065 + 9) < 0.5) continue;
    if (Math.abs(x) < 16 && z > 250) continue;
    if (Math.abs(z) < 16 && x > 270) continue;
    add(x, z, r() < 0.4 ? 'c' : 'd');
  }
  return trees;
}

export interface Car {
  x: number;
  z: number;
  rot: number;
  c: number;
}

export function placeCars(): Car[] {
  const r = rng(99),
    cars: Car[] = [];
  for (const l of LOTS) {
    const [x0, z0, x1, z1] = l;
    for (let zr = z0 + 4; zr + 10 <= z1 - 2; zr += 18) {
      for (const half of [0, 1]) {
        const zc = zr + 2.5 + half * 5;
        for (let xc = x0 + 3; xc <= x1 - 3; xc += 2.7)
          if (r() < 0.72)
            cars.push({
              x: xc + (r() - 0.5) * 0.3,
              z: zc + (r() - 0.5) * 0.4,
              rot: (half ? 0 : PI) + (r() - 0.5) * 0.06,
              c: r(),
            });
      }
    }
  }
  return cars;
}

/** Rounded-rectangle loop at offset d, in ground-canvas pixels. */
function rrPath(x: Ctx2D, d: number): void {
  const hx = L0 + d,
    hz = W0 + d,
    r = (R0 + d) * GK;
  x.beginPath();
  x.moveTo(gx(-CX), gz(-hz));
  x.lineTo(gx(CX), gz(-hz));
  x.arc(gx(CX), gz(-CZ), r, -PI / 2, 0);
  x.lineTo(gx(hx), gz(CZ));
  x.arc(gx(CX), gz(CZ), r, 0, PI / 2);
  x.lineTo(gx(-CX), gz(hz));
  x.arc(gx(-CX), gz(CZ), r, PI / 2, PI);
  x.lineTo(gx(-hx), gz(-CZ));
  x.arc(gx(-CX), gz(-CZ), r, PI, 1.5 * PI);
  x.closePath();
}

/** Mirrors the context vertically, for canvases uploaded as ImageBitmaps (which can't be flipped on upload). */
function maybeFlip(x: Ctx2D, h: number, flip: boolean): void {
  if (!flip) return;
  x.translate(0, h);
  x.scale(1, -1);
}

/** The ground: grass, roads, car parks, paths, lake and plaza (no shadows). Canvas: GROUND_PX square. */
export function drawGround(x: Ctx2D, flip: boolean): void {
  const w = GROUND_PX,
    h = GROUND_PX;
  x.save();
  maybeFlip(x, h, flip);
  const r = rng(17);
  x.fillStyle = '#5c8b3a';
  x.fillRect(0, 0, w, h);
  const greens = ['70,110,45', '88,128,52', '60,96,40', '104,140,62', '120,138,70'];
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = `rgba(${greens[(r() * greens.length) | 0]},${0.08 + r() * 0.1})`;
    x.beginPath();
    x.arc(r() * w, r() * h, (2 + r() * 22) * GK, 0, TAU);
    x.fill();
  }
  for (let i = 0; i < 2600; i++) {
    const px = r() * w,
      pz = r() * h,
      X = px / GK - GROUND / 2,
      Z = pz / GK - GROUND / 2;
    if (offsetOf(X, Z) < 236 || noise2(X * 0.0065, Z * 0.0065 + 9) < 0.48) continue;
    x.fillStyle = `rgba(40,66,30,${0.25 + r() * 0.2})`;
    x.beginPath();
    x.arc(px, pz, (6 + r() * 14) * GK, 0, TAU);
    x.fill();
  }
  // outer roads
  x.fillStyle = '#45484d';
  x.fillRect(gx(-7), gz(255), 14 * GK, h);
  x.fillRect(gx(270), gz(-7), w, 14 * GK);
  // Begum Rokeya Sarani under MRT Line 6: two carriageways either side of the piers' median, the station
  // plaza, and the Mirpur 10 roundabout where the east road meets it.
  {
    const half = METRO.roadW / 2;
    x.fillStyle = '#d9d6cc';
    x.fillRect(gx(METRO.x - half - 1.5), 0, (METRO.roadW + 3) * GK, h);
    x.fillStyle = '#45484d';
    x.fillRect(gx(METRO.x - half), 0, METRO.roadW * GK, h);
    x.fillStyle = '#b9b3a6';
    x.fillRect(gx(METRO.x - 3.5), 0, 7 * GK, h);
    x.strokeStyle = 'rgba(245,245,238,.8)';
    x.lineWidth = 0.3 * GK;
    x.setLineDash([3 * GK, 6 * GK]);
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(gx(METRO.x + s * (3.5 + 5.5)), 0);
      x.lineTo(gx(METRO.x + s * (3.5 + 5.5)), h);
      x.stroke();
    }
    x.setLineDash([]);
    const p = STATION_PLAZA;
    x.fillStyle = '#d3cdc0';
    x.fillRect(gx(p.x0), gz(p.z0), (p.x1 - p.x0) * GK, (p.z1 - p.z0) * GK);
    x.fillStyle = '#45484d';
    x.fillRect(gx(METRO.x - half), gz(p.z0), METRO.roadW * GK, (p.z1 - p.z0) * GK);
    x.fillStyle = '#b9b3a6';
    x.fillRect(gx(METRO.x - 3.5), gz(p.z0), 7 * GK, (p.z1 - p.z0) * GK);
    const R = ROUNDABOUT;
    x.beginPath();
    x.arc(gx(R.x), gz(R.z), (R.r + 1.5) * GK, 0, TAU);
    x.fillStyle = '#d9d6cc';
    x.fill();
    x.beginPath();
    x.arc(gx(R.x), gz(R.z), R.r * GK, 0, TAU);
    x.fillStyle = '#45484d';
    x.fill();
    x.beginPath();
    x.arc(gx(R.x), gz(R.z), (R.r - 11) * GK, 0, TAU);
    x.fillStyle = '#d9d6cc';
    x.fill();
    x.beginPath();
    x.arc(gx(R.x), gz(R.z), (R.r - 12) * GK, 0, TAU);
    x.fillStyle = '#5f9440';
    x.fill();
  }
  // ring road
  rrPath(x, RING_D);
  x.strokeStyle = '#d9d6cc';
  x.lineWidth = (RING_HW * 2 + 3) * GK;
  x.stroke();
  rrPath(x, RING_D);
  x.strokeStyle = '#45484d';
  x.lineWidth = RING_HW * 2 * GK;
  x.stroke();
  rrPath(x, RING_D);
  x.strokeStyle = 'rgba(245,245,238,.85)';
  x.lineWidth = 0.35 * GK;
  x.setLineDash([3 * GK, 4 * GK]);
  x.stroke();
  x.setLineDash([]);
  // parking lots
  for (const l of LOTS) {
    x.fillStyle = '#d9d6cc';
    x.fillRect(gx(l[0] - 2), gz(l[1] - 2), (l[2] - l[0] + 4) * GK, (l[3] - l[1] + 4) * GK);
    x.fillStyle = '#4a4d52';
    x.fillRect(gx(l[0]), gz(l[1]), (l[2] - l[0]) * GK, (l[3] - l[1]) * GK);
    x.strokeStyle = 'rgba(240,240,232,.8)';
    x.lineWidth = 0.25 * GK + 0.4;
    for (let zr = l[1] + 4; zr + 10 <= l[3] - 2; zr += 18)
      for (let xc = l[0] + 1.65; xc <= l[2] - 1.6; xc += 2.7) {
        x.beginPath();
        x.moveTo(gx(xc), gz(zr));
        x.lineTo(gx(xc), gz(zr + 10));
        x.stroke();
      }
    x.fillStyle = 'rgba(70,110,45,.95)';
    for (let zr = l[1] + 4; zr + 10 <= l[3] - 2; zr += 18)
      x.fillRect(gx(l[0] + 1), gz(zr + 4.75), (l[2] - l[0] - 2) * GK, 0.5 * GK + 0.5);
  }
  // footpaths
  const stroke = (pts: readonly [number, number][], wdt: number, col: string) => {
    x.strokeStyle = col;
    x.lineWidth = wdt * GK;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(gx(pts[0][0]), gz(pts[0][1]));
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2,
        mz = (pts[i][1] + pts[i + 1][1]) / 2;
      x.quadraticCurveTo(gx(pts[i][0]), gz(pts[i][1]), gx(mx), gz(mz));
    }
    const L = pts[pts.length - 1];
    x.lineTo(gx(L[0]), gz(L[1]));
    x.stroke();
  };
  for (const p of PATHS) {
    stroke(p, 5.5, '#bfb391');
    stroke(p, 4.2, '#ddd3b6');
  }
  // lake with a path around it
  const lakePath = (grow: number) => {
    x.beginPath();
    LAKE.pts.forEach((p, i) => {
      const X = gx(LAKE.cx + (p[0] - LAKE.cx) * grow),
        Z = gz(LAKE.cz + (p[1] - LAKE.cz) * grow);
      if (i) x.lineTo(X, Z);
      else x.moveTo(X, Z);
    });
    x.closePath();
  };
  lakePath(1.22);
  x.strokeStyle = '#ddd3b6';
  x.lineWidth = 3.6 * GK;
  x.stroke();
  lakePath(1.06);
  x.fillStyle = '#b8ad86';
  x.fill();
  lakePath(1.0);
  x.fillStyle = '#2d5f77';
  x.fill();
  // plaza
  rrPath(x, 96);
  x.fillStyle = '#cfc9bc';
  x.fill();
  rrPath(x, 95);
  x.fillStyle = '#d8d2c6';
  x.fill();
  x.save();
  rrPath(x, 95);
  x.clip();
  x.strokeStyle = 'rgba(150,142,128,.35)';
  x.lineWidth = 1;
  for (let m = -160; m <= 160; m += 6) {
    x.beginPath();
    x.moveTo(gx(m), gz(-160));
    x.lineTo(gx(m), gz(160));
    x.stroke();
    x.beginPath();
    x.moveTo(gx(-160), gz(m));
    x.lineTo(gx(160), gz(m));
    x.stroke();
  }
  x.restore();
  rrPath(x, 70);
  x.fillStyle = '#bdb6a8';
  x.fill();
  x.restore();
}

/**
 * Painted long shadows of trees and cars (the sun is low): white canvas, shadows darken it. The material
 * multiplies the ground by mix(1, mask, strength), so the shadows fade with the light.
 */
export function drawGroundShadows(
  x: Ctx2D,
  size: number,
  trees: readonly Tree[],
  cars: readonly Car[],
  flip: boolean,
): void {
  const k = size / GROUND;
  const sx = (v: number) => (v + GROUND / 2) * k;
  x.save();
  maybeFlip(x, size, flip);
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, size, size);
  const shX = -SUN_DIR[0],
    shZ = -SUN_DIR[2],
    shL = Math.hypot(shX, shZ);
  const sh = { x: shX / shL, y: shZ / shL };
  const tanEl = SUN_DIR[1] / Math.hypot(SUN_DIR[0], SUN_DIR[2]),
    shAng = Math.atan2(sh.y, sh.x);
  x.fillStyle = 'rgba(0,0,0,.36)';
  for (const t of trees) {
    const L = t.h / tanEl,
      cx = t.x + sh.x * L * 0.52,
      cz = t.z + sh.y * L * 0.52;
    x.beginPath();
    x.ellipse(sx(cx), sx(cz), (L * 0.5 + t.r * 0.4) * k, t.r * 0.95 * k, shAng, 0, TAU);
    x.fill();
  }
  x.fillStyle = 'rgba(0,0,0,.35)';
  for (const c of cars) {
    x.save();
    x.translate(sx(c.x + sh.x * 1.4), sx(c.z + sh.y * 1.4));
    x.rotate(shAng);
    x.fillRect(-2.6 * k, -1.0 * k, 5.2 * k, 2.0 * k);
    x.restore();
  }
  x.restore();
}
