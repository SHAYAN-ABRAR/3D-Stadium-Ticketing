'use client';
/**
 * UI positioned over the 3D view from engine events: the hover tooltip (with a live view thumbnail for
 * seats), the stand labels at the overview, and the hint card with the legend.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import { computeStats } from '@/lib/picker/stats';
import { getLayout } from '@/lib/stadium';
import { WheelchairIcon } from '../ui/atoms';
import { useFormat } from '../useFormat';
import { useMedia } from '../useMedia';
import { usePickDetails } from './pick-details';
import { goStand, usePicker } from './store';
import { snapshotView, viewKey } from './snapshot-cache';

/** Top of the area the header leaves free (labels and tooltips are clamped below it: pitfall 16). */
function safeTop(): number {
  const h = document.querySelector('header');
  return h ? h.getBoundingClientRect().bottom + 8 : 8;
}

export function HoverTooltip() {
  const t = useTranslations('picker.tip');
  const hover = usePicker((s) => s.hover);
  const visible = !!hover && hover.source !== 'list' && Number.isFinite(hover.x);
  const d = usePickDetails(visible ? hover : null);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !hover || !visible) return;
    const r = el.getBoundingClientRect();
    let x = hover.x + 18,
      y = hover.y + 18;
    if (x + r.width > innerWidth - 8) x = hover.x - r.width - 14;
    if (y + r.height > innerHeight - 8) y = hover.y - r.height - 14;
    el.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(safeTop(), y)}px)`;
  });

  if (!visible || !d) return null;
  return (
    <div
      ref={ref}
      className="card pointer-events-none fixed top-0 left-0 z-40 flex max-w-[340px] items-center gap-2.5 py-2 pr-3 pl-2"
      role="tooltip"
    >
      {d.thumbSeat >= 0 ? <Thumb seat={d.thumbSeat} /> : <span className="w-1" />}
      <div>
        <span className="block text-[13px] font-semibold text-muted">{d.kicker}</span>
        <span className="block font-display text-[21px] leading-[1.05] font-bold">{d.title}</span>
        <span
          className={`block font-bold whitespace-nowrap ${d.unavailable ? 'text-muted' : 'text-pick-ink'}`}
        >
          {d.price}
        </span>
        {d.note ? <span className="block text-[13px] text-muted">{d.note}</span> : null}
        {d.wheelchair ? (
          <span className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-accessible">
            <WheelchairIcon /> {t('wheelchair')}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Live view thumbnail: rendered after a 90 ms dwell, then cached. */
export function Thumb({ seat, className = 'h-[75px] w-[120px]' }: { seat: number; className?: string }) {
  const t = useTranslations('picker.tip');
  const engine = usePicker((s) => s.engine);
  const key = viewKey({ kind: 'seat', seat }, 240, 150);
  const [shot, setShot] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (!engine) return;
    let alive = true;
    const timer = setTimeout(() => {
      void snapshotView(engine, { kind: 'seat', seat }, 240, 150).then((e) => {
        if (alive && e) setShot({ key, url: e.url });
      });
    }, 90);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [engine, seat, key]);
  const url = shot?.key === key ? shot.url : null;
  return url ? (
    // A blob URL from the engine's snapshot: next/image can't optimise it.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={t('thumbAlt')} className={`flex-none rounded-lg object-cover ${className}`} />
  ) : (
    <span className={`flex-none animate-pulse rounded-lg bg-[#2a3340] ${className}`} aria-hidden />
  );
}

/** "North stand · from Tk 800" labels floating over the stands at the overview. Clickable. */
export function StandLabels() {
  const t = useTranslations('picker.tip');
  const fmt = useFormat();
  const { engine, nav, flying, hover, statuses, quantity, filters, pricing } = usePicker(
    useShallow((s) => ({
      engine: s.engine,
      nav: s.nav,
      flying: s.flying,
      hover: s.hover,
      statuses: s.statuses,
      quantity: s.quantity,
      filters: s.filters,
      pricing: s.pricing,
    })),
  );
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const stats = useMemo(
    () => computeStats(statuses, quantity, filters, pricing),
    [statuses, quantity, filters, pricing],
  );
  const show = nav.level === 'overview' && !flying;
  useEffect(() => {
    if (!engine || !show) return;
    const place = () => {
      const anchors = engine.standLabelAnchors();
      const top = safeTop();
      anchors.forEach((a, i) => {
        const el = refs.current[i];
        if (!el) return;
        const vis = !!a && a.y - el.offsetHeight - 10 > top - 4;
        el.style.opacity = vis ? '1' : '0';
        el.style.pointerEvents = vis ? 'auto' : 'none';
        el.tabIndex = vis ? 0 : -1;
        if (a) el.style.transform = `translate(${a.x}px, ${a.y - 10}px) translate(-50%, -100%)`;
      });
    };
    place();
    return engine.on('camera', place);
  }, [engine, show]);
  if (!show) return null;
  const L = getLayout();
  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      {L.stands.map((st, i) => {
        const free = stats.standFree[i];
        const hot = hover?.kind === 'stand' && hover.id === i;
        return (
          <button
            key={st.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            onClick={() => goStand(i)}
            onPointerEnter={(e) => e.pointerType === 'mouse' && engine?.highlight('stand', i)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && engine?.highlight(null)}
            className={`absolute top-0 left-0 rounded-[10px] px-[11px] pt-1.5 pb-[7px] text-left leading-[1.15] whitespace-nowrap opacity-0 shadow-[0_6px_18px_rgba(0,0,0,.25)] transition-opacity duration-200 after:absolute after:-bottom-1.5 after:left-1/2 after:-ml-1.5 after:border-[6px] after:border-b-0 after:border-transparent ${
              hot
                ? 'bg-pick-strong text-white after:border-t-pick-strong'
                : 'bg-paper text-ink after:border-t-paper'
            }`}
          >
            <b className="block font-display text-base leading-[1.05] font-bold desk:text-lg">
              {fmt.stand(st.key)}
            </b>
            <span className={`text-[13px] font-semibold ${hot ? 'text-white' : 'text-muted'}`}>
              {free ? t('from', { price: fmt.money(stats.standFrom[i]) }) : t('soldOut')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Bottom-left hint: what to do at this level, the colour legend, and the sample-content note. */
export function HintCard() {
  const t = useTranslations('picker.hint');
  const fmt = useFormat();
  const touch = useMedia('(hover: none)');
  const { nav, flying, status } = usePicker(
    useShallow((s) => ({ nav: s.nav, flying: s.flying, status: s.status })),
  );
  const L = getLayout();
  const ticketShown =
    !flying && (nav.level === 'seat' || nav.level === 'vip' || (nav.level === 'box' && !nav.choosingVip));
  // The 2D plan and seat grid carry their own instructions.
  if (ticketShown || nav.level === 'loading' || status === 'nowebgl') return null;
  let title = '',
    sub = '';
  switch (nav.level) {
    case 'intro':
    case 'overview':
      title = t('overview.title');
      sub = t(touch ? 'overview.subTouch' : 'overview.sub');
      break;
    case 'stand':
      title = t('stand.title', { stand: L.stands[nav.stand] ? fmt.stand(L.stands[nav.stand].key) : '' });
      sub = t('stand.sub');
      break;
    case 'block':
      title = t('block.title', { block: L.blocks[nav.block]?.id ?? '' });
      sub = t(touch ? 'block.subTouch' : 'block.sub');
      break;
    case 'box':
    case 'vip':
      title = t('box.title');
      sub = t(touch ? 'box.subTouch' : 'box.sub');
      break;
    default:
      return null;
  }
  return (
    <div className="card fixed bottom-[86px] left-2 z-10 hidden max-w-[min(420px,calc(100%-16px))] px-3 py-2.5 tab:block desk:bottom-4 desk:left-4 desk:max-w-[380px] desk:px-4 desk:py-3">
      <b className="block font-display text-lg leading-[1.1] font-bold desk:text-[22px]">{title}</b>
      <span className="mt-0.5 block text-[13px] text-muted desk:text-sm">{sub}</span>
      <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 border-t border-line pt-2 text-[13px] font-semibold desk:mt-2.5 desk:pt-2.5">
        <li className="flex items-center gap-1.5">
          <i className="size-3.5 rounded bg-[linear-gradient(135deg,var(--color-seat-red)_0_60%,var(--color-seat-blue)_60%)]" />
          {t('legend.available')}
        </li>
        <li className="flex items-center gap-1.5">
          <i className="size-3.5 rounded bg-pick" />
          {t('legend.pick')}
        </li>
        <li className="flex items-center gap-1.5">
          <i className="size-3.5 rounded bg-sold" />
          {t('legend.sold')}
        </li>
        <li className="flex items-center gap-1.5">
          <WheelchairIcon className="size-4 text-accessible" />
          {t('legend.wheelchair')}
        </li>
      </ul>
      <p className="mt-1.5 hidden text-[13px] text-muted tab:block">{t('sample')}</p>
    </div>
  );
}
