'use client';
/** The events of the visitor's local data store, for the home page and the events list. */
import { useStoreQuery, type Loadable } from '@/data/hooks';
import type { EventSummary } from '@/data/store';

/** Events that haven't been played, soonest first. */
export function useUpcomingEvents(): Loadable<EventSummary[]> {
  return useStoreQuery('events:upcoming', async (s) =>
    (await s.listEvents())
      .filter((e) => e.badge !== 'past')
      .sort((a, b) => a.event.startsAt - b.event.startsAt),
  );
}

/** The next event that is on sale (null when none is). */
export function nextOnSale(list: EventSummary[]): EventSummary | null {
  return list.find((s) => s.badge === 'on_sale' || s.badge === 'few_left') ?? null;
}
