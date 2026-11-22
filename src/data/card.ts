/**
 * The demo card form's checks: card number (Luhn and length per brand), expiry, security code and name.
 * Only the brand and the last four digits ever leave the form (CLAUDE.md); nothing is charged. Test cards:
 * 4242 4242 4242 4242 is approved, 4000 0000 0000 0002 is declined.
 */
import type { CardBrand } from '@/lib/orders';

export const APPROVE_TEST_CARD = '4242 4242 4242 4242';
export const DECLINE_TEST_CARD = '4000 0000 0000 0002';

export function cardDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function cardBrand(digits: string): CardBrand {
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^4/.test(digits)) return 'visa';
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(digits)) return 'mastercard';
  if (/^3(0[0-5]|[689])/.test(digits)) return 'diners';
  if (/^35(2[89]|[3-8]\d)/.test(digits)) return 'jcb';
  if (/^(6011|65|64[4-9])/.test(digits)) return 'discover';
  if (/^62/.test(digits)) return 'unionpay';
  return 'card';
}

const LENGTHS: Record<CardBrand, number[]> = {
  amex: [15],
  visa: [13, 16, 19],
  mastercard: [16],
  diners: [14, 16, 19],
  jcb: [16, 17, 18, 19],
  discover: [16, 17, 18, 19],
  unionpay: [16, 17, 18, 19],
  card: [12, 13, 14, 15, 16, 17, 18, 19],
};

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** The number grouped as printed on the card (Amex 4-6-5, others in fours), for the input field. */
export function formatCardNumber(input: string): string {
  const d = cardDigits(input).slice(0, 19);
  if (cardBrand(d) === 'amex')
    return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');
  return d.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** "MM/YY" as the user types it: digits only, a slash after the month. */
export function formatExpiry(input: string): string {
  const d = cardDigits(input).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** Month and four-digit year, or null. */
export function parseExpiry(input: string): { month: number; year: number } | null {
  const m = /^\s*(\d{1,2})\s*\/?\s*(\d{2}|\d{4})\s*$/.exec(input);
  if (!m) return null;
  const month = Number(m[1]);
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return month >= 1 && month <= 12 ? { month, year } : null;
}

export interface CardInput {
  number: string;
  expiry: string;
  cvc: string;
  name: string;
}

export type CardField = keyof CardInput;

export interface CardCheck {
  ok: boolean;
  errors: CardField[];
  brand: CardBrand;
  last4: string;
}

export function checkCard(input: CardInput, now = new Date()): CardCheck {
  const digits = cardDigits(input.number);
  const brand = cardBrand(digits);
  const errors: CardField[] = [];
  if (!LENGTHS[brand].includes(digits.length) || !luhnValid(digits)) errors.push('number');
  const exp = parseExpiry(input.expiry);
  // A card is valid until the end of its expiry month.
  if (
    !exp ||
    new Date(exp.year, exp.month, 1).getTime() <= now.getTime() ||
    exp.year > now.getFullYear() + 20
  )
    errors.push('expiry');
  if (!new RegExp(`^\\d{${brand === 'amex' ? 4 : 3}}$`).test(input.cvc.trim())) errors.push('cvc');
  if (input.name.trim().length < 2) errors.push('name');
  return { ok: errors.length === 0, errors, brand, last4: digits.slice(-4) };
}

/** The demo's answer: the decline test card is declined, every other valid card is approved. */
export function demoApproves(input: string): boolean {
  return cardDigits(input) !== cardDigits(DECLINE_TEST_CARD);
}
