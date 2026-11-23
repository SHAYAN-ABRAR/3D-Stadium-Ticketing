/**
 * Prices. Money is integer minor units (taka has 2 decimals: Tk 2,000 is 200000). The server computes every
 * price with these functions; the browser uses the same ones only for display.
 *
 * Restricted-view seats are priced one category lower: the next cheaper category among the event's
 * categories (the cheapest category stays as it is), unless the event's "Restricted view" category has a
 * fixed price, which then applies (never above the block's own price). See docs/DECISIONS.md.
 */
import { brand } from '@/config/brand';
import { DEFAULT_PRICES, SKY } from './params';
import { getLayout, SeatFlag, type BlockInfo, type StadiumLayout } from './layout';

export const MINOR_PER_MAJOR = 10 ** brand.currencyDecimals;
export const toMinor = (major: number): number => Math.round(major * MINOR_PER_MAJOR);

/** Every distinct default price in taka, highest first: the default category ladder. */
export const DEFAULT_PRICE_LADDER: readonly number[] = [
  ...new Set(Object.values(DEFAULT_PRICES).flatMap((t) => Object.values(t))),
].sort((a, b) => b - a);

export interface CategoryDef {
  code: string;
  name: string;
  priceMinor: number;
  sort: number;
}

/** One category per distinct default price, highest first ("Category 1" is Tk 2,000). */
export function defaultCategories(): CategoryDef[] {
  return DEFAULT_PRICE_LADDER.map((p, i) => ({
    code: `C${i + 1}`,
    name: `Category ${i + 1}`,
    priceMinor: toMinor(p),
    sort: i + 1,
  }));
}

/** Default category code of a block (by its default price). */
export function defaultCategoryCode(block: BlockInfo): string {
  return `C${DEFAULT_PRICE_LADDER.indexOf(block.defaultPrice) + 1}`;
}

/** The price one category below `priceMinor` among `ladderMinor` (any order). The cheapest stays. */
export function oneCategoryLower(priceMinor: number, ladderMinor: readonly number[]): number {
  let best = -1;
  for (const p of ladderMinor) if (p < priceMinor && p > best) best = p;
  return best < 0 ? priceMinor : best;
}

/** Everything needed to price any seat of one event. */
export interface EventPricing {
  /** Price (minor units) of each block's category, indexed by block index. 0 if unassigned. */
  blockPriceMinor: readonly number[];
  /** Prices of all the event's categories, for the restricted-view rule. */
  ladderMinor: readonly number[];
  vipChairMinor: number;
  vipBoxMinor: number;
  /** Fixed price of the "Restricted view" category, or null/undefined for "one category lower". */
  restrictedMinor?: number | null;
}

/** Code of the special "Restricted view" category (its price is automatic unless an admin fixes one). */
export const RESTRICTED_CATEGORY_CODE = 'RV';

/** Pricing with the default categories (used by the seed and by the mock availability source). */
export function defaultPricing(layout: StadiumLayout = getLayout()): EventPricing {
  return {
    blockPriceMinor: layout.blocks.map((b) => toMinor(b.defaultPrice)),
    ladderMinor: DEFAULT_PRICE_LADDER.map(toMinor),
    vipChairMinor: brand.vipChairPriceMinor,
    vipBoxMinor: brand.boxPriceMinor,
  };
}

/** Price of one seat (bowl seat or VIP chair) in minor units. */
export function seatPriceMinor(
  index: number,
  pricing: EventPricing,
  layout: StadiumLayout = getLayout(),
): number {
  if (index >= layout.bowlSeatCount) return pricing.vipChairMinor;
  const base = pricing.blockPriceMinor[layout.blockOf[index]] ?? 0;
  if (!(layout.flags[index] & SeatFlag.Restricted)) return base;
  if (pricing.restrictedMinor != null) return Math.min(base, pricing.restrictedMinor);
  return oneCategoryLower(base, pricing.ladderMinor);
}

/** Price of a block's ordinary (unrestricted) seats. */
export function blockPriceMinor(block: BlockInfo, pricing: EventPricing): number {
  return pricing.blockPriceMinor[block.index] ?? 0;
}

/**
 * Total of a set of seats. A set containing all 8 chairs of a skybox is charged the whole-box price
 * for those 8 chairs instead of 8 chair prices.
 */
export function totalPriceMinor(
  indices: readonly number[],
  pricing: EventPricing,
  layout: StadiumLayout = getLayout(),
): number {
  let total = 0;
  const chairsPerBox = new Map<number, number>();
  for (const i of indices) {
    if (i >= layout.bowlSeatCount) {
      const box = Math.floor((i - layout.bowlSeatCount) / SKY.chairsPerBox);
      chairsPerBox.set(box, (chairsPerBox.get(box) ?? 0) + 1);
    } else total += seatPriceMinor(i, pricing, layout);
  }
  for (const count of chairsPerBox.values()) {
    total += count === SKY.chairsPerBox ? pricing.vipBoxMinor : count * pricing.vipChairMinor;
  }
  return total;
}

/**
 * Price of each seat of a set (same order as `indices`), summing exactly to totalPriceMinor: chairs of a
 * whole skybox share the box price (the remainder of the division goes to the first chairs).
 */
export function seatPricesMinor(
  indices: readonly number[],
  pricing: EventPricing,
  layout: StadiumLayout = getLayout(),
): number[] {
  const boxOf = (i: number) => Math.floor((i - layout.bowlSeatCount) / SKY.chairsPerBox);
  const chairsPerBox = new Map<number, number>();
  for (const i of indices) {
    if (i >= layout.bowlSeatCount) chairsPerBox.set(boxOf(i), (chairsPerBox.get(boxOf(i)) ?? 0) + 1);
  }
  const seen = new Map<number, number>();
  return indices.map((i) => {
    if (i < layout.bowlSeatCount) return seatPriceMinor(i, pricing, layout);
    const box = boxOf(i);
    if (chairsPerBox.get(box) !== SKY.chairsPerBox) return pricing.vipChairMinor;
    const k = seen.get(box) ?? 0;
    seen.set(box, k + 1);
    const share = Math.floor(pricing.vipBoxMinor / SKY.chairsPerBox);
    return share + (k < pricing.vipBoxMinor - share * SKY.chairsPerBox ? 1 : 0);
  });
}

/** Whether a set of seats is exactly one whole skybox (all 8 chairs, nothing else). */
export function wholeBoxOf(indices: readonly number[], layout: StadiumLayout = getLayout()): number {
  if (indices.length !== SKY.chairsPerBox) return -1;
  const boxes = new Set(
    indices.map((i) =>
      i >= layout.bowlSeatCount ? Math.floor((i - layout.bowlSeatCount) / SKY.chairsPerBox) : -1,
    ),
  );
  if (boxes.size !== 1 || boxes.has(-1)) return -1;
  return new Set(indices).size === SKY.chairsPerBox ? [...boxes][0] : -1;
}
