'use client';
import { useSyncExternalStore } from 'react';

/** Whether a media query matches (false on the server and before hydration). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

/** Layout breakpoints (PROMPT.md section 8). */
export const PHONE = '(max-width: 640px)';
export const DESKTOP = '(min-width: 901px)';
export const HOVER = '(hover: hover)';
