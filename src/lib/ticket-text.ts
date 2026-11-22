/**
 * The words on a ticket (kicker, title, facts) from its seat label, in the visitor's language. Shared by
 * the checkout, order and ticket pages and the email; `englishSeatLine` is for Stripe and the PDF.
 */
import { brand } from '@/config/brand';
import type { SeatLabel } from '@/lib/stadium';

type T = (key: string, values?: Record<string, string | number>) => string;

export interface TicketText {
  kicker: string;
  title: string;
  facts: { label: string; value: string }[];
  /** One line: "Block 232 · Row 10 · Seat 7". */
  short: string;
}

/** `t` reads the `tickets` namespace; `names` gives stand and tier names (namespace `names`). */
export function ticketText(label: SeatLabel, t: T, names: T): TicketText {
  if (label.kind === 'vip') {
    return {
      kicker: t('vipBox', { level: brand.vipLevel, box: label.box }),
      title: t('seatTitle', { seat: label.seat }),
      facts: [
        { label: t('row'), value: String(label.row) },
        { label: t('seat'), value: String(label.seat) },
        { label: t('entry'), value: t('vip') },
      ],
      short: t('shortVip', { box: label.box, seat: label.seat }),
    };
  }
  return {
    kicker: `${names(`stand.${label.stand}`)} · ${names(`tier.${label.tier}`)}`,
    title: t('block', { block: label.block }),
    facts: [
      { label: t('row'), value: String(label.row) },
      { label: t('seat'), value: String(label.seat) },
      { label: t('gate'), value: label.gate },
    ],
    short: t('short', { block: label.block, row: label.row, seat: label.seat }),
  };
}

export function englishSeatLine(label: SeatLabel): string {
  return label.kind === 'vip'
    ? `Skybox ${label.box}, Seat ${label.seat} (VIP)`
    : `Block ${label.block}, Row ${label.row}, Seat ${label.seat}`;
}
