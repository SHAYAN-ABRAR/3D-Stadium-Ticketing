/** The site footer: the venue's address, the site's pages, the legal pages and the sample-site note. */
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { brand } from '@/config/brand';
import { LanguageSwitcher } from '../LanguageSwitcher';

export async function SiteFooter() {
  const t = await getTranslations('site');
  const nav = [
    { href: '/events', label: t('nav.events') },
    { href: '/venue', label: t('nav.venue') },
    { href: '/faq', label: t('nav.faq') },
    { href: '/orders/lookup', label: t('findOrder') },
  ];
  const legal = [
    { href: '/terms', label: t('nav.terms') },
    { href: '/privacy', label: t('nav.privacy') },
  ];
  const link = 'inline-flex min-h-11 items-center hover:text-white hover:underline underline-offset-4';
  return (
    <footer className="bg-ink text-white/80">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 tab:grid-cols-2 desk:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="font-display text-3xl font-bold text-white">{brand.name}</p>
          <address className="mt-3 text-sm leading-relaxed not-italic">
            {brand.address.line1}
            <br />
            {brand.address.line2}, {brand.address.city}
            <br />
            {brand.address.country}
          </address>
          <div className="mt-5">
            <LanguageSwitcher />
          </div>
        </div>
        <nav aria-label={t('footer.pages')}>
          <h2 className="text-sm font-bold tracking-wide text-white uppercase">{t('footer.pages')}</h2>
          <ul className="mt-2">
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className={link}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t('footer.legal')}>
          <h2 className="text-sm font-bold tracking-wide text-white uppercase">{t('footer.legal')}</h2>
          <ul className="mt-2">
            {legal.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className={link}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/15">
        <p className="mx-auto max-w-6xl px-4 py-5 text-sm">{t('sample')}</p>
      </div>
    </footer>
  );
}
