/**
 * The match on a ticket, where a picture would go: both teams' flags with "VS" between them, the team
 * names, and the venue, date and times along the bottom, over a light wash of the two teams' colours. It
 * fills the ticket's picture area and scales with it (container query units), from a phone's stacked
 * ticket to the picker's wide one.
 */
import { useTranslations } from 'next-intl';
import { brand } from '@/config/brand';
import { flagOf } from '@/lib/events/flags';
import { useFormat } from '../useFormat';

export interface MatchBannerProps {
  homeTeam: string;
  awayTeam: string;
  homeColor: string;
  awayColor: string;
  /** Epoch milliseconds. */
  startsAt: number;
  doorsAt: number;
  /** Keeps the top-left corner clear for a stamp across the ticket ("Held for you", "Used"). */
  stampRoom?: boolean;
}

/** Flag height: a third of the banner's height, at most a fifth of its width and 88 px. */
const FLAG_H = 'h-[min(34cqh,21cqw,88px)]';

export function MatchBanner({
  homeTeam,
  awayTeam,
  homeColor,
  awayColor,
  startsAt,
  doorsAt,
  stampRoom = false,
}: MatchBannerProps) {
  const t = useTranslations('tickets.match');
  const fmt = useFormat();
  const wash = (color: string) => `color-mix(in oklab, ${color} 18%, #ffffff)`;
  return (
    <div
      data-match-banner
      className="absolute inset-0 flex flex-col overflow-hidden text-ink [container-type:size]"
      style={{
        background: `linear-gradient(105deg, ${wash(homeColor)} 0%, #ffffff 40%, #ffffff 60%, ${wash(awayColor)} 100%)`,
      }}
    >
      {/* The teams' colours along the top edge; a faint halfway line and centre circle behind "VS". */}
      <div
        aria-hidden
        className="h-[5px] flex-none"
        style={{ background: `linear-gradient(90deg, ${homeColor} 50%, ${awayColor} 50%)` }}
      />
      <div aria-hidden className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ink/[.05]" />
      <div
        aria-hidden
        className="absolute top-[42%] left-1/2 aspect-square h-[58cqh] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink/[.05]"
      />
      <div
        className={`relative flex min-h-0 flex-1 items-center justify-center gap-[min(5cqw,28px)] px-[4cqw] ${
          stampRoom ? 'pt-[min(42px,15cqh)]' : ''
        }`}
      >
        <Team name={homeTeam} color={homeColor} />
        <span className="font-display text-[clamp(18px,min(9cqw,17cqh),40px)] leading-none font-bold text-ink/85">
          {t('vs')}
        </span>
        <Team name={awayTeam} color={awayColor} />
      </div>
      {/* At least 12 px below the text: a stacked ticket's perforation notch bites into this corner. */}
      <dl className="relative grid flex-none grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-t border-ink/10 bg-white/75 px-[4cqw] pt-[min(2.6cqh,10px)] pb-3 text-[clamp(10px,min(3.1cqw,6.4cqh),12.5px)] leading-snug">
        <Fact label={t('venue')} value={brand.name} />
        <Fact label={t('gates')} value={fmt.date(doorsAt, 'time')} end />
        <Fact label={t('date')} value={fmt.date(startsAt, 'medium')} />
        <Fact label={t('kickoff')} value={fmt.date(startsAt, 'time')} end />
      </dl>
    </div>
  );
}

function Team({ name, color }: { name: string; color: string }) {
  const flag = flagOf(name);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-[min(2.4cqh,10px)]">
      {flag ? (
        // A small static SVG; the team's name follows as text, so the flag itself is decorative.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flag}
          alt=""
          width={640}
          height={480}
          className={`${FLAG_H} w-auto rounded-[3px] [filter:drop-shadow(0_0_0.6px_rgb(0_0_0/.45))_drop-shadow(0_5px_10px_rgb(0_0_0/.16))]`}
        />
      ) : (
        <span
          aria-hidden
          className={`${FLAG_H} block aspect-[4/3] rounded-[3px]`}
          style={{ background: color }}
        />
      )}
      <span className="max-w-full truncate font-display text-[clamp(13px,min(5.6cqw,10.5cqh),24px)] leading-none font-bold tracking-wide uppercase">
        {name}
      </span>
    </div>
  );
}

function Fact({ label, value, end = false }: { label: string; value: string; end?: boolean }) {
  return (
    <div className={`flex min-w-0 gap-1 ${end ? 'justify-self-end' : ''}`}>
      <dt className="flex-none font-semibold text-muted">{label}:</dt>
      <dd className="min-w-0 font-semibold">{value}</dd>
    </div>
  );
}
