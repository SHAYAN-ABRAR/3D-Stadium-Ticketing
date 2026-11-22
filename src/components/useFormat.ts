'use client';
/** Locale-aware formatting for client components (money, numbers, dates, stand and tier names). */
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { isLocale, type AppLocale } from '@/i18n/config';
import { formatAmount, formatDate, formatMoney, formatNumber } from '@/lib/format';
import type { StandKey, TierKey } from '@/lib/stadium';

export function useFormat() {
  const raw = useLocale();
  const locale: AppLocale = isLocale(raw) ? raw : 'en';
  const t = useTranslations('names');
  return useMemo(
    () => ({
      locale,
      money: (minor: number) => formatMoney(minor, locale),
      amount: (minor: number) => formatAmount(minor, locale),
      num: (n: number) => formatNumber(n, locale),
      date: (at: number | string, style: Parameters<typeof formatDate>[1]) => formatDate(at, style, locale),
      stand: (k: StandKey) => t(`stand.${k}`),
      tier: (k: TierKey) => t(`tier.${k}`),
    }),
    [locale, t],
  );
}

export type Fmt = ReturnType<typeof useFormat>;
