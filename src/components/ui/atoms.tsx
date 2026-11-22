/** Small shared UI pieces: buttons, badges, meters. 44 px touch targets, visible focus rings. */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'dark' | 'quiet' | 'link' | 'outline';

const VARIANTS: Record<Variant, string> = {
  primary:
    'rounded-full bg-pick-strong px-[18px] font-bold text-white shadow-pick hover:brightness-95 disabled:opacity-60 disabled:shadow-none',
  dark: 'rounded-full bg-ink px-[18px] font-bold text-white hover:bg-ink-2 disabled:opacity-60',
  quiet: 'rounded-full bg-paper-2 px-4 font-semibold text-ink hover:bg-line disabled:opacity-60',
  outline:
    'rounded-full border-2 border-ink/15 bg-paper px-4 font-semibold text-ink hover:border-ink/30 disabled:opacity-60',
  link: 'px-0.5 font-semibold text-ink underline underline-offset-[3px] hover:text-pick-ink disabled:opacity-60',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export const buttonClass = (variant: Variant = 'primary', extra = '') =>
  `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap ${VARIANTS[variant]} ${extra}`;

export function Badge({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={`min-w-11 rounded-[7px] px-1.5 py-[5px] text-center font-display text-lg leading-none font-bold text-white ${
        muted ? 'bg-sold' : 'bg-ink'
      }`}
    >
      {children}
    </span>
  );
}

export function Meter({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <span
      className="mt-1.5 block h-[5px] overflow-hidden rounded-[3px] bg-[#e7e2d8]"
      role={label ? 'meter' : undefined}
      aria-label={label}
      aria-valuenow={label ? pct : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
    >
      <i className="block h-full bg-pick" style={{ width: `${pct}%` }} />
    </span>
  );
}

export function ChevronLeft({ className = 'size-[18px]' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function WheelchairIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="10.5" cy="4" r="1.8" fill="currentColor" stroke="none" />
      <path d="M10 7.5l.4 6h5.2l2.2 5" />
      <path d="M10.2 10.5h4.3" />
      <path d="M7.4 11.6a5.4 5.4 0 1 0 7.6 6.1" />
    </svg>
  );
}

export function EyeOffIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.8-1.3 2.1-2.7 3.4M6.3 7.6C4.4 8.9 3.1 10.7 2.5 12c1 1.8 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-1" />
    </svg>
  );
}
