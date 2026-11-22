/**
 * Per-seat instance data for the seat InstancedMesh: matrices (seats face the pitch) and base colours
 * (red with blue patches, as in the prototype). No three.js: runs in the build worker.
 */
import { brand } from '@/config/brand';
import { hash2, noise2, type StadiumLayout } from '@/lib/stadium';
import { TIERS } from '@/lib/stadium/params';

/** sRGB hex to linear RGB (three.js works in linear sRGB with colour management on). */
export function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
  };
  return [ch((n >> 16) & 255), ch((n >> 8) & 255), ch(n & 255)];
}

export function seatMatrices(layout: StadiumLayout): Float32Array {
  const n = layout.bowlSeatCount,
    m = new Float32Array(n * 16),
    p = layout.positions,
    nr = layout.normals;
  for (let i = 0; i < n; i++) {
    const o = i * 16,
      nx = nr[i * 2],
      nz = nr[i * 2 + 1];
    // Columns: x = (-nz, 0, nx), y = up, z = (-nx, 0, -nz) (towards the pitch), translation.
    m[o] = -nz;
    m[o + 2] = nx;
    m[o + 5] = 1;
    m[o + 8] = -nx;
    m[o + 10] = -nz;
    m[o + 12] = p[i * 3];
    m[o + 13] = p[i * 3 + 1];
    m[o + 14] = p[i * 3 + 2];
    m[o + 15] = 1;
  }
  return m;
}

/** Base colours (linear RGB): seat red, with clusters of seat blue, each seat slightly varied. */
export function seatBaseColors(layout: StadiumLayout): Float32Array {
  const n = layout.bowlSeatCount,
    out = new Float32Array(n * 3);
  const red = hexToLinear(brand.colors.seatRed),
    blue = hexToLinear(brand.colors.seatBlue);
  for (let i = 0; i < n; i++) {
    const b = layout.blocks[layout.blockOf[i]];
    const lay = TIERS[b.tier].level * 50 + (layout.rowOf[i] - 1);
    const s = layout.planS[i];
    const v = 0.55 * noise2(s * 0.19, lay * 0.42) + 0.45 * noise2(s * 0.61 + 17.3, lay * 1.13);
    const c = v > 0.64 || hash2(i, 5) < 0.045 ? blue : red;
    const k = 0.9 + hash2(i, 9) * 0.16;
    out[i * 3] = c[0] * k;
    out[i * 3 + 1] = c[1] * k;
    out[i * 3 + 2] = c[2] * k;
  }
  return out;
}
