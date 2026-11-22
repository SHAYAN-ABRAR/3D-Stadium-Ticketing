import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FaqList } from '@/components/site/FaqList';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('pages.faq'), description: t('descriptions.faq') };
}

export default async function FaqPage() {
  const t = await getTranslations('faq');
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-display text-5xl leading-none font-bold">{t('title')}</h1>
        <p className="mt-3 text-lg text-muted">{t('intro')}</p>
        <div className="mt-8">
          <FaqList />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
