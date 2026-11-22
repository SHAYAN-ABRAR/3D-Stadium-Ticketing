import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LookupForm } from '@/components/order/LookupForm';
import { OrdersHere } from '@/components/order/OrdersHere';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('lookup');
  return { title: t('metaTitle'), robots: { index: false } };
}

/** Order lookup: code and email (orders live in the browser that bought them), and this browser's orders. */
export default async function LookupPage({ searchParams }: PageProps<'/orders/lookup'>) {
  const sp = await searchParams;
  const t = await getTranslations('lookup');
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-md px-4 py-10">
        <div className="card px-6 py-6">
          <h1 className="font-display text-4xl leading-none font-bold">{t('title')}</h1>
          <p className="mt-3 text-muted">{t('body')}</p>
          <LookupForm initialCode={typeof sp.code === 'string' ? sp.code.slice(0, 20) : ''} />
        </div>
        <OrdersHere />
      </main>
      <SiteFooter />
    </>
  );
}
