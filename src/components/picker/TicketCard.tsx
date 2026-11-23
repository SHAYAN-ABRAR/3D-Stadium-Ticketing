'use client';
/**
 * The ticket card in the picker: seat ticket, skybox ticket and VIP ticket, with the match header (both
 * teams' flags). Bottom-centre from 641 px; a stacked bottom sheet on phones (collapsible to look around).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import { brand } from '@/config/brand';
import { chairsInSelection, nearestBox, summarize, upgradeDiffMinor } from '@/lib/picker/selection';
import { getLayout, SKY } from '@/lib/stadium';
import type { SnapshotView } from '@/engine';
import { MatchBanner } from '../ticket/MatchBanner';
import { Barcode, Ticket, type TicketFact } from '../ticket/Ticket';
import { buttonClass } from '../ui/atoms';
import { useClock } from '../useClock';
import { PHONE, useMedia } from '../useMedia';
import { useFormat } from '../useFormat';
import { CheckoutButton } from './CheckoutButton';
import { formatCountdown } from '@/lib/format';
import { eventLineOf } from './Header';
import { MeasuredBox } from './MeasuredBox';
import { snapshotView, viewKey } from './snapshot-cache';
import {
  back,
  bookWholeBox,
  chooseChairs,
  chooseDifferentSeats,
  goBlock,
  goBox,
  holdSelection,
  releaseHold,
  upgradeToBox,
  usePicker,
} from './store';

export function TicketCard() {
  const t = useTranslations('picker.ticket');
  const fmt = useFormat();
  const phone = useMedia(PHONE);
  const [collapsed, setCollapsed] = useState(false);
  const s = usePicker(
    useShallow((st) => ({
      nav: st.nav,
      flying: st.flying,
      selection: st.selection,
      pricing: st.pricing,
      hold: st.hold,
      holdBusy: st.holdBusy,
      statuses: st.statuses,
      event: st.event,
      engine: st.engine,
      notice: st.ticketNotice,
    })),
  );
  const { nav } = s;
  const shown =
    !s.flying && (nav.level === 'seat' || nav.level === 'vip' || (nav.level === 'box' && !nav.choosingVip));
  if (!shown || !s.event || !s.pricing) return null;
  const L = getLayout();
  const sum = summarize(s.selection, s.pricing);
  const chairs = nav.box >= 0 ? chairsInSelection(nav.box, s.selection) : [];
  const kind: 'seat' | 'box' | 'vip' =
    nav.level === 'seat' ? 'seat' : nav.level === 'vip' || chairs.length ? 'vip' : 'box';
  const held =
    !!s.hold &&
    s.hold.seats.length === s.selection.length &&
    s.selection.every((i) => s.hold!.seats.includes(i));
  const eventLine = eventLineOf(s.event, fmt);
  const checkout = <CheckoutButton />;
  const release = (
    <button type="button" onClick={() => void releaseHold(false)} className={buttonClass('link')}>
      {t('release')}
    </button>
  );
  const notice = s.notice ? (
    <p className="font-semibold text-danger">{t(`notice.${s.notice.key}`, s.notice.values)}</p>
  ) : null;

  let props: {
    kicker: string;
    title: string;
    facts: TicketFact[];
    actions: ReactNode;
    note?: ReactNode;
    price: number;
    seed: number;
  };
  /** The seat's view, rendered in the background for "Check out" (the skybox overview needs none). */
  let warm: SnapshotView | null = null;

  if (kind === 'seat') {
    const b = L.blocks[L.blockOf[nav.seat]];
    const bowl = sum.kind === 'bowl' && sum.count > 0;
    const boxIndex = nearestBox(nav.seat);
    const box = L.boxes[boxIndex];
    const up = upgradeDiffMinor(sum.totalMinor, Math.max(1, sum.count), s.pricing);
    warm = { kind: 'seat', seat: nav.seat };
    props = {
      kicker: `${fmt.stand(b.standKey)} · ${fmt.tier(b.tierKey)}`,
      title: t('block', { block: b.id }),
      facts: [
        { label: t('row'), value: String(sum.row ?? L.rowOf[nav.seat]) },
        {
          label: sum.count > 1 ? t('seats') : t('seat'),
          value: bowl ? sum.seats : String(L.numberOf[nav.seat]),
        },
        { label: t('gate'), value: b.gate },
      ],
      actions: held ? (
        <>
          {checkout}
          {release}
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={s.holdBusy || !bowl}
            onClick={() => void holdSelection()}
            className={buttonClass('primary')}
          >
            {s.holdBusy ? t('holding') : t('hold', { count: Math.max(1, sum.count) })}
          </button>
          <button type="button" onClick={upgradeToBox} className={buttonClass('outline')}>
            {t('upgrade', { box: box.id, price: fmt.money(up) })}
          </button>
          <button type="button" onClick={chooseDifferentSeats} className={buttonClass('link')}>
            {t('different')}
          </button>
        </>
      ),
      note: (
        <>
          {notice}
          {sum.restricted ? <p>{t('restrictedNote')}</p> : null}
          {sum.wheelchair ? <p>{t('wheelchairNote')}</p> : null}
          {!held && !notice ? <p>{t('upgradeNote', { box: box.id, level: brand.vipLevel })}</p> : null}
        </>
      ),
      price: held ? s.hold!.totalMinor : sum.totalMinor,
      seed: nav.seat * 7 + 1,
    };
  } else if (kind === 'box') {
    const box = L.boxes[nav.box];
    let free = 0;
    for (let k = 0; k < SKY.chairsPerBox; k++) if (!s.statuses || s.statuses[box.firstSeat + k] === 0) free++;
    props = {
      kicker: t('vipLevel', { level: brand.vipLevel }),
      title: t('box', { box: box.id }),
      facts: [
        { label: t('chairs'), value: String(SKY.chairsPerBox) },
        { label: t('free'), value: String(free) },
        { label: t('entry'), value: t('vip') },
      ],
      actions: (
        <>
          <button
            type="button"
            disabled={!free}
            onClick={() => chooseChairs(true)}
            className={buttonClass('primary')}
          >
            {t('chooseChairs')}
          </button>
          {free === SKY.chairsPerBox ? (
            <button type="button" onClick={bookWholeBox} className={buttonClass('outline')}>
              {t('wholeBox', { price: fmt.money(s.pricing.vipBoxMinor) })}
            </button>
          ) : null}
          {nav.block >= 0 ? (
            <button
              type="button"
              onClick={() => (nav.seat >= 0 ? back() : goBlock(nav.block))}
              className={buttonClass('link')}
            >
              {t('backToBlock', { block: L.blocks[nav.block].id })}
            </button>
          ) : null}
        </>
      ),
      note: t('boxNote'),
      price: s.pricing.vipChairMinor,
      seed: 9000 + box.id,
    };
  } else {
    const box = L.boxes[nav.box];
    const chair = nav.vip >= 0 ? nav.vip : (chairs[0] ?? 0);
    const whole = sum.wholeBox;
    warm = { kind: 'vip', box: nav.box, chair };
    props = {
      kicker: t('vipBox', { level: brand.vipLevel, box: box.id }),
      title: whole
        ? t('wholeBoxTitle')
        : chairs.length > 1
          ? t('seatsTitle', { seats: sum.seats })
          : t('seatTitle', { seat: chair + 1 }),
      facts: [
        {
          label: t('row'),
          value: whole ? '1–2' : [...new Set(chairs.map((c) => (c < 4 ? 1 : 2)))].join(', ') || '1',
        },
        { label: chairs.length > 1 ? t('seats') : t('seat'), value: sum.seats || String(chair + 1) },
        { label: t('entry'), value: t('vip') },
      ],
      actions: held ? (
        <>
          {checkout}
          {release}
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={s.holdBusy || !chairs.length}
            onClick={() => void holdSelection()}
            className={buttonClass('primary')}
          >
            {s.holdBusy ? t('holding') : t('hold', { count: Math.max(1, chairs.length) })}
          </button>
          <button type="button" onClick={() => goBox(nav.box)} className={buttonClass('link')}>
            {t('backToBox')}
          </button>
        </>
      ),
      note: notice,
      price: held ? s.hold!.totalMinor : sum.totalMinor,
      seed: 9100 + box.id * 10 + chair,
    };
  }

  // The stamp goes across the match header's top-left corner, which the header then keeps clear.
  const stamped = held && !!s.hold;
  const stamp = stamped ? (
    <HeldStamp expiresAt={s.hold!.expiresAt} className={phone ? 'top-3 left-3.5' : 'top-4.5 left-4.5'} />
  ) : null;
  const prewarm = warm ? <PrewarmView view={warm} /> : null;
  const ticket = (
    <Ticket
      label={t('label')}
      layout={phone ? 'stacked' : 'full'}
      view={
        <MatchBanner
          homeTeam={s.event.homeTeam}
          awayTeam={s.event.awayTeam}
          homeColor={s.event.homeColor}
          awayColor={s.event.awayColor}
          startsAt={s.event.startsAt}
          doorsAt={s.event.doorsAt}
          stampRoom={stamped}
        />
      }
      eventLine={eventLine}
      kicker={props.kicker}
      title={props.title}
      facts={props.facts}
      actions={props.actions}
      note={props.note}
      currency={fmt.sign}
      price={fmt.amount(props.price)}
      code={<Barcode seed={props.seed} className={phone ? 'h-[84px] w-11' : undefined} />}
    />
  );

  if (phone) {
    return (
      <MeasuredBox
        sizeKey="ticketBox"
        id="ticket-card"
        className="fixed inset-x-2 bottom-2 z-20 max-h-[calc(100%-120px)]"
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="mx-auto mb-1 flex min-h-9 items-center gap-2 rounded-full bg-ink/80 px-4 text-sm font-semibold text-white"
        >
          {collapsed ? t('showTicket') : t('hideTicket')}
        </button>
        {prewarm}
        {collapsed ? null : (
          <div className="relative max-h-[calc(100dvh-170px)] overflow-y-auto rounded-[14px]">
            {ticket}
            {stamp}
          </div>
        )}
      </MeasuredBox>
    );
  }
  return (
    <MeasuredBox
      sizeKey="ticketBox"
      id="ticket-card"
      className="fixed bottom-5 left-1/2 z-20 w-[min(880px,calc(100%-32px))] -translate-x-1/2 tab:bottom-2 desk:bottom-5"
    >
      {prewarm}
      <div className="relative">
        {ticket}
        {stamp}
      </div>
    </MeasuredBox>
  );
}

/**
 * Renders the seat's "Your view" picture in the background while its ticket is open (the ticket shows the
 * match header instead), so "Check out" finds it ready and the order keeps it for the ticket page.
 */
function PrewarmView({ view }: { view: SnapshotView }) {
  const engine = usePicker((s) => s.engine);
  const key = viewKey(view, 640, 400);
  useEffect(() => {
    if (engine) void snapshotView(engine, view, 640, 400);
    // view is described completely by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, key]);
  return null;
}

/** "Held for you · 9:41" stamp across the ticket. */
function HeldStamp({ expiresAt, className }: { expiresAt: number; className: string }) {
  const t = useTranslations('picker.ticket');
  const now = useClock();
  if (now === null) return null;
  return (
    <span
      className={`pointer-events-none absolute ${className} -rotate-6 rounded-lg border-[3px] border-pick bg-[rgba(251,250,246,.9)] px-2.5 py-0.5 font-display text-xl leading-tight font-bold text-pick-ink`}
      role="status"
    >
      {t('heldStamp', { time: formatCountdown(Math.max(0, expiresAt - now)) })}
    </span>
  );
}
