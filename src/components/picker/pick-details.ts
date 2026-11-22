'use client';
/** What to say about a stand, block, seat run or VIP chair (hover tooltip and touch card share this). */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import { computeStats } from '@/lib/picker/stats';
import { seatNumbersText } from '@/lib/picker/selection';
import { getLayout, SeatFlag, seatPriceMinor, totalPriceMinor } from '@/lib/stadium';
import type { PickInfo } from '@/engine';
import { useFormat } from '../useFormat';
import { middleOf, usePicker } from './store';

export interface PickDetails {
  kicker: string;
  title: string;
  price: string;
  /** Taken, sold out, closed or no run here: the action isn't available. */
  unavailable: boolean;
  note: string;
  wheelchair: boolean;
  /** Seat to show a view thumbnail for (-1: none). */
  thumbSeat: number;
}

export function usePickDetails(info: PickInfo | null): PickDetails | null {
  const t = useTranslations('picker.tip');
  const fmt = useFormat();
  const { statuses, quantity, filters, pricing, closed, nav } = usePicker(
    useShallow((s) => ({
      statuses: s.statuses,
      quantity: s.quantity,
      filters: s.filters,
      pricing: s.pricing,
      closed: s.closed,
      nav: s.nav,
    })),
  );
  const stats = useMemo(
    () => computeStats(statuses, quantity, filters, pricing),
    [statuses, quantity, filters, pricing],
  );
  if (!info) return null;
  const L = getLayout();
  const d: PickDetails = {
    kicker: '',
    title: '',
    price: '',
    unavailable: false,
    note: '',
    wheelchair: false,
    thumbSeat: -1,
  };
  if (info.kind === 'stand') {
    const st = L.stands[info.id];
    const free = stats.standFree[st.index];
    d.kicker = t('seatsLeft', { count: free, n: fmt.num(free) });
    d.title = fmt.stand(st.key);
    d.price = free ? t('from', { price: fmt.money(stats.standFrom[st.index]) }) : t('soldOut');
    d.unavailable = !free;
    if (free && !info.fits) d.note = t('notTogether', { count: quantity });
  } else if (info.kind === 'block') {
    const b = L.blocks[info.id];
    const free = stats.blockFree[b.index];
    d.kicker = `${fmt.tier(b.tierKey)} · ${t('gate', { gate: b.gate })}`;
    d.title = t('block', { block: b.id });
    if (closed.has(b.index)) {
      d.price = t('closed');
      d.unavailable = true;
    } else if (!free) {
      d.price = t('soldOut');
      d.unavailable = true;
    } else {
      d.price = t('blockPrice', {
        price: fmt.money(pricing?.blockPriceMinor[b.index] ?? 0),
        n: fmt.num(free),
      });
      if (!info.fits) d.note = t('notTogether', { count: quantity });
    }
  } else if (info.kind === 'seat') {
    const b = L.blocks[L.blockOf[info.id]];
    const row = L.rowOf[info.id];
    const run = info.run;
    d.kicker = t('block', { block: b.id });
    d.title =
      run && run.length > 1
        ? t('rowSeats', { row, seats: seatNumbersText(run.map((i) => L.numberOf[i])) })
        : t('rowSeat', { row, seat: L.numberOf[info.id] });
    if (info.taken) {
      d.price = t('taken');
      d.unavailable = true;
    } else if (!run) {
      d.price = t('notHere', { count: quantity });
      d.unavailable = true;
    } else {
      d.price = pricing
        ? fmt.money(run.length > 1 ? totalPriceMinor(run, pricing) : seatPriceMinor(run[0], pricing))
        : '';
      d.thumbSeat = middleOf(run);
      if (run.some((i) => L.flags[i] & SeatFlag.Restricted)) d.note = t('restricted');
      d.wheelchair = run.some((i) => (L.flags[i] & SeatFlag.Wheelchair) !== 0);
    }
  } else {
    const box = L.boxes[nav.box];
    d.kicker = box ? t('boxRow', { box: box.id, row: info.id < 4 ? 1 : 2 }) : '';
    d.title = t('chair', { seat: info.id + 1 });
    d.unavailable = info.taken;
    d.price = info.taken ? t('taken') : fmt.money(pricing?.vipChairMinor ?? 0);
  }
  return d;
}
