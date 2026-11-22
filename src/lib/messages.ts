/**
 * Translations outside React (the confirmation email, the PDF): the site's own message files, loaded on
 * demand so each language is a separate chunk.
 */
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import { brand } from '@/config/brand';
import { isLocale, type AppLocale } from '@/i18n/config';

export type Translate = (key: string, values?: Record<string, string | number>) => string;

export function localeOf(value: string | null | undefined): AppLocale {
  return isLocale(value) ? value : 'en';
}

export async function loadMessages(locale: AppLocale): Promise<AbstractIntlMessages> {
  return locale === 'bn'
    ? (await import('../../messages/bn.json')).default
    : (await import('../../messages/en.json')).default;
}

/** A translator for one namespace of a message set. */
export function translatorFor(
  messages: AbstractIntlMessages,
  locale: AppLocale,
  namespace: string,
): Translate {
  const t = createTranslator({ locale, messages, namespace, timeZone: brand.timeZone });
  return (key, values) => (t as unknown as Translate)(key, values);
}
