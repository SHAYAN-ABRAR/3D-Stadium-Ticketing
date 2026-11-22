import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { brand } from '@/config/brand';
import { StadiumPlan } from '@/components/plan/StadiumPlan';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: t('pages.venue'),
    description: t('descriptions.venue', { stadium: brand.name }),
  };
}

const GETTING = ['metro', 'bus', 'car', 'bike', 'taxi'] as const;
const ACCESS = ['wheelchair', 'entrances', 'hearing', 'book'] as const;
const FACILITIES = ['food', 'family', 'firstAid', 'cashless', 'wifi'] as const;

export default async function VenuePage() {
  const t = await getTranslations('venue');
  const h2 = 'font-display text-3xl font-bold';
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="font-display text-5xl leading-none font-bold">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">{t('intro', { stadium: brand.name })}</p>
        <p className="mt-4 max-w-2xl rounded-card bg-paper-2 px-4 py-3 text-sm" role="note">
          {t('sample')}
        </p>

        <div className="mt-10 grid gap-10 desk:grid-cols-[1fr_1.15fr]">
          <div>
            <section aria-labelledby="address">
              <h2 id="address" className={h2}>
                {t('address')}
              </h2>
              <address className="mt-2 text-[17px] leading-relaxed not-italic">
                {brand.name}
                <br />
                {brand.address.line1}, {brand.address.line2}
                <br />
                {brand.address.city}, {brand.address.country}
              </address>
              <p className="mt-2 font-semibold">{t('doors', { minutes: brand.doorsBeforeKickoffMinutes })}</p>
            </section>

            <section className="mt-10" aria-labelledby="getting">
              <h2 id="getting" className={h2}>
                {t('getting.title')}
              </h2>
              <dl className="mt-3 grid gap-4">
                {GETTING.map((k) => (
                  <div key={k}>
                    <dt className="text-lg font-bold">{t(`getting.${k}.title`)}</dt>
                    <dd className="mt-0.5 leading-relaxed text-ink/85">{t(`getting.${k}.body`)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <section aria-labelledby="gates">
            <h2 id="gates" className={h2}>
              {t('gates.title')}
            </h2>
            <p className="mt-2 leading-relaxed text-ink/85">{t('gates.body')}</p>
            <figure className="mt-4 rounded-card border border-line bg-paper p-3 shadow-soft">
              <StadiumPlan gates title={t('gates.planLabel')} className="h-auto w-full" />
              <figcaption className="sr-only">{t('gates.planLabel')}</figcaption>
            </figure>
          </section>
        </div>

        <div className="mt-12 grid gap-10 desk:grid-cols-3">
          <section aria-labelledby="access">
            <h2 id="access" className={h2}>
              {t('access.title')}
            </h2>
            <ul className="mt-3 grid gap-3">
              {ACCESS.map((k) => (
                <li key={k} className="leading-relaxed">
                  {t(`access.${k}`)}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="facilities">
            <h2 id="facilities" className={h2}>
              {t('facilities.title')}
            </h2>
            <ul className="mt-3 grid gap-3">
              {FACILITIES.map((k) => (
                <li key={k} className="leading-relaxed">
                  {t(`facilities.${k}`)}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="bags">
            <h2 id="bags" className={h2}>
              {t('bags.title')}
            </h2>
            <p className="mt-3 leading-relaxed">{t('bags.body')}</p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
