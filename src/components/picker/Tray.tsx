'use client';
/**
 * The selection tray: the chosen seats with labels and prices, the total, and "Hold seats" (or, once held,
 * the countdown, "Check out" and "Release seats"). Shown while the ticket card isn't.
 */
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import { summarize } from '@/lib/picker/selection';
import { buttonClass } from '../ui/atoms';
import { useFormat } from '../useFormat';
import { CheckoutButton } from './CheckoutButton';
import { HoldCountdown } from './Header';
import { holdSelection, middleOf, releaseHold, usePicker } from './store';
import { describeSelection } from './describe';

export function SelectionTray() {
  const t = useTranslations('picker.tray');
  const fmt = useFormat();
  const tl = useTranslations('picker');
  const { selection, pricing, hold, holdBusy, engine } = usePicker(
    useShallow((s) => ({
      selection: s.selection,
      pricing: s.pricing,
      hold: s.hold,
      holdBusy: s.holdBusy,
      engine: s.engine,
    })),
  );
  if (!selection.length) return null;
  const sum = summarize(selection, pricing);
  const where = describeSelection(sum, fmt, tl);
  const viewSeat = () => {
    if (!engine) return;
    const bowl = selection.filter((i) => i < engine.layout.bowlSeatCount);
    if (bowl.length) void engine.goSeat(middleOf(bowl));
  };
  return (
    <div className="mx-2 mt-2 border-t border-line pt-2 desk:mx-4" aria-label={t('label')} role="region">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted">{t('yourSeats', { count: sum.count })}</p>
          <p className="truncate text-sm font-semibold">{where}</p>
        </div>
        <p className="font-display text-2xl leading-none font-bold whitespace-nowrap text-pick-ink">
          {fmt.money(hold?.totalMinor ?? sum.totalMinor)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {hold ? (
          <>
            <HoldCountdown compact />
            <CheckoutButton />
            <button type="button" onClick={() => void releaseHold(false)} className={buttonClass('link')}>
              {t('release')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={holdBusy}
              onClick={() => void holdSelection()}
              className={buttonClass('primary')}
            >
              {holdBusy ? t('holding') : t('hold', { count: sum.count })}
            </button>
            {sum.kind === 'bowl' ? (
              <button type="button" onClick={viewSeat} className={buttonClass('link')}>
                {t('view')}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
