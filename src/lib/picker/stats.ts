/**
 * Availability statistics for the picker UI (list panel, 2D plan, stand labels): free seats per block and
 * stand, and whether a run of N adjacent free seats fits. Mirrors what the engine paints.
 */
import { getLayout, SeatFlag, seatPriceMinor, type EventPricing, type StadiumLayout } from '@/lib/stadium';

export interface PickerFilters {
  priceMin: number | null;
  priceMax: number | null;
  accessible: boolean;
  hideRestricted: boolean;
}

export interface AvailabilityStats {
  /** Free seats per block (by block index). */
  blockFree: Int32Array;
  /** 1 when a block has a run of `quantity` adjacent free seats passing the filters. */
  blockFits: Uint8Array;
  /** Free seats per stand. */
  standFree: Int32Array;
  /** Lowest price (minor units) with a free seat per stand, or 0 when none. */
  standFrom: Int32Array;
  /** Free chairs per skybox. */
  boxFree: Int32Array;
}

/** Whether a bowl seat passes the visitor's filters (price range, accessible spaces, restricted view). */
export function seatAllowed(
  i: number,
  filters: PickerFilters,
  pricing: EventPricing | null,
  layout: StadiumLayout = getLayout(),
): boolean {
  const f = layout.flags[i];
  if (f & SeatFlag.Wheelchair && !filters.accessible) return false;
  if (f & SeatFlag.Restricted && filters.hideRestricted) return false;
  if (pricing && (filters.priceMin != null || filters.priceMax != null)) {
    const p = seatPriceMinor(i, pricing, layout);
    if (filters.priceMin != null && p < filters.priceMin) return false;
    if (filters.priceMax != null && p > filters.priceMax) return false;
  }
  return true;
}

export function computeStats(
  statuses: Uint8Array | null,
  quantity: number,
  filters: PickerFilters,
  pricing: EventPricing | null,
  layout: StadiumLayout = getLayout(),
): AvailabilityStats {
  const blockFree = new Int32Array(layout.blocks.length);
  const blockFits = new Uint8Array(layout.blocks.length);
  const standFree = new Int32Array(4);
  const standFrom = new Int32Array(4);
  const boxFree = new Int32Array(layout.boxes.length);
  for (const b of layout.blocks) {
    let free = 0,
      fits = false;
    for (let r = 0; r < b.rows; r++) {
      let streak = 0;
      for (let k = 0; k < b.rowLen[r]; k++) {
        const i = b.rowFirst[r] + k;
        const ok = !statuses || statuses[i] === 0;
        if (ok) free++;
        if (ok && seatAllowed(i, filters, pricing, layout)) {
          if (++streak >= quantity) fits = true;
        } else streak = 0;
      }
    }
    blockFree[b.index] = free;
    blockFits[b.index] = fits ? 1 : 0;
    standFree[b.stand] += free;
    if (free > 0 && pricing) {
      const p = pricing.blockPriceMinor[b.index] ?? 0;
      if (p > 0 && (standFrom[b.stand] === 0 || p < standFrom[b.stand])) standFrom[b.stand] = p;
    }
  }
  for (const box of layout.boxes) {
    let free = 0;
    for (let k = 0; k < 8; k++) if (!statuses || statuses[box.firstSeat + k] === 0) free++;
    boxFree[box.index] = free;
  }
  return { blockFree, blockFits, standFree, standFrom, boxFree };
}
