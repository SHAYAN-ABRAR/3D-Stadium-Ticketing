'use client';
/** English / Bengali switch. The locale lives in the NEXT_LOCALE cookie (no locale routing). */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { LOCALE_COOKIE, locales, type AppLocale } from '@/i18n/config';

/** Remembers the language for a year (read on the server by src/i18n/request.ts). */
export function writeLocaleCookie(l: AppLocale) {
  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
}

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const current = useLocale();
  const t = useTranslations('language');
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (l: AppLocale) => {
    if (l === current) return;
    writeLocaleCookie(l);
    start(() => router.refresh());
  };
  return (
    <div
      role="group"
      aria-label={t('label')}
      className={`inline-flex items-center rounded-full bg-paper p-1 shadow-soft ${pending ? 'opacity-70' : ''} ${className}`}
    >
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === current}
          onClick={() => choose(l)}
          className={`min-h-9 min-w-11 rounded-full px-2.5 text-sm font-semibold ${
            l === current ? 'bg-ink text-white' : 'text-ink hover:bg-paper-2'
          } ${l === 'bn' ? 'font-bn-system' : ''}`}
        >
          {t(`short.${l}`)}
        </button>
      ))}
    </div>
  );
}
