import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { brand } from '@/config/brand';
import { defaultLocale, isLocale, LOCALE_COOKIE } from './config';

// No locale routing: the locale comes from the NEXT_LOCALE cookie (PROMPT.md section 11).
export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie) ? fromCookie : defaultLocale;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return {
    locale,
    messages,
    timeZone: brand.timeZone,
  };
});
