/**
 * Best available (PROMPT.md section 7): scores every run of N adjacent free seats across the event and
 * returns the best few, one per block. Ranking: middle tier, then lower, then upper; long-stand centre,
 * then side, then corner, then end; rows about 30-60% back in their tier; runs near the block's centre;
 * only seats that pass the filters.
 */
import { getLayout, type BlockInfo, type EventPricing, type StadiumLayout } from '@/lib/stadium';
import { seatAllowed, type PickerFilters } from './stats';

export interface BestRun {
  seats: number[];
  block: number;
  score: number;
}

const TIER_RANK: Record<string, number> = { M: 0, L: 1, U: 2 };
const CLASS_RANK: Record<string, number> = { centre: 0, side: 1, corner: 2, end: 3 };

/** Lower is better. Exposed for tests. */
export function scoreRun(b: BlockInfo, row: number, start: number, n: number): number {
  const rowPos = b.rows > 1 ? row / (b.rows - 1) : 0;
  const rowPenalty = rowPos < 0.3 ? 0.3 - rowPos : rowPos > 0.6 ? rowPos - 0.6 : 0;
  const len = b.rowLen[row];
  const centre = (len - 1) / 2,
    runCentre = start + (n - 1) / 2;
  const centrePenalty = len > 0 ? Math.abs(runCentre - centre) / len : 0;
  return TIER_RANK[b.tierKey] * 100 + CLASS_RANK[b.priceClass] * 10 + rowPenalty * 8 + centrePenalty * 4;
}

/** The best run in one block (or null), optionally limited to one row (0-based). */
export function bestInBlock(
  statuses: Uint8Array,
  b: BlockInfo,
  n: number,
  filters: PickerFilters,
  pricing: EventPricing | null,
  row: number | null = null,
  layout: StadiumLayout = getLayout(),
): BestRun | null {
  let best: BestRun | null = null;
  const rows = row == null ? [...Array(b.rows).keys()] : [row];
  for (const r of rows) {
    const first = b.rowFirst[r],
      len = b.rowLen[r];
    let streak = 0;
    for (let k = 0; k < len; k++) {
      const i = first + k;
      if (statuses[i] === 0 && seatAllowed(i, filters, pricing, layout)) streak++;
      else streak = 0;
      if (streak >= n) {
        const start = k - n + 1;
        const score = scoreRun(b, r, start, n);
        if (!best || score < best.score) {
          best = { seats: Array.from({ length: n }, (_, j) => first + start + j), block: b.index, score };
        }
      }
    }
  }
  return best;
}

/** The top `count` runs across the event, one per block, best first. */
export function bestAvailable(
  statuses: Uint8Array,
  n: number,
  filters: PickerFilters,
  pricing: EventPricing | null,
  count = 3,
  closedBlocks: ReadonlySet<number> = new Set(),
  layout: StadiumLayout = getLayout(),
): BestRun[] {
  const perBlock: BestRun[] = [];
  for (const b of layout.blocks) {
    if (closedBlocks.has(b.index)) continue;
    const run = bestInBlock(statuses, b, n, filters, pricing, null, layout);
    if (run) perBlock.push(run);
  }
  return perBlock.sort((a, z) => a.score - z.score).slice(0, count);
}
