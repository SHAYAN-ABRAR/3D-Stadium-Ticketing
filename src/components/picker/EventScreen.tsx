'use client';
/**
 * The event page in the browser: reads the event from the data store (which creates the sample data on a
 * first visit), then mounts the picker. Until then it shows the picker's own loading card.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useStoreQuery } from '@/data/hooks';
import { buttonClass } from '../ui/atoms';
import { PickerApp, type DeepLink } from './PickerApp';

export function EventScreen({ slug, deepLink }: { slug: string; deepLink: DeepLink }) {
  const q = useStoreQuery(`event:${slug}`, (store) => store.getEvent(slug));
  if (q.status === 'loading') return <Opening />;
  if (q.status === 'error' || !q.data || q.data.status === 'draft') return <NotFound />;
  return <PickerApp event={q.data} deepLink={deepLink} />;
}

function Opening() {
  const t = useTranslations('picker');
  return (
    <div className="fixed inset-0 grid place-items-center bg-linear-to-b from-[#d7e1ea] to-[#e9dcc6]">
      <div className="card w-[min(360px,calc(100%-32px))] px-6 py-5" role="status" aria-live="polite">
        <h2 className="font-display text-[26px] leading-tight font-bold">{t('loaderTitle')}</h2>
        <div className="mt-3.5 mb-2 h-2 overflow-hidden rounded bg-[#e6e1d6]">
          <i className="block h-full w-[3%] bg-pick" />
        </div>
        <p className="text-sm text-muted">{t('steps.data')}</p>
      </div>
    </div>
  );
}

function NotFound() {
  const t = useTranslations('eventPage');
  return (
    <main id="main" className="mx-auto grid min-h-dvh max-w-xl place-items-center px-4">
      <div className="card w-full px-6 py-6">
        <h1 className="font-display text-4xl leading-none font-bold">{t('notFoundTitle')}</h1>
        <p className="mt-3 text-muted">{t('notFoundBody')}</p>
        <Link href="/" className={buttonClass('primary', 'mt-5')}>
          {t('backHome')}
        </Link>
      </div>
    </main>
  );
}
