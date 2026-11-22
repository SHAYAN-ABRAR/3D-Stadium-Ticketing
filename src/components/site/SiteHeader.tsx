/**
 * Header of the site's pages: the brand, the main navigation (Events, The venue, FAQ, Find your order) and
 * the language switch. Below 901 px the links move into a menu sheet.
 */
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { brand } from '@/config/brand';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { MobileMenu } from './MobileMenu';

export async function SiteHeader() {
  const t = await getTranslations('site');
  const items = [
    { href: '/events', label: t('nav.events') },
    { href: '/venue', label: t('nav.venue') },
    { href: '/faq', label: t('nav.faq') },
    { href: '/orders/lookup', label: t('findOrder') },
  ];
  return (
    <header className="border-b border-line bg-paper">
      <a
        href="#main"
        className="sr-only rounded-full bg-ink px-4 py-2 font-semibold text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        {t('skip')}
      </a>
      <div className="mx-auto flex max-w-6xl items-center gap-x-4 px-4 py-3">
        <Link href="/" className="font-display text-2xl leading-none font-bold tab:text-[28px]">
          {brand.name}
        </Link>
        <nav className="ml-auto hidden items-center gap-1 desk:flex" aria-label={t('nav.label')}>
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold hover:bg-paper-2"
            >
              {it.label}
            </Link>
          ))}
          <LanguageSwitcher className="ml-2" />
        </nav>
        <div className="ml-auto desk:hidden">
          <MobileMenu items={items} labels={{ open: t('nav.menu'), close: t('nav.close') }} />
        </div>
      </div>
    </header>
  );
}
