'use client';
/**
 * An event in a list (PROMPT.md 8): a date block, the teams with their flags, kick-off in venue time, the
 * "from" price, an availability meter and a status badge (On sale, Few left, Sold out, Coming soon).
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { EventSummary } from '@/data/store';
import type { EventBadge } from '@/lib/events/summary';
import { dateParts } from '@/lib/format';
import { buttonClass, Meter } from '../ui/atoms';
import { useFormat } from '../useFormat';
import { MatchTitle } from './TeamFlag';

const BADGE: Record<EventBadge, string> = {
  on_sale: 'bg-success-soft text-success',
  few_left: 'bg-[#fff0e5] text-pick-ink',
  sold_out: 'bg-paper-2 text-muted',
  coming_soon: 'bg-[#e8eefb] text-seat-blue',
  past: 'bg-paper-2 text-muted',
  cancelled: 'bg-danger-soft text-danger',
};

export function EventBadgeChip({ badge }: { badge: EventBadge }) {
  const t = useTranslations('events.badge');
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${BADGE[badge]}`}>
      {t(badge)}
    </span>
  );
}

export function EventCard({ s, as: Heading = 'h3' }: { s: EventSummary; as?: 'h2' | 'h3' }) {
  const t = useTranslations('events');
  const fmt = useFormat();
  const e = s.event;
  const d = dateParts(e.startsAt, fmt.locale);
  const open = s.badge === 'on_sale' || s.badge === 'few_left';
  const fixture = `${e.homeTeam} v ${e.awayTeam}`;
  // Formatted for the locale (Bengali digits in Bengali).
  const sold = t('soldShare', { percent: fmt.num(Math.round(s.sellThrough * 100)) });
  return (
    <article className="flex overflow-hidden rounded-card border border-line bg-paper shadow-soft">
      <div
        className="flex w-19.5 flex-none flex-col items-center justify-center bg-ink px-2 py-4 text-white tab:w-22"
        aria-hidden
      >
        <span className="text-xs font-semibold tracking-wide uppercase opacity-80">{d.weekday}</span>
        <span className="font-display text-[40px] leading-none font-bold">{d.day}</span>
        <span className="text-sm font-semibold uppercase">{d.month}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-muted">{e.competition}</span>
          <EventBadgeChip badge={s.badge} />
        </div>
        <Heading className="font-display text-[22px] leading-tight font-bold tab:text-2xl">
          <MatchTitle
            homeTeam={e.homeTeam}
            awayTeam={e.awayTeam}
            homeColor={e.homeColor}
            awayColor={e.awayColor}
          />
        </Heading>
        <p className="text-sm text-muted">
          <span className="sr-only">{fmt.date(e.startsAt, 'long')} · </span>
          {t('kickoff', { time: d.time })}
        </p>
        {s.badge !== 'past' && s.badge !== 'cancelled' ? (
          <div className="max-w-64">
            <Meter value={s.sellThrough} label={sold} />
            <p className="mt-1 text-xs text-muted">{sold}</p>
          </div>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-sm">
            {s.fromPriceMinor != null && open ? (
              <>
                <span className="text-muted">{t('from')} </span>
                <span className="font-display text-xl font-bold text-pick-ink">
                  {fmt.money(s.fromPriceMinor)}
                </span>
              </>
            ) : null}
          </p>
          <Link
            href={`/events/${e.slug}`}
            className={buttonClass(open ? 'primary' : 'outline', 'text-[15px]')}
          >
            {open ? t('choose') : t('view')}
            <span className="sr-only"> · {fixture}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

/** A placeholder card while the events load. */
export function EventCardSkeleton() {
  return (
    <div className="flex h-47 overflow-hidden rounded-card border border-line bg-paper" aria-hidden>
      <div className="w-19.5 flex-none bg-paper-2 tab:w-22" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="h-4 w-24 animate-pulse rounded bg-paper-2" />
        <div className="h-7 w-3/4 animate-pulse rounded bg-paper-2" />
        <div className="h-4 w-32 animate-pulse rounded bg-paper-2" />
        <div className="mt-auto h-11 w-40 animate-pulse self-end rounded-full bg-paper-2" />
      </div>
    </div>
  );
}
