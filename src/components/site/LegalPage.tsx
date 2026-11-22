/** The sample legal pages (terms, privacy): a clear "sample text" notice, then titled sections. */
import { getTranslations } from 'next-intl/server';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

export async function LegalPage({
  page,
  sections,
}: {
  page: 'terms' | 'privacy';
  sections: readonly string[];
}) {
  const t = await getTranslations('legal');
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-display text-5xl leading-none font-bold">{t(`${page}.title`)}</h1>
        <p
          className="mt-5 rounded-card border-2 border-pick/40 bg-[#fff0e5] px-4 py-3 font-semibold text-pick-ink"
          role="note"
        >
          {t('sample')}
        </p>
        <p className="mt-3 text-sm text-muted">{t('updated')}</p>
        {sections.map((s) => (
          <section key={s} className="mt-8" aria-labelledby={`legal-${s}`}>
            <h2 id={`legal-${s}`} className="font-display text-2xl font-bold">
              {t(`${page}.sections.${s}.title`)}
            </h2>
            <p className="mt-2 text-[17px] leading-relaxed">{t(`${page}.sections.${s}.body`)}</p>
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
