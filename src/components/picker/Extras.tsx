'use client';
/**
 * The touch confirmation card (a tap selects; this sheet offers "Fly in" or "Select"), the Best available
 * cards, and the announcer (live region for holds, conflicts and expiry, also shown as a toast).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Drawer } from 'vaul';
import { useShallow } from 'zustand/react/shallow';
import { summarize } from '@/lib/picker/selection';
import { getLayout } from '@/lib/stadium';
import { Button } from '../ui/atoms';
import { useFormat } from '../useFormat';
import { describeSelection } from './describe';
import { Thumb } from './Overlays';
import { usePickDetails } from './pick-details';
import { activate, chooseRun, closeBestAvailable, middleOf, usePicker } from './store';

export function TouchCard() {
  const t = useTranslations('picker.touch');
  const { card, engine } = usePicker(useShallow((s) => ({ card: s.touchCard, engine: s.engine })));
  const d = usePickDetails(card);
  const close = () => {
    usePicker.setState({ touchCard: null });
    engine?.highlight(null);
  };
  const action =
    !card || !d
      ? ''
      : card.kind === 'stand' || card.kind === 'block'
        ? t('flyIn')
        : card.kind === 'seat'
          ? t('selectSeats', { count: card.run?.length ?? 1 })
          : t('select');
  return (
    <Drawer.Root open={!!card && !!d} onOpenChange={(o) => !o && close()} modal={false}>
      <Drawer.Portal>
        <Drawer.Content
          className="card fixed inset-x-2 bottom-2 z-50 px-4 pt-2 pb-4 outline-none"
          aria-describedby={undefined}
        >
          <Drawer.Handle className="mx-auto mb-3" />
          {card && d ? (
            <div className="flex gap-3">
              {d.thumbSeat >= 0 ? <Thumb seat={d.thumbSeat} className="h-[90px] w-[144px]" /> : null}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-muted">{d.kicker}</p>
                <Drawer.Title className="font-display text-2xl leading-tight font-bold">
                  {d.title}
                </Drawer.Title>
                <p className={`font-bold ${d.unavailable ? 'text-muted' : 'text-pick-ink'}`}>{d.price}</p>
                {d.note ? <p className="text-[13px] text-muted">{d.note}</p> : null}
              </div>
            </div>
          ) : null}
          <div className="mt-3 flex items-center gap-3">
            <Button
              disabled={!card || !d || d.unavailable}
              onClick={() => card && engine && activate(engine, card)}
            >
              {action}
            </Button>
            <Button variant="link" onClick={close}>
              {t('cancel')}
            </Button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** Best available: the top 3 runs across the event, with view thumbnails. Choosing one flies there. */
export function BestCards() {
  const t = useTranslations('picker.best');
  const tl = useTranslations('picker');
  const fmt = useFormat();
  const { best, pricing, quantity } = usePicker(
    useShallow((s) => ({ best: s.best, pricing: s.pricing, quantity: s.quantity })),
  );
  useEffect(() => {
    if (!best) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeBestAvailable();
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [best]);
  if (!best) return null;
  const L = getLayout();
  return (
    <section
      aria-label={t('title', { count: quantity })}
      className="card fixed inset-x-2 bottom-2 z-40 max-h-[70vh] overflow-hidden p-4 desk:top-[112px] desk:right-[352px] desk:bottom-auto desk:left-auto desk:w-[380px]"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-[22px] leading-tight font-bold">
          {t('title', { count: quantity })}
        </h2>
        <button
          type="button"
          onClick={closeBestAvailable}
          aria-label={t('close')}
          className="grid size-11 place-items-center rounded-full text-xl hover:bg-paper-2"
        >
          ×
        </button>
      </div>
      {best.length ? (
        <ul className="mt-2 grid max-h-[calc(70vh-90px)] gap-2 overflow-y-auto">
          {best.map((run) => {
            const sum = summarize(run.seats, pricing);
            const b = L.blocks[run.block];
            return (
              <li key={run.seats[0]}>
                <button
                  type="button"
                  onClick={() => chooseRun(run.seats)}
                  className="flex w-full items-center gap-3 rounded-[12px] bg-paper-2 p-2 text-left hover:bg-line"
                >
                  <Thumb seat={middleOf(run.seats)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-muted">
                      {fmt.stand(b.standKey)} · {fmt.tier(b.tierKey)}
                    </span>
                    <span className="block font-display text-lg leading-tight font-bold">
                      {describeSelection(sum, fmt, tl)}
                    </span>
                    <span className="block font-bold text-pick-ink">{fmt.money(sum.totalMinor)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-muted">{t('none', { count: quantity })}</p>
      )}
    </section>
  );
}

/** Polite live region for holds, conflicts and expiry; the same message appears as a toast. */
export function Announcer() {
  const t = useTranslations('picker.announce');
  const a = usePicker((s) => s.announcement);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!a) return;
    const show = setTimeout(() => setShown(a.id), 0);
    const hide = setTimeout(() => setShown((cur) => (cur === a.id ? null : cur)), 5000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [a]);
  const text = a ? t(a.key, a.values) : '';
  return (
    <>
      <div className="sr-only" aria-live="polite" role="status">
        {text}
      </div>
      {a && shown === a.id ? (
        <div
          aria-hidden
          className="card fixed top-[124px] left-1/2 z-50 max-w-[min(460px,calc(100%-24px))] -translate-x-1/2 px-4 py-2.5 text-center text-[15px] font-semibold desk:top-24"
        >
          {text}
        </div>
      ) : null}
    </>
  );
}

/** Short summary of the selection, for the page title and screen readers. */
export function useSelectionText(): string {
  const tl = useTranslations('picker');
  const fmt = useFormat();
  const { selection, pricing } = usePicker(
    useShallow((s) => ({ selection: s.selection, pricing: s.pricing })),
  );
  if (!selection.length) return '';
  return describeSelection(summarize(selection, pricing), fmt, tl);
}
