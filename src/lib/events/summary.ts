/** Event list figures: sell-through, the "from" price and the status badge (On sale, Few left, ...). */
import { RESTRICTED_CATEGORY_CODE } from '@/lib/stadium';
import { isOnSale, type PublicEvent } from './types';

export type EventBadge = 'on_sale' | 'few_left' | 'sold_out' | 'coming_soon' | 'past' | 'cancelled';

export function badgeFor(
  ev: Pick<PublicEvent, 'status' | 'saleStartsAt' | 'startsAt' | 'saleEndsAt'>,
  sellThrough: number,
  now = Date.now(),
): EventBadge {
  if (ev.status === 'cancelled') return 'cancelled';
  if (ev.status === 'past' || ev.startsAt < now) return 'past';
  if (ev.status === 'sold_out' || sellThrough >= 0.9995) return 'sold_out';
  if (ev.status === 'draft' || (ev.saleStartsAt != null && ev.saleStartsAt > now)) return 'coming_soon';
  if (!isOnSale(ev as PublicEvent, now)) return 'coming_soon';
  return sellThrough >= 0.9 ? 'few_left' : 'on_sale';
}

/** Share of seats that are not available (held, sold or blocked), 0-1. */
export function sellThroughOf(statuses: Uint8Array): number {
  if (!statuses.length) return 0;
  let taken = 0;
  for (let i = 0; i < statuses.length; i++) if (statuses[i] !== 0) taken++;
  return taken / statuses.length;
}

/** The cheapest category price of an event (the restricted-view category aside), or null. */
export function fromPriceOf(event: PublicEvent): number | null {
  const prices = event.categories
    .filter((c) => c.code !== RESTRICTED_CATEGORY_CODE && c.priceMinor != null)
    .map((c) => c.priceMinor as number);
  return prices.length ? Math.min(...prices) : null;
}
