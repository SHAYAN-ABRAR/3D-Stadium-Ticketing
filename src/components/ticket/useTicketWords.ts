'use client';
/** Ticket words (kicker, title, facts) in the visitor's language, for client components. */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { SeatLabel } from '@/lib/stadium';
import { ticketText, type TicketText } from '@/lib/ticket-text';

export function useTicketWords(): (label: SeatLabel) => TicketText {
  const t = useTranslations('tickets');
  const names = useTranslations('names');
  return useCallback(
    (label: SeatLabel) =>
      ticketText(
        label,
        (k, v) => t(k, v),
        (k) => names(k),
      ),
    [t, names],
  );
}
