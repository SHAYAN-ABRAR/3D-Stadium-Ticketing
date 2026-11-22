/**
 * Number, money and date formatting with Intl, for the active locale and the venue time zone.
 * Prices always show the currency code (AED); whole amounts have no decimals.
 */
import { brand } from '@/config/brand';
import { intlLocale, type AppLocale } from '@/i18n/config';

const MINOR = 10 ** brand.currencyDecimals;

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function nf(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = cache.get(key) as Intl.NumberFormat | undefined;
  if (!f) cache.set(key, (f = make()));
  return f;
}
function df(key: string, make: () => Intl.DateTimeFormat): Intl.DateTimeFormat {
  let f = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!f) cache.set(key, (f = make()));
  return f;
}

export function formatMoney(
  minor: number,
  locale: AppLocale = 'en',
  currency: string = brand.currency,
): string {
  const whole = minor % MINOR === 0;
  const f = nf(`m:${locale}:${currency}:${whole}`, () => {
    return new Intl.NumberFormat(intlLocale[locale], {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: whole ? 0 : brand.currencyDecimals,
      maximumFractionDigits: brand.currencyDecimals,
    });
  });
  // Intl puts a no-break space between code and amount; keep it (it never wraps).
  return f.format(minor / MINOR);
}

/** Just the amount, without the currency code (the ticket stub prints the code above it). */
export function formatAmount(minor: number, locale: AppLocale = 'en'): string {
  const whole = minor % MINOR === 0;
  return nf(
    `a:${locale}:${whole}`,
    () =>
      new Intl.NumberFormat(intlLocale[locale], {
        minimumFractionDigits: whole ? 0 : brand.currencyDecimals,
        maximumFractionDigits: brand.currencyDecimals,
      }),
  ).format(minor / MINOR);
}

export function formatNumber(n: number, locale: AppLocale = 'en'): string {
  return nf(`n:${locale}`, () => new Intl.NumberFormat(intlLocale[locale])).format(n);
}

type DateStyle = 'long' | 'medium' | 'short' | 'weekdayShort' | 'time' | 'dayMonth' | 'monthYear';

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  medium: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
  short: { day: 'numeric', month: 'short' },
  weekdayShort: { weekday: 'short', day: 'numeric', month: 'short' },
  time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  dayMonth: { day: 'numeric', month: 'long' },
  monthYear: { month: 'long', year: 'numeric' },
};

/** A date or time in the venue time zone (epoch milliseconds, an ISO string or a Date). */
export function formatDate(at: number | string | Date, style: DateStyle, locale: AppLocale = 'en'): string {
  const d = at instanceof Date ? at : new Date(at);
  return df(
    `d:${locale}:${style}`,
    () => new Intl.DateTimeFormat(intlLocale[locale], { ...DATE_OPTIONS[style], timeZone: brand.timeZone }),
  )
    .format(d)
    .replace(/,/g, locale === 'en' ? '' : ',');
}

/** Parts of a date in the venue time zone (for date blocks on event cards). */
export function dateParts(at: number | string, locale: AppLocale = 'en') {
  const d = new Date(at);
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(intlLocale[locale], { ...o, timeZone: brand.timeZone }).format(d);
  return {
    weekday: part({ weekday: 'short' }),
    day: part({ day: 'numeric' }),
    month: part({ month: 'short' }),
    time: formatDate(d, 'time', locale),
  };
}

/** A countdown such as 9:41 (minutes and seconds). */
export function formatCountdown(ms: number): string {
  const m = Math.floor(ms / 60000),
    s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Texts for the 3D boards, always in the venue's own language (English). */
export function boardDate(at: number | string): string {
  return formatDate(at, 'weekdayShort', 'en').toUpperCase();
}
