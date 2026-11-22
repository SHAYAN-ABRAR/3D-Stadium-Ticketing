/**
 * 2D plan polygons (x, z in metres, north up when z is drawn downward) for the SVG plan used by the
 * no-WebGL picker, ticket pages and PDFs. In a true top view the tiers overlap (each overhangs the one
 * below), so the plan draws schematic, non-overlapping bands.
 */
import { L0, P0, planAt, samplesBetween, W0, type PlanPoint } from './plan';
import { STANDS, type TierKey } from './params';
import { getLayout, type BlockInfo, type BoxInfo, type StadiumLayout } from './layout';
import { blockById } from './labels';

export type PlanXY = [number, number];

/** Schematic plan bands (offsets from the inner edge) per tier, plus the skybox ring. */
export const PLAN_BANDS: Readonly<Record<TierKey | 'VIP', readonly [number, number]>> = {
  L: [0.8, 18.0],
  M: [19.2, 31.6],
  VIP: [32.6, 36.6],
  U: [37.6, 59.6],
};

/** Outline of the facade, and the extent of the whole plan (for an SVG viewBox). */
export const PLAN_OUTER_D = 63.5;
export const PLAN_EXTENT = { halfX: L0 + PLAN_OUTER_D + 4, halfZ: W0 + PLAN_OUTER_D + 4 } as const;

/** Polygon of a band between loop parameters sa and sb and offsets dIn and dOut. */
export function bandPolygon(sa: number, sb: number, dIn: number, dOut: number, stepRad = 0.06): PlanXY[] {
  const ss = samplesBetween(sa, sb, stepRad);
  const P: PlanPoint = { x: 0, z: 0, nx: 0, nz: 0 };
  const inner = ss.map((s) => {
    planAt(s, dIn, P);
    return [round(P.x), round(P.z)] as PlanXY;
  });
  const outer = ss.map((s) => {
    planAt(s, dOut, P);
    return [round(P.x), round(P.z)] as PlanXY;
  });
  return [...inner, ...outer.reverse()];
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Plan polygon of a block (by public number or BlockInfo), with a small gap to its neighbours. */
export function blockPolygon(block: number | BlockInfo, layout: StadiumLayout = getLayout()): PlanXY[] {
  const b = typeof block === 'number' ? blockById(block, layout) : block;
  if (!b) return [];
  const [dIn, dOut] = PLAN_BANDS[b.tierKey];
  return bandPolygon(b.sa + 0.45, b.sb - 0.45, dIn, dOut);
}

/** Plan polygon of a skybox. */
export function boxPolygon(box: BoxInfo): PlanXY[] {
  const [dIn, dOut] = PLAN_BANDS.VIP;
  return bandPolygon(box.sa + 0.3, box.sb - 0.3, dIn, dOut);
}

/** Plan polygon of a whole stand (all tiers). */
export function standPolygon(standIndex: number): PlanXY[] {
  const st = STANDS[standIndex];
  return bandPolygon(st.s0 + 0.6, st.s1 - 0.6, PLAN_BANDS.L[0], PLAN_BANDS.U[1]);
}

/** A closed loop parallel to the inner edge at offset d (the facade outline at PLAN_OUTER_D). */
export function loopPolygon(d = PLAN_OUTER_D, stepRad = 0.06): PlanXY[] {
  const P: PlanPoint = { x: 0, z: 0, nx: 0, nz: 0 };
  return samplesBetween(0, P0, stepRad)
    .slice(0, -1)
    .map((s) => {
      planAt(s, d, P);
      return [round(P.x), round(P.z)] as PlanXY;
    });
}

/** Label anchor of a polygon (mean of its vertices; fine for these convex-ish bands). */
export function polygonCentre(poly: readonly PlanXY[]): PlanXY {
  let x = 0,
    z = 0;
  for (const p of poly) {
    x += p[0];
    z += p[1];
  }
  return [round(x / poly.length), round(z / poly.length)];
}

/** SVG path data ("M x z L ... Z") of a polygon. */
export function polygonPath(poly: readonly PlanXY[]): string {
  return poly.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('') + 'Z';
}
