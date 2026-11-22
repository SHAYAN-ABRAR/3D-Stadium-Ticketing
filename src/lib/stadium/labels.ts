/**
 * Turning seat indices into human labels and back, and finding runs of adjacent free seats.
 * Statuses use the availability encoding: 0 available, 1 held, 2 sold, 3 blocked or closed.
 */
import { SKY, type StandKey, type TierKey } from './params';
import { getLayout, SeatFlag, VIP_CHAIRS, type BlockInfo, type StadiumLayout } from './layout';

export const SeatStatus = { Available: 0, Held: 1, Sold: 2, Blocked: 3 } as const;
export type SeatStatusValue = (typeof SeatStatus)[keyof typeof SeatStatus];

export interface BowlSeatLabel {
  kind: 'bowl';
  index: number;
  stand: StandKey;
  tier: TierKey;
  /** Public block number. */
  block: number;
  row: number;
  seat: number;
  gate: string;
  wheelchair: boolean;
  companion: boolean;
  restricted: boolean;
}

export interface VipSeatLabel {
  kind: 'vip';
  index: number;
  stand: StandKey;
  /** Public skybox number. */
  box: number;
  row: 1 | 2;
  /** Chair number in the box, 1 to 8. */
  seat: number;
  gate: string;
}

export type SeatLabel = BowlSeatLabel | VipSeatLabel;

const blockByIdCache = new WeakMap<StadiumLayout, Map<number, BlockInfo>>();

/** Block by its public number (for example 232), or undefined. */
export function blockById(id: number, layout: StadiumLayout = getLayout()): BlockInfo | undefined {
  let map = blockByIdCache.get(layout);
  if (!map) {
    map = new Map(layout.blocks.map((b) => [b.id, b]));
    blockByIdCache.set(layout, map);
  }
  return map.get(id);
}

export function isVipIndex(index: number, layout: StadiumLayout = getLayout()): boolean {
  return index >= layout.bowlSeatCount && index < layout.totalSeatCount;
}

/** Label of any seat index (bowl seat or VIP chair), or null when the index doesn't exist. */
export function labelOf(index: number, layout: StadiumLayout = getLayout()): SeatLabel | null {
  if (!Number.isInteger(index) || index < 0 || index >= layout.totalSeatCount) return null;
  if (index >= layout.bowlSeatCount) {
    const v = index - layout.bowlSeatCount;
    const box = layout.boxes[Math.floor(v / SKY.chairsPerBox)];
    const chair = v % SKY.chairsPerBox;
    return {
      kind: 'vip',
      index,
      stand: box.standKey,
      box: box.id,
      row: VIP_CHAIRS[chair].row,
      seat: chair + 1,
      gate: box.gate,
    };
  }
  const b = layout.blocks[layout.blockOf[index]];
  const f = layout.flags[index];
  return {
    kind: 'bowl',
    index,
    stand: b.standKey,
    tier: b.tierKey,
    block: b.id,
    row: layout.rowOf[index],
    seat: layout.numberOf[index],
    gate: b.gate,
    wheelchair: (f & SeatFlag.Wheelchair) !== 0,
    companion: (f & SeatFlag.Companion) !== 0,
    restricted: (f & SeatFlag.Restricted) !== 0,
  };
}

/** Seat index of block / row / seat (all 1-based public numbers), or -1. */
export function indexOf(
  block: number,
  row: number,
  seat: number,
  layout: StadiumLayout = getLayout(),
): number {
  const b = blockById(block, layout);
  if (!b || row < 1 || row > b.rows) return -1;
  const n = b.rowLen[row - 1];
  if (seat < 1 || seat > n) return -1;
  return b.rowFirst[row - 1] + seat - 1;
}

/** Seat index of a VIP chair (skybox number, chair 1-8), or -1. */
export function vipIndexOf(boxId: number, chair: number, layout: StadiumLayout = getLayout()): number {
  const box = layout.boxes.find((x) => x.id === boxId);
  if (!box || chair < 1 || chair > SKY.chairsPerBox) return -1;
  return box.firstSeat + chair - 1;
}

/** First seat index and seat count of a row, or null. */
export function seatsInRow(
  block: number,
  row: number,
  layout: StadiumLayout = getLayout(),
): { first: number; count: number } | null {
  const b = blockById(block, layout);
  if (!b || row < 1 || row > b.rows) return null;
  return { first: b.rowFirst[row - 1], count: b.rowLen[row - 1] };
}

export interface RunOptions {
  /** Include wheelchair spaces (only when the visitor asked for accessible spaces). Default false. */
  wheelchair?: boolean;
  /** Skip restricted-view seats. Default false. */
  hideRestricted?: boolean;
}

/** Whether a seat can be part of a run under these options (ignoring its status). */
export function seatSelectable(index: number, opts: RunOptions = {}, layout: StadiumLayout = getLayout()) {
  if (index >= layout.bowlSeatCount) return true;
  const f = layout.flags[index];
  if (!opts.wheelchair && f & SeatFlag.Wheelchair) return false;
  if (opts.hideRestricted && f & SeatFlag.Restricted) return false;
  return true;
}

/**
 * Every run of `n` adjacent free seats in a row (adjacent = consecutive seat numbers; runs never cross an
 * aisle). Returns the seat index of each run's first seat, in seat-number order. Runs overlap.
 */
export function runsOfAdjacentFree(
  statuses: Uint8Array,
  block: number,
  row: number,
  n: number,
  opts: RunOptions = {},
  layout: StadiumLayout = getLayout(),
): number[] {
  const r = seatsInRow(block, row, layout);
  if (!r || n < 1 || n > r.count) return [];
  const out: number[] = [];
  let streak = 0;
  for (let k = 0; k < r.count; k++) {
    const i = r.first + k;
    if (statuses[i] === SeatStatus.Available && seatSelectable(i, opts, layout)) {
      streak++;
      if (streak >= n) out.push(i - n + 1);
    } else streak = 0;
  }
  return out;
}

/** Whether a block has at least one run of n adjacent free seats in any row. */
export function blockFitsRun(
  statuses: Uint8Array,
  b: BlockInfo,
  n: number,
  opts: RunOptions = {},
  layout: StadiumLayout = getLayout(),
): boolean {
  for (let r = 0; r < b.rows; r++) {
    let streak = 0;
    const first = b.rowFirst[r];
    for (let k = 0; k < b.rowLen[r]; k++) {
      const i = first + k;
      if (statuses[i] === SeatStatus.Available && seatSelectable(i, opts, layout)) {
        if (++streak >= n) return true;
      } else streak = 0;
    }
  }
  return false;
}
