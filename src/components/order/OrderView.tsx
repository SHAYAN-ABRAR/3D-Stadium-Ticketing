'use client';
/**
 * The order page. Paid: the ticket "prints" out of a slot and its stub tears off (skipped with reduced
 * motion), then the tickets with QR codes, view pictures, gates and doors time; PDF and calendar downloads
 * made in the browser; the confirmation email in the demo outbox (preview, or another copy). Cancelled or
 * refunded orders say so.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { brand } from '@/config/brand';
import { getStore } from '@/data';
import { downloadBlob } from '@/lib/download';
import { loadMessages } from '@/lib/messages';
import type { OrderInfo, OrderTicketInfo } from '@/lib/orders';
import { englishSeatLine } from '@/lib/ticket-text';
import { Barcode, Ticket } from '../ticket/Ticket';
import { QrCode } from '../ticket/QrCode';
import { TicketPlan } from '../ticket/TicketPlan';
import { useTicketWords } from '../ticket/useTicketWords';
import { buttonClass } from '../ui/atoms';
import { PHONE, useMedia } from '../useMedia';
import { useFormat } from '../useFormat';

export interface OrderViewProps {
  order: OrderInfo;
  /** QR module paths per ticket id. */
  qr: Record<string, { size: number; d: string }>;
  /** Just paid: play the print animation. */
  fresh: boolean;
}

export function OrderView(props: OrderViewProps) {
  return props.order.status === 'paid' ? <PaidOrder {...props} /> : <ClosedOrder order={props.order} />;
}

/** Object URLs of the tickets' seat-view pictures (kept by the data store). */
function useTicketViews(tickets: OrderTicketInfo[]): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());
  const key = tickets
    .filter((t) => t.hasView)
    .map((t) => t.id)
    .join(',');
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    const ids = key ? key.split(',') : [];
    void Promise.all(ids.map((id) => getStore().ticketView(id))).then((blobs) => {
      if (!alive) return;
      const out = new Map<string, string>();
      blobs.forEach((b, k) => {
        if (!b) return;
        const url = URL.createObjectURL(b);
        made.push(url);
        out.set(ids[k], url);
      });
      setUrls(out);
    });
    return () => {
      alive = false;
      for (const u of made) URL.revokeObjectURL(u);
    };
  }, [key]);
  return urls;
}

function PaidOrder({ order, qr, fresh }: OrderViewProps) {
  const t = useTranslations('order');
  const tt = useTranslations('tickets');
  const fmt = useFormat();
  const words = useTicketWords();
  const phone = useMedia(PHONE);
  const tickets = order.tickets;
  const views = useTicketViews(tickets);
  const eventLine = [
    order.event.competition,
    fmt.date(order.event.startsAt, 'medium'),
    fmt.date(order.event.startsAt, 'time'),
  ].join(' · ');
  const times = t('doorsKickoff', {
    doors: fmt.date(order.event.doorsAt, 'time'),
    kickoff: fmt.date(order.event.startsAt, 'time'),
  });

  useEffect(() => {
    // Reloading shouldn't print the tickets again.
    if (fresh) window.history.replaceState(null, '', `/orders/${order.code}`);
  }, [fresh, order.code]);

  const first = tickets[0];
  return (
    <>
      {fresh && first ? (
        <PrintIntro
          title={words(first.label).title}
          line={order.event.title}
          price={fmt.amount(first.priceMinor)}
          seed={first.seatIndex}
          printing={t('printing')}
        />
      ) : null}
      <div className={fresh ? 'motion-safe:animate-rise-in' : undefined}>
        <p className="text-sm font-semibold text-muted">{t('metaTitle', { code: order.code })}</p>
        <h1 className="mt-1 font-display text-5xl leading-none font-bold tab:text-6xl">{t('paidTitle')}</h1>
        <p className="mt-3 text-lg">{t('thanks', { name: order.name, code: order.code })}</p>
        <p className="text-muted">{t('emailed', { email: order.email })}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <PdfButton order={order} />
          <CalendarButton order={order} />
          <EmailAgain code={order.code} />
          <Link href={`/orders/${order.code}/email`} className={buttonClass('link')}>
            {t('emailPreview')}
          </Link>
        </div>
        <div className="mt-5 rounded-card bg-paper-2 px-4 py-3">
          <p className="font-semibold">{order.event.title}</p>
          <p className="text-sm text-muted">
            {fmt.date(order.event.startsAt, 'long')} · {times}
          </p>
          <p className="text-sm text-muted">{brand.name}</p>
        </div>
        <ol className="mt-5 flex flex-col gap-5" aria-label={t('ticketsLabel')}>
          {tickets.map((tk, k) => {
            const w = words(tk.label);
            const src = views.get(tk.id);
            const code = qr[tk.id];
            return (
              <li key={tk.id}>
                <Ticket
                  label={tt('label', { n: k + 1, count: tickets.length })}
                  layout={phone ? 'stacked' : 'full'}
                  view={
                    src ? (
                      // A picture kept in this browser (blob URL): next/image can't optimise it.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt={tt('viewAlt')}
                        className="absolute inset-0 size-full object-cover"
                      />
                    ) : (
                      <TicketPlan label={tk.label} title={tt('planAlt')} />
                    )
                  }
                  chip={src ? tt('yourView') : undefined}
                  eventLine={eventLine}
                  kicker={w.kicker}
                  title={w.title}
                  facts={w.facts}
                  actions={
                    <Link href={`/tickets/${tk.token}`} className={buttonClass('dark')}>
                      {t('openTicket')}
                    </Link>
                  }
                  note={
                    <>
                      {tk.holderName ? (
                        <p>
                          {tt('holder')}: <b className="text-ink">{tk.holderName}</b>
                        </p>
                      ) : null}
                      <p>
                        {tk.label.kind === 'vip' ? t('showAtVip') : t('showAtGate', { gate: tk.label.gate })}{' '}
                        {times}
                      </p>
                    </>
                  }
                  currency={order.currency}
                  price={fmt.amount(tk.priceMinor)}
                  code={
                    code ? (
                      <QrCode
                        path={code.d}
                        size={code.size}
                        label={tt('qrAlt', { seat: w.short })}
                        className={phone ? 'size-20' : 'size-25'}
                      />
                    ) : null
                  }
                  stamp={tk.status === 'valid' ? undefined : tt(`status.${tk.status}`)}
                  notch="var(--color-paper)"
                />
              </li>
            );
          })}
        </ol>
        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-muted">
            {t('paidWith', { brand: t(`brand.${order.payment.brand}`), last4: order.payment.last4 })}
          </p>
          <p className="text-lg">
            {t('total')}:{' '}
            <b className="font-display text-2xl text-pick-ink">{fmt.money(order.totals.totalMinor)}</b>
          </p>
        </div>
      </div>
    </>
  );
}

/** The decorative print animation (the content underneath is already in the page for assistive tech). */
function PrintIntro({
  title,
  line,
  price,
  seed,
  printing,
}: {
  title: string;
  line: string;
  price: string;
  seed: number;
  printing: string;
}) {
  return (
    <div
      data-print-intro
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-paper animate-intro-out motion-reduce:hidden"
    >
      <div className="w-[min(520px,calc(100%-32px))]">
        <div className="relative z-10 mx-1 h-5 rounded-full bg-ink shadow-soft" />
        <div className="-mt-2.5 overflow-hidden px-3 pt-2.5 pb-40">
          <div className="flex animate-ticket-print drop-shadow-xl">
            <div className="min-w-0 flex-1 rounded-l-card bg-paper px-5 py-5">
              <p className="truncate text-[13px] font-semibold text-muted">{line}</p>
              <p className="mt-2 font-display text-4xl leading-none font-bold">{title}</p>
              <p className="mt-3 h-2 w-2/3 rounded-full bg-line" />
              <p className="mt-2 h-2 w-1/2 rounded-full bg-line" />
            </div>
            <div className="flex w-26 flex-none origin-top-left animate-stub-tear flex-col items-center justify-between rounded-r-card border-l-2 border-dashed border-[#d6d0c3] bg-paper px-2 py-3">
              <Barcode seed={seed} className="h-18 w-9" />
              <span className="font-display text-2xl leading-none font-bold text-pick">{price}</span>
            </div>
          </div>
        </div>
        <p className="-mt-32 text-center font-semibold text-muted">{printing}</p>
      </div>
    </div>
  );
}

/** One A6 page per ticket, made in the browser (pdf-lib loads on demand; the PDF is in English). */
function PdfButton({ order }: { order: OrderInfo }) {
  const t = useTranslations('order');
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const [{ buildTicketsPdf }, messages] = await Promise.all([
        import('@/lib/tickets/pdf'),
        loadMessages('en'),
      ]);
      const views = await Promise.all(order.tickets.map((tk) => getStore().ticketView(tk.id)));
      const bytes = await buildTicketsPdf({
        orderCode: order.code,
        event: order.event,
        origin: window.location.origin,
        messages,
        tickets: await Promise.all(
          order.tickets
            .filter((tk) => tk.status !== 'void')
            .map(async (tk) => {
              const blob = views[order.tickets.indexOf(tk)];
              return { ...tk, view: blob ? new Uint8Array(await blob.arrayBuffer()) : null };
            }),
        ),
      });
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${order.code}.pdf`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" disabled={busy} onClick={() => void make()} className={buttonClass('dark')}>
      {busy ? t('pdfMaking') : t('pdf')}
    </button>
  );
}

/** The match as a calendar file (UTC times plus the venue's time zone). */
function CalendarButton({ order }: { order: OrderInfo }) {
  const t = useTranslations('order');
  const make = async () => {
    const { buildIcs } = await import('@/lib/tickets/ics');
    const origin = window.location.origin;
    const ics = buildIcs({
      uid: `${order.code}@${window.location.host}`,
      title: `${order.event.title} (${order.event.competition})`,
      description: [
        `Order ${order.code}`,
        ...order.tickets.map((tk) => englishSeatLine(tk.label)),
        `${origin}/orders/${order.code}`,
      ].join('\n'),
      location: `${brand.name}, ${brand.address.line1}, ${brand.address.line2}, ${brand.address.city}, ${brand.address.country}`,
      url: `${origin}/orders/${order.code}`,
      start: new Date(order.event.startsAt),
      created: new Date(order.createdAt),
    });
    downloadBlob(new Blob([ics], { type: 'text/calendar' }), `${order.code}.ics`);
  };
  return (
    <button type="button" onClick={() => void make()} className={buttonClass('quiet')}>
      {t('calendar')}
    </button>
  );
}

function EmailAgain({ code }: { code: string }) {
  const t = useTranslations('order');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const send = async () => {
    setState('sending');
    const msg = await getStore()
      .resendEmail(code)
      .catch(() => null);
    setState(msg ? 'sent' : 'error');
  };
  return (
    <>
      <button
        type="button"
        disabled={state === 'sending'}
        onClick={() => void send()}
        className={buttonClass('quiet')}
      >
        {state === 'sending' ? t('emailSending') : t('emailAgain')}
      </button>
      <span role="status" className="text-sm font-semibold">
        {state === 'sent' ? (
          <span className="text-success">{t('emailSent')}</span>
        ) : state === 'error' ? (
          <span className="text-danger">{t('emailError')}</span>
        ) : null}
      </span>
    </>
  );
}

function ClosedOrder({ order }: { order: OrderInfo }) {
  const t = useTranslations('order');
  const refunded = order.status === 'refunded';
  return (
    <div className="card mx-auto max-w-xl px-6 py-6">
      <p className="text-sm font-semibold text-muted">{t('metaTitle', { code: order.code })}</p>
      <h1 className="mt-1 font-display text-4xl leading-none font-bold">
        {refunded ? t('refundedTitle') : t('cancelledTitle')}
      </h1>
      <p className="mt-3 text-muted">{refunded ? t('refundedBody') : t('cancelledBody')}</p>
      <Link href={`/events/${order.event.slug}`} className={buttonClass('primary', 'mt-5')}>
        {t('chooseAgain')}
      </Link>
    </div>
  );
}
