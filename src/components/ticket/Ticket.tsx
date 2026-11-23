/**
 * The ticket: the site's signature component (PROMPT.md section 8), on the notched, tilting sheet of
 * TicketShell, in the site's own colours (paper, ink and the orange price). The match header (both teams'
 * flags, see MatchBanner), the seat, then the stub with a barcode or QR code and the price: on the right on
 * wide screens, at the bottom when stacked (phones). Reused in the picker, at checkout and on the
 * confirmation page; mirrored in the PDF and email.
 */
import type { ReactNode } from 'react';
import { brand } from '@/config/brand';
import { TicketShell, type TicketTiltProps } from './TicketShell';

export interface TicketFact {
  label: string;
  value: string;
}

export interface TicketProps {
  /** The picture area (the match header). Omit for a ticket without one. */
  view?: ReactNode;
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
  /** A stamp across the ticket: a text ("Used"), or an element that places itself ("Held for you · 9:41"). */
  stamp?: ReactNode;
  /** Layout: full (header | details | stub) or stacked (header, details, then the stub; phones). */
  layout?: 'full' | 'stacked';
  className?: string;
  /** Accessible name of the ticket. */
  label?: string;
  id?: string;
}

/** A gentler tilt than the original's (which suits a small portrait ticket), with a soft glare. */
const TILT: TicketTiltProps = {
  perspective: 1500,
  tiltMaxAngleX: 4,
  tiltMaxAngleY: 3,
  scale: 1.012,
  glareEnable: true,
  glareColor: '#ffffff',
  glareMaxOpacity: 0.1,
  glarePosition: 'all',
};

export function Ticket({
  view,
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
  layout = 'full',
  className,
  label,
  id,
}: TicketProps) {
  const stacked = layout === 'stacked';
  const details = (
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
            <dd className={`font-display leading-none font-bold ${stacked ? 'text-[26px]' : 'text-[30px]'}`}>
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
  );

  const body = stacked ? (
    <div className="flex h-full flex-col">
      {view ? (
        <div className="relative h-[clamp(140px,30vh,210px)] flex-none overflow-hidden">{view}</div>
      ) : null}
      {details}
    </div>
  ) : (
    <div className={`grid h-full ${view ? 'grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]' : ''}`}>
      {view ? <div className="relative min-h-[236px] overflow-hidden">{view}</div> : null}
      {details}
    </div>
  );

  const stub = stacked ? (
    <div className="flex h-full items-center justify-between gap-4 px-4 py-3">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-bold text-muted">{currency}</span>
        <strong className="font-display text-[30px] leading-none font-bold text-pick">{price}</strong>
      </div>
      {code ? <div className="flex items-center">{code}</div> : null}
    </div>
  ) : (
    <div className="flex h-full flex-col items-center justify-between px-2.5 py-4">
      <span className="text-[13px] font-bold text-muted">{currency}</span>
      <div className="flex flex-1 items-center py-2">{code}</div>
      <strong className="font-display text-[32px] leading-none font-bold text-pick">{price}</strong>
    </div>
  );

  const overlay =
    typeof stamp === 'string' ? (
      <span
        className={`absolute z-[3] rounded-lg border-[3px] border-pick bg-[rgba(251,250,246,.88)] px-2.5 py-0.5 font-display text-xl leading-tight font-bold text-pick-ink ${
          stacked ? 'top-3 left-3.5' : 'top-4.5 left-4.5'
        } -rotate-6`}
        role="status"
      >
        {stamp}
      </span>
    ) : (
      stamp
    );

  return (
    <TicketShell
      id={id}
      aria-label={label}
      className={className}
      orientation={stacked ? 'vertical' : 'horizontal'}
      stubSize={stacked ? 104 : 122}
      notchSize={12}
      paper={brand.colors.paper}
      ink={brand.colors.ink}
      body={body}
      stub={stub}
      overlay={overlay}
      tiltProps={TILT}
    />
  );
}

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

/**
 * Decorative barcode, deterministic per seed (the picker's ticket; real tickets carry a QR code). Upright in
 * a side stub; `horizontal` (bars standing side by side) for a stub along the bottom.
 */
export function Barcode({
  seed,
  className,
  horizontal = false,
}: {
  seed: number;
  className?: string;
  horizontal?: boolean;
}) {
  const bars = barcodeBars(seed);
  if (horizontal) {
    return (
      <svg viewBox="0 0 120 58" className={className ?? 'h-11 w-[92px]'} aria-hidden>
        {bars.map((b) => (
          <rect key={b.y} x={b.y} y={4} width={b.h} height={50} fill="#15171c" />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 58 120" className={className ?? 'h-[120px] w-[58px]'} aria-hidden>
      {bars.map((b) => (
        <rect key={b.y} x={4} y={b.y} width={50} height={b.h} fill="#15171c" />
      ))}
    </svg>
  );
}
