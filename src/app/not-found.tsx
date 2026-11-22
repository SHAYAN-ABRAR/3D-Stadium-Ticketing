import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { buttonClass } from '@/components/ui/atoms';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('pages.notFound') };
}

export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-center px-4 py-16">
        <p className="font-display text-8xl leading-none font-bold text-pick" aria-hidden>
          404
        </p>
        <h1 className="mt-4 font-display text-5xl leading-none font-bold">{t('title')}</h1>
        <p className="mt-3 text-lg text-muted">{t('body')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className={buttonClass('dark')}>
            {t('home')}
          </Link>
          <Link href="/events" className={buttonClass('outline')}>
            {t('events')}
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
