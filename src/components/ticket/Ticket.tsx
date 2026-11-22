/**
 * The ticket: the site's signature component (PROMPT.md section 8). Paper, a picture of the view, a dashed
 * perforation with notches, a stub with a barcode or QR code, and the price in orange. Reused in the
 * picker, at checkout, on the confirmation page and on the ticket page; mirrored in the PDF and email.
 */
import type { ReactNode } from 'react';

export interface TicketFact {
  label: string;
  value: string;
}

export interface TicketProps {
  /** The picture area (view snapshot, plan, ...). Omit for a ticket without a picture. */
  view?: ReactNode;
  /** Small label over the picture ("Your view"). */
  chip?: string;
  eventLine: string;
  kicker: string;
  title: string;
  facts: TicketFact[];
  actions?: ReactNode;
  note?: ReactNode;
  currency: string;
  /** Formatted amount without the currency code. */
  price: string;
  /** Barcode or QR code in the stub. */
  code?: ReactNode;
  /** A stamp across the ticket ("Held for you · 9:41"). */
  stamp?: string;
  /** Colour behind the ticket, used for the perforation notches. */
  notch?: string;
  /** Layout: full (picture | details | stub) or stacked (picture on top; phones and narrow columns). */
  layout?: 'full' | 'stacked';
  className?: string;
  /** Accessible name of the ticket region. */
  label?: string;
  id?: string;
}

export function Ticket({
  view,
  chip,
  eventLine,
  kicker,
  title,
  facts,
  actions,
  note,
  currency,
  price,
  code,
  stamp,
  notch = '#1d2530',
  layout = 'full',
  className = '',
  label,
  id,
}: TicketProps) {
  const stacked = layout === 'stacked';
  return (
    <section
      id={id}
      aria-label={label}
      className={`card relative grid overflow-hidden ${
        stacked
          ? 'grid-cols-[minmax(0,1fr)_96px]'
          : view
            ? 'grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)_122px]'
            : 'grid-cols-[minmax(0,1fr)_122px]'
      } ${className}`}
      style={{ ['--notch' as string]: notch }}
    >
      {view ? (
        <div
          className={`relative overflow-hidden bg-[#27313d] ${stacked ? 'col-span-2 h-[clamp(140px,30vh,210px)]' : 'min-h-[236px]'}`}
        >
          {view}
          {chip ? (
            <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-[rgba(14,17,22,.72)] py-1 pr-2.5 pl-2 text-[13px] font-semibold text-white">
              <span className="size-2 rounded-full bg-pick" aria-hidden />
              {chip}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={`flex min-w-0 flex-col gap-0.5 ${stacked ? 'px-3.5 py-3' : 'px-5 py-4'}`}>
        <span className="text-[13px] font-semibold text-muted">{eventLine}</span>
        <span className="mt-1.5 text-sm font-semibold text-ink">{kicker}</span>
        <h2
          className={`font-display leading-none font-bold tracking-tight ${stacked ? 'text-[32px]' : 'text-[40px]'}`}
        >
          {title}
        </h2>
        <dl className={`flex flex-wrap ${stacked ? 'mt-1.5 mb-2 gap-4' : 'mt-2.5 mb-3 gap-[22px]'}`}>
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col">
              <dt className="text-[13px] font-semibold text-muted">{f.label}</dt>
              <dd
                className={`font-display leading-none font-bold ${stacked ? 'text-[26px]' : 'text-[30px]'}`}
              >
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
        {actions ? (
          <div className="mt-auto flex flex-wrap items-center gap-x-3.5 gap-y-1.5">{actions}</div>
        ) : null}
        {note ? <div className="mt-1 text-[13px] text-muted">{note}</div> : null}
      </div>
      <div className="relative flex flex-col items-center justify-between border-l-2 border-dashed border-[#d6d0c3] bg-paper px-2.5 py-4">
        <span
          aria-hidden
          className="absolute -top-[11px] -left-3 size-[22px] rounded-full"
          style={{ background: 'var(--notch)' }}
        />
        <span
          aria-hidden
          className="absolute -bottom-[11px] -left-3 size-[22px] rounded-full"
          style={{ background: 'var(--notch)' }}
        />
        <span className="text-[13px] font-bold text-muted">{currency}</span>
        <div className="flex flex-1 items-center py-2">{code}</div>
        <strong
          className={`font-display leading-none font-bold text-pick ${stacked ? 'text-[26px]' : 'text-[32px]'}`}
        >
          {price}
        </strong>
      </div>
      {stamp ? (
        <span
          className={`absolute rounded-lg border-[3px] border-pick bg-[rgba(251,250,246,.88)] px-2.5 py-0.5 font-display text-xl leading-tight font-bold text-pick-ink ${
            stacked ? 'top-[calc(clamp(140px,30vh,210px)-48px)] left-3.5' : 'bottom-[18px] left-[18px]'
          } -rotate-6`}
          role="status"
        >
          {stamp}
        </span>
      ) : null}
    </section>
  );
}

/** Decorative barcode, deterministic per seed (the picker's ticket; real tickets carry a QR code). */
/** Bars of the decorative barcode (prototype: barcode): deterministic per seed. */
export function barcodeBars(seed: number): { y: number; h: number }[] {
  let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const bars: { y: number; h: number }[] = [];
  let y = 4;
  while (y < 116) {
    const h = 1 + Math.floor(r() * 3.4);
    if (r() > 0.3) bars.push({ y, h });
    y += h + 1 + Math.floor(r() * 2);
  }
  return bars;
}

export function Barcode({ seed, className = 'h-[120px] w-[58px]' }: { seed: number; className?: string }) {
  const bars = barcodeBars(seed);
  return (
    <svg viewBox="0 0 58 120" className={className} aria-hidden>
      {bars.map((b) => (
        <rect key={b.y} x={4} y={b.y} width={50} height={b.h} fill="#15171c" />
      ))}
    </svg>
  );
}
