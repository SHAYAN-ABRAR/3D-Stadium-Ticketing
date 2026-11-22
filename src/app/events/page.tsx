import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { brand } from '@/config/brand';
import { EventsBrowser } from '@/components/events/EventsBrowser';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: t('pages.events'),
    description: t('descriptions.events', { stadium: brand.name }),
  };
}

export default async function EventsPage() {
  const t = await getTranslations('events');
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto min-h-[70vh] max-w-6xl px-4 py-12">
        <h1 className="font-display text-5xl leading-none font-bold">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">{t('intro', { stadium: brand.name })}</p>
        <div className="mt-8">
          <Suspense fallback={null}>
            <EventsBrowser />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
