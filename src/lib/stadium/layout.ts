/**
 * Builds the complete seat layout: blocks, every bowl seat, seat flags, gates and skyboxes.
 * Pure and deterministic (no three.js, no DOM), so the server and the browser share it. Seat index order
 * is stand (E, S, W, N), then tier (L, M, U), then block, then row, then seat. VIP chairs follow the bowl:
 * index = bowlSeatCount + boxIndex * 8 + chair.
 */
import { planAt, realLen, sAtLen, segAt, type PlanPoint } from './plan';
import {
  AISLE,
  DEFAULT_PRICES,
  GATES_END,
  GATES_LONG,
  RESTRICTED_D,
  SEAT_W,
  SKY,
  STANDS,
  TIERS,
  type PriceClass,
  type StandKey,
  type TierKey,
} from './params';

export type Vec3 = readonly [number, number, number];
export type Vec2 = readonly [number, number];

/** Bit flags per bowl seat. Overlays only: they never change seat count or indices. */
export const SeatFlag = {
  /** A wheelchair space: drawn as a platform, not a chair. */
  Wheelchair: 1,
  /** The seat next to a wheelchair space, for a companion. */
  Companion: 2,
  /** Under the middle-tier overhang: restricted view, priced one category lower. */
  Restricted: 4,
} as const;

export interface BlockInfo {
  /** Position in seat-index order (0-based). */
  index: number;
  /** Public block number, for example 232. */
  id: number;
  stand: number;
  standKey: StandKey;
  tier: number;
  tierKey: TierKey;
  /** Position within its stand and tier, and how many blocks share them. */
  k: number;
  n: number;
  /** Loop-parameter range. */
  sa: number;
  sb: number;
  firstSeat: number;
  seatCount: number;
  rows: number;
  /** Per row (0-based): index of the row's first seat and its seat count. */
  rowFirst: readonly number[];
  rowLen: readonly number[];
  /** Gate letter + number, for example "N3". */
  gate: string;
  /** 0 at the stand's centre, 1 at its ends. */
  c: number;
  priceClass: PriceClass;
  /** Default price in AED (major units) for this block's ordinary seats. */
  defaultPrice: number;
  /** Has wheelchair spaces in row 1. */
  accessible: boolean;
  /** Camera target (middle seat of the middle row, raised 0.6 m) and the outward normal at mid-block. */
  center: Vec3;
  normal: Vec2;
}

export interface StandInfo {
  index: number;
  key: StandKey;
  s0: number;
  s1: number;
  long: boolean;
  blockIndices: readonly number[];
  boxIndices: readonly number[];
  seatCount: number;
  /** Lowest default price among the stand's blocks (AED). */
  minDefaultPrice: number;
  /** Camera target, label anchor and outward normal. */
  center: Vec3;
  label: Vec3;
  normal: Vec2;
}

export interface BoxInfo {
  index: number;
  /** Public skybox number, from 1, North stand first, then East, South, West. */
  id: number;
  stand: number;
  standKey: StandKey;
  sa: number;
  sb: number;
  width: number;
  /** Entirely on a straight side (the VIP upgrade only targets straight boxes). */
  straight: boolean;
  /** Index of the box's first VIP chair (bowlSeatCount + index * 8). */
  firstSeat: number;
  gate: string;
  center: Vec3;
  normal: Vec2;
  /** Glass-line point at mid-box (floor height) that the interior is built around. */
  origin: Vec3;
}

export interface StadiumLayout {
  bowlSeatCount: number;
  vipSeatCount: number;
  totalSeatCount: number;
  /** Seat base centre (x, y, z) per bowl seat. */
  positions: Float32Array;
  /** Outward plan normal (nx, nz) per bowl seat; seats face the pitch (-normal). */
  normals: Float32Array;
  /** Loop parameter s per bowl seat (seat colour pattern, the wave, nearest-box lookups). Full precision. */
  planS: Float64Array;
  /** Block index (not the public id) per bowl seat. */
  blockOf: Uint16Array;
  /** 1-based row and seat number per bowl seat. */
  rowOf: Uint8Array;
  numberOf: Uint16Array;
  /** SeatFlag bits per bowl seat. */
  flags: Uint8Array;
  stands: readonly StandInfo[];
  blocks: readonly BlockInfo[];
  boxes: readonly BoxInfo[];
}

/** VIP chair positions in a box's local frame (x along the glass, y up, z back from the glass). */
export const VIP_CHAIRS: readonly { x: number; y: number; z: number; row: 1 | 2 }[] = [1, 2].flatMap((row) =>
  [2.25, 0.75, -0.75, -2.25].map((x) => ({
    x,
    y: row === 1 ? 0 : 0.5,
    z: row === 1 ? 1.25 : 2.75,
    row: row as 1 | 2,
  })),
);

function gateOf(standIndex: number, sa: number, sb: number): string {
  const st = STANDS[standIndex];
  const nG = st.long ? GATES_LONG : GATES_END;
  const c01 = ((sa + sb) / 2 - st.s0) / (st.s1 - st.s0);
  return st.key + (1 + Math.min(nG - 1, Math.floor(c01 * nG)));
}

interface PreBlock {
  tier: number;
  stand: number;
  k: number;
  n: number;
  sa: number;
  sb: number;
  id: number;
}

/** Builds the layout from scratch. Prefer getLayout(), which caches the result. */
export function buildLayout(): StadiumLayout {
  // Blocks: per tier and stand, equal parts measured at the tier's middle offset.
  const pre: PreBlock[] = [];
  for (const tier of TIERS) {
    let num = 1;
    for (const st of STANDS) {
      const L = realLen(st.s0, st.s1, tier.dMid),
        n = Math.max(2, Math.round(L / tier.blockW));
      let prev = st.s0;
      for (let k = 0; k < n; k++) {
        const sb = k === n - 1 ? st.s1 : sAtLen(st.s0, (L * (k + 1)) / n, tier.dMid);
        pre.push({ tier: tier.index, stand: st.index, k, n, sa: prev, sb, id: tier.level * 100 + num++ });
        prev = sb;
      }
    }
  }
  const ordered: PreBlock[] = [];
  for (const st of STANDS)
    for (const tier of TIERS)
      for (const b of pre) if (b.stand === st.index && b.tier === tier.index) ordered.push(b);

  // First pass: seats per row, so the typed arrays are allocated at their exact size.
  const rowCounts = ordered.map((b) => {
    const t = TIERS[b.tier];
    const counts: number[] = [];
    for (let r = 0; r < t.rows; r++) {
      const d = t.d0 + r * t.tread + t.tread * 0.6;
      const Lr = realLen(b.sa, b.sb, d) - 2 * AISLE;
      counts.push(Math.max(0, Math.floor(Lr / SEAT_W)));
    }
    return counts;
  });
  const bowlSeatCount = rowCounts.reduce((a, c) => a + c.reduce((x, y) => x + y, 0), 0);

  const positions = new Float32Array(bowlSeatCount * 3);
  const normals = new Float32Array(bowlSeatCount * 2);
  const planS = new Float64Array(bowlSeatCount);
  const blockOf = new Uint16Array(bowlSeatCount);
  const rowOf = new Uint8Array(bowlSeatCount);
  const numberOf = new Uint16Array(bowlSeatCount);
  const flags = new Uint8Array(bowlSeatCount);

  const P: PlanPoint = { x: 0, z: 0, nx: 0, nz: 0 };
  const blocks: BlockInfo[] = [];
  let N = 0;
  ordered.forEach((b, bi) => {
    const t = TIERS[b.tier],
      st = STANDS[b.stand];
    const accessible = t.key === 'L' && b.id % 2 === 1;
    const first = N,
      rowFirst: number[] = [],
      rowLen: number[] = [];
    for (let r = 0; r < t.rows; r++) {
      const d = t.d0 + r * t.tread + t.tread * 0.6,
        y = t.y0 + r * t.riser;
      const Lr = realLen(b.sa, b.sb, d) - 2 * AISLE,
        n = rowCounts[bi][r],
        m0 = AISLE + (Lr - n * SEAT_W) / 2;
      rowFirst.push(N);
      rowLen.push(n);
      for (let k = 0; k < n; k++) {
        const s = sAtLen(b.sa, m0 + (k + 0.5) * SEAT_W, d);
        planAt(s, d, P);
        positions[N * 3] = P.x;
        positions[N * 3 + 1] = y;
        positions[N * 3 + 2] = P.z;
        normals[N * 2] = P.nx;
        normals[N * 2 + 1] = P.nz;
        planS[N] = s;
        blockOf[N] = bi;
        rowOf[N] = r + 1;
        numberOf[N] = k + 1;
        let f = 0;
        if (accessible && r === 0 && n >= 8) {
          if (k < 2 || k >= n - 2) f |= SeatFlag.Wheelchair;
          else if (k === 2 || k === n - 3) f |= SeatFlag.Companion;
        }
        if (t.key === 'L' && d > RESTRICTED_D) f |= SeatFlag.Restricted;
        flags[N] = f;
        N++;
      }
    }

    const c = Math.abs((((b.sa + b.sb) / 2 - st.s0) / (st.s1 - st.s0)) * 2 - 1);
    const priceClass: PriceClass = st.long
      ? c < 0.36
        ? 'centre'
        : c < 0.72
          ? 'side'
          : 'corner'
      : c > 0.6
        ? 'corner'
        : 'end';
    const mr = Math.floor(t.rows / 2),
      mi = rowFirst[mr] + Math.floor(rowLen[mr] / 2);
    planAt((b.sa + b.sb) / 2, t.dMid, P);
    blocks.push({
      index: bi,
      id: b.id,
      stand: b.stand,
      standKey: st.key,
      tier: b.tier,
      tierKey: t.key,
      k: b.k,
      n: b.n,
      sa: b.sa,
      sb: b.sb,
      firstSeat: first,
      seatCount: N - first,
      rows: t.rows,
      rowFirst,
      rowLen,
      gate: gateOf(b.stand, b.sa, b.sb),
      c,
      priceClass,
      defaultPrice: DEFAULT_PRICES[t.key][priceClass],
      accessible,
      center: [positions[mi * 3], positions[mi * 3 + 1] + 0.6, positions[mi * 3 + 2]],
      normal: [P.nx, P.nz],
    });
  });

  // Skyboxes: numbered from 1, North stand first, then East, South, West.
  const boxes: BoxInfo[] = [];
  let boxNum = 1;
  for (const si of [3, 0, 1, 2]) {
    const st = STANDS[si],
      L = realLen(st.s0, st.s1, SKY.d),
      n = Math.max(2, Math.round(L / SKY.w));
    let prev = st.s0;
    for (let k = 0; k < n; k++) {
      const sb = k === n - 1 ? st.s1 : sAtLen(st.s0, (L * (k + 1)) / n, SKY.d);
      const ga = segAt(prev + 0.01),
        gb = segAt(sb - 0.01);
      planAt((prev + sb) / 2, SKY.d, P);
      const index = boxes.length;
      boxes.push({
        index,
        id: boxNum++,
        stand: si,
        standKey: st.key,
        sa: prev,
        sb,
        width: realLen(prev, sb, SKY.d),
        straight: ga === gb && !ga.arc,
        firstSeat: bowlSeatCount + index * SKY.chairsPerBox,
        gate: gateOf(si, prev, sb),
        center: [P.x, SKY.y + 1.8, P.z],
        normal: [P.nx, P.nz],
        origin: [P.x, SKY.y, P.z],
      });
      prev = sb;
    }
  }

  const stands: StandInfo[] = STANDS.map((st) => {
    const own = blocks.filter((b) => b.stand === st.index);
    const mid = (st.s0 + st.s1) / 2;
    const P2 = planAt(mid, 30),
      P3 = planAt(mid, 52);
    return {
      index: st.index,
      key: st.key,
      s0: st.s0,
      s1: st.s1,
      long: st.long,
      blockIndices: own.map((b) => b.index),
      boxIndices: boxes.filter((x) => x.stand === st.index).map((x) => x.index),
      seatCount: own.reduce((a, b) => a + b.seatCount, 0),
      minDefaultPrice: Math.min(...own.map((b) => b.defaultPrice)),
      center: [P2.x, 22, P2.z],
      label: [P3.x, 62, P3.z],
      normal: [P2.nx, P2.nz],
    };
  });

  const vipSeatCount = boxes.length * SKY.chairsPerBox;
  return {
    bowlSeatCount,
    vipSeatCount,
    totalSeatCount: bowlSeatCount + vipSeatCount,
    positions,
    normals,
    planS,
    blockOf,
    rowOf,
    numberOf,
    flags,
    stands,
    blocks,
    boxes,
  };
}

let cached: StadiumLayout | null = null;

/** The layout, built once per process (or browser tab) and cached at module level. */
export function getLayout(): StadiumLayout {
  if (!cached) cached = buildLayout();
  return cached;
}

/** World position of a VIP chair (box-local VIP_CHAIRS transformed by the box frame). */
export function vipChairWorld(box: BoxInfo, chair: number): Vec3 {
  const c = VIP_CHAIRS[chair];
  const [nx, nz] = box.normal;
  const [ox, oy, oz] = box.origin;
  // Box frame: local x = (nz, 0, -nx), local y = up, local z = (nx, 0, nz) (outward, into the box).
  return [ox + nz * c.x + nx * c.z, oy + c.y, oz - nx * c.x + nz * c.z];
}
