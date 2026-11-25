'use client';
/**
 * The picker's header: brand and event line, breadcrumbs with a Back button, the hold countdown, the tour,
 * view settings and the language switch. Wraps to two rows below 901 px.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Popover, RadioGroup, Switch } from 'radix-ui';
import { useShallow } from 'zustand/react/shallow';
import { brand } from '@/config/brand';
import { formatCountdown } from '@/lib/format';
import { getLayout } from '@/lib/stadium';
import type { LightingPreset, QualitySetting } from '@/engine';
import { ChevronLeft } from '../ui/atoms';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { useClock } from '../useClock';
import { useFormat } from '../useFormat';
import { back, goBlock, goBox, goOverview, goSeatView, goStand, tickHold, usePicker } from './store';
import { startTour, stopTour } from './tour';

export function eventLineOf(
  event: { competition: string; startsAt: number },
  fmt: ReturnType<typeof useFormat>,
): string {
  return [event.competition, fmt.date(event.startsAt, 'medium'), fmt.date(event.startsAt, 'time')].join(
    ' · ',
  );
}

export function PickerHeader() {
  const t = useTranslations('picker');
  const fmt = useFormat();
  const event = usePicker((s) => s.event);
  return (
    <header className="pointer-events-none fixed top-2 right-2 left-2 z-30 flex flex-wrap items-start gap-2 desk:top-4 desk:right-4 desk:left-4 desk:flex-nowrap desk:gap-2.5">
      <div className="card pointer-events-auto px-3 py-2 desk:px-4 desk:pt-[11px] desk:pb-3">
        <Link
          href="/"
          className="block font-display text-[20px] leading-[1.02] font-bold whitespace-nowrap tab:text-[22px] desk:text-[28px]"
        >
          {brand.name}
        </Link>
        {event ? (
          <p className="mt-0.5 text-[13px] whitespace-nowrap text-muted desk:text-sm">
            {eventLineOf(event, fmt)}
          </p>
        ) : null}
      </div>
      <Breadcrumbs />
      <div className="pointer-events-auto ml-auto flex items-center gap-2">
        <HoldCountdown />
        <div className="hidden tab:block">
          <TourButton />
        </div>
        <ViewSettings />
        <div className="hidden tab:block">
          <LanguageSwitcher />
        </div>
      </div>
      <span className="sr-only">{t('headerNote')}</span>
    </header>
  );
}

function Breadcrumbs() {
  const t = useTranslations('picker.crumbs');
  const fmt = useFormat();
  const { nav, flying } = usePicker(useShallow((s) => ({ nav: s.nav, flying: s.flying })));
  const L = getLayout();
  const lv = nav.level;
  const deep = (...l: string[]) => l.includes(lv);
  const parts: { label: string; go: (() => void) | null }[] = [{ label: t('stadium'), go: goOverview }];
  if (deep('stand', 'block', 'seat', 'box', 'vip') && nav.stand >= 0)
    parts.push({ label: fmt.stand(L.stands[nav.stand].key), go: () => goStand(nav.stand) });
  if (deep('block', 'seat', 'box', 'vip') && nav.block >= 0)
    parts.push({ label: t('block', { block: L.blocks[nav.block].id }), go: () => goBlock(nav.block) });
  if (deep('seat', 'box', 'vip') && nav.seat >= 0)
    parts.push({
      label: t('seat', { row: L.rowOf[nav.seat], seat: L.numberOf[nav.seat] }),
      go: () => goSeatView(nav.seat),
    });
  if (deep('box', 'vip') && nav.box >= 0)
    parts.push({ label: t('box', { box: L.boxes[nav.box].id }), go: () => goBox(nav.box) });
  if (deep('vip') && nav.vip >= 0) parts.push({ label: t('chair', { chair: nav.vip + 1 }), go: null });
  if (parts.length < 2 || lv === 'loading' || lv === 'intro') return null;
  return (
    <nav
      aria-label={t('label')}
      className="card pointer-events-auto order-3 flex min-w-0 basis-full items-center gap-0.5 rounded-[14px] p-[3px] desk:order-none desk:mt-1.5 desk:shrink desk:basis-auto desk:rounded-full desk:p-[5px]"
    >
      <button
        type="button"
        onClick={back}
        disabled={flying}
        aria-label={t('back')}
        className="grid size-9 place-items-center rounded-full bg-ink text-white hover:bg-ink-2 desk:size-[38px]"
      >
        <ChevronLeft />
      </button>
      <ol
        ref={(el) => {
          // Keep the current (last) crumb in view when the trail is longer than the space.
          if (el) el.scrollLeft = el.scrollWidth;
        }}
        className="flex min-w-0 items-center gap-0.5 overflow-x-auto pl-2 [mask-image:linear-gradient(to_right,transparent,#000_12px)] [scrollbar-width:none]"
      >
        {parts.map((p, i) => {
          const last = i === parts.length - 1;
          return (
            <li key={`${i}-${p.label}`} className="flex flex-none items-center gap-0.5">
              {i ? (
                <span aria-hidden className="text-sm text-[#b3ada1]">
                  ›
                </span>
              ) : null}
              <button
                type="button"
                aria-current={last ? 'page' : undefined}
                disabled={flying}
                onClick={() => !last && p.go?.()}
                className={`min-h-9 rounded-full px-2.5 text-sm font-semibold whitespace-nowrap desk:min-h-[38px] desk:px-3 desk:text-[15px] ${
                  last ? 'cursor-default text-pick-ink' : 'hover:bg-paper-2'
                }`}
              >
                {p.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** "Held · 9:41": counts down to the hold's expiry; warns at 2 minutes and releases on expiry. */
export function HoldCountdown({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('picker.hold');
  const hold = usePicker((s) => s.hold);
  // Read on every render, so the first render after a hold shows the right time.
  const now = useClock();
  useEffect(() => {
    if (!hold) return;
    const timer = setInterval(() => tickHold(), 1000);
    return () => clearInterval(timer);
  }, [hold]);
  if (!hold || now === null) return null;
  const left = Math.max(0, hold.expiresAt - now);
  const text = formatCountdown(left);
  const urgent = left <= 120_000;
  return (
    <span
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold whitespace-nowrap shadow-card ${
        urgent ? 'bg-danger text-white' : 'bg-pick-strong text-white'
      }`}
      aria-label={t('countdownLabel', { time: text })}
    >
      {compact ? (
        text
      ) : (
        <>
          <span className="tab:hidden">{text}</span>
          <span className="hidden tab:inline">{t('countdown', { time: text })}</span>
        </>
      )}
    </span>
  );
}

function TourButton() {
  const t = useTranslations('picker');
  const { tour, status, level } = usePicker(
    useShallow((s) => ({ tour: s.tour, status: s.status, level: s.nav.level })),
  );
  // The tour starts from the overview; deeper in, the button would only crowd the header.
  if (status !== 'ready' || (!tour && level !== 'overview' && level !== 'stand')) return null;
  return (
    <button
      type="button"
      aria-pressed={tour}
      onClick={() => (tour ? stopTour() : void startTour())}
      className={`min-h-11 rounded-full px-4 text-[15px] font-bold whitespace-nowrap text-white shadow-card desk:px-[18px] ${
        tour ? 'bg-pick-strong' : 'bg-ink hover:bg-ink-2'
      }`}
    >
      {tour ? t('tour.stop') : t('tour.start')}
    </button>
  );
}

function Choice({ value, label }: { value: string; label: React.ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 hover:bg-paper-2">
      <RadioGroup.Item
        value={value}
        className="grid size-5 place-items-center rounded-full border-2 border-ink/40 data-[state=checked]:border-pick"
      >
        <RadioGroup.Indicator className="size-2.5 rounded-full bg-pick" />
      </RadioGroup.Item>
      <span className="text-[15px] font-semibold">{label}</span>
    </label>
  );
}

function ViewSettings() {
  const t = useTranslations('picker.view');
  const { engine, tier, status, level } = usePicker(
    useShallow((s) => ({ engine: s.engine, tier: s.tier, status: s.status, level: s.nav.level })),
  );
  const [setting, setSetting] = useState<QualitySetting>('auto');
  const [lighting, setLighting] = useState<LightingPreset>('day');
  const [crowd, setCrowd] = useState(true);
  if (status !== 'ready' || !engine) return null;
  // The crowd (and so the wave) shows in seat and skybox views.
  const crowdHere = level === 'seat' || level === 'box' || level === 'vip';
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t('open')}
          className="grid size-11 place-items-center rounded-full bg-paper text-ink shadow-card hover:bg-paper-2"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path d="M4 7h10M18 7h2M4 17h4M12 17h8" strokeLinecap="round" />
            <circle cx="16" cy="7" r="2.2" />
            <circle cx="10" cy="17" r="2.2" />
          </svg>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="card z-50 max-h-[calc(100dvh-80px)] w-72 overflow-hidden p-0"
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          {/* Pitfall 13: the card doesn't scroll itself; an inner element does. */}
          <div className="max-h-[inherit] overflow-y-auto p-4">
            <h2 className="font-display text-xl font-bold">{t('title')}</h2>
            <fieldset className="mt-3">
              <legend className="text-sm font-semibold text-muted">{t('quality')}</legend>
              <RadioGroup.Root
                value={setting}
                onValueChange={(v) => {
                  setSetting(v as QualitySetting);
                  engine.setQuality(v as QualitySetting);
                }}
                className="mt-1.5 grid grid-cols-2 gap-1"
              >
                {(['auto', 'low', 'medium', 'high'] as const).map((q) => (
                  <Choice
                    key={q}
                    value={q}
                    label={
                      <>
                        {t(`qualities.${q}`)}
                        {q === 'auto' && tier ? (
                          <span className="font-normal text-muted"> · {t(`qualities.${tier}`)}</span>
                        ) : null}
                      </>
                    }
                  />
                ))}
              </RadioGroup.Root>
            </fieldset>
            <fieldset className="mt-3">
              <legend className="text-sm font-semibold text-muted">{t('lighting')}</legend>
              <RadioGroup.Root
                value={lighting}
                onValueChange={(v) => {
                  setLighting(v as LightingPreset);
                  engine.setLighting(v as LightingPreset);
                }}
                className="mt-1.5 grid gap-1"
              >
                {(['day', 'dusk', 'night'] as const).map((p) => (
                  <Choice key={p} value={p} label={t(`lightings.${p}`)} />
                ))}
              </RadioGroup.Root>
            </fieldset>
            <div className="mt-3 border-t border-line pt-3">
              <div className="flex min-h-11 items-center justify-between gap-3 px-2">
                <label htmlFor="crowd-switch" className="text-[15px] font-semibold">
                  {t('crowd')}
                </label>
                <Switch.Root
                  id="crowd-switch"
                  checked={crowd}
                  onCheckedChange={(on) => {
                    setCrowd(on);
                    engine.setCrowd(on);
                  }}
                  className="relative h-7 w-12 flex-none rounded-full bg-ink/25 transition-colors data-[state=checked]:bg-pick-strong"
                >
                  <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5.5" />
                </Switch.Root>
              </div>
              <p className="px-2 text-[13px] text-muted">{t('crowdNote')}</p>
              <button
                type="button"
                disabled={!crowd || !crowdHere}
                onClick={() => engine.startWave()}
                className="mt-2 min-h-11 w-full rounded-full bg-ink px-4 text-[15px] font-bold text-white hover:bg-ink-2 disabled:cursor-not-allowed disabled:bg-ink/30"
              >
                {t('wave')}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 tab:hidden">
              <TourButton />
              <LanguageSwitcher />
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
