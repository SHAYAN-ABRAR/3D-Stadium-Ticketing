/**
 * The teams of a match with their flags, wherever "Bangladesh v India" is written. A flag is decorative
 * (the team's name follows as text); a team without a flag shows a dot in its colour instead.
 */
import { flagOf } from '@/lib/events/flags';

/** A team's flag, sized to the text around it, or a dot in the team's colour. */
export function TeamFlag({
  team,
  color,
  className = 'h-[0.8em]',
}: {
  team: string;
  color: string;
  className?: string;
}) {
  const src = flagOf(team);
  if (!src) {
    return (
      <span
        aria-hidden
        className="inline-block size-3 flex-none rounded-full ring-2 ring-white inset-ring inset-ring-black/20"
        style={{ background: color }}
      />
    );
  }
  return (
    // A small static SVG: next/image adds nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={640}
      height={480}
      className={`${className} inline-block w-auto flex-none rounded-[2px] [filter:drop-shadow(0_0_0.5px_rgb(0_0_0/.5))]`}
    />
  );
}

export interface MatchTitleProps {
  homeTeam: string;
  awayTeam: string;
  homeColor: string;
  awayColor: string;
  /** Classes of the "v" between the teams. */
  vsClassName?: string;
  /** Size of the flags (default: 0.8 of the text height). */
  flagClassName?: string;
}

/** "Bangladesh v India" with both teams' flags; it reads as plain text to assistive technology. */
export function MatchTitle({
  homeTeam,
  awayTeam,
  homeColor,
  awayColor,
  vsClassName = 'font-semibold text-muted',
  flagClassName,
}: MatchTitleProps) {
  return (
    <>
      <span className="inline-flex items-center gap-[0.35em]">
        <TeamFlag team={homeTeam} color={homeColor} className={flagClassName} />
        {homeTeam}
      </span>{' '}
      <span className={vsClassName}>v</span>{' '}
      <span className="inline-flex items-center gap-[0.35em]">
        <TeamFlag team={awayTeam} color={awayColor} className={flagClassName} />
        {awayTeam}
      </span>
    </>
  );
}
