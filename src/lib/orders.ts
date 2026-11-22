/**
 * Order totals and the order shapes shared by the data store, the order pages and the email. Totals come
 * only from here and the pricing module; fee and tax lines appear only when brand.ts configures them.
 */
import { brand } from '@/config/brand';
import type { SeatLabel } from '@/lib/stadium';

export interface OrderTotals {
  subtotalMinor: number;
  feesMinor: number;
  taxMinor: number;
  totalMinor: number;
}

interface FeeConfig {
  serviceFeePerTicketMinor: number;
  taxRate: number;
}

/** Totals of an order from its seat prices: fees per ticket, then tax on subtotal plus fees. */
export function orderTotals(seatPricesMinor: readonly number[], cfg: FeeConfig = brand): OrderTotals {
  const subtotalMinor = seatPricesMinor.reduce((sum, p) => sum + p, 0);
  const feesMinor = cfg.serviceFeePerTicketMinor * seatPricesMinor.length;
  const taxMinor = Math.round((subtotalMinor + feesMinor) * cfg.taxRate);
  return { subtotalMinor, feesMinor, taxMinor, totalMinor: subtotalMinor + feesMinor + taxMinor };
}

/** A demo payment completes at once, so orders are paid; the order pages also show cancelled and refunded orders. */
export type OrderStatus = 'paid' | 'cancelled' | 'refunded';
export type TicketStatus = 'valid' | 'used' | 'void';

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'jcb' | 'unionpay' | 'diners' | 'card';

/** What the demo checkout keeps of a card: never the full number. */
export interface PaymentInfo {
  brand: CardBrand;
  last4: string;
}

export interface OrderEventInfo {
  id: string;
  slug: string;
  title: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeColor: string;
  awayColor: string;
  /** Epoch milliseconds. */
  startsAt: number;
  doorsAt: number;
}

export interface OrderTicketInfo {
  id: string;
  seatIndex: number;
  label: SeatLabel;
  priceMinor: number;
  holderName: string | null;
  token: string;
  status: TicketStatus;
  usedAt: number | null;
  hasView: boolean;
}

/** An order as the visitor sees it (the order page, the ticket page and the email). */
export interface OrderInfo {
  id: string;
  code: string;
  status: OrderStatus;
  name: string;
  email: string;
  phone: string;
  locale: string;
  currency: string;
  totals: OrderTotals;
  payment: PaymentInfo;
  createdAt: number;
  event: OrderEventInfo;
  tickets: OrderTicketInfo[];
}
