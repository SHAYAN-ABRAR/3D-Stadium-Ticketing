'use client';
/**
 * The seat picker page: the 3D stage (or the 2D plan without WebGL) with the UI over it. Owns the page-level
 * behaviour: backend and live availability, the sales simulator, intro or deep link, URL sync, Esc for
 * back, and UI-aware framing (engine.setInsets).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import { brand } from '@/config/brand';
import { getStore, simulatorOn } from '@/data';
import { StoreBackend, type PickerBackend } from '@/lib/picker/backend';
import { runAroundSeat } from '@/lib/picker/runs';
import { pricingOf, type PublicEvent } from '@/lib/events/types';
import { boardDate, formatDate, formatNumber } from '@/lib/format';
import { blockById, getLayout, indexOf, type StandKey } from '@/lib/stadium';
import type { EngineStats } from '@/engine';
import type { TextureText } from '@/engine/world/textures';
import { DESKTOP } from '../useMedia';
import { Announcer, BestCards, TouchCard } from './Extras';
import { PickerHeader } from './Header';
import { ListPanel } from './ListPanel';
import { NoWebglPicker } from './NoWebgl';
import { HintCard, HoverTooltip, StandLabels } from './Overlays';
import { StadiumStage } from './StadiumStage';
import { allowedNow, back, middleOf, restoreHold, setSelection, usePicker } from './store';
import { stopTour } from './tour';
import { TicketCard } from './TicketCard';
import { useAvailability } from './useAvailability';

/** Where the visitor asked to start: ?stand=N, ?block=232, ?block=232&row=10&seat=8, ?box=9, ?box=9&chair=2. */
export interface DeepLink {
  stand?: string;
  block?: number;
  row?: number;
  seat?: number;
  box?: number;
  chair?: number;
}

export interface PickerAppProps {
  event: PublicEvent;
  deepLink: DeepLink;
  /** Defaults to the browser's data store. */
  backend?: PickerBackend;
}

const INTRO_KEY = 'stadium.intro.v1.';

export function PickerApp({ event, deepLink, backend: given }: PickerAppProps) {
  const t = useTranslations('picker');
  const status = usePicker((s) => s.status);
  const backend: PickerBackend = useMemo(
    () => given ?? new StoreBackend(getStore(), event.id),
    [given, event.id],
  );

  // Simulated buyers while the event is open (one tab at a time; off in E2E runs).
  useEffect(() => (simulatorOn() ? getStore().startSimulator(event.id) : undefined), [event.id]);

  useEffect(() => {
    usePicker.setState({
      event,
      pricing: pricingOf(event),
      closed: new Set(event.closedBlocks),
      backend,
      selection: [],
      hold: null,
      best: null,
      touchCard: null,
    });
    void restoreHold();
    return () => stopTour();
  }, [event, backend]);

  useAvailability(backend);
  useStartView(status, event.slug, deepLink);
  useUrlSync();
  useEscapeBack();
  useInsets();

  const text: TextureText = useMemo(
    () => ({
      stadium: brand.name,
      short: brand.shortName,
      event: event.competition,
      date: boardDate(event.startsAt),
      time: formatDate(event.startsAt, 'time', 'en'),
      kickoff: event.startsAt,
      home: event.homeTeam,
      away: event.awayTeam,
      homeColor: event.homeColor,
      awayColor: event.awayColor,
    }),
    [event.competition, event.startsAt, event.homeTeam, event.awayTeam, event.homeColor, event.awayColor],
  );

  const [stageKey, setStageKey] = useState(0);
  const noWebgl = status === 'nowebgl';

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#c9d6e2]">
      <a
        href="#seat-list"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('seat-list')?.focus();
        }}
        className="sr-only z-[60] rounded-full bg-ink px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('skipToList')}
      </a>
      {noWebgl ? <NoWebglPicker /> : <StadiumStage key={stageKey} text={text} label={t('canvasLabel')} />}
      <PickerHeader />
      <StandLabels />
      <HoverTooltip />
      <ListPanel />
      <HintCard />
      <TicketCard />
      <BestCards />
      <TouchCard />
      <FlashMessage />
      <Announcer />
      {noWebgl ? null : <Loader />}
      {status === 'contextlost' ? <ContextLost onReload={() => setStageKey((k) => k + 1)} /> : null}
      <DebugOverlay />
    </div>
  );
}

/** First visit to an event: the drone shot. Deep links open directly at their view. */
function useStartView(status: string, slug: string, link: DeepLink) {
  useEffect(() => {
    const s = usePicker.getState();
    const L = getLayout();
    const seat = link.block && link.row && link.seat ? indexOf(link.block, link.row, link.seat) : -1;
    const block = link.block ? blockById(link.block) : undefined;
    const box = link.box ? L.boxes.find((x) => x.id === link.box) : undefined;
    const stand = link.stand
      ? L.stands.findIndex((x) => x.key === (link.stand!.toUpperCase() as StandKey))
      : -1;
    // The run of `quantity` seats around the linked seat needs the availability, which may arrive after
    // the 3D view is ready (a slow first request): until then, wait for it instead of picking one seat.
    let unsubscribe: (() => void) | null = null;
    const pickRun = () => {
      if (seat < 0) return;
      const apply = () => {
        const st = usePicker.getState().statuses;
        if (!st) return false;
        const run = runAroundSeat(st, seat, usePicker.getState().quantity, allowedNow);
        setSelection(run ?? [seat]);
        return true;
      };
      if (apply()) return;
      unsubscribe = usePicker.subscribe((s) => {
        if (!s.statuses) return;
        // Unsubscribe first: setSelection notifies subscribers synchronously.
        unsubscribe?.();
        unsubscribe = null;
        apply();
      });
    };
    const stopWaiting = () => unsubscribe?.();

    if (status === 'nowebgl') {
      if (s.nav.level !== 'loading') return;
      const nav = { ...s.nav, level: 'overview' as const };
      if (box) Object.assign(nav, { level: 'box', box: box.index, stand: box.stand });
      else if (seat >= 0) {
        const b = L.blocks[L.blockOf[seat]];
        Object.assign(nav, { level: 'seat', seat, block: b.index, stand: b.stand });
        pickRun();
      } else if (block) Object.assign(nav, { level: 'block', block: block.index, stand: block.stand });
      else if (stand >= 0) Object.assign(nav, { level: 'stand', stand });
      usePicker.setState({ nav });
      return stopWaiting;
    }
    if (status !== 'ready') return;
    const e = s.engine;
    if (!e || e.navState.level !== 'intro') return;
    if (box) {
      void e.goBox(box.index, { instant: true }).then(() => {
        if (link.chair && link.chair >= 1 && link.chair <= 8) void e.goVip(link.chair - 1, { instant: true });
      });
    } else if (seat >= 0) {
      pickRun();
      void e.goSeat(
        middleOf(usePicker.getState().selection.length ? usePicker.getState().selection : [seat]),
        {
          instant: true,
        },
      );
    } else if (block) void e.goBlock(block.index, { instant: true });
    else if (stand >= 0) void e.goStand(stand, { instant: true });
    else {
      let seen = false;
      try {
        seen = localStorage.getItem(INTRO_KEY + slug) === '1';
        localStorage.setItem(INTRO_KEY + slug, '1');
      } catch {
        // Without storage the intro simply plays every time.
      }
      if (seen) void e.goOverview({ instant: true });
      else void e.playIntro();
    }
    return stopWaiting;
    // Runs once when the engine (or the 2D plan) becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
}

/** Keeps the URL in step with the view (replaceState), so links can be shared. */
function useUrlSync() {
  useEffect(() => {
    const L = getLayout();
    return usePicker.subscribe((s, prev) => {
      if (s.nav === prev.nav || s.nav.level === 'loading' || s.nav.level === 'intro') return;
      const url = new URL(location.href);
      for (const k of ['stand', 'block', 'row', 'seat', 'box', 'chair']) url.searchParams.delete(k);
      const n = s.nav;
      if (n.level === 'stand') url.searchParams.set('stand', L.stands[n.stand]?.key ?? '');
      else if (n.level === 'block') url.searchParams.set('block', String(L.blocks[n.block]?.id ?? ''));
      else if (n.level === 'seat' && n.seat >= 0) {
        url.searchParams.set('block', String(L.blocks[L.blockOf[n.seat]].id));
        url.searchParams.set('row', String(L.rowOf[n.seat]));
        url.searchParams.set('seat', String(L.numberOf[n.seat]));
      } else if ((n.level === 'box' || n.level === 'vip') && n.box >= 0) {
        url.searchParams.set('box', String(L.boxes[n.box].id));
        if (n.level === 'vip' && n.vip >= 0) url.searchParams.set('chair', String(n.vip + 1));
      }
      if (url.href !== location.href) history.replaceState(history.state, '', url);
    });
  }, []);
}

/** Esc goes back one level (popovers and sheets close themselves first). */
function useEscapeBack() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [role="dialog"]')) return;
      stopTour();
      back();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}

/** UI-aware framing: the 3D picture's centre moves away from the list panel and the ticket. */
function useInsets() {
  const { engine, panelBox, ticketBox } = usePicker(
    useShallow((s) => ({ engine: s.engine, panelBox: s.panelBox, ticketBox: s.ticketBox })),
  );
  useEffect(() => {
    if (!engine) return;
    const desk = matchMedia(DESKTOP).matches;
    let right = 0,
      bottom = 0;
    if (ticketBox) bottom = ticketBox.h + 16;
    else if (panelBox) {
      if (desk) right = panelBox.w + 16;
      else bottom = Math.min(panelBox.h, 140) + 8;
    }
    engine.setInsets({ right, bottom });
  }, [engine, panelBox, ticketBox]);
}

function Loader() {
  const t = useTranslations('picker');
  const { status, progress, step } = usePicker(
    useShallow((s) => ({ status: s.status, progress: s.progress, step: s.progressStep })),
  );
  const done = status === 'ready' || status === 'contextlost';
  const count = formatNumber(getLayout().totalSeatCount);
  const stepKey = [
    'engine',
    'seats',
    'park',
    'ground',
    'shadows',
    'pitch',
    'done',
    'scene',
    'lights',
    'ready',
  ].includes(step)
    ? step
    : 'engine';
  return (
    <div
      className={`absolute inset-0 z-50 grid place-items-center bg-linear-to-b from-[#d7e1ea] to-[#e9dcc6] transition-opacity duration-500 ${done ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      aria-hidden={done}
    >
      <div className="card w-[min(360px,calc(100%-32px))] px-6 py-5" role="status" aria-live="polite">
        <h2 className="font-display text-[26px] leading-tight font-bold">{t('loaderTitle')}</h2>
        <div className="mt-3.5 mb-2 h-2 overflow-hidden rounded bg-[#e6e1d6]">
          <i
            className="block h-full bg-pick transition-[width] duration-200"
            style={{ width: `${Math.max(3, Math.round(progress * 100))}%` }}
          />
        </div>
        <p className="text-sm text-muted">{t(`steps.${stepKey}`, { count })}</p>
      </div>
    </div>
  );
}

function FlashMessage() {
  const t = useTranslations('picker.flash');
  const flash = usePicker((s) => s.flash);
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(
      () => usePicker.setState((s) => (s.flash?.id === flash.id ? { flash: null } : {})),
      1600,
    );
    return () => clearTimeout(timer);
  }, [flash]);
  if (!flash) return null;
  return (
    <div
      className="card pointer-events-none fixed z-40 px-3 py-2 text-[15px] font-semibold"
      style={{ left: Math.max(8, flash.x + 14), top: Math.max(8, flash.y + 14) }}
      role="status"
    >
      {t(flash.key, flash.values)}
    </div>
  );
}

function ContextLost({ onReload }: { onReload: () => void }) {
  const t = useTranslations('picker.contextLost');
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-ink/40" role="alert">
      <div className="card px-6 py-5 text-center">
        <p className="font-display text-2xl font-bold">{t('title')}</p>
        <button
          type="button"
          onClick={onReload}
          className="mt-3 min-h-11 rounded-full bg-pick-strong px-5 font-bold text-white shadow-pick hover:brightness-95"
        >
          {t('action')}
        </button>
      </div>
    </div>
  );
}

/** ?debug=1: fps, frame time, draw calls, triangles, quality tier and pick time. */
function DebugOverlay() {
  const t = useTranslations('picker.debug');
  const engine = usePicker((s) => s.engine);
  const [stats, setStats] = useState<EngineStats | null>(null);
  useEffect(() => (engine ? engine.on('stats', setStats) : undefined), [engine]);
  if (!stats) return null;
  const rows: [string, string][] = [
    [t('fps'), String(stats.fps)],
    [t('frame'), `${stats.frameMs} ms`],
    [t('draws'), String(stats.drawCalls)],
    [t('triangles'), stats.triangles.toLocaleString('en-US')],
    [t('tier'), stats.tier],
    [t('pick'), `${stats.pickMs} ms`],
    [t('mode'), stats.mode],
  ];
  return (
    <dl className="pointer-events-none fixed bottom-2 left-1/2 z-50 grid -translate-x-1/2 grid-cols-[auto_auto] gap-x-3 rounded-lg bg-ink/80 px-3 py-2 font-mono text-xs text-white">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="opacity-70">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
