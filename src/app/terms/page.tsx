import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/site/LegalPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('pages.terms'), description: t('descriptions.terms') };
}

export default function TermsPage() {
  return <LegalPage page="terms" sections={['about', 'tickets', 'prices', 'holds', 'refunds', 'entry']} />;
}
