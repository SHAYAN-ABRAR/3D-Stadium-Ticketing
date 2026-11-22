'use client';
/** Filters: a price range (two-thumb slider snapping to categories), accessible spaces, restricted view. */
import { useMemo, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Popover, Slider, Switch } from 'radix-ui';
import { useShallow } from 'zustand/react/shallow';
import { useFormat } from '../useFormat';
import { setFilters, usePicker } from './store';
import { EyeOffIcon, WheelchairIcon } from '../ui/atoms';

export function FiltersButton() {
  const t = useTranslations('picker.filters');
  const filters = usePicker((s) => s.filters);
  const active =
    (filters.priceMin != null ? 1 : 0) +
    (filters.priceMax != null ? 1 : 0) +
    (filters.accessible ? 1 : 0) +
    (filters.hideRestricted ? 1 : 0);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 flex-none items-center gap-2 rounded-full bg-paper-2 px-4 text-sm font-bold hover:bg-line"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          {t('button')}
          {active ? (
            <span className="grid size-5 place-items-center rounded-full bg-pick-strong text-xs text-white">
              {active}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="card z-50 w-[min(340px,calc(100vw-24px))] p-4"
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          <FiltersForm />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function FiltersForm() {
  const t = useTranslations('picker.filters');
  const fmt = useFormat();
  const { filters, pricing } = usePicker(useShallow((s) => ({ filters: s.filters, pricing: s.pricing })));
  const steps = useMemo(() => [...new Set(pricing?.ladderMinor ?? [])].sort((a, b) => a - b), [pricing]);
  const lo = filters.priceMin == null ? 0 : Math.max(0, steps.indexOf(filters.priceMin));
  const hi = filters.priceMax == null ? steps.length - 1 : Math.max(0, steps.indexOf(filters.priceMax));
  return (
    <div className="grid gap-4">
      <h2 className="font-display text-xl font-bold">{t('title')}</h2>
      {steps.length > 1 ? (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-muted" id="price-label">
              {t('price')}
            </span>
            <span className="text-sm font-bold">
              {fmt.money(steps[lo])} – {fmt.money(steps[hi])}
            </span>
          </div>
          <Slider.Root
            value={[lo, hi]}
            min={0}
            max={steps.length - 1}
            step={1}
            minStepsBetweenThumbs={0}
            onValueChange={([a, b]) =>
              setFilters({
                priceMin: a === 0 ? null : steps[a],
                priceMax: b === steps.length - 1 ? null : steps[b],
              })
            }
            className="relative mt-3 flex h-6 touch-none items-center select-none"
            aria-labelledby="price-label"
          >
            <Slider.Track className="relative h-1.5 grow rounded-full bg-line">
              <Slider.Range className="absolute h-full rounded-full bg-pick" />
            </Slider.Track>
            {[t('minPrice'), t('maxPrice')].map((label, i) => (
              <Slider.Thumb
                key={label}
                aria-label={label}
                aria-valuetext={fmt.money(steps[i === 0 ? lo : hi])}
                className="block size-6 rounded-full border-2 border-pick bg-white shadow-soft"
              />
            ))}
          </Slider.Root>
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>{fmt.money(steps[0])}</span>
            <span>{fmt.money(steps[steps.length - 1])}</span>
          </div>
        </div>
      ) : null}
      <Toggle
        id="f-accessible"
        checked={filters.accessible}
        onChange={(v) => setFilters({ accessible: v })}
        icon={<WheelchairIcon className="size-5 text-accessible" />}
        label={t('accessible')}
        hint={t('accessibleHint')}
      />
      <Toggle
        id="f-restricted"
        checked={filters.hideRestricted}
        onChange={(v) => setFilters({ hideRestricted: v })}
        icon={<EyeOffIcon className="size-5 text-muted" />}
        label={t('hideRestricted')}
        hint={t('restrictedHint')}
      />
      <button
        type="button"
        className="justify-self-start text-sm font-semibold underline underline-offset-2"
        onClick={() =>
          setFilters({ priceMin: null, priceMax: null, accessible: false, hideRestricted: false })
        }
      >
        {t('reset')}
      </button>
    </div>
  );
}

function Toggle({
  id,
  checked,
  onChange,
  icon,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon}
      <label htmlFor={id} className="flex-1 cursor-pointer">
        <span className="block text-[15px] font-semibold">{label}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </label>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="relative h-7 w-12 flex-none rounded-full bg-line data-[state=checked]:bg-pick-strong"
      >
        <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow-soft transition-transform data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
    </div>
  );
}
