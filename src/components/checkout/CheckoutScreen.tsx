'use client';
/**
 * Checkout in the browser: this tab's hold for the event, priced by the pricing module (the totals the
 * store will charge), then the form. Without an active hold it says so and links back to the seats.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { brand } from '@/config/brand';
import { useStoreQuery } from '@/data/hooks';
import { pricingOf } from '@/lib/events/types';
import { orderTotals } from '@/lib/orders';
import { labelOf, seatPricesMinor, type SeatLabel } from '@/lib/stadium';
import { buttonClass } from '../ui/atoms';
import { CheckoutForm } from './CheckoutForm';

export function CheckoutScreen({ slug }: { slug: string }) {
  const t = useTranslations('checkout');
  const q = useStoreQuery(`checkout:${slug}`, async (store) => {
    const event = await store.getEvent(slug);
    const hold = event ? await store.currentHold(event.id) : null;
    return { event, hold };
  });
  if (q.status === 'loading') return <p className="py-16 text-center text-muted">{t('loading')}</p>;
  const event = q.status === 'ready' ? q.data.event : null;
  const hold = q.status === 'ready' ? q.data.hold : null;
  if (!event || !hold) {
    return (
      <div className="card mx-auto max-w-xl px-6 py-6">
        <h1 className="font-display text-4xl leading-none font-bold">{t('noHoldTitle')}</h1>
        <p className="mt-3 text-muted">{t('noHoldBody', { minutes: brand.holdMinutes })}</p>
        <Link href={event ? `/events/${event.slug}` : '/'} className={buttonClass('primary', 'mt-5')}>
          {t('chooseSeats')}
        </Link>
      </div>
    );
  }
  const prices = seatPricesMinor(hold.seats, pricingOf(event));
  return (
    <CheckoutForm
      event={event}
      hold={hold}
      lines={hold.seats.map((seatIndex, k) => ({
        seatIndex,
        label: labelOf(seatIndex) as SeatLabel,
        priceMinor: prices[k],
      }))}
      totals={orderTotals(prices)}
    />
  );
}
