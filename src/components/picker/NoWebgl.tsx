'use client';
/**
 * The picker without WebGL (PROMPT.md 6.8): the SVG plan (stands and blocks coloured by availability) and,
 * inside a block, a seat grid (rows by seats). The list panel, ticket and checkout work exactly as with 3D.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import { runAroundSeat } from '@/lib/picker/runs';
import { computeStats } from '@/lib/picker/stats';
import { getLayout, SeatFlag, seatPriceMinor } from '@/lib/stadium';
import { StadiumPlan, toneFor } from '../plan/StadiumPlan';
import { WheelchairIcon } from '../ui/atoms';
import { useFormat } from '../useFormat';
import { allowedNow, chooseRun, goBlock, usePicker } from './store';

export function NoWebglPicker() {
  const t = useTranslations('picker');
  const level = usePicker((s) => s.nav.level);
  return (
    <div className="absolute inset-0 overflow-auto bg-paper-2 px-2 pt-[150px] pb-[220px] desk:px-4 desk:pt-[120px] desk:pr-[352px] desk:pb-6">
      <div className="mx-auto max-w-3xl">
        <div className="card mb-3 px-4 py-3 text-sm">
          <h2 className="font-display text-lg font-bold">{t('noWebgl.title')}</h2>
          <p>{t('noWebgl.body')}</p>
        </div>
        {level === 'block' ? <SeatGrid /> : <PlanCard />}
      </div>
    </div>
  );
}

function PlanCard() {
  const t = useTranslations('picker');
  const fmt = useFormat();
  const { statuses, quantity, filters, pricing, closed, nav } = usePicker(
    useShallow((s) => ({
      statuses: s.statuses,
      quantity: s.quantity,
      filters: s.filters,
      pricing: s.pricing,
      closed: s.closed,
      nav: s.nav,
    })),
  );
  const L = getLayout();
  const stats = useMemo(
    () => computeStats(statuses, quantity, filters, pricing),
    [statuses, quantity, filters, pricing],
  );
  const tones = L.blocks.map((b) =>
    toneFor(stats.blockFree[b.index], b.seatCount, stats.blockFits[b.index] === 1, closed.has(b.index)),
  );
  return (
    <div className="card p-3">
      <StadiumPlan
        tones={tones}
        numbers
        className="h-auto w-full"
        title={t('list.planTitle')}
        focusStand={nav.level === 'stand' ? nav.stand : undefined}
        onBlock={(b) => {
          const free = stats.blockFree[b.index];
          if (!free || closed.has(b.index)) return;
          goBlock(b.index);
        }}
        blockLabel={(b) => {
          const free = stats.blockFree[b.index];
          const status = closed.has(b.index)
            ? t('list.closed')
            : !free
              ? t('list.soldOut')
              : t('list.seatsLeft', { count: free, n: fmt.num(free) });
          return `${t('list.block', { block: b.id })}, ${fmt.stand(b.standKey)}, ${fmt.tier(b.tierKey)}. ${status}. ${fmt.money(
            pricing?.blockPriceMinor[b.index] ?? 0,
          )}`;
        }}
      />
      <Legend />
    </div>
  );
}

function Legend() {
  const t = useTranslations('picker.planLegend');
  const items: [string, string][] = [
    ['#1f46b8', t('plenty')],
    ['#6c8ad6', t('limited')],
    ['#e8a33d', t('few')],
    ['#c9c6bf', t('soldOut')],
  ];
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
      {items.map(([c, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <i className="size-3.5 rounded" style={{ background: c }} />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** Rows by seats for the current block. Hovering previews the run of N seats; clicking chooses it. */
function SeatGrid() {
  const t = useTranslations('picker.list');
  const fmt = useFormat();
  const { nav, statuses, quantity, selection, pricing } = usePicker(
    useShallow((s) => ({
      nav: s.nav,
      statuses: s.statuses,
      quantity: s.quantity,
      selection: s.selection,
      pricing: s.pricing,
    })),
  );
  const [preview, setPreview] = useState<number[] | null>(null);
  const L = getLayout();
  const b = L.blocks[nav.block];
  if (!b || !statuses) return null;
  const runFor = (i: number) => runAroundSeat(statuses, i, quantity, allowedNow);
  return (
    <div className="card overflow-x-auto p-3">
      <h2 className="mb-2 font-display text-2xl font-bold">
        {t('block', { block: b.id })} · {fmt.tier(b.tierKey)}
      </h2>
      <p className="mb-3 text-sm text-muted">{t('gridHint', { count: quantity })}</p>
      <div className="grid gap-1" role="grid" aria-label={t('block', { block: b.id })}>
        {Array.from({ length: b.rows }, (_, r) => (
          <div key={r} role="row" className="flex items-center gap-1">
            <span role="rowheader" className="w-12 flex-none text-right text-xs font-semibold text-muted">
              {t('row', { row: r + 1 })}
            </span>
            {Array.from({ length: b.rowLen[r] }, (_, k) => {
              const i = b.rowFirst[r] + k;
              const taken = statuses[i] !== 0 && !selection.includes(i);
              const mine = selection.includes(i);
              const lit = preview?.includes(i);
              const wc = (L.flags[i] & SeatFlag.Wheelchair) !== 0;
              const ok = !taken && allowedNow(i);
              return (
                <button
                  key={i}
                  type="button"
                  role="gridcell"
                  disabled={!ok && !mine}
                  aria-label={`${t('row', { row: r + 1 })}, ${t('seat', { seat: k + 1 })}, ${
                    mine
                      ? t('yours')
                      : taken
                        ? t('taken')
                        : `${t('free')}, ${fmt.money(pricing ? seatPriceMinor(i, pricing) : 0)}`
                  }${wc ? `, ${t('wheelchair')}` : ''}`}
                  onPointerEnter={() => ok && setPreview(runFor(i))}
                  onPointerLeave={() => setPreview(null)}
                  onFocus={() => ok && setPreview(runFor(i))}
                  onBlur={() => setPreview(null)}
                  onClick={() => {
                    const run = runFor(i);
                    if (run) chooseRun(run);
                  }}
                  className={`relative grid size-6 flex-none place-items-center rounded-[5px] text-[10px] font-bold ${
                    mine || lit
                      ? 'bg-pick-strong text-white'
                      : taken
                        ? 'bg-[#d9d5cc] text-transparent'
                        : !ok
                          ? 'bg-[#e9e5dc] text-[#b0aca3]'
                          : wc
                            ? 'bg-accessible text-white'
                            : 'bg-seat-red text-white hover:brightness-110'
                  }`}
                >
                  {wc ? <WheelchairIcon className="size-3.5" /> : k + 1}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
