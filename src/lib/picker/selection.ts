/**
 * Describing the visitor's selection (ticket card, tray, checkout) and the VIP upgrade.
 */
import {
  getLayout,
  labelOf,
  P0,
  SeatFlag,
  seatPriceMinor,
  SKY,
  totalPriceMinor,
  wholeBoxOf,
  type EventPricing,
  type SeatLabel,
  type StadiumLayout,
  type StandKey,
  type TierKey,
} from '@/lib/stadium';

export interface SelectionItem {
  index: number;
  label: SeatLabel;
  priceMinor: number;
}

export interface SelectionSummary {
  kind: 'empty' | 'bowl' | 'vip' | 'mixed';
  count: number;
  items: SelectionItem[];
  stand: StandKey | null;
  tier: TierKey | null;
  /** Public block number when all bowl seats share one block. */
  block: number | null;
  /** Row when all bowl seats share one row. */
  row: number | null;
  /** Seat numbers, compact: "7–8", "5, 7", "1–3, 9". */
  seats: string;
  gate: string | null;
  /** Skybox number when all chairs share one box. */
  box: number | null;
  wholeBox: boolean;
  totalMinor: number;
  restricted: boolean;
  wheelchair: boolean;
}

/** Compact seat numbers: consecutive numbers become ranges ("7–8"). */
export function seatNumbersText(nums: readonly number[]): string {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(j > i ? `${s[i]}–${s[j]}` : `${s[i]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

export function summarize(
  selection: readonly number[],
  pricing: EventPricing | null,
  layout: StadiumLayout = getLayout(),
): SelectionSummary {
  const items: SelectionItem[] = [];
  for (const i of selection) {
    const label = labelOf(i, layout);
    if (label) items.push({ index: i, label, priceMinor: pricing ? seatPriceMinor(i, pricing, layout) : 0 });
  }
  const bowl = items.filter((x) => x.label.kind === 'bowl');
  const vip = items.filter((x) => x.label.kind === 'vip');
  const kind = !items.length ? 'empty' : bowl.length && vip.length ? 'mixed' : vip.length ? 'vip' : 'bowl';
  const same = <T>(values: T[]) => (values.length && values.every((v) => v === values[0]) ? values[0] : null);
  const labels = items.map((x) => x.label);
  const bowlLabels = bowl.map((x) => x.label).filter((l) => l.kind === 'bowl');
  const vipLabels = vip.map((x) => x.label).filter((l) => l.kind === 'vip');
  return {
    kind,
    count: items.length,
    items,
    stand: same(labels.map((l) => l.stand)),
    tier: same(bowlLabels.map((l) => (l.kind === 'bowl' ? l.tier : null))),
    block: same(bowlLabels.map((l) => (l.kind === 'bowl' ? l.block : null))),
    row: kind === 'bowl' ? same(bowlLabels.map((l) => l.row)) : null,
    seats: seatNumbersText(labels.map((l) => l.seat)),
    gate: same(labels.map((l) => l.gate)),
    box: same(vipLabels.map((l) => (l.kind === 'vip' ? l.box : null))),
    wholeBox: wholeBoxOf(selection, layout) >= 0,
    totalMinor: pricing ? totalPriceMinor(selection, pricing, layout) : 0,
    restricted: bowl.some((x) => (layout.flags[x.index] & SeatFlag.Restricted) !== 0),
    wheelchair: bowl.some((x) => (layout.flags[x.index] & SeatFlag.Wheelchair) !== 0),
  };
}

/**
 * The VIP upgrade target for a seat: the skybox nearest to it on a straight side of the same stand
 * (box index), as in the prototype.
 */
export function nearestBox(seat: number, layout: StadiumLayout = getLayout()): number {
  const st = layout.stands[layout.blocks[layout.blockOf[seat]].stand];
  const s = layout.planS[seat];
  let best = -1,
    bd = Infinity;
  for (const bi of st.boxIndices) {
    const box = layout.boxes[bi];
    if (!box.straight) continue;
    let d = Math.abs((box.sa + box.sb) / 2 - s);
    d = Math.min(d, P0 - d);
    if (d < bd) {
      bd = d;
      best = bi;
    }
  }
  return best >= 0 ? best : st.boxIndices[Math.floor(st.boxIndices.length / 2)];
}

/** Extra cost of moving `count` tickets into a skybox (8 or more pay the whole-box price for 8). */
export function upgradeDiffMinor(currentTotal: number, count: number, pricing: EventPricing): number {
  const n = Math.min(count, SKY.chairsPerBox);
  const vip = n === SKY.chairsPerBox ? pricing.vipBoxMinor : n * pricing.vipChairMinor;
  return Math.max(0, vip - currentTotal);
}

/** Chairs (0-7) of a box that are in the selection. */
export function chairsInSelection(boxIndex: number, selection: readonly number[], layout = getLayout()) {
  const first = layout.boxes[boxIndex].firstSeat;
  return selection.filter((i) => i >= first && i < first + SKY.chairsPerBox).map((i) => i - first);
}
