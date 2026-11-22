'use client';
import { createElement, useLayoutEffect, useState, type HTMLAttributes } from 'react';
import { usePicker } from './store';

type Key = 'panelBox' | 'ticketBox';

/**
 * An element that reports its size to the store while mounted (UI-aware 3D framing). Mount it only while
 * the panel or ticket is shown; unmounting clears the size.
 */
export function MeasuredBox({
  as = 'div',
  sizeKey,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: 'div' | 'aside' | 'section'; sizeKey: Key }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      usePicker.setState({ [sizeKey]: { w: r.width, h: r.height } });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      usePicker.setState({ [sizeKey]: null });
    };
  }, [el, sizeKey]);
  return createElement(as, { ...rest, ref: setEl });
}
