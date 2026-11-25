'use client';
/**
 * The home hero (PROMPT.md 8): a full-bleed 3D stadium by day with the crowd and a slow orbit. A
 * poster rendered from the same scene shows while the 3D view loads and when WebGL is missing (a portrait
 * one on narrow screens). Over it: the headline; beside it on desktops, below it on phones, the next match
 * with a countdown and "Choose your seats".
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { getImageProps } from 'next/image';
import { useTranslations } from 'next-intl';
import { brand } from '@/config/brand';
import type { TextureText } from '@/engine/world/textures';
import { boardDate, formatDate } from '@/lib/format';
import { nextOnSale, useUpcomingEvents } from '../events/useEvents';
import { NextEventCard } from './NextEvent';

const HeroEngine = dynamic(() => import('./HeroEngine'), { ssr: false });

function webglLikely(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

const POSTER = { alt: '', sizes: '100vw', loading: 'eager', fetchPriority: 'high' } as const;
const { srcSet: wideSet } = getImageProps({
  ...POSTER,
  src: '/hero-poster.jpg',
  width: 1920,
  height: 860,
}).props;
const { srcSet: tallSet, ...posterImg } = getImageProps({
  ...POSTER,
  src: '/hero-poster-portrait.jpg',
  width: 780,
  height: 1082,
}).props;

export function HomeHero() {
  const t = useTranslations('home');
  const q = useUpcomingEvents();
  const next = q.status === 'ready' ? nextOnSale(q.data) : null;
  const [mount, setMount] = useState(false);
  const [shown, setShown] = useState(false);

  // The 3D view starts once the page is idle (the poster is the page's main image), and not at all without
  // WebGL or with ?webgl=0.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('webgl') === '0' || !webglLikely()) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setMount(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setMount(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  const e = next?.event;
  const text: TextureText = {
    stadium: brand.name,
    short: brand.shortName,
    event: e?.competition ?? 'Welcome',
    date: e ? boardDate(e.startsAt) : '',
    time: e ? formatDate(e.startsAt, 'time', 'en') : '',
    kickoff: e?.startsAt ?? 0,
    home: e?.homeTeam ?? '',
    away: e?.awayTeam ?? '',
    homeColor: e?.homeColor ?? brand.colors.seatBlue,
    awayColor: e?.awayColor ?? brand.colors.seatRed,
  };

  return (
    <section className="relative isolate overflow-hidden bg-ink text-white" aria-labelledby="hero-title">
      <div
        data-hero-visual
        className="absolute inset-x-0 top-0 -z-10 h-[64svh] min-h-90 desk:inset-y-0 desk:h-auto"
      >
        <picture>
          <source media="(min-width: 901px)" srcSet={wideSet} />
          <source media="(max-width: 900px)" srcSet={tallSet} />
          {/* eslint-disable-next-line jsx-a11y/alt-text -- decorative: alt="" comes from getImageProps */}
          <img {...posterImg} className="absolute inset-0 size-full object-cover" />
        </picture>
        {mount && q.status !== 'loading' ? (
          <div
            className={`absolute inset-0 transition-opacity duration-700 ${shown ? 'opacity-100' : 'opacity-0'}`}
          >
            <HeroEngine text={text} eventId={e?.id ?? null} onReady={() => setShown(true)} />
          </div>
        ) : null}
        <div
          data-hero-shade
          className="pointer-events-none absolute inset-0 bg-linear-to-t from-ink via-ink/25 to-ink/0 desk:from-ink/85 desk:via-ink/30 desk:to-ink/5"
        />
      </div>
      <div
        data-hero-overlay
        className="mx-auto grid max-w-6xl gap-6 px-4 pb-10 desk:min-h-[min(88svh,860px)] desk:grid-cols-[1fr_auto] desk:items-end desk:gap-10 desk:pb-14"
      >
        <div className="flex min-h-[64svh] flex-col justify-end pt-24 desk:min-h-0 desk:pt-0">
          <p className="text-sm font-bold tracking-[0.12em] text-white/85 uppercase">{brand.name}</p>
          <h1
            id="hero-title"
            className="mt-2 max-w-xl font-display text-[38px] leading-[0.95] font-bold tab:text-6xl desk:text-7xl"
          >
            {t('heroTitle')}
          </h1>
          <p className="mt-4 max-w-md text-lg text-white/90">{t('heroBody', { stadium: brand.name })}</p>
        </div>
        <NextEventCard s={next} loading={q.status === 'loading'} />
      </div>
    </section>
  );
}
