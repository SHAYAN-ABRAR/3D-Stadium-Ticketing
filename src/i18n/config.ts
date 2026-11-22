export const locales = ['en', 'bn'] as const;
export type AppLocale = (typeof locales)[number];

export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export const defaultLocale: AppLocale = isLocale(process.env.NEXT_PUBLIC_DEFAULT_LOCALE)
  ? process.env.NEXT_PUBLIC_DEFAULT_LOCALE
  : 'en';

/** BCP 47 tags for Intl formatting. Bengali uses Bangladeshi conventions and Bengali digits. */
export const intlLocale: Record<AppLocale, string> = {
  en: 'en-GB',
  bn: 'bn-BD',
};
