/**
 * Venue parameters (PROMPT.md section 5). Seat indices are permanent database IDs: never change these
 * numbers without updating the parity tests and noting it in docs/DECISIONS.md.
 */
import { P0, QA, SEG, wrapS } from './plan';

export type StandKey = 'E' | 'S' | 'W' | 'N';
export type TierKey = 'L' | 'M' | 'U';
export type PriceClass = 'centre' | 'side' | 'corner' | 'end';

export interface StandDef {
  index: number;
  key: StandKey;
  /** Loop-parameter range [s0, s1). Corners are split at their 45-degree points. */
  s0: number;
  s1: number;
  /** South and North are the long stands. */
  long: boolean;
}

export interface TierDef {
  index: number;
  key: TierKey;
  /** 1, 2 or 3: block numbers are level x 100 + a running number. */
  level: 1 | 2 | 3;
  rows: number;
  /** Offset of the first tread from the inner edge, and the first tread's height. */
  d0: number;
  y0: number;
  tread: number;
  riser: number;
  /** Height of the back wall behind the last row. */
  back: number;
  /** Target block width, measured at dMid. */
  blockW: number;
  /** Derived: offset of the back of the last tread, height of the last tread, middle offset. */
  dEnd: number;
  yTop: number;
  dMid: number;
}

const cuts = [0, SEG[2].s0 + QA, SEG[4].s0 + QA, SEG[6].s0 + QA, P0];

export const STANDS: readonly StandDef[] = (['E', 'S', 'W', 'N'] as const).map((key, i) => ({
  index: i,
  key,
  s0: cuts[i],
  s1: cuts[i + 1],
  long: i % 2 === 1,
}));

/** Index of the stand containing loop parameter s. */
export function standOf(s: number): number {
  s = wrapS(s);
  for (let i = 0; i < 4; i++) if (s < cuts[i + 1]) return i;
  return 3;
}

function tier(
  index: number,
  key: TierKey,
  level: 1 | 2 | 3,
  rows: number,
  d0: number,
  y0: number,
  tread: number,
  riser: number,
  back: number,
  blockW: number,
): TierDef {
  const dEnd = d0 + rows * tread;
  return {
    index,
    key,
    level,
    rows,
    d0,
    y0,
    tread,
    riser,
    back,
    blockW,
    dEnd,
    yTop: y0 + (rows - 1) * riser,
    dMid: (d0 + dEnd) / 2,
  };
}

export const TIERS: readonly TierDef[] = [
  tier(0, 'L', 1, 28, 1.0, 1.6, 0.8, 0.36, 4.4, 13),
  tier(1, 'M', 2, 20, 19.0, 15.2, 0.85, 0.47, 1.9, 14),
  tier(2, 'U', 3, 32, 33.5, 32.1, 0.85, 0.56, 3.45, 15),
];

/** Seat width and the aisle half-width at each block edge. */
export const SEAT_W = 0.5;
export const AISLE = 0.6;

/** Skybox ring between the middle and upper tiers. */
export const SKY = {
  /** Glass line, back wall, floor height, box height, target box width. */
  d: 36.4,
  d2: 42.4,
  y: 26.0,
  h: 3.3,
  w: 7.6,
  chairsPerBox: 8,
} as const;

/** Membrane roof: inner and outer edge offsets, top heights and thicknesses. */
export const ROOF = { d0: 42, d1: 66.5, yIn: 56.4, yOut: 53.2, thickIn: 1.4, thickOut: 1.0 } as const;

/** Facade line and top; vertical fins about every FIN_STEP metres at FIN_D. */
export const FACADE = { d: 63.5, top: 52.6, finD: 64.7, finStep: 4.2 } as const;

/** Gates per stand: 6 on the long stands, 4 on the end stands. */
export const GATES_LONG = 6;
export const GATES_END = 4;

/**
 * Default prices in Bangladeshi taka (major units), by tier and price class. The classes are the
 * prototype's (the parity test checks them); the amounts were set for taka, with shared steps so the
 * category ladder stays short (8 categories).
 */
export const DEFAULT_PRICES: Readonly<Record<TierKey, Readonly<Record<PriceClass, number>>>> = {
  L: { centre: 1500, side: 1200, corner: 1000, end: 800 },
  M: { centre: 2000, side: 1600, corner: 1200, end: 1000 },
  U: { centre: 1000, side: 800, corner: 600, end: 500 },
};

/**
 * How well each area sells, by tier and price class: the prototype's price points (in its own currency).
 * The sold-seat patterns and the simulated buyers use these instead of DEFAULT_PRICES, so they stay the
 * same whatever the currency or the amounts. The parity test checks them against the prototype's blocks.
 */
export const DEMAND_POINTS: Readonly<Record<TierKey, Readonly<Record<PriceClass, number>>>> = {
  L: { centre: 950, side: 800, corner: 650, end: 550 },
  M: { centre: 1250, side: 1050, corner: 850, end: 750 },
  U: { centre: 650, side: 550, corner: 450, end: 400 },
};

/** Demand of an area from 0 (upper-tier ends) to 1 (middle-tier centre). */
export function demandOf(tier: TierKey, priceClass: PriceClass): number {
  return (DEMAND_POINTS[tier][priceClass] - 400) / 850;
}

/**
 * Surface height of the bowl at offset d (used to pick stands from far away by ray-marching).
 */
export function bowlHeight(d: number): number {
  if (d < 0) return 0;
  if (d < 19) return 1.6 + Math.max(0, d - 1) * 0.45;
  if (d < 33.5) return 15.2 + Math.max(0, d - 19) * 0.553;
  if (d < FACADE.d) return Math.min(52.8, 32.1 + (d - 33.5) * 0.66);
  return 0;
}

/** Lower-tier seats under the middle-tier overhang (seat d above this, rows 23-28) have a restricted view. */
export const RESTRICTED_D = 18.7;
