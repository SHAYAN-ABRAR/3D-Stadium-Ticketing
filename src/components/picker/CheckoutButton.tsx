'use client';
/**
 * "Check out" (ticket card and selection tray): renders the view from each held seat (at most 6 s in all;
 * the ticket card has usually rendered the open seat's already), keeps the pictures in the browser for the
 * tickets (the ticket page shows them), then opens checkout. A seat not rendered in time borrows the picture
 * of a seat in the same row or skybox (their views are practically the same).
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { getStore } from '@/data';
import { getLayout, SKY } from '@/lib/stadium';
import type { SnapshotView } from '@/engine';
import { buttonClass } from '../ui/atoms';
import { snapshotView } from './snapshot-cache';
import { usePicker } from './store';

const VIEW_DEADLINE_MS = 6000;

/** The view picture of any seat: a bowl seat, or a chair in a skybox. */
function viewOfSeat(seat: number): SnapshotView {
  const L = getLayout();
  if (seat < L.bowlSeatCount) return { kind: 'seat', seat };
  const v = seat - L.bowlSeatCount;
  return { kind: 'vip', box: Math.floor(v / SKY.chairsPerBox), chair: v % SKY.chairsPerBox };
}

function viewGroup(seat: number): string {
  const L = getLayout();
  if (seat >= L.bowlSeatCount) return `box:${Math.floor((seat - L.bowlSeatCount) / SKY.chairsPerBox)}`;
  return `row:${L.blockOf[seat]}:${L.rowOf[seat]}`;
}

async function keepViews(): Promise<void> {
  const { engine, event, hold } = usePicker.getState();
  if (!engine || !event || !hold) return;
  const deadline = Date.now() + VIEW_DEADLINE_MS;
  const shots = new Map<number, Blob>();
  for (const seat of hold.seats) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    const entry = await Promise.race([
      snapshotView(engine, viewOfSeat(seat), 640, 400),
      new Promise<null>((r) => setTimeout(() => r(null), left)),
    ]);
    if (entry) shots.set(seat, entry.blob);
  }
  for (const seat of hold.seats) {
    if (shots.has(seat)) continue;
    const twin = hold.seats.find((o) => shots.has(o) && viewGroup(o) === viewGroup(seat));
    if (twin !== undefined) shots.set(seat, shots.get(twin)!);
  }
  await getStore()
    .saveViews(
      event.id,
      [...shots].map(([seat, blob]) => ({ seat, blob })),
    )
    .catch(() => {});
}

export function CheckoutButton() {
  const t = useTranslations('picker.ticket');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const slug = usePicker.getState().event?.slug;
    if (!slug) return;
    setBusy(true);
    await keepViews();
    router.push(`/checkout?event=${encodeURIComponent(slug)}`);
  };
  return (
    <button type="button" disabled={busy} onClick={() => void go()} className={buttonClass('primary')}>
      {busy ? t('preparing') : t('checkout')}
    </button>
  );
}
