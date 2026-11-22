import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OrderScreen } from '@/components/order/OrderScreen';
import { SiteHeader } from '@/components/site/SiteHeader';
import { normaliseOrderCode } from '@/lib/tickets/codes';

export async function generateMetadata({ params }: PageProps<'/orders/[code]'>): Promise<Metadata> {
  const t = await getTranslations('order');
  const code = normaliseOrderCode((await params).code) ?? '';
  return { title: t('metaTitle', { code }), robots: { index: false } };
}

/** Confirmation and order page. The order is read from the visitor's browser (the data store). */
export default async function OrderPage({ params, searchParams }: PageProps<'/orders/[code]'>) {
  const raw = (await params).code;
  const sp = await searchParams;
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-5xl px-4 pt-6 pb-16">
        <OrderScreen code={normaliseOrderCode(raw) ?? raw} fresh={sp.new === '1'} />
      </main>
    </>
  );
}
