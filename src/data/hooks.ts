'use client';
/** Loading store data in client components (after mount: the store lives in the browser only). */
import { useEffect, useState } from 'react';
import { getStore } from './index';
import type { DataStore } from './store';

export type Loadable<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown };

/**
 * Runs `load` against the store when `key` changes and, with `watchOrders`, again whenever orders, tickets
 * or the outbox change in any tab.
 */
export function useStoreQuery<T>(
  key: string,
  load: (store: DataStore) => Promise<T>,
  opts: { watchOrders?: boolean } = {},
): Loadable<T> {
  const [state, setState] = useState<{ key: string; value: Loadable<T> } | null>(null);
  const watch = !!opts.watchOrders;
  useEffect(() => {
    let alive = true;
    const store = getStore();
    const run = () =>
      load(store).then(
        (data) => alive && setState({ key, value: { status: 'ready', data } }),
        (error: unknown) => alive && setState({ key, value: { status: 'error', error } }),
      );
    void run();
    const off = watch ? store.onOrders(() => void run()) : () => {};
    return () => {
      alive = false;
      off();
    };
    // `key` describes what `load` reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, watch]);
  return state && state.key === key ? state.value : { status: 'loading' };
}
