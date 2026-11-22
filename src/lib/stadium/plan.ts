/**
 * The plan curve: the bowl's inner edge is a rounded rectangle. Offsetting a rounded rectangle by d gives
 * another rounded rectangle with the same corner centres and radius R0 + d, so every row is exactly
 * parallel. The loop parameter s is arc length along the inner edge (d = 0). It starts at the middle of
 * the north-east corner (angle -45 degrees) and runs east, south, west, north.
 *
 * Coordinates are metres: x points east, z points south, y points up (north is -z).
 *
 * Ported unchanged from the prototype (world.js). Seat counts depend only on +, -, *, / here (no trig),
 * so seat indices are identical in every JavaScript engine. Keep the operation order as it is.
 */

const PI = Math.PI;
const TAU = PI * 2;

/** Half-length (x), half-width (z) and corner radius of the bowl's inner edge. */
export const L0 = 60.5;
export const W0 = 41;
export const R0 = 24;
/** Corner centres sit at (+-CX, +-CZ). */
export const CX = L0 - R0;
export const CZ = W0 - R0;
/** Arc length of a 45-degree corner piece. */
export const QA = (R0 * PI) / 4;

export interface Segment {
  arc: boolean;
  /** Start parameter and length along the inner edge. */
  s0: number;
  len: number;
  /** Arc centre and start angle (arcs only). */
  cx: number;
  cz: number;
  p0: number;
  /** Line start, direction and outward normal (lines only). */
  x0: number;
  z0: number;
  dx: number;
  dz: number;
  nx: number;
  nz: number;
}

function buildSegments(): { seg: Segment[]; perimeter: number } {
  const seg: Segment[] = [];
  const blank = { s0: 0, cx: 0, cz: 0, p0: 0, x0: 0, z0: 0, dx: 0, dz: 0, nx: 0, nz: 0 };
  const arc = (cx: number, cz: number, p0: number, p1: number) =>
    seg.push({ ...blank, arc: true, cx, cz, p0, len: R0 * (p1 - p0) });
  const line = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    seg.push({ ...blank, arc: false, x0, z0, dx: (x1 - x0) / len, dz: (z1 - z0) / len, nx, nz, len });
  };
  arc(CX, -CZ, -PI / 4, 0);
  line(L0, -CZ, L0, CZ, 1, 0);
  arc(CX, CZ, 0, PI / 2);
  line(CX, W0, -CX, W0, 0, 1);
  arc(-CX, CZ, PI / 2, PI);
  line(-L0, CZ, -L0, -CZ, -1, 0);
  arc(-CX, -CZ, PI, 1.5 * PI);
  line(-CX, -W0, CX, -W0, 0, -1);
  arc(CX, -CZ, 1.5 * PI, 1.75 * PI);
  let p = 0;
  for (const g of seg) {
    g.s0 = p;
    p += g.len;
  }
  return { seg, perimeter: p };
}

const built = buildSegments();
/** The nine segments of the loop: NE half-corner, East, SE, South, SW, West, NW, North, NE half-corner. */
export const SEG: readonly Segment[] = built.seg;
/** Total length of the inner edge (the loop parameter runs from 0 to P0). */
export const P0 = built.perimeter;

export const wrapS = (s: number): number => ((s % P0) + P0) % P0;

export function segAt(s: number): Segment {
  let i = 0;
  while (i < SEG.length - 1 && s >= SEG[i].s0 + SEG[i].len) i++;
  return SEG[i];
}

export interface PlanPoint {
  x: number;
  z: number;
  /** Outward unit normal (away from the pitch). */
  nx: number;
  nz: number;
}

/** Point at loop parameter s, offset d metres outward from the inner edge. Pass `out` to avoid allocation. */
export function planAt(s: number, d: number, out?: PlanPoint): PlanPoint {
  const o = out ?? { x: 0, z: 0, nx: 0, nz: 0 };
  const sw = wrapS(s),
    g = segAt(sw),
    u = sw - g.s0;
  if (g.arc) {
    const p = g.p0 + u / R0,
      c = Math.cos(p),
      n = Math.sin(p);
    o.x = g.cx + (R0 + d) * c;
    o.z = g.cz + (R0 + d) * n;
    o.nx = c;
    o.nz = n;
  } else {
    o.x = g.x0 + g.dx * u + g.nx * d;
    o.z = g.z0 + g.dz * u + g.nz * d;
    o.nx = g.nx;
    o.nz = g.nz;
  }
  return o;
}

/** Real length of the curve at offset d between parameters sa and sb (sa <= sb, within one lap). */
export function realLen(sa: number, sb: number, d: number): number {
  let L = 0;
  for (const g of SEG) {
    const a = Math.max(sa, g.s0),
      b = Math.min(sb, g.s0 + g.len);
    if (b > a) L += (b - a) * (g.arc ? (R0 + d) / R0 : 1);
  }
  return L;
}

/** Parameter reached after walking `len` metres of real length at offset d, starting at sa. Inverts realLen. */
export function sAtLen(sa: number, len: number, d: number): number {
  for (const g of SEG) {
    const end = g.s0 + g.len,
      a = Math.max(sa, g.s0);
    if (end <= a) continue;
    const k = g.arc ? (R0 + d) / R0 : 1,
      avail = (end - a) * k;
    if (len <= avail) return a + len / k;
    len -= avail;
  }
  return P0;
}

/** Inverse of planAt: the (s, d) of a plan point. d is negative inside the inner edge. */
export function planInverse(x: number, z: number): { s: number; d: number } {
  const px = Math.min(Math.max(x, -CX), CX),
    pz = Math.min(Math.max(z, -CZ), CZ),
    vx = x - px,
    vz = z - pz;
  const d = Math.hypot(vx, vz) - R0;
  if (vx === 0 && vz === 0) return { s: 0, d: -R0 };
  let s: number;
  if (vz === 0) s = vx > 0 ? SEG[1].s0 + (z + CZ) : SEG[5].s0 + (CZ - z);
  else if (vx === 0) s = vz > 0 ? SEG[3].s0 + (CX - x) : SEG[7].s0 + (x + CX);
  else {
    let p = Math.atan2(vz, vx);
    if (px > 0 && pz < 0) s = p >= -PI / 4 ? SEG[0].s0 + (p + PI / 4) * R0 : SEG[8].s0 + (p + 0.5 * PI) * R0;
    else if (px > 0) s = SEG[2].s0 + p * R0;
    else if (pz > 0) s = SEG[4].s0 + (p - PI / 2) * R0;
    else {
      if (p < 0) p += TAU;
      s = SEG[6].s0 + (p - PI) * R0;
    }
  }
  return { s: wrapS(s), d };
}

/** Loop parameters for sweeping geometry: segment ends, plus arc points every `stepRad` radians. */
export function loopSamples(stepRad: number): number[] {
  const out: number[] = [];
  for (const g of SEG) {
    out.push(g.s0);
    if (g.arc) {
      const n = Math.max(2, Math.ceil(g.len / R0 / stepRad));
      for (let k = 1; k < n; k++) out.push(g.s0 + (g.len * k) / n);
    }
  }
  out.push(P0);
  return out;
}

/** Loop parameters between sa and sb (inclusive), following arcs every `stepRad` radians. */
export function samplesBetween(sa: number, sb: number, stepRad: number): number[] {
  const out = [sa];
  for (const s of loopSamples(stepRad)) if (s > sa + 1e-6 && s < sb - 1e-6) out.push(s);
  out.push(sb);
  return out;
}
