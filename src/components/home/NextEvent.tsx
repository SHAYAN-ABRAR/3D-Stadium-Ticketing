'use client';
/** The next match on sale, with a live countdown to kick-off and "Choose your seats" (home hero). */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { EventSummary } from '@/data/store';
import { buttonClass } from '../ui/atoms';
import { EventBadgeChip } from '../events/EventCard';
import { MatchTitle } from '../events/TeamFlag';
import { useClock } from '../useClock';
import { useFormat } from '../useFormat';

function Countdown({ to }: { to: number }) {
  const t = useTranslations('home.countdown');
  const fmt = useFormat();
  const now = useClock();
  if (now === null) return <div className="h-[62px]" aria-hidden />;
  const left = Math.max(0, to - now),
    s = Math.floor(left / 1000);
  const parts: [string, number][] = [
    ['days', Math.floor(s / 86400)],
    ['hours', Math.floor((s % 86400) / 3600)],
    ['minutes', Math.floor((s % 3600) / 60)],
    ['seconds', s % 60],
  ];
  return (
    <div className="grid grid-cols-4 gap-2" role="timer" aria-label={t('label')}>
      {parts.map(([k, v]) => (
        <div key={k} className="rounded-[10px] bg-paper-2 px-1 py-1.5 text-center">
          <div className="font-display text-[28px] leading-none font-bold tabular-nums">
            {k === 'days' ? fmt.num(v) : fmt.num(v).padStart(2, fmt.num(0))}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{t(k)}</div>
        </div>
      ))}
    </div>
  );
}

export function NextEventCard({ s, loading }: { s: EventSummary | null; loading: boolean }) {
  const t = useTranslations('home');
  const fmt = useFormat();
  if (loading)
    return <div className="card h-[300px] w-full max-w-[380px] animate-pulse bg-paper/90" aria-hidden />;
  if (!s)
    return (
      <div className="card w-full max-w-[380px] p-5 text-ink">
        <p className="font-semibold">{t('noEvent')}</p>
        <Link href="/events" className={buttonClass('dark', 'mt-3 text-[15px]')}>
          {t('allEvents')}
        </Link>
      </div>
    );
  const e = s.event;
  return (
    <section className="card w-full max-w-[380px] p-5 text-ink" aria-labelledby="next-event">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold tracking-wide text-pick-ink uppercase">{t('nextEvent')}</p>
        <EventBadgeChip badge={s.badge} />
      </div>
      <p className="mt-2 text-sm font-semibold text-muted">{e.competition}</p>
      <h2 id="next-event" className="font-display text-[26px] leading-tight font-bold">
        <MatchTitle
          homeTeam={e.homeTeam}
          awayTeam={e.awayTeam}
          homeColor={e.homeColor}
          awayColor={e.awayColor}
        />
      </h2>
      <p className="mt-1 text-sm text-muted">
        {fmt.date(e.startsAt, 'medium')} · {t('kickoffAt', { time: fmt.date(e.startsAt, 'time') })}
      </p>
      <div className="mt-4">
        <Countdown to={e.startsAt} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        {s.fromPriceMinor != null ? (
          <p className="text-sm">
            <span className="text-muted">{t('from')} </span>
            <span className="font-display text-xl font-bold text-pick-ink">
              {fmt.money(s.fromPriceMinor)}
            </span>
          </p>
        ) : (
          <span />
        )}
        <Link href={`/events/${e.slug}`} className={buttonClass('primary', 'text-[15px]')}>
          {t('choose')}
        </Link>
      </div>
    </section>
  );
}
