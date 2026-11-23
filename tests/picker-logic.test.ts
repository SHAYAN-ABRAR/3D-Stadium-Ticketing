import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { LocalStore } from '@/data/local-store';
import { protectedSeats, samplePublicEvent } from '@/lib/events/samples';
import { pricingOf } from '@/lib/events/types';
import { StoreBackend } from '@/lib/picker/backend';
import { bestAvailable, bestInBlock } from '@/lib/picker/best';
import { runAroundSeat } from '@/lib/picker/runs';
import { nearestBox, seatNumbersText, summarize, upgradeDiffMinor } from '@/lib/picker/selection';
import { computeStats, seatAllowed, type PickerFilters } from '@/lib/picker/stats';
import { blockById, defaultPricing, getLayout, indexOf, SeatFlag } from '@/lib/stadium';

const layout = getLayout();
const noFilters: PickerFilters = { priceMin: null, priceMax: null, accessible: false, hideRestricted: false };
const pricing = defaultPricing();

describe('best available', () => {
  it('returns up to 3 runs of free, adjacent seats, middle tier and centre first', () => {
    const statuses = new Uint8Array(layout.totalSeatCount);
    const best = bestAvailable(statuses, 4, noFilters, pricing);
    expect(best).toHaveLength(3);
    for (const run of best) {
      expect(run.seats).toHaveLength(4);
      const rows = new Set(run.seats.map((i) => layout.rowOf[i]));
      expect(rows.size).toBe(1);
      for (let k = 1; k < 4; k++) expect(run.seats[k]).toBe(run.seats[k - 1] + 1);
      const b = layout.blocks[run.block];
      expect(b.tierKey).toBe('M');
      expect(b.priceClass).toBe('centre');
    }
    expect(best[0].score).toBeLessThanOrEqual(best[1].score);
  });

  it('respects the price filter and closed blocks', () => {
    const statuses = new Uint8Array(layout.totalSeatCount);
    const cheap: PickerFilters = { ...noFilters, priceMax: 60_000 };
    for (const run of bestAvailable(statuses, 2, cheap, pricing)) {
      for (const i of run.seats) expect(seatAllowed(i, cheap, pricing)).toBe(true);
    }
    const first = bestAvailable(statuses, 2, noFilters, pricing)[0];
    const without = bestAvailable(statuses, 2, noFilters, pricing, 3, new Set([first.block]));
    expect(without.some((r) => r.block === first.block)).toBe(false);
  });

  it('skips wheelchair spaces unless accessible spaces are asked for', () => {
    const statuses = new Uint8Array(layout.totalSeatCount);
    const b = layout.blocks.find((x) => x.accessible)!;
    const run = bestInBlock(statuses, b, 2, noFilters, pricing, 0);
    expect(run!.seats.every((i) => !(layout.flags[i] & SeatFlag.Wheelchair))).toBe(true);
  });
});

describe('runs and selections', () => {
  it('runAroundSeat centres the run on the seat and fails when no run fits', () => {
    const statuses = new Uint8Array(layout.totalSeatCount);
    const seat = indexOf(232, 10, 8);
    expect(runAroundSeat(statuses, seat, 3, () => true)).toEqual([seat - 1, seat, seat + 1]);
    statuses[seat - 1] = 2;
    statuses[seat + 1] = 2;
    expect(runAroundSeat(statuses, seat, 2, () => true)).toBeNull();
    expect(runAroundSeat(statuses, seat, 1, () => true)).toEqual([seat]);
  });

  it('describes seat numbers compactly', () => {
    expect(seatNumbersText([8, 7])).toBe('7–8');
    expect(seatNumbersText([1, 2, 3, 9])).toBe('1–3, 9');
    expect(seatNumbersText([5])).toBe('5');
  });

  it('summarises a bowl selection and a whole skybox', () => {
    const two = [indexOf(232, 10, 7), indexOf(232, 10, 8)];
    const s = summarize(two, pricing);
    expect(s).toMatchObject({
      kind: 'bowl',
      count: 2,
      block: 232,
      row: 10,
      seats: '7–8',
      gate: 'N3',
      stand: 'N',
    });
    expect(s.totalMinor).toBe(400_000);
    const box = layout.boxes[8];
    const chairs = Array.from({ length: 8 }, (_, k) => box.firstSeat + k);
    const v = summarize(chairs, pricing);
    expect(v).toMatchObject({ kind: 'vip', box: 9, wholeBox: true, totalMinor: 5_500_000 });
  });

  it('upgrades from Block 232 row 10 into Skybox 9, as in the prototype', () => {
    expect(layout.boxes[nearestBox(indexOf(232, 10, 8))].id).toBe(9);
    expect(upgradeDiffMinor(200_000, 1, pricing)).toBe(550_000);
    expect(upgradeDiffMinor(400_000, 2, pricing)).toBe(1_100_000);
    expect(upgradeDiffMinor(1_600_000, 8, pricing)).toBe(3_900_000);
  });

  it('computeStats counts free seats and runs per block', () => {
    const statuses = new Uint8Array(layout.totalSeatCount).fill(2);
    const b = blockById(232)!;
    statuses[b.rowFirst[9]] = 0;
    statuses[b.rowFirst[9] + 1] = 0;
    const st = computeStats(statuses, 2, noFilters, pricing);
    expect(st.blockFree[b.index]).toBe(2);
    expect(st.blockFits[b.index]).toBe(1);
    expect(computeStats(statuses, 3, noFilters, pricing).blockFits[b.index]).toBe(0);
    expect(st.standFree[b.stand]).toBe(2);
  });
});

describe('store backend', () => {
  const event = samplePublicEvent('cup-final')!;
  const memoryStore = (soldOverride?: number) =>
    new LocalStore({
      dbName: `picker-${Math.random()}`,
      dexie: { indexedDB: new IDBFactory(), IDBKeyRange },
      session: 'tab-a',
      sweep: false,
      seed: { only: ['cup-final'], soldOverride },
    });

  it('holds free seats, refuses taken ones, re-holds and releases', async () => {
    const store = memoryStore();
    const backend = new StoreBackend(store, 'cup-final');
    const statusOf = async (i: number) => (await backend.seats()).statuses[i];
    const seats = protectedSeats().slice(0, 2);
    const r = await backend.hold(seats);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.hold.totalMinor).toBe(2 * 200_000);
    expect(await statusOf(seats[0])).toBe(1);
    // A sold seat conflicts; the previous hold survives a failed re-hold.
    const { statuses } = await backend.seats();
    const sold = layout.blocks.map((b) => b.firstSeat).find((i) => statuses[i] === 2)!;
    const bad = await backend.hold([seats[0], sold]);
    expect(bad).toMatchObject({ ok: false, reason: 'conflict', conflicts: [sold] });
    expect(await statusOf(seats[0])).toBe(1);
    // Re-holding replaces the hold (adding a seat holds the whole set again).
    const more = await backend.hold([...seats, protectedSeats()[2]]);
    expect(more.ok).toBe(true);
    if (!more.ok) return;
    await backend.release(more.hold.id);
    expect(await statusOf(seats[0])).toBe(0);
    expect(await backend.current()).toBeNull();
    store.close();
  });

  it('prices holds from the event, never from the browser', async () => {
    const store = memoryStore(0);
    const box = layout.boxes[3];
    const chairs = Array.from({ length: 8 }, (_, k) => box.firstSeat + k);
    const r = await new StoreBackend(store, 'cup-final').hold(chairs);
    expect(r.ok && r.hold.totalMinor).toBe(pricingOf(event).vipBoxMinor);
    store.close();
  });
});
