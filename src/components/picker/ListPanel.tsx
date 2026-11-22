'use client';
/**
 * The list panel: the complete keyboard and screen-reader path through the picker (stands, blocks, rows,
 * seats, lounge chairs). A card on the right at 901 px and wider; a strip of chips along the bottom below.
 * The inner list scrolls, never the card itself (pitfall 13).
 */
import { useMemo, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import { brand } from '@/config/brand';
import { computeStats } from '@/lib/picker/stats';
import { getLayout, SeatFlag, seatPriceMinor, SKY, type BlockInfo } from '@/lib/stadium';
import { Badge, Meter, WheelchairIcon } from '../ui/atoms';
import { useFormat } from '../useFormat';
import { FiltersButton } from './Filters';
import { MeasuredBox } from './MeasuredBox';
import {
  chooseBestInBlock,
  chooseSeatFromList,
  goBlock,
  goStand,
  openBestAvailable,
  setQuantity,
  toggleChair,
  usePicker,
} from './store';
import { SelectionTray } from './Tray';

export function ListPanel() {
  const t = useTranslations('picker.list');
  const { nav, ticketShown, choosing } = usePicker(
    useShallow((s) => ({
      nav: s.nav,
      ticketShown:
        !s.flying &&
        (s.nav.level === 'seat' || s.nav.level === 'vip' || (s.nav.level === 'box' && !s.nav.choosingVip)),
      choosing: s.nav.choosingVip,
    })),
  );
  const lv = nav.level;
  if (lv === 'loading' || ticketShown) return null;
  const content =
    lv === 'stand' ? (
      <BlockList />
    ) : lv === 'block' ? (
      <RowList />
    ) : (lv === 'box' || lv === 'vip') && choosing ? (
      <ChairList />
    ) : (
      <StandList />
    );
  return (
    <MeasuredBox
      as="aside"
      sizeKey="panelBox"
      id="seat-list"
      tabIndex={-1}
      aria-label={t('label')}
      className="card fixed right-2 bottom-2 left-2 z-20 flex flex-col py-2 outline-none desk:top-[112px] desk:right-4 desk:bottom-auto desk:left-auto desk:max-h-[calc(100%-136px)] desk:w-[320px] desk:py-3"
    >
      <div className="hidden px-4 desk:block">
        <PanelTools />
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden overscroll-contain px-2 desk:mt-2 desk:block desk:overflow-x-hidden desk:overflow-y-auto desk:px-3">
        <div className="contents desk:hidden">
          <QuantityStepper compact />
        </div>
        {content}
      </div>
      <SelectionTray />
    </MeasuredBox>
  );
}

/** Quantity, filters and best available (desktop header of the panel). */
function PanelTools() {
  const t = useTranslations('picker.list');
  const level = usePicker((s) => s.nav.level);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <QuantityStepper />
        <FiltersButton />
      </div>
      {level === 'overview' || level === 'stand' || level === 'intro' ? (
        <button
          type="button"
          onClick={openBestAvailable}
          className="min-h-11 w-full rounded-[10px] bg-pick-strong px-3 font-bold text-white hover:brightness-95"
        >
          {t('bestAvailable')}
        </button>
      ) : null}
    </div>
  );
}

export function QuantityStepper({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('picker.quantity');
  const fmt = useFormat();
  const quantity = usePicker((s) => s.quantity);
  return (
    <div
      role="group"
      aria-label={t('label')}
      className={`flex flex-none items-center gap-1 ${compact ? 'rounded-[10px] bg-paper-2 py-[3px] pr-1 pl-3' : ''}`}
    >
      <span className={`text-sm font-semibold ${compact ? '' : 'mr-1 text-muted'}`}>{t('tickets')}</span>
      <button
        type="button"
        aria-label={t('fewer')}
        disabled={quantity <= 1}
        onClick={() => setQuantity(quantity - 1)}
        className="grid size-11 place-items-center rounded-full text-xl font-bold hover:bg-line disabled:opacity-40"
      >
        −
      </button>
      <output aria-live="polite" className="min-w-6 text-center font-display text-2xl font-bold">
        {fmt.num(quantity)}
      </output>
      <button
        type="button"
        aria-label={t('more')}
        disabled={quantity >= brand.maxTicketsPerOrder}
        onClick={() => setQuantity(quantity + 1)}
        className="grid size-11 place-items-center rounded-full text-xl font-bold hover:bg-line disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

function useStats() {
  const { statuses, quantity, filters, pricing } = usePicker(
    useShallow((s) => ({
      statuses: s.statuses,
      quantity: s.quantity,
      filters: s.filters,
      pricing: s.pricing,
    })),
  );
  return useMemo(
    () => computeStats(statuses, quantity, filters, pricing),
    [statuses, quantity, filters, pricing],
  );
}

/** A list row (desktop) / chip (narrow). */
function Item({
  badge,
  muted,
  name,
  sub,
  price,
  chipPrice,
  disabled,
  onClick,
  onHover,
  label,
  expanded,
  extra,
}: {
  badge: ReactNode;
  muted?: boolean;
  name: ReactNode;
  sub?: ReactNode;
  price?: ReactNode;
  chipPrice?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  onHover?: (on: boolean) => void;
  label?: string;
  expanded?: boolean;
  extra?: ReactNode;
}) {
  return (
    <li className="flex-none">
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-expanded={expanded}
        onClick={onClick}
        onPointerEnter={(e) => e.pointerType === 'mouse' && onHover?.(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onHover?.(false)}
        onFocus={() => onHover?.(true)}
        onBlur={() => onHover?.(false)}
        className="grid min-h-[46px] w-auto grid-cols-[auto_auto] items-center gap-2 rounded-[10px] bg-paper-2 py-[5px] pr-3 pl-[5px] text-left whitespace-nowrap hover:bg-line disabled:cursor-not-allowed disabled:text-[#9a9ea7] desk:min-h-11 desk:w-full desk:grid-cols-[auto_minmax(0,1fr)_auto] desk:gap-2.5 desk:bg-transparent desk:px-2 desk:py-2 desk:whitespace-normal desk:hover:bg-paper-2"
      >
        <Badge muted={muted || disabled}>{badge}</Badge>
        <span className="text-sm leading-tight font-semibold desk:text-[15px]">
          {name}
          {sub ? <span className="hidden text-[13px] font-medium text-muted desk:block">{sub}</span> : null}
          {extra}
          {chipPrice ? (
            <span className="block text-[13px] font-bold text-pick-ink desk:hidden">{chipPrice}</span>
          ) : null}
        </span>
        {price ? (
          <span className="hidden text-right text-[15px] font-bold whitespace-nowrap desk:block">
            {price}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mx-1 mb-2 hidden font-display text-[21px] leading-tight font-bold desk:block">
      {children}
    </h2>
  );
}
function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mx-1 mt-3 mb-1 hidden text-[13px] font-semibold text-muted desk:block">{children}</h3>
  );
}
const listClass = 'flex flex-none gap-1.5 desk:grid desk:gap-0.5';

function StandList() {
  const t = useTranslations('picker.list');
  const fmt = useFormat();
  const stats = useStats();
  const engine = usePicker((s) => s.engine);
  const L = getLayout();
  return (
    <>
      <Heading>{t('stands')}</Heading>
      <ul className={listClass}>
        {L.stands.map((st) => {
          const free = stats.standFree[st.index];
          const from = stats.standFrom[st.index];
          const name = fmt.stand(st.key);
          const sub = free ? t('seatsLeft', { count: free, n: fmt.num(free) }) : t('soldOut');
          return (
            <Item
              key={st.key}
              badge={st.key}
              name={name}
              sub={
                <>
                  {sub}
                  <Meter value={st.seatCount ? free / st.seatCount : 0} />
                </>
              }
              price={
                free ? (
                  <>
                    <small className="block text-[13px] font-medium text-muted">{t('from')}</small>
                    {fmt.money(from)}
                  </>
                ) : null
              }
              chipPrice={free ? t('fromPrice', { price: fmt.money(from) }) : t('soldOut')}
              disabled={!free}
              label={`${name}. ${sub}${free ? `. ${t('fromPrice', { price: fmt.money(from) })}` : ''}`}
              onClick={() => goStand(st.index)}
              onHover={(on) => engine?.highlight(on ? 'stand' : null, st.index)}
            />
          );
        })}
      </ul>
    </>
  );
}

function BlockList() {
  const t = useTranslations('picker.list');
  const fmt = useFormat();
  const stats = useStats();
  const { nav, engine, closed, pricing, quantity } = usePicker(
    useShallow((s) => ({
      nav: s.nav,
      engine: s.engine,
      closed: s.closed,
      pricing: s.pricing,
      quantity: s.quantity,
    })),
  );
  const L = getLayout();
  const st = L.stands[nav.stand];
  if (!st) return null;
  const blocks = st.blockIndices.map((i) => L.blocks[i]);
  return (
    <>
      <Heading>{fmt.stand(st.key)}</Heading>
      {(['L', 'M', 'U'] as const).map((tier) => (
        <div key={tier} className="contents desk:block">
          <SubHeading>{fmt.tier(tier)}</SubHeading>
          <ul className={listClass}>
            {blocks
              .filter((b) => b.tierKey === tier)
              .map((b) => {
                const free = stats.blockFree[b.index];
                const isClosed = closed.has(b.index);
                const fits = stats.blockFits[b.index] === 1;
                const price = pricing?.blockPriceMinor[b.index] ?? 0;
                const sub = isClosed
                  ? t('closed')
                  : !free
                    ? t('soldOut')
                    : !fits
                      ? t('notTogether', { count: quantity })
                      : t('seatsLeft', { count: free, n: fmt.num(free) });
                return (
                  <Item
                    key={b.id}
                    badge={b.id}
                    muted={!fits}
                    name={t('gate', { gate: b.gate })}
                    sub={sub}
                    price={free && !isClosed ? fmt.money(price) : null}
                    chipPrice={free && !isClosed ? fmt.money(price) : sub}
                    disabled={!free || isClosed}
                    label={`${t('block', { block: b.id })}, ${fmt.tier(b.tierKey)}, ${t('gate', { gate: b.gate })}. ${sub}${
                      free && !isClosed ? `. ${fmt.money(price)}` : ''
                    }`}
                    onClick={() => goBlock(b.index)}
                    onHover={(on) => engine?.highlight(on ? 'block' : null, b.index)}
                  />
                );
              })}
          </ul>
        </div>
      ))}
    </>
  );
}

function RowList() {
  const t = useTranslations('picker.list');
  const fmt = useFormat();
  const { nav, statuses, rowOpen, pricing, quantity } = usePicker(
    useShallow((s) => ({
      nav: s.nav,
      statuses: s.statuses,
      rowOpen: s.rowOpen,
      pricing: s.pricing,
      quantity: s.quantity,
    })),
  );
  const L = getLayout();
  const b: BlockInfo | undefined = L.blocks[nav.block];
  if (!b) return null;
  const price = pricing?.blockPriceMinor[b.index] ?? 0;
  return (
    <>
      <Heading>{t('block', { block: b.id })}</Heading>
      <button
        type="button"
        onClick={() => chooseBestInBlock(null)}
        className="min-h-11 flex-none rounded-[10px] bg-pick-strong px-3 font-bold whitespace-nowrap text-white hover:brightness-95 desk:mb-1.5 desk:w-full"
      >
        {t('bestInBlock', { count: quantity })}
      </button>
      <SubHeading>{t('tierPrice', { tier: fmt.tier(b.tierKey), price: fmt.money(price) })}</SubHeading>
      <ul className={listClass}>
        {Array.from({ length: b.rows }, (_, r) => {
          const first = b.rowFirst[r],
            n = b.rowLen[r];
          let left = 0;
          for (let k = 0; k < n; k++) if (!statuses || statuses[first + k] === 0) left++;
          const open = rowOpen === r + 1;
          const sub = left ? t('rowFree', { free: fmt.num(left), total: fmt.num(n) }) : t('rowFull');
          return (
            <Item
              key={r}
              badge={r + 1}
              name={t('row', { row: r + 1 })}
              sub={sub}
              chipPrice={left ? t('freeShort', { free: fmt.num(left) }) : t('rowFull')}
              disabled={!left}
              expanded={open}
              label={`${t('row', { row: r + 1 })}. ${sub}`}
              onClick={() => usePicker.setState({ rowOpen: open ? null : r + 1 })}
              extra={open ? <span className="sr-only">{t('seatsBelow')}</span> : null}
            />
          );
        })}
      </ul>
      {rowOpen ? <SeatButtons block={b} row={rowOpen} /> : null}
    </>
  );
}

/** The seats of one row as buttons (keyboard path to a specific seat). */
function SeatButtons({ block, row }: { block: BlockInfo; row: number }) {
  const t = useTranslations('picker.list');
  const fmt = useFormat();
  const { statuses, pricing, selection } = usePicker(
    useShallow((s) => ({ statuses: s.statuses, pricing: s.pricing, selection: s.selection })),
  );
  const L = getLayout();
  const first = block.rowFirst[row - 1],
    n = block.rowLen[row - 1];
  return (
    <div
      className="fixed right-2 bottom-[76px] left-2 z-20 rounded-[14px] bg-paper p-3 shadow-card desk:static desk:mt-2 desk:rounded-[10px] desk:bg-paper-2 desk:p-2 desk:shadow-none"
      role="group"
      aria-label={t('seatsInRow', { row })}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{t('seatsInRow', { row })}</span>
        <button
          type="button"
          onClick={() => chooseBestInBlock(row)}
          className="min-h-9 rounded-full px-3 text-sm font-bold text-pick-ink underline underline-offset-2"
        >
          {t('bestInRow')}
        </button>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1">
        {Array.from({ length: n }, (_, k) => {
          const i = first + k;
          const taken = !!statuses && statuses[i] !== 0;
          const mine = selection.includes(i);
          const flags = L.flags[i];
          const wc = (flags & SeatFlag.Wheelchair) !== 0;
          const restricted = (flags & SeatFlag.Restricted) !== 0;
          const price = pricing ? seatPriceMinor(i, pricing) : 0;
          const state = mine ? t('yours') : taken ? t('taken') : t('free');
          const notes = [wc ? t('wheelchair') : '', restricted ? t('restricted') : '']
            .filter(Boolean)
            .join(', ');
          return (
            <li key={i}>
              <button
                type="button"
                disabled={taken && !mine}
                onClick={() => chooseSeatFromList(i)}
                aria-label={`${t('seat', { seat: k + 1 })}, ${state}${taken ? '' : `, ${fmt.money(price)}`}${notes ? `, ${notes}` : ''}`}
                className={`relative grid h-11 w-full place-items-center rounded-lg text-sm font-bold ${
                  mine
                    ? 'bg-pick-strong text-white'
                    : taken
                      ? 'cursor-not-allowed bg-[#dcd8cf] text-[#8a8f99] line-through'
                      : 'bg-paper text-ink ring-1 ring-line hover:ring-pick desk:bg-paper'
                }`}
              >
                {k + 1}
                {wc ? <WheelchairIcon className="absolute top-0.5 right-0.5 size-3 text-accessible" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChairList() {
  const t = useTranslations('picker.list');
  const fmt = useFormat();
  const { nav, statuses, selection, pricing } = usePicker(
    useShallow((s) => ({ nav: s.nav, statuses: s.statuses, selection: s.selection, pricing: s.pricing })),
  );
  const L = getLayout();
  const box = L.boxes[nav.box];
  if (!box) return null;
  return (
    <>
      <Heading>{t('box', { box: box.id })}</Heading>
      <ul className={listClass}>
        {Array.from({ length: SKY.chairsPerBox }, (_, k) => {
          const i = box.firstSeat + k;
          const mine = selection.includes(i);
          const taken = !!statuses && statuses[i] !== 0 && !mine;
          const rowN = k < 4 ? 1 : 2;
          const state = mine ? t('yours') : taken ? t('taken') : t('free');
          return (
            <Item
              key={k}
              badge={k + 1}
              muted={taken}
              name={t('chair', { row: rowN, seat: k + 1 })}
              sub={state}
              price={taken ? null : fmt.money(pricing?.vipChairMinor ?? brand.vipChairPriceMinor)}
              chipPrice={taken ? t('taken') : state}
              disabled={taken}
              label={`${t('chair', { row: rowN, seat: k + 1 })}, ${state}`}
              onClick={() => toggleChair(k)}
            />
          );
        })}
      </ul>
    </>
  );
}
