import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmailPreview } from '@/components/order/EmailPreview';
import { SiteHeader } from '@/components/site/SiteHeader';
import { normaliseOrderCode } from '@/lib/tickets/codes';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('emailPreview');
  return { title: t('title'), robots: { index: false } };
}

/** The demo outbox of one order (no email is ever sent). */
export default async function EmailPreviewPage({ params }: PageProps<'/orders/[code]/email'>) {
  const raw = (await params).code;
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-4xl px-4 pt-6 pb-16">
        <EmailPreview code={normaliseOrderCode(raw) ?? raw} />
      </main>
    </>
  );
}
