import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CheckoutScreen } from '@/components/checkout/CheckoutScreen';
import { SiteHeader } from '@/components/site/SiteHeader';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('checkout');
  return { title: t('metaTitle'), robots: { index: false } };
}

/** Checkout: needs this tab's active hold for the event (read from the browser's data store). */
export default async function CheckoutPage({ searchParams }: PageProps<'/checkout'>) {
  const sp = await searchParams;
  const slug = typeof sp.event === 'string' ? sp.event : '';
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 pt-6 pb-16">
        <CheckoutScreen slug={slug} />
      </main>
    </>
  );
}
