/**
 * The browser's data store: one LocalStore per tab, created on first use (never during server rendering).
 * In development and in E2E runs it is also reachable as `window.__data`, so tests can set up state (hold
 * seats from a second tab, start the sales simulator).
 */
import { LocalStore } from './local-store';
import type { DataStore } from './store';

export type { DataStore } from './store';

declare global {
  interface Window {
    __data?: DataStore;
  }
}

let store: LocalStore | null = null;

export function getStore(): DataStore {
  if (!store) {
    store = new LocalStore();
    if (process.env.NEXT_PUBLIC_E2E === '1' || process.env.NODE_ENV === 'development') window.__data = store;
  }
  return store;
}

/** The sales simulator runs on event pages, except in E2E runs (tests start it when they need it). */
export function simulatorOn(): boolean {
  return process.env.NEXT_PUBLIC_E2E !== '1';
}
