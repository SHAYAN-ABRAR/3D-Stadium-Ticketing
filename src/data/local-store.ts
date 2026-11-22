/**
 * LocalStore: the DataStore on Dexie, in the visitor's own browser (CLAUDE.md: no server, no network calls
 * for payments or email).
 *
 * Every hold, release, expiry and sale reads and writes the event's seat row inside one read-write
 * transaction; IndexedDB runs those one after another, across tabs, so a seat can't be held twice. After
 * the transaction commits, the changed seats are published to this tab and, through a BroadcastChannel, to
 * the others. Holds expire lazily (on reads and on a 15-second sweep). Simulated buyers are holds owned by
 * "sim:..." that become sales (or are released) when their time is up.
 */
import type { Table } from 'dexie';
import { brand } from '@/config/brand';
import { badgeFor, fromPriceOf, sellThroughOf } from '@/lib/events/summary';
import { isOnSale, pricingOf, type PublicEvent } from '@/lib/events/types';
import { loadMessages, localeOf } from '@/lib/messages';
import { orderTotals, type CardBrand, type OrderInfo, type OrderTicketInfo } from '@/lib/orders';
import { getLayout, labelOf, seatPricesMinor, totalPriceMinor, type SeatLabel } from '@/lib/stadium';
import { newId, newOrderCode, newTicketToken, normaliseOrderCode } from '@/lib/tickets/codes';
import { DataChannel } from './channel';
import { DB_NAME, StadiumDb, type HoldRow, type OrderRow, type SeatsRow, type TicketRow } from './db';
import { seedIfNeeded, type SeedOptions } from './seed';
import { tabSession } from './session';
import type { SimHost } from './simulator';
import type {
  CheckoutInput,
  CheckoutResult,
  DataStore,
  EventSummary,
  HoldInfo,
  HoldResult,
  OutboxMessage,
  SeatState,
  SeatUpdate,
} from './store';

const SWEEP_MS = 15_000;
const VIEW_MAX_AGE_MS = 2 * 86_400_000;
const CARD_BRANDS: readonly CardBrand[] = [
  'visa',
  'mastercard',
  'amex',
  'discover',
  'jcb',
  'unionpay',
  'diners',
  'card',
];

class HoldConflict extends Error {
  constructor(readonly conflicts: number[]) {
    super('Some seats are no longer available');
  }
}

class HoldGone extends Error {
  constructor() {
    super('The hold has expired');
  }
}

/** Dexie rethrows errors thrown inside a transaction, sometimes wrapped; this finds ours. */
function cause(e: unknown): unknown {
  let x = e;
  for (let k = 0; k < 3 && x && typeof x === 'object'; k++) {
    if (x instanceof HoldConflict || x instanceof HoldGone) return x;
    x = (x as { inner?: unknown }).inner;
  }
  return e;
}

export interface LocalStoreOptions {
  dbName?: string;
  /** Dexie options (unit tests pass fake-indexeddb). */
  dexie?: ConstructorParameters<typeof StadiumDb>[1];
  /** This tab's session (unit tests pass their own). */
  session?: string;
  now?: () => number;
  /** This site's origin, for links in emails (defaults to location.origin). */
  origin?: string;
  seed?: SeedOptions;
  /** Expire holds on a 15-second timer (default on in the browser). */
  sweep?: boolean;
}

export class LocalStore implements DataStore, SimHost {
  private readonly db: StadiumDb;
  private readonly channel: DataChannel;
  private readonly session: string;
  private readonly now: () => number;
  private readyPromise: Promise<void> | null = null;
  private openPromise: Promise<void> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: LocalStoreOptions = {}) {
    const name = opts.dbName ?? DB_NAME;
    this.db = new StadiumDb(name, opts.dexie);
    this.channel = new DataChannel(`${name}:changes`);
    this.session = opts.session ?? tabSession();
    this.now = opts.now ?? Date.now;
  }

  /* ================= lifecycle ================= */

  /**
   * The database is open (no sample data needed). Order and ticket reads use this: orders only exist after
   * a purchase, which happens after seeding, so a first visit to the order pages skips the seeding work.
   */
  private opened(): Promise<void> {
    this.openPromise ??= this.db.open().then(() => undefined);
    return this.openPromise;
  }

  ready(): Promise<void> {
    this.readyPromise ??= (async () => {
      await this.opened();
      if (await seedIfNeeded(this.db, this.now(), this.opts.seed)) {
        for (const e of await this.db.events.toArray()) {
          this.channel.publish({ type: 'reload', eventId: e.id, version: 1 });
        }
      }
      const browser = typeof window !== 'undefined';
      if (this.opts.sweep ?? browser) this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_MS);
    })();
    return this.readyPromise;
  }

  /** Stops timers and closes the database (tests). */
  close() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.channel.close();
    this.db.close();
  }

  /* ================= events ================= */

  async listEvents(opts: { includePast?: boolean } = {}): Promise<EventSummary[]> {
    await this.ready();
    const now = this.now();
    const out: EventSummary[] = [];
    for (const event of await this.db.events.orderBy('startsAt').toArray()) {
      if (event.status === 'draft') continue;
      const { statuses } = await this.seats(event.id);
      const sellThrough = sellThroughOf(statuses);
      const badge = badgeFor(event, sellThrough, now);
      if (badge === 'past' && !opts.includePast) continue;
      out.push({ event, fromPriceMinor: fromPriceOf(event), sellThrough, badge });
    }
    return out;
  }

  async getEvent(idOrSlug: string): Promise<PublicEvent | null> {
    await this.ready();
    return (
      (await this.db.events.get(idOrSlug)) ??
      (await this.db.events.where('slug').equals(idOrSlug).first()) ??
      null
    );
  }

  /* ================= seats ================= */

  async seats(eventId: string): Promise<SeatState> {
    await this.ready();
    await this.expireDue(eventId);
    const [row, event] = await Promise.all([this.db.seats.get(eventId), this.db.events.get(eventId)]);
    if (!row || !event) return { version: 0, statuses: new Uint8Array(getLayout().totalSeatCount) };
    const statuses = row.statuses.slice();
    const L = getLayout();
    for (const bi of event.closedBlocks) {
      const b = L.blocks[bi];
      if (!b) continue;
      for (let i = b.firstSeat; i < b.firstSeat + b.seatCount; i++) if (statuses[i] === 0) statuses[i] = 3;
    }
    return { version: row.version, statuses };
  }

  onSeats(eventId: string, listener: (update: SeatUpdate) => void): () => void {
    return this.channel.subscribe((m) => {
      if (m.type === 'seats' && m.eventId === eventId) {
        listener({ eventId, version: m.version, changes: m.changes });
      } else if (m.type === 'reload' && m.eventId === eventId) {
        listener({ eventId, version: m.version, reload: true });
      }
    });
  }

  /**
   * Runs a change of one event's seats in a read-write transaction: due holds expire first, `fn` edits the
   * statuses (and other tables), the version goes up when anything changed, and the net changes are
   * published after the commit.
   */
  private async changeSeats<T>(
    eventId: string,
    tables: Table[],
    fn: (statuses: Uint8Array, now: number, row: SeatsRow) => Promise<T>,
  ): Promise<T> {
    const { result, version, changes } = await this.db.transaction(
      'rw',
      [this.db.seats, this.db.holds, ...tables],
      async () => {
        const row = await this.db.seats.get(eventId);
        if (!row) throw new HoldGone();
        const before = row.statuses.slice();
        const now = this.now();
        await this.expireIn(eventId, row.statuses, now);
        const result = await fn(row.statuses, now, row);
        const changes: Array<[number, number]> = [];
        for (let i = 0; i < before.length; i++)
          if (before[i] !== row.statuses[i]) changes.push([i, row.statuses[i]]);
        let version = row.version;
        if (changes.length) {
          version++;
          await this.db.seats.put({ ...row, version });
        }
        return { result, version, changes };
      },
    );
    if (changes.length) this.channel.publish({ type: 'seats', eventId, version, changes });
    return result;
  }

  /** Inside a transaction: active holds whose time is up free their seats (a simulated buyer may buy). */
  private async expireIn(eventId: string, statuses: Uint8Array, now: number) {
    const due = await this.db.holds
      .where('eventId')
      .equals(eventId)
      .filter((h) => h.status === 'active' && h.expiresAt <= now)
      .toArray();
    for (const h of due) {
      const buys = h.owner.startsWith('sim:') && h.simBuys === true;
      for (const i of h.seats) if (statuses[i] === 1) statuses[i] = buys ? 2 : 0;
      await this.db.holds.update(h.id, { status: buys ? 'converted' : 'expired' });
    }
  }

  private async expireDue(eventId: string) {
    const now = this.now();
    const due = await this.db.holds
      .where('eventId')
      .equals(eventId)
      .filter((h) => h.status === 'active' && h.expiresAt <= now)
      .count();
    if (due) await this.changeSeats(eventId, [], async () => undefined);
  }

  /** Expires due holds of every event (the 15-second timer, and the simulator's steps). */
  async sweep(): Promise<void> {
    const now = this.now();
    const due = await this.db.holds
      .where('expiresAt')
      .belowOrEqual(now)
      .filter((h) => h.status === 'active')
      .toArray();
    for (const eventId of new Set(due.map((h) => h.eventId))) await this.expireDue(eventId);
  }

  /* ================= holds ================= */

  async hold(eventId: string, seats: number[]): Promise<HoldResult> {
    const event = await this.getEvent(eventId);
    if (!event) return { ok: false, reason: 'not_found', conflicts: [] };
    if (!isOnSale(event, this.now())) return { ok: false, reason: 'not_on_sale', conflicts: [] };
    const L = getLayout();
    const unique = [...new Set(seats)].sort((a, b) => a - b);
    const closed = new Set(event.closedBlocks);
    if (
      !unique.length ||
      unique.length > brand.maxTicketsPerOrder ||
      unique.length !== seats.length ||
      unique.some((i) => !Number.isInteger(i) || i < 0 || i >= L.totalSeatCount) ||
      unique.some((i) => i < L.bowlSeatCount && closed.has(L.blockOf[i]))
    ) {
      return { ok: false, reason: 'invalid', conflicts: [] };
    }
    const totalMinor = totalPriceMinor(unique, pricingOf(event), L);
    try {
      const hold = await this.changeSeats(event.id, [], async (statuses, now) => {
        // Re-holding replaces this tab's previous hold (adding a seat means holding the whole set again).
        const mine = await this.db.holds
          .where('eventId')
          .equals(event.id)
          .filter((h) => h.owner === this.session && h.status === 'active')
          .toArray();
        for (const h of mine) {
          for (const i of h.seats) if (statuses[i] === 1) statuses[i] = 0;
          await this.db.holds.update(h.id, { status: 'released' });
        }
        const conflicts = unique.filter((i) => statuses[i] !== 0);
        // Throwing rolls the whole transaction back, the release above included.
        if (conflicts.length) throw new HoldConflict(conflicts);
        for (const i of unique) statuses[i] = 1;
        const row: HoldRow = {
          id: newId(),
          eventId: event.id,
          owner: this.session,
          seats: unique,
          totalMinor,
          status: 'active',
          createdAt: now,
          expiresAt: now + brand.holdMinutes * 60_000,
        };
        await this.db.holds.add(row);
        return row;
      });
      return { ok: true, hold: toHoldInfo(hold) };
    } catch (e) {
      const c = cause(e);
      if (c instanceof HoldConflict) return { ok: false, reason: 'conflict', conflicts: c.conflicts };
      if (c instanceof HoldGone) return { ok: false, reason: 'not_found', conflicts: [] };
      throw e;
    }
  }

  async releaseHold(holdId: string): Promise<boolean> {
    await this.ready();
    const h = await this.db.holds.get(holdId);
    if (!h || h.owner !== this.session || h.status !== 'active') return false;
    return this.changeSeats(h.eventId, [], async (statuses) => {
      const fresh = await this.db.holds.get(holdId);
      if (!fresh || fresh.status !== 'active') return false;
      for (const i of fresh.seats) if (statuses[i] === 1) statuses[i] = 0;
      await this.db.holds.update(holdId, { status: 'released' });
      return true;
    });
  }

  async currentHold(eventId: string): Promise<HoldInfo | null> {
    const event = await this.getEvent(eventId);
    if (!event) return null;
    const { statuses } = await this.seats(event.id);
    const now = this.now();
    const mine = await this.db.holds
      .where('eventId')
      .equals(event.id)
      .filter((h) => h.owner === this.session && h.status === 'active' && h.expiresAt > now)
      .toArray();
    const h = mine.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!h || h.seats.some((i) => statuses[i] !== 1)) return null;
    return toHoldInfo(h);
  }

  /* ================= seat views ================= */

  async saveViews(eventId: string, views: { seat: number; blob: Blob }[]): Promise<void> {
    await this.ready();
    const now = this.now();
    await this.db.transaction('rw', this.db.views, async () => {
      await this.db.views
        .where('savedAt')
        .below(now - VIEW_MAX_AGE_MS)
        .delete();
      await this.db.views.bulkPut(
        views.map((v) => ({ key: `${eventId}:${v.seat}`, eventId, blob: v.blob, savedAt: now })),
      );
    });
  }

  async loadViews(eventId: string, seats: number[]): Promise<Map<number, Blob>> {
    await this.ready();
    const rows = await this.db.views.bulkGet(seats.map((s) => `${eventId}:${s}`));
    const out = new Map<number, Blob>();
    rows.forEach((r, k) => {
      if (r) out.set(seats[k], r.blob);
    });
    return out;
  }

  /* ================= checkout ================= */

  async checkout(input: CheckoutInput): Promise<CheckoutResult> {
    await this.ready();
    const { payment } = input;
    if (!payment.approved) return { ok: false, reason: 'declined' };
    if (!CARD_BRANDS.includes(payment.brand) || !/^\d{4}$/.test(payment.last4))
      return { ok: false, reason: 'invalid' };
    const hold = await this.db.holds.get(input.holdId);
    if (!hold) return { ok: false, reason: 'expired' };
    try {
      const code = await this.changeSeats(
        hold.eventId,
        [this.db.events, this.db.orders, this.db.tickets, this.db.views],
        async (statuses, now) => {
          const h = await this.db.holds.get(input.holdId);
          if (!h || h.owner !== this.session || h.status !== 'active' || h.expiresAt <= now)
            throw new HoldGone();
          if (h.seats.some((i) => statuses[i] !== 1)) throw new HoldGone();
          const event = await this.db.events.get(h.eventId);
          if (!event) throw new HoldGone();
          const prices = seatPricesMinor(h.seats, pricingOf(event));
          const totals = orderTotals(prices);
          let code = newOrderCode();
          for (let k = 0; k < 8 && (await this.db.orders.where('code').equals(code).count()); k++)
            code = newOrderCode();
          const orderId = newId();
          const views = await this.db.views.bulkGet(h.seats.map((s) => `${h.eventId}:${s}`));
          const holders = h.seats.map((_, k) => cleanName(input.holders[k]));
          const order: OrderRow = {
            id: orderId,
            code,
            eventId: h.eventId,
            holdId: h.id,
            name: input.buyer.name.trim(),
            email: input.buyer.email.trim(),
            phone: input.buyer.phone.trim(),
            locale: localeOf(input.locale),
            status: 'paid',
            lines: h.seats.map((seatIndex, k) => ({
              seatIndex,
              priceMinor: prices[k],
              holderName: holders[k],
            })),
            ...totals,
            currency: event.currency,
            payment: { brand: payment.brand, last4: payment.last4 },
            createdAt: now,
          };
          const tickets: TicketRow[] = h.seats.map((seatIndex, k) => ({
            id: newId(),
            orderId,
            eventId: h.eventId,
            seatIndex,
            label: labelOf(seatIndex) as SeatLabel,
            priceMinor: prices[k],
            holderName: holders[k],
            token: newTicketToken(),
            status: 'valid',
            usedAt: null,
            view: views[k]?.blob ?? null,
            createdAt: now,
          }));
          for (const i of h.seats) statuses[i] = 2;
          await this.db.holds.update(h.id, { status: 'converted' });
          await this.db.orders.add(order);
          await this.db.tickets.bulkAdd(tickets);
          await this.db.views.bulkDelete(h.seats.map((s) => `${h.eventId}:${s}`));
          return code;
        },
      );
      this.channel.publish({ type: 'orders' });
      // The confirmation email goes to the outbox (never sent); a failure there doesn't undo the sale.
      await this.queueEmail(code).catch((e) => console.error('[data] could not write the email:', e));
      return { ok: true, code };
    } catch (e) {
      if (cause(e) instanceof HoldGone) return { ok: false, reason: 'expired' };
      throw e;
    }
  }

  /* ================= orders and tickets ================= */

  async order(code: string): Promise<OrderInfo | null> {
    await this.opened();
    const c = normaliseOrderCode(code);
    const row = c ? await this.db.orders.where('code').equals(c).first() : undefined;
    return row ? this.toOrderInfo(row) : null;
  }

  async orders(): Promise<OrderInfo[]> {
    await this.opened();
    const rows = await this.db.orders.orderBy('createdAt').reverse().toArray();
    const out: OrderInfo[] = [];
    for (const r of rows) {
      const info = await this.toOrderInfo(r);
      if (info) out.push(info);
    }
    return out;
  }

  async lookupOrder(code: string, email: string): Promise<string | null> {
    const order = await this.order(code);
    if (!order) return null;
    return order.email.trim().toLowerCase() === email.trim().toLowerCase() ? order.code : null;
  }

  async ticket(token: string): Promise<{ order: OrderInfo; ticket: OrderTicketInfo } | null> {
    await this.opened();
    const t = await this.db.tickets.where('token').equals(token).first();
    if (!t) return null;
    const row = await this.db.orders.get(t.orderId);
    const order = row ? await this.toOrderInfo(row) : null;
    const ticket = order?.tickets.find((x) => x.id === t.id);
    return order && ticket ? { order, ticket } : null;
  }

  async ticketView(ticketId: string): Promise<Blob | null> {
    await this.opened();
    return (await this.db.tickets.get(ticketId))?.view ?? null;
  }

  onOrders(listener: () => void): () => void {
    return this.channel.subscribe((m) => {
      if (m.type === 'orders') listener();
    });
  }

  private async toOrderInfo(row: OrderRow): Promise<OrderInfo | null> {
    const event = await this.db.events.get(row.eventId);
    if (!event) return null;
    const tickets = await this.db.tickets.where('orderId').equals(row.id).toArray();
    tickets.sort((a, b) => a.seatIndex - b.seatIndex);
    return {
      id: row.id,
      code: row.code,
      status: row.status,
      name: row.name,
      email: row.email,
      phone: row.phone,
      locale: row.locale,
      currency: row.currency,
      totals: {
        subtotalMinor: row.subtotalMinor,
        feesMinor: row.feesMinor,
        taxMinor: row.taxMinor,
        totalMinor: row.totalMinor,
      },
      payment: row.payment,
      createdAt: row.createdAt,
      event: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        competition: event.competition,
        homeTeam: event.homeTeam,
        awayTeam: event.awayTeam,
        homeColor: event.homeColor,
        awayColor: event.awayColor,
        startsAt: event.startsAt,
        doorsAt: event.doorsAt,
      },
      tickets: tickets.map((t) => ({
        id: t.id,
        seatIndex: t.seatIndex,
        label: t.label,
        priceMinor: t.priceMinor,
        holderName: t.holderName,
        token: t.token,
        status: t.status,
        usedAt: t.usedAt,
        hasView: !!t.view,
      })),
    };
  }

  /* ================= email outbox ================= */

  async outbox(orderCode: string): Promise<OutboxMessage[]> {
    await this.opened();
    const c = normaliseOrderCode(orderCode);
    return c ? this.db.outbox.where('orderCode').equals(c).sortBy('createdAt') : [];
  }

  async resendEmail(orderCode: string): Promise<OutboxMessage | null> {
    const order = await this.order(orderCode);
    return order ? this.queueEmail(order.code) : null;
  }

  private async queueEmail(code: string): Promise<OutboxMessage | null> {
    const order = await this.order(code);
    if (!order) return null;
    const locale = localeOf(order.locale);
    // The template loads on demand (only after a purchase or "Email me again").
    const { renderOrderEmail } = await import('@/lib/email/order-email');
    const mail = renderOrderEmail({
      locale,
      messages: await loadMessages(locale),
      siteUrl: this.origin(),
      order: { code: order.code, name: order.name, currency: order.currency, ...order.totals },
      event: order.event,
      tickets: order.tickets,
    });
    const message: OutboxMessage = {
      id: newId(),
      orderCode: order.code,
      to: order.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      locale,
      createdAt: this.now(),
    };
    await this.db.outbox.add(message);
    this.channel.publish({ type: 'orders' });
    return message;
  }

  private origin(): string {
    if (this.opts.origin) return this.opts.origin;
    return typeof location !== 'undefined' ? location.origin : 'http://localhost:3000';
  }

  /* ================= simulated buyers ================= */

  startSimulator(eventId: string, opts: { intervalMs?: number } = {}): () => void {
    // Loaded on demand: only event pages run it, and other pages shouldn't download it.
    let stop: (() => void) | null = null,
      stopped = false;
    void import('./simulator').then(({ SalesSimulator }) => {
      if (!stopped) stop = new SalesSimulator(this, eventId, opts).start();
    });
    return () => {
      stopped = true;
      stop?.();
    };
  }

  /** SimHost: a simulated buyer holds seats for `ms`, then buys them or walks away. */
  async addSimHold(eventId: string, seats: number[], buys: boolean, ms: number): Promise<boolean> {
    await this.ready();
    return this.changeSeats(eventId, [], async (statuses, now) => {
      if (seats.some((i) => statuses[i] !== 0)) return false;
      for (const i of seats) statuses[i] = 1;
      await this.db.holds.add({
        id: newId(),
        eventId,
        owner: `sim:${newId().slice(0, 8)}`,
        seats,
        totalMinor: 0,
        status: 'active',
        createdAt: now,
        expiresAt: now + ms,
        simBuys: buys,
      });
      return true;
    });
  }

  /** SimHost: how many simulated buyers are holding seats right now. */
  async activeSimHolds(eventId: string): Promise<number> {
    await this.ready();
    return this.db.holds
      .where('eventId')
      .equals(eventId)
      .filter((h) => h.status === 'active' && h.owner.startsWith('sim:'))
      .count();
  }
}

function toHoldInfo(h: HoldRow): HoldInfo {
  return {
    id: h.id,
    eventId: h.eventId,
    seats: [...h.seats],
    expiresAt: h.expiresAt,
    totalMinor: h.totalMinor,
  };
}

function cleanName(v: string | null | undefined): string | null {
  const s = (v ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return s || null;
}
