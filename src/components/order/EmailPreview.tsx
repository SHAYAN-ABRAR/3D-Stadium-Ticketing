'use client';
/**
 * The demo outbox for one order: every confirmation email the site "sent" (it never sends one), newest
 * first, shown in a sandboxed frame (no scripts; links open in a new tab).
 */
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useStoreQuery } from '@/data/hooks';
import { buttonClass, ChevronLeft } from '../ui/atoms';
import { useFormat } from '../useFormat';

export function EmailPreview({ code }: { code: string }) {
  const t = useTranslations('emailPreview');
  const fmt = useFormat();
  const q = useStoreQuery(`outbox:${code}`, (store) => store.outbox(code), { watchOrders: true });
  const [picked, setPicked] = useState<string | null>(null);
  if (q.status === 'loading') return <p className="py-16 text-center text-muted">{t('loading')}</p>;
  const messages = q.status === 'ready' ? [...q.data].reverse() : [];
  const message = messages.find((m) => m.id === picked) ?? messages[0];
  return (
    <div>
      <Link href={`/orders/${code}`} className={buttonClass('link', 'text-sm')}>
        <ChevronLeft className="size-4" />
        {t('back')}
      </Link>
      <h1 className="mt-2 font-display text-5xl leading-none font-bold">{t('title')}</h1>
      <p className="mt-2 text-muted">{t('demo')}</p>
      {!message ? (
        <p className="card mt-6 px-5 py-4">{t('empty')}</p>
      ) : (
        <>
          {messages.length > 1 ? (
            <div
              className="mt-4 flex flex-wrap gap-2"
              role="group"
              aria-label={t('copies', { count: messages.length })}
            >
              {messages.map((m, k) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={m.id === message.id}
                  onClick={() => setPicked(m.id)}
                  className={buttonClass(m.id === message.id ? 'dark' : 'quiet', 'text-sm')}
                >
                  {t('copy', { n: messages.length - k, time: fmt.date(m.createdAt, 'time') })}
                </button>
              ))}
            </div>
          ) : null}
          <dl className="card mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-5 py-4 text-sm">
            <dt className="font-semibold text-muted">{t('to')}</dt>
            <dd>{message.to}</dd>
            <dt className="font-semibold text-muted">{t('subject')}</dt>
            <dd className="font-semibold">{message.subject}</dd>
            <dt className="font-semibold text-muted">{t('written')}</dt>
            <dd>
              {fmt.date(message.createdAt, 'medium')} · {fmt.date(message.createdAt, 'time')}
            </dd>
          </dl>
          <iframe
            title={message.subject}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={message.html.replace('<head>', '<head><base target="_blank">')}
            className="mt-4 h-[80vh] w-full rounded-card border border-line bg-white"
          />
        </>
      )}
    </div>
  );
}
