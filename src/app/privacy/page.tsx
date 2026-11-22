import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/site/LegalPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('pages.privacy'), description: t('descriptions.privacy') };
}

export default function PrivacyPage() {
  return <LegalPage page="privacy" sections={['summary', 'stored', 'card', 'cookies', 'deleting']} />;
}
