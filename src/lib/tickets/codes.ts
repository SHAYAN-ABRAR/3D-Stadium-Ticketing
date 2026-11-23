/**
 * Order codes (DI-7F3K9Q: no look-alike characters) and ticket tokens. Without a server there is no secret
 * to sign with: a token is 128 random bits, and the ticket lives in the browser that bought it. The QR code
 * encodes `${origin}/tickets/${token}`.
 */
import { brand } from '@/config/brand';

/** Order code alphabet without look-alikes (no 0/O, 1/I/L). */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/** A uniformly random index below `max` (rejection sampling, no modulo bias). */
function randomIndex(max: number): number {
  const limit = 256 - (256 % max);
  for (;;) {
    const [b] = randomBytes(1);
    if (b < limit) return b % max;
  }
}

export function newOrderCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomIndex(CODE_ALPHABET.length)];
  return `${brand.orderPrefix}-${s}`;
}

/** Normalises what a visitor typed ("di 7f3k9q" -> "DI-7F3K9Q"); null if it can't be a code. */
export function normaliseOrderCode(input: string): string | null {
  const t = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prefix = brand.orderPrefix.toUpperCase();
  const body = t.startsWith(prefix) ? t.slice(prefix.length) : t;
  if (body.length !== 6 || [...body].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return `${prefix}-${body}`;
}

/** 128 random bits as base64url (22 characters). */
export function newTicketToken(): string {
  let s = '';
  for (const b of randomBytes(16)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Whether a string looks like a ticket token (the ticket page checks it before reading the store). */
export function isTicketToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(token);
}

/** A random id for records (orders, tickets, holds, outbox messages). */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}
