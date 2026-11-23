'use client';
/**
 * The ticket's sheet, from the user's ticket component: the body and the stub on one sheet, notched where
 * they meet, with a dashed perforation, a soft drop shadow (a filter on the parent, because the sheet is
 * clipped) and, where there is a fine pointer and motion is welcome, a 3D tilt with a light glare.
 * Vertical (the original): the stub is at the bottom, the notches on the sides. Horizontal: the stub is on
 * the right, the notches at the top and bottom.
 */
import { type CSSProperties, type ReactNode, useSyncExternalStore } from 'react';
import type { ReactParallaxTiltProps } from 'react-parallax-tilt';
import Tilt from 'react-parallax-tilt';

const hoverTiltMedia = '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

const corner = 'var(--ticket-corner-size)';
const notch = 'var(--ticket-notch-size)';
const stub = 'var(--ticket-stub-size)';

/** Stub at the bottom: notches on the left and right edges where it begins. */
const verticalClipPath = `polygon(
  0 ${corner},
  ${corner} 0,
  calc(100% - ${corner}) 0,
  100% ${corner},
  100% calc(100% - ${stub} - ${notch}),
  calc(100% - ${notch}) calc(100% - ${stub}),
  100% calc(100% - ${stub} + ${notch}),
  100% calc(100% - ${corner}),
  calc(100% - ${corner}) 100%,
  ${corner} 100%,
  0 calc(100% - ${corner}),
  0 calc(100% - ${stub} + ${notch}),
  ${notch} calc(100% - ${stub}),
  0 calc(100% - ${stub} - ${notch})
)`;

/** Stub on the right: notches on the top and bottom edges where it begins. */
const horizontalClipPath = `polygon(
  0 ${corner},
  ${corner} 0,
  calc(100% - ${stub} - ${notch}) 0,
  calc(100% - ${stub}) ${notch},
  calc(100% - ${stub} + ${notch}) 0,
  calc(100% - ${corner}) 0,
  100% ${corner},
  100% calc(100% - ${corner}),
  calc(100% - ${corner}) 100%,
  calc(100% - ${stub} + ${notch}) 100%,
  calc(100% - ${stub}) calc(100% - ${notch}),
  calc(100% - ${stub} - ${notch}) 100%,
  ${corner} 100%,
  0 calc(100% - ${corner})
)`;

const ticketBackground =
  'linear-gradient(145deg, rgb(255 255 255 / 10%), transparent 42%), var(--ticket-paper)';

const ticketShadow =
  'drop-shadow(0 1px 1px rgb(15 15 15 / 10%)) drop-shadow(0 18px 26px rgb(15 15 15 / 13%))';

type TicketCustomProperty =
  '--ticket-corner-size' | '--ticket-ink' | '--ticket-notch-size' | '--ticket-paper' | '--ticket-stub-size';

type TicketRootStyle = CSSProperties & Partial<Record<TicketCustomProperty, string>>;

export type TicketTiltProps = Omit<ReactParallaxTiltProps, 'children' | 'className' | 'style'>;

type CssLength = number | string;

export interface TicketShellProps {
  body: ReactNode;
  stub: ReactNode;
  /** Where the stub is: at the bottom (vertical) or on the right (horizontal). */
  orientation?: 'vertical' | 'horizontal';
  /** Laid over the whole sheet, inside its outline (a stamp that places itself). */
  overlay?: ReactNode;
  'aria-hidden'?: boolean;
  'aria-label'?: string;
  bodyClassName?: string;
  className?: string;
  cornerSize?: CssLength;
  id?: string;
  ink?: string;
  notchSize?: CssLength;
  paper?: string;
  stubClassName?: string;
  /** The stub's height (vertical) or width (horizontal). */
  stubSize?: CssLength;
  style?: CSSProperties;
  ticketClassName?: string;
  tilt?: boolean;
  tiltProps?: TicketTiltProps;
}

function subscribeToHoverTilt(listener: () => void) {
  const media = window.matchMedia(hoverTiltMedia);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

function getHoverTiltSnapshot() {
  return window.matchMedia(hoverTiltMedia).matches;
}

function getServerHoverTiltSnapshot() {
  return false;
}

function toCssLength(value: CssLength) {
  return typeof value === 'number' ? `${value}px` : value;
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export function TicketShell({
  'aria-hidden': ariaHidden,
  'aria-label': ariaLabel,
  body,
  bodyClassName,
  className,
  cornerSize = 0,
  id,
  ink = '#171714',
  notchSize = 13,
  orientation = 'vertical',
  overlay,
  paper = '#ff633f',
  stub: stubContent,
  stubClassName,
  stubSize = '24%',
  style,
  ticketClassName,
  tilt = true,
  tiltProps,
}: TicketShellProps) {
  const hoverTiltEnabled = useSyncExternalStore(
    subscribeToHoverTilt,
    getHoverTiltSnapshot,
    getServerHoverTiltSnapshot,
  );
  const {
    glareEnable = false,
    scale = 1.018,
    tiltEnable: tiltEnabledByProp = true,
    ...resolvedTiltProps
  } = tiltProps ?? {};
  const tiltEnabled = tilt && tiltEnabledByProp && hoverTiltEnabled;
  const glareEnabled = tiltEnabled && glareEnable;
  const vertical = orientation === 'vertical';
  const rootStyle: TicketRootStyle = {
    '--ticket-corner-size': toCssLength(cornerSize),
    '--ticket-ink': ink,
    '--ticket-notch-size': toCssLength(notchSize),
    '--ticket-paper': paper,
    '--ticket-stub-size': toCssLength(stubSize),
    filter: ticketShadow,
    ...style,
  };

  return (
    <div id={id} className={cx('relative', className)} style={rootStyle}>
      <Tilt
        glareEnable={glareEnabled}
        gyroscope={false}
        key={glareEnabled ? 'ticket-with-glare' : 'ticket-without-glare'}
        perspective={1100}
        tiltMaxAngleX={6}
        tiltMaxAngleY={6}
        transitionEasing="cubic-bezier(0.23, 1, 0.32, 1)"
        transitionSpeed={220}
        {...resolvedTiltProps}
        className="relative h-full w-full touch-pan-y [transform-style:preserve-3d]"
        scale={tiltEnabled ? scale : 1}
        style={{ clipPath: vertical ? verticalClipPath : horizontalClipPath }}
        tiltEnable={tiltEnabled}
      >
        <article
          aria-hidden={ariaHidden}
          aria-label={ariaHidden ? undefined : ariaLabel}
          className={cx(
            'relative grid h-full w-full overflow-hidden text-[var(--ticket-ink)] transition-[color,background-color] duration-[180ms] ease-[ease]',
            vertical
              ? 'grid-rows-[minmax(0,1fr)_var(--ticket-stub-size)]'
              : 'grid-cols-[minmax(0,1fr)_var(--ticket-stub-size)]',
            ticketClassName,
          )}
          style={{ background: ticketBackground }}
        >
          <div className={cx('relative min-h-0 min-w-0 overflow-hidden', bodyClassName)}>
            {body}
            <span
              aria-hidden="true"
              className={
                vertical
                  ? 'pointer-events-none absolute right-[calc(var(--ticket-notch-size)+6px)] bottom-px left-[calc(var(--ticket-notch-size)+6px)] z-[2] border-b border-dashed border-current opacity-30'
                  : 'pointer-events-none absolute top-[calc(var(--ticket-notch-size)+6px)] right-px bottom-[calc(var(--ticket-notch-size)+6px)] z-[2] border-r border-dashed border-current opacity-30'
              }
            />
          </div>
          <div className={cx('relative min-h-0 min-w-0 overflow-hidden', stubClassName)}>{stubContent}</div>
          {overlay}
        </article>
      </Tilt>
    </div>
  );
}
