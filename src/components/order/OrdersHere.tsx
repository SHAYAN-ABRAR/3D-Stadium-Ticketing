'use client';
/** The orders saved in this browser, newest first (the data store keeps them; nothing leaves the browser). */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useStoreQuery } from '@/data/hooks';
import { MatchTitle } from '../events/TeamFlag';
import { useFormat } from '../useFormat';

export function OrdersHere() {
  const t = useTranslations('lookup');
  const fmt = useFormat();
  const q = useStoreQuery('orders', (store) => store.orders(), { watchOrders: true });
  if (q.status !== 'ready') return null;
  return (
    <section className="card mt-6 px-6 py-6" aria-labelledby="orders-here">
      <h2 id="orders-here" className="font-display text-2xl font-bold">
        {t('ordersHere')}
      </h2>
      {q.data.length ? (
        <ul className="mt-3 divide-y divide-line">
          {q.data.map((o) => (
            <li key={o.id}>
              <Link
                href={`/orders/${o.code}`}
                className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-4 py-2.5 hover:text-pick-ink"
              >
                <span>
                  <b className="font-display text-xl tracking-wide">{o.code}</b>{' '}
                  <span className="text-muted">
                    <MatchTitle
                      homeTeam={o.event.homeTeam}
                      awayTeam={o.event.awayTeam}
                      homeColor={o.event.homeColor}
                      awayColor={o.event.awayColor}
                      vsClassName="text-muted"
                    />
                  </span>
                </span>
                <span className="text-sm text-muted">
                  {t('orderLine', { count: o.tickets.length, date: fmt.date(o.event.startsAt, 'medium') })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-muted">{t('noOrders')}</p>
      )}
    </section>
  );
}
