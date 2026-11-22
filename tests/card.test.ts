import { describe, expect, it } from 'vitest';
import {
  APPROVE_TEST_CARD,
  cardBrand,
  cardDigits,
  checkCard,
  DECLINE_TEST_CARD,
  demoApproves,
  formatCardNumber,
  formatExpiry,
  luhnValid,
  parseExpiry,
} from '@/data/card';

const NOW = new Date(2026, 10, 22);
const good = { number: APPROVE_TEST_CARD, expiry: '12/29', cvc: '123', name: 'Dana Example' };

describe('demo card checks', () => {
  it('knows the brands and the Luhn checksum', () => {
    expect(cardBrand('4242424242424242')).toBe('visa');
    expect(cardBrand('5555555555554444')).toBe('mastercard');
    expect(cardBrand('2223003122003222')).toBe('mastercard');
    expect(cardBrand('378282246310005')).toBe('amex');
    expect(cardBrand('6011111111111117')).toBe('discover');
    expect(cardBrand('3566002020360505')).toBe('jcb');
    expect(cardBrand('9999999999999995')).toBe('card');
    expect(luhnValid('4242424242424242')).toBe(true);
    expect(luhnValid('4242424242424241')).toBe(false);
  });

  it('formats what the visitor types', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('3782 822463 10005')).toBe('3782 822463 10005');
    expect(formatExpiry('1229')).toBe('12/29');
    expect(parseExpiry('12/29')).toEqual({ month: 12, year: 2029 });
    expect(parseExpiry('13/29')).toBeNull();
  });

  it('accepts a valid card and reports each bad field', () => {
    expect(checkCard(good, NOW)).toEqual({ ok: true, errors: [], brand: 'visa', last4: '4242' });
    expect(checkCard({ ...good, number: '4242 4242 4242 4241' }, NOW).errors).toEqual(['number']);
    expect(checkCard({ ...good, expiry: '10/26' }, NOW).errors).toEqual(['expiry']);
    expect(checkCard({ ...good, expiry: '11/26' }, NOW).errors).toEqual([]);
    expect(checkCard({ ...good, cvc: '12' }, NOW).errors).toEqual(['cvc']);
    expect(checkCard({ ...good, number: '3782 822463 10005', cvc: '123' }, NOW).errors).toEqual(['cvc']);
    expect(checkCard({ ...good, name: ' ' }, NOW).errors).toEqual(['name']);
  });

  it('declines only the decline test card, and never needs more than the last four digits', () => {
    expect(demoApproves(APPROVE_TEST_CARD)).toBe(true);
    expect(demoApproves(DECLINE_TEST_CARD)).toBe(false);
    expect(checkCard({ ...good, number: DECLINE_TEST_CARD }, NOW).ok).toBe(true);
    expect(cardDigits(' 4242-4242 ')).toBe('42424242');
  });
});
