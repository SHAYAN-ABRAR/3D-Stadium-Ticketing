'use client';
import { useSyncExternalStore } from 'react';

function subscribe(onTick: () => void) {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
}

/** The current time, ticking every second; null during server rendering and hydration. */
export function useClock(): number | null {
  const seconds = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000),
    () => null,
  );
  return seconds === null ? null : seconds * 1000;
}
