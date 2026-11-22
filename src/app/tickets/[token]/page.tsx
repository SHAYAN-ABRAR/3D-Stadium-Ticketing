import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TicketScreen } from '@/components/order/TicketScreen';
import { SiteHeader } from '@/components/site/SiteHeader';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ticketPage');
  return { title: t('metaTitle'), robots: { index: false } };
}

/** One ticket, phone first. The ticket is read from the visitor's browser (the data store). */
export default async function TicketPage({ params }: PageProps<'/tickets/[token]'>) {
  const { token } = await params;
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-md px-4 pt-5 pb-12">
        <TicketScreen token={token} />
      </main>
    </>
  );
}
