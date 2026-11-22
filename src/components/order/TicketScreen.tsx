'use client';
/**
 * One ticket, phone first: a big QR code, the "turn your brightness up" hint, the seat and the view. The
 * ticket is read from the data store, so it opens in the browser that bought it.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { brand } from '@/config/brand';
import { getStore } from '@/data';
import { useStoreQuery } from '@/data/hooks';
import { isTicketToken } from '@/lib/tickets/codes';
import { qrPath, ticketUrl } from '@/lib/tickets/qr';
import { QrCode } from '../ticket/QrCode';
import { TicketPlan } from '../ticket/TicketPlan';
import { useTicketWords } from '../ticket/useTicketWords';
import { buttonClass } from '../ui/atoms';
import { useFormat } from '../useFormat';

export function TicketScreen({ token }: { token: string }) {
  const t = useTranslations('ticketPage');
  const tt = useTranslations('tickets');
  const fmt = useFormat();
  const words = useTicketWords();
  const q = useStoreQuery(
    `ticket:${token}`,
    async (store) => (isTicketToken(token) ? store.ticket(token) : null),
    { watchOrders: true },
  );
  const found = q.status === 'ready' ? q.data : null;
  const view = useTicketView(found?.ticket.hasView ? found.ticket.id : null);
  const qr = useMemo(() => (found ? qrPath(ticketUrl(window.location.origin, token)) : null), [found, token]);

  if (q.status === 'loading') return <p className="py-16 text-center text-muted">{t('loading')}</p>;
  if (!found || !qr) {
    return (
      <div className="card px-6 py-6">
        <h1 className="font-display text-4xl leading-none font-bold">{t('notFoundTitle')}</h1>
        <p className="mt-3 text-muted">{t('notFoundBody')}</p>
        <Link href="/orders/lookup" className={buttonClass('primary', 'mt-5')}>
          {t('findOrder')}
        </Link>
      </div>
    );
  }
  const { ticket, order } = found;
  const w = words(ticket.label);
  const valid = ticket.status === 'valid' && order.status === 'paid';
  return (
    <article className="card overflow-hidden" aria-labelledby="ticket-title">
      <div className="bg-ink px-5 py-4 text-white">
        <p className="text-sm font-semibold opacity-80">
          {order.event.competition} · {fmt.date(order.event.startsAt, 'medium')}
        </p>
        <h1 id="ticket-title" className="font-display text-3xl leading-tight font-bold">
          {order.event.title}
        </h1>
        <p className="text-sm opacity-90">
          {tt('kickoff', { time: fmt.date(order.event.startsAt, 'time') })} ·{' '}
          {tt('doors', { time: fmt.date(order.event.doorsAt, 'time') })}
        </p>
      </div>

      {valid ? null : (
        <p role="status" className="bg-danger-soft px-5 py-3 font-semibold text-danger">
          {ticket.status === 'used' && ticket.usedAt
            ? t('used', { time: fmt.date(ticket.usedAt, 'time') })
            : t('void')}
        </p>
      )}

      <div className={`px-6 pt-6 ${valid ? '' : 'opacity-40'}`}>
        <QrCode
          path={qr.d}
          size={qr.size}
          label={tt('qrAlt', { seat: w.short })}
          className="mx-auto aspect-square w-full max-w-[300px]"
        />
      </div>
      <p className="px-6 pt-3 text-center text-sm font-semibold text-muted">{t('brightness')}</p>

      <div className="px-5 pt-5">
        <p className="text-sm font-semibold text-muted">{w.kicker}</p>
        <p className="font-display text-4xl leading-none font-bold">{w.title}</p>
        <dl className="mt-3 flex flex-wrap gap-6">
          {w.facts.map((f) => (
            <div key={f.label}>
              <dt className="text-[13px] font-semibold text-muted">{f.label}</dt>
              <dd className="font-display text-3xl leading-none font-bold">{f.value}</dd>
            </div>
          ))}
        </dl>
        {ticket.holderName ? (
          <p className="mt-3">
            {tt('holder')}: <b>{ticket.holderName}</b>
          </p>
        ) : null}
      </div>

      <div className="relative mx-5 mt-5 h-48 overflow-hidden rounded-xl bg-[#27313d]">
        {view ? (
          // A picture kept in this browser (blob URL): next/image can't optimise it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={view} alt={tt('viewAlt')} className="absolute inset-0 size-full object-cover" />
        ) : (
          <TicketPlan label={ticket.label} title={tt('planAlt')} />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5">
        <p className="text-sm text-muted">
          {t('order', { code: order.code })} · {brand.name}
        </p>
        <Link href={`/orders/${order.code}`} className={buttonClass('link', 'text-sm')}>
          {t('allTickets')}
        </Link>
      </div>
    </article>
  );
}

function useTicketView(ticketId: string | null): string | null {
  const [url, setUrl] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!ticketId) return;
    let alive = true;
    let made: string | null = null;
    void getStore()
      .ticketView(ticketId)
      .then((blob) => {
        if (!alive || !blob) return;
        made = URL.createObjectURL(blob);
        setUrl({ id: ticketId, url: made });
      });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [ticketId]);
  return url && url.id === ticketId ? url.url : null;
}
