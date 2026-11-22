'use client';
/** A page that failed while rendering: say so, offer to try again or go home (PROMPT.md 8). */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button, buttonClass } from '@/components/ui/atoms';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('error');
  return (
    <main id="main" className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center px-4 py-16">
      <h1 className="font-display text-5xl leading-none font-bold">{t('title')}</h1>
      <p className="mt-3 text-lg text-muted">{t('body')}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="dark" onClick={reset}>
          {t('retry')}
        </Button>
        <Link href="/" className={buttonClass('outline')}>
          {t('home')}
        </Link>
      </div>
    </main>
  );
}
