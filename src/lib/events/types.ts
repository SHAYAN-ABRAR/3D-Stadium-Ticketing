/**
 * The public shape of an event, as the picker and the event pages use it (the data store returns this).
 * Money is minor units; times are epoch milliseconds (UTC), shown in the venue time zone.
 */
import { getLayout, RESTRICTED_CATEGORY_CODE, type EventPricing, type StadiumLayout } from '@/lib/stadium';

export type EventStatus = 'draft' | 'on_sale' | 'sold_out' | 'past' | 'cancelled';

export interface PriceCategory {
  id: string;
  code: string;
  name: string;
  /** Null only for the "Restricted view" category when its price is automatic (one category lower). */
  priceMinor: number | null;
  sort: number;
}

export interface PublicEvent {
  id: string;
  slug: string;
  title: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeColor: string;
  awayColor: string;
  startsAt: number;
  doorsAt: number;
  status: EventStatus;
  saleStartsAt: number | null;
  saleEndsAt: number | null;
  currency: string;
  categories: PriceCategory[];
  /** Category id per block, indexed by block index. */
  blockCategory: (string | null)[];
  vip: { chairPriceMinor: number; boxPriceMinor: number };
  /** Closed blocks (block index). */
  closedBlocks: number[];
}

/** Everything needed to price seats of this event (shared by server and browser). */
export function pricingOf(event: PublicEvent, layout: StadiumLayout = getLayout()): EventPricing {
  const byId = new Map(event.categories.map((c) => [c.id, c]));
  const restricted = event.categories.find((c) => c.code === RESTRICTED_CATEGORY_CODE);
  return {
    blockPriceMinor: layout.blocks.map((b) => {
      const cat = byId.get(event.blockCategory[b.index] ?? '');
      return cat?.priceMinor ?? 0;
    }),
    ladderMinor: event.categories
      .filter((c) => c.code !== RESTRICTED_CATEGORY_CODE && c.priceMinor != null)
      .map((c) => c.priceMinor as number),
    vipChairMinor: event.vip.chairPriceMinor,
    vipBoxMinor: event.vip.boxPriceMinor,
    restrictedMinor: restricted?.priceMinor ?? null,
  };
}

/** Whether visitors can buy tickets right now. */
export function isOnSale(event: PublicEvent, now = Date.now()): boolean {
  if (event.status !== 'on_sale') return false;
  if (event.saleStartsAt != null && event.saleStartsAt > now) return false;
  if (event.saleEndsAt != null && event.saleEndsAt < now) return false;
  return event.startsAt > now;
}
