'use client';
/** Upcoming matches on the home page (the next four), with a link to the full list. */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { buttonClass } from '../ui/atoms';
import { EventCard, EventCardSkeleton } from '../events/EventCard';
import { useUpcomingEvents } from '../events/useEvents';

export function UpcomingEvents() {
  const t = useTranslations('home');
  const q = useUpcomingEvents();
  return (
    <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="upcoming">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="upcoming" className="font-display text-4xl font-bold">
          {t('upcoming')}
        </h2>
        <Link href="/events" className={buttonClass('link')}>
          {t('allEvents')}
        </Link>
      </div>
      {q.status === 'loading' ? (
        <div className="mt-6 grid gap-4 desk:grid-cols-2">
          {[0, 1, 2, 3].map((k) => (
            <EventCardSkeleton key={k} />
          ))}
        </div>
      ) : q.status === 'error' ? (
        <p className="mt-6 rounded-card bg-danger-soft px-4 py-3 text-danger">{t('eventsError')}</p>
      ) : (
        <ul className="mt-6 grid gap-4 desk:grid-cols-2">
          {q.data.slice(0, 4).map((s) => (
            <li key={s.event.id}>
              <EventCard s={s} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
