'use client';
/**
 * The order page in the browser: the order comes from the data store (orders live in the browser that
 * bought them) and follows changes from other tabs. QR codes are built here from the ticket tokens.
 */
import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useStoreQuery } from '@/data/hooks';
import { qrPath, ticketUrl } from '@/lib/tickets/qr';
import { buttonClass } from '../ui/atoms';
import { OrderView } from './OrderView';

export function OrderScreen({ code, fresh }: { code: string; fresh: boolean }) {
  const t = useTranslations('order');
  const q = useStoreQuery(`order:${code}`, (store) => store.order(code), { watchOrders: true });
  const order = q.status === 'ready' ? q.data : null;
  const qr = useMemo(
    () =>
      Object.fromEntries(
        (order?.tickets ?? []).map((tk) => [tk.id, qrPath(ticketUrl(window.location.origin, tk.token))]),
      ),
    [order],
  );
  if (q.status === 'loading') return <p className="py-16 text-center text-muted">{t('loading')}</p>;
  if (!order) {
    return (
      <div className="card mx-auto max-w-xl px-6 py-6">
        <h1 className="font-display text-4xl leading-none font-bold">{t('notFoundTitle')}</h1>
        <p className="mt-3 text-muted">{t('notFoundBody')}</p>
        <Link href="/orders/lookup" className={buttonClass('primary', 'mt-5')}>
          {t('findOrder')}
        </Link>
      </div>
    );
  }
  return <OrderView order={order} qr={qr} fresh={fresh} />;
}
