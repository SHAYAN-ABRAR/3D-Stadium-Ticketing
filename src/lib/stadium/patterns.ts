/**
 * Deterministic "already sold" patterns for sample events: the prototype's clustered pattern (friends sit
 * together, the best blocks sell first), seeded by the event slug and scaled to a target sell-through.
 * Used by the database seed and by the mock availability source.
 */
import { clamp, hash2, hashString, noise2, rng } from './random';
import { getLayout, type StadiumLayout } from './layout';
import { demandOf, SKY } from './params';

export interface SoldPatternOptions {
  /** Seeds the pattern; use the event slug. */
  seed: string;
  /** Share of bowl seats sold, 0 to 1. */
  target: number;
  /** Share of blocks that are completely sold out (default 0.06). */
  soldOutShare?: number;
  /** 0 = clustered (the prototype's look), 1 = scattered single seats. Default 0. */
  scatter?: number;
  /** Seat indices that must stay free (for example Block 232 row 10 seats 5-11). */
  keepFree?: readonly number[];
  /** Share of skyboxes left completely free (default 0.3). */
  freeBoxShare?: number;
}

/** 1 for every sold seat (bowl seats and VIP chairs), 0 otherwise. */
export function soldPattern(opts: SoldPatternOptions, layout: StadiumLayout = getLayout()): Uint8Array {
  const sold = new Uint8Array(layout.totalSeatCount);
  const seedNum = hashString(opts.seed) % 100_000;
  const scatter = clamp(opts.scatter ?? 0, 0, 1);
  const soldOutShare = opts.soldOutShare ?? 0.06;
  const keep = new Set(opts.keepFree ?? []);
  const target = clamp(opts.target, 0, 1);

  const blocksWithKeep = new Set<number>();
  for (const i of keep) if (i < layout.bowlSeatCount) blocksWithKeep.add(layout.blockOf[i]);

  // Per block: a base share sold (desirable blocks sell more) and whether it is sold out.
  const base = layout.blocks.map((b) => {
    const desir = demandOf(b.tierKey, b.priceClass);
    const f = 0.3 + desir * 0.45 + (hash2(b.id + seedNum, 7) - 0.5) * 0.4;
    const soldOut =
      target > 0 && !blocksWithKeep.has(b.index) && hash2(b.id + seedNum, 11) < soldOutShare * (0.5 + desir);
    return { f, soldOut };
  });

  // Scale the shares so the whole bowl lands on the target.
  const maxF = Math.max(0.94, Math.min(0.995, target + 0.03));
  const total = layout.bowlSeatCount;
  const soldAt = (m: number) =>
    layout.blocks.reduce(
      (a, b, i) => a + (base[i].soldOut ? b.seatCount : clamp(base[i].f * m, 0, maxF) * b.seatCount),
      0,
    );
  let lo = 0,
    hi = 10;
  for (let it = 0; it < 50; it++) {
    const mid = (lo + hi) / 2;
    if (soldAt(mid) < target * total) lo = mid;
    else hi = mid;
  }
  const m = (lo + hi) / 2;

  for (const b of layout.blocks) {
    let share = base[b.index].soldOut ? 1 : clamp(base[b.index].f * m, 0, maxF);
    // Like the prototype (Block 232 at 58%), a block holding protected seats stays visibly available.
    if (blocksWithKeep.has(b.index) && target < 0.9) share = Math.min(share, 0.58);
    const nSold = Math.round(share * b.seatCount);
    if (nSold <= 0) continue;
    const order: number[] = [];
    const keys = new Float64Array(b.seatCount);
    for (let j = 0; j < b.seatCount; j++) {
      const i = b.firstSeat + j;
      order.push(j);
      const clustered =
        noise2(layout.numberOf[i] * 0.42 + b.id * 3.1 + seedNum * 0.013, layout.rowOf[i] * 0.85) +
        hash2(i, 3 + seedNum) * 0.22;
      keys[j] = (1 - scatter) * clustered + scatter * hash2(i, 5 + seedNum);
    }
    order.sort((a, z) => keys[a] - keys[z]);
    let marked = 0;
    for (let j = 0; j < order.length && marked < nSold; j++) {
      const i = b.firstSeat + order[j];
      if (keep.has(i)) continue;
      sold[i] = 1;
      marked++;
    }
  }

  // Skyboxes: some stay completely free (so the whole box can be booked); others sell chair by chair.
  const freeBoxShare = opts.freeBoxShare ?? 0.3;
  const chairP = clamp(target * 0.6, 0, 0.9);
  for (const box of layout.boxes) {
    const r = rng(hashString(opts.seed) + box.id * 31 + 7);
    if (r() < freeBoxShare) continue;
    for (let k = 0; k < SKY.chairsPerBox; k++) {
      const i = box.firstSeat + k;
      if (!keep.has(i) && r() < chairP) sold[i] = 1;
    }
    // Like the prototype, the middle chairs of row 2 stay free in all but the busiest events.
    if (target < 0.9) sold[box.firstSeat + 4] = sold[box.firstSeat + 5] = 0;
  }
  return sold;
}
