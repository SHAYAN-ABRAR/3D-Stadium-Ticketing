import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalStore } from '@/data/local-store';
import { SalesSimulator } from '@/data/simulator';
import type { SeatUpdate } from '@/data/store';
import { protectedSeats } from '@/lib/events/samples';
import { pricingOf } from '@/lib/events/types';
import { indexOf, seatPricesMinor } from '@/lib/stadium';

const ORIGIN = 'https://tickets.example.test';
const BUYER = { name: 'Dana Example', email: 'Dana@Example.com', phone: '+971 50 123 4567' };
const VISA = { brand: 'visa' as const, last4: '4242', approved: true };

const opened: LocalStore[] = [];
afterEach(() => {
  for (const s of opened.splice(0)) s.close();
});

/** Stores sharing one in-memory IndexedDB play the tabs of one browser (each with its own session). */
function browser(opts: { soldOverride?: number; clock?: { t: number } } = {}) {
  const indexedDB = new IDBFactory();
  const dbName = `test-${Math.random().toString(36).slice(2)}`;
  return (session: string) => {
    const s = new LocalStore({
      dbName,
      dexie: { indexedDB, IDBKeyRange },
      session,
      sweep: false,
      origin: ORIGIN,
      now: opts.clock ? () => opts.clock!.t : undefined,
      seed: { only: ['cup-final', 'friendly-rangers-v-westholm'], soldOverride: opts.soldOverride },
    });
    opened.push(s);
    return s;
  };
}

/** The next change of seats heard by a tab (a "reload" notice, such as the one after seeding, is skipped). */
function nextUpdate(store: LocalStore, eventId: string): Promise<SeatUpdate> {
  return new Promise((resolve, reject) => {
    const off = store.onSeats(eventId, (u) => {
      if (!('changes' in u)) return;
      off();
      resolve(u);
    });
    setTimeout(() => reject(new Error('no update')), 2000);
  });
}

describe('local store', () => {
  it('seeds the sample events once, with the protected seats free', async () => {
    const tab = browser();
    const a = tab('a');
    const events = await a.listEvents();
    expect(events.map((e) => e.event.slug)).toEqual(['cup-final', 'friendly-rangers-v-westholm']);
    const cup = events[0];
    expect(cup.badge).toBe('on_sale');
    expect(cup.sellThrough).toBeGreaterThan(0.6);
    expect(cup.fromPriceMinor).toBe(40_000);
    expect(events[1].badge).toBe('coming_soon');
    const { statuses, version } = await a.seats('cup-final');
    expect(version).toBe(1);
    for (const i of protectedSeats()) expect(statuses[i]).toBe(0);
    // A second tab doesn't seed again.
    const b = tab('b');
    expect((await b.seats('cup-final')).version).toBe(1);
  });

  it('25 tabs holding overlapping seats at once never share a seat', async () => {
    const tab = browser({ soldOverride: 0 });
    const base = indexOf(232, 10, 5);
    const stores = Array.from({ length: 25 }, (_, k) => tab(`tab-${k}`));
    await Promise.all(stores.map((s) => s.ready()));
    const results = await Promise.all(
      stores.map((s, k) => s.hold('cup-final', [base + (k % 5), base + (k % 5) + 1])),
    );
    const owner = new Map<number, string>();
    for (const r of results) {
      if (!r.ok) {
        expect(r.reason).toBe('conflict');
        continue;
      }
      for (const i of r.hold.seats) {
        expect(owner.has(i), `seat ${i} held twice`).toBe(false);
        owner.set(i, r.hold.id);
      }
    }
    expect(owner.size).toBeGreaterThan(0);
    const { statuses } = await stores[0].seats('cup-final');
    for (let i = base; i < base + 6; i++) expect(statuses[i]).toBe(owner.has(i) ? 1 : 0);
  });

  it('another tab sees a hold, cannot take it, and replacing a hold frees the old seats', async () => {
    const tab = browser({ soldOverride: 0 });
    const a = tab('a');
    const b = tab('b');
    await Promise.all([a.ready(), b.ready()]);
    const [s5, s6, s7] = protectedSeats();
    const heard = nextUpdate(b, 'cup-final');
    const first = await a.hold('cup-final', [s5, s6]);
    expect(first.ok).toBe(true);
    const update = await heard;
    expect('changes' in update && update.changes).toEqual([
      [s5, 1],
      [s6, 1],
    ]);
    expect(await b.hold('cup-final', [s6, s7])).toEqual({ ok: false, reason: 'conflict', conflicts: [s6] });
    // A re-hold in tab A replaces its first hold.
    const second = await a.hold('cup-final', [s6, s7]);
    expect(second.ok).toBe(true);
    const { statuses } = await b.seats('cup-final');
    expect([statuses[s5], statuses[s6], statuses[s7]]).toEqual([0, 1, 1]);
    expect(await b.currentHold('cup-final')).toBeNull();
    expect((await a.currentHold('cup-final'))?.seats).toEqual([s6, s7]);
  });

  it('holds expire after their time, and expired holds cannot be bought', async () => {
    const clock = { t: Date.now() };
    const a = browser({ soldOverride: 0, clock })('a');
    const r = await a.hold('cup-final', protectedSeats().slice(0, 2));
    if (!r.ok) throw new Error('hold failed');
    expect(r.hold.expiresAt).toBe(clock.t + 10 * 60_000);
    clock.t += 10 * 60_000 + 1;
    expect(await a.currentHold('cup-final')).toBeNull();
    expect((await a.seats('cup-final')).statuses[r.hold.seats[0]]).toBe(0);
    const late = await a.checkout({
      holdId: r.hold.id,
      buyer: BUYER,
      holders: [],
      payment: VISA,
      locale: 'en',
    });
    expect(late).toEqual({ ok: false, reason: 'expired' });
  });

  it('checkout sells the seats once, keeps only the card brand and last four, and writes the email', async () => {
    const tab = browser();
    const a = tab('a');
    const b = tab('b');
    const seats = protectedSeats().slice(2, 4);
    const r = await a.hold('cup-final', seats);
    if (!r.ok) throw new Error('hold failed');

    // A declined card changes nothing.
    const declined = await a.checkout({
      holdId: r.hold.id,
      buyer: BUYER,
      holders: [],
      payment: { ...VISA, last4: '0002', approved: false },
      locale: 'en',
    });
    expect(declined).toEqual({ ok: false, reason: 'declined' });
    expect((await a.currentHold('cup-final'))?.id).toBe(r.hold.id);
    // Another tab can't buy this tab's hold.
    expect(
      await b.checkout({ holdId: r.hold.id, buyer: BUYER, holders: [], payment: VISA, locale: 'en' }),
    ).toEqual({
      ok: false,
      reason: 'expired',
    });

    const paid = await a.checkout({
      holdId: r.hold.id,
      buyer: BUYER,
      holders: ['  Ana   Lima ', null],
      payment: VISA,
      locale: 'bn',
    });
    if (!paid.ok) throw new Error(`checkout failed: ${paid.reason}`);
    expect(paid.code).toMatch(/^LP-[2-9A-HJKMNP-Z]{6}$/);
    const order = (await b.order(paid.code.toLowerCase()))!;
    const event = (await a.getEvent('cup-final'))!;
    const prices = seatPricesMinor(seats, pricingOf(event));
    expect(order.status).toBe('paid');
    expect(order.totals.totalMinor).toBe(prices[0] + prices[1]);
    expect(order.payment).toEqual({ brand: 'visa', last4: '4242' });
    expect(JSON.stringify(order)).not.toMatch(/4242\s?4242/);
    expect(order.tickets.map((t) => [t.seatIndex, t.holderName, t.status])).toEqual([
      [seats[0], 'Ana Lima', 'valid'],
      [seats[1], null, 'valid'],
    ]);
    expect((await a.seats('cup-final')).statuses[seats[0]]).toBe(2);
    expect(await a.lookupOrder(paid.code, 'dana@example.COM')).toBe(paid.code);
    expect(await a.lookupOrder(paid.code, 'someone@example.com')).toBeNull();
    const byToken = await b.ticket(order.tickets[0].token);
    expect(byToken?.order.code).toBe(paid.code);

    // Paying twice does nothing.
    expect(
      await a.checkout({ holdId: r.hold.id, buyer: BUYER, holders: [], payment: VISA, locale: 'en' }),
    ).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect((await a.orders()).length).toBe(1);

    // The confirmation email is in the outbox, in the visitor's language; "again" adds a copy.
    const outbox = await a.outbox(paid.code);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: BUYER.email, locale: 'bn' });
    expect(outbox[0].html).toContain(`${ORIGIN}/tickets/${order.tickets[0].token}`);
    expect(outbox[0].subject).toContain('বনাম');
    await a.resendEmail(paid.code);
    expect(await a.outbox(paid.code)).toHaveLength(2);
  });

  it('simulated buyers hold seats, then buy or walk away, never touching protected seats', async () => {
    const clock = { t: Date.now() };
    const a = browser({ soldOverride: 0, clock })('a');
    let seed = 42;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sim = new SalesSimulator(a, 'cup-final', { random });
    const picked: number[][] = [];
    for (let k = 0; k < 6; k++) {
      const seats = await sim.step();
      if (seats) picked.push(seats);
    }
    expect(picked.length).toBeGreaterThan(0);
    // At most 6 simulated buyers at once.
    expect(await sim.step()).toBeNull();
    const keep = new Set(protectedSeats());
    for (const seats of picked) for (const i of seats) expect(keep.has(i)).toBe(false);
    let statuses = (await a.seats('cup-final')).statuses;
    for (const seats of picked) for (const i of seats) expect(statuses[i]).toBe(1);
    // Their time runs out: each group is sold or free again.
    clock.t += 61_000;
    await a.sweep();
    statuses = (await a.seats('cup-final')).statuses;
    for (const seats of picked) {
      const s = new Set(seats.map((i) => statuses[i]));
      expect(s.size).toBe(1);
      expect([0, 2]).toContain([...s][0]);
    }
  });
});
