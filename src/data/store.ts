/**
 * The data layer's contract. Every read and write of events, seats, holds, orders, tickets, seat-view
 * pictures and the email outbox goes through a DataStore. LocalStore (src/data/local-store.ts) implements it
 * on Dexie, in the visitor's own browser: there is no server. Components and the engine never touch Dexie.
 *
 * Seat statuses: 0 available, 1 held, 2 sold, 3 blocked or closed. Times are epoch milliseconds (UTC);
 * money is integer minor units.
 */
import type { EventBadge } from '@/lib/events/summary';
import type { PublicEvent } from '@/lib/events/types';
import type { OrderInfo, OrderTicketInfo, PaymentInfo } from '@/lib/orders';

export type SeatChanges = Array<[seatIndex: number, status: number]>;

/**
 * A change of an event's seats, from this tab, another tab or the sales simulator. `reload` asks listeners
 * to read the whole event again (closures changed, or the data was rebuilt).
 */
export type SeatUpdate =
  | { eventId: string; version: number; changes: SeatChanges }
  | { eventId: string; version: number; reload: true };

export interface SeatState {
  version: number;
  /** One status per seat (closed blocks read as 3). */
  statuses: Uint8Array;
}

export interface HoldInfo {
  id: string;
  eventId: string;
  seats: number[];
  /** Epoch milliseconds. */
  expiresAt: number;
  totalMinor: number;
}

export type HoldFailure = 'conflict' | 'not_on_sale' | 'invalid' | 'not_found';

export type HoldResult =
  { ok: true; hold: HoldInfo } | { ok: false; reason: HoldFailure; conflicts: number[] };

export interface EventSummary {
  event: PublicEvent;
  /** The cheapest category price, or null. */
  fromPriceMinor: number | null;
  /** Share of seats sold or held (0-1). */
  sellThrough: number;
  badge: EventBadge;
}

export interface Buyer {
  name: string;
  email: string;
  phone: string;
}

/** The demo payment: what the card form decided, and what may be kept of the card (never the number). */
export interface DemoPayment extends PaymentInfo {
  approved: boolean;
}

export interface CheckoutInput {
  holdId: string;
  buyer: Buyer;
  /** Optional holder name per seat, in the order of the hold's seats (ascending seat index). */
  holders: (string | null)[];
  payment: DemoPayment;
  locale: string;
}

export type CheckoutResult =
  { ok: true; code: string } | { ok: false; reason: 'declined' | 'expired' | 'invalid' };

/** An email the site would have sent (it never sends one: the outbox is shown as a preview). */
export interface OutboxMessage {
  id: string;
  orderCode: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  locale: string;
  createdAt: number;
}

export interface DataStore {
  /** Opens the database and creates the sample data on the first visit. Every other call waits for it. */
  ready(): Promise<void>;

  listEvents(opts?: { includePast?: boolean }): Promise<EventSummary[]>;
  /** By id or slug. */
  getEvent(idOrSlug: string): Promise<PublicEvent | null>;

  seats(eventId: string): Promise<SeatState>;
  /** Seat changes of one event, from any tab. Returns the unsubscribe function. */
  onSeats(eventId: string, listener: (update: SeatUpdate) => void): () => void;

  /** Holds seats for this tab's session (replacing its previous hold for the event). */
  hold(eventId: string, seats: number[]): Promise<HoldResult>;
  releaseHold(holdId: string): Promise<boolean>;
  /** This tab's active hold for an event (restores the picker after a reload). */
  currentHold(eventId: string): Promise<HoldInfo | null>;

  /** Seat-view pictures rendered by the picker, kept until checkout copies them onto the tickets. */
  saveViews(eventId: string, views: { seat: number; blob: Blob }[]): Promise<void>;
  loadViews(eventId: string, seats: number[]): Promise<Map<number, Blob>>;

  /** The demo payment and the sale, in one transaction: held seats become sold seats and tickets. */
  checkout(input: CheckoutInput): Promise<CheckoutResult>;

  order(code: string): Promise<OrderInfo | null>;
  /** Orders bought in this browser, newest first. */
  orders(): Promise<OrderInfo[]>;
  /** The order code when the code and email match an order in this browser. */
  lookupOrder(code: string, email: string): Promise<string | null>;
  ticket(token: string): Promise<{ order: OrderInfo; ticket: OrderTicketInfo } | null>;
  ticketView(ticketId: string): Promise<Blob | null>;
  /** Orders, tickets or the outbox changed (any tab). */
  onOrders(listener: () => void): () => void;

  outbox(orderCode: string): Promise<OutboxMessage[]>;
  /** Puts the confirmation email in the outbox again. */
  resendEmail(orderCode: string): Promise<OutboxMessage | null>;

  /** Simulated buyers for an event while it is open (one tab at a time). Returns the stop function. */
  startSimulator(eventId: string, opts?: { intervalMs?: number }): () => void;
}
