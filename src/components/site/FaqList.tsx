/** Questions and answers as native disclosure widgets (keyboard and screen-reader friendly without script). */
import { getTranslations } from 'next-intl/server';

export const FAQ_KEYS = [
  'choose',
  'view',
  'hold',
  'max',
  'noWebgl',
  'payment',
  'tickets',
  'lost',
  'accessible',
  'vip',
  'data',
] as const;

export async function FaqList({ keys = FAQ_KEYS }: { keys?: readonly (typeof FAQ_KEYS)[number][] }) {
  const t = await getTranslations('faq.items');
  return (
    <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-paper">
      {keys.map((k) => (
        <details key={k} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-lg font-semibold hover:bg-paper-2 [&::-webkit-details-marker]:hidden">
            <span>{t(`${k}.q`)}</span>
            <svg
              viewBox="0 0 24 24"
              className="size-5 flex-none transition-transform group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <p className="px-4 pb-4 text-[17px] leading-relaxed text-ink/85">{t(`${k}.a`)}</p>
        </details>
      ))}
    </div>
  );
}
