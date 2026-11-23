'use client';
/**
 * Checkout: the ticket stack (each with the match header), the hold countdown, the buyer form (name,
 * email, phone, optional holder names), a demo card form, the terms and Pay. Fee and tax lines appear only
 * when set.
 * Nothing is charged: the card is checked in the browser and only its brand and last four digits reach the
 * data store, which turns the hold into an order in one transaction.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getStore } from '@/data';
import {
  APPROVE_TEST_CARD,
  cardBrand,
  cardDigits,
  checkCard,
  DECLINE_TEST_CARD,
  demoApproves,
  formatCardNumber,
  formatExpiry,
  type CardField,
} from '@/data/card';
import type { HoldInfo } from '@/data/store';
import type { PublicEvent } from '@/lib/events/types';
import { formatCountdown } from '@/lib/format';
import type { OrderTotals } from '@/lib/orders';
import type { SeatLabel } from '@/lib/stadium';
import { MatchBanner } from '../ticket/MatchBanner';
import { Barcode, Ticket } from '../ticket/Ticket';
import { useTicketWords } from '../ticket/useTicketWords';
import { buttonClass, ChevronLeft } from '../ui/atoms';
import { useClock } from '../useClock';
import { PHONE, useMedia } from '../useMedia';
import { useFormat } from '../useFormat';

interface Line {
  seatIndex: number;
  label: SeatLabel;
  priceMinor: number;
}

export interface CheckoutFormProps {
  event: PublicEvent;
  hold: HoldInfo;
  lines: Line[];
  totals: OrderTotals;
}

type BuyerField = 'name' | 'email' | 'phone' | 'terms';
type Field = BuyerField | `card-${CardField}`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()\-.]{6,30}$/;
/** How long the demo "processes" a payment, so the button's state is visible. */
const PROCESSING_MS = 900;

interface Values {
  name: string;
  email: string;
  phone: string;
  terms: boolean;
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
  cardName: string;
}

function validate(v: Values): Field[] {
  const bad: Field[] = [];
  if (v.name.trim().length < 2) bad.push('name');
  if (!EMAIL_RE.test(v.email.trim())) bad.push('email');
  if (!PHONE_RE.test(v.phone.trim()) || (v.phone.match(/\d/g) ?? []).length < 6) bad.push('phone');
  const card = checkCard({ number: v.cardNumber, expiry: v.cardExpiry, cvc: v.cardCvc, name: v.cardName });
  for (const f of card.errors) bad.push(`card-${f}`);
  if (!v.terms) bad.push('terms');
  return bad;
}

const INPUT =
  'mt-1 block min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base text-ink aria-[invalid=true]:border-danger';

export function CheckoutForm({ event, hold, lines, totals }: CheckoutFormProps) {
  const t = useTranslations('checkout');
  const tt = useTranslations('tickets');
  const locale = useLocale();
  const fmt = useFormat();
  const words = useTicketWords();
  const router = useRouter();
  const phoneLayout = useMedia(PHONE);
  const now = useClock();
  const [values, setValues] = useState<Values>({
    name: '',
    email: '',
    phone: '',
    terms: false,
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
    cardName: '',
  });
  const [holders, setHolders] = useState<string[]>(() => lines.map(() => ''));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const left = now === null ? null : hold.expiresAt - now;
  const isExpired = expired || (left !== null && left <= 0);
  const errors = tried ? validate(values) : [];
  const count = lines.length;
  const detectedBrand = cardBrand(cardDigits(values.cardNumber));
  const eventLine = [
    event.competition,
    fmt.date(event.startsAt, 'medium'),
    fmt.date(event.startsAt, 'time'),
  ].join(' · ');
  const set = <K extends keyof Values>(k: K, v: Values[K]) => setValues((s) => ({ ...s, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || isExpired) return;
    const bad = validate(values);
    setTried(true);
    if (bad.length) {
      document.getElementById(`co-${bad[0]}`)?.focus();
      return;
    }
    setBusy(true);
    setProblem(null);
    const card = checkCard({
      number: values.cardNumber,
      expiry: values.cardExpiry,
      cvc: values.cardCvc,
      name: values.cardName,
    });
    await new Promise((r) => setTimeout(r, PROCESSING_MS));
    try {
      const r = await getStore().checkout({
        holdId: hold.id,
        buyer: { name: values.name, email: values.email, phone: values.phone },
        holders,
        payment: { brand: card.brand, last4: card.last4, approved: demoApproves(values.cardNumber) },
        locale,
      });
      if (r.ok) {
        router.push(`/orders/${r.code}?new=1`);
        return;
      }
      if (r.reason === 'expired') setExpired(true);
      else
        setProblem(
          r.reason === 'declined' ? t('card.declined', { card: DECLINE_TEST_CARD }) : t('errors.generic'),
        );
    } catch {
      setProblem(t('errors.generic'));
    }
    setBusy(false);
  };

  const fieldError = (f: Field) =>
    errors.includes(f) ? (
      <p id={`${f}-error`} className="mt-1 text-sm font-semibold text-danger">
        {t(f.startsWith('card-') ? `card.errors.${f.slice(5)}` : `errors.${f}`)}
      </p>
    ) : null;
  const described = (f: Field, hint?: boolean) =>
    [hint ? `${f}-hint` : '', errors.includes(f) ? `${f}-error` : ''].filter(Boolean).join(' ') || undefined;
  const input = (f: Field) => ({
    id: `co-${f}`,
    'aria-invalid': errors.includes(f),
    className: INPUT,
  });

  return (
    <div className="grid gap-6 desk:grid-cols-[minmax(0,1fr)_400px] desk:items-start">
      <section aria-labelledby="checkout-tickets">
        <Link href={`/events/${event.slug}`} className={buttonClass('link', 'text-sm')}>
          <ChevronLeft className="size-4" />
          {t('back')}
        </Link>
        <h1 className="mt-2 font-display text-5xl leading-none font-bold">{t('title')}</h1>
        <p className="mt-2 font-semibold">{event.title}</p>
        <p className="text-sm text-muted">{eventLine}</p>
        <h2 id="checkout-tickets" className="mt-6 font-display text-2xl font-bold">
          {t('tickets')} · {t('count', { count })}
        </h2>
        <ol className="mt-3 flex flex-col gap-4">
          {lines.map((l, k) => {
            const w = words(l.label);
            return (
              <li key={l.seatIndex}>
                <Ticket
                  label={tt('label', { n: k + 1, count })}
                  layout={phoneLayout ? 'stacked' : 'full'}
                  view={
                    <MatchBanner
                      homeTeam={event.homeTeam}
                      awayTeam={event.awayTeam}
                      homeColor={event.homeColor}
                      awayColor={event.awayColor}
                      startsAt={event.startsAt}
                      doorsAt={event.doorsAt}
                    />
                  }
                  eventLine={eventLine}
                  kicker={w.kicker}
                  title={w.title}
                  facts={w.facts}
                  currency={fmt.sign}
                  price={fmt.amount(l.priceMinor)}
                  code={
                    <Barcode seed={l.seatIndex * 7 + 1} className={phoneLayout ? 'h-21 w-11' : undefined} />
                  }
                  notch="var(--color-paper)"
                />
              </li>
            );
          })}
        </ol>
      </section>

      <aside className="desk:sticky desk:top-4">
        {isExpired ? (
          <div className="card px-5 py-5" role="alert">
            <h2 className="font-display text-3xl leading-none font-bold">{t('expiredTitle')}</h2>
            <p className="mt-2 text-muted">{t('expiredBody')}</p>
            <Link href={`/events/${event.slug}`} className={buttonClass('primary', 'mt-4')}>
              {t('chooseSeats')}
            </Link>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => void submit(e)}
            className="card px-5 py-5"
            aria-labelledby="checkout-details"
          >
            <p
              className="rounded-xl bg-paper-2 px-3 py-2 text-sm font-semibold"
              role="timer"
              aria-label={left !== null ? t('heldForLabel', { time: formatCountdown(left) }) : undefined}
            >
              {left !== null ? t('heldFor', { time: formatCountdown(left) }) : ' '}
            </p>
            <h2 id="checkout-details" className="mt-4 font-display text-2xl font-bold">
              {t('details')}
            </h2>
            <Row>
              <label htmlFor="co-name" className="font-semibold">
                {t('name')}
              </label>
              <input
                {...input('name')}
                name="name"
                autoComplete="name"
                required
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
                aria-describedby={described('name')}
              />
              {fieldError('name')}
            </Row>
            <Row>
              <label htmlFor="co-email" className="font-semibold">
                {t('email')}
              </label>
              <input
                {...input('email')}
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={values.email}
                onChange={(e) => set('email', e.target.value)}
                aria-describedby={described('email', true)}
              />
              <p id="email-hint" className="mt-1 text-sm text-muted">
                {t('emailHint')}
              </p>
              {fieldError('email')}
            </Row>
            <Row>
              <label htmlFor="co-phone" className="font-semibold">
                {t('phone')}
              </label>
              <input
                {...input('phone')}
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                value={values.phone}
                onChange={(e) => set('phone', e.target.value)}
                aria-describedby={described('phone', true)}
              />
              <p id="phone-hint" className="mt-1 text-sm text-muted">
                {t('phoneHint')}
              </p>
              {fieldError('phone')}
            </Row>

            <details className="mt-4 rounded-xl border border-line px-3 py-2">
              <summary className="min-h-9 cursor-pointer py-1.5 font-semibold">{t('holders')}</summary>
              <p className="text-sm text-muted">{t('holdersHint')}</p>
              {lines.map((l, k) => (
                <Row key={l.seatIndex}>
                  <label htmlFor={`co-holder-${k}`} className="text-sm font-semibold">
                    {t('holderFor', { seat: words(l.label).short })}
                  </label>
                  <input
                    id={`co-holder-${k}`}
                    autoComplete="off"
                    maxLength={80}
                    value={holders[k]}
                    placeholder={values.name || undefined}
                    onChange={(e) => setHolders((h) => h.map((x, i) => (i === k ? e.target.value : x)))}
                    className={INPUT}
                  />
                </Row>
              ))}
            </details>

            <h2 className="mt-5 font-display text-2xl font-bold">{t('card.title')}</h2>
            <div className="mt-2 rounded-xl bg-paper-2 px-3 py-2 text-sm">
              <p>{t('card.demo')}</p>
              <p className="mt-1 text-muted">
                {t('card.testCards', { approve: APPROVE_TEST_CARD, decline: DECLINE_TEST_CARD })}
              </p>
              <button
                type="button"
                className={buttonClass('link', 'min-h-9 text-sm')}
                onClick={() =>
                  setValues((s) => ({
                    ...s,
                    cardNumber: APPROVE_TEST_CARD,
                    cardExpiry: formatExpiry(
                      `12${String((new Date().getFullYear() + 3) % 100).padStart(2, '0')}`,
                    ),
                    cardCvc: '123',
                    cardName: s.cardName || s.name,
                  }))
                }
              >
                {t('card.useTestCard')}
              </button>
            </div>
            <Row>
              <label htmlFor="co-card-number" className="font-semibold">
                {t('card.number')}
              </label>
              <div className="relative">
                <input
                  {...input('card-number')}
                  autoComplete="cc-number"
                  inputMode="numeric"
                  value={values.cardNumber}
                  onChange={(e) => set('cardNumber', formatCardNumber(e.target.value))}
                  aria-describedby={described('card-number')}
                  className={`${INPUT} pr-28 font-mono tracking-wide`}
                />
                {values.cardNumber ? (
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm font-semibold text-muted">
                    {t(`card.brand.${detectedBrand}`)}
                  </span>
                ) : null}
              </div>
              {fieldError('card-number')}
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row>
                <label htmlFor="co-card-expiry" className="font-semibold">
                  {t('card.expiry')}
                </label>
                <input
                  {...input('card-expiry')}
                  autoComplete="cc-exp"
                  inputMode="numeric"
                  placeholder="MM/YY"
                  value={values.cardExpiry}
                  onChange={(e) => set('cardExpiry', formatExpiry(e.target.value))}
                  aria-describedby={described('card-expiry')}
                />
                {fieldError('card-expiry')}
              </Row>
              <Row>
                <label htmlFor="co-card-cvc" className="font-semibold">
                  {t('card.cvc')}
                </label>
                <input
                  {...input('card-cvc')}
                  autoComplete="cc-csc"
                  inputMode="numeric"
                  maxLength={4}
                  value={values.cardCvc}
                  onChange={(e) => set('cardCvc', cardDigits(e.target.value))}
                  aria-describedby={described('card-cvc')}
                />
                {fieldError('card-cvc')}
              </Row>
            </div>
            <Row>
              <label htmlFor="co-card-name" className="font-semibold">
                {t('card.name')}
              </label>
              <input
                {...input('card-name')}
                autoComplete="cc-name"
                value={values.cardName}
                onChange={(e) => set('cardName', e.target.value)}
                aria-describedby={described('card-name')}
              />
              {fieldError('card-name')}
            </Row>

            <h2 className="mt-5 font-display text-2xl font-bold">{t('summary')}</h2>
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1">
              <dt>
                {t('subtotal')} ({t('count', { count })})
              </dt>
              <dd className="pl-4 text-right">{fmt.money(totals.subtotalMinor)}</dd>
              {totals.feesMinor > 0 ? (
                <>
                  <dt>{t('fees')}</dt>
                  <dd className="pl-4 text-right">{fmt.money(totals.feesMinor)}</dd>
                </>
              ) : null}
              {totals.taxMinor > 0 ? (
                <>
                  <dt>{t('tax')}</dt>
                  <dd className="pl-4 text-right">{fmt.money(totals.taxMinor)}</dd>
                </>
              ) : null}
              <dt className="mt-1 border-t border-line pt-2 font-bold">{t('total')}</dt>
              <dd className="mt-1 border-t border-line pt-2 pl-4 text-right font-display text-2xl leading-none font-bold text-pick-ink">
                {fmt.money(totals.totalMinor)}
              </dd>
            </dl>

            <div className="mt-4 flex items-start gap-3">
              <input
                id="co-terms"
                type="checkbox"
                checked={values.terms}
                onChange={(e) => set('terms', e.target.checked)}
                aria-invalid={errors.includes('terms')}
                aria-describedby={described('terms')}
                className="mt-0.5 size-6 flex-none accent-pick"
              />
              <label htmlFor="co-terms" className="text-sm">
                {t.rich('terms', {
                  terms: (c: ReactNode) => (
                    <Link href="/terms" target="_blank" className="font-semibold underline">
                      {c}
                    </Link>
                  ),
                  privacy: (c: ReactNode) => (
                    <Link href="/privacy" target="_blank" className="font-semibold underline">
                      {c}
                    </Link>
                  ),
                })}
              </label>
            </div>
            {fieldError('terms')}

            {errors.length ? (
              <p role="alert" className="mt-4 text-sm font-semibold text-danger">
                {t('fixErrors', { count: errors.length })}
              </p>
            ) : null}
            {problem ? (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger"
              >
                {problem}
              </p>
            ) : null}
            <button type="submit" disabled={busy} className={buttonClass('primary', 'mt-4 w-full text-lg')}>
              {busy ? t('card.processing') : t('pay', { amount: fmt.money(totals.totalMinor) })}
            </button>
            <p className="mt-2 text-center text-xs text-muted">{t('card.nothingCharged')}</p>
          </form>
        )}
      </aside>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="mt-3">{children}</div>;
}
