/**
 * The browser database (Dexie on IndexedDB). Only LocalStore uses it. Each event's seat statuses are one
 * Uint8Array (one byte per seat), so a hold or a sale reads and writes a single row inside its transaction;
 * IndexedDB runs read-write transactions on the same table one after another, across tabs, so a seat can
 * never end up in two holds.
 */
import Dexie, { type Table } from 'dexie';
import type { PublicEvent } from '@/lib/events/types';
import type { OrderStatus, PaymentInfo, TicketStatus } from '@/lib/orders';
import type { SeatLabel } from '@/lib/stadium';
import type { OutboxMessage } from './store';

export type EventRow = PublicEvent;

export interface SeatsRow {
  eventId: string;
  version: number;
  /** One byte per seat: 0 available, 1 held, 2 sold, 3 blocked. Closed blocks are applied when read. */
  statuses: Uint8Array;
}

export type HoldStatus = 'active' | 'converted' | 'released' | 'expired';

export interface HoldRow {
  id: string;
  eventId: string;
  /** The tab session that holds the seats, or "sim:..." for a simulated buyer. */
  owner: string;
  seats: number[];
  totalMinor: number;
  status: HoldStatus;
  createdAt: number;
  expiresAt: number;
  /** Simulated buyers: whether they buy (true) or walk away when their time is up. */
  simBuys?: boolean;
}

export interface OrderLine {
  seatIndex: number;
  priceMinor: number;
  holderName: string | null;
}

export interface OrderRow {
  id: string;
  code: string;
  eventId: string;
  holdId: string;
  name: string;
  email: string;
  phone: string;
  locale: string;
  status: OrderStatus;
  lines: OrderLine[];
  subtotalMinor: number;
  feesMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  payment: PaymentInfo;
  createdAt: number;
}

export interface TicketRow {
  id: string;
  orderId: string;
  eventId: string;
  seatIndex: number;
  /** The seat label at purchase time. */
  label: SeatLabel;
  priceMinor: number;
  holderName: string | null;
  token: string;
  status: TicketStatus;
  usedAt: number | null;
  /** The view from the seat, rendered by the picker before checkout (JPEG). */
  view: Blob | null;
  createdAt: number;
}

export interface ViewRow {
  /** `${eventId}:${seat}` */
  key: string;
  eventId: string;
  blob: Blob;
  savedAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * The database name. It changed when the stadium became Dhaka International Stadium (taka prices,
 * Bangladesh fixtures): visitors start with fresh sample data instead of mixing in the old events and prices.
 */
export const DB_NAME = 'dhaka-stadium';

export class StadiumDb extends Dexie {
  events!: Table<EventRow, string>;
  seats!: Table<SeatsRow, string>;
  holds!: Table<HoldRow, string>;
  orders!: Table<OrderRow, string>;
  tickets!: Table<TicketRow, string>;
  views!: Table<ViewRow, string>;
  outbox!: Table<OutboxMessage, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = DB_NAME, options?: ConstructorParameters<typeof Dexie>[1]) {
    super(name, options);
    this.version(1).stores({
      events: 'id, &slug, startsAt',
      seats: 'eventId',
      holds: 'id, eventId, owner, status, expiresAt',
      orders: 'id, &code, eventId, createdAt',
      tickets: 'id, &token, orderId, eventId',
      views: 'key, eventId, savedAt',
      outbox: 'id, orderCode, createdAt',
      meta: 'key',
    });
  }
}
