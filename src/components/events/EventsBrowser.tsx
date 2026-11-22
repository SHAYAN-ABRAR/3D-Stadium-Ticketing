'use client';
/**
 * The events list with filters for month and competition (PROMPT.md 8). Events live in the visitor's
 * browser (the data store), so the list loads after mount; filters are kept in the address (?month=,
 * ?competition=) so a filtered list can be shared or reloaded.
 */
import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useStoreQuery } from '@/data/hooks';
import { brand } from '@/config/brand';
import { formatDate } from '@/lib/format';
import { buttonClass } from '../ui/atoms';
import { useFormat } from '../useFormat';
import { EventCard, EventCardSkeleton } from './EventCard';

/** "2026-11": the month of an instant in the venue time zone. */
export function monthKey(at: number): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: brand.timeZone, year: 'numeric', month: '2-digit' })
    .formatToParts(new Date(at))
    .reduce<Record<string, string>>((o, x) => ((o[x.type] = x.value), o), {});
  return `${p.year}-${p.month}`;
}

export function EventsBrowser() {
  const t = useTranslations('events');
  const fmt = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const month = params.get('month') ?? '';
  const competition = params.get('competition') ?? '';
  const q = useStoreQuery('events:all', (s) => s.listEvents({ includePast: true }), { watchOrders: true });

  const all = useMemo(() => (q.status === 'ready' ? q.data : []), [q]);
  const months = useMemo(() => {
    const seen = new Map<string, number>();
    for (const s of all) {
      const k = monthKey(s.event.startsAt);
      if (!seen.has(k)) seen.set(k, s.event.startsAt);
    }
    return [...seen.entries()].sort((a, b) => a[1] - b[1]);
  }, [all]);
  const competitions = useMemo(() => [...new Set(all.map((s) => s.event.competition))].sort(), [all]);
  const shown = all.filter(
    (s) =>
      (!month || monthKey(s.event.startsAt) === month) &&
      (!competition || s.event.competition === competition),
  );
  const upcoming = shown.filter((s) => s.badge !== 'past');
  const past = shown.filter((s) => s.badge === 'past');

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const select =
    'min-h-11 w-full rounded-full border-2 border-ink/15 bg-paper px-4 font-semibold text-ink hover:border-ink/30 tab:w-auto';
  return (
    <div>
      <form
        className="flex flex-col gap-3 tab:flex-row tab:items-end"
        onSubmit={(e) => e.preventDefault()}
        aria-label={t('filters.label')}
      >
        <label className="flex flex-col gap-1 text-sm font-semibold text-muted">
          {t('filters.month')}
          <select className={select} value={month} onChange={(e) => setParam('month', e.target.value)}>
            <option value="">{t('filters.allMonths')}</option>
            {months.map(([k, at]) => (
              <option key={k} value={k}>
                {formatDate(at, 'monthYear', fmt.locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-muted">
          {t('filters.competition')}
          <select
            className={select}
            value={competition}
            onChange={(e) => setParam('competition', e.target.value)}
          >
            <option value="">{t('filters.allCompetitions')}</option>
            {competitions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {month || competition ? (
          <button
            type="button"
            className={buttonClass('link', 'self-start tab:self-end')}
            onClick={() => router.replace(pathname, { scroll: false })}
          >
            {t('filters.clear')}
          </button>
        ) : null}
      </form>

      <p className="sr-only" role="status">
        {q.status === 'ready' ? t('count', { count: upcoming.length }) : ''}
      </p>

      {q.status === 'loading' ? (
        <div className="mt-6 grid gap-4 desk:grid-cols-2">
          {[0, 1, 2, 3].map((k) => (
            <EventCardSkeleton key={k} />
          ))}
        </div>
      ) : q.status === 'error' ? (
        <p className="mt-6 rounded-card bg-danger-soft px-4 py-3 text-danger">{t('error')}</p>
      ) : (
        <>
          {upcoming.length ? (
            <ul className="mt-6 grid gap-4 desk:grid-cols-2">
              {upcoming.map((s) => (
                <li key={s.event.id} className="flex">
                  <div className="w-full">
                    <EventCard s={s} as="h2" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 rounded-card bg-paper-2 px-4 py-6 text-center text-muted">{t('empty')}</p>
          )}
          {past.length ? (
            <section className="mt-10" aria-labelledby="past-events">
              <h2 id="past-events" className="font-display text-2xl font-bold">
                {t('past')}
              </h2>
              <ul className="mt-4 grid gap-4 desk:grid-cols-2">
                {past.map((s) => (
                  <li key={s.event.id}>
                    <EventCard s={s} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
