import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { brand } from '@/config/brand';
import { HomeHero } from '@/components/home/HomeHero';
import { UpcomingEvents } from '@/components/home/Upcoming';
import { StadiumPlan } from '@/components/plan/StadiumPlan';
import { FaqList } from '@/components/site/FaqList';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { buttonClass } from '@/components/ui/atoms';

const STEPS = [
  { key: 'pick', icon: 'M12 3l7 4v10l-7 4-7-4V7zM12 12l7-4M12 12v9M12 12L5 8' },
  {
    key: 'view',
    icon: 'M2.5 12C4.5 7.5 8 5 12 5s7.5 2.5 9.5 7c-2 4.5-5.5 7-9.5 7s-7.5-2.5-9.5-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  },
  { key: 'ticket', icon: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 7v10' },
] as const;

const FACILITIES = ['food', 'access', 'family', 'firstAid', 'cashless'] as const;

export default async function HomePage() {
  const t = await getTranslations('home');
  return (
    <>
      <SiteHeader />
      <main id="main">
        <HomeHero />
        <UpcomingEvents />

        <section className="bg-paper-2" aria-labelledby="how">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <h2 id="how" className="font-display text-4xl font-bold">
              {t('how.title')}
            </h2>
            <ol className="mt-6 grid gap-4 desk:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.key} className="rounded-card bg-paper p-5 shadow-soft">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid size-11 place-items-center rounded-full bg-pick-strong text-white"
                      aria-hidden
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="size-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.9}
                      >
                        <path d={s.icon} strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                    </span>
                    <h3 className="font-display text-2xl font-bold">
                      <span className="sr-only">{i + 1}. </span>
                      {t(`how.${s.key}.title`)}
                    </h3>
                  </div>
                  <p className="mt-3 text-[17px] leading-relaxed text-ink/85">{t(`how.${s.key}.body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          className="mx-auto grid max-w-6xl gap-8 px-4 py-14 desk:grid-cols-[1fr_1.1fr]"
          aria-labelledby="venue"
        >
          <div>
            <h2 id="venue" className="font-display text-4xl font-bold">
              {t('venue.title')}
            </h2>
            <p className="mt-3 text-[17px] leading-relaxed">{t('venue.body', { stadium: brand.name })}</p>
            <h3 className="mt-6 font-display text-2xl font-bold">{t('venue.gettingThere')}</h3>
            <p className="mt-1 leading-relaxed text-ink/85">{t('venue.gettingThereBody')}</p>
            <h3 className="mt-5 font-display text-2xl font-bold">{t('venue.gates')}</h3>
            <p className="mt-1 leading-relaxed text-ink/85">{t('venue.gatesBody')}</p>
            <h3 className="mt-5 font-display text-2xl font-bold">{t('venue.facilities')}</h3>
            <ul className="mt-2 grid gap-1.5">
              {FACILITIES.map((k) => (
                <li key={k} className="flex items-start gap-2 leading-relaxed">
                  <span className="mt-2.5 size-1.5 flex-none rounded-full bg-pick" aria-hidden />
                  {t(`venue.facilityList.${k}`)}
                </li>
              ))}
            </ul>
            <Link href="/venue" className={buttonClass('dark', 'mt-6')}>
              {t('venue.more')}
            </Link>
          </div>
          <figure className="rounded-card border border-line bg-paper p-3 shadow-soft">
            <StadiumPlan gates title={t('venue.planLabel')} className="h-auto w-full" />
            <figcaption className="sr-only">{t('venue.planLabel')}</figcaption>
          </figure>
        </section>

        <section className="bg-paper-2" aria-labelledby="faq">
          <div className="mx-auto max-w-3xl px-4 py-14">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="faq" className="font-display text-4xl font-bold">
                {t('faq.title')}
              </h2>
              <Link href="/faq" className={buttonClass('link')}>
                {t('faq.more')}
              </Link>
            </div>
            <div className="mt-6">
              <FaqList keys={['choose', 'view', 'payment', 'lost']} />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
